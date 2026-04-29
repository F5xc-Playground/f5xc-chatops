module.exports = {
  meta: {
    name: 'dns-status',
    description: 'List DNS zones and GSLB status',
    slashCommand: '/xc-dns',
    cacheTTL: 300,
    category: 'dns',
  },

  intents: [
    { utterance: 'show DNS zones', intent: 'dns.status' },
    { utterance: 'list DNS zones', intent: 'dns.status' },
    { utterance: 'DNS status', intent: 'dns.status' },
    { utterance: 'what DNS zones are configured', intent: 'dns.status' },
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
      { type: 'header', text: { type: 'plain_text', text: `🌐 DNS — ${ns}` } },
    ];

    if (zones.length > 0) {
      const rows = zones.map((z) => ({
        name: z.name || z.metadata?.name || 'unknown',
        type: z.spec?.zone_type || 'primary',
      }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*DNS Zones (${zones.length})*\n` + formatter.table(['name', 'type'], rows) } });
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No DNS zones configured.' } });
    }

    if (gslbs.length > 0) {
      blocks.push({ type: 'divider' });
      const rows = gslbs.map((g) => ({
        name: g.name || g.metadata?.name || 'unknown',
      }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*DNS Load Balancers (${gslbs.length})*\n` + formatter.table(['name'], rows) } });
    }

    blocks.push(formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }));
    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
