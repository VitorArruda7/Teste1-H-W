import { getDb } from '../db/mongoClient';
import { getQueueConnection } from '../queues/orderQueue';

interface ComponentStatus {
  status: 'ok' | 'error' | 'not_initialized';
  latencyMs?: number;
  error?: string;
}

export interface HealthReport {
  ok: boolean;
  details: {
    mongo: ComponentStatus;
    redis: ComponentStatus;
  };
}

const now = (): number => Date.now();

const checkMongo = async (): Promise<ComponentStatus> => {
  try {
    const start = now();
    const db = getDb();
    await db.admin().command({ ping: 1 });
    return { status: 'ok', latencyMs: now() - start };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown Mongo error',
    };
  }
};

const checkRedis = async (): Promise<ComponentStatus> => {
  const connection = getQueueConnection();
  if (!connection) {
    return { status: 'not_initialized' };
  }
  try {
    const start = now();
    await connection.ping();
    return { status: 'ok', latencyMs: now() - start };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
};

export const performHealthCheck = async (): Promise<HealthReport> => {
  const [mongo, redis] = await Promise.all([checkMongo(), checkRedis()]);
  const ok = mongo.status === 'ok' && redis.status === 'ok';
  return {
    ok,
    details: {
      mongo,
      redis,
    },
  };
};
