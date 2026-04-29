module.exports = {
  meta: {
    name: 'security-event',
    description: 'Explain a security event by support ID via AI Assistant',
    slashCommand: '/xc-event',
    category: 'security',
  },

  intents: [
    { utterance: 'explain security event', intent: 'security.event' },
    { utterance: 'what happened with security event', intent: 'security.event' },
    { utterance: 'investigate security event', intent: 'security.event' },
    { utterance: 'look up this security event', intent: 'security.event' },
    { utterance: 'tell me about this event', intent: 'security.event' },
    { utterance: 'tell me about request id', intent: 'security.event' },
    { utterance: 'look up request id', intent: 'security.event' },
    { utterance: 'what is this request id', intent: 'security.event' },
    { utterance: 'explain this security id', intent: 'security.event' },
    { utterance: 'look up security event id', intent: 'security.event' },
    { utterance: 'tell me about this security id', intent: 'security.event' },
    { utterance: 'investigate request', intent: 'security.event' },
  ],

  entities: [],

  handler: async ({ say, aiAssistant, args, formatter }) => {
    let supportId = args.resourceName || '';
    if (!supportId && args.raw) {
      const raw = args.raw;
      const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) {
        supportId = uuidMatch[0];
      } else {
        const idMatch = raw.match(/\b([0-9a-f][\w-]{6,})\b/i);
        supportId = idMatch ? idMatch[1] : raw.trim();
      }
    }
    if (!supportId.trim()) {
      await say({ blocks: formatter.errorBlock('Please provide a support ID. Example: `/xc-event abc-123`') });
      return;
    }

    const ns = args.namespace || 'system';

    await say(`🔍 Looking up security event \`${supportId.trim()}\`...`);

    let result;
    try {
      result = await aiAssistant.query(ns, `Explain security event ${supportId.trim()}`);
    } catch (err) {
      if (err.status === 404) {
        await say({ blocks: formatter.errorBlock('AI Assistant is not available. The feature may not be enabled on this tenant, or the API path may have changed.') });
        return;
      }
      throw err;
    }

    const blocks = [];
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `🔒 Security Event: ${supportId.trim()}` } });

    const content = formatter.extractAIContent(result);
    if (content) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: content } });
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No details available for this event.' } });
    }

    await say({ blocks });
  },
};
