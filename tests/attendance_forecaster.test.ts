import { describe, it, expect } from 'vitest';
import { AttendanceForecaster } from '../src/services/attendance_forecaster.service.js';
import type { SubjectAttendance } from '../src/types/academic.js';
import type { PersonalizedStudentSchedule } from '../src/types/timetable.js';

describe('Audit Vector 4: Cross-Engine Attendance Forecaster', () => {
  const mockSubjects: SubjectAttendance[] = [
    {
      courseCode: 'FCCS0102',
      courseName: 'Object Oriented Programming',
      totalClasses: 20,
      present: 18,
      absent: 2,
      percentage: 90.0,
      bunkMargin: 4,
      classesNeededFor75: 0,
      status: 'SAFE',
      remarks: [],
      integrityAudit: {
        portalReported: { totalHeld: 20, totalPresent: 18, totalAbsent: 2 },
        calculatedSum: { totalHeld: 20, totalPresent: 18, totalAbsent: 2 },
        delta: { heldDelta: 0, presentDelta: 0, absentDelta: 0 },
        hasDiscrepancy: false,
      },
    },
    {
      courseCode: 'FCCS0104',
      courseName: 'Data Structures and Algorithms',
      totalClasses: 19,
      present: 15,
      absent: 4,
      percentage: 78.95,
      bunkMargin: 1,
      classesNeededFor75: 0,
      status: 'WARNING',
      remarks: [],
      integrityAudit: {
        portalReported: { totalHeld: 19, totalPresent: 15, totalAbsent: 4 },
        calculatedSum: { totalHeld: 19, totalPresent: 15, totalAbsent: 4 },
        delta: { heldDelta: 0, presentDelta: 0, absentDelta: 0 },
        hasDiscrepancy: false,
      },
    },
    {
      courseCode: 'FCEE0106',
      courseName: 'Basic Electrical Engineering',
      totalClasses: 18,
      present: 12,
      absent: 6,
      percentage: 66.67,
      bunkMargin: 0,
      classesNeededFor75: 6,
      status: 'CRITICAL',
      remarks: [],
      integrityAudit: {
        portalReported: { totalHeld: 18, totalPresent: 12, totalAbsent: 6 },
        calculatedSum: { totalHeld: 18, totalPresent: 12, totalAbsent: 6 },
        delta: { heldDelta: 0, presentDelta: 0, absentDelta: 0 },
        hasDiscrepancy: false,
      },
    },
  ];

  // Schedule with a 1-hour lecture and a 2-hour practical lab on Tuesday
  const mockSchedule: PersonalizedStudentSchedule = {
    rollNo: '2024UCB1234',
    program: 'B.Tech',
    branch: 'CSB',
    semester: 5,
    section: '1',
    assignedGroup: 'G1',
    totalWeeklyClasses: 2,
    weeklyLectureHours: 1,
    weeklyPracticalHours: 2,
    weeklyTutorialHours: 0,
    resolvedAt: Date.now(),
    schedule: {
      Monday: [],
      Tuesday: [
        {
          startTime: '09:00',
          endTime: '10:00',
          periodIndex: 0,
          courseCode: 'FCCS0102',
          courseName: 'Object Oriented Programming',
          component: 'Lecture',
          group: 'All',
          room: 'LT-1',
          faculty: 'Prof. Sharma',
          spanHours: 1,
        },
        {
          // Multi-hour practical lab: 2 hours (10:00 to 12:00)
          startTime: '10:00',
          endTime: '12:00',
          periodIndex: 1,
          courseCode: 'FCCS0104',
          courseName: 'Data Structures Lab',
          component: 'Practical',
          group: 'G1',
          room: 'DSA Lab',
          faculty: 'Dr. Rajesh',
          spanHours: 2,
        },
      ],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
    },
  };

  describe('Multi-Hour Weighting & Projection Parity', () => {
    it('increments held counter by 2 (not 1) for a 2-hour practical lab when attended', () => {
      const forecast = AttendanceForecaster.forecastDailyAttendance(mockSubjects, mockSchedule, {
        targetDay: 'Tuesday',
        defaultAction: 'ATTEND',
      });

      expect(forecast.targetDay).toBe('Tuesday');
      expect(forecast.totalCommitmentsToday).toBe(2);
      expect(forecast.totalScheduledHours).toBe(3); // 1h lecture + 2h lab = 3 hours

      // FCCS0104 had 19 held, 15 present. Lab is 2 hours. Attended => +2 held, +2 present!
      const dsaMetric = forecast.courses.find((c) => c.courseCode === 'FCCS0104');
      expect(dsaMetric).toBeDefined();
      expect(dsaMetric?.totalWeightHours).toBe(2);
      expect(dsaMetric?.currentHeld).toBe(19);
      expect(dsaMetric?.currentPresent).toBe(15);
      expect(dsaMetric?.projectedHeld).toBe(21); // 19 + 2 = 21 (INCREMENTED BY 2!)
      expect(dsaMetric?.projectedPresent).toBe(17); // 15 + 2 = 17
      // 17 / 21 * 100 = 80.95%
      expect(dsaMetric?.projectedPercentage).toBe(80.95);
      expect(dsaMetric?.status).toBe('SAFE'); // Promoted from WARNING (78.95%) to SAFE!
    });

    it('increments held counter by 2 and present by 0 when 2-hour lab is BUNKED', () => {
      const forecast = AttendanceForecaster.forecastDailyAttendance(mockSubjects, mockSchedule, {
        targetDay: 'Tuesday',
        customActions: {
          FCCS0104: 'BUNK',
        },
      });

      const dsaMetric = forecast.courses.find((c) => c.courseCode === 'FCCS0104');
      expect(dsaMetric).toBeDefined();
      expect(dsaMetric?.projectedHeld).toBe(21); // 19 + 2 = 21 (INCREMENTED BY 2!)
      expect(dsaMetric?.projectedPresent).toBe(15); // 15 + 0 = 15 (Present unchanged)
      // 15 / 21 * 100 = 71.43%
      expect(dsaMetric?.projectedPercentage).toBe(71.43);
      expect(dsaMetric?.status).toBe('CRITICAL'); // Dipped below 75%!
      expect(dsaMetric?.projectedBunkMargin).toBe(0);
      expect(dsaMetric?.classesNeededFor75).toBe(3); // ceil(3*21 - 4*15) = 63 - 60 = 3
    });

    it('leaves counters unchanged for UNCONDUCTED classes', () => {
      const forecast = AttendanceForecaster.forecastDailyAttendance(mockSubjects, mockSchedule, {
        targetDay: 'Tuesday',
        customActions: {
          FCCS0104: 'UNCONDUCTED',
        },
      });

      const dsaMetric = forecast.courses.find((c) => c.courseCode === 'FCCS0104');
      expect(dsaMetric?.projectedHeld).toBe(19);
      expect(dsaMetric?.projectedPresent).toBe(15);
      expect(dsaMetric?.projectedPercentage).toBe(78.95);
    });
  });

  describe('Mathematical Invariant Checks', () => {
    it('adheres to strict decimal clamping between 0.00% and 100.00% with 2 decimal places', () => {
      expect(AttendanceForecaster.computePercentage(10, 10)).toBe(100.0);
      expect(AttendanceForecaster.computePercentage(0, 10)).toBe(0.0);
      expect(AttendanceForecaster.computePercentage(12, 10)).toBe(100.0); // Clamped to 100.0
      expect(AttendanceForecaster.computePercentage(0, 0)).toBe(100.0); // Safe default for unheld
      expect(AttendanceForecaster.computePercentage(1, 3)).toBe(33.33); // 2 decimal places
      expect(AttendanceForecaster.computePercentage(2, 3)).toBe(66.67); // 2 decimal places
    });

    it('calculates bunk margin and restoration requirements accurately', () => {
      // 18 present out of 20 held: floor((4*18 - 3*20)/3) = floor(12/3) = 4
      expect(AttendanceForecaster.computeBunkMargin(18, 20)).toBe(4);
      expect(AttendanceForecaster.computeClassesNeeded(18, 20)).toBe(0);

      // 12 present out of 18 held (66.67%): margin 0, needed ceil(3*18 - 4*12) = 54 - 48 = 6
      expect(AttendanceForecaster.computeBunkMargin(12, 18)).toBe(0);
      expect(AttendanceForecaster.computeClassesNeeded(12, 18)).toBe(6);
    });

    it('aggregates overall projected telemetry with delta calculation', () => {
      const forecast = AttendanceForecaster.forecastDailyAttendance(mockSubjects, mockSchedule, {
        targetDay: 'Tuesday',
        defaultAction: 'ATTEND',
      });

      // Total held: 20 + 19 + 18 = 57. Total present: 18 + 15 + 12 = 45.
      // Overall % = 45 / 57 * 100 = 78.95%
      expect(forecast.currentOverall.totalHeld).toBe(57);
      expect(forecast.currentOverall.totalPresent).toBe(45);
      expect(forecast.currentOverall.percentage).toBe(78.95);

      // Tuesday adds 3 hours (1h FCCS0102 + 2h FCCS0104). Both attended: +3 held, +3 present.
      // Projected held: 60. Projected present: 48.
      // Projected % = 48 / 60 * 100 = 80.00%
      expect(forecast.projectedOverall.totalHeld).toBe(60);
      expect(forecast.projectedOverall.totalPresent).toBe(48);
      expect(forecast.projectedOverall.percentage).toBe(80.0);
      expect(forecast.projectedOverall.deltaPercentage).toBe(1.05);
      expect(forecast.projectedOverall.status).toBe('SAFE');
    });
  });
});
