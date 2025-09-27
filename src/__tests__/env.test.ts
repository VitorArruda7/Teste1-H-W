const clearEnv = () => {
  delete process.env.PORT;
  delete process.env.NODE_ENV;
  delete process.env.MONGO_URI;
  delete process.env.REDIS_HOST;
  delete process.env.REDIS_PORT;
  delete process.env.REDIS_DB;
  delete process.env.ORDER_COUNT;
  delete process.env.ORDER_BATCH_SIZE;
  delete process.env.CONCURRENCY;
};

describe('env config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    clearEnv();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('provides sensible defaults when env vars are missing', async () => {
    const { config } = await import('../config/env');
    expect(config.port).toBe(3000);
    expect(config.mongoUri).toBe('mongodb://localhost:27017/hw_orders');
    expect(config.redis).toEqual({ host: '127.0.0.1', port: 6379, db: 0 });
    expect(config.orderCount).toBe(1_000_000);
    expect(config.orderBatchSize).toBe(10_000);
    expect(config.concurrency).toBe(10);
  });

  it('parses numeric env vars and falls back on invalid numbers', async () => {
    process.env.PORT = '4000';
    process.env.REDIS_PORT = 'zzz';
    process.env.ORDER_COUNT = 'abc';
    process.env.ORDER_BATCH_SIZE = '2500';
    process.env.CONCURRENCY = '20';

    const { config } = await import('../config/env');
    expect(config.port).toBe(4000);
    expect(config.redis.port).toBe(6379);
    expect(config.orderCount).toBe(1_000_000);
    expect(config.orderBatchSize).toBe(2500);
    expect(config.concurrency).toBe(20);
  });

  it('detects production mode', async () => {
    process.env.NODE_ENV = 'production';
    const { isProduction } = await import('../config/env');
    expect(isProduction).toBe(true);
  });

  it('ensureConfig throws when required vars missing', async () => {
    process.env.MONGO_URI = '';
    process.env.REDIS_HOST = '';
    const { ensureConfig } = await import('../config/env');
    expect(() => ensureConfig()).toThrow('Missing required environment variables: MONGO_URI, REDIS_HOST');
  });

  it('ensureConfig passes when required vars are set', async () => {
    process.env.MONGO_URI = 'mongodb://example:27017/test';
    process.env.REDIS_HOST = 'redis-service';
    const { ensureConfig } = await import('../config/env');
    expect(() => ensureConfig()).not.toThrow();
  });
});
