import { EventEmitter } from 'node:events';
import { OrderPriority } from '../types/order';

export interface JobCompletedPayload {
  runId: string;
  priority: OrderPriority;
  processed: number;
}

export interface JobFailedPayload {
  runId: string;
  priority: OrderPriority;
  failedCount: number;
  reason: string;
}

export type ProcessingEventMap = {
  'job:completed': JobCompletedPayload;
  'job:failed': JobFailedPayload;
};

class ProcessingEventEmitter extends EventEmitter {
  emit<E extends keyof ProcessingEventMap>(event: E, payload: ProcessingEventMap[E]): boolean {
    return super.emit(event, payload);
  }

  on<E extends keyof ProcessingEventMap>(event: E, listener: (payload: ProcessingEventMap[E]) => void): this {
    return super.on(event, listener);
  }

  once<E extends keyof ProcessingEventMap>(event: E, listener: (payload: ProcessingEventMap[E]) => void): this {
    return super.once(event, listener);
  }

  off<E extends keyof ProcessingEventMap>(event: E, listener: (payload: ProcessingEventMap[E]) => void): this {
    return super.off(event, listener);
  }
}

const processingEventEmitter = new ProcessingEventEmitter();

export default processingEventEmitter;
