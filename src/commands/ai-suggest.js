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
      
      await say({ blocks: formatter.namespacePicker('ai.suggest', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('ai.suggest', args.namespace, names, `Get suggestions for which LB in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;

    await say(`🤖 Asking for suggestions on \`${name}\`...`);

    const query = `Suggest improvements and optimizations for HTTP load balancer "${name}" in namespace "${ns}"`;
    let result;
    try {
      result = await aiAssistant.query(ns, query);
    } catch (err) {
      if (err.status === 404) {
        await say({ blocks: formatter.errorBlock('AI Assistant is not available. The feature may not be enabled on this tenant, or the API path may have changed.') });
        return;
      }
      throw err;
    }

    const blocks = [];
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `💡 Suggestions — ${name}` } });

    const rawSummary = result.generic_response?.summary
      || result.explain_log?.summary
      || '';
    const summary = formatter.htmlToMrkdwn(rawSummary) || `No suggestions returned.\n_Asked:_ "${query}"`;
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
