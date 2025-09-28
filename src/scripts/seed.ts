import logger from '../config/logger';
import { config } from '../config/env';
import { connectMongo, disconnectMongo } from '../db/mongoClient';
import { initializeQueues, shutdownQueues } from '../queues/orderQueue';
import { getLatestSummary, startProcessingPipeline } from '../services/processingManager';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const SEED_ORDER_COUNT = Number(process.env.SEED_ORDER_COUNT ?? '10000');
const SEED_ORDER_BATCH_SIZE = Number(process.env.SEED_ORDER_BATCH_SIZE ?? '1000');
const POLL_INTERVAL_MS = Number(process.env.SEED_POLL_INTERVAL_MS ?? '5000');

const overrideRuntimeConfig = (): void => {
  config.orderCount = Math.max(1, SEED_ORDER_COUNT);
  config.orderBatchSize = Math.max(1, Math.min(config.orderBatchSize, SEED_ORDER_BATCH_SIZE));
};

const waitForCompletion = async (runId: string): Promise<void> => {
  let running = true;
  while (running) {
    const summary = await getLatestSummary();
    if (summary && summary.runId === runId && summary.status !== 'RUNNING') {
      logger.info({ runId, status: summary.status }, 'Seed pipeline finished');
      if (summary.status !== 'COMPLETED') {
        throw new Error(`Seed pipeline ended with status ${summary.status}`);
      }
      running = false;
    } else {
      await sleep(POLL_INTERVAL_MS);
    }
  }
};

const main = async (): Promise<void> => {
  overrideRuntimeConfig();
  await connectMongo();
  await initializeQueues();
  const { runId } = await startProcessingPipeline();
  logger.info({ runId, orderCount: config.orderCount }, 'Seed pipeline started');
  await waitForCompletion(runId);
};

void main()
  .then(async () => {
    await shutdownQueues();
    await disconnectMongo();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: toError(error) }, 'Seed script failed');
    await shutdownQueues().catch((shutdownError) => {
      logger.warn({ err: toError(shutdownError) }, 'Failed to shutdown queues during seed cleanup');
    });
    await disconnectMongo().catch((disconnectError) => {
      logger.warn(
        { err: toError(disconnectError) },
        'Failed to disconnect Mongo during seed cleanup',
      );
    });
    process.exit(1);
  });
