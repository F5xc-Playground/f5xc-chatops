const TIERS = {
  critical: { min: 80, label: 'Critical (80%+)' },
  warning: { min: 50, label: 'Warning (50–79%)' },
  normal: { min: 0, label: 'Normal (< 50%)' },
};

const TIER_KEYWORDS = ['critical', 'warning', 'normal', 'all'];

module.exports = {
  meta: {
    name: 'quota-check',
    description: 'Check XC tenant quota and usage limits',
    slashCommand: '/xc-quota',
    cacheTTL: 300,
    category: 'quotas',
  },

  intents: [
    { utterance: 'what quotas are running high', intent: 'quota.check' },
    { utterance: 'what quotas are running hot', intent: 'quota.check' },
    { utterance: 'show me quota usage', intent: 'quota.check' },
    { utterance: 'are we near any limits', intent: 'quota.check' },
    { utterance: 'check quota utilization', intent: 'quota.check' },
    { utterance: 'how much capacity do we have left', intent: 'quota.check' },
    { utterance: 'which quotas are heavily consumed', intent: 'quota.check' },
    { utterance: 'are any quotas maxed out', intent: 'quota.check' },
    { utterance: 'show me critical quotas', intent: 'quota.check' },
    { utterance: 'show me warning quotas', intent: 'quota.check' },
    { utterance: 'show all quotas', intent: 'quota.check' },
    { utterance: 'show me quotas for load balancers', intent: 'quota.check' },
    { utterance: 'quota usage for dns', intent: 'quota.check' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    const cacheKey = `${tenant.name}:quotas`;
    let items;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        items = cached;
      }
    }

    let durationMs;
    if (!items) {
      const startTime = Date.now();
      const data = await tenant.client.get('/api/web/namespaces/system/quota/usage');
      const quotaUsage = data.quota_usage || {};

      items = Object.entries(quotaUsage).map(([name, entry]) => ({
        name,
        current: entry.usage?.current ?? 0,
        maximum: entry.limit?.maximum ?? 0,
      }));

      cache.set(cacheKey, items, 300);
      durationMs = Date.now() - startTime;
    }

    const { tier, search } = parseArgs(args.raw || '');
    await renderQuotas(say, formatter, items, tier, search, !durationMs, durationMs);
  },
};

function parseArgs(raw) {
  const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);
  let tier = null;
  const searchParts = [];

  for (const token of tokens) {
    if (TIER_KEYWORDS.includes(token)) {
      tier = token;
    } else if (['hot', 'high', 'maxed'].includes(token)) {
      tier = tier || 'critical';
    } else if (!['show', 'me', 'quotas', 'quota', 'for', 'the', 'and', 'above', 'usage', 'limits'].includes(token)) {
      searchParts.push(token);
    }
  }

  return { tier, search: searchParts.join(' ') };
}

function getTier(current, maximum) {
  if (maximum <= 0) return null;
  const pct = (current / maximum) * 100;
  if (pct >= 80) return 'critical';
  if (pct >= 50) return 'warning';
  return 'normal';
}

const MAX_DISPLAY = 40;

function quotaIndicator(current, maximum) {
  if (maximum <= 0) return '';
  const pct = (current / maximum) * 100;
  if (pct >= 100) return '🔴';
  if (pct >= 80) return '⚠️';
  return '';
}

async function renderQuotas(say, formatter, items, tier, search, cached, durationMs) {
  if (items.length === 0) {
    await say({ blocks: formatter.errorBlock('No quota data found for this tenant.') });
    return;
  }

  let filtered = items.filter((q) => q.current >= 0);

  if (search) {
    const terms = search.toLowerCase();
    filtered = filtered.filter((q) => q.name.toLowerCase().includes(terms));
  }

  const capped = filtered.filter((q) => q.maximum > 0);
  const unlimited = filtered.filter((q) => q.maximum === -1 && q.current > 0);

  const showAll = tier === 'all' || !!search;
  const minPct = showAll ? 0 : (TIERS[tier]?.min ?? TIERS.warning.min);

  let visible = minPct > 0
    ? capped.filter((q) => (q.current / q.maximum) * 100 >= minPct)
    : capped;

  visible.sort((a, b) => (b.current / b.maximum) - (a.current / a.maximum));

  const blocks = [];

  const titleParts = ['Quota Usage'];
  if (search) titleParts.push(`— "${search}"`);
  if (tier && tier !== 'all') titleParts.push(`(${tier}+)`);
  blocks.push({ type: 'header', text: { type: 'plain_text', text: titleParts.join(' ') } });

  if (visible.length > 0) {
    const rows = visible.slice(0, MAX_DISPLAY).map((q) => {
      const pct = Math.round((q.current / q.maximum) * 100);
      return {
        resource: q.name,
        usage: `${q.current} / ${q.maximum}`,
        pct: `${pct}%`,
        status: quotaIndicator(q.current, q.maximum),
      };
    });

    const countLabel = visible.length > MAX_DISPLAY
      ? `showing ${MAX_DISPLAY} of ${visible.length}`
      : `${visible.length} resources`;
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Quotas* _(${countLabel})_` } });
    blocks.push(formatter.tableBlock(['resource', 'usage', 'pct', 'status'], rows));
  } else if (capped.length > 0) {
    const tierLabel = tier || 'warning';
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `No quotas at ${tierLabel} level or above.` } });
  }

  if (showAll && unlimited.length > 0) {
    unlimited.sort((a, b) => b.current - a.current);
    const rows = unlimited.slice(0, MAX_DISPLAY).map((q) => ({
      resource: q.name,
      current: String(q.current),
    }));
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Usage (no cap)* _(${unlimited.length} resources)_` } });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: formatter.table(['resource', 'current'], rows) } });
  }

  blocks.push(formatter.footer({ durationMs, cached }));
  await say({ blocks });
}
