import express, { type Express } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import { createApiRouter } from './routes/index.js';
import { AuthController } from './controllers/auth.controller.js';
import { StudentController } from './controllers/student.controller.js';
import { TimetableController } from './controllers/timetable.controller.js';
import { SessionEngineService } from './services/session_engine.service.js';
import { AttendanceEngineService } from './services/attendance_engine.service.js';
import { MasterTimetableService } from './services/master_timetable.service.js';
import { createSessionStore } from './adapters/cache/index.js';
import { PlumwareHttpClient } from './adapters/plumware/plumware_http_client.js';
import { requestLogger } from './middleware/request_logger.js';
import { errorHandler } from './middleware/error_handler.js';
import type { ISessionStore } from './adapters/cache/session_store.interface.js';
import { upstreamMonitor, UpstreamMonitorService } from './services/upstream_monitor.service.js';
import { telemetryMetrics, TelemetryMetricsService } from './services/telemetry_metrics.service.js';

export interface AppContext {
  app: Express;
  sessionStore: ISessionStore;
  sessionEngine: SessionEngineService;
  attendanceEngine: AttendanceEngineService;
  masterTimetableService: MasterTimetableService;
  upstreamMonitor: UpstreamMonitorService;
  telemetryMetrics: TelemetryMetricsService;
}

export function createApp(): AppContext {
  const app = express();

  // Security headers & strict CORS
  app.use(helmet());

  const allowedOrigins = [
    'https://nscognito.vercel.app',
    process.env.CORS_ORIGIN,
    process.env.APP_URL,
    ...(process.env.NODE_ENV !== 'production'
      ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173']
      : []),
  ].filter(Boolean) as string[];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (origin.endsWith('.vercel.app')) {
          return callback(null, true);
        }
        if (process.env.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
          return callback(null, true);
        }
        // Decline CORS gracefully without unhandled 500 exceptions
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-session-token', 'Cookie', 'X-Requested-With'],
      exposedHeaders: ['Set-Cookie'],
    })
  );

  // Cookie Security Hardening: enforce Secure, SameSite=Lax, HttpOnly
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  app.use((_req, res, next) => {
    const originalCookie = res.cookie.bind(res);
    res.cookie = (name: string, val: unknown, options: express.CookieOptions = {}) => {
      const hardenedOptions: express.CookieOptions = {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        ...options,
      };
      return originalCookie(name, val, hardenedOptions);
    };
    next();
  });

  // Serverless URL normalization middleware (handles edge rewrites)
  app.use((req, _res, next) => {
    if (!req.url.startsWith('/api') && !req.url.startsWith('/health')) {
      const isApiRoute =
        req.url.startsWith('/v1') ||
        req.url.startsWith('/auth') ||
        req.url.startsWith('/student') ||
        req.url.startsWith('/timetable');
      if (isApiRoute) {
        req.url = `/api${req.url}`;
      }
    }
    next();
  });

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Telemetry request logging
  app.use(requestLogger);

  // Initialize service dependencies
  const sessionStore = createSessionStore();
  const httpClient = new PlumwareHttpClient();
  const sessionEngine = new SessionEngineService({
    sessionStore,
    httpClient,
  });
  const attendanceEngine = new AttendanceEngineService({
    sessionStore,
    httpClient,
  });
  const masterTimetableService = new MasterTimetableService({
    httpClient,
  });

  const authController = new AuthController(sessionEngine);
  const studentController = new StudentController(
    attendanceEngine,
    sessionEngine,
    masterTimetableService
  );
  const timetableController = new TimetableController(masterTimetableService);

  // Orchestrator Liveness Probe
  app.get('/health/live', (_req, res) => {
    res.status(200).json({
      status: 'alive',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: Date.now(),
    });
  });

  // Orchestrator Readiness Probe
  app.get('/health/ready', async (_req, res) => {
    try {
      await sessionStore.get('readiness-probe-check');
      res.status(200).json({
        status: 'ready',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
        upstreamStatus: upstreamMonitor.getStatus().state,
      });
    } catch (err: unknown) {
      res.status(503).json({
        status: 'not_ready',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Mount API endpoints
  app.use(
    '/api',
    createApiRouter(authController, studentController, timetableController)
  );

  // Serve static frontend build if present
  const clientDist = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(clientDist, 'index.html'));
      }
      next();
    });
  }

  // 404 Not Found fallback
  app.use((_req, res) => {
    res.status(404).json({
      status: 'error',
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested endpoint was not found on this telemetry node.',
    });
  });

  // Global error handler
  app.use(errorHandler);

  return {
    app,
    sessionStore,
    sessionEngine,
    attendanceEngine,
    masterTimetableService,
    upstreamMonitor,
    telemetryMetrics,
  };
}
