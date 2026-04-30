const diagramLb = require('../../src/commands/diagram-lb');
const { Cache } = require('../../src/core/cache');
const formatter = require('../../src/core/slack-formatter');
const fs = require('fs');
const os = require('os');
const path = require('path');

function mockTenant(responses) {
  let callCount = 0;
  return {
    name: 'test',
    namespaces: ['prod', 'staging'],
    client: {
      get: jest.fn().mockImplementation(() => {
        const resp = Array.isArray(responses) ? responses[callCount++] : responses;
        return Promise.resolve(resp);
      }),
    },
  };
}

describe('diagram-lb', () => {
  test('exports valid plugin contract', () => {
    expect(diagramLb.meta.name).toBe('diagram-lb');
    expect(diagramLb.meta.slashCommand).toBe('/xc-diagram');
    expect(diagramLb.intents.length).toBeGreaterThanOrEqual(3);
  });

  test('buildMermaid generates inline traffic-flow diagram with resource names', () => {
    const lb = {
      metadata: { name: 'test-lb' },
      spec: {
        domains: ['app.example.com'],
        advertise_on_public_default_vip: {},
        app_firewall: { name: 'prod-waf' },
        active_service_policies: { policies: [{ name: 'block-bots' }] },
        bot_defense: { policy: { name: 'bd-standard' }, regional_endpoint: 'US' },
        client_side_defense: { policy: { name: 'csd-prod' } },
        api_protection_rules: { api_groups_rules: [{ metadata: { name: 'api-rule-1' } }] },
        enable_api_discovery: {},
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
            { public_ip: { ip: '10.0.0.1' }, site_locator: { site: { name: 'site-1' } } },
          ],
        },
      },
    };
    const mermaid = diagramLb.buildMermaid(lb, pools);
    expect(mermaid).toContain('graph TD');
    expect(mermaid).toContain('test-lb');
    expect(mermaid).toContain('Public HTTP LB');
    expect(mermaid).toContain('Domains');
    expect(mermaid).toContain('app#46;example#46;com');
    expect(mermaid).toContain('Service Policies');
    expect(mermaid).toContain('block-bots');
    expect(mermaid).toContain('Bot Defense');
    expect(mermaid).toContain('bd-standard');
    expect(mermaid).toContain('region: US');
    expect(mermaid).toContain('API Protection');
    expect(mermaid).toContain('api-rule-1');
    expect(mermaid).toContain('API Discovery');
    expect(mermaid).toContain('Client-Side Defense');
    expect(mermaid).toContain('csd-prod');
    expect(mermaid).toContain('prod-waf');
    expect(mermaid).toContain(':::waf');
    expect(mermaid).toContain('pool-1');
    expect(mermaid).toContain('10#46;0#46;0#46;1');
    expect(mermaid).toContain('public');
    expect(mermaid).toContain('site-1');

    const nodeLines = mermaid.split('\n').filter((l) => l.includes(' --> '));
    expect(nodeLines.length).toBeGreaterThanOrEqual(10);
    expect(mermaid).not.toContain('subgraph');
  });

  test('buildMermaid flags missing WAF on public LB', () => {
    const lb = {
      metadata: { name: 'no-waf-lb' },
      spec: {
        advertise_on_public_default_vip: {},
        default_route_pools: [],
        routes: [],
      },
    };
    const mermaid = diagramLb.buildMermaid(lb, {});
    expect(mermaid).toContain('WAF: NONE');
    expect(mermaid).toContain(':::wafMissing');
  });

  test('buildMermaid omits WAF warning on private LB', () => {
    const lb = {
      metadata: { name: 'private-lb' },
      spec: {
        default_route_pools: [],
        routes: [],
      },
    };
    const mermaid = diagramLb.buildMermaid(lb, {});
    expect(mermaid).not.toContain('WAF: NONE');
  });

  test('prompts for namespace when missing', async () => {
    const messages = [];
    const tenant = mockTenant({});
    await diagramLb.handler({
      say: (msg) => messages.push(msg),
      client: {},
      tenant,
      cache: new Cache(),
      args: {},
      formatter,
      diagramRenderer: {},
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('namespace');
  });

  test('prompts for LB when namespace given but no resourceName', async () => {
    const messages = [];
    const tenant = mockTenant({ items: [{ name: 'my-lb' }, { name: 'other-lb' }] });
    await diagramLb.handler({
      say: (msg) => messages.push(msg),
      client: {},
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod' },
      formatter,
      diagramRenderer: {},
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('my-lb');
    expect(text).toContain('other-lb');
  });

  test('renders diagram and uploads file when namespace and LB given', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-diagram-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, 'fake-png-data');
    try {
      const messages = [];
      const uploadMock = jest.fn().mockImplementation(({ file }) => new Promise((resolve) => {
        file.on('end', () => resolve({}));
        file.on('error', () => resolve({}));
        file.resume();
      }));
      const cleanupMock = jest.fn();
      const tenant = mockTenant({
        metadata: { name: 'test-lb' },
        spec: {
          domains: ['app.example.com'],
          advertise_on_public_default_vip: {},
          default_route_pools: [],
          routes: [],
        },
      });
      await diagramLb.handler({
        say: (msg) => messages.push(msg),
        client: { files: { uploadV2: uploadMock } },
        tenant,
        cache: new Cache(),
        args: { namespace: 'prod', resourceName: 'test-lb', _channelId: 'C123' },
        formatter,
        diagramRenderer: {
          renderToFile: jest.fn().mockResolvedValue(tmpFile),
          cleanup: cleanupMock,
        },
      });
      expect(messages[0]).toContain('Generating diagram');
      expect(uploadMock).toHaveBeenCalledTimes(1);
      expect(cleanupMock).toHaveBeenCalledWith(tmpFile);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  test('shows error when render fails', async () => {
    const messages = [];
    const tenant = mockTenant({
      metadata: { name: 'test-lb' },
      spec: { default_route_pools: [], routes: [] },
    });
    await diagramLb.handler({
      say: (msg) => messages.push(msg),
      client: { files: { uploadV2: jest.fn() } },
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'test-lb', _channelId: 'C123' },
      formatter,
      diagramRenderer: {
        renderToFile: jest.fn().mockRejectedValue(new Error('Chromium not found')),
        cleanup: jest.fn(),
      },
    });
    const text = JSON.stringify(messages);
    expect(text).toContain('Diagram render failed');
    expect(text).toContain('Chromium not found');
  });

  test('shows error when file upload fails', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-diagram-upload-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, 'fake-png-data');
    try {
      const messages = [];
      const cleanupMock = jest.fn();
      const tenant = mockTenant({
        metadata: { name: 'test-lb' },
        spec: { default_route_pools: [], routes: [] },
      });
      await diagramLb.handler({
        say: (msg) => messages.push(msg),
        client: { files: { uploadV2: jest.fn().mockImplementation(({ file }) => new Promise((_, reject) => {
          file.on('end', () => reject(new Error('not_allowed_token_type')));
          file.on('error', () => reject(new Error('not_allowed_token_type')));
          file.resume();
        })) } },
        tenant,
        cache: new Cache(),
        args: { namespace: 'prod', resourceName: 'test-lb', _channelId: 'C123' },
        formatter,
        diagramRenderer: {
          renderToFile: jest.fn().mockResolvedValue(tmpFile),
          cleanup: cleanupMock,
        },
      });
      const text = JSON.stringify(messages);
      expect(text).toContain('Diagram render failed');
      expect(cleanupMock).toHaveBeenCalled();
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
