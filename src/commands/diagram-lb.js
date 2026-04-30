const { log } = require('../core/logger');

function escapeLabel(str) {
  return String(str).replace(/\./g, '#46;').replace(/"/g, '#34;');
}

function buildMermaid(lb, pools) {
  const name = lb.metadata?.name || 'unknown';
  const spec = lb.spec || {};
  const lines = ['graph TD'];
  let nodeId = 0;
  const id = () => `n${nodeId++}`;

  const isPublic = !!(spec.advertise_on_public_default_vip || spec.advertise_on_public);
  const lbType = isPublic ? 'Public' : 'Private';

  const userId = id();
  const lbId = id();
  lines.push(`  ${userId}(["\xF0\x9F\x91\xA4 User"])`);
  lines.push(`  ${lbId}["${escapeLabel(name)}<br/>${lbType} HTTP LB"]`);
  lines.push(`  ${userId} --> ${lbId}`);

  let lastId = lbId;

  // Domains — inline
  const domains = spec.domains || [];
  if (domains.length > 0) {
    const domId = id();
    const domLabel = domains.map((d) => escapeLabel(d)).join('<br/>');
    lines.push(`  ${domId}["${domLabel}"]`);
    lines.push(`  ${lastId} --> ${domId}`);
    lastId = domId;
  }

  // Service Policies — inline
  const hasPolicies = spec.active_service_policies?.policies?.length || spec.service_policies_from_namespace;
  if (hasPolicies) {
    const spId = id();
    let policyLabel;
    if (spec.active_service_policies?.policies?.length) {
      const names = spec.active_service_policies.policies.map((p) => escapeLabel(p.name)).join('<br/>');
      policyLabel = `Service Policies<br/>${names}`;
    } else {
      policyLabel = 'Service Policies<br/>namespace default';
    }
    lines.push(`  ${spId}["${policyLabel}"]:::security`);
    lines.push(`  ${lastId} --> ${spId}`);
    lastId = spId;
  }

  // Bot Defense — inline
  if (spec.bot_defense) {
    const bdId = id();
    lines.push(`  ${bdId}["Bot Defense"]:::security`);
    lines.push(`  ${lastId} --> ${bdId}`);
    lastId = bdId;
  }

  // Additional security features — inline
  const extraSec = [];
  if (spec.enable_malicious_user_detection) extraSec.push('Malicious User Detection');
  if (spec.api_protection_rules) extraSec.push('API Protection');
  if (spec.enable_api_discovery) extraSec.push('API Discovery');
  if (spec.data_guard_rules) extraSec.push('Data Guard');
  if (spec.client_side_defense) extraSec.push('Client-Side Defense');
  if (extraSec.length > 0) {
    const esId = id();
    lines.push(`  ${esId}["${extraSec.join('<br/>')}"]:::security`);
    lines.push(`  ${lastId} --> ${esId}`);
    lastId = esId;
  }

  // WAF — inline, color-coded
  if (spec.app_firewall) {
    const wafId = id();
    lines.push(`  ${wafId}["WAF: ${escapeLabel(spec.app_firewall.name)}"]:::waf`);
    lines.push(`  ${lastId} --> ${wafId}`);
    lastId = wafId;
  } else if (isPublic) {
    const wafId = id();
    lines.push(`  ${wafId}["WAF: NONE"]:::wafMissing`);
    lines.push(`  ${lastId} --> ${wafId}`);
    lastId = wafId;
  }

  // Routes hub
  const routesId = id();
  lines.push(`  ${routesId}{"Routes"}`);
  lines.push(`  ${lastId} --> ${routesId}`);

  // Default route pools
  const defaultPools = spec.default_route_pools || [];
  if (defaultPools.length > 0) {
    const defId = id();
    lines.push(`  ${defId}["Default Route"]`);
    lines.push(`  ${routesId} --> ${defId}`);
    for (const poolRef of defaultPools) {
      const poolName = poolRef.pool?.name;
      if (poolName) renderPool(lines, id, defId, poolName, pools[poolName]);
    }
  }

  // Named routes
  for (const route of (spec.routes || [])) {
    if (route.redirect_route) continue;
    const sr = route.simple_route || route;
    const match = sr.path?.prefix || sr.path?.regex || sr.path?.exact || '/';
    const routeId = id();
    lines.push(`  ${routeId}["Route: ${escapeLabel(match)}"]`);
    lines.push(`  ${routesId} --> ${routeId}`);

    let routeParent = routeId;
    if (sr.advanced_options?.app_firewall) {
      const rwId = id();
      lines.push(`  ${rwId}["WAF: ${escapeLabel(sr.advanced_options.app_firewall.name)}"]:::waf`);
      lines.push(`  ${routeParent} --> ${rwId}`);
      routeParent = rwId;
    }

    for (const poolRef of (sr.origin_pools || [])) {
      const poolName = poolRef.pool?.name;
      if (poolName) renderPool(lines, id, routeParent, poolName, pools[poolName]);
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

  // Style classes
  lines.push('');
  lines.push('  classDef security fill:#4a90d9,stroke:#2c5f8a,color:#fff');
  lines.push('  classDef waf fill:#27ae60,stroke:#1e8449,color:#fff');
  lines.push('  classDef wafMissing fill:#e74c3c,stroke:#c0392b,color:#fff');

  return lines.join('\n');
}

function renderPool(lines, id, parentId, poolName, poolData) {
  const poolId = id();
  lines.push(`  ${poolId}[["${escapeLabel(poolName)}"]]`);
  lines.push(`  ${parentId} --> ${poolId}`);

  if (!poolData?.spec?.origin_servers) {
    const errId = id();
    lines.push(`  ${errId}["unavailable"]:::wafMissing`);
    lines.push(`  ${poolId} --> ${errId}`);
    return;
  }

  for (const srv of poolData.spec.origin_servers) {
    const srvId = id();
    let addr = 'unknown';
    let addrType = '';
    if (srv.public_ip?.ip) { addr = srv.public_ip.ip; addrType = 'public'; }
    else if (srv.private_ip?.ip) { addr = srv.private_ip.ip; addrType = 'private'; }
    else if (srv.public_name?.dns_name) { addr = srv.public_name.dns_name; addrType = 'dns'; }
    else if (srv.private_name?.dns_name) { addr = srv.private_name.dns_name; addrType = 'dns'; }
    else if (srv.k8s_service?.service_name) { addr = srv.k8s_service.service_name; addrType = 'k8s'; }

    const site = srv.site_locator?.site?.name || '';
    const parts = [escapeLabel(addr)];
    if (addrType) parts.push(addrType);
    if (site) parts.push(escapeLabel(site));
    lines.push(`  ${srvId}(["${parts.join('<br/>')}"])`);
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
    { utterance: 'show me a diagram of demo-shop-fe', intent: 'diagram.lb' },
    { utterance: 'visualize the load balancer', intent: 'diagram.lb' },
    { utterance: 'draw the LB architecture', intent: 'diagram.lb' },
    { utterance: 'generate a diagram', intent: 'diagram.lb' },
    { utterance: 'show me an XC diagram of my-lb', intent: 'diagram.lb' },
    { utterance: 'show the LB chain as a picture', intent: 'diagram.lb' },
    { utterance: 'show me the traffic flow for the LB', intent: 'diagram.lb' },
    { utterance: 'graph the load balancer', intent: 'diagram.lb' },
    { utterance: 'render the LB diagram', intent: 'diagram.lb' },
    { utterance: 'map the load balancer chain', intent: 'diagram.lb' },
    { utterance: 'create a visual of the LB', intent: 'diagram.lb' },
    { utterance: 'show me a picture of the load balancer flow', intent: 'diagram.lb' },
    { utterance: 'LB architecture diagram', intent: 'diagram.lb' },
    { utterance: 'visualize the traffic path', intent: 'diagram.lb' },
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
      log('info', 'Diagram render requested', { lb: name, namespace: ns, channelId: args._channelId });
      outputPath = await diagramRenderer.renderToFile(mermaid);
      const fs = require('fs');
      if (client) {
        log('info', 'Uploading diagram', { lb: name, channelId: args._channelId });
        await client.files.uploadV2({
          file: fs.createReadStream(outputPath),
          filename: `${name}-diagram.png`,
          channel_id: args._channelId,
          initial_comment: `LB diagram: ${name} (${ns})`,
        });
        log('info', 'Diagram uploaded', { lb: name });
      } else {
        await say(`Diagram rendered but file upload requires Slack client. Use a slash command or @mention.`);
      }
    } catch (err) {
      log('error', 'Diagram failed', { lb: name, error: err.message });
      await say({ blocks: formatter.errorBlock(`Diagram render failed: ${err.message}. Try \`/xc-lb ${ns} ${name}\` for a text summary.`) });
    } finally {
      if (outputPath) diagramRenderer.cleanup(outputPath);
    }
  },
};
