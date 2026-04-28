const nock = require('nock');
const { XCClient, createTenantProfile } = require('../../src/core/xc-client');

const TENANT_URL = 'https://test-tenant.console.ves.volterra.io';

describe('createTenantProfile', () => {
  test('creates profile from url and token', () => {
    const profile = createTenantProfile({
      apiUrl: TENANT_URL,
      apiToken: 'test-token',
    });
    expect(profile.name).toBe('test-tenant');
    expect(profile.apiUrl).toBe(TENANT_URL);
    expect(profile.apiToken).toBe('test-token');
    expect(profile.client).toBeInstanceOf(XCClient);
  });
});

describe('XCClient', () => {
  let client;

  beforeEach(() => {
    client = new XCClient(TENANT_URL, 'test-token');
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  test('GET sends auth header and returns data', async () => {
    const scope = nock(TENANT_URL)
      .get('/api/config/namespaces/prod/http_loadbalancers')
      .matchHeader('Authorization', 'APIToken test-token')
      .reply(200, { items: ['lb1', 'lb2'] });

    const result = await client.get('/api/config/namespaces/prod/http_loadbalancers');
    expect(result).toEqual({ items: ['lb1', 'lb2'] });
    scope.done();
  });

  test('POST sends body and auth header', async () => {
    const body = { current_query: 'test', namespace: 'system' };
    const scope = nock(TENANT_URL)
      .post('/api/gen-ai/namespaces/system/query', body)
      .matchHeader('Authorization', 'APIToken test-token')
      .matchHeader('Content-Type', 'application/json')
      .reply(200, { query_id: 'abc' });

    const result = await client.post('/api/gen-ai/namespaces/system/query', body);
    expect(result).toEqual({ query_id: 'abc' });
    scope.done();
  });

  test('retries on 429 with backoff', async () => {
    const scope = nock(TENANT_URL)
      .get('/api/test')
      .reply(429)
      .get('/api/test')
      .reply(200, { ok: true });

    const result = await client.get('/api/test');
    expect(result).toEqual({ ok: true });
    scope.done();
  });

  test('retries on 503', async () => {
    const scope = nock(TENANT_URL)
      .get('/api/test')
      .reply(503)
      .get('/api/test')
      .reply(200, { ok: true });

    const result = await client.get('/api/test');
    expect(result).toEqual({ ok: true });
    scope.done();
  });

  test('throws after max retries', async () => {
    nock(TENANT_URL)
      .get('/api/test')
      .reply(429)
      .get('/api/test')
      .reply(429)
      .get('/api/test')
      .reply(429);

    await expect(client.get('/api/test')).rejects.toThrow('429');
  });

  test('throws immediately on 401', async () => {
    nock(TENANT_URL)
      .get('/api/test')
      .reply(401, { message: 'unauthorized' });

    await expect(client.get('/api/test')).rejects.toThrow('401');
  });

  test('throws immediately on 404', async () => {
    nock(TENANT_URL)
      .get('/api/test')
      .reply(404, { message: 'not found' });

    await expect(client.get('/api/test')).rejects.toThrow('404');
  });
});
