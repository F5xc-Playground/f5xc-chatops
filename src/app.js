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
    port: parseInt(env.PORT, 10) || 3000,
  };
}

function log(level, message, data = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...data };
  console.log(JSON.stringify(entry));
}

function formatApiError(err, context) {
  if (err.status === 401) return 'Authentication failed. Check that the API token is valid and not expired.';
  if (err.status === 403) return `Permission denied. The bot's API token lacks access for this operation.`;
  if (err.status === 404) return `Resource not found. Check the namespace and resource name are correct.`;
  if (err.status >= 500) return `XC API returned a server error (${err.status}). Try again in a moment.`;
  return `Command failed: ${err.message}`;
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
    let namespaces = Object.keys(nsRoles).filter((ns) => ns !== '*');

    if (nsRoles['*']) {
      log('info', 'Wildcard namespace access — fetching full namespace list...');
      const nsData = await tenant.client.get('/api/web/namespaces');
      namespaces = (nsData.items || []).map((ns) => ns.name || ns.metadata?.name).filter(Boolean);
    }

    tenant.namespaces = namespaces;
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
  function makeHandlerContext(say, client) {
    return { tenant, cache, say, client, aiAssistant, diagramRenderer, formatter, config, commandRegistry: { commands } };
  }

  // Bolt.js app
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    socketMode: true,
  });

  // Register slash commands
  for (const [cmd, mod] of Object.entries(slashMap)) {
    app.command(cmd, async ({ command, ack, say, client }) => {
      await ack();
      const rawArgs = command.text || '';
      const fresh = /--fresh\b/.test(rawArgs);
      const cleanedArgs = rawArgs.replace(/--fresh\b/g, '').trim();
      const parts = cleanedArgs.split(/\s+/).filter(Boolean);
      const args = {
        namespace: parts[0] || null,
        resourceName: parts[1] || null,
        raw: cleanedArgs,
        fresh,
        _channelId: command.channel_id,
      };
      try {
        await mod.handler({ ...makeHandlerContext(say, client), args });
      } catch (err) {
        log('error', `Command ${cmd} failed`, { error: err.message });
        await say({ blocks: formatter.errorBlock(formatApiError(err, cmd)) });
      }
    });
  }

  // Handle @mentions and DMs via NLP
  app.event('app_mention', async ({ event, say, client }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    await handleNaturalLanguage(text, say, client, event.channel);
  });

  app.message(async ({ message, say, client }) => {
    if (message.channel_type !== 'im') return;
    await handleNaturalLanguage(message.text, say, client, message.channel);
  });

  async function handleNaturalLanguage(text, say, client, channelId) {
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
      _channelId: channelId,
    };

    try {
      await mod.handler({ ...makeHandlerContext(say, client), args });
    } catch (err) {
      log('error', `NL handler failed`, { intent: result.intent, error: err.message });
      await say({ blocks: formatter.errorBlock(formatApiError(err, result.intent)) });
    }
  }

  // Namespace picker button handler
  app.action(/^ns_pick_/, async ({ action, ack, say, client }) => {
    await ack();
    const { intent, namespace } = JSON.parse(action.value);
    const mod = intentMap[intent];
    if (!mod) return;
    const args = { namespace, fresh: false, raw: '' };
    try {
      await mod.handler({ ...makeHandlerContext(say, client), args });
    } catch (err) {
      await say({ blocks: formatter.errorBlock(formatApiError(err, intent)) });
    }
  });

  // Resource picker button handler
  app.action(/^res_pick_/, async ({ action, ack, say, client }) => {
    await ack();
    const { intent, namespace, resourceName } = JSON.parse(action.value);
    const mod = intentMap[intent];
    if (!mod) return;
    const args = { namespace, resourceName, fresh: false, raw: '', _channelId: action.channel?.id };
    try {
      await mod.handler({ ...makeHandlerContext(say, client), args });
    } catch (err) {
      await say({ blocks: formatter.errorBlock(formatApiError(err, intent)) });
    }
  });

  // AI follow-up button handlers
  app.action(/^(?:followup_|ai_followup_|suggest_followup_)\d+$/, async ({ action, ack, say }) => {
    await ack();
    const { query, namespace } = JSON.parse(action.value);
    try {
      await say(`🤖 Following up...`);
      const result = await aiAssistant.query(namespace, query);
      const blocks = [];
      const summary = result.generic_response?.summary
        || result.explain_log?.summary
        || result.list_response?.items?.map((i) => `• ${i.title || i}`).join('\n')
        || 'No additional details.';
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: summary } });
      if (result.follow_up_queries?.length) {
        blocks.push({
          type: 'actions',
          elements: result.follow_up_queries.slice(0, 5).map((q, i) => ({
            type: 'button',
            text: { type: 'plain_text', text: q.length > 75 ? q.slice(0, 72) + '...' : q },
            action_id: `ai_followup_${i}`,
            value: JSON.stringify({ query: q, namespace }),
          })),
        });
      }
      await say({ blocks });
    } catch (err) {
      log('error', 'AI follow-up failed', { error: err.message });
      await say({ blocks: formatter.errorBlock(`Follow-up failed: ${err.message}`) });
    }
  });

  // NLP suggestion button handler
  app.action(/^suggest_/, async ({ action, ack, say, client }) => {
    await ack();
    const intent = action.value;
    const mod = intentMap[intent];
    if (!mod) {
      await say({ blocks: formatter.errorBlock(`No handler found for "${intent}".`) });
      return;
    }
    const args = { namespace: null, fresh: false, raw: '' };
    try {
      await mod.handler({ ...makeHandlerContext(say, client), args });
    } catch (err) {
      await say({ blocks: formatter.errorBlock(formatApiError(err, intent)) });
    }
  });

  // AI feedback via reactions — thumbs up/down on AI responses
  app.event('reaction_added', async ({ event }) => {
    const emoji = event.reaction;
    if (emoji !== '+1' && emoji !== '-1' && emoji !== 'thumbsup' && emoji !== 'thumbsdown') return;
    const positive = emoji === '+1' || emoji === 'thumbsup';
    try {
      await aiAssistant.feedback('system', '', '', positive, positive ? '' : 'OTHER');
    } catch (err) {
      log('warn', 'AI feedback submission failed', { error: err.message });
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
  healthServer.listen(config.port);

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

module.exports = { validateEnv, buildConfig, formatApiError, start };
