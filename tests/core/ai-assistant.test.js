const nock = require('nock');
const { AIAssistant } = require('../../src/core/ai-assistant');
const { XCClient } = require('../../src/core/xc-client');

const TENANT_URL = 'https://test-tenant.console.ves.volterra.io';

describe('AIAssistant', () => {
  let assistant;

  beforeEach(() => {
    const client = new XCClient(TENANT_URL, 'test-token');
    assistant = new AIAssistant(client);
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  test('query sends current_query and namespace', async () => {
    const scope = nock(TENANT_URL)
      .post('/api/gen-ai/namespaces/system/query', {
        current_query: 'explain event abc',
        namespace: 'system',
      })
      .reply(200, {
        query_id: 'q1',
        explain_log: { summary: 'WAF blocked request' },
        follow_up_queries: ['show more details'],
      });

    const result = await assistant.query('system', 'explain event abc');
    expect(result.query_id).toBe('q1');
    expect(result.explain_log.summary).toBe('WAF blocked request');
    expect(result.follow_up_queries).toEqual(['show more details']);
    scope.done();
  });

  test('feedback sends positive feedback', async () => {
    const scope = nock(TENANT_URL)
      .post('/api/gen-ai/namespaces/system/query_feedback', {
        namespace: 'system',
        query_id: 'q1',
        query: 'explain event abc',
        positive_feedback: {},
      })
      .reply(200, {});

    await assistant.feedback('system', 'q1', 'explain event abc', true);
    scope.done();
  });

  test('feedback sends negative feedback with remark', async () => {
    const scope = nock(TENANT_URL)
      .post('/api/gen-ai/namespaces/system/query_feedback', {
        namespace: 'system',
        query_id: 'q1',
        query: 'explain event abc',
        negative_feedback: { remarks: ['INACCURATE_DATA'] },
      })
      .reply(200, {});

    await assistant.feedback('system', 'q1', 'explain event abc', false, 'INACCURATE_DATA');
    scope.done();
  });
});
