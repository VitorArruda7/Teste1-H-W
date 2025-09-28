import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const runStartedCounter = new client.Counter({
  name: 'hw_runs_started_total',
  help: 'Total number of processing runs started',
  registers: [register],
});

const runCompletedCounter = new client.Counter({
  name: 'hw_runs_completed_total',
  help: 'Total number of processing runs completed successfully',
  registers: [register],
});

const runFailedCounter = new client.Counter({
  name: 'hw_runs_failed_total',
  help: 'Total number of processing runs that ended in failure',
  registers: [register],
});

const generationOrdersGauge = new client.Gauge({
  name: 'hw_last_generation_total_orders',
  help: 'Total number of orders generated in the last run',
  registers: [register],
});

const generationVipGauge = new client.Gauge({
  name: 'hw_last_generation_vip_orders',
  help: 'Total number of VIP orders generated in the last run',
  registers: [register],
});

const generationNormalGauge = new client.Gauge({
  name: 'hw_last_generation_normal_orders',
  help: 'Total number of normal orders generated in the last run',
  registers: [register],
});

const generationDurationHistogram = new client.Histogram({
  name: 'hw_generation_duration_seconds',
  help: 'Order generation duration in seconds',
  buckets: [5, 10, 20, 40, 80, 160, 320, 640],
  registers: [register],
});

const vipProcessedGauge = new client.Gauge({
  name: 'hw_last_vip_processed_total',
  help: 'Number of VIP orders processed in the last run',
  registers: [register],
});

const vipDurationGauge = new client.Gauge({
  name: 'hw_last_vip_processing_duration_seconds',
  help: 'Duration in seconds of the last VIP processing phase',
  registers: [register],
});

const normalProcessedGauge = new client.Gauge({
  name: 'hw_last_normal_processed_total',
  help: 'Number of normal orders processed in the last run',
  registers: [register],
});

const normalDurationGauge = new client.Gauge({
  name: 'hw_last_normal_processing_duration_seconds',
  help: 'Duration in seconds of the last normal processing phase',
  registers: [register],
});

const totalDurationGauge = new client.Gauge({
  name: 'hw_last_run_total_duration_seconds',
  help: 'Total duration in seconds of the last processing run',
  registers: [register],
});

const queueWaitingGauge = new client.Gauge({
  name: 'hw_queue_waiting_jobs',
  help: 'Number of waiting jobs in the processing queue',
  registers: [register],
});

const queueActiveGauge = new client.Gauge({
  name: 'hw_queue_active_jobs',
  help: 'Number of active jobs in the processing queue',
  registers: [register],
});

const queueDelayedGauge = new client.Gauge({
  name: 'hw_queue_delayed_jobs',
  help: 'Number of delayed jobs in the processing queue',
  registers: [register],
});

const queueFailedGauge = new client.Gauge({
  name: 'hw_queue_failed_jobs',
  help: 'Number of failed jobs in the processing queue',
  registers: [register],
});

const queueStalledCounter = new client.Counter({
  name: 'hw_queue_stalled_total',
  help: 'Total stalled jobs detected by BullMQ',
  registers: [register],
});

let queueCollector: NodeJS.Timeout | null = null;

const toSeconds = (milliseconds: number | null | undefined): number | null => {
  if (milliseconds == null) {
    return null;
  }
  return milliseconds / 1000;
};

export const recordRunStarted = (): void => {
  runStartedCounter.inc();
};

export const recordGenerationMetrics = (metrics: {
  totalOrders: number;
  vipOrders: number;
  normalOrders: number;
  durationMs: number | null;
}): void => {
  generationOrdersGauge.set(metrics.totalOrders);
  generationVipGauge.set(metrics.vipOrders);
  generationNormalGauge.set(metrics.normalOrders);
  const durationSeconds = toSeconds(metrics.durationMs);
  if (durationSeconds != null) {
    generationDurationHistogram.observe(durationSeconds);
  }
};

export const recordPriorityMetrics = (
  priority: 'VIP' | 'NORMAL',
  metrics: {
    processedCount: number;
    durationMs: number | null;
  },
): void => {
  const durationSeconds = toSeconds(metrics.durationMs);
  if (priority === 'VIP') {
    vipProcessedGauge.set(metrics.processedCount);
    if (durationSeconds != null) {
      vipDurationGauge.set(durationSeconds);
    }
    return;
  }
  normalProcessedGauge.set(metrics.processedCount);
  if (durationSeconds != null) {
    normalDurationGauge.set(durationSeconds);
  }
};

export const recordRunCompleted = (totalDurationMs: number | null): void => {
  runCompletedCounter.inc();
  const durationSeconds = toSeconds(totalDurationMs);
  if (durationSeconds != null) {
    totalDurationGauge.set(durationSeconds);
  }
};

export const recordRunFailed = (totalDurationMs: number | null): void => {
  runFailedCounter.inc();
  const durationSeconds = toSeconds(totalDurationMs);
  if (durationSeconds != null) {
    totalDurationGauge.set(durationSeconds);
  }
};

export const recordQueueCounts = (counts: {
  waiting?: number;
  active?: number;
  delayed?: number;
  failed?: number;
}): void => {
  if (typeof counts.waiting === 'number') {
    queueWaitingGauge.set(counts.waiting);
  }
  if (typeof counts.active === 'number') {
    queueActiveGauge.set(counts.active);
  }
  if (typeof counts.delayed === 'number') {
    queueDelayedGauge.set(counts.delayed);
  }
  if (typeof counts.failed === 'number') {
    queueFailedGauge.set(counts.failed);
  }
};

export const recordStalledJob = (): void => {
  queueStalledCounter.inc();
};

export const startQueueCollector = (
  getCounts: () => Promise<{ waiting: number; active: number; delayed: number; failed: number }>,
): void => {
  if (queueCollector) {
    return;
  }
  const run = async () => {
    try {
      const counts = await getCounts();
      recordQueueCounts(counts);
    } catch (error) {
      // metrics collection failures should not crash the app
    }
  };
  queueCollector = setInterval(run, 5000);
  queueCollector.unref?.();
  void run();
};

export const stopQueueCollector = (): void => {
  if (queueCollector) {
    clearInterval(queueCollector);
    queueCollector = null;
  }
};

export const metricsHandler = async (
  _req: import('express').Request,
  res: import('express').Response,
) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.status(200).send(await register.metrics());
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to collect metrics',
    });
  }
};

export const metricsRegistry = register;
