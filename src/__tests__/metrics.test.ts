import express from 'express';
import request from 'supertest';
import {
  metricsRegistry,
  metricsHandler,
  recordQueueCounts,
  recordRunCompleted,
  recordRunFailed,
  recordRunStarted,
  recordStalledJob,
  recordGenerationMetrics,
  recordPriorityMetrics,
  startQueueCollector,
  stopQueueCollector,
} from '../services/metrics';

const createExpressApp = () => {
  const app = express();
  app.get('/metrics', metricsHandler);
  return app;
};

describe('metrics service', () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics();
    stopQueueCollector();
  });

  it('tracks run lifecycle counters', async () => {
    recordRunStarted();
    recordRunCompleted(1200);
    const startedMetric = metricsRegistry.getSingleMetric('hw_runs_started_total');
    const completedMetric = metricsRegistry.getSingleMetric('hw_runs_completed_total');
    const startedSnapshot = startedMetric ? await startedMetric.get() : undefined;
    const completedSnapshot = completedMetric ? await completedMetric.get() : undefined;
    expect(startedSnapshot?.values[0].value).toBe(1);
    expect(completedSnapshot?.values[0].value).toBe(1);
  });

  it('records failures and queues', async () => {
    recordRunFailed(800);
    recordQueueCounts({ waiting: 2, active: 1, delayed: 0, failed: 3 });
    recordStalledJob();
    const failedMetric = metricsRegistry.getSingleMetric('hw_runs_failed_total');
    const waitingMetric = metricsRegistry.getSingleMetric('hw_queue_waiting_jobs');
    const stalledMetric = metricsRegistry.getSingleMetric('hw_queue_stalled_total');
    const failedSnapshot = failedMetric ? await failedMetric.get() : undefined;
    const waitingSnapshot = waitingMetric ? await waitingMetric.get() : undefined;
    const stalledSnapshot = stalledMetric ? await stalledMetric.get() : undefined;
    expect(failedSnapshot?.values[0].value).toBe(1);
    expect(waitingSnapshot?.values[0].value).toBe(2);
    expect(stalledSnapshot?.values[0].value).toBe(1);
  });

  it('captures generation and priority metrics', async () => {
    recordGenerationMetrics({
      totalOrders: 100,
      vipOrders: 40,
      normalOrders: 60,
      durationMs: 5000,
    });
    recordGenerationMetrics({
      totalOrders: 50,
      vipOrders: 20,
      normalOrders: 30,
      durationMs: null,
    });
    recordPriorityMetrics('VIP', { processedCount: 40, durationMs: 2000 });
    recordPriorityMetrics('VIP', { processedCount: 0, durationMs: null });
    recordPriorityMetrics('NORMAL', { processedCount: 60, durationMs: 2500 });
    recordPriorityMetrics('NORMAL', { processedCount: 5, durationMs: null });
    const generationMetric = metricsRegistry.getSingleMetric('hw_last_generation_total_orders');
    const vipMetric = metricsRegistry.getSingleMetric('hw_last_vip_processed_total');
    const normalMetric = metricsRegistry.getSingleMetric('hw_last_normal_processed_total');
    const generationSnapshot = generationMetric ? await generationMetric.get() : undefined;
    const vipSnapshot = vipMetric ? await vipMetric.get() : undefined;
    const normalSnapshot = normalMetric ? await normalMetric.get() : undefined;
    expect(generationSnapshot?.values[0].value).toBe(50);
    expect(vipSnapshot?.values[0].value).toBe(0);
    expect(normalSnapshot?.values[0].value).toBe(5);
  });

  it('updates queue counts via collector', async () => {
    jest.useFakeTimers();
    let invocations = 0;
    startQueueCollector(() => {
      invocations += 1;
      return Promise.resolve({ waiting: 1, active: 0, delayed: 0, failed: 0 });
    });
    await Promise.resolve();
    expect(invocations).toBeGreaterThan(0);
    stopQueueCollector();
    jest.useRealTimers();
  });

  it('does not start a new collector when one is running', () => {
    jest.useFakeTimers();
    let firstInvocations = 0;
    startQueueCollector(() => {
      firstInvocations += 1;
      return Promise.resolve({ waiting: 0, active: 0, delayed: 0, failed: 0 });
    });
    startQueueCollector(() => {
      throw new Error('should not be invoked');
    });
    return Promise.resolve()
      .then(() => {
        expect(firstInvocations).toBeGreaterThan(0);
      })
      .finally(() => {
        stopQueueCollector();
        jest.useRealTimers();
      });
  });

  it('ignores collector errors without throwing', () => {
    startQueueCollector(() => Promise.reject(new Error('collector failure')));
    return Promise.resolve().finally(() => {
      stopQueueCollector();
    });
  });

  it('exposes metrics handler output', () => {
    const app = createExpressApp();
    return request(app)
      .get('/metrics')
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('hw_runs_started_total');
      });
  });

  it('handles metrics handler non-error rejection', () => {
    const original = metricsRegistry.metrics.bind(metricsRegistry);
    metricsRegistry.metrics = () => Promise.reject('plain failure');
    const app = createExpressApp();
    return request(app)
      .get('/metrics')
      .expect(500)
      .then((response) => {
        expect(response.text).toContain('Failed to collect metrics');
      })
      .finally(() => {
        metricsRegistry.metrics = original;
      });
  });

  it('handles metrics handler errors', () => {
    const original = metricsRegistry.metrics.bind(metricsRegistry);
    metricsRegistry.metrics = () => Promise.reject(new Error('boom'));
    const app = createExpressApp();
    return request(app)
      .get('/metrics')
      .expect(500)
      .then(() => {
        metricsRegistry.metrics = original;
      });
  });
});
