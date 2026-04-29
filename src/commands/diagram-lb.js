function escapeLabel(str) {
  return String(str).replace(/\./g, '#46;').replace(/"/g, '#34;');
}

function buildMermaid(lb, pools) {
  const name = lb.metadata?.name || 'unknown';
  const spec = lb.spec || {};
  const lines = ['graph TD'];
  let nodeId = 0;
  const id = () => `n${nodeId++}`;

  const userId = id();
  const lbId = id();
  const isPublic = !!(spec.advertise_on_public_default_vip || spec.advertise_on_public);
  const lbType = isPublic ? 'Public' : 'Private';
  lines.push(`  ${userId}([User])`);
  lines.push(`  ${lbId}["${escapeLabel(name)}<br/>${lbType} LB"]`);
  lines.push(`  ${userId} --> ${lbId}`);

  // Domains
  const domains = spec.domains || [];
  for (const domain of domains) {
    const dId = id();
    lines.push(`  ${dId}["${escapeLabel(domain)}"]`);
    lines.push(`  ${lbId} --> ${dId}`);
  }

  // Security subgraph
  const secItems = [];
  if (spec.app_firewall) {
    secItems.push(`WAF: ${escapeLabel(spec.app_firewall.name)}`);
  }
  if (spec.active_service_policies?.policies?.length) {
    const names = spec.active_service_policies.policies.map((p) => p.name).join(', ');
    secItems.push(`Policies: ${escapeLabel(names)}`);
  }
  if (spec.service_policies_from_namespace) {
    secItems.push('Policies: namespace default');
  }
  if (spec.bot_defense) {
    secItems.push('Bot Defense: Enabled');
  }
  if (spec.enable_malicious_user_detection) {
    secItems.push('Malicious User Detection: Enabled');
  }
  if (spec.api_protection_rules) {
    secItems.push('API Protection: Enabled');
  }
  if (spec.enable_api_discovery) {
    secItems.push('API Discovery: Enabled');
  }
  if (spec.data_guard_rules) {
    secItems.push('Data Guard: Enabled');
  }
  if (spec.client_side_defense) {
    secItems.push('Client-Side Defense: Enabled');
  }

  if (secItems.length > 0) {
    const secId = id();
    lines.push(`  subgraph sec["Security Controls"]`);
    lines.push(`    ${secId}["${secItems.join('<br/>')}"]`);
    lines.push(`  end`);
    lines.push(`  ${lbId} --> ${secId}`);
  }

  // Routes hub
  const routesId = id();
  lines.push(`  ${routesId}{"Routes"}`);
  lines.push(`  ${lbId} --> ${routesId}`);

  // Default route pools
  const defaultPools = spec.default_route_pools || [];
  if (defaultPools.length > 0) {
    const defId = id();
    lines.push(`  ${defId}["Default Route"]`);
    lines.push(`  ${routesId} --> ${defId}`);
    for (const poolRef of defaultPools) {
      const poolName = poolRef.pool?.name;
      if (poolName) {
        renderPool(lines, id, defId, poolName, pools[poolName]);
      }
    }
  }

  // Named routes
  for (const route of (spec.routes || [])) {
    const sr = route.simple_route || route;
    const match = sr.path?.prefix || sr.path?.regex || sr.path?.exact || '/';
    const routeId = id();
    lines.push(`  ${routeId}["Route: ${escapeLabel(match)}"]`);
    lines.push(`  ${routesId} --> ${routeId}`);

    if (sr.advanced_options?.app_firewall) {
      const wafId = id();
      lines.push(`  ${wafId}["WAF Override: ${escapeLabel(sr.advanced_options.app_firewall.name)}"]`);
      lines.push(`  ${routeId} --> ${wafId}`);
    }

    for (const poolRef of (sr.origin_pools || [])) {
      const poolName = poolRef.pool?.name;
      if (poolName) {
        renderPool(lines, id, routeId, poolName, pools[poolName]);
      }
    }
  }

  // Redirect routes
  for (const route of (spec.routes || [])) {
    if (!route.redirect_route) continue;
    const rr = route.redirect_route;
    const match = rr.path?.prefix || rr.path?.regex || '/';
    const target = rr.host_redirect || rr.path_redirect || 'redirect';
    const rrId = id();
    lines.push(`  ${rrId}["Redirect: ${escapeLabel(match)} → ${escapeLabel(target)}"]`);
    lines.push(`  ${routesId} --> ${rrId}`);
  }

  return lines.join('\n');
}

function renderPool(lines, id, parentId, poolName, poolData) {
  const poolId = id();
  lines.push(`  ${poolId}[["${escapeLabel(poolName)}"]]`);
  lines.push(`  ${parentId} --> ${poolId}`);

  if (!poolData?.spec?.origin_servers) {
    const errId = id();
    lines.push(`  ${errId}["unavailable"]:::error`);
    lines.push(`  ${poolId} --> ${errId}`);
    return;
  }

  for (const srv of poolData.spec.origin_servers) {
    const srvId = id();
    let addr = 'unknown';
    if (srv.public_ip?.ip) addr = srv.public_ip.ip;
    else if (srv.private_ip?.ip) addr = srv.private_ip.ip;
    else if (srv.public_name?.dns_name) addr = srv.public_name.dns_name;
    else if (srv.private_name?.dns_name) addr = srv.private_name.dns_name;
    else if (srv.k8s_service?.service_name) addr = srv.k8s_service.service_name;

    const site = srv.site_locator?.site?.name || '';
    const label = site ? `${escapeLabel(addr)}<br/>${escapeLabel(site)}` : escapeLabel(addr);
    lines.push(`  ${srvId}(["${label}"])`);
    lines.push(`  ${poolId} --> ${srvId}`);
  }
}

module.exports = {
  meta: {
    name: 'diagram-lb',
    description: 'Generate a visual diagram of an LB chain',
    slashCommand: '/xc-diagram',
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'diagram the load balancer chain', intent: 'diagram.lb' },
    { utterance: 'show me a map of the LB', intent: 'diagram.lb' },
    { utterance: 'visualize the load balancer', intent: 'diagram.lb' },
    { utterance: 'draw the LB topology', intent: 'diagram.lb' },
    { utterance: 'generate a diagram for the load balancer', intent: 'diagram.lb' },
  ],

  entities: [],

  buildMermaid,

  handler: async ({ say, client, tenant, cache, args, formatter, diagramRenderer }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('diagram.lb', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('diagram.lb', args.namespace, names, `Which load balancer to diagram in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;

    await say(`Generating diagram for \`${name}\` in namespace \`${ns}\`...`);

    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    // Collect unique pool names
    const poolNames = new Set();
    for (const p of (spec.default_route_pools || [])) {
      if (p.pool?.name) poolNames.add(p.pool.name);
    }
    for (const route of (spec.routes || [])) {
      const sr = route.simple_route || route;
      for (const p of (sr.origin_pools || [])) {
        if (p.pool?.name) poolNames.add(p.pool.name);
      }
    }

    // Fetch pools in parallel
    const pools = {};
    const poolResults = await Promise.allSettled(
      [...poolNames].map(async (poolName) => {
        const poolData = await tenant.client.get(`/api/config/namespaces/${ns}/origin_pools/${poolName}`);
        pools[poolName] = poolData;
      })
    );

    const mermaid = buildMermaid(lb, pools);
    let outputPath;
    try {
      outputPath = await diagramRenderer.renderToFile(mermaid);
      const fs = require('fs');
      if (client) {
        await client.files.uploadV2({
          file: fs.createReadStream(outputPath),
          filename: `${name}-diagram.png`,
          channel_id: args._channelId,
          initial_comment: `LB diagram: ${name} (${ns})`,
        });
      } else {
        await say(`Diagram rendered but file upload requires Slack client. Use a slash command or @mention.`);
      }
    } catch (err) {
      await say({ blocks: formatter.errorBlock(`Diagram render failed: ${err.message}. Try \`/xc-lb ${ns} ${name}\` for a text summary.`) });
    } finally {
      if (outputPath) diagramRenderer.cleanup(outputPath);
    }
  },
};
