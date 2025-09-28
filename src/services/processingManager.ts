import { ObjectId } from 'mongodb';

import { config } from '../config/env';

import logger from '../config/logger';

import { getOrdersCollection, getRunsCollection } from '../db/mongoClient';

import { getOrderQueue } from '../queues/orderQueue';

import { GenerationResult, generateOrders } from './orderGenerator';

import processingEvents from './eventBus';

import { appendRunLog } from './logStream';
import {
  recordGenerationMetrics,
  recordPriorityMetrics,
  recordRunCompleted,
  recordRunFailed,
  recordRunStarted,
} from './metrics';

import {
  OrderPriority,
  ProcessingRunDocument,
  ProcessingSummaryResponse,
  PriorityProcessingMetrics,
  RunLogEntry,
} from '../types/order';

import { createTimer } from '../utils/perfTimer';

import { OrderJobData } from '../types/jobs';

interface ActiveRunState {
  runId: ObjectId | null;

  promise: Promise<void> | null;
}

const activeRun: ActiveRunState = {
  runId: null,

  promise: null,
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const createLogEntry = (
  level: RunLogEntry['level'],
  message: string,
  context?: unknown,
): RunLogEntry => ({
  level,

  message,

  context,

  timestamp: new Date(),
});

const waitForPriorityCompletion = (
  runId: string,

  priority: OrderPriority,

  expectedCount: number,
): Promise<void> => {
  if (expectedCount === 0) {
    return Promise.resolve();
  }

  let processed = 0;

  return new Promise<void>((resolve, reject) => {
    const handleCompleted = ({
      runId: eventRunId,
      priority: eventPriority,
      processed: count,
    }: {
      runId: string;

      priority: OrderPriority;

      processed: number;
    }) => {
      if (eventRunId !== runId || eventPriority !== priority) {
        return;
      }

      processed += count;

      if (processed >= expectedCount) {
        processingEvents.off('job:completed', handleCompleted as never);

        processingEvents.off('job:failed', handleFailed as never);

        resolve();
      }
    };

    const handleFailed = ({
      runId: eventRunId,
      priority: eventPriority,
      reason,
    }: {
      runId: string;

      priority: OrderPriority;

      reason: string;
    }) => {
      if (eventRunId !== runId || eventPriority !== priority) {
        return;
      }

      processingEvents.off('job:completed', handleCompleted as never);

      processingEvents.off('job:failed', handleFailed as never);

      reject(new Error(reason));
    };

    processingEvents.on('job:completed', handleCompleted as never);

    processingEvents.on('job:failed', handleFailed as never);
  });
};

interface EnqueueResult {
  totalOrders: number;

  jobCount: number;
}

const enqueueOrdersForPriority = async (
  runId: ObjectId,

  priority: OrderPriority,

  batchSize: number,
): Promise<EnqueueResult> => {
  const ordersCollection = getOrdersCollection();

  const queue = getOrderQueue();

  const cursor = ordersCollection.find(
    { processingRunId: runId, priority },

    {
      projection: { _id: 1 },

      batchSize,
    },
  );

  const runIdHex = runId.toHexString();

  const jobPriority = priority === 'VIP' ? 1 : 5;

  const queueFlushSize = 50;

  const jobsBuffer: {
    name: string;
    data: OrderJobData;
    opts: { priority: number; removeOnComplete: boolean };
  }[] = [];

  let totalQueued = 0;

  let jobCount = 0;

  let jobSequence = 0;

  let orderBuffer: string[] = [];

  const enqueueJob = (orders: string[]) => {
    if (orders.length === 0) {
      return;
    }

    jobsBuffer.push({
      name: `process-${priority.toLowerCase()}-${jobSequence}`,

      data: {
        runId: runIdHex,

        priority,

        orderIds: orders,
      },

      opts: { priority: jobPriority, removeOnComplete: true },
    });

    jobSequence += 1;

    jobCount += 1;
  };

  const flushQueueJobs = async (force = false): Promise<void> => {
    if (jobsBuffer.length === 0) {
      return;
    }

    if (!force && jobsBuffer.length < queueFlushSize) {
      return;
    }

    await queue.addBulk(jobsBuffer);

    jobsBuffer.length = 0;
  };

  for await (const doc of cursor) {
    orderBuffer.push(doc._id.toHexString());

    if (orderBuffer.length >= batchSize) {
      const orders = [...orderBuffer];

      enqueueJob(orders);

      totalQueued += orders.length;

      orderBuffer = [];

      await flushQueueJobs();
    }
  }

  if (orderBuffer.length > 0) {
    const remainingOrders = [...orderBuffer];

    enqueueJob(remainingOrders);

    totalQueued += remainingOrders.length;

    orderBuffer = [];
  }

  await flushQueueJobs(true);

  logger.info(
    { runId: runIdHex, priority, jobs: jobCount, orders: totalQueued },
    'Jobs enfileirados',
  );

  return {
    totalOrders: totalQueued,

    jobCount,
  };
};

const finalizePriorityMetrics = async (
  runId: ObjectId,

  priority: OrderPriority,
): Promise<PriorityProcessingMetrics | null> => {
  const runsCollection = getRunsCollection();

  const priorityKey = priority === 'VIP' ? 'vip' : 'normal';

  const runDoc = (await runsCollection.findOne(
    { _id: runId },

    { projection: { [`processing.${priorityKey}`]: 1 } },
  )) as (ProcessingRunDocument & { _id: ObjectId }) | null;

  const metrics = runDoc?.processing?.[priorityKey];

  if (!metrics) {
    return null;
  }

  let duration = metrics.durationMs ?? null;

  if (metrics.startedAt && metrics.completedAt) {
    duration = metrics.completedAt.getTime() - metrics.startedAt.getTime();

    await runsCollection.updateOne(
      { _id: runId },

      {
        $set: {
          [`processing.${priorityKey}.durationMs`]: duration,

          updatedAt: new Date(),
        },
      },
    );
  }

  return {
    ...metrics,

    durationMs: duration,
  };
};

const executeRun = async (runId: ObjectId): Promise<void> => {
  const runsCollection = getRunsCollection();
  const { orderBatchSize, orderCount } = config;
  const runIdHex = runId.toHexString();
  const runTimer = createTimer();
  runTimer.start();
  let currentPhase = 'initialization';
  try {
    currentPhase = 'generation';
    const generationLog = createLogEntry('info', 'Iniciando geracao de pedidos', {
      totalOrders: orderCount,
      batchSize: orderBatchSize,
    });
    await appendRunLog(runId, generationLog);
    logger.info({ runId: runIdHex }, generationLog.message);
    const generationResult: GenerationResult = await generateOrders(
      runId,
      orderCount,
      orderBatchSize,
    );
    recordGenerationMetrics(generationResult.metrics);
    await runsCollection.updateOne(
      { _id: runId },
      {
        $set: {
          generation: generationResult.metrics,
          updatedAt: new Date(),
        },
      },
    );
    await appendRunLog(
      runId,
      createLogEntry('info', 'Geracao de pedidos concluida', generationResult.metrics),
    );
    const processingTimer = createTimer();
    processingTimer.start();
    if (generationResult.metrics.vipOrders > 0) {
      await appendRunLog(
        runId,
        createLogEntry('info', 'Processamento VIP iniciado', {
          orders: generationResult.metrics.vipOrders,
        }),
      );
    }
    currentPhase = 'vip_processing';
    const vipCompletionPromise = waitForPriorityCompletion(
      runIdHex,
      'VIP',
      generationResult.metrics.vipOrders,
    );
    const vipQueueStats = await enqueueOrdersForPriority(runId, 'VIP', orderBatchSize);
    await appendRunLog(
      runId,
      createLogEntry('info', 'Lotes VIP enfileirados', {
        orders: vipQueueStats.totalOrders,
        jobs: vipQueueStats.jobCount,
      }),
    );
    await vipCompletionPromise;
    const vipMetrics = await finalizePriorityMetrics(runId, 'VIP');
    recordPriorityMetrics('VIP', {
      processedCount: vipMetrics?.processedCount ?? generationResult.metrics.vipOrders,
      durationMs: vipMetrics?.durationMs ?? null,
    });
    await appendRunLog(
      runId,
      createLogEntry('info', 'Processamento VIP finalizado', {
        orders: generationResult.metrics.vipOrders,
        jobs: vipQueueStats.jobCount,
        durationMs: vipMetrics?.durationMs ?? null,
        startedAt: vipMetrics?.startedAt ?? null,
        completedAt: vipMetrics?.completedAt ?? null,
      }),
    );
    if (generationResult.metrics.normalOrders > 0) {
      await appendRunLog(
        runId,
        createLogEntry('info', 'Processamento NORMAL iniciado', {
          orders: generationResult.metrics.normalOrders,
        }),
      );
    }
    currentPhase = 'normal_processing';
    const normalCompletionPromise = waitForPriorityCompletion(
      runIdHex,
      'NORMAL',
      generationResult.metrics.normalOrders,
    );
    const normalQueueStats = await enqueueOrdersForPriority(runId, 'NORMAL', orderBatchSize);
    await appendRunLog(
      runId,
      createLogEntry('info', 'Lotes NORMAL enfileirados', {
        orders: normalQueueStats.totalOrders,
        jobs: normalQueueStats.jobCount,
      }),
    );
    await normalCompletionPromise;
    const normalMetrics = await finalizePriorityMetrics(runId, 'NORMAL');
    recordPriorityMetrics('NORMAL', {
      processedCount: normalMetrics?.processedCount ?? generationResult.metrics.normalOrders,
      durationMs: normalMetrics?.durationMs ?? null,
    });
    await appendRunLog(
      runId,
      createLogEntry('info', 'Processamento NORMAL finalizado', {
        orders: generationResult.metrics.normalOrders,
        jobs: normalQueueStats.jobCount,
        durationMs: normalMetrics?.durationMs ?? null,
        startedAt: normalMetrics?.startedAt ?? null,
        completedAt: normalMetrics?.completedAt ?? null,
      }),
    );
    const processingDuration = processingTimer.stop();
    const totalDuration = runTimer.stop();
    recordRunCompleted(totalDuration ?? null);
    const processingCompletedAt = new Date();
    currentPhase = 'finalizing';
    await runsCollection.updateOne({ _id: runId }, [
      {
        $set: {
          status: 'COMPLETED',
          updatedAt: processingCompletedAt,
          'processing.totalDurationMs': processingDuration ?? null,
          totalDurationMs: totalDuration ?? null,
        },
      },
    ]);
    await appendRunLog(
      runId,
      createLogEntry('info', 'Execucao concluida com sucesso', {
        totalDurationMs: totalDuration,
        processingDurationMs: processingDuration,
      }),
    );
  } catch (error) {
    const totalDuration =
      (() => {
        try {
          return runTimer.stop();
        } catch {
          return runTimer.getDuration();
        }
      })() ?? null;
    recordRunFailed(totalDuration);
    const failureError = toError(error);
    const failureLog = createLogEntry('error', 'Execucao falhou', {
      reason: failureError.message,
      stack: failureError.stack ?? null,
      phase: currentPhase,
    });
    await appendRunLog(runId, failureLog);
    await runsCollection.updateOne(
      { _id: runId },
      {
        $set: {
          status: 'FAILED',
          updatedAt: new Date(),
          failureReason: failureError.message,
        },
      },
    );
    logger.error(
      { runId: runId.toHexString(), err: failureError, phase: currentPhase },
      'Pipeline execution failed',
    );
    throw failureError;
  }
};

export const startProcessingPipeline = async (): Promise<{ runId: string }> => {
  if (activeRun.promise) {
    throw new Error('Ja existe um processamento em andamento.');
  }

  const runsCollection = getRunsCollection();

  const now = new Date();

  const initialDoc: ProcessingRunDocument = {
    status: 'RUNNING',

    createdAt: now,

    updatedAt: now,

    generation: {
      startedAt: now,

      completedAt: null,

      durationMs: null,

      totalOrders: config.orderCount,

      vipOrders: 0,

      normalOrders: 0,

      batchSize: config.orderBatchSize,
    },

    processing: {
      vip: {
        startedAt: null,

        completedAt: null,

        durationMs: null,

        processedCount: 0,
      },

      normal: {
        startedAt: null,

        completedAt: null,

        durationMs: null,

        processedCount: 0,
      },

      totalDurationMs: null,
    },

    totalDurationMs: null,

    logs: [],
  };

  const { insertedId } = await runsCollection.insertOne(initialDoc);

  activeRun.runId = insertedId;

  recordRunStarted();

  const runPromise = executeRun(insertedId)
    .catch((error) => {
      const err = toError(error);
      logger.error(
        { runId: insertedId.toHexString(), err },
        'Pipeline concluded with errors',
      );
    })

    .finally(() => {
      activeRun.runId = null;

      activeRun.promise = null;
    });

  activeRun.promise = runPromise;

  return { runId: insertedId.toHexString() };
};

const mapRunToSummary = (
  run: ProcessingRunDocument,
  runId: ObjectId,
): ProcessingSummaryResponse => ({
  runId: runId.toHexString(),

  status: run.status,

  generation: run.generation,

  processing: run.processing,

  totalDurationMs: run.totalDurationMs,
});

export const getLatestSummary = async (): Promise<ProcessingSummaryResponse | null> => {
  const runsCollection = getRunsCollection();

  const run = (await runsCollection.findOne({}, { sort: { createdAt: -1 } })) as
    | (ProcessingRunDocument & { _id: ObjectId })
    | null;

  if (!run) {
    return null;
  }

  return mapRunToSummary(run, run._id);
};

export const resetProcessingState = async (): Promise<void> => {
  if (activeRun.promise) {
    throw new Error('Nao e possivel resetar durante um processamento em andamento.');
  }

  const ordersCollection = getOrdersCollection();

  const runsCollection = getRunsCollection();

  const queue = getOrderQueue();

  await ordersCollection.deleteMany({});

  await runsCollection.deleteMany({});

  await queue.drain(true);

  const cleanTypes: Array<'completed' | 'wait' | 'failed' | 'delayed'> = [
    'completed',

    'wait',

    'failed',

    'delayed',
  ];

  await Promise.all(cleanTypes.map((type) => queue.clean(0, 1000, type)));

  logger.info('Estado do processamento resetado');
};
