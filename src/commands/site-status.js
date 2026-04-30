const MAX_PARALLEL_FETCHES = 30;

module.exports = {
  meta: {
    name: 'site-status',
    description: 'List sites with connectivity status (CE by default)',
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
    { utterance: 'show me customer edge sites', intent: 'site.status' },
    { utterance: 'show CE sites', intent: 'site.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    const filter = (args.resourceName || args.raw || '').trim().toLowerCase();

    if (filter && filter !== 'ce' && filter !== 're' && filter !== 'all') {
      const siteDetail = require('./site-detail');
      await siteDetail.handler({ say, tenant, cache, args: { ...args, resourceName: filter, raw: filter }, formatter });
      return;
    }

    const mode = (filter === 're') ? 're' : (filter === 'all') ? 'all' : 'ce';

    const cacheKey = `${tenant.name}:sites:${mode}`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderSites(say, formatter, cached.sites, cached.counts, mode, true);
        return;
      }
    }

    const startTime = Date.now();
    const data = await tenant.client.get('/api/config/namespaces/system/sites');
    const allSites = data.items || [];

    const classified = allSites.map((site) => {
      const name = site.metadata?.name || site.name || 'unknown';
      const typeLabel = site.labels?.['ves.io/siteType'] || '';
      const siteType = typeLabel.includes('re') ? 'RE' : typeLabel.includes('ce') ? 'CE' : 'unknown';
      return { name, siteType, raw: site };
    });

    const counts = {
      ce: classified.filter((s) => s.siteType === 'CE').length,
      re: classified.filter((s) => s.siteType === 'RE').length,
      total: classified.length,
    };

    let filtered = classified;
    if (mode === 'ce') filtered = classified.filter((s) => s.siteType === 'CE');
    else if (mode === 're') filtered = classified.filter((s) => s.siteType === 'RE');

    const detailed = await Promise.allSettled(
      filtered.slice(0, MAX_PARALLEL_FETCHES).map((s) =>
        tenant.client.get(`/api/config/namespaces/system/sites/${s.name}`)
          .then((detail) => ({ ...s, detail }))
          .catch(() => s)
      )
    );

    const sites = detailed.map((r) => {
      const s = r.status === 'fulfilled' ? r.value : r.reason;
      const detail = s.detail || s.raw || {};
      const spec = detail.spec || {};
      const status = detail.status || {};
      const state = status.connected_state || spec.connected_state || spec.site_state || '';
      return { name: s.name, siteType: s.siteType, state };
    });

    cache.set(cacheKey, { sites, counts }, 300);
    await renderSites(say, formatter, sites, counts, mode, false, Date.now() - startTime);
  },
};

function stateEmoji(state) {
  const s = (state || '').toLowerCase();
  if (s === 'online' || s === 'connected') return '🟢';
  if (s === 'degraded') return '🟡';
  if (s === 'offline' || s === 'disconnected' || s === 'failed') return '🔴';
  return '⚪';
}

async function renderSites(say, formatter, sites, counts, mode, cached, durationMs) {
  if (sites.length === 0) {
    const label = mode === 're' ? 'Regional Edge' : mode === 'all' ? '' : 'Customer Edge';
    await say({ blocks: formatter.errorBlock(`No ${label} sites found.`.trim()) });
    return;
  }

  const modeLabel = mode === 're' ? 'Regional Edge' : mode === 'ce' ? 'Customer Edge' : 'All';
  const countSummary = mode === 'all'
    ? `${counts.total} sites (${counts.ce} CE, ${counts.re} RE)`
    : `${sites.length} ${modeLabel} sites`;

  const rows = sites.map((s) => ({
    name: s.name,
    type: s.siteType,
    state: `${stateEmoji(s.state)} ${s.state || 'unknown'}`,
  }));

  const columns = mode === 'all' ? ['name', 'type', 'state'] : ['name', 'state'];

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${modeLabel} Sites` } },
    { type: 'section', text: { type: 'mrkdwn', text: `_${countSummary}_` } },
    formatter.tableBlock(columns, rows),
    formatter.footer({ durationMs, cached }),
  ];

  await say({ blocks });
}
