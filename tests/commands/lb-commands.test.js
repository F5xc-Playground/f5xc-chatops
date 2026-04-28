const lbSummary = require('../../src/commands/lb-summary');
const certStatus = require('../../src/commands/cert-status');
const originHealth = require('../../src/commands/origin-health');
const { Cache } = require('../../src/core/cache');
const formatter = require('../../src/core/slack-formatter');

function mockTenant(responses) {
  let callCount = 0;
  return {
    name: 'test',
    client: {
      get: jest.fn().mockImplementation(() => {
        const resp = Array.isArray(responses) ? responses[callCount++] : responses;
        return Promise.resolve(resp);
      }),
    },
    cachedWhoami: {
      namespace_access: { namespace_role_map: { prod: {} } },
    },
  };
}

describe('lb-summary', () => {
  test('exports valid plugin contract', () => {
    expect(lbSummary.meta.name).toBe('lb-summary');
    expect(lbSummary.meta.slashCommand).toBe('/xc-lb');
  });

  test('displays LB detail view', async () => {
    const messages = [];
    const tenant = mockTenant({
      metadata: { name: 'prod-lb' },
      spec: {
        domains: ['app.example.com'],
        advertise_on_public_default_vip: {},
        app_firewall: { name: 'prod-waf', namespace: 'prod' },
        default_route_pools: [{ pool: { name: 'pool-1', namespace: 'prod' } }],
        routes: [],
        disable_bot_defense: {},
      },
    });
    await lbSummary.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'prod-lb' },
      formatter,
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('prod-lb');
    expect(text).toContain('app.example.com');
    expect(text).toContain('prod-waf');
  });
});

describe('cert-status', () => {
  test('exports valid plugin contract', () => {
    expect(certStatus.meta.name).toBe('cert-status');
    expect(certStatus.meta.slashCommand).toBe('/xc-certs');
  });
});

describe('origin-health', () => {
  test('exports valid plugin contract', () => {
    expect(originHealth.meta.name).toBe('origin-health');
    expect(originHealth.meta.slashCommand).toBe('/xc-origins');
  });
});
