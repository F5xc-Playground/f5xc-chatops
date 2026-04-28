module.exports = {
  meta: {
    name: 'alert-status',
    description: 'List configured alert policies',
    slashCommand: '/xc-alerts',
    cacheTTL: 300,
    category: 'observability',
  },

  intents: [
    { utterance: 'any active alerts', intent: 'alert.status' },
    { utterance: 'show alert policies', intent: 'alert.status' },
    { utterance: 'check alerts', intent: 'alert.status' },
    { utterance: 'list alert configurations', intent: 'alert.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('alert.status', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:alert_status`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await say({ blocks: cached.blocks });
        return;
      }
    }

    const startTime = Date.now();
    const [policyData, receiverData] = await Promise.all([
      tenant.client.get(`/api/config/namespaces/${ns}/alert_policys`).catch(() => ({ items: [] })),
      tenant.client.get(`/api/config/namespaces/${ns}/alert_receivers`).catch(() => ({ items: [] })),
    ]);

    const policies = policyData.items || [];
    const receivers = receiverData.items || [];

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🔔 Alerts — ${ns}` } },
    ];

    if (policies.length > 0) {
      const rows = policies.map((p) => ({
        name: p.name || p.metadata?.name || 'unknown',
      }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Alert Policies (${policies.length})*\n` + formatter.table(['name'], rows) } });
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No alert policies configured.' } });
    }

    if (receivers.length > 0) {
      blocks.push({ type: 'divider' });
      const rows = receivers.map((r) => ({
        name: r.name || r.metadata?.name || 'unknown',
      }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Alert Receivers (${receivers.length})*\n` + formatter.table(['name'], rows) } });
    }

    blocks.push(formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }));
    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
