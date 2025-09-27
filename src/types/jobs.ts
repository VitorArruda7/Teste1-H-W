import { OrderPriority } from './order';

export interface OrderJobData {
  runId: string;
  priority: OrderPriority;
  orderIds: string[];
}
