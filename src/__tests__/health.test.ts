import express from 'express';
import request from 'supertest';
import type { Request } from 'express';
import { healthHandler } from '../controllers/healthController';
import { performHealthCheck } from '../services/health';
import { getDb } from '../db/mongoClient';
import { getQueueConnection } from '../queues/orderQueue';

jest.mock('../db/mongoClient', () => ({
  getDb: jest.fn(),
}));

jest.mock('../queues/orderQueue', () => ({
  getQueueConnection: jest.fn(),
}));

describe('health service', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedGetQueueConnection = getQueueConnection as jest.MockedFunction<
    typeof getQueueConnection
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ok when dependencies respond', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });
    mockedGetDb.mockReturnValue({ admin: () => ({ command }) } as never);
    const ping = jest.fn().mockResolvedValue('PONG');
    mockedGetQueueConnection.mockReturnValue({ ping } as never);

    const report = await performHealthCheck();

    expect(report.ok).toBe(true);
    expect(report.details.mongo.status).toBe('ok');
    expect(report.details.redis.status).toBe('ok');
  });

  it('flags degraded status when errors happen', async () => {
    mockedGetDb.mockImplementation(() => {
      throw new Error('mongo down');
    });
    const ping = jest.fn().mockRejectedValue(new Error('redis down'));
    mockedGetQueueConnection.mockReturnValue({ ping } as never);

    const report = await performHealthCheck();
    expect(report.ok).toBe(false);
    expect(report.details.mongo.status).toBe('error');
    expect(report.details.redis.status).toBe('error');
  });

  it('returns not_initialized when redis connection is missing', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });
    mockedGetDb.mockReturnValue({ admin: () => ({ command }) } as never);
    mockedGetQueueConnection.mockReturnValue(null as never);

    const report = await performHealthCheck();

    expect(report.ok).toBe(false);
    expect(report.details.redis.status).toBe('not_initialized');
  });

  it('handles unknown error types gracefully', async () => {
    mockedGetDb.mockImplementation(() => {
      throw 'mongo string failure';
    });
    const ping = jest.fn().mockRejectedValue('redis string failure');
    mockedGetQueueConnection.mockReturnValue({ ping } as never);

    const report = await performHealthCheck();

    expect(report.ok).toBe(false);
    expect(report.details.mongo.error).toBe('Unknown Mongo error');
    expect(report.details.redis.error).toBe('Unknown Redis error');
  });

  it('health handler responds with correct status code', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });
    mockedGetDb.mockReturnValue({ admin: () => ({ command }) } as never);
    const ping = jest.fn().mockResolvedValue('PONG');
    mockedGetQueueConnection.mockReturnValue({ ping } as never);

    const app = express();
    app.get('/health', (req, res) => void healthHandler(req as Request, res));

    const response = await request(app).get('/health');
    const payload = response.body as {
      status: string;
      details: {
        mongo: { status: string };
        redis: { status: string };
      };
    };
    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.details.mongo.status).toBeDefined();
    expect(payload.details.redis.status).toBeDefined();
  });
});
