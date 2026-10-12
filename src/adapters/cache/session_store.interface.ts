import type { SessionState } from '../../types/session.js';

/**
 * Interface contract for transient session cache stores.
 */
export interface ISessionStore {
  /**
   * Stores a session state object with a specific TTL in seconds.
   */
  set(sessionToken: string, state: SessionState, ttlSeconds: number): Promise<void>;

  /**
   * Retrieves an active session state by token. Returns null if expired or missing.
   */
  get(sessionToken: string): Promise<SessionState | null>;

  /**
   * Deletes a session state immediately.
   */
  delete(sessionToken: string): Promise<boolean>;

  /**
   * Updates an existing session state while preserving or extending expiration.
   */
  update(sessionToken: string, state: Partial<SessionState>): Promise<void>;

  /**
   * Releases background timers and resources.
   */
  destroy(): Promise<void>;
}
