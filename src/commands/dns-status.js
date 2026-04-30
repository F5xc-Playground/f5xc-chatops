module.exports = {
  meta: {
    name: 'dns-status',
    description: 'List DNS zones and GSLB status',
    slashCommand: '/xc-dns',
    cacheTTL: 300,
    category: 'dns',
  },

  intents: [
    { utterance: 'show me GSLB config', intent: 'dns.status' },
    { utterance: 'show DNS zones', intent: 'dns.status' },
    { utterance: 'what DNS zones are configured', intent: 'dns.status' },
    { utterance: 'list DNS zones in prod', intent: 'dns.status' },
    { utterance: 'show me the DNS zone configuration', intent: 'dns.status' },
    { utterance: 'are there any DNS zones', intent: 'dns.status' },
    { utterance: 'DNS zone status', intent: 'dns.status' },
    { utterance: 'check DNS zones', intent: 'dns.status' },
    { utterance: 'what DNS load balancers exist', intent: 'dns.status' },
    { utterance: 'DNS overview', intent: 'dns.status' },
    { utterance: 'view the DNS records', intent: 'dns.status' },
    { utterance: 'list domain delegations', intent: 'dns.status' },
    { utterance: 'what zones are configured', intent: 'dns.status' },
    { utterance: 'view the GSLB setup', intent: 'dns.status' },
    { utterance: 'zone configuration and delegations overview', intent: 'dns.status' },
    { utterance: 'DNS zone listing', intent: 'dns.status' },
    { utterance: 'all zone delegations', intent: 'dns.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('dns.status', tenant.namespaces || []) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:dns_status`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await say({ blocks: cached.blocks });
        return;
      }
    }

    const startTime = Date.now();
    const [zoneData, gslbData] = await Promise.all([
      tenant.client.get(`/api/config/dns/namespaces/${ns}/dns_zones`).catch(() => ({ items: [] })),
      tenant.client.get(`/api/config/dns/namespaces/${ns}/dns_load_balancers`).catch(() => ({ items: [] })),
    ]);

    const zones = zoneData.items || [];
    const gslbs = gslbData.items || [];

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `DNS — ${ns}` } },
    ];

    const allRows = [];
    for (const z of zones) {
      allRows.push({
        name: z.name || z.metadata?.name || 'unknown',
        kind: z.spec?.zone_type || 'primary',
        category: 'Zone',
      });
    }
    for (const g of gslbs) {
      allRows.push({
        name: g.name || g.metadata?.name || 'unknown',
        kind: '-',
        category: 'GSLB',
      });
    }

    if (allRows.length > 0) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `_${zones.length} zones, ${gslbs.length} load balancers_` } });
      blocks.push(formatter.tableBlock(['name', 'category', 'kind'], allRows));
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No DNS zones or load balancers configured.' } });
    }

    blocks.push(formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }));
    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
