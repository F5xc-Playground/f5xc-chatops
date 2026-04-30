const help = require('../../src/commands/help');
const formatter = require('../../src/core/slack-formatter');

describe('help command — plugin contract', () => {
  test('exports meta with required fields', () => {
    expect(help.meta).toBeDefined();
    expect(help.meta.name).toBe('help');
    expect(help.meta.description).toBeTruthy();
    expect(help.meta.slashCommand).toBe('/xc-help');
    expect(help.meta.category).toBe('core');
  });

  test('exports intents array with utterances', () => {
    expect(Array.isArray(help.intents)).toBe(true);
    expect(help.intents.length).toBeGreaterThan(0);
    for (const intent of help.intents) {
      expect(intent.utterance).toBeTruthy();
      expect(intent.intent).toBeTruthy();
    }
  });

  test('exports handler function', () => {
    expect(typeof help.handler).toBe('function');
  });
});

describe('help handler — list all commands (no args)', () => {
  function makeContext({ raw = '' } = {}) {
    const say = jest.fn();
    const commandRegistry = {
      commands: [
        {
          meta: { name: 'help', description: 'Get help', slashCommand: '/xc-help', category: 'core' },
          intents: [{ utterance: 'show help', intent: 'help' }],
        },
        {
          meta: { name: 'whoami', description: 'Show identity', slashCommand: '/xc-whoami', category: 'core' },
          intents: [],
        },
        {
          meta: { name: 'status', description: 'Show status', category: 'monitoring' },
          intents: [],
        },
      ],
    };
    return { say, commandRegistry, formatter, args: { raw } };
  }

  test('calls say once', async () => {
    const ctx = makeContext();
    await help.handler(ctx);
    expect(ctx.say).toHaveBeenCalledTimes(1);
  });

  test('returns blocks array with a header block', async () => {
    const ctx = makeContext();
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    expect(Array.isArray(blocks)).toBe(true);
    const header = blocks.find((b) => b.type === 'header');
    expect(header).toBeDefined();
    expect(header.text.text).toContain('Available Commands');
  });

  test('includes section blocks for each category', async () => {
    const ctx = makeContext();
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    const sections = blocks.filter((b) => b.type === 'section');
    // Two categories: core and monitoring
    expect(sections.length).toBe(2);
    const text = sections.map((s) => s.text.text).join('\n');
    expect(text).toContain('CORE');
    expect(text).toContain('MONITORING');
  });

  test('lists command names and slash commands in output', async () => {
    const ctx = makeContext();
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    const text = blocks
      .filter((b) => b.type === 'section')
      .map((s) => s.text.text)
      .join('\n');
    expect(text).toContain('help');
    expect(text).toContain('/xc-help');
    expect(text).toContain('whoami');
    expect(text).toContain('status');
  });

  test('commands without slashCommand still render', async () => {
    const ctx = makeContext();
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    const text = blocks
      .filter((b) => b.type === 'section')
      .map((s) => s.text.text)
      .join('\n');
    expect(text).toContain('status');
  });
});

describe('help handler — show detail for a specific command', () => {
  function makeContext(raw) {
    const say = jest.fn();
    const commandRegistry = {
      commands: [
        {
          meta: { name: 'whoami', description: 'Show identity', slashCommand: '/xc-whoami', category: 'core' },
          intents: [
            { utterance: 'who are you', intent: 'whoami' },
            { utterance: 'what namespaces', intent: 'whoami' },
          ],
        },
      ],
    };
    return { say, commandRegistry, formatter, args: { raw } };
  }

  test('shows detail view when a known command name is passed', async () => {
    const ctx = makeContext('whoami');
    await help.handler(ctx);
    expect(ctx.say).toHaveBeenCalledTimes(1);
    const { blocks } = ctx.say.mock.calls[0][0];
    // detailView starts with a header block
    const header = blocks.find((b) => b.type === 'header');
    expect(header).toBeDefined();
    expect(header.text.text).toContain('whoami');
  });

  test('detail view includes description and slash command', async () => {
    const ctx = makeContext('whoami');
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    const text = JSON.stringify(blocks);
    expect(text).toContain('Show identity');
    expect(text).toContain('/xc-whoami');
  });

  test('detail view includes example phrases when intents exist', async () => {
    const ctx = makeContext('whoami');
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    const text = JSON.stringify(blocks);
    expect(text).toContain('who are you');
  });

  test('accepts slash command name without leading slash', async () => {
    const ctx = makeContext('xc-whoami');
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    const header = blocks.find((b) => b.type === 'header');
    expect(header.text.text).toContain('whoami');
  });

  test('accepts slash command name with leading slash', async () => {
    const ctx = makeContext('/xc-whoami');
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    const header = blocks.find((b) => b.type === 'header');
    expect(header.text.text).toContain('whoami');
  });

  test('returns error block for unknown command', async () => {
    const ctx = makeContext('nonexistent');
    await help.handler(ctx);
    const { blocks } = ctx.say.mock.calls[0][0];
    expect(blocks[0].type).toBe('section');
    expect(blocks[0].text.text).toContain('Unknown command');
    expect(blocks[0].text.text).toContain('nonexistent');
  });
});
