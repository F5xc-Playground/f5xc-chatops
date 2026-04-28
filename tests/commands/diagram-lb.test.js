const diagramLb = require('../../src/commands/diagram-lb');
const { Cache } = require('../../src/core/cache');
const formatter = require('../../src/core/slack-formatter');

describe('diagram-lb', () => {
  test('exports valid plugin contract', () => {
    expect(diagramLb.meta.name).toBe('diagram-lb');
    expect(diagramLb.meta.slashCommand).toBe('/xc-diagram');
    expect(diagramLb.intents.length).toBeGreaterThanOrEqual(3);
  });

  test('buildMermaid generates valid mermaid syntax from LB data', () => {
    const lb = {
      metadata: { name: 'test-lb' },
      spec: {
        domains: ['app.example.com'],
        advertise_on_public_default_vip: {},
        app_firewall: { name: 'prod-waf' },
        disable_bot_defense: {},
        default_route_pools: [
          { pool: { name: 'pool-1', namespace: 'prod' } },
        ],
        routes: [],
      },
    };
    const pools = {
      'pool-1': {
        spec: {
          origin_servers: [
            { public_ip: { ip: '10.0.0.1' } },
          ],
        },
      },
    };
    const mermaid = diagramLb.buildMermaid(lb, pools);
    expect(mermaid).toContain('graph TD');
    expect(mermaid).toContain('test-lb');
    expect(mermaid).toContain('pool-1');
    expect(mermaid).toContain('10#46;0#46;0#46;1');
    expect(mermaid).toContain('prod-waf');
  });
});
