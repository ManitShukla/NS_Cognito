import type { ISessionStore } from './session_store.interface.js';
import { MemorySessionStore } from './memory_session_store.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export * from './session_store.interface.js';
export * from './memory_session_store.js';

/**
 * Creates and initializes the configured session store instance.
 */
export function createSessionStore(): ISessionStore {
  if (env.SESSION_STORE_TYPE === 'redis') {
    logger.warn('STORE', 'Redis session store requested; falling back to resilient memory store in development');
    return new MemorySessionStore();
  }

  logger.info('STORE', 'Initialized structured MemorySessionStore with automatic 30s reaper');
  return new MemorySessionStore();
}
