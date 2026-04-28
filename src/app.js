const { App } = require('@slack/bolt');
const http = require('http');
const path = require('path');
const { Cache } = require('./core/cache');
const { createTenantProfile } = require('./core/xc-client');
const { AIAssistant } = require('./core/ai-assistant');
const { NLPEngine } = require('./core/nlp-engine');
const { DiagramRenderer } = require('./core/diagram-renderer');
const formatter = require('./core/slack-formatter');
const { loadCommands } = require('./loader');

const REQUIRED_VARS = ['F5XC_API_URL', 'F5XC_API_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN'];

function validateEnv(env) {
  for (const key of REQUIRED_VARS) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

function buildConfig(env) {
  return {
    xcApiUrl: env.F5XC_API_URL,
    xcApiToken: env.F5XC_API_TOKEN,
    slackBotToken: env.SLACK_BOT_TOKEN,
    slackAppToken: env.SLACK_APP_TOKEN,
    logLevel: env.LOG_LEVEL || 'info',
    cacheWarmTTL: parseInt(env.CACHE_WARM_TTL, 10) || 300,
    cacheStaticTTL: parseInt(env.CACHE_STATIC_TTL, 10) || 3600,
    nlpThreshold: parseFloat(env.NLP_THRESHOLD) || 0.65,
  };
}

function log(level, message, data = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...data };
  console.log(JSON.stringify(entry));
}

