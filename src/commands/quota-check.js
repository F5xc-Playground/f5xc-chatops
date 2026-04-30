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
    { utterance: 'report quota usage', intent: 'quota.check' },
    { utterance: 'are we near any quota limits', intent: 'quota.check' },
    { utterance: 'check quota utilization', intent: 'quota.check' },
    { utterance: 'how much quota capacity do we have left', intent: 'quota.check' },
    { utterance: 'which quotas are heavily consumed', intent: 'quota.check' },
    { utterance: 'are any quotas maxed out', intent: 'quota.check' },
    { utterance: 'show me critical quotas', intent: 'quota.check' },
    { utterance: 'show me warning quotas', intent: 'quota.check' },
    { utterance: 'display all quotas', intent: 'quota.check' },
    { utterance: 'quota usage for load balancers', intent: 'quota.check' },
    { utterance: 'quota usage for dns', intent: 'quota.check' },
    { utterance: 'what do I need to worry about for quotas', intent: 'quota.check' },
    { utterance: 'are we close to any quota limits', intent: 'quota.check' },
    { utterance: 'tenant quota overview', intent: 'quota.check' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter, client }) => {
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
    await renderQuotas(say, formatter, items, tier, search, !durationMs, durationMs, client, args._channelId);
  },
};

const QUOTA_FILLER = new Set([
  'show', 'me', 'quotas', 'quota', 'for', 'the', 'and', 'above', 'usage', 'limits',
  'what', 'are', 'is', 'do', 'does', 'we', 'i', 'need', 'to', 'worry', 'about',
  'which', 'how', 'much', 'many', 'any', 'our', 'my', 'a', 'an', 'of', 'in', 'on',
  'near', 'running', 'heavily', 'consumed', 'check', 'have', 'has', 'left', 'out',
  'capacity', 'tell', 'can', 'see', 'look', 'at', 'that', 'there',
]);

function parseArgs(raw) {
  const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean)
    .map((t) => t.replace(/[?!.,;:]+$/, ''));
  let tier = null;
  const searchParts = [];

  for (const token of tokens) {
    if (TIER_KEYWORDS.includes(token)) {
      tier = token;
    } else if (['hot', 'high', 'maxed'].includes(token)) {
      tier = tier || 'critical';
    } else if (!QUOTA_FILLER.has(token)) {
      searchParts.push(token);
    }
  }

  return { tier, search: searchParts.join(' ') };
}


function quotaIndicator(current, maximum) {
  if (maximum <= 0) return '';
  const pct = (current / maximum) * 100;
  if (pct >= 100) return '🔴';
  if (pct >= 80) return '⚠️';
  return '';
}

async function uploadCsv(client, channelId, columns, rows, label) {
  if (!client || !channelId) return;
  const csv = require('../core/slack-formatter').csvString(columns, rows);
  try {
    await client.files.uploadV2({
      content: csv,
      filename: `quota-${label}.csv`,
      channel_id: channelId,
      initial_comment: `Full quota data: ${rows.length} resources`,
    });
  } catch {
    // best-effort
  }
}

const QUOTA_DISPLAY_LIMIT = 25;

async function safeSay(say, blocks, client, channelId, csvColumns, csvRows, csvLabel) {
  try {
    await say({ blocks });
  } catch (err) {
    if (err.data?.error === 'invalid_blocks' && client && channelId) {
      await uploadCsv(client, channelId, csvColumns, csvRows, csvLabel);
      await say({
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `Result too large for inline display — uploaded as \`quota-${csvLabel}.csv\`. Try \`/xc-quota critical\` for the worst offenders.` } },
        ],
      });
    } else {
      throw err;
    }
  }
}

async function renderQuotas(say, formatter, items, tier, search, cached, durationMs, client, channelId) {
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
    const displayed = visible.slice(0, QUOTA_DISPLAY_LIMIT);
    const overflow = visible.length > QUOTA_DISPLAY_LIMIT;
    const rows = displayed.map((q) => {
      const pct = Math.round((q.current / q.maximum) * 100);
      return {
        resource: q.name,
        usage: `${q.current} / ${q.maximum}`,
        pct: `${pct}%`,
        status: quotaIndicator(q.current, q.maximum),
      };
    });

    const countLabel = overflow
      ? `showing ${QUOTA_DISPLAY_LIMIT} of ${visible.length}`
      : `${visible.length} resources`;
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Quotas* _(${countLabel})_` } });
    blocks.push(formatter.tableBlock(['resource', 'usage', 'pct', 'status'], rows));

    if (overflow) {
      const allRows = visible.map((q) => {
        const pct = Math.round((q.current / q.maximum) * 100);
        return { resource: q.name, usage: `${q.current} / ${q.maximum}`, pct: `${pct}%` };
      });
      await uploadCsv(client, channelId, ['resource', 'usage', 'pct'], allRows, 'capped');
    }
  } else if (capped.length > 0) {
    const tierLabel = tier || 'warning';
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `No quotas at ${tierLabel} level or above.` } });
  }

  blocks.push(formatter.footer({ durationMs, cached }));

  const allCsvRows = visible.map((q) => {
    const pct = Math.round((q.current / q.maximum) * 100);
    return { resource: q.name, usage: `${q.current} / ${q.maximum}`, pct: `${pct}%` };
  });
  await safeSay(say, blocks, client, channelId, ['resource', 'usage', 'pct'], allCsvRows, 'capped');

  if (showAll && unlimited.length > 0) {
    unlimited.sort((a, b) => b.current - a.current);
    const displayed = unlimited.slice(0, QUOTA_DISPLAY_LIMIT);
    const rows = displayed.map((q) => ({
      resource: q.name,
      current: String(q.current),
    }));
    const uncappedLabel = unlimited.length > QUOTA_DISPLAY_LIMIT
      ? `showing ${QUOTA_DISPLAY_LIMIT} of ${unlimited.length}`
      : `${unlimited.length} resources`;

    const uncappedBlocks = [
      { type: 'section', text: { type: 'mrkdwn', text: `*Usage (no cap)* _(${uncappedLabel})_` } },
      formatter.tableBlock(['resource', 'current'], rows),
    ];

    const allUncappedRows = unlimited.map((q) => ({
      resource: q.name, current: String(q.current),
    }));
    await safeSay(say, uncappedBlocks, client, channelId, ['resource', 'current'], allUncappedRows, 'uncapped');
  }
}
