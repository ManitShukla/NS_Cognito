import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AttendanceForecaster } from '../src/services/attendance_forecaster.service.js';
import type { SubjectAttendance } from '../src/types/academic.js';
import type { PersonalizedStudentSchedule } from '../src/types/timetable.js';

describe('Audit Vector Gate: Post-Phase 4 Full-Stack Verification', () => {
  it('Vector 1: Strict 0px Geometry Mandate - zero prohibited rounded classes', () => {
    const clientDir = path.resolve(process.cwd(), 'client');
    const files: string[] = [];

    function collectFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (/\.(tsx|ts|html|css)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    collectFiles(clientDir);
    expect(files.length).toBeGreaterThan(0);

    const prohibitedPattern = /\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/;
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const match = content.match(prohibitedPattern);
      expect(match, `Prohibited rounded class found in ${f}: ${match?.[0]}`).toBeNull();
    }
  });

  it('Vector 1: Flat Swiss Aesthetic - zero decorative drop-shadow classes on components', () => {
    const clientDir = path.resolve(process.cwd(), 'client');
    const files: string[] = [];

    function collectComponentFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectComponentFiles(fullPath);
        } else if (/\.(tsx|ts)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    collectComponentFiles(clientDir);

    const prohibitedShadowPattern = /\bshadow-(sm|md|lg|xl|2xl|inner)\b/;
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const match = content.match(prohibitedShadowPattern);
      expect(match, `Prohibited drop-shadow found in ${f}: ${match?.[0]}`).toBeNull();
    }
  });

  it('Vector 1: Viewfinder corner reticles are exactly 4px tick marks', () => {
    const globalsCss = fs.readFileSync(path.resolve(process.cwd(), 'client/styles/globals.css'), 'utf8');
    expect(globalsCss).toContain('width: 4px;');
    expect(globalsCss).toContain('height: 4px;');
  });

  it('Vector 5: Reduced motion accessibility is declared in globals.css', () => {
    const globalsCss = fs.readFileSync(path.resolve(process.cwd(), 'client/styles/globals.css'), 'utf8');
    expect(globalsCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globalsCss).toContain('animation-duration: 0.01ms !important;');
  });

  it('Vector 3: Mathematical simulation parity & multi-hour weighting', () => {
    const testSubjects: SubjectAttendance[] = [
      {
        courseCode: 'CSB01',
        courseName: 'DBMS Lab',
        totalClasses: 20,
        present: 15,
        absent: 5,
        percentage: 75.0,
        bunkMargin: 0,
        classesNeededFor75: 0,
        status: 'SAFE',
        remarks: [],
        integrityAudit: {
          portalReported: { totalHeld: 20, totalPresent: 15, totalAbsent: 5 },
          calculatedSum: { totalHeld: 20, totalPresent: 15, totalAbsent: 5 },
          delta: { heldDelta: 0, presentDelta: 0, absentDelta: 0 },
          hasDiscrepancy: false,
        },
      },
    ];

    const testSchedule: PersonalizedStudentSchedule = {
      rollNo: '2024UCB1234',
      program: 'B.Tech',
      branch: 'CSB',
      semester: 5,
      section: '1',
      assignedGroup: 'G1',
      totalWeeklyClasses: 1,
      weeklyLectureHours: 0,
      weeklyPracticalHours: 2,
      weeklyTutorialHours: 0,
      resolvedAt: Date.now(),
      schedule: {
        Monday: [
          {
            startTime: '11:00',
            endTime: '13:00',
            periodIndex: 3,
            courseCode: 'CSB01',
            courseName: 'DBMS Lab',
            component: 'Practical',
            group: 'G1',
            room: 'Lab 2',
            faculty: 'Prof. Verma',
            spanHours: 2, // 2-hour lab
          },
        ],
        Tuesday: [],
        Wednesday: [],
        Thursday: [],
        Friday: [],
        Saturday: [],
      },
    };

    // Case A: Attended 2-hour lab
    const forecastAttended = AttendanceForecaster.forecastDailyAttendance(testSubjects, testSchedule, {
      targetDay: 'Monday',
      customActions: { CSB01: 'ATTEND' },
    });

    expect(forecastAttended.projectedOverall.totalHeld).toBe(22); // +2
    expect(forecastAttended.projectedOverall.totalPresent).toBe(17); // +2
    expect(forecastAttended.projectedOverall.percentage).toBe(77.27); // (17/22)*100 = 77.27%
    expect(forecastAttended.projectedOverall.deltaPercentage).toBe(2.27);

    // Case B: Bunked 2-hour lab
    const forecastBunked = AttendanceForecaster.forecastDailyAttendance(testSubjects, testSchedule, {
      targetDay: 'Monday',
      customActions: { CSB01: 'BUNK' },
    });

    expect(forecastBunked.projectedOverall.totalHeld).toBe(22); // +2
    expect(forecastBunked.projectedOverall.totalPresent).toBe(15); // +0
    expect(forecastBunked.projectedOverall.percentage).toBe(68.18); // (15/22)*100 = 68.18%
    expect(forecastBunked.projectedOverall.deltaPercentage).toBe(-6.82);
  });

  it('Vector 4: Public isolation - Explorer endpoints work without any auth headers', async () => {
    const { app } = createApp();

    // 1. Auto-infer endpoint
    const inferRes = await request(app).get('/api/v1/timetable/infer?rollNo=2024UCB1234');
    expect(inferRes.status).toBe(200);
    expect(inferRes.body.status).toBe('success');
    expect(inferRes.body.data.branchCode).toBe('CSB');
    expect(inferRes.body.data.currentSemester).toBe(5);

    // 2. Query endpoint
    const queryRes = await request(app).get('/api/v1/timetable/query?branch=CSB&semester=5&section=1');
    expect(queryRes.status).toBe(200);
    expect(queryRes.body.status).toBe('success');
    expect(queryRes.body.data.timetable.branch).toBe('CSB');
    expect(queryRes.body.data.queryMeta.branch).toBe('CSB');
  });
});
