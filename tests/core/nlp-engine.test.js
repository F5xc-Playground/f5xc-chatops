const { NLPEngine } = require('../../src/core/nlp-engine');

describe('NLPEngine', () => {
  let engine;

  beforeAll(async () => {
    engine = new NLPEngine({ threshold: 0.75 });

    engine.addIntents([
      { utterance: 'what quotas are running high', intent: 'quota.check' },
      { utterance: 'show me quota usage', intent: 'quota.check' },
      { utterance: 'are we near any limits', intent: 'quota.check' },
      { utterance: 'check quota utilization', intent: 'quota.check' },
      { utterance: 'list all load balancers', intent: 'list.resources' },
      { utterance: 'show me the load balancers', intent: 'list.resources' },
      { utterance: 'what LBs are configured', intent: 'list.resources' },
      { utterance: 'what can you do', intent: 'help' },
      { utterance: 'show me the help', intent: 'help' },
      { utterance: 'help me', intent: 'help' },
    ]);

    engine.addResourceTypeEntities([
      { name: 'load balancer', synonyms: ['LB', 'lbs', 'load balancers'] },
      { name: 'origin pool', synonyms: ['pool', 'pools', 'origin pools'] },
    ]);

    engine.addNamespaceEntities(['prod', 'staging', 'system']);

    await engine.train();
  });

  test('classifies a quota intent', async () => {
    const result = await engine.process('how are our quotas looking');
    expect(result.intent).toBe('quota.check');
    expect(result.confidence).toBeGreaterThan(0.75);
  });

  test('classifies a help intent', async () => {
    const result = await engine.process('what can you do for me');
    expect(result.intent).toBe('help');
    expect(result.confidence).toBeGreaterThan(0.75);
  });

  test('returns low confidence for gibberish', async () => {
    const result = await engine.process('asdfghjkl zxcvbnm');
    expect(result.confidence).toBeLessThan(0.75);
  });

  test('extracts namespace entity', async () => {
    const result = await engine.process('show quotas in prod');
    expect(result.entities.namespace).toBe('prod');
  });

  test('detects fresh modifier', async () => {
    const result = await engine.process('show quotas force refresh');
    expect(result.fresh).toBe(true);
  });

  test('getTopIntents returns ranked list', async () => {
    const result = await engine.process('asdfghjkl');
    expect(result.topIntents).toBeDefined();
    expect(Array.isArray(result.topIntents)).toBe(true);
  });
});

describe('NLPEngine — hyphenated namespaces', () => {
  let engine;

  beforeAll(async () => {
    engine = new NLPEngine({ threshold: 0.75 });
    engine.addIntents([
      { utterance: 'what is in namespace prod', intent: 'namespace.summary' },
      { utterance: 'what is in the prod namespace', intent: 'namespace.summary' },
      { utterance: "what's in namespace prod", intent: 'namespace.summary' },
      { utterance: "what's in the staging namespace", intent: 'namespace.summary' },
      { utterance: 'summarize namespace staging', intent: 'namespace.summary' },
      { utterance: 'namespace overview for prod', intent: 'namespace.summary' },
      { utterance: 'list all load balancers', intent: 'list.resources' },
      { utterance: 'show WAF status', intent: 'waf.status' },
      { utterance: 'what mode is the WAF in', intent: 'waf.status' },
      { utterance: 'is the WAF in blocking mode', intent: 'waf.status' },
      { utterance: 'check bot defense', intent: 'bot.defense.status' },
      { utterance: 'is bot defense enabled', intent: 'bot.defense.status' },
      { utterance: 'bot defense status', intent: 'bot.defense.status' },
      { utterance: 'show service policies', intent: 'service.policies' },
      { utterance: 'what policies are attached', intent: 'service.policies' },
    ]);
    engine.addNamespaceEntities(['prod', 'demo-shop', 'staging']);
    engine.addResourceTypeEntities([
      { name: 'http_loadbalancer', synonyms: ['load balancer', 'LB', 'lbs', 'load balancers'] },
      { name: 'app_firewall', synonyms: ['WAF', 'firewall', 'app firewall', 'web application firewall'] },
    ]);
    await engine.train();
  });

  test('classifies intent with hyphenated namespace (BUG-V3)', async () => {
    const result = await engine.process("what's in the demo-shop namespace");
    expect(result.intent).toBe('namespace.summary');
    expect(result.entities.namespace).toBe('demo-shop');
  });

  test('classifies "what is in the demo-shop namespace" (BUG-V3)', async () => {
    const result = await engine.process('what is in the demo-shop namespace');
    expect(result.intent).toBe('namespace.summary');
    expect(result.entities.namespace).toBe('demo-shop');
  });

  test('extracts hyphenated namespace entity', async () => {
    const result = await engine.process('list all load balancers in demo-shop');
    expect(result.entities.namespace).toBe('demo-shop');
  });

  test('extracts resource name from phrase with namespace', async () => {
    const result = await engine.process('tell me about the load balancer demo-shop-fe in demo-shop');
    expect(result.entities.namespace).toBe('demo-shop');
    expect(result.entities.resourceName).toBe('demo-shop-fe');
  });

  test('extracts LB name for WAF query (BUG-V1)', async () => {
    const result = await engine.process('is the WAF in blocking mode for demo-shop-fe in demo-shop');
    expect(result.entities.namespace).toBe('demo-shop');
    expect(result.entities.resourceName).toBe('demo-shop-fe');
  });

  test('extracts LB name for bot defense query (BUG-V1)', async () => {
    const result = await engine.process('is bot defense enabled on demo-shop-fe in demo-shop');
    expect(result.entities.namespace).toBe('demo-shop');
    expect(result.entities.resourceName).toBe('demo-shop-fe');
  });

  test('extracts LB name for service policies query (BUG-V1)', async () => {
    const result = await engine.process('what policies are attached to demo-shop-fe in demo-shop');
    expect(result.entities.namespace).toBe('demo-shop');
    expect(result.entities.resourceName).toBe('demo-shop-fe');
  });
});
