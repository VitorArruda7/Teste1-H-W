import { Job } from 'bullmq';
import { ObjectId } from 'mongodb';
import logger from '../config/logger';
import { getOrdersCollection, getRunsCollection } from '../db/mongoClient';
import { OrderJobData } from '../types/jobs';
import processingEvents from '../services/eventBus';

export const createOrderWorkerProcessor = () =>
  async (job: Job<OrderJobData>): Promise<void> => {
    const { runId, priority, orderIds } = job.data;
    const runObjectId = new ObjectId(runId);
    const ordersCollection = getOrdersCollection();
    const runsCollection = getRunsCollection();
    const finishedOn = new Date();
    const startedOn = job.processedOn ? new Date(job.processedOn) : finishedOn;

    try {
      const objectIds = orderIds.map((id) => new ObjectId(id));

      const updateResult = await ordersCollection.updateMany(
        {
          _id: { $in: objectIds },
          processingRunId: runObjectId,
        },
        {
          $set: {
            processedAt: finishedOn,
            observacoes: priority === 'VIP' ? 'enviado com prioridade' : 'processado sem prioridade',
          },
        },
      );

      const processedCount = updateResult.modifiedCount;
      const priorityKey = priority === 'VIP' ? 'vip' : 'normal';

      await runsCollection.updateOne(
        { _id: runObjectId },
        [
          {
            $set: {
              updatedAt: finishedOn,
              [`processing.${priorityKey}.startedAt`]: {
                $ifNull: [`$processing.${priorityKey}.startedAt`, startedOn],
              },
              [`processing.${priorityKey}.completedAt`]: finishedOn,
              [`processing.${priorityKey}.processedCount`]: {
                $add: [`$processing.${priorityKey}.processedCount`, processedCount],
              },
            },
          },
        ],
      );

      processingEvents.emit('job:completed', { runId, priority, processed: processedCount });
      logger.debug({ runId, priority, processedCount, jobId: job.id }, 'Processed order batch');
    } catch (error) {
      processingEvents.emit('job:failed', {
        runId,
        priority,
        failedCount: orderIds.length,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      logger.error({ err: error, runId, priority, jobId: job.id }, 'Failed to process order batch');
      throw error;
    }
  };
