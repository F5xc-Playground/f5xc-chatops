const path = require('path');
const { loadCommands } = require('../src/loader');

describe('loadCommands', () => {
  test('loads command files from a directory', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  test('skips files prefixed with _', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    const names = result.commands.map((c) => c.meta.name);
    expect(names).not.toContain('template');
  });

  test('validates required exports', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    for (const cmd of result.commands) {
      expect(cmd.meta).toBeDefined();
      expect(cmd.meta.name).toBeDefined();
      expect(cmd.intents).toBeDefined();
      expect(cmd.handler).toBeDefined();
    }
  });

  test('builds intent-to-handler map', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    expect(result.intentMap).toBeDefined();
    expect(typeof result.intentMap['test.hello']).toBe('object');
  });

  test('builds slash command map', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    expect(result.slashMap['/xc-test']).toBeDefined();
  });

  test('collects all intents for NLP training', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    expect(result.allIntents.length).toBeGreaterThan(0);
    expect(result.allIntents[0]).toHaveProperty('utterance');
    expect(result.allIntents[0]).toHaveProperty('intent');
  });
});
