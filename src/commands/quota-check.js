module.exports = {
  meta: {
    name: 'quota-check',
    description: 'Check XC resource quota utilization',
    slashCommand: '/xc-quota',
    cacheTTL: 300,
    category: 'quotas',
  },

  intents: [
    { utterance: 'what quotas are running high', intent: 'quota.check' },
    { utterance: 'show me quota usage', intent: 'quota.check' },
    { utterance: 'are we near any limits', intent: 'quota.check' },
    { utterance: 'check quota utilization', intent: 'quota.check' },
    { utterance: 'how much capacity do we have left', intent: 'quota.check' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('quota.check', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:quotas`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderQuotas(say, formatter, ns, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const data = await tenant.client.get(`/api/web/namespaces/${ns}/quotas`);
    const items = data.items || [];
    cache.set(cacheKey, items, 300);

    await renderQuotas(say, formatter, ns, items, false, Date.now() - startTime);
  },
};

function quotaIndicator(used, limit) {
  if (limit === 0) return '';
  const pct = (used / limit) * 100;
  if (pct >= 100) return '🔴';
  if (pct >= 80) return '⚠️';
  return '';
}

async function renderQuotas(say, formatter, namespace, items, cached, durationMs) {
  if (items.length === 0) {
    await say({ blocks: formatter.errorBlock(`No quota data found for namespace \`${namespace}\`.`) });
    return;
  }

  const rows = items
    .filter((q) => q.max_allowed > 0)
    .sort((a, b) => (b.current_count / b.max_allowed) - (a.current_count / a.max_allowed))
    .map((q) => ({
      resource: q.kind || q.resource_type || 'unknown',
      usage: `${q.current_count} / ${q.max_allowed}`,
      pct: `${Math.round((q.current_count / q.max_allowed) * 100)}%`,
      status: quotaIndicator(q.current_count, q.max_allowed),
    }));

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📊 Quota Usage — ${namespace}` } },
    { type: 'section', text: { type: 'mrkdwn', text: formatter.table(['resource', 'usage', 'pct', 'status'], rows) } },
    formatter.footer({ durationMs, cached, namespace }),
  ];

  await say({ blocks });
}
