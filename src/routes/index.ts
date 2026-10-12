import { Router } from 'express';
import { createAuthRouter } from './auth.routes.js';
import { createStudentRouter } from './student.routes.js';
import { createTimetableRouter } from './timetable.routes.js';
import type { AuthController } from '../controllers/auth.controller.js';
import type { StudentController } from '../controllers/student.controller.js';
import type { TimetableController } from '../controllers/timetable.controller.js';
import { upstreamMonitor } from '../services/upstream_monitor.service.js';
import { telemetryMetrics } from '../services/telemetry_metrics.service.js';

export function createApiRouter(
  authController: AuthController,
  studentController: StudentController,
  timetableController: TimetableController
): Router {
  const router = Router();

  // Health check & observability endpoints
  router.get('/health', authController.healthCheck);
  router.get('/health/upstream', (_req, res) => {
    res.json({
      status: 'success',
      data: upstreamMonitor.getStatus(),
    });
  });
  router.get('/health/metrics', (_req, res) => {
    res.json({
      status: 'success',
      data: telemetryMetrics.getMetrics(),
    });
  });

  // Authentication endpoints
  router.use('/v1/auth', createAuthRouter(authController));

  // Student academic telemetry endpoints
  router.use('/v1/student', createStudentRouter(studentController));

  // Timetable scheduling & explorer endpoints
  router.use('/v1/timetable', createTimetableRouter(timetableController));

  return router;
}
