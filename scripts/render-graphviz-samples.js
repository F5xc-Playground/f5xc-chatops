const { GraphvizRenderer, buildDot, injectIcons } = require('../src/core/diagram-renderer-graphviz');
const { Graphviz } = require('@hpcc-js/wasm-graphviz');
const sharp = require('sharp');
const fs = require('fs');

async function renderLb(lb, pools, outputPath) {
  const { dot, nodeIcons } = buildDot(lb, pools);
  const gv = await Graphviz.load();
  let svg = gv.dot(dot, 'svg');
  svg = injectIcons(svg, nodeIcons);
  fs.writeFileSync(outputPath.replace('.png', '.svg'), svg);
  await sharp(Buffer.from(svg))
    .resize({ width: 3200, withoutEnlargement: true })
    .png()
    .toFile(outputPath);
  console.log(`Rendered: ${outputPath}`);
}

async function main() {
  // Sample 1: Full-featured LB
  const fullLb = {
    metadata: { name: 'demo-shop-api' },
    spec: {
      domains: ['api.sales-demo.f5demos.com'],
      advertise_on_public_default_vip: {},
      app_firewall: { name: 'demo-shop-app-firewall' },
      service_policies_from_namespace: {},
      bot_defense: { regional_endpoint: 'US' },
      api_protection_rules: {},
      enable_api_discovery: {},
      data_guard_rules: {},
      client_side_defense: {},
      default_route_pools: [{ pool: { name: 'demo-shop-frontend' } }],
      routes: [],
    },
  };
  const fullPools = {
    'demo-shop-frontend': { spec: { origin_servers: [
      { k8s_service: { service_name: 'frontend.demo-shop' }, site_locator: { site: { name: 'ce-site-1' } } },
    ] } },
  };
  await renderLb(fullLb, fullPools, '/tmp/gv-full.png');

  // Sample 2: Multi-route LB
  const multiLb = {
    metadata: { name: 'acme-web' },
    spec: {
      domains: ['www.acme.com', 'acme.com'],
      advertise_on_public_default_vip: {},
      app_firewall: { name: 'acme-waf' },
      active_service_policies: { policies: [{ name: 'geo-block' }, { name: 'rate-limit-policy' }] },
      bot_defense: { policy: { name: 'bd-standard' }, regional_endpoint: 'US' },
      default_route_pools: [{ pool: { name: 'web-frontend' } }],
      routes: [
        { simple_route: { path: { prefix: '/api/v2' }, origin_pools: [{ pool: { name: 'api-v2-pool' } }], advanced_options: { app_firewall: { name: 'api-strict-waf' } } } },
        { simple_route: { path: { prefix: '/static' }, origin_pools: [{ pool: { name: 'cdn-pool' } }] } },
        { redirect_route: { path: { prefix: '/old-docs' }, host_redirect: 'docs.acme.com' } },
      ],
    },
  };
  const multiPools = {
    'web-frontend': { spec: { origin_servers: [
      { k8s_service: { service_name: 'web-fe' }, site_locator: { site: { name: 'gke-us-central' } } },
      { k8s_service: { service_name: 'web-fe' }, site_locator: { site: { name: 'gke-eu-west' } } },
    ] } },
    'api-v2-pool': { spec: { origin_servers: [
      { private_name: { dns_name: 'api.internal.acme.net' }, site_locator: { site: { name: 'aws-us-east' } } },
    ] } },
    'cdn-pool': { spec: { origin_servers: [
      { public_name: { dns_name: 'cdn.acme.com' } },
    ] } },
  };
  await renderLb(multiLb, multiPools, '/tmp/gv-multi.png');

  // Sample 3: Minimal (no WAF warning)
  const minLb = {
    metadata: { name: 'test-app' },
    spec: {
      domains: ['test.example.com'],
      advertise_on_public_default_vip: {},
      default_route_pools: [{ pool: { name: 'test-pool' } }],
      routes: [],
    },
  };
  const minPools = {
    'test-pool': { spec: { origin_servers: [
      { public_ip: { ip: '203.0.113.10' } },
    ] } },
  };
  await renderLb(minLb, minPools, '/tmp/gv-minimal.png');

  // Sample 4: Showcase — every possible node type
  const showcaseLb = {
    metadata: { name: 'showcase-all-features' },
    spec: {
      domains: ['app.example.com', 'www.example.com'],
      advertise_on_public_default_vip: {},
      app_firewall: { name: 'strict-waf-policy' },
      active_service_policies: { policies: [{ name: 'geo-block' }, { name: 'rate-limit' }] },
      bot_defense: { policy: { name: 'bd-advanced' }, regional_endpoint: 'US' },
      enable_malicious_user_detection: {},
      api_protection_rules: { api_groups_rules: [{ metadata: { name: 'api-rule-v2' } }] },
      enable_api_discovery: {},
      data_guard_rules: { metadata: { name: 'pii-scrubber' } },
      client_side_defense: { policy: { name: 'csd-magecart' } },
      default_route_pools: [{ pool: { name: 'web-frontend' } }],
      routes: [
        { simple_route: { path: { prefix: '/api' }, origin_pools: [{ pool: { name: 'api-backend' } }], advanced_options: { app_firewall: { name: 'api-waf' } } } },
        { redirect_route: { path: { prefix: '/legacy' }, host_redirect: 'new.example.com' } },
      ],
    },
  };
  const showcasePools = {
    'web-frontend': { spec: { origin_servers: [
      { k8s_service: { service_name: 'web-fe' }, site_locator: { site: { name: 'gke-us-central1' } } },
      { private_name: { dns_name: 'web.internal.corp' }, site_locator: { site: { name: 'aws-us-east-1' } } },
    ] } },
    'api-backend': { spec: { origin_servers: [
      { public_name: { dns_name: 'api.example.com' } },
    ] } },
  };
  await renderLb(showcaseLb, showcasePools, '/tmp/gv-showcase.png');

  // Sample 5: Custom advertise (site-based, not internet)
  const siteLb = {
    metadata: { name: 'internal-api' },
    spec: {
      domains: ['api.internal.corp'],
      advertise_custom: { advertise_where: [
        { site: { site: { name: 'dc-chicago-1' } } },
        { site: { site: { name: 'dc-dallas-2' } } },
      ] },
      app_firewall: { name: 'internal-waf' },
      default_route_pools: [{ pool: { name: 'api-pool' } }],
      routes: [],
    },
  };
  const sitePools = {
    'api-pool': { spec: { origin_servers: [
      { private_ip: { ip: '10.20.30.40' }, site_locator: { site: { name: 'dc-chicago-1' } } },
    ] } },
  };
  await renderLb(siteLb, sitePools, '/tmp/gv-site.png');

  console.log('\nAll samples rendered.');
}

main().catch(console.error);
