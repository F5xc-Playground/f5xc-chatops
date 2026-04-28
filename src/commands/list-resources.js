const RESOURCE_PATHS = {
  http_loadbalancer: 'http_loadbalancers',
  tcp_loadbalancer: 'tcp_loadbalancers',
  udp_loadbalancer: 'udp_loadbalancers',
  origin_pool: 'origin_pools',
  app_firewall: 'app_firewalls',
  service_policy: 'service_policys',
  certificate: 'certificates',
  healthcheck: 'healthchecks',
  rate_limiter: 'rate_limiters',
  dns_zone: 'dns_zones',
  dns_load_balancer: 'dns_load_balancers',
  alert_policy: 'alert_policys',
  route: 'routes',
  virtual_network: 'virtual_networks',
  network_policy: 'network_policys',
  ip_prefix_set: 'ip_prefix_sets',
};

module.exports = {
  meta: {
    name: 'list-resources',
    description: 'List resources of a given type in a namespace',
    slashCommand: '/xc-list',
    cacheTTL: 300,
    category: 'core',
  },

  intents: [
    { utterance: 'list all load balancers in prod', intent: 'list.resources' },
    { utterance: 'show me all origin pools in staging', intent: 'list.resources' },
    { utterance: 'what resources are in namespace prod', intent: 'list.resources' },
    { utterance: 'list certificates in prod', intent: 'list.resources' },
    { utterance: 'show WAF policies in staging', intent: 'list.resources' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('list.resources', Object.keys(nsRoleMap)) });
      return;
    }

    const resourceType = args.resourceType || args.raw?.split(/\s+/)[0] || 'http_loadbalancer';
    const apiPath = RESOURCE_PATHS[resourceType];

    if (!apiPath) {
      const known = Object.keys(RESOURCE_PATHS).join(', ');
      await say({ blocks: formatter.errorBlock(`Unknown resource type: "${resourceType}". Known types: ${known}`) });
      return;
    }

    const cacheKey = `${tenant.name}:${args.namespace}:${resourceType}:list`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderList(say, formatter, resourceType, args.namespace, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const prefix = resourceType.startsWith('dns_') ? 'dns' : 'config';
    const data = await tenant.client.get(`/api/${prefix}/namespaces/${args.namespace}/${apiPath}`);
    const items = data.items || [];
    cache.set(cacheKey, items, 300);

    await renderList(say, formatter, resourceType, args.namespace, items, false, Date.now() - startTime);
  },
};

const MAX_DISPLAY_ITEMS = 20;

async function renderList(say, formatter, resourceType, namespace, items, cached, durationMs) {
  if (items.length === 0) {
    await say({
      blocks: [
        ...formatter.errorBlock(`No ${resourceType} resources found in namespace \`${namespace}\`.`),
        formatter.footer({ durationMs, cached, namespace }),
      ],
    });
    return;
  }

  const displayed = items.slice(0, MAX_DISPLAY_ITEMS);
  const rows = displayed.map((item) => ({
    name: item.name || item.metadata?.name || 'unknown',
    labels: Object.keys(item.labels || item.metadata?.labels || {}).length,
  }));

  const title = items.length > MAX_DISPLAY_ITEMS
    ? `📋 ${resourceType} — ${namespace} (showing ${MAX_DISPLAY_ITEMS} of ${items.length})`
    : `📋 ${resourceType} — ${namespace}`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    { type: 'section', text: { type: 'mrkdwn', text: formatter.table(['name', 'labels'], rows) } },
    formatter.footer({ durationMs, cached, namespace }),
  ];

  await say({ blocks });
}
