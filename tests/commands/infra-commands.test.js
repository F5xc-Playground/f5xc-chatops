const siteStatus = require('../../src/commands/site-status');
const siteDetail = require('../../src/commands/site-detail');
const dnsStatus = require('../../src/commands/dns-status');
const alertStatus = require('../../src/commands/alert-status');
const formatter = require('../../src/core/slack-formatter');
const { Cache } = require('../../src/core/cache');

describe('infra commands plugin contracts', () => {
  test('site-status', () => {
    expect(siteStatus.meta.name).toBe('site-status');
    expect(siteStatus.meta.slashCommand).toBe('/xc-sites');
    expect(siteStatus.intents.length).toBeGreaterThanOrEqual(3);
  });

  test('site-detail', () => {
    expect(siteDetail.meta.name).toBe('site-detail');
    expect(siteDetail.meta.slashCommand).toBe('/xc-site');
  });

  test('dns-status', () => {
    expect(dnsStatus.meta.name).toBe('dns-status');
    expect(dnsStatus.meta.slashCommand).toBe('/xc-dns');
  });

  test('alert-status', () => {
    expect(alertStatus.meta.name).toBe('alert-status');
    expect(alertStatus.meta.slashCommand).toBe('/xc-alerts');
  });
});

describe('alert-status handler', () => {
  test('shows active alerts sorted by severity', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          alerts: [
            { labels: { alertname: 'LowDisk', severity: 'warning', namespace: 'prod' }, annotations: { summary: 'Disk usage high' } },
            { labels: { alertname: 'SiteDown', severity: 'critical', namespace: 'prod' }, annotations: { summary: 'Site unreachable' } },
          ],
        }),
      },
    };
    await alertStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('SiteDown');
    expect(text).toContain('LowDisk');
    expect(text.indexOf('SiteDown')).toBeLessThan(text.indexOf('LowDisk'));
  });

  test('shows green message when no alerts', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: { get: jest.fn().mockResolvedValue({ alerts: [] }) },
    };
    await alertStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('No active alerts');
  });

  test('queries all namespaces when no namespace given', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: { get: jest.fn().mockResolvedValue({ alerts: [] }) },
    };
    await alertStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: {},
      formatter,
    });
    expect(tenant.client.get).toHaveBeenCalledWith('/api/data/namespaces/system/all_ns_alerts');
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('all namespaces');
  });
});

describe('site-status handler', () => {
  function makeSiteTenant(sites) {
    return {
      name: 'test',
      client: {
        get: jest.fn().mockImplementation((path) => {
          if (path.endsWith('/sites')) {
            return Promise.resolve({ items: sites });
          }
          const name = path.split('/').pop();
          const site = sites.find((s) => (s.metadata?.name || s.name) === name);
          return Promise.resolve(site || { metadata: { name }, spec: {} });
        }),
      },
    };
  }

  const defaultSites = [
    { metadata: { name: 'site-1' }, labels: { 'ves.io/siteType': 'ves-io-ce' }, status: { connected_state: 'ONLINE' } },
    { metadata: { name: 'site-2' }, labels: { 'ves.io/siteType': 'ves-io-re' }, status: { connected_state: 'ONLINE' } },
  ];

  test('lists CE sites by default', async () => {
    const messages = [];
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant: makeSiteTenant(defaultSites),
      cache: new Cache(),
      args: { raw: '' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('site-1');
    expect(text).not.toContain('site-2');
    expect(text).toContain('Customer Edge');
  });

  test('delegates to site-detail when arg is a single site name (slash command)', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockImplementation((path) => {
          if (path.includes('/sites/my-site')) {
            return Promise.resolve({
              metadata: { name: 'my-site' },
              spec: { site_type: 'CE' },
              status: { connected_state: 'ONLINE' },
            });
          }
          return Promise.resolve({ items: [] });
        }),
      },
    };
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { raw: 'my-site', resourceName: null },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('my-site');
    expect(text).toContain('Site:');
  });

  test('NLP "show me all sites" stays in site-status, not delegated (BUG-V4)', async () => {
    const messages = [];
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant: makeSiteTenant(defaultSites),
      cache: new Cache(),
      args: { raw: 'show me all sites', resourceName: null },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('All Sites');
    expect(text).toContain('site-1');
    expect(text).toContain('site-2');
    expect(text).not.toContain('not found');
  });

  test('NLP "show CE sites" stays in site-status (BUG-V4)', async () => {
    const messages = [];
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant: makeSiteTenant(defaultSites),
      cache: new Cache(),
      args: { raw: 'show CE sites', resourceName: null },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Customer Edge');
    expect(text).toContain('site-1');
    expect(text).not.toContain('not found');
  });

  test('NLP "show me customer edge sites" detects CE mode', async () => {
    const messages = [];
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant: makeSiteTenant(defaultSites),
      cache: new Cache(),
      args: { raw: 'show me customer edge sites', resourceName: null },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Customer Edge');
  });

  test('lists all sites with "all" filter', async () => {
    const messages = [];
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant: makeSiteTenant(defaultSites),
      cache: new Cache(),
      args: { raw: 'all' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('site-1');
    expect(text).toContain('site-2');
    expect(text).toContain('All Sites');
  });

  test('lists RE sites with "re" filter', async () => {
    const messages = [];
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant: makeSiteTenant(defaultSites),
      cache: new Cache(),
      args: { raw: 're' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Regional Edge');
    expect(text).toContain('site-2');
    expect(text).not.toContain('site-1');
  });

  test('count summary uses actual counts, not display length (BUG-V8)', async () => {
    const manySites = [];
    for (let i = 0; i < 35; i++) {
      manySites.push({
        metadata: { name: `re-site-${i}` },
        labels: { 'ves.io/siteType': 'ves-io-re' },
        status: { connected_state: 'ONLINE' },
      });
    }
    manySites.push({
      metadata: { name: 'ce-site-0' },
      labels: { 'ves.io/siteType': 'ves-io-ce' },
      status: { connected_state: 'ONLINE' },
    });
    const messages = [];
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant: makeSiteTenant(manySites),
      cache: new Cache(),
      args: { raw: 're' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('35 Regional Edge sites');
    expect(text).toContain('showing 30');
  });

  test('"all" mode total equals CE + RE + other (BUG-V8)', async () => {
    const mixedSites = [
      { metadata: { name: 'ce-1' }, labels: { 'ves.io/siteType': 'ves-io-ce' } },
      { metadata: { name: 're-1' }, labels: { 'ves.io/siteType': 'ves-io-re' } },
      { metadata: { name: 'unknown-1' }, labels: { 'ves.io/siteType': 'other' } },
    ];
    const messages = [];
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant: makeSiteTenant(mixedSites),
      cache: new Cache(),
      args: { raw: 'all' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('3 sites');
    expect(text).toContain('1 CE');
    expect(text).toContain('1 RE');
    expect(text).toContain('1 other');
  });
});
