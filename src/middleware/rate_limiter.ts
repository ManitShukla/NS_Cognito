import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
}

interface ClientBucket {
  count: number;
  resetAt: number;
}

// In-memory buckets indexed by `${keyPrefix}:${key}`
const buckets = new Map<string, ClientBucket>();

/**
 * Periodically purge expired buckets every 60 seconds to prevent memory leaks.
 */
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60_000);

// Prevent cleanup interval from holding the Node process open
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Clears all active rate limit buckets. Used for unit testing and test isolation.
 */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Factory for creating express sliding-window rate limiters.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 30;
  const keyPrefix = options.keyPrefix ?? 'rate';
  const keyGenerator =
    options.keyGenerator ??
    ((req: Request) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
      return ip;
    });

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const clientKey = `${keyPrefix}:${keyGenerator(req)}`;
    let bucket = buckets.get(clientKey);

    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 0,
        resetAt: now + windowMs,
      };
      buckets.set(clientKey, bucket);
    }

    bucket.count++;

    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', max.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', resetSeconds.toString());

    if (bucket.count > max) {
      res.setHeader('Retry-After', resetSeconds.toString());
      logger.warn('RATE_LIMIT', `Rate limit exceeded for [${clientKey}]: ${bucket.count}/${max} in ${windowMs}ms`);

      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down and try again later.',
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    next();
  };
}

/**
 * Session initialization: 10 requests / minute
 */
export const sessionRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'session',
});

/**
 * Authentication login attempts: 5 requests / minute (Strict anti-bruteforce)
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'login',
});

/**
 * Public Timetable query & inference: 30 requests / minute
 */
export const timetableRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'timetable',
});

/**
 * Student personal telemetry: 20 requests / minute
 */
export const studentRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyPrefix: 'student',
});
