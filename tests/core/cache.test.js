const { Cache } = require('../../src/core/cache');

describe('Cache', () => {
  let cache;

  beforeEach(() => {
    cache = new Cache();
  });

  test('get returns null for missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  test('set and get returns value within TTL', () => {
    cache.set('key1', { data: 'hello' }, 60);
    expect(cache.get('key1')).toEqual({ data: 'hello' });
  });

  test('get returns null for expired key', () => {
    cache.set('key1', 'value', 0);
    expect(cache.get('key1')).toBeNull();
  });

  test('invalidate removes matching keys', () => {
    cache.set('tenant1:prod:http_loadbalancers:lb1', 'a', 60);
    cache.set('tenant1:prod:http_loadbalancers:lb2', 'b', 60);
    cache.set('tenant1:staging:http_loadbalancers:lb1', 'c', 60);
    cache.invalidate('tenant1:prod:*');
    expect(cache.get('tenant1:prod:http_loadbalancers:lb1')).toBeNull();
    expect(cache.get('tenant1:prod:http_loadbalancers:lb2')).toBeNull();
    expect(cache.get('tenant1:staging:http_loadbalancers:lb1')).toEqual('c');
  });

  test('invalidate escapes special regex characters in keys', () => {
    cache.set('t1:ns:site:10.0.0.1', 'a', 60);
    cache.set('t1:ns:site:10.0.0.2', 'b', 60);
    cache.set('t1:ns:site:other', 'c', 60);
    cache.invalidate('t1:ns:site:10.0.0.*');
    expect(cache.get('t1:ns:site:10.0.0.1')).toBeNull();
    expect(cache.get('t1:ns:site:10.0.0.2')).toBeNull();
    expect(cache.get('t1:ns:site:other')).toEqual('c');
  });

  test('stats tracks hits and misses', () => {
    cache.set('key1', 'value', 60);
    cache.get('key1');
    cache.get('key1');
    cache.get('missing');
    const s = cache.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.size).toBe(1);
  });
});
