import { logger } from '../../utils/logger.js';

export interface TrafficGateConfig {
  maxConcurrent?: number;
  minJitterMs?: number;
  maxJitterMs?: number;
}

/**
 * Upstream Traffic Gate & Anti-Ban Concurrency Bottleneck.
 * Protects against upstream IP blacklisting by imsnsit.org through:
 * 1. Concurrency Limiter: Caps outbound requests to a strict safe ceiling (default: 6).
 * 2. Adaptive Request Pacing: Injects 150ms-350ms randomized jitter to break deterministic scraping patterns.
 */
export class UpstreamTrafficGate {
  private readonly maxConcurrent: number;
  private readonly minJitterMs: number;
  private readonly maxJitterMs: number;

  private currentActive = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(config?: TrafficGateConfig) {
    this.maxConcurrent = config?.maxConcurrent ?? 6;
    this.minJitterMs = config?.minJitterMs ?? 150;
    this.maxJitterMs = config?.maxJitterMs ?? 350;
  }

  /**
   * Acquires a concurrency token and applies randomized anti-ban jitter.
   */
  async acquire(): Promise<void> {
    if (this.currentActive >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }

    this.currentActive++;

    // Apply anti-ban randomized jitter (150ms - 350ms)
    const jitter =
      Math.floor(Math.random() * (this.maxJitterMs - this.minJitterMs + 1)) +
      this.minJitterMs;

    if (jitter > 0) {
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  /**
   * Releases concurrency slot and dispatches next queued request if any.
   */
  release(): void {
    this.currentActive = Math.max(0, this.currentActive - 1);

    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Executes an asynchronous operation through the traffic gate.
   */
  async execute<T>(operationName: string, fn: () => Promise<T>): Promise<T> {
    if (this.currentActive >= this.maxConcurrent) {
      logger.debug(
        'TRAFFIC_GATE',
        `Throttling "${operationName}": concurrency limit reached (${this.currentActive}/${this.maxConcurrent}, queue: ${this.waitQueue.length})`
      );
    }
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Current active concurrency count.
   */
  getActiveCount(): number {
    return this.currentActive;
  }

  /**
   * Current pending queue length.
   */
  getQueueLength(): number {
    return this.waitQueue.length;
  }
}

// Global singleton instance for all Plumware outbound operations
export const upstreamTrafficGate = new UpstreamTrafficGate();
