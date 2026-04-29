const SEVERITY_ICON = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵',
};

module.exports = {
  meta: {
    name: 'alert-status',
    description: 'Active alerts firing on the tenant or a specific namespace',
    slashCommand: '/xc-alerts',
    cacheTTL: 60,
    category: 'observability',
  },

  intents: [
    { utterance: 'any alerts firing', intent: 'alert.status' },
    { utterance: 'are there any active alerts', intent: 'alert.status' },
    { utterance: 'check alerts', intent: 'alert.status' },
    { utterance: 'show me current alerts', intent: 'alert.status' },
    { utterance: 'what alerts are going off', intent: 'alert.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    const ns = args.namespace;
    const cacheKey = ns
      ? `${tenant.name}:${ns}:active_alerts`
      : `${tenant.name}:all:active_alerts`;

    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await say({ blocks: cached });
        return;
      }
    }

    const startTime = Date.now();

    let alerts;
    if (ns) {
      const data = await tenant.client.get(`/api/data/namespaces/${ns}/alerts`);
      alerts = data.alerts || data.items || [];
    } else {
      const data = await tenant.client.get('/api/data/namespaces/system/all_ns_alerts');
      alerts = data.alerts || data.items || [];
    }

    const scope = ns || 'all namespaces';
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🔔 Active Alerts — ${scope}` } },
    ];

    if (alerts.length === 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '🟢 No active alerts.' },
      });
      blocks.push(formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: scope }));
      cache.set(cacheKey, blocks, 60);
      await say({ blocks });
      return;
    }

    const sorted = [...alerts].sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      const sevA = order[(a.labels?.severity || 'info')] ?? 3;
      const sevB = order[(b.labels?.severity || 'info')] ?? 3;
      return sevA - sevB;
    });

    const MAX_DISPLAY = 20;
    const displayed = sorted.slice(0, MAX_DISPLAY);

    const lines = displayed.map((alert) => {
      const labels = alert.labels || {};
      const annotations = alert.annotations || {};
      const severity = labels.severity || 'info';
      const icon = SEVERITY_ICON[severity] || '⚪';
      const name = labels.alertname || 'unknown';
      const alertNs = labels.namespace || '';
      const summary = annotations.summary || annotations.description || '';
      const nsTag = alertNs && !ns ? ` \`${alertNs}\`` : '';
      const desc = summary ? ` — ${summary}` : '';
      return `${icon} *${name}*${nsTag}${desc}`;
    });

    if (alerts.length > MAX_DISPLAY) {
      lines.push(`\n_...and ${alerts.length - MAX_DISPLAY} more_`);
    }

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    });

    blocks.push(formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: scope }));
    cache.set(cacheKey, blocks, 60);
    await say({ blocks });
  },
};
