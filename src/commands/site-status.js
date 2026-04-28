module.exports = {
  meta: {
    name: 'site-status',
    description: 'List all sites with health and connectivity status',
    slashCommand: '/xc-sites',
    cacheTTL: 300,
    category: 'sites',
  },

  intents: [
    { utterance: 'show me all sites', intent: 'site.status' },
    { utterance: 'what is the status of sites', intent: 'site.status' },
    { utterance: 'list sites', intent: 'site.status' },
    { utterance: 'are all sites online', intent: 'site.status' },
    { utterance: 'site health', intent: 'site.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    const cacheKey = `${tenant.name}:sites:list`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderSites(say, formatter, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const data = await tenant.client.get('/api/config/namespaces/system/sites');
    const sites = data.items || [];
    cache.set(cacheKey, sites, 300);

    await renderSites(say, formatter, sites, false, Date.now() - startTime);
  },
};

async function renderSites(say, formatter, sites, cached, durationMs) {
  if (sites.length === 0) {
    await say({ blocks: formatter.errorBlock('No sites found.') });
    return;
  }

  const lines = sites.map((site) => {
    const name = site.metadata?.name || site.name || 'unknown';
    const siteType = site.spec?.site_type || 'unknown';
    const version = site.status?.software_version || 'N/A';
    return formatter.statusLine('healthy', name, `${siteType} · v${version}`);
  });

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🏢 Sites' } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    formatter.footer({ durationMs, cached }),
  ];

  await say({ blocks });
}
