const fs = require('fs');
const path = require('path');
const { buildDot, injectIcons } = require('../../src/core/diagram-renderer-graphviz');

describe('buildDot', () => {
  test('generates DOT with LB name and domains', () => {
    const lb = {
      metadata: { name: 'my-lb' },
      spec: {
        domains: ['app.example.com'],
        advertise_on_public_default_vip: {},
        default_route_pools: [],
        routes: [],
      },
    };
    const { dot, nodeIcons } = buildDot(lb, {});
    expect(dot).toContain('digraph LB');
    expect(dot).toContain('my-lb');
    expect(dot).toContain('app.example.com');
    expect(dot).toContain('Internet (All REs)');
    expect(Object.keys(nodeIcons).length).toBeGreaterThan(0);
  });

  test('flags missing WAF on public LB', () => {
    const lb = {
      metadata: { name: 'no-waf' },
      spec: {
        advertise_on_public_default_vip: {},
        default_route_pools: [],
        routes: [],
      },
    };
    const { dot } = buildDot(lb, {});
    expect(dot).toContain('NONE');
    expect(dot).toContain('dashed');
  });

  test('omits WAF warning on private LB', () => {
    const lb = {
      metadata: { name: 'private-lb' },
      spec: {
        default_route_pools: [],
        routes: [],
      },
    };
    const { dot } = buildDot(lb, {});
    expect(dot).not.toContain('NONE');
  });

  test('includes security controls and pool details', () => {
    const lb = {
      metadata: { name: 'full-lb' },
      spec: {
        domains: ['app.example.com'],
        advertise_on_public_default_vip: {},
        app_firewall: { name: 'prod-waf' },
        active_service_policies: { policies: [{ name: 'block-bots' }] },
        bot_defense: { policy: { name: 'bd-standard' }, regional_endpoint: 'US' },
        default_route_pools: [{ pool: { name: 'pool-1' } }],
        routes: [],
      },
    };
    const pools = {
      'pool-1': { spec: { origin_servers: [
        { public_ip: { ip: '10.0.0.1' }, site_locator: { site: { name: 'site-1' } } },
      ] } },
    };
    const { dot } = buildDot(lb, pools);
    expect(dot).toContain('prod-waf');
    expect(dot).toContain('block-bots');
    expect(dot).toContain('bd-standard');
    expect(dot).toContain('US');
    expect(dot).toContain('pool-1');
    expect(dot).toContain('10.0.0.1');
    expect(dot).toContain('site-1');
  });

  test('handles custom advertise policy with site names', () => {
    const lb = {
      metadata: { name: 'custom-lb' },
      spec: {
        advertise_custom: { advertise_where: [
          { site: { site: { name: 'dc-chicago' } } },
          { site: { site: { name: 'dc-dallas' } } },
        ] },
        default_route_pools: [],
        routes: [],
      },
    };
    const { dot } = buildDot(lb, {});
    expect(dot).toContain('dc-chicago');
    expect(dot).toContain('dc-dallas');
  });

  test('handles routes with host header differentiation', () => {
    const lb = {
      metadata: { name: 'route-lb' },
      spec: {
        advertise_on_public_default_vip: {},
        default_route_pools: [],
        routes: [
          { simple_route: { path: { prefix: '/' }, headers: [{ name: 'Host', exact: 'api.example.com' }], origin_pools: [{ pool: { name: 'api-pool' } }] } },
          { simple_route: { path: { prefix: '/' }, headers: [{ name: 'Host', exact: 'web.example.com' }], origin_pools: [{ pool: { name: 'web-pool' } }] } },
        ],
      },
    };
    const { dot } = buildDot(lb, {});
    expect(dot).toContain('api.example.com');
    expect(dot).toContain('web.example.com');
  });
});

describe('GraphvizRenderer', () => {
  const { GraphvizRenderer } = require('../../src/core/diagram-renderer-graphviz');
  let renderer;

  beforeEach(() => {
    renderer = new GraphvizRenderer();
  });

  test('cleanup removes temp file', () => {
    const tmpPath = path.join(require('os').tmpdir(), `test-cleanup-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, 'data');
    expect(fs.existsSync(tmpPath)).toBe(true);
    renderer.cleanup(tmpPath);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  test('cleanup is safe on non-existent file', () => {
    expect(() => renderer.cleanup('/tmp/does-not-exist.png')).not.toThrow();
  });
});
