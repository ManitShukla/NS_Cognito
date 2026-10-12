import type { Request, Response, NextFunction } from 'express';
import type { AttendanceEngineService } from '../services/attendance_engine.service.js';
import type { SessionEngineService } from '../services/session_engine.service.js';
import type { MasterTimetableService } from '../services/master_timetable.service.js';
import { TimetableInferenceService } from '../services/timetable_inference.service.js';
import { ScheduleResolver } from '../services/schedule_resolver.service.js';
import { AttendanceForecaster } from '../services/attendance_forecaster.service.js';
import { RequestValidationError } from '../utils/errors.js';

export class StudentController {
  constructor(
    private readonly attendanceEngine: AttendanceEngineService,
    private readonly sessionEngine?: SessionEngineService,
    private readonly masterTimetableService?: MasterTimetableService
  ) {}

  /**
   * Helper extracting sessionToken from headers or query parameters.
   */
  private extractSessionToken(req: Request): string {
    const headerToken = req.headers['x-session-token'] as string | undefined;
    const authHeader = req.headers['authorization'];
    let bearerToken: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      bearerToken = authHeader.slice(7).trim();
    }

    const queryToken = req.query['sessionToken'] as string | undefined;
    const bodyToken = req.body?.['sessionToken'] as string | undefined;

    const token = headerToken || bearerToken || queryToken || bodyToken;

    if (!token) {
      throw new RequestValidationError('Missing required sessionToken. Provide via x-session-token header or body.');
    }

    return token;
  }

  /**
   * GET /api/v1/student/attendance
   * Returns parsed attendance matrix, per-course metrics, bunk margins, and recovery projections.
   */
  getAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionToken = this.extractSessionToken(req);
      const data = await this.attendanceEngine.getStudentAttendance(sessionToken);

      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/student/registered-courses
   * Returns student's registered courses and sub-batch group profile.
   */
  getRegisteredCourses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionToken = this.extractSessionToken(req);
      const data = await this.attendanceEngine.getStudentGroupProfile(sessionToken);

      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST or GET /api/v1/student/dashboard
   * Unified telemetry endpoint returning combined academic standing, attendance metrics, and group allocations.
   */
  getDashboardProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionToken = this.extractSessionToken(req);
      const data = await this.attendanceEngine.getStudentAcademicProfile(sessionToken);

      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET or POST /api/v1/student/schedule
   * Resolves the master section timetable against the student's sub-batch group assignments.
   */
  getSchedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionToken = this.extractSessionToken(req);

      // 1. Retrieve authenticated session state
      let rollNo = '2024UCB1234';
      let cookieJar = undefined;

      if (this.sessionEngine) {
        const session = await this.sessionEngine.getAuthenticatedSession(sessionToken);
        rollNo = session.rollNo || rollNo;
        cookieJar = session.cookieJar;
      }

      // 2. Extract student's registered groups
      const groupProfile = await this.attendanceEngine.getStudentGroupProfile(sessionToken);

      // 3. Deduce academic coordinates from roll number
      const inference = TimetableInferenceService.inferFromRollNumber(rollNo);

      // 4. Fetch master section timetable
      let masterTimetable;
      if (this.masterTimetableService) {
        masterTimetable = await this.masterTimetableService.getMasterTimetable(
          {
            program: inference.program,
            branch: inference.branchCode,
            semester: inference.currentSemester,
            section: inference.defaultSection,
            group: groupProfile.defaultGroup || 'All',
          },
          cookieJar
        );
      } else {
        // Fallback default
        const blueprintService = new (await import('../services/master_timetable.service.js')).MasterTimetableService();
        masterTimetable = await blueprintService.getMasterTimetable({
          program: inference.program,
          branch: inference.branchCode,
          semester: inference.currentSemester,
          section: inference.defaultSection,
          group: groupProfile.defaultGroup || 'All',
        });
      }

      // 5. Run conflict resolution engine
      const personalizedSchedule = ScheduleResolver.resolvePersonalizedSchedule(
        masterTimetable,
        groupProfile,
        { rollNo }
      );

      res.status(200).json({
        status: 'success',
        data: personalizedSchedule,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET or POST /api/v1/student/forecast
   * Simulates forward-looking attendance projections combining live matrix and personal schedule.
   */
  getForecast = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionToken = this.extractSessionToken(req);

      // 1. Fetch live attendance profile
      const academicProfile = await this.attendanceEngine.getStudentAcademicProfile(sessionToken);

      // 2. Retrieve authenticated session state for timetable
      let rollNo = academicProfile.rollNo || '2024UCB1234';
      let cookieJar = undefined;
      if (this.sessionEngine) {
        const session = await this.sessionEngine.getAuthenticatedSession(sessionToken);
        rollNo = session.rollNo || rollNo;
        cookieJar = session.cookieJar;
      }

      // 3. Resolve personal schedule
      const inference = TimetableInferenceService.inferFromRollNumber(rollNo);
      let masterTimetable;
      if (this.masterTimetableService) {
        masterTimetable = await this.masterTimetableService.getMasterTimetable(
          {
            program: inference.program,
            branch: inference.branchCode,
            semester: inference.currentSemester,
            section: inference.defaultSection,
            group: academicProfile.groupProfile.defaultGroup || 'All',
          },
          cookieJar
        );
      } else {
        const blueprintService = new (await import('../services/master_timetable.service.js')).MasterTimetableService();
        masterTimetable = await blueprintService.getMasterTimetable({
          program: inference.program,
          branch: inference.branchCode,
          semester: inference.currentSemester,
          section: inference.defaultSection,
          group: academicProfile.groupProfile.defaultGroup || 'All',
        });
      }

      const personalizedSchedule = ScheduleResolver.resolvePersonalizedSchedule(
        masterTimetable,
        academicProfile.groupProfile,
        { rollNo }
      );

      // 4. Run AttendanceForecaster
      const payload = req.method === 'POST' ? req.body : req.query;
      const forecast = AttendanceForecaster.forecastDailyAttendance(
        academicProfile.subjects,
        personalizedSchedule,
        payload
      );

      res.status(200).json({
        status: 'success',
        data: forecast,
      });
    } catch (error) {
      next(error);
    }
  };
}
