import { Redis, type RedisOptions } from 'ioredis';
import { CookieJar } from 'tough-cookie';
import type { ISessionStore } from './session_store.interface.js';
import { MemorySessionStore } from './memory_session_store.js';
import type { SessionState } from '../../types/session.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface RedisSessionStoreOptions {
  redisUrl?: string;
  client?: Redis;
  keyPrefix?: string;
  defaultTtlSeconds?: number;
}

/**
 * Enterprise Stateless Cloud Redis Session Store with In-Memory Resilient Fallback.
 * Supports TLS connections (rediss://) for Upstash / Redis Cloud / AWS ElastiCache.
 * Provides lossless tough-cookie CookieJar serialization to allow stateless
 * session rehydration across ephemeral serverless container invocations.
 *
 * RESILIENCE POLICY: If Redis is unreachable, drops connections, or times out,
 * all session operations seamlessly degrade to a local in-memory fallback store
 * ensuring zero handshake crashes on serverless instances.
 */
export class RedisSessionStore implements ISessionStore {
  private readonly client: Redis;
  private readonly fallbackStore: MemorySessionStore;
  private readonly keyPrefix: string;
  private readonly defaultTtlSeconds: number;
  private isDestroyed = false;

  constructor(options?: RedisSessionStoreOptions) {
    this.keyPrefix = options?.keyPrefix || 'cognito:session:';
    this.defaultTtlSeconds = options?.defaultTtlSeconds || 180; // Strict 3-minute TTL
    this.fallbackStore = new MemorySessionStore();

    if (options?.client) {
      this.client = options.client;
    } else {
      const url = options?.redisUrl || env.REDIS_URL;
      const isTls = url.startsWith('rediss://');

      const redisOptions: RedisOptions = {
        maxRetriesPerRequest: 2,
        connectTimeout: 4000,
        enableReadyCheck: false,
        lazyConnect: false,
        retryStrategy(times) {
          if (times > 3) return null; // Fast fail to avoid blocking serverless cycles
          return Math.min(times * 100, 1000);
        },
      };

      if (isTls) {
        redisOptions.tls = {
          rejectUnauthorized: env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
        };
      }

      this.client = new Redis(url, redisOptions);

      this.client.on('error', (err: unknown) => {
        logger.error(
          'REDIS',
          `Cloud Redis connection warning: ${err instanceof Error ? err.message : String(err)}. Falling back to in-memory cache.`
        );
      });

      this.client.on('connect', () => {
        logger.info('REDIS', 'Connected to Cloud Redis session store successfully');
      });
    }
  }

  private getKey(sessionToken: string): string {
    return `${this.keyPrefix}${sessionToken}`;
  }

  /**
   * Stores a session state object with a strict Time-To-Live in seconds.
   * Serializes the CookieJar losslessly including domain, path, secure, httpOnly, and expires.
   */
  async set(sessionToken: string, state: SessionState, ttlSeconds?: number): Promise<void> {
    if (this.isDestroyed) return;
    const key = this.getKey(sessionToken);
    const effectiveTtl = (ttlSeconds !== undefined && ttlSeconds > 0)
      ? ttlSeconds
      : this.defaultTtlSeconds;

    const cookieJarSerialized = state.cookieJar ? state.cookieJar.toJSON() : null;

    const payload = {
      sessionToken: state.sessionToken,
      cookieJarSerialized,
      serializedCookies: state.serializedCookies,
      encFy: state.encFy,
      fy: state.fy,
      comp: state.comp,
      t: state.t,
      hrandNum: state.hrandNum,
      captchaPath: state.captchaPath,
      createdAt: state.createdAt,
      expiresAt: state.expiresAt || Date.now() + effectiveTtl * 1000,
      isAuthenticated: state.isAuthenticated,
      rollNo: state.rollNo,
    };

    try {
      await this.client.set(key, JSON.stringify(payload), 'EX', effectiveTtl);
      logger.debug(
        'REDIS',
        `Session ${sessionToken.slice(0, 8)}... stored with strict TTL ${effectiveTtl}s in Cloud Redis`
      );
    } catch (redisErr: unknown) {
      logger.warn(
        'REDIS',
        `Cloud Redis set failed (${redisErr instanceof Error ? redisErr.message : String(redisErr)}); falling back to ephemeral in-memory cache`,
        { sessionToken: sessionToken.slice(0, 8) }
      );
      await this.fallbackStore.set(sessionToken, state, effectiveTtl);
    }
  }

  /**
   * Retrieves an active session state by token.
   * Deserializes the CookieJar to an active tough-cookie instance.
   */
  async get(sessionToken: string): Promise<SessionState | null> {
    if (this.isDestroyed) return null;
    const key = this.getKey(sessionToken);

    try {
      const data = await this.client.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        let cookieJar: CookieJar;

        if (parsed.cookieJarSerialized) {
          cookieJar = CookieJar.deserializeSync(parsed.cookieJarSerialized);
        } else {
          cookieJar = new CookieJar();
        }

        const state: SessionState = {
          sessionToken: parsed.sessionToken,
          cookieJar,
          encFy: parsed.encFy,
          fy: parsed.fy,
          comp: parsed.comp,
          t: parsed.t,
          hrandNum: parsed.hrandNum,
          captchaPath: parsed.captchaPath,
          createdAt: parsed.createdAt,
          expiresAt: parsed.expiresAt,
          isAuthenticated: Boolean(parsed.isAuthenticated),
          rollNo: parsed.rollNo,
          serializedCookies: parsed.serializedCookies,
        };

        return state;
      }
    } catch (err: unknown) {
      logger.warn(
        'REDIS',
        `Error querying Cloud Redis for session ${sessionToken.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}. Checking in-memory fallback.`
      );
    }

    // Graceful fallback to ephemeral in-memory cache
    return await this.fallbackStore.get(sessionToken);
  }

  /**
   * Deletes a session immediately from both Redis and in-memory store.
   */
  async delete(sessionToken: string): Promise<boolean> {
    if (this.isDestroyed) return false;
    const key = this.getKey(sessionToken);
    let deletedRedis = false;
    try {
      const deleted = await this.client.del(key);
      deletedRedis = deleted > 0;
    } catch {
      // Fallback silently handles deletion
    }
    const deletedFallback = await this.fallbackStore.delete(sessionToken);
    return deletedRedis || deletedFallback;
  }

  /**
   * Updates an existing session state while preserving TTL.
   */
  async update(sessionToken: string, updates: Partial<SessionState>): Promise<void> {
    if (this.isDestroyed) return;
    const key = this.getKey(sessionToken);
    const existing = await this.get(sessionToken);
    if (!existing) return;

    try {
      const remainingTtl = await this.client.ttl(key);
      if (remainingTtl > 0) {
        const merged: SessionState = {
          ...existing,
          ...updates,
          cookieJar: updates.cookieJar || existing.cookieJar,
        };
        await this.set(sessionToken, merged, remainingTtl);
        return;
      }
    } catch {
      logger.warn('REDIS', 'Redis update failed; updating in-memory fallback');
    }

    await this.fallbackStore.update(sessionToken, updates);
  }

  /**
   * Pings Redis to verify connectivity (used by readiness probes).
   */
  async ping(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Cleanly closes the Redis connection and destroys fallback store.
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    try {
      await this.client.quit();
      logger.info('REDIS', 'Cloud Redis session connection closed cleanly');
    } catch {
      this.client.disconnect();
    }
    await this.fallbackStore.destroy();
  }
}
