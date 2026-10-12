import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../src/app.js';
import { PlumwareHttpClient } from '../src/adapters/plumware/plumware_http_client.js';
import { CookieJar } from 'tough-cookie';
import type { SessionState } from '../src/types/session.js';

describe('Timetable API Endpoints Integration', () => {
  let context: AppContext;
  const testToken = '7c123456-ff48-4bcb-9dcd-5e75272ea4e9';

  const readFixture = (filename: string): string => {
    const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', filename);
    return fs.readFileSync(fixturePath, 'utf-8');
  };

  beforeEach(async () => {
    context = createApp();

    // Prime an authenticated session into transient memory store
    const mockSessionState: SessionState = {
      sessionToken: testToken,
      cookieJar: new CookieJar(),
      encFy: 'MOCK_ENC_FY',
      fy: '2026-27',
      createdAt: Date.now(),
      expiresAt: Date.now() + 180000,
      isAuthenticated: true,
      rollNo: '2024UCB1234',
    };

    await context.sessionStore.set(testToken, mockSessionState, 180);
  });

  afterEach(async () => {
    await context.sessionStore.destroy();
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/timetable/query (Universal Explorer)', () => {
    it('returns 200 with master section timetable for valid branch and semester', async () => {
      const res = await request(context.app)
        .get('/api/v1/timetable/query')
        .query({
          branch: 'CSB',
          semester: 1,
          section: '1',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.queryMeta.branch).toBe('CSB');
      expect(res.body.data.queryMeta.semester).toBe(1);
      expect(res.body.data.timetable.timeHeaders.length).toBe(8);
      expect(res.body.data.timetable.grid['Monday']).toBeDefined();
    });

    it('auto-infers semester when semester parameter is omitted', async () => {
      const res = await request(context.app)
        .get('/api/v1/timetable/query')
        .query({
          branch: 'CSB',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.queryMeta.semester).toBeGreaterThanOrEqual(1);
    });

    it('provides filtered sub-batch schedule when group is specified', async () => {
      const res = await request(context.app)
        .get('/api/v1/timetable/query')
        .query({
          branch: 'CSB',
          semester: 1,
          section: '1',
          group: 'G1',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.filteredSchedule).toBeDefined();
      expect(res.body.data.filteredSchedule.assignedGroup).toBe('G1');
      expect(res.body.data.filteredSchedule.schedule['Tuesday']).toBeDefined();
    });

    it('returns 422 when branch code is invalid or missing', async () => {
      const res = await request(context.app)
        .get('/api/v1/timetable/query')
        .query({
          branch: 'A', // too short
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/timetable/infer (Smart Auto-Inference)', () => {
    it('returns deterministic academic standing inferred from roll number', async () => {
      const res = await request(context.app)
        .get('/api/v1/timetable/infer')
        .query({
          rollNo: '2024UCB1234',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.rollNo).toBe('2024UCB1234');
      expect(res.body.data.program).toBe('B.Tech');
      expect(res.body.data.branchCode).toBe('CSB');
      expect(res.body.data.admissionYear).toBe(2024);
      expect(res.body.data.academicYear).toBe('2026-27');
    });

    it('returns 422 when roll number is missing or too short', async () => {
      const res = await request(context.app)
        .get('/api/v1/timetable/infer')
        .query({
          rollNo: '12',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/timetable/sync (On-Demand Cache Warming)', () => {
    it('forces cache refresh and returns 200 with synced timetable', async () => {
      const res = await request(context.app)
        .post('/api/v1/timetable/sync')
        .send({
          branch: 'CSB',
          semester: 1,
          section: '1',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.timetable.branch).toBe('CSB');
      expect(res.body.data.timetable.semester).toBe(1);
    });

    it('returns 422 when required sync fields are missing', async () => {
      const res = await request(context.app)
        .post('/api/v1/timetable/sync')
        .send({
          branch: 'CSB',
          // missing semester
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET / POST /api/v1/student/schedule (Personalized Timetable)', () => {
    it('returns 200 with conflict-free schedule matching student registered course groups', async () => {
      const menuHtml = `
        <a href="plum_url.php?EncryptedRegCoursesHash456">Current Sem Courses Registered</a>
      `;
      const coursesHtml = readFixture('courses_registered.html');
      const timetableHtml = readFixture('master_timetable_csb.html');

      vi.spyOn(PlumwareHttpClient.prototype, 'fetchAuthenticatedPath').mockImplementation(
        async (_jar, path) => {
          if (path.includes('student_index') || path.includes('student_menu')) {
            return { html: menuHtml, statusCode: 200 };
          }
          if (path.includes('EncryptedRegCoursesHash456')) {
            return { html: coursesHtml, statusCode: 200 };
          }
          if (path.includes('student_timetable')) {
            return { html: timetableHtml, statusCode: 200 };
          }
          return { html: '<html></html>', statusCode: 200 };
        }
      );

      const res = await request(context.app)
        .get('/api/v1/student/schedule')
        .set('x-session-token', testToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.rollNo).toBe('2024UCB1234');
      expect(res.body.data.assignedGroup).toBe('G1');
      expect(res.body.data.schedule['Monday']).toBeDefined();
      expect(res.body.data.schedule['Tuesday']).toBeDefined();
      expect(res.body.data.totalWeeklyClasses).toBeGreaterThan(0);
      expect(res.body.data.weeklyPracticalHours).toBeGreaterThanOrEqual(4);
    });

    it('returns 410 when session token does not exist in store', async () => {
      const res = await request(context.app)
        .get('/api/v1/student/schedule')
        .set('x-session-token', '99999999-9999-9999-9999-999999999999');

      expect(res.status).toBe(410);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('returns 422 when session token is missing completely', async () => {
      const res = await request(context.app).get('/api/v1/student/schedule');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET / POST /api/v1/student/forecast (Attendance Simulation)', () => {
    it('returns 200 with projected attendance metrics and multi-hour weighting', async () => {
      const menuHtml = `
        <a href="plum_url.php?EncryptedAttendanceHash123">My Attendance</a>
        <a href="plum_url.php?EncryptedRegCoursesHash456">Current Sem Courses Registered</a>
      `;
      const attendanceHtml = readFixture('attendance_normal.html');
      const coursesHtml = readFixture('courses_registered.html');
      const timetableHtml = readFixture('master_timetable_csb.html');

      vi.spyOn(PlumwareHttpClient.prototype, 'fetchAuthenticatedPath').mockImplementation(
        async (_jar, path) => {
          if (path.includes('student_index') || path.includes('student_menu')) {
            return { html: menuHtml, statusCode: 200 };
          }
          if (path.includes('EncryptedAttendanceHash123')) {
            return { html: attendanceHtml, statusCode: 200 };
          }
          if (path.includes('EncryptedRegCoursesHash456')) {
            return { html: coursesHtml, statusCode: 200 };
          }
          if (path.includes('student_timetable')) {
            return { html: timetableHtml, statusCode: 200 };
          }
          return { html: '<html></html>', statusCode: 200 };
        }
      );

      const res = await request(context.app)
        .post('/api/v1/student/forecast')
        .set('x-session-token', testToken)
        .send({
          targetDay: 'Tuesday',
          defaultAction: 'ATTEND',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.targetDay).toBe('Tuesday');
      expect(res.body.data.courses).toBeDefined();
      expect(res.body.data.courses.length).toBeGreaterThan(0);
      expect(res.body.data.projectedOverall.percentage).toBeGreaterThan(0);
      expect(res.body.data.projectedOverall.percentage).toBeLessThanOrEqual(100);
    });
  });
});

