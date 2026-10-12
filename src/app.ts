import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createApiRouter } from './routes/index.js';
import { AuthController } from './controllers/auth.controller.js';
import { StudentController } from './controllers/student.controller.js';
import { SessionEngineService } from './services/session_engine.service.js';
import { AttendanceEngineService } from './services/attendance_engine.service.js';
import { createSessionStore } from './adapters/cache/index.js';
import { PlumwareHttpClient } from './adapters/plumware/plumware_http_client.js';
import { requestLogger } from './middleware/request_logger.js';
import { errorHandler } from './middleware/error_handler.js';
import type { ISessionStore } from './adapters/cache/session_store.interface.js';

export interface AppContext {
  app: Express;
  sessionStore: ISessionStore;
  sessionEngine: SessionEngineService;
  attendanceEngine: AttendanceEngineService;
}

export function createApp(): AppContext {
  const app = express();

  // Security headers & CORS
  app.use(helmet());
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

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

  const authController = new AuthController(sessionEngine);
  const studentController = new StudentController(attendanceEngine);

  // Mount API endpoints
  app.use('/api', createApiRouter(authController, studentController));

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
  };
}
