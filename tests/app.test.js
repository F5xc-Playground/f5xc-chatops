const { buildConfig, validateEnv, formatApiError } = require('../src/app');

describe('validateEnv', () => {
  test('throws if F5XC_API_URL is missing', () => {
    expect(() =>
      validateEnv({ F5XC_API_TOKEN: 'x', SLACK_BOT_TOKEN: 'x', SLACK_APP_TOKEN: 'x' })
    ).toThrow('F5XC_API_URL');
  });

  test('throws if F5XC_API_TOKEN is missing', () => {
    expect(() =>
      validateEnv({ F5XC_API_URL: 'x', SLACK_BOT_TOKEN: 'x', SLACK_APP_TOKEN: 'x' })
    ).toThrow('F5XC_API_TOKEN');
  });

  test('throws if SLACK_BOT_TOKEN is missing', () => {
    expect(() =>
      validateEnv({ F5XC_API_URL: 'x', F5XC_API_TOKEN: 'x', SLACK_APP_TOKEN: 'x' })
    ).toThrow('SLACK_BOT_TOKEN');
  });

  test('throws if SLACK_APP_TOKEN is missing', () => {
    expect(() =>
      validateEnv({ F5XC_API_URL: 'x', F5XC_API_TOKEN: 'x', SLACK_BOT_TOKEN: 'x' })
    ).toThrow('SLACK_APP_TOKEN');
  });

  test('passes with all required vars', () => {
    expect(() =>
      validateEnv({
        F5XC_API_URL: 'https://test.console.ves.volterra.io',
        F5XC_API_TOKEN: 'tok',
        SLACK_BOT_TOKEN: 'xoxb-test',
        SLACK_APP_TOKEN: 'xapp-test',
      })
    ).not.toThrow();
  });
});

describe('buildConfig', () => {
  test('uses defaults for optional vars', () => {
    const config = buildConfig({
      F5XC_API_URL: 'https://test.console.ves.volterra.io',
      F5XC_API_TOKEN: 'tok',
      SLACK_BOT_TOKEN: 'xoxb-test',
      SLACK_APP_TOKEN: 'xapp-test',
    });
    expect(config.logLevel).toBe('info');
    expect(config.cacheWarmTTL).toBe(300);
    expect(config.cacheStaticTTL).toBe(3600);
    expect(config.nlpThreshold).toBe(0.75);
  });

  test('overrides defaults with env vars', () => {
    const config = buildConfig({
      F5XC_API_URL: 'https://test.console.ves.volterra.io',
      F5XC_API_TOKEN: 'tok',
      SLACK_BOT_TOKEN: 'xoxb-test',
      SLACK_APP_TOKEN: 'xapp-test',
      LOG_LEVEL: 'debug',
      CACHE_WARM_TTL: '120',
      CACHE_STATIC_TTL: '7200',
      NLP_THRESHOLD: '0.8',
      PORT: '8080',
    });
    expect(config.logLevel).toBe('debug');
    expect(config.cacheWarmTTL).toBe(120);
    expect(config.cacheStaticTTL).toBe(7200);
    expect(config.nlpThreshold).toBe(0.8);
    expect(config.port).toBe(8080);
  });
});

describe('formatApiError', () => {
  test('returns auth message for 401', () => {
    const err = new Error('test');
    err.status = 401;
    expect(formatApiError(err, 'test')).toContain('Authentication failed');
  });

  test('returns permission message for 403', () => {
    const err = new Error('test');
    err.status = 403;
    expect(formatApiError(err, 'test')).toContain('Permission denied');
  });

  test('returns not found message for 404', () => {
    const err = new Error('test');
    err.status = 404;
    expect(formatApiError(err, 'test')).toContain('not found');
  });

  test('returns server error message for 500+', () => {
    const err = new Error('test');
    err.status = 502;
    expect(formatApiError(err, 'test')).toContain('server error');
  });

  test('returns generic message for unknown errors', () => {
    const err = new Error('something broke');
    expect(formatApiError(err, 'test')).toContain('something broke');
  });
});
