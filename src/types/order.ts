import { ObjectId } from 'mongodb';

export type OrderTier = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';
export type OrderPriority = 'VIP' | 'NORMAL';

export interface OrderDocument {
  _id?: ObjectId;
  orderId: string;
  customerName: string;
  totalValue: number;
  tier: OrderTier;
  priority: OrderPriority;
  observacoes: string;
  processingRunId: ObjectId;
  createdAt: Date;
  processedAt?: Date;
}

export interface ProcessingPhaseMetrics {
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
}

export interface PriorityProcessingMetrics extends ProcessingPhaseMetrics {
  processedCount: number;
}

export interface GenerationMetrics extends ProcessingPhaseMetrics {
  totalOrders: number;
  vipOrders: number;
  normalOrders: number;
  batchSize: number;
}

export interface RunLogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: unknown;
}

export type ProcessingRunStatus = 'IDLE' | 'RUNNING' | 'FAILED' | 'COMPLETED';

export interface ProcessingRunDocument {
  _id?: ObjectId;
  status: ProcessingRunStatus;
  createdAt: Date;
  updatedAt: Date;
  generation: GenerationMetrics;
  processing: {
    vip: PriorityProcessingMetrics;
    normal: PriorityProcessingMetrics;
    totalDurationMs: number | null;
  };
  totalDurationMs: number | null;
  logs: RunLogEntry[];
  failureReason?: string;
}

export interface ProcessingSummaryResponse {
  runId: string;
  status: ProcessingRunStatus;
  generation: GenerationMetrics;
  processing: {
    vip: PriorityProcessingMetrics;
    normal: PriorityProcessingMetrics;
    totalDurationMs: number | null;
  };
  totalDurationMs: number | null;
}

