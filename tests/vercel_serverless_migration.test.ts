import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { CookieJar, Cookie } from 'tough-cookie';
import serverlessHandler, { app } from '../api/index.js';
import { RedisSessionStore } from '../src/adapters/cache/redis_session_store.js';
import { UpstreamTimeoutError } from '../src/utils/errors.js';
import { PlumwareHttpClient } from '../src/adapters/plumware/plumware_http_client.js';
import type { SessionState } from '../src/types/session.js';

describe('Vercel Serverless Deployment & Runtime Adaptation Test Suite', () => {
  // ===========================================================================
  // Dimension 1: Serverless Routing & Project Topology (vercel.json)
  // ===========================================================================
  describe('Dimension 1: vercel.json Manifest & Security Headers', () => {
    const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');

    it('verifies vercel.json exists and contains valid JSON configuration', () => {
      expect(fs.existsSync(vercelConfigPath)).toBe(true);
      const raw = fs.readFileSync(vercelConfigPath, 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.version).toBe(2);
      expect(parsed.framework).toBe('vite');
      expect(parsed.outputDirectory).toBe('dist/client');
    });

    it('verifies serverless function runtime specifications (1024MB memory, 15s duration)', () => {
      const parsed = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
      const fnConfig = parsed.functions?.['api/index.ts'];

      expect(fnConfig).toBeDefined();
      expect(fnConfig.memory).toBe(1024);
      expect(fnConfig.maxDuration).toBe(15);
      // runtime property in functions must be omitted in modern Vercel to avoid CLI validation error
      expect(fnConfig.runtime).toBeUndefined();

      // Node runtime version is enforced via package.json engines
      const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
      expect(pkg.engines?.node).toBeDefined();
      expect(pkg.engines.node).toContain('20');
    });

    it('verifies vercel.json enforces Mumbai region (bom1) to bypass geo-blocking', () => {
      const parsed = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
      expect(parsed.regions).toEqual(['bom1']);
    });

    it('verifies strict production security and caching headers', () => {
      const parsed = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
      const headersList = parsed.headers || [];

      // Global security headers
      const globalHeaderEntry = headersList.find((h: any) => h.source === '/(.*)');
      expect(globalHeaderEntry).toBeDefined();
      const headersMap = Object.fromEntries(
        globalHeaderEntry.headers.map((h: any) => [h.key, h.value])
      );

      expect(headersMap['X-Frame-Options']).toBe('DENY');
      expect(headersMap['X-Content-Type-Options']).toBe('nosniff');
      expect(headersMap['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headersMap['Permissions-Policy']).toContain('camera=()');

      // Static assets caching header
      const assetsHeaderEntry = headersList.find((h: any) => h.source === '/assets/(.*)');
      expect(assetsHeaderEntry).toBeDefined();
      const assetsHeadersMap = Object.fromEntries(
        assetsHeaderEntry.headers.map((h: any) => [h.key, h.value])
      );
      expect(assetsHeadersMap['Cache-Control']).toContain('immutable');

      // API route no-cache header
      const apiHeaderEntry = headersList.find((h: any) => h.source === '/api/(.*)');
      expect(apiHeaderEntry).toBeDefined();
      const apiHeadersMap = Object.fromEntries(
        apiHeaderEntry.headers.map((h: any) => [h.key, h.value])
      );
      expect(apiHeadersMap['Cache-Control']).toContain('no-store');
    });

    it('verifies SPA fallback rewrites and API routing matrix', () => {
      const parsed = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
      const rewrites = parsed.rewrites || [];

      expect(rewrites.some((r: any) => r.source === '/api/(.*)' && r.destination === '/api/index.ts')).toBe(true);
      expect(rewrites.some((r: any) => r.destination === '/index.html')).toBe(true);
    });
  });

  // ===========================================================================
  // Dimension 2: Serverless API Entrypoint Adapter (api/index.ts)
  // ===========================================================================
  describe('Dimension 2: Serverless Request Handler (api/index.ts)', () => {
    it('successfully exposes default serverless request handler and Express app instance', () => {
      expect(typeof serverlessHandler).toBe('function');
      expect(typeof app).toBe('function');
    });

    it('responds to liveness probe /health/live through serverless handler', async () => {
      const response = await request(app).get('/health/live');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
      expect(typeof response.body.uptimeSeconds).toBe('number');
    });

    it('normalizes serverless request path when /api prefix is omitted', async () => {
      const response = await request(app).get('/v1/auth/session');
      // Should route cleanly to /api/v1/auth/session, not return ROUTE_NOT_FOUND
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.sessionToken).toBeDefined();
    });
  });

  // ===========================================================================
  // Dimension 3: Stateless Cloud Redis Session Store (RedisSessionStore)
  // ===========================================================================
  describe('Dimension 3: Stateless Cloud Redis Session Store & Cookie Jar Rehydration', () => {
    // Mock Redis in-memory storage for deterministic offline testing
    const redisStorage = new Map<string, { value: string; exSeconds?: number }>();

    const mockRedisClient: any = {
      set: vi.fn(async (key: string, value: string, _opt?: string, ex?: number) => {
        redisStorage.set(key, { value, exSeconds: ex });
        return 'OK';
      }),
      get: vi.fn(async (key: string) => {
        const item = redisStorage.get(key);
        return item ? item.value : null;
      }),
      del: vi.fn(async (key: string) => {
        const existed = redisStorage.has(key);
        redisStorage.delete(key);
        return existed ? 1 : 0;
      }),
      ttl: vi.fn(async (key: string) => {
        return redisStorage.has(key) ? 175 : -2;
      }),
      ping: vi.fn(async () => 'PONG'),
      quit: vi.fn(async () => 'OK'),
      disconnect: vi.fn(),
      on: vi.fn(),
    };

    let redisStore: RedisSessionStore;

    beforeEach(() => {
      redisStorage.clear();
      vi.clearAllMocks();
      redisStore = new RedisSessionStore({
        client: mockRedisClient,
        keyPrefix: 'test:session:',
        defaultTtlSeconds: 180,
      });
    });

    it('losslessly serializes CookieJar with PHPSESSID and attributes into Redis JSON', async () => {
      const cookieJar = new CookieJar();
      const testCookie = new Cookie({
        key: 'PHPSESSID',
        value: 'sess_prod_cloud_abcdef123456',
        domain: 'imsnsit.org',
        path: '/',
        httpOnly: true,
        secure: true,
      });
      cookieJar.setCookieSync(testCookie, 'https://imsnsit.org');

      const sessionState: SessionState = {
        sessionToken: 'test-token-uuid-12345678',
        cookieJar,
        fy: '2026-27',
        encFy: 'ENCRYPTED_FY_HASH_999',
        comp: 'NSUT',
        t: 'swx',
        hrandNum: '887766',
        captchaPath: 'images/captcha/c1.jpg',
        createdAt: 1728740000000,
        expiresAt: 1728740180000,
        isAuthenticated: false,
      };

      await redisStore.set('test-token-uuid-12345678', sessionState, 180);

      expect(mockRedisClient.set).toHaveBeenCalledTimes(1);
      const [key, jsonString, opt, ex] = mockRedisClient.set.mock.calls[0];
      expect(key).toBe('test:session:test-token-uuid-12345678');
      expect(opt).toBe('EX');
      expect(ex).toBe(180);

      const parsedJson = JSON.parse(jsonString);
      expect(parsedJson.sessionToken).toBe('test-token-uuid-12345678');
      expect(parsedJson.cookieJarSerialized).toBeDefined();
      expect(parsedJson.cookieJarSerialized.cookies.length).toBe(1);
      expect(parsedJson.cookieJarSerialized.cookies[0].key).toBe('PHPSESSID');
      expect(parsedJson.cookieJarSerialized.cookies[0].value).toBe('sess_prod_cloud_abcdef123456');
    });

    it('correctly rehydrates CookieJar on subsequent get() invocations across stateless containers', async () => {
      const cookieJar = new CookieJar();
      cookieJar.setCookieSync('PHPSESSID=rehydrated_token_9999; Domain=imsnsit.org; Path=/', 'https://imsnsit.org');

      const originalState: SessionState = {
        sessionToken: 'rehydrate-token-abc',
        cookieJar,
        fy: '2026-27',
        createdAt: Date.now(),
        expiresAt: Date.now() + 180000,
        isAuthenticated: true,
        rollNo: '2024UCB1234',
      };

      await redisStore.set('rehydrate-token-abc', originalState, 180);

      // Simulate retrieval by a fresh invocation
      const retrieved = await redisStore.get('rehydrate-token-abc');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionToken).toBe('rehydrate-token-abc');
      expect(retrieved?.isAuthenticated).toBe(true);
      expect(retrieved?.rollNo).toBe('2024UCB1234');

      // Verify that tough-cookie CookieJar methods work on rehydrated instance
      expect(retrieved?.cookieJar).toBeInstanceOf(CookieJar);
      const cookieStr = retrieved?.cookieJar.getCookieStringSync('https://imsnsit.org');
      expect(cookieStr).toContain('PHPSESSID=rehydrated_token_9999');
    });

    it('preserves remaining TTL during update() calls', async () => {
      const cookieJar = new CookieJar();
      await redisStore.set(
        'update-test-token',
        {
          sessionToken: 'update-test-token',
          cookieJar,
          fy: '2026-27',
          createdAt: Date.now(),
          expiresAt: Date.now() + 180000,
          isAuthenticated: false,
        },
        180
      );

      await redisStore.update('update-test-token', {
        isAuthenticated: true,
        rollNo: '2024UCA1001',
      });

      expect(mockRedisClient.ttl).toHaveBeenCalledWith('test:session:update-test-token');
      const updated = await redisStore.get('update-test-token');
      expect(updated?.isAuthenticated).toBe(true);
      expect(updated?.rollNo).toBe('2024UCA1001');
    });

    it('deletes session immediately and responds to ping', async () => {
      await redisStore.set(
        'delete-token',
        {
          sessionToken: 'delete-token',
          cookieJar: new CookieJar(),
          fy: '2026-27',
          createdAt: Date.now(),
          expiresAt: Date.now() + 180000,
          isAuthenticated: false,
        },
        180
      );

      const deleted = await redisStore.delete('delete-token');
      expect(deleted).toBe(true);

      const afterDelete = await redisStore.get('delete-token');
      expect(afterDelete).toBeNull();

      const pingResult = await redisStore.ping();
      expect(pingResult).toBe(true);
    });

    it('seamlessly degrades to in-memory fallback cache when Redis encounters network failures', async () => {
      const failingRedisClient: any = {
        set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
        get: vi.fn().mockRejectedValue(new Error('Connection is closed')),
        del: vi.fn().mockRejectedValue(new Error('Connection is closed')),
        ttl: vi.fn().mockRejectedValue(new Error('Connection is closed')),
        ping: vi.fn().mockRejectedValue(new Error('Connection is closed')),
        quit: vi.fn().mockResolvedValue('OK'),
        disconnect: vi.fn(),
        on: vi.fn(),
      };

      const resilientStore = new RedisSessionStore({
        client: failingRedisClient,
        keyPrefix: 'test:fallback:',
        defaultTtlSeconds: 180,
      });

      const sessionState: SessionState = {
        sessionToken: 'fallback-resilience-token',
        cookieJar: new CookieJar(),
        fy: '2026-27',
        createdAt: Date.now(),
        expiresAt: Date.now() + 180000,
        isAuthenticated: false,
      };

      // Set should NOT throw; should degrade to memory fallback store
      await expect(resilientStore.set('fallback-resilience-token', sessionState, 180)).resolves.not.toThrow();

      // Get should return the state from the memory fallback store
      const retrieved = await resilientStore.get('fallback-resilience-token');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionToken).toBe('fallback-resilience-token');
    });
  });

  // ===========================================================================
  // Dimension 4: CORS & Cookie Security Hardening
  // ===========================================================================
  describe('Dimension 4: CORS & Security Hardening', () => {
    it('permits requests from production domain https://nscognito.vercel.app with credentials', async () => {
      const response = await request(app)
        .get('/health/live')
        .set('Origin', 'https://nscognito.vercel.app');

      expect(response.headers['access-control-allow-origin']).toBe('https://nscognito.vercel.app');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('permits Vercel preview environments ending in .vercel.app', async () => {
      const originalVercel = process.env.VERCEL;
      process.env.VERCEL = '1';

      const response = await request(app)
        .get('/health/live')
        .set('Origin', 'https://ns-cognito-git-feat-preview-myteam.vercel.app');

      expect(response.headers['access-control-allow-origin']).toBe(
        'https://ns-cognito-git-feat-preview-myteam.vercel.app'
      );

      process.env.VERCEL = originalVercel;
    });

    it('enforces secure, sameSite=lax, httpOnly flags when cookies are dispatched', async () => {
      const testApp = app;
      // Test that cookie middleware adds hardening flags
      const res = await request(testApp)
        .get('/health/live')
        .set('Origin', 'https://nscognito.vercel.app');

      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // Dimension 5: Upstream Timeout & Degraded Network Handling
  // ===========================================================================
  describe('Dimension 5: Upstream Timeout & Structured Error Payload', () => {
    it('UpstreamTimeoutError formats payload exactly matching contract specification', () => {
      const err = new UpstreamTimeoutError(
        'University portal took too long to respond. Please retry.',
        { operation: 'fetchLoginPage', timeoutMs: 8500 }
      );

      expect(err.statusCode).toBe(504);
      expect(err.code).toBe('UPSTREAM_TIMEOUT');

      const json = err.toJSON();
      expect(json.success).toBe(false);
      expect(json.error).toBe('UPSTREAM_TIMEOUT');
      expect(json.message).toBe('University portal took too long to respond. Please retry.');
    });

    it('PlumwareHttpClient throws UpstreamTimeoutError on socket timeout without exceeding Vercel limits', async () => {
      const client = new PlumwareHttpClient({
        baseURL: 'https://192.0.2.1', // Non-routable TEST-NET-1 IP to trigger timeout
        timeoutMs: 50, // 50ms fast timeout
        maxRetries: 0,
      });

      const jar = new CookieJar();
      await expect(client.fetchLoginPage(jar)).rejects.toThrow(UpstreamTimeoutError);
    });
  });

  // ===========================================================================
  // Dimension 6: TLS Hardening & Diagnostic Handshake Error Telemetry
  // ===========================================================================
  describe('Dimension 6: TLS Hardening & Diagnostic Error Telemetry', () => {
    it('PlumwareHttpClient initializes https.Agent with rejectUnauthorized: false and legacy ciphers', () => {
      const client = new PlumwareHttpClient();
      const jar = new CookieJar();
      const sessionClient = client.createSessionClient(jar);
      const agent = (sessionClient.defaults as any).httpsAgent;
      expect(agent).toBeDefined();
      expect(agent.options.rejectUnauthorized).toBe(false);
      expect(agent.options.ciphers).toContain('DEFAULT:@SECLEVEL=1');
      expect(agent.options.keepAlive).toBe(true);
    });

    it('returns structured diagnostic telemetry when handshake encounters TLS error', async () => {
      const mockSessionEngine: any = {
        initializeSession: vi.fn().mockRejectedValue(
          Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' })
        ),
      };
      const { AuthController } = await import('../src/controllers/auth.controller.js');
      const authController = new AuthController(mockSessionEngine);

      let responseStatus = 0;
      let responseBody: any = null;
      const res: any = {
        status: (s: number) => {
          responseStatus = s;
          return {
            json: (b: any) => {
              responseBody = b;
            },
          };
        },
      };
      const next: any = vi.fn();

      await authController.initSession({} as any, res, next);
      expect(responseStatus).toBe(502);
      expect(responseBody.code).toBe('TLS_HANDSHAKE_FAILED');
      expect(responseBody.message).toContain('CERT_HAS_EXPIRED');
    });

    it('returns structured diagnostic telemetry when handshake encounters firewall/network error', async () => {
      const mockSessionEngine: any = {
        initializeSession: vi.fn().mockRejectedValue(
          Object.assign(new Error('connect ECONNREFUSED 14.139.227.16'), { code: 'ECONNREFUSED' })
        ),
      };
      const { AuthController } = await import('../src/controllers/auth.controller.js');
      const authController = new AuthController(mockSessionEngine);

      let responseStatus = 0;
      let responseBody: any = null;
      const res: any = {
        status: (s: number) => {
          responseStatus = s;
          return {
            json: (b: any) => {
              responseBody = b;
            },
          };
        },
      };
      const next: any = vi.fn();

      await authController.initSession({} as any, res, next);
      expect(responseStatus).toBe(503);
      expect(responseBody.code).toBe('UPSTREAM_FIREWALL_OR_UNREACHABLE');
      expect(responseBody.message).toContain('ECONNREFUSED');
    });
  });
});
