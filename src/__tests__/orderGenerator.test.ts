import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import type { Collection } from 'mongodb';
import type { OrderDocument } from '../types/order';

let mongoServer: MongoMemoryServer;
let connectMongo: () => Promise<unknown>;
let disconnectMongo: () => Promise<void>;
let getOrdersCollection: () => Collection<OrderDocument>;
let generateOrders: typeof import('../services/orderGenerator').generateOrders;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  jest.resetModules();
  ({ connectMongo, disconnectMongo, getOrdersCollection } = await import('../db/mongoClient'));
  ({ generateOrders } = await import('../services/orderGenerator'));
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
  await mongoServer.stop();
});

describe('generateOrders', () => {
  it('inserts the expected amount of orders and computes metrics', async () => {
    const runId = new ObjectId();
    const totalOrders = 1000;
    const batchSize = 200;

    const { metrics } = await generateOrders(runId, totalOrders, batchSize);
    expect(metrics.totalOrders).toBe(totalOrders);
    expect(metrics.vipOrders + metrics.normalOrders).toBe(totalOrders);
    expect(metrics.batchSize).toBe(batchSize);

    const collection = getOrdersCollection();
    const documents = await collection.find({ processingRunId: runId }).toArray();
    expect(documents).toHaveLength(totalOrders);
    expect(documents.filter((doc) => doc.priority === 'VIP').length).toBe(metrics.vipOrders);
    expect(documents.filter((doc) => doc.priority === 'NORMAL').length).toBe(metrics.normalOrders);
  });
});
