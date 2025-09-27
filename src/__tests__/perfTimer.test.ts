import { createTimer } from '../utils/perfTimer';

describe('perfTimer', () => {
  it('measures elapsed time', async () => {
    const timer = createTimer();
    timer.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const duration = timer.stop();
    expect(duration).toBeGreaterThan(0);
  });

  it('returns stored duration without restarting', () => {
    const timer = createTimer();
    timer.start();
    timer.stop();
    expect(typeof timer.getDuration()).toBe('number');
  });

  it('throws when stop is invoked without start', () => {
    const timer = createTimer();
    expect(() => timer.stop()).toThrow('Timer has not been started.');
  });

  it('allows reset to restart the flow', async () => {
    const timer = createTimer();
    timer.start();
    await new Promise((resolve) => setTimeout(resolve, 5));
    timer.stop();
    timer.reset();
    expect(timer.getDuration()).toBeNull();
    timer.start();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const duration = timer.stop();
    expect(duration).toBeGreaterThan(0);
  });
});
