const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { log } = require('./logger');

const ICONS_DIR = path.resolve(__dirname, '../assets/icons');
const ICON_SIZE = 22;
const ICON_SPACER = `<TR><TD HEIGHT="${ICON_SIZE + 4}"> </TD></TR>`;

const iconCache = {};
function loadIconDataUri(name) {
  if (!iconCache[name]) {
    const svg = fs.readFileSync(path.join(ICONS_DIR, `${name}.svg`));
    iconCache[name] = 'data:image/svg+xml;base64,' + svg.toString('base64');
  }
  return iconCache[name];
}

function iconLabel(lines, ...extraLines) {
  const rows = [ICON_SPACER];
  for (const line of lines) {
    rows.push(`<TR><TD ALIGN="CENTER">${line}</TD></TR>`);
  }
  for (const line of extraLines) {
    rows.push(`<TR><TD ALIGN="CENTER">${line}</TD></TR>`);
  }
  return `<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="1">${rows.join('')}</TABLE>`;
}

let graphvizInstance = null;
async function getGraphviz() {
  if (!graphvizInstance) {
    const { Graphviz } = await import('@hpcc-js/wasm-graphviz');
    graphvizInstance = await Graphviz.load();
  }
  return graphvizInstance;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(str, maxLen = 28) {
  if (str.length <= maxLen) return escapeHtml(str);
  const parts = [];
  let remaining = str;
  while (remaining.length > maxLen) {
    let breakAt = remaining.lastIndexOf('.', maxLen);
    if (breakAt <= 0) breakAt = remaining.lastIndexOf('-', maxLen);
    if (breakAt <= 0) breakAt = maxLen;
    parts.push(escapeHtml(remaining.substring(0, breakAt + 1)));
    remaining = remaining.substring(breakAt + 1);
  }
  if (remaining) parts.push(escapeHtml(remaining));
  return parts.join('<BR/>');
}

function buildDot(lb, pools) {
  const name = lb.metadata?.name || 'unknown';
  const spec = lb.spec || {};
  const isPublic = !!(spec.advertise_on_public_default_vip || spec.advertise_on_public);

  const nodeIcons = {};
  const lines = [];
  lines.push('digraph LB {');
  lines.push('  rankdir=LR;');
  lines.push('  bgcolor="white";');
  lines.push('  pad="0.4";');
  lines.push('  nodesep=0.4;');
  lines.push('  ranksep=0.5;');
  lines.push('  node [fontname="Helvetica,Arial,sans-serif" fontsize=11 margin="0.35,0.18"];');
  lines.push('  edge [color="#64748b" penwidth=1.5 arrowsize=0.8];');
  lines.push('');

  const securityHex = 'shape=hexagon style="filled" width=1.6 height=1.1 fillcolor="#4a7ec7:#2a4d82" gradientangle=270 color="#2a4d82" fontcolor="white"';

  let nodeId = 0;
  const id = () => `n${nodeId++}`;
  let lastId;

  const lbId = id();
  nodeIcons[lbId] = 'load-balancer';
  let advertise;
  if (spec.advertise_on_public_default_vip) {
    advertise = 'Internet (All REs)';
  } else if (spec.advertise_on_public) {
    advertise = 'Internet (All REs)';
  } else if (spec.advertise_custom) {
    const sites = (spec.advertise_custom.advertise_where || [])
      .map((w) => w.site?.site?.name || w.virtual_site?.virtual_site?.name || w.vk8s_networks?.site?.name)
      .filter(Boolean);
    advertise = sites.length > 0 ? sites.map((s) => escapeHtml(s)).join(', ') : 'Custom Sites';
  } else if (spec.do_not_advertise) {
    advertise = 'Not Advertised';
  } else {
    advertise = 'Private';
  }
  lines.push(`  ${lbId} [label=<${iconLabel([`<B>${escapeHtml(name)}</B>`], [`<FONT POINT-SIZE="10">HTTP Load Balancer</FONT>`], [`<FONT POINT-SIZE="9">${advertise}</FONT>`])}> shape=box style="filled,rounded,bold" fillcolor="#1a3a5c:#0f2440" gradientangle=270 color="#0f2440" fontcolor="white" penwidth=2];`);
  lastId = lbId;

  const domains = spec.domains || [];
  if (domains.length > 0) {
    const domId = id();
    nodeIcons[domId] = 'globe';
    const domRows = domains.map((d) => `<TR><TD ALIGN="CENTER">${escapeHtml(d)}</TD></TR>`).join('');
    lines.push(`  ${domId} [label=<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="1">${ICON_SPACER}<TR><TD ALIGN="CENTER"><B>Domains</B></TD></TR>${domRows}</TABLE>> shape=box style="filled,rounded" fillcolor="#eff6ff:#dbeafe" gradientangle=270 color="#3b82f6" fontcolor="#1e3a5f"];`);
    lines.push(`  ${lastId} -> ${domId};`);
    lastId = domId;
  }

  const hasPolicies = spec.active_service_policies?.policies?.length || spec.service_policies_from_namespace;
  if (hasPolicies) {
    const spId = id();
    nodeIcons[spId] = 'shield';
    let detail;
    if (spec.active_service_policies?.policies?.length) {
      detail = spec.active_service_policies.policies.map((p) => escapeHtml(p.name)).join('<BR/>');
    } else {
      detail = 'namespace default';
    }
    lines.push(`  ${spId} [label=<${iconLabel(['<B>Service Policies</B>'], [`<FONT POINT-SIZE="10">${detail}</FONT>`])}> ${securityHex}];`);
    lines.push(`  ${lastId} -> ${spId};`);
    lastId = spId;
  }

  if (spec.bot_defense) {
    const bdId = id();
    nodeIcons[bdId] = 'bot';
    const bdParts = [];
    if (spec.bot_defense.policy?.name) bdParts.push(escapeHtml(spec.bot_defense.policy.name));
    if (spec.bot_defense.regional_endpoint) bdParts.push(`Region: ${escapeHtml(spec.bot_defense.regional_endpoint)}`);
    const detail = bdParts.length > 0 ? bdParts.join('<BR/>') : 'Enabled';
    lines.push(`  ${bdId} [label=<${iconLabel(['<B>Bot Defense</B>'], [`<FONT POINT-SIZE="10">${detail}</FONT>`])}> ${securityHex}];`);
    lines.push(`  ${lastId} -> ${bdId};`);
    lastId = bdId;
  }

  if (spec.enable_malicious_user_detection) {
    const mudId = id();
    nodeIcons[mudId] = 'eye';
    lines.push(`  ${mudId} [label=<${iconLabel(['<B>Malicious User Detection</B>'], ['<FONT POINT-SIZE="10">Enabled</FONT>'])}> ${securityHex}];`);
    lines.push(`  ${lastId} -> ${mudId};`);
    lastId = mudId;
  }

  if (spec.api_protection_rules) {
    const apId = id();
    nodeIcons[apId] = 'lock';
    const names = [];
    for (const g of (spec.api_protection_rules.api_groups_rules || [])) {
      if (g.metadata?.name) names.push(escapeHtml(g.metadata.name));
    }
    const apiGroup = spec.api_protection_rules.api_group || spec.api_protection_rules.api_specification;
    if (apiGroup?.name) names.push(escapeHtml(apiGroup.name));
    const detail = names.length > 0 ? names.join('<BR/>') : 'Enabled';
    lines.push(`  ${apId} [label=<${iconLabel(['<B>API Protection</B>'], [`<FONT POINT-SIZE="10">${detail}</FONT>`])}> ${securityHex}];`);
    lines.push(`  ${lastId} -> ${apId};`);
    lastId = apId;
  }

  if (spec.enable_api_discovery) {
    const adId = id();
    nodeIcons[adId] = 'magnify';
    lines.push(`  ${adId} [label=<${iconLabel(['<B>API Discovery</B>'], ['<FONT POINT-SIZE="10">Enabled</FONT>'])}> ${securityHex}];`);
    lines.push(`  ${lastId} -> ${adId};`);
    lastId = adId;
  }

  if (spec.data_guard_rules) {
    const dgId = id();
    nodeIcons[dgId] = 'shield';
    const detail = spec.data_guard_rules.metadata?.name ? escapeHtml(spec.data_guard_rules.metadata.name) : 'Enabled';
    lines.push(`  ${dgId} [label=<${iconLabel(['<B>Data Guard</B>'], [`<FONT POINT-SIZE="10">${detail}</FONT>`])}> ${securityHex}];`);
    lines.push(`  ${lastId} -> ${dgId};`);
    lastId = dgId;
  }

  if (spec.client_side_defense) {
    const csdId = id();
    nodeIcons[csdId] = 'shield';
    const detail = spec.client_side_defense.policy?.name ? escapeHtml(spec.client_side_defense.policy.name) : 'Enabled';
    lines.push(`  ${csdId} [label=<${iconLabel(['<B>Client-Side Defense</B>'], [`<FONT POINT-SIZE="10">${detail}</FONT>`])}> ${securityHex}];`);
    lines.push(`  ${lastId} -> ${csdId};`);
    lastId = csdId;
  }

  if (spec.app_firewall) {
    const wafId = id();
    nodeIcons[wafId] = 'firewall';
    lines.push(`  ${wafId} [label=<${iconLabel(['<B>WAF</B>'], [`<FONT POINT-SIZE="10">${escapeHtml(spec.app_firewall.name)}</FONT>`])}> shape=box style="filled,rounded,bold" fillcolor="#27ae60:#145a32" gradientangle=270 color="#145a32" fontcolor="white" penwidth=2];`);
    lines.push(`  ${lastId} -> ${wafId};`);
    lastId = wafId;
  } else if (isPublic) {
    const wafId = id();
    nodeIcons[wafId] = 'firewall';
    lines.push(`  ${wafId} [label=<${iconLabel(['<B>WAF</B>'], ['<FONT POINT-SIZE="10">NONE</FONT>'])}> shape=box style="filled,rounded,bold,dashed" fillcolor="#e74c3c:#922b21" gradientangle=270 color="#922b21" fontcolor="white" penwidth=2];`);
    lines.push(`  ${lastId} -> ${wafId};`);
    lastId = wafId;
  }

  const routesId = id();
  nodeIcons[routesId] = 'route';
  lines.push(`  ${routesId} [label=<${iconLabel(['<B>Routes</B>'])}> shape=diamond style="filled" fillcolor="#e8edf2" color="#94a3b8" fontcolor="#334155"];`);
  lines.push(`  ${lastId} -> ${routesId};`);

  const defaultPools = spec.default_route_pools || [];
  if (defaultPools.length > 0) {
    const defId = id();
    lines.push(`  ${defId} [label="Default Route" shape=box style="filled,rounded" fillcolor="#f1f5f9" color="#94a3b8" fontcolor="#334155"];`);
    lines.push(`  ${routesId} -> ${defId};`);
    for (const poolRef of defaultPools) {
      const poolName = poolRef.pool?.name;
      if (poolName) renderPoolDot(lines, id, defId, poolName, pools[poolName], nodeIcons);
    }
  }

  for (const route of (spec.routes || [])) {
    if (route.redirect_route || route.direct_response_route || route.custom_route_object) continue;
    const sr = route.simple_route || route;
    const matchParts = [];
    const pathVal = sr.path?.prefix || sr.path?.regex || sr.path?.exact;
    if (pathVal) matchParts.push(escapeHtml(pathVal));
    for (const h of (sr.headers || [])) {
      if (h.name === 'Host' && h.exact) {
        matchParts.push(`Host: ${escapeHtml(h.exact)}`);
      } else if (h.name && h.exact) {
        matchParts.push(`${escapeHtml(h.name)}: ${escapeHtml(h.exact)}`);
      }
    }
    if (sr.http_method && sr.http_method !== 'ANY') {
      matchParts.push(escapeHtml(sr.http_method));
    }
    const matchLabel = matchParts.length > 0 ? matchParts.join('<BR/>') : '/';
    const routeId = id();
    lines.push(`  ${routeId} [label=<Route<BR/><FONT POINT-SIZE="10">${matchLabel}</FONT>> shape=box style="filled,rounded" fillcolor="#f1f5f9" color="#94a3b8" fontcolor="#334155"];`);
    lines.push(`  ${routesId} -> ${routeId};`);

    let routeParent = routeId;
    if (sr.advanced_options?.app_firewall) {
      const rwId = id();
      nodeIcons[rwId] = 'firewall';
      lines.push(`  ${rwId} [label=<${iconLabel(['<B>WAF</B>'], [`<FONT POINT-SIZE="10">${escapeHtml(sr.advanced_options.app_firewall.name)}</FONT>`])}> shape=box style="filled,rounded,bold" fillcolor="#27ae60:#145a32" gradientangle=270 color="#145a32" fontcolor="white" penwidth=2];`);
      lines.push(`  ${routeParent} -> ${rwId};`);
      routeParent = rwId;
    }

    for (const poolRef of (sr.origin_pools || [])) {
      const poolName = poolRef.pool?.name;
      if (poolName) renderPoolDot(lines, id, routeParent, poolName, pools[poolName], nodeIcons);
    }
  }

  for (const route of (spec.routes || [])) {
    if (!route.redirect_route) continue;
    const rr = route.redirect_route;
    const match = rr.path?.prefix || rr.path?.regex || '/';
    const target = rr.host_redirect || rr.path_redirect || 'redirect';
    const rrId = id();
    nodeIcons[rrId] = 'redirect';
    lines.push(`  ${rrId} [label=<${iconLabel(['<B>Redirect</B>'], [`<FONT POINT-SIZE="10">${escapeHtml(match)} →<BR/>${wrapText(target)}</FONT>`])}> shape=box style="filled,rounded" fillcolor="#fef3c7" color="#d97706" fontcolor="#92400e"];`);
    lines.push(`  ${routesId} -> ${rrId};`);
  }

  lines.push('}');
  return { dot: lines.join('\n'), nodeIcons };
}

function renderPoolDot(lines, id, parentId, poolName, poolData, nodeIcons) {
  const poolId = id();
  nodeIcons[poolId] = 'pool';
  lines.push(`  ${poolId} [label=<${iconLabel(['<B>Origin Pool</B>'], [`<FONT POINT-SIZE="10">${wrapText(poolName)}</FONT>`])}> shape=box3d style="filled" fillcolor="#fef9c3:#fde68a" gradientangle=270 color="#d97706" fontcolor="#92400e"];`);
  lines.push(`  ${parentId} -> ${poolId};`);

  if (!poolData?.spec?.origin_servers) {
    const errId = id();
    lines.push(`  ${errId} [label="unavailable" shape=box style="filled,dashed" fillcolor="#fee2e2" color="#dc2626" fontcolor="#991b1b"];`);
    lines.push(`  ${poolId} -> ${errId};`);
    return;
  }

  for (const srv of poolData.spec.origin_servers) {
    const srvId = id();
    nodeIcons[srvId] = 'server';
    let addr = 'unknown';
    let addrType = '';
    if (srv.public_ip?.ip) { addr = srv.public_ip.ip; addrType = 'public'; }
    else if (srv.private_ip?.ip) { addr = srv.private_ip.ip; addrType = 'private'; }
    else if (srv.public_name?.dns_name) { addr = srv.public_name.dns_name; addrType = 'dns'; }
    else if (srv.private_name?.dns_name) { addr = srv.private_name.dns_name; addrType = 'dns'; }
    else if (srv.k8s_service?.service_name) { addr = srv.k8s_service.service_name; addrType = 'k8s'; }

    const site = srv.site_locator?.site?.name || '';
    let detail = wrapText(addr);
    if (addrType) detail += `<BR/><FONT POINT-SIZE="9">${addrType}</FONT>`;
    if (site) detail += `<BR/><FONT POINT-SIZE="9">${escapeHtml(site)}</FONT>`;

    lines.push(`  ${srvId} [label=<${iconLabel([detail])}> shape=box style="filled,rounded" fillcolor="#f0fdf4:#dcfce7" gradientangle=270 color="#16a34a" fontcolor="#14532d"];`);
    lines.push(`  ${poolId} -> ${srvId};`);
  }
}

function injectIcons(svg, nodeIcons) {
  const entries = [];
  const titleRegex = /<title>(n\d+)<\/title>/g;
  let m;
  while ((m = titleRegex.exec(svg)) !== null) {
    entries.push({ nodeId: m[1], titleIdx: m.index });
  }

  for (const { nodeId, titleIdx } of entries.reverse()) {
    const closeGIdx = svg.indexOf('</g>', titleIdx);
    if (closeGIdx === -1) continue;
    let nodeGroup = svg.substring(titleIdx, closeGIdx);

    const shapeMatch = nodeGroup.match(/<(?:path|polygon)[^>]*(?:\bd="([^"]*)"|points="([^"]*)")/);
    if (!shapeMatch) continue;

    const coords = (shapeMatch[1] || shapeMatch[2]).match(/-?[\d.]+/g).map(Number);
    const xs = coords.filter((_, i) => i % 2 === 0);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;

    nodeGroup = nodeGroup.replace(/<text ([^>]*)>/g, (textEl, attrs) => {
      let a = attrs.replace(/text-anchor="[^"]*"/, 'text-anchor="middle"');
      a = a.replace(/\bx="[^"]*"/, `x="${centerX}"`);
      return `<text ${a}>`;
    });

    let imageEl = '';
    if (nodeIcons[nodeId]) {
      const dataUri = loadIconDataUri(nodeIcons[nodeId]);
      const textMatches = [...nodeGroup.matchAll(/<text[^>]*\by="([^"]*)"[^>]*/g)];
      if (textMatches.length > 0) {
        const firstY = parseFloat(textMatches[0][1]);
        const iconX = centerX - ICON_SIZE / 2;
        const iconY = firstY - ICON_SIZE + 4;
        imageEl = `<image href="${dataUri}" x="${iconX}" y="${iconY}" width="${ICON_SIZE}" height="${ICON_SIZE}"/>\n`;
      }
    }

    svg = svg.substring(0, titleIdx) + nodeGroup + imageEl + svg.substring(closeGIdx);
  }

  return svg;
}

class GraphvizRenderer {
  async renderToFile(lb, pools) {
    const { dot, nodeIcons } = buildDot(lb, pools);
    const gv = await getGraphviz();
    log('info', 'Graphviz render starting');

    let svg = gv.dot(dot, 'svg');
    svg = injectIcons(svg, nodeIcons);

    const tmpDir = os.tmpdir();
    const outputPath = path.join(tmpDir, `xc-diagram-${Date.now()}.png`);

    await sharp(Buffer.from(svg))
      .resize({ width: 3200, withoutEnlargement: true })
      .png()
      .toFile(outputPath);

    log('info', 'Graphviz render complete', { outputPath });
    return outputPath;
  }

  cleanup(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = { GraphvizRenderer, buildDot, injectIcons };
