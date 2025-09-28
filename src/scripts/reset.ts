import logger from '../config/logger';
import { connectMongo, disconnectMongo } from '../db/mongoClient';
import { initializeQueues, shutdownQueues } from '../queues/orderQueue';
import { resetProcessingState } from '../services/processingManager';

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const main = async (): Promise<void> => {
  try {
    await connectMongo();
    await initializeQueues();
    await resetProcessingState();
    logger.info('Reset script completed successfully');
  } finally {
    await shutdownQueues().catch((error: unknown) => {
      const err = toError(error);
      logger.warn({ err }, 'Failed to shutdown queues during reset script');
    });
    await disconnectMongo().catch((error: unknown) => {
      const err = toError(error);
      logger.warn({ err }, 'Failed to disconnect Mongo during reset script');
    });
  }
};

void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const err = toError(error);
    logger.error({ err }, 'Reset script failed');
    process.exit(1);
  });
