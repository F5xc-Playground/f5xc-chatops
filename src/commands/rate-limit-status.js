module.exports = {
  meta: {
    name: 'rate-limit-status',
    description: 'Rate limiting configuration on a load balancer',
    slashCommand: '/xc-ratelimit',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'show rate limiting config', intent: 'rate.limit.status' },
    { utterance: 'is rate limiting enabled on my LB', intent: 'rate.limit.status' },
    { utterance: 'check rate limiter', intent: 'rate.limit.status' },
    { utterance: 'what rate limit is set', intent: 'rate.limit.status' },
    { utterance: 'show me the rate limiting policy', intent: 'rate.limit.status' },
    { utterance: 'is there a rate limit on the load balancer', intent: 'rate.limit.status' },
    { utterance: 'rate limiter status', intent: 'rate.limit.status' },
    { utterance: 'check throttling on the LB', intent: 'rate.limit.status' },
    { utterance: 'is request throttling enabled', intent: 'rate.limit.status' },
    { utterance: 'what is the rate limit threshold', intent: 'rate.limit.status' },
    { utterance: 'show me the request rate limit', intent: 'rate.limit.status' },
    { utterance: 'is there rate limiting configured', intent: 'rate.limit.status' },
    { utterance: 'rate limit settings on the LB', intent: 'rate.limit.status' },
    { utterance: 'check if rate limiting is on', intent: 'rate.limit.status' },
    { utterance: 'show me the RPS limit', intent: 'rate.limit.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      await say({ blocks: formatter.namespacePicker('rate.limit.status', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('rate.limit.status', args.namespace, names, `Check rate limiting for which LB in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:rate_limit:${name}`;
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

    const rlConfig = spec.rate_limit;
    const apiRl = spec.api_rate_limit;

    if (!rlConfig && !apiRl) {
      const blocks = [
        ...formatter.errorBlock(`No rate limiting configured on LB \`${name}\` in namespace \`${ns}\`.`),
        formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
      ];
      await say({ blocks });
      return;
    }

    const fields = [
      { label: 'LB', value: name },
    ];

    if (rlConfig) {
      const limiter = rlConfig.rate_limiter || {};
      const threshold = limiter.total_number;
      const unit = limiter.unit || 'SECOND';
      if (threshold) {
        fields.push({ label: 'Threshold', value: `${threshold} per ${unit.toLowerCase()}` });
      }
      if (limiter.burst_multiplier) {
        fields.push({ label: 'Burst Multiplier', value: String(limiter.burst_multiplier) });
      }
      const policyCount = rlConfig.policies?.length || 0;
      if (policyCount > 0) {
        fields.push({ label: 'Rate Limit Policies', value: String(policyCount) });
      }
    }

    if (apiRl) {
      fields.push({ label: 'API Rate Limiting', value: 'Configured' });
    }

    const blocks = [
      ...formatter.detailView(`Rate Limiting — ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
