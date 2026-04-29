const whoami = require('../../src/commands/whoami');
const formatter = require('../../src/core/slack-formatter');

describe('whoami command — plugin contract', () => {
  test('exports meta with required fields', () => {
    expect(whoami.meta).toBeDefined();
    expect(whoami.meta.name).toBe('whoami');
    expect(whoami.meta.description).toBeTruthy();
    expect(whoami.meta.slashCommand).toBe('/xc-whoami');
    expect(whoami.meta.category).toBe('core');
  });

  test('exports intents array with utterances', () => {
    expect(Array.isArray(whoami.intents)).toBe(true);
    expect(whoami.intents.length).toBeGreaterThan(0);
    for (const intent of whoami.intents) {
      expect(intent.utterance).toBeTruthy();
      expect(intent.intent).toBeTruthy();
    }
  });

  test('exports handler function', () => {
    expect(typeof whoami.handler).toBe('function');
  });
});

describe('whoami handler — no cachedWhoami', () => {
  test('returns an error block when cachedWhoami is missing', async () => {
    const say = jest.fn();
    const tenant = { name: 'acme', cachedWhoami: null };
    await whoami.handler({ say, tenant, formatter });
    expect(say).toHaveBeenCalledTimes(1);
    const { blocks } = say.mock.calls[0][0];
    expect(blocks[0].type).toBe('section');
    expect(blocks[0].text.text).toContain('No whoami data');
  });
});

describe('whoami handler — with cachedWhoami', () => {
  function makeTenant({ namespaces = [] } = {}) {
    return {
      name: 'acme',
      namespaces,
      cachedWhoami: {
        email: 'bot@acme.com',
      },
    };
  }

  test('calls say once', async () => {
    const say = jest.fn();
    const tenant = makeTenant();
    await whoami.handler({ say, tenant, formatter });
    expect(say).toHaveBeenCalledTimes(1);
  });

  test('returns blocks containing tenant name and email', async () => {
    const say = jest.fn();
    const tenant = makeTenant();
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const text = JSON.stringify(blocks);
    expect(text).toContain('acme');
    expect(text).toContain('bot@acme.com');
  });

  test('includes namespace count in detail fields', async () => {
    const say = jest.fn();
    const tenant = makeTenant({ namespaces: ['production', 'staging'] });
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const text = JSON.stringify(blocks);
    expect(text).toContain('*Namespaces:* 2');
  });

  test('appends namespace table when namespaces exist', async () => {
    const say = jest.fn();
    const tenant = makeTenant({ namespaces: ['production', 'staging'] });
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const tableSections = blocks.filter((b) => b.type === 'section' && b.text && b.text.text.includes('```'));
    expect(tableSections.length).toBeGreaterThan(0);
    const tableText = tableSections[0].text.text;
    expect(tableText).toContain('production');
    expect(tableText).toContain('staging');
  });

  test('no table appended when namespace list is empty', async () => {
    const say = jest.fn();
    const tenant = makeTenant({ namespaces: [] });
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const tableSections = blocks.filter((b) => b.type === 'section' && b.text && b.text.text.includes('```'));
    expect(tableSections.length).toBe(0);
  });

  test('handles missing email gracefully', async () => {
    const say = jest.fn();
    const tenant = {
      name: 'acme',
      namespaces: [],
      cachedWhoami: {},
    };
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const text = JSON.stringify(blocks);
    expect(text).toContain('N/A');
  });
});
