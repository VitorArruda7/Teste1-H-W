import { Collection, Db, MongoClient } from 'mongodb';
import { config } from '../config/env';
import logger from '../config/logger';
import { OrderDocument, ProcessingRunDocument } from '../types/order';

let client: MongoClient | null = null;
let database: Db | null = null;

export const connectMongo = async (): Promise<Db> => {
  if (database) {
    return database;
  }

  const mongoClient = new MongoClient(config.mongoUri);
  client = mongoClient;
  await mongoClient.connect();
  database = mongoClient.db();
  logger.info({ mongoUri: config.mongoUri }, 'Connected to MongoDB');
  await database.collection<OrderDocument>('orders').createIndexes([
    {
      key: { priority: 1 },
      name: 'idx_priority',
    },
    {
      key: { tier: 1 },
      name: 'idx_tier',
    },
    {
      key: { processedAt: 1 },
      name: 'idx_processedAt',
    },
  ]);

  await database.collection<ProcessingRunDocument>('processing_runs').createIndexes([
    {
      key: { createdAt: -1 },
      name: 'idx_createdAt_desc',
    },
  ]);

  return database;
};

export const getDb = (): Db => {
  if (!database) {
    throw new Error('Mongo database not initialized');
  }

  return database;
};

export const getOrdersCollection = (): Collection<OrderDocument> => getDb().collection('orders');

export const getRunsCollection = (): Collection<ProcessingRunDocument> =>
  getDb().collection('processing_runs');

export const disconnectMongo = async (): Promise<void> => {
  if (client) {
    await client.close();
    client = null;
    database = null;
    logger.info('Disconnected from MongoDB');
  }
};