async function start() {
  validateEnv(process.env);
  const config = buildConfig(process.env);

  const cache = new Cache();
  const tenant = createTenantProfile({
    apiUrl: config.xcApiUrl,
    apiToken: config.xcApiToken,
  });
  const aiAssistant = new AIAssistant(tenant.client);
  const diagramRenderer = new DiagramRenderer();

  // Startup: whoami
  log('info', 'Fetching whoami...');
  try {
    const whoami = await tenant.client.get('/api/web/custom/namespaces/system/whoami');
    tenant.cachedWhoami = whoami;
    cache.set(`${tenant.name}:whoami`, whoami, config.cacheStaticTTL);
    const nsRoles = whoami.namespace_access?.namespace_role_map || {};
    const namespaces = Object.keys(nsRoles);
    cache.set(`${tenant.name}:namespaces`, namespaces, config.cacheStaticTTL);
    log('info', 'whoami complete', {
      tenant: tenant.name,
      namespaces: namespaces.length,
      email: whoami.email,
    });
  } catch (err) {
    log('error', 'whoami failed — cannot start', { error: err.message });
    process.exit(1);
  }

  // Load commands
  const commandsDir = path.join(__dirname, 'commands');
  const { commands, intentMap, slashMap, allIntents, errors } = await loadCommands(commandsDir);
  if (errors.length > 0) {
    for (const e of errors) {
      log('warn', `Skipped command: ${e.file}`, { error: e.error });
    }
  }
  log('info', `Loaded ${commands.length} commands`);

  // Train NLP
  const nlp = new NLPEngine({ threshold: config.nlpThreshold });
  nlp.addIntents(allIntents);
  const namespaces = cache.get(`${tenant.name}:namespaces`) || [];
  nlp.addNamespaceEntities(namespaces);
  nlp.addResourceTypeEntities([
    { name: 'http_loadbalancer', synonyms: ['load balancer', 'LB', 'lbs', 'load balancers', 'http lb'] },
    { name: 'tcp_loadbalancer', synonyms: ['tcp load balancer', 'tcp lb'] },
    { name: 'udp_loadbalancer', synonyms: ['udp load balancer', 'udp lb'] },
    { name: 'origin_pool', synonyms: ['origin pool', 'pool', 'pools', 'origin pools'] },
    { name: 'app_firewall', synonyms: ['WAF', 'firewall', 'app firewall', 'web application firewall'] },
    { name: 'service_policy', synonyms: ['service policy', 'policy', 'policies'] },
    { name: 'certificate', synonyms: ['cert', 'certs', 'certificates', 'TLS cert'] },
    { name: 'healthcheck', synonyms: ['health check', 'health checks', 'healthchecks'] },
    { name: 'dns_zone', synonyms: ['DNS zone', 'dns zones', 'zone'] },
    { name: 'dns_load_balancer', synonyms: ['DNS load balancer', 'GSLB', 'dns lb'] },
    { name: 'rate_limiter', synonyms: ['rate limiter', 'rate limit', 'rate limiting'] },
    { name: 'alert_policy', synonyms: ['alert', 'alerts', 'alert policy'] },
  ]);
  await nlp.train();
  log('info', 'NLP trained', { intents: allIntents.length });

  // Build handler context
  function makeHandlerContext(say) {
    return { tenant, cache, say, aiAssistant, diagramRenderer, formatter, config, commandRegistry: { commands } };
  }

  // Bolt.js app
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    socketMode: true,
  });

  // Register slash commands
  for (const [cmd, mod] of Object.entries(slashMap)) {
    app.command(cmd, async ({ command, ack, say }) => {
      await ack();
      const rawArgs = command.text || '';
      const parts = rawArgs.split(/\s+/).filter(Boolean);
      const args = {
        namespace: parts[0] || null,
        resourceName: parts[1] || null,
        raw: rawArgs,
        fresh: false,
      };
      try {
        await mod.handler({ ...makeHandlerContext(say), args });
      } catch (err) {
        log('error', `Command ${cmd} failed`, { error: err.message });
        await say({ blocks: formatter.errorBlock(`Command failed: ${err.message}`) });
      }
    });
  }

  // Handle @mentions and DMs via NLP
  app.event('app_mention', async ({ event, say }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    await handleNaturalLanguage(text, say);
  });

  app.message(async ({ message, say }) => {
    if (message.channel_type !== 'im') return;
    await handleNaturalLanguage(message.text, say);
  });

  async function handleNaturalLanguage(text, say) {
    const result = await nlp.process(text);

    if (!result.intent) {
      const suggestions = result.topIntents.slice(0, 3);
      if (suggestions.length > 0) {
        const blocks = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: "I'm not sure what you mean. Did you mean one of these?" },
          },
          {
            type: 'actions',
            elements: suggestions.map((s) => ({
              type: 'button',
              text: { type: 'plain_text', text: s.intent.replace('.', ': ') },
              action_id: `suggest_${s.intent}`,
              value: s.intent,
            })),
          },
        ];
        await say({ blocks });
      } else {
        await say({ blocks: formatter.errorBlock("I didn't understand that. Try `/xc-help` to see what I can do.") });
      }
      return;
    }

    const mod = intentMap[result.intent];
    if (!mod) {
      await say({ blocks: formatter.errorBlock(`Matched intent "${result.intent}" but no handler found.`) });
      return;
    }

    const args = {
      namespace: result.entities.namespace || null,
      resourceName: result.entities.resourceName || null,
      resourceType: result.entities.resourceType || null,
      fresh: result.fresh,
      raw: text,
    };

    try {
      await mod.handler({ ...makeHandlerContext(say), args });
    } catch (err) {
      log('error', `NL handler failed`, { intent: result.intent, error: err.message });
      await say({ blocks: formatter.errorBlock(`Something went wrong: ${err.message}`) });
    }
  }

  // Namespace picker button handler
  app.action(/^ns_pick_/, async ({ action, ack, say }) => {
    await ack();
    const { intent, namespace } = JSON.parse(action.value);
    const mod = intentMap[intent];
    if (!mod) return;
    const args = { namespace, fresh: false, raw: '' };
    try {
      await mod.handler({ ...makeHandlerContext(say), args });
    } catch (err) {
      await say({ blocks: formatter.errorBlock(`Command failed: ${err.message}`) });
    }
  });

  // Health endpoint
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      const health = {
        status: 'ok',
        uptime: process.uptime(),
        tenant: tenant.name,
        commands: commands.length,
        cache: cache.stats(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  healthServer.listen(3000);

  await app.start();
  log('info', 'Bot started', {
    tenant: tenant.name,
    commands: commands.length,
    namespaces: namespaces.length,
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { validateEnv, buildConfig, start };
