const RESOURCE_TYPES = [
  'http_loadbalancers', 'tcp_loadbalancers', 'origin_pools',
  'app_firewalls', 'service_policys', 'certificates', 'healthchecks',
];

const DISPLAY_NAMES = {
  http_loadbalancers: 'HTTP Load Balancers',
  tcp_loadbalancers: 'TCP Load Balancers',
  origin_pools: 'Origin Pools',
  app_firewalls: 'App Firewalls',
  service_policys: 'Service Policies',
  certificates: 'Certificates',
  healthchecks: 'Health Checks',
};

module.exports = {
  meta: {
    name: 'namespace-summary',
    description: 'Resource counts and health overview for a namespace',
    slashCommand: '/xc-ns',
    cacheTTL: 300,
    category: 'core',
  },

  intents: [
    { utterance: 'summarize namespace prod', intent: 'namespace.summary' },
    { utterance: 'what is in namespace staging', intent: 'namespace.summary' },
    { utterance: 'namespace overview for prod', intent: 'namespace.summary' },
    { utterance: 'give me a summary of namespace system', intent: 'namespace.summary' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('namespace.summary', tenant.namespaces || []) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:summary`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderSummary(say, formatter, ns, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const counts = {};
    await Promise.allSettled(
      RESOURCE_TYPES.map(async (rt) => {
        const data = await tenant.client.get(`/api/config/namespaces/${ns}/${rt}`);
        counts[rt] = (data.items || []).length;
      })
    );

    cache.set(cacheKey, counts, 300);
    await renderSummary(say, formatter, ns, counts, false, Date.now() - startTime);
  },
};

async function renderSummary(say, formatter, namespace, counts, cached, durationMs) {
  const rows = Object.entries(counts).map(([type, count]) => ({
    resource: DISPLAY_NAMES[type] || type,
    count: String(count),
  }));

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📊 Namespace Summary — ${namespace}` } },
    { type: 'section', text: { type: 'mrkdwn', text: formatter.table(['resource', 'count'], rows) } },
    formatter.footer({ durationMs, cached, namespace }),
  ];

  await say({ blocks });
}
