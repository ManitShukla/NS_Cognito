import { env } from '../config/env.js';
import { sanitizeLogPayload } from '../middleware/payload_sanitizer.js';

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
      const sanitizedMeta = meta !== undefined ? sanitizeLogPayload(meta) : '';
      console.debug(`[${formatTimestamp()}] [DEBUG // ${tag}] ${message}`, sanitizedMeta);
    }
  },

  info(tag: string, message: string, meta?: unknown) {
    if (LEVEL_SEVERITY.info >= currentLevelSeverity) {
      const sanitizedMeta = meta !== undefined ? sanitizeLogPayload(meta) : '';
      console.log(`[${formatTimestamp()}] [TEL // ${tag}] ${message}`, sanitizedMeta);
    }
  },

  warn(tag: string, message: string, meta?: unknown) {
    if (LEVEL_SEVERITY.warn >= currentLevelSeverity) {
      const sanitizedMeta = meta !== undefined ? sanitizeLogPayload(meta) : '';
      console.warn(`[${formatTimestamp()}] [WARN // ${tag}] ${message}`, sanitizedMeta);
    }
  },

  error(tag: string, message: string, meta?: unknown) {
    if (LEVEL_SEVERITY.error >= currentLevelSeverity) {
      const sanitizedMeta = meta !== undefined ? sanitizeLogPayload(meta) : '';
      console.error(`[${formatTimestamp()}] [ERR // ${tag}] ${message}`, sanitizedMeta);
    }
  },
};
