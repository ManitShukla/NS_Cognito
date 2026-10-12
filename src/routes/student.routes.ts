import { Router } from 'express';
import type { StudentController } from '../controllers/student.controller.js';

export function createStudentRouter(studentController: StudentController): Router {
  const router = Router();

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

  return router;
}
