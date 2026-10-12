import type { ISessionStore } from './session_store.interface.js';
import type { SessionState } from '../../types/session.js';
import { logger } from '../../utils/logger.js';

interface CacheEntry {
  state: SessionState;
  expiresAt: number;
}

/**
 * High-performance structured in-memory session cache.
 * Implements strict Time-To-Live (TTL) eviction and periodic background reaping
 * to prevent memory exhaustion from abandoned unauthenticated sessions.
 */
export class MemorySessionStore implements ISessionStore {
  private readonly store = new Map<string, CacheEntry>();
  private readonly reaperTimer: NodeJS.Timeout | null = null;

  constructor(reaperIntervalMs = 30000) {
    // Periodic garbage collection for expired sessions
    this.reaperTimer = setInterval(() => {
      this.reapExpired();
    }, reaperIntervalMs);

    // Ensure timer does not prevent process exit in CLI scripts or test runners
    if (this.reaperTimer.unref) {
      this.reaperTimer.unref();
    }
  }

  async set(sessionToken: string, state: SessionState, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(sessionToken, {
      state: {
        ...state,
        expiresAt,
      },
      expiresAt,
    });
    logger.debug('STORE', `Session ${sessionToken.slice(0, 8)}... stored with TTL ${ttlSeconds}s`);
  }

  async get(sessionToken: string): Promise<SessionState | null> {
    const entry = this.store.get(sessionToken);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionToken);
      logger.debug('STORE', `Session ${sessionToken.slice(0, 8)}... expired on access and purged`);
      return null;
    }

    return entry.state;
  }

  async delete(sessionToken: string): Promise<boolean> {
    return this.store.delete(sessionToken);
  }

  async update(sessionToken: string, updates: Partial<SessionState>): Promise<void> {
    const entry = this.store.get(sessionToken);
    if (!entry) {
      return;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionToken);
      return;
    }

    entry.state = {
      ...entry.state,
      ...updates,
    };
  }

  /**
   * Scans and purges all records that have exceeded their expiration threshold.
   */
  private reapExpired(): void {
    const now = Date.now();
    let purgedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        purgedCount++;
      }
    }

    if (purgedCount > 0) {
      logger.debug('STORE', `Reaped ${purgedCount} expired session(s) from memory store`);
    }
  }

  async destroy(): Promise<void> {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
    }
    this.store.clear();
  }

  /**
   * Returns current active entry count for diagnostics and telemetry.
   */
  get size(): number {
    return this.store.size;
  }
}
