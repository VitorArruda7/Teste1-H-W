import app from './app';
import { config, ensureConfig } from './config/env';
import logger from './config/logger';
import { connectMongo, disconnectMongo } from './db/mongoClient';
import { initializeQueues, shutdownQueues } from './queues/orderQueue';

const startServer = async (): Promise<void> => {
  try {
    ensureConfig();
    await connectMongo();
    await initializeQueues();

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Server listening');
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

void startServer();

const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Received shutdown signal');
  await shutdownQueues();
  await disconnectMongo();
  process.exit(0);
};

['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
});
