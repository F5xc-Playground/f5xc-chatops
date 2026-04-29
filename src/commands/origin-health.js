module.exports = {
  meta: {
    name: 'origin-health',
    description: 'Configured origin servers for an origin pool',
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
    { utterance: 'show me origin health in prod', intent: 'origin.health' },
    { utterance: 'are my backend servers healthy', intent: 'origin.health' },
    { utterance: 'check origin pool status for my-lb', intent: 'origin.health' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('origin.health', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/origin_pools`);
      const names = (data.items || []).map((p) => p.name || p.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No origin pools found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('origin.health', args.namespace, names, `Which origin pool in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:origin_pool:${name}`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderOrigins(say, formatter, name, ns, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const pool = await tenant.client.get(`/api/config/namespaces/${ns}/origin_pools/${name}`);
    const servers = pool.spec?.origin_servers || [];
    cache.set(cacheKey, servers, 300);

    await renderOrigins(say, formatter, name, ns, servers, false, Date.now() - startTime);
  },
};

async function renderOrigins(say, formatter, name, ns, servers, cached, durationMs) {
  if (servers.length === 0) {
    await say({ blocks: formatter.errorBlock(`Origin pool \`${name}\` has no configured servers.`) });
    return;
  }

  const lines = servers.map((srv) => {
    let addr = 'unknown';
    let type = '';
    if (srv.public_ip?.ip) { addr = srv.public_ip.ip; type = 'public_ip'; }
    else if (srv.private_ip?.ip) { addr = srv.private_ip.ip; type = 'private_ip'; }
    else if (srv.public_name?.dns_name) { addr = srv.public_name.dns_name; type = 'dns'; }
    else if (srv.private_name?.dns_name) { addr = srv.private_name.dns_name; type = 'dns'; }
    else if (srv.k8s_service?.service_name) { addr = srv.k8s_service.service_name; type = 'k8s'; }

    const site = srv.site_locator?.site?.name || '';
    const detail = [type, site].filter(Boolean).join(' · ');
    return `*${addr}*  ${detail}`;
  });

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `Origin Pool: ${name} — ${ns}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `_Configured origins (${servers.length}):_\n` + lines.join('\n') } },
    formatter.footer({ durationMs, cached, namespace: ns }),
  ];

  await say({ blocks });
}
