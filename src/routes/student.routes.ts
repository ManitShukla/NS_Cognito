import { Router } from 'express';
import type { StudentController } from '../controllers/student.controller.js';
import { studentRateLimiter } from '../middleware/rate_limiter.js';

export function createStudentRouter(studentController: StudentController): Router {
  const router = Router();

  // Apply student telemetry rate limiter
  router.use(studentRateLimiter);

  /**
   * @route GET /api/v1/student/attendance
   * @desc Retrieve parsed attendance matrix, bunk margins, and recovery requirements
   */
  router.get('/attendance', studentController.getAttendance);

  /**
   * @route GET /api/v1/student/registered-courses
   * @desc Retrieve enrolled subjects and resolved sub-batch lab/tutorial groups
   */
  router.get('/registered-courses', studentController.getRegisteredCourses);

  /**
   * @route GET or POST /api/v1/student/dashboard
   * @desc Unified student academic telemetry profile
   */
  router.get('/dashboard', studentController.getDashboardProfile);
  router.post('/dashboard', studentController.getDashboardProfile);

  /**
   * @route GET or POST /api/v1/student/schedule
   * @desc Personalized student timetable with sub-batch conflict resolution
   */
  router.get('/schedule', studentController.getSchedule);
  router.post('/schedule', studentController.getSchedule);

  /**
   * @route GET or POST /api/v1/student/forecast
   * @desc Simulated forward-looking attendance projections combining live matrix & schedule
   */
  router.get('/forecast', studentController.getForecast);
  router.post('/forecast', studentController.getForecast);

  return router;
}
