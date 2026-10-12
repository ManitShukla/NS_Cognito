import { env } from '../config/env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevelSeverity = LEVEL_SEVERITY[env.LOG_LEVEL as LogLevel] || 20;

function formatTimestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(tag: string, message: string, meta?: unknown) {
    if (LEVEL_SEVERITY.debug >= currentLevelSeverity) {
      console.debug(`[${formatTimestamp()}] [DEBUG // ${tag}] ${message}`, meta !== undefined ? meta : '');
    }
  },

  info(tag: string, message: string, meta?: unknown) {
    if (LEVEL_SEVERITY.info >= currentLevelSeverity) {
      console.log(`[${formatTimestamp()}] [TEL // ${tag}] ${message}`, meta !== undefined ? meta : '');
    }
  },

  warn(tag: string, message: string, meta?: unknown) {
    if (LEVEL_SEVERITY.warn >= currentLevelSeverity) {
      console.warn(`[${formatTimestamp()}] [WARN // ${tag}] ${message}`, meta !== undefined ? meta : '');
    }
  },

  error(tag: string, message: string, meta?: unknown) {
    if (LEVEL_SEVERITY.error >= currentLevelSeverity) {
      console.error(`[${formatTimestamp()}] [ERR // ${tag}] ${message}`, meta !== undefined ? meta : '');
    }
  },
};
