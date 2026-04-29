module.exports = {
  meta: {
    name: 'ai-query',
    description: 'Ask the XC AI Assistant a free-form question',
    slashCommand: '/xc-ask',
    category: 'ai-assistant',
  },

  intents: [
    { utterance: 'ask the assistant', intent: 'ai.query' },
    { utterance: 'ask about', intent: 'ai.query' },
    { utterance: 'I have a question for the assistant', intent: 'ai.query' },
    { utterance: 'can you ask the AI', intent: 'ai.query' },
  ],

  entities: [],

  handler: async ({ say, aiAssistant, args, formatter, config }) => {
    const query = args.raw || '';
    if (!query.trim()) {
      await say({ blocks: formatter.errorBlock('Please provide a question. Example: `/xc-ask how do I configure rate limiting`') });
      return;
    }

    const ns = 'system';
    await say(`🤖 Asking the AI Assistant...`);

    let result;
    try {
      result = await aiAssistant.query(ns, query.trim());
    } catch (err) {
      if (err.status === 404) {
        await say({ blocks: formatter.errorBlock('AI Assistant is not available. The feature may not be enabled on this tenant.') });
      } else {
        await say({ blocks: formatter.errorBlock(`AI Assistant query failed: ${err.message}`) });
      }
      return;
    }

    const content = formatter.extractAIContent(result);
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: 'AI Assistant' } },
    ];

    if (content) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: content } });
    } else {
      console.log(JSON.stringify({ level: 'warn', message: 'AI response had no extractable content', response: result }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'The AI Assistant responded but returned no displayable content.' } });
    }

    await say({ blocks });
  },
};
