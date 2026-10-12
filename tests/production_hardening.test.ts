import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp, type AppContext } from '../src/app.js';
import {
  sanitizeLogPayload,
  maskRollNumber,
  maskSessionToken,
} from '../src/middleware/payload_sanitizer.js';
import { UpstreamTrafficGate } from '../src/adapters/plumware/upstream_traffic_gate.js';
import {
  createRateLimiter,
  resetRateLimits,
} from '../src/middleware/rate_limiter.js';
import { UpstreamMonitorService } from '../src/services/upstream_monitor.service.js';
import { TelemetryMetricsService } from '../src/services/telemetry_metrics.service.js';
import { CronService } from '../src/services/cron.service.js';
import { PlumwareHttpClient } from '../src/adapters/plumware/plumware_http_client.js';

describe('Phase 5: Production Hardening & Operational Resilience Test Suite', () => {
  let context: AppContext;

  beforeEach(() => {
    resetRateLimits();
    context = createApp();
  });

  afterEach(async () => {
    resetRateLimits();
    await context.sessionStore.destroy();
    vi.restoreAllMocks();
  });

  describe('Vector 1: Zero-Persistence Credential Sanitization', () => {
    it('masks roll numbers preserving prefix and terminal digits', () => {
      expect(maskRollNumber('2024UCB1234')).toBe('2024***1234');
      expect(maskRollNumber('2021UCO0001')).toBe('2021***0001');
      expect(maskRollNumber('SHORT')).toBe('***');
    });

    it('masks session tokens to first 8 characters', () => {
      expect(maskSessionToken('d3b07384-d113-4e86-904c-123456789abc')).toBe('d3b07384...');
      expect(maskSessionToken('1234')).toBe('***');
    });

    it('recursively scrubs sensitive fields from deep objects and arrays', () => {
      const sensitiveData = {
        student: {
          rollNo: '2024UCB1234',
          password: 'SuperSecretPassword!',
          nested: {
            captcha_text: '94821',
            PHPSESSID: 'sess_abc123xyz456',
            cookie: 'SWX_SESS=999',
            auth_token: 'secret-bearer-token',
          },
        },
        records: [
          { password: 'another-password', note: 'Public info' },
          { roll_no: '2023CSAI0099' },
        ],
      };

      const sanitized = sanitizeLogPayload(sensitiveData) as Record<string, unknown>;

      expect(sanitized).toBeDefined();
      const student = sanitized.student as Record<string, unknown>;
      expect(student.password).toBe('[REDACTED]');
      expect(student.rollNo).toBe('2024***1234');

      const nested = student.nested as Record<string, unknown>;
      expect(nested.captcha_text).toBe('[REDACTED]');
      expect(nested.PHPSESSID).toBe('[REDACTED]');
      expect(nested.cookie).toBe('[REDACTED]');
      expect(nested.auth_token).toBe('[REDACTED]');

      const records = sanitized.records as Array<Record<string, unknown>>;
      expect(records[0].password).toBe('[REDACTED]');
      expect(records[0].note).toBe('Public info');
      expect(records[1].roll_no).toBe('2023***0099');
    });
  });

  describe('Vector 2: Upstream Traffic Gate & Concurrency Throttling', () => {
    it('limits concurrent operations and releases slots reliably on error', async () => {
      const gate = new UpstreamTrafficGate({
        maxConcurrent: 2,
        minJitterMs: 5,
        maxJitterMs: 10,
      });

      let inFlight = 0;
      let peakConcurrency = 0;

      const task = async () => {
        return gate.execute('test-task', async () => {
          inFlight++;
          peakConcurrency = Math.max(peakConcurrency, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 30));
          inFlight--;
          return true;
        });
      };

      // Dispatch 5 concurrent tasks
      await Promise.all([task(), task(), task(), task(), task()]);

      expect(peakConcurrency).toBeLessThanOrEqual(2);
      expect(gate.getActiveCount()).toBe(0);
      expect(gate.getQueueLength()).toBe(0);
    });

    it('releases concurrency slot even when wrapped operation throws', async () => {
      const gate = new UpstreamTrafficGate({
        maxConcurrent: 1,
        minJitterMs: 5,
        maxJitterMs: 10,
      });

      await expect(
        gate.execute('failing-task', async () => {
          throw new Error('Upstream socket exploded');
        })
      ).rejects.toThrow('Upstream socket exploded');

      expect(gate.getActiveCount()).toBe(0);
    });
  });

  describe('Vector 3: External Client Rate Limiting (429 & Retry-After)', () => {
    it('blocks excessive requests and attaches standard Retry-After headers', async () => {
      const app = express();
      const testLimiter = createRateLimiter({
        windowMs: 1000,
        max: 3,
        keyPrefix: 'test-limit',
      });

      app.get('/test-rate-limit', testLimiter, (_req, res) => {
        res.status(200).json({ status: 'ok' });
      });

      // Requests 1, 2, 3 should succeed
      for (let i = 0; i < 3; i++) {
        const res = await request(app).get('/test-rate-limit');
        expect(res.status).toBe(200);
        expect(res.headers['ratelimit-limit']).toBe('3');
      }

      // 4th request must be rate limited to 429
      const blockedRes = await request(app).get('/test-rate-limit');
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(blockedRes.headers['retry-after']).toBeDefined();
      expect(blockedRes.body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Vector 4: Anti-Replay Session Protection', () => {
    it('rejects authentication attempt if session token is already authenticated', async () => {
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchLoginPage').mockResolvedValue({
        html: `<html><body>
          <input type="hidden" name="enc_fy" value="ENC_TOKEN">
          <select name="fy"><option value="2026-27" selected>2026-27</option></select>
          <img id="captchaimg" src="images/captcha/mock.jpg">
        </body></html>`,
        statusCode: 200,
      });
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchCaptchaBuffer').mockResolvedValue(
        Buffer.from('MOCK_JPEG')
      );

      const sessionRes = await request(context.app).get('/api/v1/auth/session');
      const token = sessionRes.body.data.sessionToken;

      // Mock successful login with valid Plumware session indicators
      vi.spyOn(PlumwareHttpClient.prototype, 'submitLogin').mockResolvedValue({
        html: `<html><body><a href="logout.php">Logout</a><div id="student_menu">Welcome to Student Portal</div></body></html>`,
        statusCode: 200,
      });

      // First login succeeds
      const firstLogin = await request(context.app).post('/api/v1/auth/login').send({
        sessionToken: token,
        rollNo: '2024UCB1234',
        password: 'CorrectPassword',
        captchaText: '12345',
      });
      expect(firstLogin.status).toBe(200);

      // Attempting to re-authenticate with the exact same session must be rejected with 409 Conflict
      const secondLogin = await request(context.app).post('/api/v1/auth/login').send({
        sessionToken: token,
        rollNo: '2024UCB1234',
        password: 'CorrectPassword',
        captchaText: '12345',
      });
      expect(secondLogin.status).toBe(409);
      expect(secondLogin.body.code).toBe('SESSION_ALREADY_USED');
    });

    it('burns CAPTCHA reference on failed login, preventing replay of challenge', async () => {
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchLoginPage').mockResolvedValue({
        html: `<html><body>
          <input type="hidden" name="enc_fy" value="ENC_TOKEN">
          <select name="fy"><option value="2026-27" selected>2026-27</option></select>
          <img id="captchaimg" src="images/captcha/mock.jpg">
        </body></html>`,
        statusCode: 200,
      });
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchCaptchaBuffer').mockResolvedValue(
        Buffer.from('MOCK_JPEG')
      );

      const sessionRes = await request(context.app).get('/api/v1/auth/session');
      const token = sessionRes.body.data.sessionToken;

      // Mock Plumware invalid credentials response
      vi.spyOn(PlumwareHttpClient.prototype, 'submitLogin').mockResolvedValue({
        html: `<font color=red size=2>Invalid Login..Please try again</font>`,
        statusCode: 200,
      });

      // First attempt fails with 401
      const firstAttempt = await request(context.app).post('/api/v1/auth/login').send({
        sessionToken: token,
        rollNo: '2024UCB1234',
        password: 'WrongPassword',
        captchaText: '12345',
      });
      expect(firstAttempt.status).toBe(401);

      // Submitting the same session token again without refreshing CAPTCHA must be rejected as consumed
      const secondAttempt = await request(context.app).post('/api/v1/auth/login').send({
        sessionToken: token,
        rollNo: '2024UCB1234',
        password: 'WrongPassword',
        captchaText: '12345',
      });
      expect(secondAttempt.status).toBe(410);
      expect(secondAttempt.body.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('Vector 5: Observability, Health Probes & Canary Monitor', () => {
    it('GET /health/live returns 200 with process liveness info', async () => {
      const res = await request(context.app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
      expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /health/ready returns 200 with cache readiness info', async () => {
      const res = await request(context.app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.upstreamStatus).toBeDefined();
    });

    it('GET /api/health/upstream returns live canary telemetry', async () => {
      const monitor = new UpstreamMonitorService();
      monitor.setMockState('degraded', 'Simulated 4000ms latency');

      const res = await request(context.app).get('/api/health/upstream');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.state).toBeDefined();
      expect(res.body.data.targetUrl).toContain('imsnsit.org');
    });

    it('GET /api/health/metrics returns telemetry counters and gate status', async () => {
      const res = await request(context.app).get('/api/health/metrics');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.node).toBeDefined();
      expect(res.body.data.memory).toBeDefined();
      expect(res.body.data.requests).toBeDefined();
      expect(res.body.data.upstreamTrafficGate).toBeDefined();
      expect(res.body.data.upstreamCanary).toBeDefined();
    });

    it('TelemetryMetricsService tracks HTTP status code distribution', () => {
      const metrics = new TelemetryMetricsService();
      metrics.recordRequest(200);
      metrics.recordRequest(201);
      metrics.recordRequest(304);
      metrics.recordRequest(401);
      metrics.recordRequest(502);

      const snapshot = metrics.getMetrics();
      expect(snapshot.requests.total).toBe(5);
      expect(snapshot.requests.statusBreakdown['2xx']).toBe(2);
      expect(snapshot.requests.statusBreakdown['3xx']).toBe(1);
      expect(snapshot.requests.statusBreakdown['4xx']).toBe(1);
      expect(snapshot.requests.statusBreakdown['5xx']).toBe(1);
    });
  });

  describe('Vector 6: Master Cache Pre-Warming Worker (CronService)', () => {
    it('executes pre-warming pass across targets and records metrics', async () => {
      const cron = new CronService({
        masterTimetableService: context.masterTimetableService,
        branches: ['CSAI', 'CSB'],
        semesters: [1],
        sections: ['1'],
      });

      const report = await cron.prewarmMasterCache();

      expect(report.totalTargets).toBe(2);
      expect(report.warmedCount).toBe(2);
      expect(report.failedCount).toBe(0);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
      expect(cron.getLastReport()).toEqual(report);
      expect(cron.isActive()).toBe(false);
    });
  });
});
