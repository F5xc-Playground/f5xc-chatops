const { buildDot, injectIcons } = require('/Users/kevin/Projects/f5xc-chatops/src/core/diagram-renderer-graphviz');
const { Graphviz } = require('@hpcc-js/wasm-graphviz');
const sharp = require('sharp');
const fs = require('fs');
const https = require('https');

const TOKEN = '4XU5ca+jOynT8NiafE84D7cqM9k=';
const BASE = 'https://f5-sales-demo.console.ves.volterra.io/api/config/namespaces';

function apiGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'Authorization': `APIToken ${TOKEN}` } }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const LBS = [
  'adv-botdefense/adv-botdefense',
  'api-security-demo/crapi-api',
  'api-security-demo/malware-detect',
  'api-security-demo/sentence-api-app',
  'bot-defense/bot-defense-demo',
  'bot-defense/bot-defense-demo-2',
  'crapi-api/crapi-gateway-services',
  'default/airline-f5se',
  'default/echo',
  'demo-mcn/aws-echo',
  'demo-mcn/juice-shop-mcn',
  'demo-mcn/pazo-arcadia-finance',
  'demo-shop/demo-shop-api',
  'demo-shop/demo-shop-fe',
  'ms-build/ms-build-lb',
  'origin-example/subset-demo-lb',
  'secondarydns-demo/arcadia-app',
  'test-appsec/airline-flask-front-http-lb',
  'test-appsec/example-lb',
  'waap-demo/aracadia-azure-lb',
];

async function main() {
  const gv = await Graphviz.load();
  const outDir = '/tmp/gv-real';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const entry of LBS) {
    const [ns, name] = entry.split('/');
    console.log(`Fetching ${ns}/${name}...`);

    let lb;
    try {
      lb = await apiGet(`${BASE}/${ns}/http_loadbalancers/${name}`);
      if (!lb || !lb.spec) { console.log(`  SKIP (no spec)`); continue; }
    } catch (e) { console.log(`  SKIP (${e.message})`); continue; }

    // Collect pool names from default_route_pools and routes
    const poolNames = new Set();
    for (const p of (lb.spec.default_route_pools || [])) {
      if (p.pool?.name) poolNames.add(p.pool.name);
    }
    for (const r of (lb.spec.routes || [])) {
      const sr = r.simple_route || r;
      for (const p of (sr.origin_pools || [])) {
        if (p.pool?.name) poolNames.add(p.pool.name);
      }
    }

    // Fetch each pool
    const pools = {};
    for (const pn of poolNames) {
      try {
        // pools may be in same namespace or referenced with namespace
        const poolData = await apiGet(`${BASE}/${ns}/origin_pools/${pn}`);
        if (poolData?.spec) pools[pn] = poolData;
      } catch (e) { /* skip */ }
    }

    // Render
    try {
      const { dot, nodeIcons } = buildDot(lb, pools);
      let svg = gv.dot(dot, 'svg');
      svg = injectIcons(svg, nodeIcons);

      const safeName = `${ns}--${name}`;
      const pngPath = `${outDir}/${safeName}.png`;
      await sharp(Buffer.from(svg))
        .resize({ width: 3200, withoutEnlargement: true })
        .png()
        .toFile(pngPath);
      console.log(`  Rendered: ${pngPath}`);
    } catch (e) {
      console.log(`  RENDER ERROR: ${e.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
