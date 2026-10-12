import type { Request, Response, NextFunction } from 'express';
import type { MasterTimetableService } from '../services/master_timetable.service.js';
import { TimetableInferenceService } from '../services/timetable_inference.service.js';
import { ScheduleResolver } from '../services/schedule_resolver.service.js';
import {
  TimetableQuerySchema,
  InferenceQuerySchema,
  TimetableSyncPayloadSchema,
} from '../types/timetable.js';
import type { StudentGroupProfile } from '../types/academic.js';

/**
 * Controller exposing Universal Timetable Explorer, auto-inference,
 * and on-demand cache sync endpoints.
 */
export class TimetableController {
  constructor(private readonly masterTimetableService: MasterTimetableService) {}

  /**
   * GET /api/v1/timetable/query
   * Public universal timetable lookup with auto-inferred smart defaults.
   */
  queryTimetable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = TimetableQuerySchema.parse(req.query);

      // Auto-infer semester if not explicitly specified
      let resolvedSemester = query.semester;
      if (!resolvedSemester) {
        // Assume freshman / 1st semester or infer from branch defaults
        const dummyInference = TimetableInferenceService.inferFromRollNumber(
          `2026U${query.branch.slice(0, 2)}1001`
        );
        resolvedSemester = dummyInference.currentSemester;
      }

      const masterTimetable = await this.masterTimetableService.getMasterTimetable({
        program: query.program,
        branch: query.branch,
        semester: resolvedSemester,
        section: query.section,
        group: query.group,
      });

      // If group is specified and not 'All', resolve filtered view
      let filteredSchedule = undefined;
      if (query.group && query.group.toUpperCase() !== 'ALL') {
        const syntheticProfile: StudentGroupProfile = {
          defaultGroup: query.group,
          courseGroups: {},
          componentGroups: {},
          registeredCourses: [],
        };
        filteredSchedule = ScheduleResolver.resolvePersonalizedSchedule(
          masterTimetable,
          syntheticProfile,
          { targetGroupOverride: query.group }
        );
      }

      res.status(200).json({
        status: 'success',
        data: {
          queryMeta: {
            program: query.program,
            branch: query.branch,
            semester: resolvedSemester,
            section: query.section,
            group: query.group,
            isCached: masterTimetable.isCached ?? false,
          },
          timetable: masterTimetable,
          filteredSchedule,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/timetable/infer
   * Auto-infers academic standing, semester, branch, and defaults from a roll number.
   */
  inferAcademicStanding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = InferenceQuerySchema.parse(req.query);
      const inference = TimetableInferenceService.inferFromRollNumber(query.rollNo, new Date(), {
        strict: true,
      });

      res.status(200).json({
        status: 'success',
        data: inference,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/timetable/sync
   * Forces re-sync and cache warming for a master section timetable.
   */
  syncTimetable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = TimetableSyncPayloadSchema.parse(req.body);
      const timetable = await this.masterTimetableService.syncMasterTimetable(payload);

      res.status(200).json({
        status: 'success',
        data: {
          message: 'Master section timetable successfully synced and warmed in cache.',
          timetable,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
