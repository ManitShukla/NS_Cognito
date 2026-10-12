import { upstreamTrafficGate } from '../adapters/plumware/upstream_traffic_gate.js';
import { upstreamMonitor } from './upstream_monitor.service.js';

export interface StatusCodeBreakdown {
  '2xx': number;
  '3xx': number;
  '4xx': number;
  '5xx': number;
}

export class TelemetryMetricsService {
  private startTime = Date.now();
  private totalRequests = 0;
  private statusCodes: StatusCodeBreakdown = {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  };

  /**
   * Tracks an incoming HTTP response status.
   */
  recordRequest(statusCode: number): void {
    this.totalRequests++;
    if (statusCode >= 200 && statusCode < 300) {
      this.statusCodes['2xx']++;
    } else if (statusCode >= 300 && statusCode < 400) {
      this.statusCodes['3xx']++;
    } else if (statusCode >= 400 && statusCode < 500) {
      this.statusCodes['4xx']++;
    } else if (statusCode >= 500) {
      this.statusCodes['5xx']++;
    }
  }

  /**
   * Returns instantaneous performance snapshot.
   */
  getMetrics() {
    const mem = process.memoryUsage();
    return {
      node: {
        startTime: this.startTime,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
        nodeVersion: process.version,
        pid: process.pid,
      },
      memory: {
        rssMb: +(mem.rss / (1024 * 1024)).toFixed(2),
        heapUsedMb: +(mem.heapUsed / (1024 * 1024)).toFixed(2),
        heapTotalMb: +(mem.heapTotal / (1024 * 1024)).toFixed(2),
        externalMb: +(mem.external / (1024 * 1024)).toFixed(2),
      },
      requests: {
        total: this.totalRequests,
        statusBreakdown: { ...this.statusCodes },
      },
      upstreamTrafficGate: {
        activeConcurrentRequests: upstreamTrafficGate.getActiveCount(),
        waitQueueLength: upstreamTrafficGate.getQueueLength(),
      },
      upstreamCanary: upstreamMonitor.getStatus(),
    };
  }

  /**
   * Resets metrics counters for testing.
   */
  reset(): void {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.statusCodes = {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
    };
  }
}

export const telemetryMetrics = new TelemetryMetricsService();
