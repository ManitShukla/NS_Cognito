import { Router } from 'express';
import { createAuthRouter } from './auth.routes.js';
import { createStudentRouter } from './student.routes.js';
import type { AuthController } from '../controllers/auth.controller.js';
import type { StudentController } from '../controllers/student.controller.js';

export function createApiRouter(
  authController: AuthController,
  studentController: StudentController
): Router {
  const router = Router();

  // Health check endpoint
  router.get('/health', authController.healthCheck);

  // Authentication endpoints
  router.use('/v1/auth', createAuthRouter(authController));

  // Student academic telemetry endpoints
  router.use('/v1/student', createStudentRouter(studentController));

  return router;
}
