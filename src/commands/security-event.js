module.exports = {
  meta: {
    name: 'security-event',
    description: 'Explain a security event by support ID via AI Assistant',
    slashCommand: '/xc-event',
    category: 'security',
  },

  intents: [
    { utterance: 'explain security event abc-123', intent: 'security.event' },
    { utterance: 'look up request id abc-123', intent: 'security.event' },
    { utterance: 'what happened with support id xyz', intent: 'security.event' },
    { utterance: 'investigate security event', intent: 'security.event' },
    { utterance: 'explain this security log', intent: 'security.event' },
    { utterance: 'analyze event abc-123', intent: 'security.event' },
    { utterance: 'what triggered this security event', intent: 'security.event' },
    { utterance: 'look up this support ticket id', intent: 'security.event' },
    { utterance: 'explain why this request was blocked', intent: 'security.event' },
    { utterance: 'security event details for abc-123', intent: 'security.event' },
    { utterance: 'details for security event abc-123', intent: 'security.event' },
    { utterance: 'what caused this WAF block', intent: 'security.event' },
    { utterance: 'investigate this blocked request', intent: 'security.event' },
    { utterance: 'look up security event by id', intent: 'security.event' },
    { utterance: 'explain support id abc-123', intent: 'security.event' },
    { utterance: 'tell me about request abc-123', intent: 'security.event' },
    { utterance: 'tell me about this request id', intent: 'security.event' },
    { utterance: 'what happened to request abc-123', intent: 'security.event' },
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
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `Security Event: ${supportId.trim()}` } });

    const content = formatter.extractAIContent(result);
    if (content) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: content } });
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No details available for this event.' } });
    }

    await say({ blocks });
  },
};
