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

describe('site-status handler', () => {
  test('lists sites with status', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          items: [
            { metadata: { name: 'site-1' }, spec: { site_type: 'CUSTOMER_EDGE' }, status: { software_version: '7.2.1' } },
            { metadata: { name: 'site-2' }, spec: { site_type: 'RE' }, status: { software_version: '7.2.1' } },
          ],
        }),
      },
    };
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: {},
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('site-1');
    expect(text).toContain('site-2');
  });
});
