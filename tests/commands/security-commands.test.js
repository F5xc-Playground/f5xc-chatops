const wafStatus = require('../../src/commands/waf-status');
const servicePolicies = require('../../src/commands/service-policies');
const botDefense = require('../../src/commands/bot-defense-status');
const apiSecurity = require('../../src/commands/api-security-status');
const securityEvent = require('../../src/commands/security-event');
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
