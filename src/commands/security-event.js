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
  ],

  entities: [],

  handler: async ({ say, aiAssistant, args, formatter }) => {
    const supportId = args.resourceName || args.raw || '';
    if (!supportId.trim()) {
      await say({ blocks: formatter.errorBlock('Please provide a support ID. Example: `/xc-event abc-123`') });
      return;
    }

    const ns = args.namespace || 'system';

    await say(`🔍 Looking up security event \`${supportId.trim()}\`...`);

    const result = await aiAssistant.query(ns, `Explain security event ${supportId.trim()}`);

    const blocks = [];
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `🔒 Security Event: ${supportId.trim()}` } });

    if (result.explain_log) {
      const log = result.explain_log;
      if (log.summary) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: log.summary } });
      }
      if (log.actions?.length) {
        blocks.push({ type: 'divider' });
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: '*Recommended Actions:*\n' + log.actions.map((a) => `• ${a}`).join('\n') },
        });
      }
    } else if (result.generic_response) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: result.generic_response.summary || 'No details available.' },
      });
    }

    if (result.follow_up_queries?.length) {
      blocks.push({
        type: 'actions',
        elements: result.follow_up_queries.slice(0, 5).map((q, i) => ({
          type: 'button',
          text: { type: 'plain_text', text: q.length > 75 ? q.slice(0, 72) + '...' : q },
          action_id: `followup_${i}`,
          value: JSON.stringify({ query: q, namespace: ns }),
        })),
      });
    }

    await say({ blocks });
  },
};
