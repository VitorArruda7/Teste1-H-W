import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env';
import logger from '../config/logger';
import { OrderJobData } from '../types/jobs';
import processingEvents from '../services/eventBus';
import {
  recordQueueCounts,
  recordStalledJob,
  startQueueCollector,
  stopQueueCollector,
} from '../services/metrics';
import { createOrderWorkerProcessor } from '../workers/orderWorker';

const QUEUE_NAME = 'order-processing';

let connection: IORedis | null = null;
let queue: Queue<OrderJobData> | null = null;
let worker: Worker<OrderJobData> | null = null;
let queueEvents: QueueEvents | null = null;

export const initializeQueues = async (): Promise<void> => {
  if (queue) {
    return;
  }

  connection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db,
    maxRetriesPerRequest: null,
  });

  queue = new Queue<OrderJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
  startQueueCollector(async () => {
    if (!queue) {
      return { waiting: 0, active: 0, delayed: 0, failed: 0 };
    }
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  });

  queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  await queueEvents.waitUntilReady();
  void queue
    .getJobCounts('waiting', 'active', 'delayed', 'failed')
    .then(recordQueueCounts)
    .catch(() => {});

  worker = new Worker<OrderJobData>(QUEUE_NAME, createOrderWorkerProcessor(), {
    connection,
    concurrency: config.concurrency,
  });

  queue.on('error', (error) => {
    logger.error({ err: error }, 'Queue experienced an unexpected error');
  });

  worker.on('error', (error) => {
    logger.error({ err: error }, 'Unexpected worker error');
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error({ jobId, failedReason }, 'Job failed');
  });

  queueEvents.on('stalled', ({ jobId }) => {
    recordStalledJob();
    logger.warn({ jobId }, 'Job stalled and has been restarted');
  });

  processingEvents.on('job:failed', ({ runId, priority, reason }) => {
    logger.warn({ runId, priority, reason }, 'Job reported failure');
  });

  logger.info('Queue infrastructure initialized');
};

export const getOrderQueue = (): Queue<OrderJobData> => {
  if (!queue) {
    throw new Error('Queue not initialized');
  }
  return queue;
};

export const getOrderQueueEvents = (): QueueEvents => {
  if (!queueEvents) {
    throw new Error('Queue events not initialized');
  }
  return queueEvents;
};

export const shutdownQueues = async (): Promise<void> => {
  stopQueueCollector();

  await Promise.all([
    worker?.close(true) ?? Promise.resolve(),
    queue?.close() ?? Promise.resolve(),
    queueEvents?.close() ?? Promise.resolve(),
  ]);

  if (connection) {
    await connection.quit();
    connection = null;
  }

  queue = null;
  worker = null;
  queueEvents = null;
  logger.info('Queue infrastructure shutdown complete');
};

export const getQueueConnection = (): IORedis | null => connection;
