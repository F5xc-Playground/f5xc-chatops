module.exports = {
  meta: {
    name: 'ai-query',
    description: 'Ask the XC AI Assistant a free-form question',
    slashCommand: '/xc-ask',
    category: 'ai-assistant',
  },

  intents: [
    { utterance: 'how do I configure rate limiting for my API', intent: 'ai.query' },
    { utterance: 'ask the assistant about DDoS protection', intent: 'ai.query' },
    { utterance: 'ask the AI a question', intent: 'ai.query' },
    { utterance: 'I have a question about XC', intent: 'ai.query' },
    { utterance: 'how do I set up a load balancer', intent: 'ai.query' },
    { utterance: 'explain how WAF rules work', intent: 'ai.query' },
    { utterance: 'how do I create an origin pool', intent: 'ai.query' },
    { utterance: 'ask the AI assistant about networking', intent: 'ai.query' },
    { utterance: 'what is the best practice for rate limiting', intent: 'ai.query' },
    { utterance: 'tell me about service mesh in XC', intent: 'ai.query' },
    { utterance: 'how do I configure mTLS', intent: 'ai.query' },
    { utterance: 'ask about multi-cloud networking', intent: 'ai.query' },
    { utterance: 'how does distributed cloud DNS work', intent: 'ai.query' },
    { utterance: 'what is an app firewall in XC', intent: 'ai.query' },
    { utterance: 'explain XC service policies', intent: 'ai.query' },
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
