const listResources = require('../../src/commands/list-resources');
const namespaceSummary = require('../../src/commands/namespace-summary');
const quotaCheck = require('../../src/commands/quota-check');
const quotaForecast = require('../../src/commands/quota-forecast');
const { Cache } = require('../../src/core/cache');
const formatter = require('../../src/core/slack-formatter');

function mockTenant(getResponse) {
  return {
    name: 'test',
    client: {
      get: jest.fn().mockResolvedValue(getResponse),
    },
    cachedWhoami: {
      namespace_access: { namespace_role_map: { prod: {}, staging: {} } },
    },
  };
}

describe('list-resources', () => {
  test('exports valid plugin contract', () => {
    expect(listResources.meta.name).toBe('list-resources');
    expect(listResources.meta.slashCommand).toBe('/xc-list');
  });

  test('lists resources by type in namespace', async () => {
    const messages = [];
    const tenant = mockTenant({ items: [{ name: 'lb1' }, { name: 'lb2' }] });
    await listResources.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceType: 'http_loadbalancer', raw: 'http_loadbalancer prod' },
      formatter,
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('lb1');
    expect(text).toContain('lb2');
  });

  test('prompts for namespace if missing', async () => {
    const messages = [];
    const tenant = mockTenant({});
    await listResources.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: null, resourceType: 'http_loadbalancer', raw: '' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('namespace');
  });
});

describe('quota-check', () => {
  test('exports valid plugin contract', () => {
    expect(quotaCheck.meta.name).toBe('quota-check');
    expect(quotaCheck.meta.slashCommand).toBe('/xc-quota');
  });

  test('displays color-coded quota usage', async () => {
    const messages = [];
    const tenant = mockTenant({
      items: [
        { kind: 'http_loadbalancer', current_count: 12, max_allowed: 25 },
        { kind: 'origin_pool', current_count: 48, max_allowed: 50 },
        { kind: 'service_policy', current_count: 15, max_allowed: 15 },
      ],
    });
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod' },
      formatter,
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('http_loadbalancer');
  });
});

describe('namespace-summary', () => {
  test('exports valid plugin contract', () => {
    expect(namespaceSummary.meta.name).toBe('namespace-summary');
  });
});

describe('quota-forecast', () => {
  test('exports valid plugin contract', () => {
    expect(quotaForecast.meta.name).toBe('quota-forecast');
  });
});
