// Command Plugin Template
//
// Copy this file, rename it, and implement your command.
// The bot auto-discovers all .js files in this directory (except files starting with _).
//
// Usage: save as src/commands/your-command.js, restart the bot.

module.exports = {
  meta: {
    name: 'your-command-name',
    description: 'One-line description shown in /xc-help',
    slashCommand: '/xc-yourcommand', // optional — remove if NL-only
    cacheTTL: 300, // optional — seconds. 0 or omit = no caching
  },

  // Training utterances for NLP.js (5-10 per intent).
  // The intent name should be unique: 'domain.action' format.
  intents: [
    { utterance: 'example phrase one', intent: 'your.intent' },
    { utterance: 'example phrase two', intent: 'your.intent' },
  ],

  // Entity types this command uses. Namespace is handled globally.
  entities: [],

  // Handler receives: { tenant, cache, say, args, formatter }
  // - tenant.client: XCClient instance for API calls
  // - cache: Cache instance
  // - say: Slack say() function
  // - args: { namespace, resourceName, resourceType, fresh, raw }
  // - formatter: slack-formatter module
  handler: async ({ tenant, cache, say, args, formatter }) => {
    // Your implementation here
    await say('Not implemented yet');
  },
};
