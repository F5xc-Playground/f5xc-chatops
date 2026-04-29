module.exports = {
  meta: {
    name: 'cert-status',
    description: 'Certificate expiration status across LBs in a namespace',
    slashCommand: '/xc-certs',
    cacheTTL: 300,
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'any certs expiring soon', intent: 'cert.status' },
    { utterance: 'show certificate status', intent: 'cert.status' },
    { utterance: 'check certificate expiration', intent: 'cert.status' },
    { utterance: 'are any certificates expired', intent: 'cert.status' },
    { utterance: 'TLS cert status', intent: 'cert.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('cert.status', tenant.namespaces || []) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:cert_status`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderCerts(say, formatter, ns, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const lbData = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers`);
    const lbs = lbData.items || [];
    cache.set(cacheKey, lbs, 300);

    await renderCerts(say, formatter, ns, lbs, false, Date.now() - startTime);
  },
};

async function renderCerts(say, formatter, ns, lbs, cached, durationMs) {
  const certLines = [];
  for (const lb of lbs) {
    const name = lb.name || lb.metadata?.name;
    const timestamps = lb.spec?.downstream_tls_certificate_expiration_timestamps || {};
    for (const [domain, expiry] of Object.entries(timestamps)) {
      const expDate = new Date(expiry);
      const now = new Date();
      const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

      let status;
      if (daysLeft < 0) status = 'expired';
      else if (daysLeft < 30) status = 'expiring';
      else status = 'valid';

      const detail = daysLeft < 0
        ? `expired ${expDate.toISOString().split('T')[0]}`
        : `expires ${expDate.toISOString().split('T')[0]} (${daysLeft} days)`;

      certLines.push(formatter.statusLine(status, `${name} — ${domain}`, detail));
    }
  }

  if (certLines.length === 0) {
    const msg = lbs.length === 0
      ? `No load balancers found in namespace \`${ns}\`.`
      : `No TLS certificates attached to the ${lbs.length} load balancer(s) in namespace \`${ns}\`. Standalone certificates are not shown here.`;
    await say({ blocks: formatter.errorBlock(msg) });
    return;
  }

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `Certificate Status — ${ns}` } },
    { type: 'section', text: { type: 'mrkdwn', text: certLines.join('\n') } },
    formatter.footer({ durationMs, cached, namespace: ns }),
  ];

  await say({ blocks });
}
