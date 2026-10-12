import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemorySessionStore } from '../src/adapters/cache/memory_session_store.js';
import { CookieJar } from 'tough-cookie';
import type { SessionState } from '../src/types/session.js';

describe('MemorySessionStore', () => {
  let store: MemorySessionStore;

  const mockSessionState: SessionState = {
    sessionToken: 'test-uuid-1234',
    cookieJar: new CookieJar(),
    encFy: 'mock_enc_fy',
    fy: '2026-27',
    comp: 'NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY',
    t: 'swx',
    hrandNum: '12345',
    captchaPath: 'images/captcha/test.jpg',
    createdAt: Date.now(),
    expiresAt: Date.now() + 180000,
    isAuthenticated: false,
  };

  beforeEach(() => {
    store = new MemorySessionStore(1000);
  });

  afterEach(async () => {
    await store.destroy();
  });

  it('stores and retrieves session state before expiration', async () => {
    await store.set('test-uuid-1234', mockSessionState, 60);
    const retrieved = await store.get('test-uuid-1234');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.sessionToken).toBe('test-uuid-1234');
    expect(retrieved?.fy).toBe('2026-27');
  });

  it('evicts session on access when TTL has passed', async () => {
    vi.useFakeTimers();

    await store.set('test-uuid-1234', mockSessionState, 5); // 5 seconds TTL
    expect(await store.get('test-uuid-1234')).not.toBeNull();

    // Advance clock past TTL
    vi.advanceTimersByTime(6000);

    const expired = await store.get('test-uuid-1234');
    expect(expired).toBeNull();

    vi.useRealTimers();
  });

  it('updates session state properties', async () => {
    await store.set('test-uuid-1234', mockSessionState, 60);
    await store.update('test-uuid-1234', {
      isAuthenticated: true,
      rollNo: '2024UCB1234',
    });

    const updated = await store.get('test-uuid-1234');
    expect(updated?.isAuthenticated).toBe(true);
    expect(updated?.rollNo).toBe('2024UCB1234');
  });

  it('deletes session immediately upon explicit request', async () => {
    await store.set('test-uuid-1234', mockSessionState, 60);
    const deleted = await store.delete('test-uuid-1234');

    expect(deleted).toBe(true);
    expect(await store.get('test-uuid-1234')).toBeNull();
  });
});
