import { z } from 'zod';
import type { DayOfWeek } from './timetable.js';
import type { AttendanceStatus } from './academic.js';

export type ForecastAction = 'ATTEND' | 'BUNK' | 'UNCONDUCTED';

export const ForecastActionSchema = z.enum(['ATTEND', 'BUNK', 'UNCONDUCTED']);

export interface ForecastRequestPayload {
  targetDay?: DayOfWeek;
  customActions?: Record<string, ForecastAction>;
  defaultAction?: ForecastAction;
}

export const ForecastRequestSchema = z.object({
  targetDay: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).optional(),
  customActions: z.record(z.string(), ForecastActionSchema).optional(),
  defaultAction: ForecastActionSchema.optional().default('ATTEND'),
});

export interface ProjectedCourseMetric {
  courseCode: string;
  courseName: string;
  classesScheduledToday: number;
  totalWeightHours: number;
  action: ForecastAction;
  currentHeld: number;
  currentPresent: number;
  currentPercentage: number;
  currentBunkMargin: number;
  projectedHeld: number;
  projectedPresent: number;
  projectedPercentage: number;
  projectedBunkMargin: number;
  classesNeededFor75: number;
  deltaPercentage: number;
  status: AttendanceStatus;
}

export interface ProjectedAttendanceForecast {
  targetDay: DayOfWeek;
  totalCommitmentsToday: number;
  totalScheduledHours: number;
  courses: ProjectedCourseMetric[];
  currentOverall: {
    totalHeld: number;
    totalPresent: number;
    percentage: number;
    bunkMargin: number;
    status: AttendanceStatus;
  };
  projectedOverall: {
    totalHeld: number;
    totalPresent: number;
    percentage: number;
    bunkMargin: number;
    deltaPercentage: number;
    status: AttendanceStatus;
  };
  forecastGeneratedAt: number;
}
