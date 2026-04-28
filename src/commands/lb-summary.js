module.exports = {
  meta: {
    name: 'lb-summary',
    description: 'Detailed view of a single load balancer',
    slashCommand: '/xc-lb',
    cacheTTL: 300,
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'tell me about the load balancer', intent: 'lb.summary' },
    { utterance: 'show load balancer details', intent: 'lb.summary' },
    { utterance: 'LB summary', intent: 'lb.summary' },
    { utterance: 'describe the load balancer', intent: 'lb.summary' },
    { utterance: 'what is configured on the LB', intent: 'lb.summary' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('lb.summary', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify a load balancer name. Example: `/xc-lb prod my-lb`') });
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
  const pools = (spec.default_route_pools || []).map((p) => p.pool?.name).filter(Boolean);
  const routeCount = (spec.routes || []).length;

  const fields = [
    { label: 'Namespace', value: ns },
    { label: 'Domains', value: domains },
    { label: 'Advertise', value: advertise },
    { label: 'WAF', value: waf },
    { label: 'Bot Defense', value: botDefense },
    { label: 'Default Pools', value: pools.join(', ') || 'none' },
    { label: 'Routes', value: String(routeCount) },
  ];

  if (spec.active_service_policies?.policies?.length) {
    const policyNames = spec.active_service_policies.policies.map((p) => p.name);
    fields.push({ label: 'Service Policies', value: policyNames.join(', ') });
  }

  const blocks = [
    ...formatter.detailView(`🔷 ${lb.metadata?.name || name}`, fields),
    formatter.footer({ durationMs, cached, namespace: ns }),
  ];

  await say({ blocks });
}
