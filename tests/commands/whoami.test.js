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
  function makeTenant({ namespaceRoles = {} } = {}) {
    return {
      name: 'acme',
      cachedWhoami: {
        email: 'bot@acme.com',
        namespace_access: {
          namespace_role_map: namespaceRoles,
        },
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
    const fieldTexts = blocks
      .filter((b) => b.type === 'section' && b.fields)
      .flatMap((b) => b.fields.map((f) => f.text));
    expect(fieldTexts.some((t) => t.includes('acme'))).toBe(true);
    expect(fieldTexts.some((t) => t.includes('bot@acme.com'))).toBe(true);
  });

  test('includes namespace count in detail fields', async () => {
    const say = jest.fn();
    const tenant = makeTenant({
      namespaceRoles: {
        production: { roles: ['ves-io-admin'] },
        staging: { roles: ['ves-io-monitor'] },
      },
    });
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const fieldTexts = blocks
      .filter((b) => b.type === 'section' && b.fields)
      .flatMap((b) => b.fields.map((f) => f.text));
    expect(fieldTexts.some((t) => t.includes('2'))).toBe(true);
  });

  test('appends namespace/role table when namespaces exist', async () => {
    const say = jest.fn();
    const tenant = makeTenant({
      namespaceRoles: {
        production: { roles: ['ves-io-admin', 'ves-io-monitor'] },
        staging: { roles: ['ves-io-monitor'] },
      },
    });
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const tableSections = blocks.filter((b) => b.type === 'section' && b.text && b.text.text.includes('```'));
    expect(tableSections.length).toBeGreaterThan(0);
    const tableText = tableSections[0].text.text;
    expect(tableText).toContain('production');
    expect(tableText).toContain('staging');
    expect(tableText).toContain('ves-io-admin');
  });

  test('no table appended when namespace map is empty', async () => {
    const say = jest.fn();
    const tenant = makeTenant({ namespaceRoles: {} });
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const tableSections = blocks.filter((b) => b.type === 'section' && b.text && b.text.text.includes('```'));
    expect(tableSections.length).toBe(0);
  });

  test('handles missing email gracefully', async () => {
    const say = jest.fn();
    const tenant = {
      name: 'acme',
      cachedWhoami: {
        // no email field
        namespace_access: { namespace_role_map: {} },
      },
    };
    await whoami.handler({ say, tenant, formatter });
    const { blocks } = say.mock.calls[0][0];
    const fieldTexts = blocks
      .filter((b) => b.type === 'section' && b.fields)
      .flatMap((b) => b.fields.map((f) => f.text));
    expect(fieldTexts.some((t) => t.includes('N/A'))).toBe(true);
  });
});
