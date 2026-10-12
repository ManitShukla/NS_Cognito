import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * High-density monospaced request telemetry middleware.
 * Records method, endpoint, status code, and latency in milliseconds.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    logger.info('HTTP', `${method} ${originalUrl} -> ${statusCode} [${duration}ms]`);
  });

  next();
}
