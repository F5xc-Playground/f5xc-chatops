module.exports = {
  meta: {
    name: 'site-detail',
    description: 'Detailed view of a single site',
    slashCommand: '/xc-site',
    cacheTTL: 300,
    category: 'sites',
  },

  intents: [
    { utterance: 'details on site dallas-ce', intent: 'site.detail' },
    { utterance: 'show site detail for my-site', intent: 'site.detail' },
    { utterance: 'site info for dallas-ce', intent: 'site.detail' },
    { utterance: 'describe site my-site', intent: 'site.detail' },
    { utterance: 'tell me about site dallas-ce', intent: 'site.detail' },
    { utterance: 'what version is site my-site running', intent: 'site.detail' },
    { utterance: 'show me the detail for site dallas-ce', intent: 'site.detail' },
    { utterance: 'what is the state of site my-site', intent: 'site.detail' },
    { utterance: 'site dallas-ce info', intent: 'site.detail' },
    { utterance: 'give me detail on site my-site', intent: 'site.detail' },
    { utterance: 'pull up site dallas-ce', intent: 'site.detail' },
    { utterance: 'check on site my-site', intent: 'site.detail' },
    { utterance: 'show the software version for site dallas-ce', intent: 'site.detail' },
    { utterance: 'site detail my-site', intent: 'site.detail' },
    { utterance: 'inspect site dallas-ce', intent: 'site.detail' },
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
    let site;
    try {
      site = await tenant.client.get(`/api/config/namespaces/system/sites/${name}`);
    } catch (err) {
      if (err.status === 404) {
        const listData = await tenant.client.get('/api/config/namespaces/system/sites');
        site = (listData.items || []).find(
          (s) => (s.metadata?.name || s.name) === name
        );
        if (!site) {
          await say({ blocks: formatter.errorBlock(`Site \`${name}\` not found.`) });
          return;
        }
      } else {
        throw err;
      }
    }
    const spec = site.spec || {};
    const status = site.status || {};

    const fields = [
      { label: 'Name', value: site.metadata?.name || name },
      { label: 'Type', value: spec.site_type || site.labels?.['ves.io/siteType'] || 'N/A' },
      { label: 'SW Version', value: status.software_version || spec.volterra_software_version || 'N/A' },
      { label: 'OS Version', value: status.os_version || 'N/A' },
      { label: 'State', value: status.connected_state || spec.connected_state || spec.site_state || 'N/A' },
    ];

    if (status.node_info?.length) {
      fields.push({ label: 'Nodes', value: String(status.node_info.length) });
    }

    const blocks = [
      ...formatter.detailView(`Site: ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
