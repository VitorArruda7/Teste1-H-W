import { Request, Response } from 'express';
import { performHealthCheck } from '../services/health';

export const healthHandler = async (_req: Request, res: Response): Promise<void> => {
  const report = await performHealthCheck();
  const statusCode = report.ok ? 200 : 503;
  res.status(statusCode).json({
    status: report.ok ? 'ok' : 'degraded',
    details: report.details,
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};
