const { NLPEngine } = require('../../src/core/nlp-engine');
const { loadCommands } = require('../../src/loader');
const path = require('path');

describe('NLP intent coverage', () => {
  let engine;
  let commands;

  beforeAll(async () => {
    const commandsDir = path.join(__dirname, '../../src/commands');
    const loaded = await loadCommands(commandsDir);
    commands = loaded.commands;

    engine = new NLPEngine({ threshold: 0.75 });
    engine.addIntents(loaded.allIntents);
    engine.addNamespaceEntities(['prod', 'staging', 'demo-shop', 'system']);
    engine.addResourceTypeEntities([
      { name: 'http_loadbalancer', synonyms: ['load balancer', 'LB', 'lbs', 'load balancers', 'http lb'] },
      { name: 'app_firewall', synonyms: ['WAF', 'firewall', 'app firewall'] },
      { name: 'origin_pool', synonyms: ['origin pool', 'pool', 'pools'] },
      { name: 'service_policy', synonyms: ['service policy', 'policy'] },
      { name: 'certificate', synonyms: ['cert', 'certs', 'certificates'] },
      { name: 'dns_zone', synonyms: ['DNS zone', 'dns zones'] },
    ]);
    await engine.train();
  });

  test('utterance counts are balanced (15-20 per command)', () => {
    for (const cmd of commands) {
      const count = cmd.intents.length;
      expect(count).toBeGreaterThanOrEqual(15);
      expect(count).toBeLessThanOrEqual(25);
    }
  });

  test('each command first utterance classifies to its own intent', async () => {
    const failures = [];
    for (const cmd of commands) {
      if (cmd.intents.length === 0) continue;
      const utterance = cmd.intents[0].utterance;
      const expectedIntent = cmd.intents[0].intent;
      const result = await engine.process(utterance);
      if (result.intent !== expectedIntent) {
        failures.push({
          command: cmd.meta.name,
          utterance,
          expected: expectedIntent,
          got: result.intent,
          confidence: result.confidence,
        });
      }
    }
    if (failures.length > 0) {
      console.table(failures);
    }
    expect(failures).toEqual([]);
  });

  const SMOKE_PHRASES = [
    { phrase: 'show me all sites', expected: 'site.status' },
    { phrase: 'show CE sites', expected: 'site.status' },
    { phrase: 'details on site dallas-ce', expected: 'site.detail' },
    { phrase: 'describe site my-site', expected: 'site.detail' },
    { phrase: 'what is in the prod namespace', expected: 'namespace.summary' },
    { phrase: 'summarize namespace staging', expected: 'namespace.summary' },
    { phrase: 'tell me about the load balancer', expected: 'lb.summary' },
    { phrase: 'LB summary', expected: 'lb.summary' },
    { phrase: 'is the WAF in blocking mode', expected: 'waf.status' },
    { phrase: 'check the web application firewall', expected: 'waf.status' },
    { phrase: 'is bot defense enabled', expected: 'bot.defense.status' },
    { phrase: 'check bot defense', expected: 'bot.defense.status' },
    { phrase: 'what service policies are on the LB', expected: 'service.policies' },
    { phrase: 'show me critical quotas', expected: 'quota.check' },
    { phrase: 'what quotas are running hot', expected: 'quota.check' },
    { phrase: 'diagram the load balancer chain', expected: 'diagram.lb' },
    { phrase: 'what can you do', expected: 'help' },
    { phrase: 'how do I use this', expected: 'help' },
    { phrase: 'any alerts firing', expected: 'alert.status' },
    { phrase: 'are there active alerts', expected: 'alert.status' },
    { phrase: 'list all load balancers', expected: 'list.resources' },
    { phrase: 'show me all LBs', expected: 'list.resources' },
    { phrase: 'DNS overview', expected: 'dns.status' },
    { phrase: 'any certs expiring soon', expected: 'cert.status' },
    { phrase: 'show origin pool health', expected: 'origin.health' },
    { phrase: 'what namespaces can you see', expected: 'whoami' },
  ];

  test.each(SMOKE_PHRASES)('$phrase → $expected', async ({ phrase, expected }) => {
    const result = await engine.process(phrase);
    expect(result.intent).toBe(expected);
  });
});
