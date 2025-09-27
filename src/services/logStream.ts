import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getRunsCollection } from '../db/mongoClient';
import logger from '../config/logger';
import { RunLogEntry } from '../types/order';

const clients = new Set<Response>();

const broadcast = (payload: unknown): void => {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => {
    client.write(data);
  });
};

export const registerLogStreamClient = (req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const flushable = res as Response & { flushHeaders?: () => void };
  flushable.flushHeaders?.();

  res.write(': connected\n\n');

  clients.add(res);
  logger.info('SSE client connected');

  req.on('close', () => {
    clients.delete(res);
    logger.info('SSE client disconnected');
  });
};

export const emitLogEntry = (entry: RunLogEntry & { runId?: string }): void => {
  broadcast(entry);
};

export const appendRunLog = async (
  runId: ObjectId,
  entry: RunLogEntry,
  persist: boolean = true,
): Promise<void> => {
  emitLogEntry({ ...entry, runId: runId.toHexString() });

  if (!persist) {
    return;
  }

  await getRunsCollection().updateOne(
    { _id: runId },
    {
      $push: {
        logs: {
          $each: [entry],
          $slice: -500,
        },
      },
      $set: { updatedAt: entry.timestamp },
    },
  );
};
