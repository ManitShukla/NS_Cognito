import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export type UpstreamHealthState = 'healthy' | 'degraded' | 'offline';

export interface UpstreamStatus {
  state: UpstreamHealthState;
  targetUrl: string;
  lastCheckedAt: number;
  latencyMs: number;
  consecutiveFailures: number;
  lastError: string | null;
  message: string;
}

export class UpstreamMonitorService {
  private state: UpstreamHealthState = 'healthy';
  private lastCheckedAt: number = Date.now();
  private latencyMs: number = 0;
  private consecutiveFailures: number = 0;
  private lastError: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  private readonly targetUrl: string;

  constructor(targetUrl?: string) {
    this.targetUrl = targetUrl || `${env.PLUMWARE_BASE_URL}/student.htm`;
  }

  /**
   * Executes a synthetic canary probe against Plumware ERP.
   */
  async checkHealth(): Promise<UpstreamStatus> {
    const startTime = Date.now();
    try {
      const response = await axios.get(this.targetUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NS-Cognito-Canary/1.0',
        },
      });

      this.latencyMs = Date.now() - startTime;
      this.lastCheckedAt = Date.now();
      this.lastError = null;

      if (response.status >= 400 || this.latencyMs > 3500) {
        this.state = 'degraded';
        this.consecutiveFailures = 0;
      } else {
        this.state = 'healthy';
        this.consecutiveFailures = 0;
      }

      logger.debug(
        'MONITOR',
        `Upstream canary probe OK: ${this.state} (${this.latencyMs}ms, status ${response.status})`
      );
    } catch (err: unknown) {
      this.latencyMs = Date.now() - startTime;
      this.lastCheckedAt = Date.now();
      this.consecutiveFailures++;
      this.lastError = err instanceof Error ? err.message : String(err);

      if (this.consecutiveFailures >= 2) {
        this.state = 'offline';
      } else {
        this.state = 'degraded';
      }

      logger.warn(
        'MONITOR',
        `Upstream canary probe FAILED (streak ${this.consecutiveFailures}): ${this.lastError} -> state=${this.state}`
      );
    }

    return this.getStatus();
  }

  /**
   * Returns current cached telemetry status without triggering an outbound network probe.
   */
  getStatus(): UpstreamStatus {
    let message = 'Upstream university portal (imsnsit.org) is responsive and operating normally.';
    if (this.state === 'degraded') {
      message = 'Upstream university portal is experiencing high latency or partial errors.';
    } else if (this.state === 'offline') {
      message = 'Upstream university portal is currently unreachable or rejecting connections.';
    }

    return {
      state: this.state,
      targetUrl: this.targetUrl,
      lastCheckedAt: this.lastCheckedAt,
      latencyMs: this.latencyMs,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
      message,
    };
  }

  /**
   * Sets the simulated state (useful for testing degraded banners).
   */
  setMockState(state: UpstreamHealthState, error?: string): void {
    this.state = state;
    this.lastCheckedAt = Date.now();
    this.lastError = error || null;
  }

  /**
   * Starts background recurring probe (default: every 5 minutes).
   */
  start(intervalMs = 300_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.checkHealth();
    }, intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Halts background recurring probe.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const upstreamMonitor = new UpstreamMonitorService();
