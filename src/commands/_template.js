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
    category: 'core', // grouping in /xc-help
  },

  // Training utterances for NLP.js (5-10 per intent).
  // The intent name should be unique: 'domain.action' format.
  intents: [
    { utterance: 'example phrase one', intent: 'your.intent' },
    { utterance: 'example phrase two', intent: 'your.intent' },
  ],

  // Handler receives: { tenant, cache, say, client, args, formatter, aiAssistant }
  // - tenant.client: XCClient instance for API calls
  // - cache: Cache instance (use get/set with your cacheTTL)
  // - say: Slack say() function
  // - client: Slack WebClient (for files.uploadV2, etc.)
  // - args: { namespace, resourceName, resourceType, fresh, raw, _channelId }
  // - formatter: slack-formatter module
  handler: async ({ tenant, cache, say, args, formatter }) => {
    // Your implementation here
    await say('Not implemented yet');
  },
};
