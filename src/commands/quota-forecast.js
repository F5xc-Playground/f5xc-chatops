module.exports = {
  meta: {
    name: 'quota-forecast',
    description: 'Flag resources approaching quota limits (above 80%)',
    slashCommand: '/xc-quota-forecast',
    cacheTTL: 300,
    category: 'quotas',
  },

  intents: [
    { utterance: 'will we hit any limits soon', intent: 'quota.forecast' },
    { utterance: 'are we approaching any quota limits', intent: 'quota.forecast' },
    { utterance: 'which quotas are almost full', intent: 'quota.forecast' },
    { utterance: 'quota forecast', intent: 'quota.forecast' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('quota.forecast', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:quotas`;
    let items = cache.get(cacheKey);

    if (!items || args.fresh) {
      const data = await tenant.client.get(`/api/web/namespaces/${ns}/quotas`);
      items = data.items || [];
      cache.set(cacheKey, items, 300);
    }

    const atRisk = items
      .filter((q) => q.max_allowed > 0 && (q.current_count / q.max_allowed) >= 0.8)
      .sort((a, b) => (b.current_count / b.max_allowed) - (a.current_count / a.max_allowed));

    if (atRisk.length === 0) {
      await say({
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `🟢 No resources above 80% utilization in namespace \`${ns}\`.` } },
        ],
      });
      return;
    }

    const lines = atRisk.map((q) => {
      const pct = Math.round((q.current_count / q.max_allowed) * 100);
      const indicator = pct >= 100 ? '🔴' : '⚠️';
      return `${indicator} *${q.kind || q.resource_type}* — ${q.current_count}/${q.max_allowed} (${pct}%)`;
    });

    await say({
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `⚠️ Approaching Limits — ${ns}` } },
        { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      ],
    });
  },
};
