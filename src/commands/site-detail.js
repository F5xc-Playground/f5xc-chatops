module.exports = {
  meta: {
    name: 'site-detail',
    description: 'Detailed view of a single site',
    slashCommand: '/xc-site',
    cacheTTL: 300,
    category: 'sites',
  },

  intents: [
    { utterance: 'details on site', intent: 'site.detail' },
    { utterance: 'show site details', intent: 'site.detail' },
    { utterance: 'site info', intent: 'site.detail' },
    { utterance: 'describe site', intent: 'site.detail' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    const name = args.resourceName || args.raw?.trim();
    if (!name) {
      await say({ blocks: formatter.errorBlock('Please specify a site name. Example: `/xc-site dallas-ce`') });
      return;
    }

    const cacheKey = `${tenant.name}:system:site:${name}`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await say({ blocks: cached.blocks });
        return;
      }
    }

    const startTime = Date.now();
    const site = await tenant.client.get(`/api/config/namespaces/system/sites/${name}`);
    const spec = site.spec || {};
    const status = site.status || {};

    const fields = [
      { label: 'Name', value: site.metadata?.name || name },
      { label: 'Type', value: spec.site_type || 'N/A' },
      { label: 'SW Version', value: status.software_version || 'N/A' },
      { label: 'OS Version', value: status.os_version || 'N/A' },
    ];

    if (status.node_info?.length) {
      fields.push({ label: 'Nodes', value: String(status.node_info.length) });
    }

    const blocks = [
      ...formatter.detailView(`🏢 Site: ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
