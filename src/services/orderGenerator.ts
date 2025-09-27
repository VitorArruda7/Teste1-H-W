import { faker } from '@faker-js/faker';
import { ObjectId } from 'mongodb';
import logger from '../config/logger';
import { getOrdersCollection } from '../db/mongoClient';
import { config } from '../config/env';
import { GenerationMetrics, OrderDocument, OrderPriority, OrderTier } from '../types/order';
import { createTimer } from '../utils/perfTimer';

const TIERS: OrderTier[] = ['BRONZE', 'PRATA', 'OURO', 'DIAMANTE'];

const determinePriority = (tier: OrderTier): OrderPriority => (tier === 'DIAMANTE' ? 'VIP' : 'NORMAL');

export interface GenerationResult {
  metrics: GenerationMetrics;
}

export const generateOrders = async (
  processingRunId: ObjectId,
  totalOrders: number = config.orderCount,
  batchSize: number = config.orderBatchSize,
): Promise<GenerationResult> => {
  const collection = getOrdersCollection();
  const timer = createTimer();
  timer.start();

  let generated = 0;
  let vipOrders = 0;
  let normalOrders = 0;
  const startedAt = new Date();

  while (generated < totalOrders) {
    const batchCount = Math.min(batchSize, totalOrders - generated);
    const documents: OrderDocument[] = new Array(batchCount);

    for (let index = 0; index < batchCount; index += 1) {
      const tier = faker.helpers.arrayElement(TIERS);
      const priority = determinePriority(tier);
      const doc: OrderDocument = {
        _id: new ObjectId(),
        orderId: faker.string.uuid(),
        customerName: faker.person.fullName(),
        totalValue: Number(faker.finance.amount({ min: 50, max: 10000, dec: 2 })),
        tier,
        priority,
        observacoes: 'pendente de processamento',
        processingRunId,
        createdAt: new Date(),
      };

      documents[index] = doc;
      if (priority === 'VIP') {
        vipOrders += 1;
      } else {
        normalOrders += 1;
      }
    }

    await collection.insertMany(documents, { ordered: false });
    generated += batchCount;

    if (generated % (batchSize * 10) === 0) {
      logger.info({ generated }, 'Orders generated so far');
    }
  }

  const duration = timer.stop();
  const completedAt = new Date();
  logger.info({ totalOrders, vipOrders, normalOrders, duration }, 'Order generation finished');

  return {
    metrics: {
      startedAt,
      completedAt,
      durationMs: duration,
      totalOrders,
      vipOrders,
      normalOrders,
      batchSize,
    },
  };
};

