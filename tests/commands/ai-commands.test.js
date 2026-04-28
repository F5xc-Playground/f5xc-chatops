const aiQuery = require('../../src/commands/ai-query');
const aiSuggest = require('../../src/commands/ai-suggest');
const formatter = require('../../src/core/slack-formatter');

describe('ai-query', () => {
  test('exports valid plugin contract', () => {
    expect(aiQuery.meta.name).toBe('ai-query');
    expect(aiQuery.meta.slashCommand).toBe('/xc-ask');
  });

  test('forwards query to AI assistant and formats response', async () => {
    const messages = [];
    const aiAssistant = {
      query: jest.fn().mockResolvedValue({
        query_id: 'q1',
        generic_response: { summary: 'Rate limiting helps protect your APIs.' },
        follow_up_queries: ['How do I configure rate limiting?'],
      }),
    };
    await aiQuery.handler({
      say: (msg) => messages.push(msg),
      aiAssistant,
      args: { raw: 'tell me about rate limiting', namespace: 'system' },
      formatter,
      tenant: { name: 'test', cachedWhoami: { namespace_access: { namespace_role_map: {} } } },
    });
    expect(aiAssistant.query).toHaveBeenCalledWith('system', 'tell me about rate limiting');
    const text = JSON.stringify(messages);
    expect(text).toContain('Rate limiting');
  });
});

describe('ai-suggest', () => {
  test('exports valid plugin contract', () => {
    expect(aiSuggest.meta.name).toBe('ai-suggest');
    expect(aiSuggest.meta.slashCommand).toBe('/xc-suggest');
  });
});
