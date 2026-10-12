import type { SubjectAttendance, AttendanceStatus } from '../types/academic.js';
import type { PersonalizedStudentSchedule, DayOfWeek } from '../types/timetable.js';
import type {
  ForecastAction,
  ForecastRequestPayload,
  ProjectedAttendanceForecast,
  ProjectedCourseMetric,
} from '../types/forecasting.js';
import { logger } from '../utils/logger.js';

/**
 * Cross-engine simulator predicting the exact impact of today's classes
 * on student attendance percentages, safe bunk margins, and 75% thresholds.
 *
 * Implements Multi-Hour Weighting (2-hour practical labs increment held counter by 2)
 * and strict decimal clamping to 2 decimal places in [0.00, 100.00].
 */
export class AttendanceForecaster {
  /**
   * Generates a forward-looking attendance projection for a given calendar day.
   */
  public static forecastDailyAttendance(
    subjects: SubjectAttendance[],
    schedule: PersonalizedStudentSchedule,
    options?: ForecastRequestPayload
  ): ProjectedAttendanceForecast {
    // 1. Determine target day (default to today or Monday if Sunday)
    const dayNames: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayIndex = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    const defaultDay: DayOfWeek = (currentDayIndex >= 1 && currentDayIndex <= 6)
      ? dayNames[currentDayIndex - 1]
      : 'Monday';

    const targetDay: DayOfWeek = options?.targetDay || defaultDay;
    const defaultAction: ForecastAction = options?.defaultAction || 'ATTEND';
    const customActions = options?.customActions || {};

    // 2. Fetch today's personalized commitments
    const todaySlots = schedule.schedule[targetDay] || [];
    const totalCommitmentsToday = todaySlots.length;

    // Group scheduled commitments by courseCode, tracking total hours (multi-hour weighting)
    const scheduledByCourse = new Map<string, { count: number; totalHours: number; sampleName: string }>();

    let totalScheduledHours = 0;
    for (const slot of todaySlots) {
      const code = slot.courseCode.toUpperCase();
      const hours = slot.spanHours && slot.spanHours > 0 ? slot.spanHours : 1;
      totalScheduledHours += hours;

      const existing = scheduledByCourse.get(code);
      if (existing) {
        existing.count += 1;
        existing.totalHours += hours;
      } else {
        scheduledByCourse.set(code, {
          count: 1,
          totalHours: hours,
          sampleName: slot.courseName || slot.courseCode,
        });
      }
    }

    // 3. Map across all enrolled subjects
    const subjectMap = new Map<string, SubjectAttendance>();
    for (const sub of subjects) {
      subjectMap.set(sub.courseCode.toUpperCase(), sub);
    }

    // Include courses scheduled today that may not yet appear in subject attendance (e.g. fresh term)
    const allCourseCodes = new Set<string>([
      ...subjectMap.keys(),
      ...scheduledByCourse.keys(),
    ]);

    const projectedCourses: ProjectedCourseMetric[] = [];

    let currentTotalHeld = 0;
    let currentTotalPresent = 0;
    let projectedTotalHeld = 0;
    let projectedTotalPresent = 0;

    for (const code of allCourseCodes) {
      const subject = subjectMap.get(code);
      const scheduled = scheduledByCourse.get(code);

      const courseName = subject?.courseName || scheduled?.sampleName || code;
      const currentHeld = subject ? subject.totalClasses : 0;
      const currentPresent = subject ? subject.present : 0;
      const currentPercentage = subject
        ? subject.percentage
        : 100.0;
      const currentBunkMargin = subject ? subject.bunkMargin : 0;

      currentTotalHeld += currentHeld;
      currentTotalPresent += currentPresent;

      const classesScheduledToday = scheduled ? scheduled.count : 0;
      const totalWeightHours = scheduled ? scheduled.totalHours : 0;

      // Determine simulated action for this course
      const action: ForecastAction = customActions[code] || defaultAction;

      let deltaHeld = 0;
      let deltaPresent = 0;

      if (classesScheduledToday > 0) {
        if (action === 'ATTEND') {
          // Multi-Hour Weighting: 2-hour lab increments held by 2 and present by 2
          deltaHeld = totalWeightHours;
          deltaPresent = totalWeightHours;
        } else if (action === 'BUNK') {
          // Multi-Hour Weighting: 2-hour lab increments held by 2 and present by 0
          deltaHeld = totalWeightHours;
          deltaPresent = 0;
        } else {
          // UNCONDUCTED: 0 change
          deltaHeld = 0;
          deltaPresent = 0;
        }
      }

      const projectedHeld = currentHeld + deltaHeld;
      const projectedPresent = currentPresent + deltaPresent;

      // Calculate projected percentage with strict decimal clamping [0.00, 100.00]
      const projectedPercentage = this.computePercentage(projectedPresent, projectedHeld);
      const deltaPercentage = Number((projectedPercentage - currentPercentage).toFixed(2));

      // Calculate new safe bunk margin and classes needed for 75%
      const projectedBunkMargin = this.computeBunkMargin(projectedPresent, projectedHeld);
      const classesNeededFor75 = this.computeClassesNeeded(projectedPresent, projectedHeld);
      const status = this.classifyStatus(projectedPercentage);

      projectedTotalHeld += projectedHeld;
      projectedTotalPresent += projectedPresent;

      projectedCourses.push({
        courseCode: code,
        courseName,
        classesScheduledToday,
        totalWeightHours,
        action,
        currentHeld,
        currentPresent,
        currentPercentage,
        currentBunkMargin,
        projectedHeld,
        projectedPresent,
        projectedPercentage,
        projectedBunkMargin,
        classesNeededFor75,
        deltaPercentage,
        status,
      });
    }

    // Sort projected courses alphabetically by courseCode
    projectedCourses.sort((a, b) => a.courseCode.localeCompare(b.courseCode));

    // 4. Compute overall attendance metrics
    const currentOverallPct = this.computePercentage(currentTotalPresent, currentTotalHeld);
    const currentOverallBunk = this.computeBunkMargin(currentTotalPresent, currentTotalHeld);
    const currentOverallStatus = this.classifyStatus(currentOverallPct);

    const projectedOverallPct = this.computePercentage(projectedTotalPresent, projectedTotalHeld);
    const projectedOverallBunk = this.computeBunkMargin(projectedTotalPresent, projectedTotalHeld);
    const projectedOverallDelta = Number((projectedOverallPct - currentOverallPct).toFixed(2));
    const projectedOverallStatus = this.classifyStatus(projectedOverallPct);

    logger.debug('FORECAST', `Generated attendance forecast for ${targetDay}: ${totalScheduledHours}h scheduled across ${totalCommitmentsToday} classes`, {
      currentOverallPct,
      projectedOverallPct,
    });

    return {
      targetDay,
      totalCommitmentsToday,
      totalScheduledHours,
      courses: projectedCourses,
      currentOverall: {
        totalHeld: currentTotalHeld,
        totalPresent: currentTotalPresent,
        percentage: currentOverallPct,
        bunkMargin: currentOverallBunk,
        status: currentOverallStatus,
      },
      projectedOverall: {
        totalHeld: projectedTotalHeld,
        totalPresent: projectedTotalPresent,
        percentage: projectedOverallPct,
        bunkMargin: projectedOverallBunk,
        deltaPercentage: projectedOverallDelta,
        status: projectedOverallStatus,
      },
      forecastGeneratedAt: Date.now(),
    };
  }

