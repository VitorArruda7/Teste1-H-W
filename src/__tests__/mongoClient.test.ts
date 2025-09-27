import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

beforeEach(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  jest.resetModules();
});

afterEach(async () => {
  const { disconnectMongo } = await import('../db/mongoClient');
  await disconnectMongo();
  await mongoServer.stop();
});

describe('mongoClient connection helpers', () => {
  it('reuses the same connection on subsequent calls', async () => {
    const { connectMongo } = await import('../db/mongoClient');
    const first = await connectMongo();
    const second = await connectMongo();
    expect(second).toBe(first);
  });

  it('throws when getDb is called before connecting', async () => {
    const { getDb } = await import('../db/mongoClient');
    expect(() => getDb()).toThrow('Mongo database not initialized');
  });

  it('disconnects gracefully when client exists and when it is already closed', async () => {
    const { connectMongo, disconnectMongo } = await import('../db/mongoClient');
    await connectMongo();
    await disconnectMongo();
    await expect(disconnectMongo()).resolves.toBeUndefined();
  });
});
