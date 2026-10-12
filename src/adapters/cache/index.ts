import type { ISessionStore } from './session_store.interface.js';
import { MemorySessionStore } from './memory_session_store.js';
import { RedisSessionStore } from './redis_session_store.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export * from './session_store.interface.js';
export * from './memory_session_store.js';
export * from './redis_session_store.js';

let sharedStore: ISessionStore | null = null;

/**
 * Creates and initializes the configured session store instance.
 * Automatically provisions RedisSessionStore in production/Vercel with REDIS_URL,
 * or MemorySessionStore in local dev/testing.
 */
export function createSessionStore(forceNew = false): ISessionStore {
  if (sharedStore && !forceNew && env.NODE_ENV !== 'test') {
    return sharedStore;
  }

  const shouldUseRedis =
    env.SESSION_STORE_TYPE === 'redis' ||
    (Boolean(process.env.REDIS_URL) && !process.env.REDIS_URL?.includes('localhost:6379')) ||
    (process.env.VERCEL === '1' && Boolean(process.env.REDIS_URL));

  if (shouldUseRedis) {
    logger.info('STORE', 'Initialized Cloud Redis session store (Stateless / TLS enabled)');
    const store = new RedisSessionStore();
    if (!forceNew && env.NODE_ENV !== 'test') {
      sharedStore = store;
    }
    return store;
  }

  if (process.env.VERCEL === '1') {
    logger.warn(
      'STORE',
      'Running on Vercel without a remote REDIS_URL configured! Falling back to ephemeral MemorySessionStore. Multi-instance session sharing requires REDIS_URL (e.g. Upstash Redis).'
    );
  } else {
    logger.info('STORE', 'Initialized structured MemorySessionStore with automatic 30s reaper');
  }

  const store = new MemorySessionStore();
  if (!forceNew && env.NODE_ENV !== 'test') {
    sharedStore = store;
  }
  return store;
}