  /**
   * Helper computing strictly clamped, 2-decimal attendance percentage.
   */
  public static computePercentage(present: number, held: number): number {
    if (held <= 0) return 100.0;
    const raw = (present / held) * 100;
    const clamped = Math.min(100.0, Math.max(0.0, raw));
    return Number(clamped.toFixed(2));
  }

  /**
   * Helper computing safe bunk margin at 75% university threshold.
   * Formula: floor((4 * Present - 3 * Held) / 3)
   */
  public static computeBunkMargin(present: number, held: number): number {
    if (held <= 0) return 0;
    const margin = Math.floor((4 * present - 3 * held) / 3);
    return Math.max(0, margin);
  }

  /**
   * Helper computing classes needed to restore attendance to 75%.
   * Formula: ceil(3 * Held - 4 * Present)
   */
  public static computeClassesNeeded(present: number, held: number): number {
    if (held <= 0) return 0;
    const needed = Math.ceil(3 * held - 4 * present);
    return Math.max(0, needed);
  }

  /**
   * Categorizes attendance percentage into academic risk status.
   */
  public static classifyStatus(percentage: number): AttendanceStatus {
    if (percentage >= 80.0) return 'SAFE';
    if (percentage >= 75.0) return 'WARNING';
    return 'CRITICAL';
  }
}
