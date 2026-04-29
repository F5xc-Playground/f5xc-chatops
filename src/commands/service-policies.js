module.exports = {
  meta: {
    name: 'service-policies',
    description: 'List service policies attached to a load balancer',
    slashCommand: '/xc-policies',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'what service policies are on the LB', intent: 'service.policies' },
    { utterance: 'show service policies', intent: 'service.policies' },
    { utterance: 'list attached policies', intent: 'service.policies' },
    { utterance: 'what policies are applied', intent: 'service.policies' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('service.policies', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an LB name. Example: `/xc-policies prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:policies:${name}`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await say({ blocks: cached.blocks });
        return;
      }
    }

    const startTime = Date.now();
    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    if (spec.service_policies_from_namespace) {
      const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: `🛡️ LB \`${name}\` uses *namespace-level service policies* from \`${ns}\`.` } },
        formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
      ];
      cache.set(cacheKey, { blocks }, 300);
      await say({ blocks });
      return;
    }

    const policies = spec.active_service_policies?.policies || [];
    if (policies.length === 0) {
      await say({
        blocks: [
          ...formatter.errorBlock(`No service policies configured on LB \`${name}\`.`),
          formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
        ],
      });
      return;
    }

    const rows = policies.map((p) => ({
      name: p.name || 'unknown',
      namespace: p.namespace || ns,
    }));

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🛡️ Service Policies — ${name}` } },
      { type: 'section', text: { type: 'mrkdwn', text: formatter.table(['name', 'namespace'], rows) } },
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
