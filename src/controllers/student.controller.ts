import type { Request, Response, NextFunction } from 'express';
import type { AttendanceEngineService } from '../services/attendance_engine.service.js';
import { RequestValidationError } from '../utils/errors.js';

export class StudentController {
  constructor(private readonly attendanceEngine: AttendanceEngineService) {}

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
}
