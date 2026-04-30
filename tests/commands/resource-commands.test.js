const listResources = require('../../src/commands/list-resources');
const namespaceSummary = require('../../src/commands/namespace-summary');
const quotaCheck = require('../../src/commands/quota-check');
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
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockImplementation((path) => {
          if (path.endsWith('/http_loadbalancers')) {
            return Promise.resolve({ items: [{ name: 'lb1' }, { name: 'lb2' }] });
          }
          const name = path.split('/').pop();
          return Promise.resolve({ metadata: { name }, spec: { domains: [`${name}.example.com`] } });
        }),
      },
    };
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
    expect(text).toContain('lb1.example.com');
  });

  test('uses inventory endpoint for LBs without namespace', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn(),
        post: jest.fn().mockResolvedValue({
          http_loadbalancers: {
            httplb_results: [
              { name: 'lb1', namespace: 'prod', domains: ['lb1.example.com'], waf_enforcement_mode: 'Blocking' },
              { name: 'lb2', namespace: 'staging', domains: ['lb2.example.com'], waf_enforcement_mode: '' },
            ],
          },
        }),
      },
    };
    await listResources.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: null, resourceType: 'http_loadbalancer', raw: '' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('lb1');
    expect(text).toContain('lb2');
    expect(text).toContain('prod');
    expect(text).toContain('staging');
    expect(text).toContain('all namespaces');
    expect(tenant.client.post).toHaveBeenCalledWith(
      '/api/config/namespaces/system/all_application_inventory',
      { http_load_balancer_filter: {}, tcp_load_balancer_filter: {} }
    );
  });

  test('single arg matching resource type is treated as type not namespace', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn(),
        post: jest.fn().mockResolvedValue({
          http_loadbalancers: {
            httplb_results: [{ name: 'lb1', namespace: 'prod', domains: [], waf_enforcement_mode: '' }],
          },
        }),
      },
    };
    await listResources.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'http_loadbalancer', resourceName: null, resourceType: null, raw: 'http_loadbalancer' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('all namespaces');
    expect(tenant.client.post).toHaveBeenCalled();
  });

  test('single arg matching non-inventory type prompts for namespace', async () => {
    const messages = [];
    const tenant = mockTenant({});
    await listResources.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'app_firewall', resourceName: null, resourceType: null, raw: 'app_firewall' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('namespace');
  });

  test('prompts for namespace for non-inventory types', async () => {
    const messages = [];
    const tenant = mockTenant({});
    await listResources.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: null, resourceType: 'app_firewall', raw: '' },
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

  function quotaTenant() {
    return mockTenant({
      quota_usage: {
        'HTTP Load Balancer': { limit: { maximum: 25 }, usage: { current: 12 } },
        'Origin Pool': { limit: { maximum: 50 }, usage: { current: 48 } },
        'Service Policy': { limit: { maximum: 15 }, usage: { current: 15 } },
        'DNS Zone': { limit: { maximum: 100 }, usage: { current: 5 } },
        'API Inventory': { limit: { maximum: -1 }, usage: { current: 29 } },
      },
    });
  }

  test('default shows warning+ only (50%+)', async () => {
    const messages = [];
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant: quotaTenant(),
      cache: new Cache(),
      args: { raw: '' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Origin Pool');
    expect(text).toContain('Service Policy');
    expect(text).not.toContain('HTTP Load Balancer');
    expect(text).not.toContain('DNS Zone');
    expect(text).not.toContain('API Inventory');
  });

  test('"all" shows quotas and uncapped usage in separate messages', async () => {
    const messages = [];
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant: quotaTenant(),
      cache: new Cache(),
      args: { raw: 'all' },
      formatter,
    });
    expect(messages.length).toBe(2);
    const cappedText = JSON.stringify(messages[0]);
    expect(cappedText).toContain('DNS Zone');
    const uncappedText = JSON.stringify(messages[1]);
    expect(uncappedText).toContain('API Inventory');
    expect(uncappedText).toContain('no cap');
  });

  test('"critical" filters to 80%+', async () => {
    const messages = [];
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant: quotaTenant(),
      cache: new Cache(),
      args: { raw: 'critical' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Origin Pool');
    expect(text).toContain('Service Policy');
    expect(text).not.toContain('HTTP Load Balancer');
  });

  test('search filters by resource name', async () => {
    const messages = [];
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant: quotaTenant(),
      cache: new Cache(),
      args: { raw: 'load balancer' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('HTTP Load Balancer');
    expect(text).not.toContain('Origin Pool');
  });

  test('NL "what quotas are critical?" strips punctuation and parses tier', async () => {
    const messages = [];
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant: quotaTenant(),
      cache: new Cache(),
      args: { raw: 'what quotas are critical?' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Origin Pool');
    expect(text).toContain('Service Policy');
    expect(text).not.toContain('what are critical');
  });

  test('NL "what do I need to worry about?" does not become a search filter', async () => {
    const messages = [];
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant: quotaTenant(),
      cache: new Cache(),
      args: { raw: 'what quotas do I need to worry about?' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).not.toContain('what do i need');
    expect(text).toContain('Origin Pool');
  });

  test('"warning" filter renders without error (BUG-V2)', async () => {
    const messages = [];
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant: quotaTenant(),
      cache: new Cache(),
      args: { raw: 'warning' },
      formatter,
    });
    expect(messages.length).toBeGreaterThan(0);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Origin Pool');
  });

  test('falls back to CSV on invalid_blocks error (BUG-V6)', async () => {
    const messages = [];
    let callCount = 0;
    const say = (msg) => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('invalid_blocks');
        err.data = { error: 'invalid_blocks' };
        throw err;
      }
      messages.push(msg);
    };
    const mockClient = { files: { uploadV2: jest.fn().mockResolvedValue({}) } };
    await quotaCheck.handler({
      say,
      tenant: quotaTenant(),
      cache: new Cache(),
      args: { raw: '', _channelId: 'C123' },
      formatter,
      client: mockClient,
    });
    expect(mockClient.files.uploadV2).toHaveBeenCalled();
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('too large');
    expect(text).toContain('critical');
  });

  test('large dataset uses display limit and uploads CSV (BUG-V2)', async () => {
    const quotaUsage = {};
    for (let i = 0; i < 50; i++) {
      quotaUsage[`Resource_${i}`] = { limit: { maximum: 100 }, usage: { current: 90 } };
    }
    const largeTenant = mockTenant({ quota_usage: quotaUsage });
    const messages = [];
    const mockClient = { files: { uploadV2: jest.fn().mockResolvedValue({}) } };
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant: largeTenant,
      cache: new Cache(),
      args: { raw: '', _channelId: 'C123' },
      formatter,
      client: mockClient,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('showing 25 of 50');
    expect(mockClient.files.uploadV2).toHaveBeenCalled();
  });
});

describe('namespace-summary', () => {
  test('exports valid plugin contract', () => {
    expect(namespaceSummary.meta.name).toBe('namespace-summary');
  });
});

