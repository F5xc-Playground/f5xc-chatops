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
