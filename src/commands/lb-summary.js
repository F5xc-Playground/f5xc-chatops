module.exports = {
  meta: {
    name: 'lb-summary',
    description: 'Detailed view of a single load balancer',
    slashCommand: '/xc-lb',
    cacheTTL: 300,
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'tell me about my-lb', intent: 'lb.summary' },
    { utterance: 'what routes are on the LB', intent: 'lb.summary' },
    { utterance: 'tell me about the load balancer', intent: 'lb.summary' },
    { utterance: 'show load balancer details', intent: 'lb.summary' },
    { utterance: 'LB summary', intent: 'lb.summary' },
    { utterance: 'describe the load balancer', intent: 'lb.summary' },
    { utterance: 'what is configured on the LB', intent: 'lb.summary' },
    { utterance: 'show me details for my-lb in prod', intent: 'lb.summary' },
    { utterance: 'review the configuration of demo-shop-fe', intent: 'lb.summary' },
    { utterance: 'show me the config of the load balancer', intent: 'lb.summary' },
    { utterance: 'give me the LB detail', intent: 'lb.summary' },
    { utterance: 'what domains are on the load balancer', intent: 'lb.summary' },
    { utterance: 'what pools does the LB use', intent: 'lb.summary' },
    { utterance: 'show me the LB configuration', intent: 'lb.summary' },
    { utterance: 'load balancer overview', intent: 'lb.summary' },
    { utterance: 'tell me about the virtual hosting and routing setup', intent: 'lb.summary' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('lb.summary', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('lb.summary', args.namespace, names, `Load balancers in *${args.namespace}*:`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:http_loadbalancer:${name}`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderLb(say, formatter, ns, name, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    cache.set(cacheKey, lb, 300);
    await renderLb(say, formatter, ns, name, lb, false, Date.now() - startTime);
  },
};

async function renderLb(say, formatter, ns, name, lb, cached, durationMs) {
  const spec = lb.spec || {};

  const domains = (spec.domains || []).join(', ') || 'none';
  const advertise = spec.advertise_on_public_default_vip ? 'Public (default VIP)'
    : spec.advertise_on_public ? 'Public (custom)'
    : spec.advertise_custom ? 'Custom'
    : 'Private';

  const waf = spec.app_firewall ? spec.app_firewall.name : (spec.disable_waf ? 'Disabled' : 'None');
  const botDefense = spec.bot_defense ? 'Enabled' : 'Disabled';
  const rateLimiting = spec.rate_limit
    ? (spec.rate_limit.rate_limiter?.total_number
      ? `${spec.rate_limit.rate_limiter.total_number} per ${(spec.rate_limit.rate_limiter?.unit || 'SECOND').toLowerCase()}`
      : 'Configured')
    : 'None';
  const malUser = spec.enable_malicious_user_detection ? 'Enabled' : 'None';
  const pools = (spec.default_route_pools || []).map((p) => p.pool?.name).filter(Boolean);
  const routeCount = (spec.routes || []).length;

  const fields = [
    { label: 'Namespace', value: ns },
    { label: 'Domains', value: domains },
    { label: 'Advertise', value: advertise },
    { label: 'WAF', value: waf },
    { label: 'Bot Defense', value: botDefense },
    { label: 'Rate Limiting', value: rateLimiting },
    { label: 'Malicious User', value: malUser },
    { label: 'Default Pools', value: pools.join(', ') || 'none' },
    { label: 'Routes', value: String(routeCount) },
  ];

  if (spec.active_service_policies?.policies?.length) {
    const policyNames = spec.active_service_policies.policies.map((p) => p.name);
    fields.push({ label: 'Service Policies', value: policyNames.join(', ') });
  }

  const blocks = [
    ...formatter.detailView(`${lb.metadata?.name || name}`, fields),
    formatter.footer({ durationMs, cached, namespace: ns }),
  ];

  await say({ blocks });
}
