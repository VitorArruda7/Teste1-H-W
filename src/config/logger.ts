import pino from 'pino';
import { isProduction } from './env';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
});

export type Logger = typeof logger;

export default logger;
