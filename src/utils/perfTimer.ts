export interface PerfTimer {
  start: () => void;
  stop: () => number;
  getDuration: () => number | null;
  reset: () => void;
}

export const createTimer = (): PerfTimer => {
  let startTime: [number, number] | null = null;
  let duration: number | null = null;

  return {
    start: () => {
      startTime = process.hrtime();
      duration = null;
    },
    stop: () => {
      if (!startTime) {
        throw new Error('Timer has not been started.');
      }
      const diff = process.hrtime(startTime);
      duration = diff[0] * 1000 + diff[1] / 1_000_000;
      startTime = null;
      return duration;
    },
    getDuration: () => duration,
    reset: () => {
      startTime = null;
      duration = null;
    },
  };
};
