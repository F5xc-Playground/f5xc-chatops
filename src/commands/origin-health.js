module.exports = {
  meta: {
    name: 'origin-health',
    description: 'Health check status for origin pool servers',
    slashCommand: '/xc-origins',
    cacheTTL: 300,
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'are all origins healthy', intent: 'origin.health' },
    { utterance: 'show origin pool health', intent: 'origin.health' },
    { utterance: 'check backend server status', intent: 'origin.health' },
    { utterance: 'which origins are down', intent: 'origin.health' },
    { utterance: 'origin pool status', intent: 'origin.health' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('origin.health', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an origin pool name. Example: `/xc-origins prod my-pool`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const startTime = Date.now();
    const pool = await tenant.client.get(`/api/config/namespaces/${ns}/origin_pools/${name}`);
    const servers = pool.spec?.origin_servers || [];

    if (servers.length === 0) {
      await say({ blocks: formatter.errorBlock(`Origin pool \`${name}\` has no configured servers.`) });
      return;
    }

    const lines = servers.map((srv) => {
      let addr = 'unknown';
      if (srv.public_ip?.ip) addr = srv.public_ip.ip;
      else if (srv.private_ip?.ip) addr = srv.private_ip.ip;
      else if (srv.public_name?.dns_name) addr = srv.public_name.dns_name;
      else if (srv.private_name?.dns_name) addr = srv.private_name.dns_name;
      else if (srv.k8s_service?.service_name) addr = srv.k8s_service.service_name;

      const site = srv.site_locator?.site?.name || '';
      const detail = site ? `${addr} (${site})` : addr;
      return formatter.statusLine('healthy', detail, '');
    });

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🏥 Origin Pool: ${name} — ${ns}` } },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
