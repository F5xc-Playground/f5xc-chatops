module.exports = {
  meta: {
    name: 'test-hello',
    description: 'A test command',
    slashCommand: '/xc-test',
  },
  intents: [
    { utterance: 'say hello', intent: 'test.hello' },
    { utterance: 'greet me', intent: 'test.hello' },
  ],
  entities: [],
  handler: async ({ say }) => {
    await say('Hello!');
  },
};
