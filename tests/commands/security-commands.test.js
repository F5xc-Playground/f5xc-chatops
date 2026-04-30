const rateLimitStatus = require('../../src/commands/rate-limit-status');
const maliciousUser = require('../../src/commands/malicious-user-status');
const wafStatus = require('../../src/commands/waf-status');
const servicePolicies = require('../../src/commands/service-policies');
const botDefense = require('../../src/commands/bot-defense-status');
const apiSecurity = require('../../src/commands/api-security-status');
const securityEvent = require('../../src/commands/security-event');
const securityPosture = require('../../src/commands/security-posture');
const formatter = require('../../src/core/slack-formatter');
const { Cache } = require('../../src/core/cache');

describe('security commands plugin contracts', () => {
  test('waf-status', () => {
    expect(wafStatus.meta.name).toBe('waf-status');
    expect(wafStatus.meta.slashCommand).toBe('/xc-waf');
    expect(wafStatus.intents.length).toBeGreaterThanOrEqual(3);
  });

  test('service-policies', () => {
    expect(servicePolicies.meta.name).toBe('service-policies');
    expect(servicePolicies.meta.slashCommand).toBe('/xc-policies');
  });

  test('bot-defense-status', () => {
    expect(botDefense.meta.name).toBe('bot-defense-status');
    expect(botDefense.meta.slashCommand).toBe('/xc-bot');
  });

  test('api-security-status', () => {
    expect(apiSecurity.meta.name).toBe('api-security-status');
    expect(apiSecurity.meta.slashCommand).toBe('/xc-api-sec');
  });

  test('security-event', () => {
    expect(securityEvent.meta.name).toBe('security-event');
    expect(securityEvent.meta.slashCommand).toBe('/xc-event');
  });
});

describe('rate-limit-status', () => {
  test('exports valid plugin contract', () => {
    expect(rateLimitStatus.meta.name).toBe('rate-limit-status');
    expect(rateLimitStatus.meta.slashCommand).toBe('/xc-ratelimit');
    expect(rateLimitStatus.intents.length).toBeGreaterThanOrEqual(15);
  });

  test('shows rate limit config when present', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {
            rate_limit: {
              rate_limiter: { total_number: 100, unit: 'MINUTE' },
            },
          },
        }),
      },
    };
    await rateLimitStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Rate Limit');
    expect(text).toContain('100');
    expect(text).toContain('minute');
  });

  test('shows disabled when no rate limit configured', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {},
        }),
      },
    };
    await rateLimitStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toMatch(/no.*rate.*limit.*configured|not.*configured|disabled|none/i);
  });

  test('prompts for namespace when missing', async () => {
    const messages = [];
    const tenant = { name: 'test', namespaces: ['prod', 'staging'] };
    await rateLimitStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: {},
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('namespace');
  });

  test('prompts for LB when namespace given but no resourceName', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({ items: [{ name: 'lb-1' }, { name: 'lb-2' }] }),
      },
    };
    await rateLimitStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('lb-1');
    expect(text).toContain('lb-2');
  });
});

describe('malicious-user-status', () => {
  test('exports valid plugin contract', () => {
    expect(maliciousUser.meta.name).toBe('malicious-user-status');
    expect(maliciousUser.meta.slashCommand).toBe('/xc-maluser');
    expect(maliciousUser.intents.length).toBeGreaterThanOrEqual(15);
  });

  test('shows MUD config when enabled', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {
            enable_malicious_user_detection: {},
            enable_challenge: {
              malicious_user_mitigation: { name: 'my-mud-policy', namespace: 'prod' },
            },
          },
        }),
      },
    };
    await maliciousUser.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Malicious User');
    expect(text).toContain('my-mud-policy');
  });

  test('shows disabled when MUD not configured', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {},
        }),
      },
    };
    await maliciousUser.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toMatch(/no.*malicious.*user.*detection|not.*configured|disabled|none/i);
  });

  test('shows default mitigation when using defaults', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {
            enable_malicious_user_detection: {},
            enable_challenge: {
              default_mitigation_settings: {},
            },
          },
        }),
      },
    };
    await maliciousUser.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Default');
  });

  test('prompts for namespace when missing', async () => {
    const messages = [];
    const tenant = { name: 'test', namespaces: ['prod'] };
    await maliciousUser.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: {},
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('namespace');
  });
});

describe('security-posture', () => {
  test('exports valid plugin contract', () => {
    expect(securityPosture.meta.name).toBe('security-posture');
    expect(securityPosture.meta.slashCommand).toBe('/xc-security');
    expect(securityPosture.intents.length).toBeGreaterThanOrEqual(15);
  });

  test('shows all security controls for a fully configured LB', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {
            app_firewall: { name: 'my-waf' },
            bot_defense: { policy: {} },
            rate_limit: { rate_limiter: { total_number: 100, unit: 'SECOND' } },
            enable_malicious_user_detection: {},
            active_service_policies: { policies: [{ name: 'pol-1' }] },
            enable_api_discovery: {},
            api_specification: {},
            enable_ip_reputation: {},
            l7_ddos_protection: {},
          },
        }),
      },
    };
    await securityPosture.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('WAF');
    expect(text).toContain('my-waf');
    expect(text).toContain('Bot Defense');
    expect(text).toContain('Rate Limit');
    expect(text).toContain('100');
    expect(text).toContain('Malicious User');
    expect(text).toContain('Service Policies');
    expect(text).toContain('API Security');
    expect(text).toContain('Discovery');
    expect(text).toContain('IP Reputation');
    expect(text).toContain('DDoS');
    expect(text).toContain('8/8 controls active');
  });

  test('shows disabled controls on bare LB', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'bare-lb' },
          spec: { disable_waf: true },
        }),
      },
    };
    await securityPosture.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'bare-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('Security Posture');
    expect(text).toContain('Disabled');
    expect(text).toContain('0/8 controls active');
  });

  test('shows partial controls', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'partial-lb' },
          spec: {
            app_firewall: { name: 'basic-waf' },
            service_policies_from_namespace: {},
          },
        }),
      },
    };
    await securityPosture.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'partial-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('basic-waf');
    expect(text).toContain('From namespace');
    expect(text).toContain('2/8 controls active');
  });
});

describe('security-event handler', () => {
  test('proxies to AI assistant', async () => {
    const messages = [];
    const aiAssistant = {
      query: jest.fn().mockResolvedValue({
        query_id: 'q1',
        explain_log: { summary: 'WAF blocked a SQL injection attempt' },
        follow_up_queries: ['show more'],
      }),
    };
    await securityEvent.handler({
      say: (msg) => messages.push(msg),
      aiAssistant,
      args: { raw: 'abc-123', namespace: 'system' },
      formatter,
      cache: new Cache(),
      tenant: { name: 'test', cachedWhoami: { namespace_access: { namespace_role_map: {} } } },
    });
    expect(aiAssistant.query).toHaveBeenCalledWith('system', expect.stringContaining('abc-123'));
    expect(messages.length).toBeGreaterThan(0);
  });
});
