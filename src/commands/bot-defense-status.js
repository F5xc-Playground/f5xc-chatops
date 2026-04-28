module.exports = {
  meta: {
    name: 'bot-defense-status',
    description: 'Bot defense configuration status per LB',
    slashCommand: '/xc-bot',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'is bot defense enabled', intent: 'bot.defense.status' },
    { utterance: 'check bot defense', intent: 'bot.defense.status' },
    { utterance: 'bot defense status', intent: 'bot.defense.status' },
    { utterance: 'show bot protection', intent: 'bot.defense.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('bot.defense.status', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an LB name. Example: `/xc-bot prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const startTime = Date.now();

    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    const enabled = !!spec.bot_defense;
    const status = enabled ? 'healthy' : 'unknown';

    const fields = [
      { label: 'LB', value: name },
      { label: 'Bot Defense', value: enabled ? 'Enabled' : 'Disabled' },
    ];

    if (enabled && spec.bot_defense.regional_endpoint) {
      fields.push({ label: 'Endpoint', value: spec.bot_defense.regional_endpoint });
    }

    const blocks = [
      ...formatter.detailView(`🤖 Bot Defense — ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
