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

  handler: async ({ say, aiAssistant, args, formatter }) => {
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
    const blocks = [];
    const clean = (s) => formatter.htmlToMrkdwn(s);

    if (result.explain_log) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: clean(result.explain_log.summary) || 'No summary.' } });
    } else if (result.gen_dashboard_filter) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: clean(result.gen_dashboard_filter.event_summary) || 'Dashboard filter generated.' } });
    } else if (result.list_response) {
      const items = result.list_response.items || [];
      const text = items.map((i) => `• ${clean(i.title || i)}`).join('\n');
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: text || 'No items.' } });
    } else if (result.widget_response) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: clean(result.widget_response.summary) || 'Widget data returned.' } });
    } else if (result.site_analysis_response) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Site analysis data returned.' } });
    } else if (result.generic_response) {
      if (result.generic_response.is_error) {
        blocks.push(...formatter.errorBlock(clean(result.generic_response.summary) || 'AI Assistant returned an error.'));
      } else {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: clean(result.generic_response.summary) || 'No response.' } });
      }
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Received a response but could not parse it.' } });
    }

    if (result.follow_up_queries?.length) {
      blocks.push({
        type: 'actions',
        elements: result.follow_up_queries.slice(0, 5).map((q, i) => ({
          type: 'button',
          text: { type: 'plain_text', text: q.length > 75 ? q.slice(0, 72) + '...' : q },
          action_id: `ai_followup_${i}`,
          value: JSON.stringify({ query: q, namespace: ns }),
        })),
      });
    }

    await say({ blocks });
  },
};
