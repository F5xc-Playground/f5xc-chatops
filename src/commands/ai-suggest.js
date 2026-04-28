module.exports = {
  meta: {
    name: 'ai-suggest',
    description: 'Ask the AI Assistant for LB optimization suggestions',
    slashCommand: '/xc-suggest',
    category: 'ai-assistant',
  },

  intents: [
    { utterance: 'suggest improvements for the load balancer', intent: 'ai.suggest' },
    { utterance: 'how can I optimize my LB', intent: 'ai.suggest' },
    { utterance: 'give me recommendations', intent: 'ai.suggest' },
    { utterance: 'what should I improve', intent: 'ai.suggest' },
  ],

  entities: [],

  handler: async ({ say, aiAssistant, tenant, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('ai.suggest', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an LB name. Example: `/xc-suggest prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;

    await say(`🤖 Asking for suggestions on \`${name}\`...`);

    const query = `Suggest improvements and optimizations for HTTP load balancer "${name}" in namespace "${ns}"`;
    const result = await aiAssistant.query(ns, query);

    const blocks = [];
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `💡 Suggestions — ${name}` } });

    const summary = result.generic_response?.summary
      || result.explain_log?.summary
      || 'No suggestions available.';
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: summary } });

    if (result.follow_up_queries?.length) {
      blocks.push({
        type: 'actions',
        elements: result.follow_up_queries.slice(0, 5).map((q, i) => ({
          type: 'button',
          text: { type: 'plain_text', text: q.length > 75 ? q.slice(0, 72) + '...' : q },
          action_id: `suggest_followup_${i}`,
          value: JSON.stringify({ query: q, namespace: ns }),
        })),
      });
    }

    await say({ blocks });
  },
};
