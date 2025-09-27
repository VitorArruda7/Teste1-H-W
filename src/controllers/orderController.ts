import { Request, Response } from 'express';
import {
  startProcessingPipeline,
  resetProcessingState,
  getLatestSummary,
} from '../services/processingManager';

export const runPipelineHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { runId } = await startProcessingPipeline();
    res.status(202).json({ message: 'Processamento iniciado', runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao iniciar processamento';
    res.status(409).json({ message });
  }
};

export const resetHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    await resetProcessingState();
    res.status(200).json({ message: 'Reset concluido' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao resetar ambiente';
    res.status(409).json({ message });
  }
};

export const summaryHandler = async (_req: Request, res: Response): Promise<void> => {
  const summary = await getLatestSummary();
  if (!summary) {
    res.status(204).send();
    return;
  }
  res.status(200).json(summary);
};

