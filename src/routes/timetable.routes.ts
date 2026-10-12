import { Router } from 'express';
import type { TimetableController } from '../controllers/timetable.controller.js';
import { timetableRateLimiter } from '../middleware/rate_limiter.js';

export function createTimetableRouter(timetableController: TimetableController): Router {
  const router = Router();

  // Apply timetable rate limiter
  router.use(timetableRateLimiter);

  /**
   * @route GET /api/v1/timetable/query
   * @desc Public universal timetable query with smart inferential defaults
   */
  router.get('/query', timetableController.queryTimetable);

  /**
   * @route GET /api/v1/timetable/infer
   * @desc Auto-infer academic standing, branch, and semester from roll number
   */
  router.get('/infer', timetableController.inferAcademicStanding);

  /**
   * @route POST /api/v1/timetable/sync
   * @desc Force re-sync and warm cache for a master section timetable
   */
  router.post('/sync', timetableController.syncTimetable);

  return router;
}
