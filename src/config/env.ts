import dotenv from 'dotenv';

dotenv.config();

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numberFromEnv(process.env.PORT, 3000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/hw_orders',
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: numberFromEnv(process.env.REDIS_PORT, 6379),
    db: numberFromEnv(process.env.REDIS_DB, 0),
  },
  orderCount: numberFromEnv(process.env.ORDER_COUNT, 1_000_000),
  orderBatchSize: numberFromEnv(process.env.ORDER_BATCH_SIZE, 10_000),
  concurrency: numberFromEnv(process.env.CONCURRENCY, 10),
};

export const isProduction = config.nodeEnv === 'production';

export const ensureConfig = (): void => {
  const missing: string[] = [];

  if (!config.mongoUri) {
    missing.push('MONGO_URI');
  }

  if (!config.redis.host) {
    missing.push('REDIS_HOST');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
