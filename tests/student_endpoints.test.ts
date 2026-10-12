import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../src/app.js';
import { PlumwareHttpClient } from '../src/adapters/plumware/plumware_http_client.js';
import { PlumwareDownError } from '../src/utils/errors.js';
import { CookieJar } from 'tough-cookie';
import type { SessionState } from '../src/types/session.js';

describe('Student Telemetry API Endpoints Integration', () => {
  let context: AppContext;
  const testToken = '8b053315-ff48-4bcb-9dcd-5e75272ea4e9';

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
      comp: 'NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY',
      t: 'swx',
      hrandNum: '12345',
      captchaPath: 'images/captcha/test.jpg',
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

  describe('Validation & Auth Guard', () => {
    it('returns 422 when session token is missing completely', async () => {
      const res = await request(context.app).get('/api/v1/student/attendance');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 410 when session token has expired or is invalid', async () => {
      const res = await request(context.app)
        .get('/api/v1/student/attendance')
        .set('x-session-token', '00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(410);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('GET /api/v1/student/attendance', () => {
    it('fetches menu, resolves dynamic plum_url, parses table, and returns subject analytics', async () => {
      const menuHtml = `
        <a href="plum_url.php?EncryptedAttendanceHash123">My Attendance</a>
      `;
      const attendanceHtml = readFixture('attendance_normal.html');

      vi.spyOn(PlumwareHttpClient.prototype, 'fetchAuthenticatedPath').mockImplementation(
        async (_jar, path) => {
          if (path.includes('student_index') || path.includes('student_menu')) {
            return { html: menuHtml, statusCode: 200 };
          }
          if (path.includes('plum_url.php?EncryptedAttendanceHash123')) {
            return { html: attendanceHtml, statusCode: 200 };
          }
          return { html: '<html></html>', statusCode: 200 };
        }
      );

      const res = await request(context.app)
        .get('/api/v1/student/attendance')
        .set('x-session-token', testToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.subjects.length).toBe(3);
      expect(res.body.data.overallSummary.overallPercentage).toBe(78.95);
      expect(res.body.data.overallSummary.status).toBe('WARNING');
    });

    it('evicts session from transient cache when Plumware emits Access Denied tripwire', async () => {
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchAuthenticatedPath').mockResolvedValue({
        html: `<html><body><h3>Access Denied!</h3><p>Session mismatch</p></body></html>`,
        statusCode: 200,
      });

      const res = await request(context.app)
        .get('/api/v1/student/attendance')
        .set('x-session-token', testToken);

      expect(res.status).toBe(502);
      expect(['PLUMWARE_TRIPWIRE', 'PORTAL_DESYNC_DETECTED']).toContain(res.body.code);

      // Verify session was actively purged from memory store
      const sessionInStore = await context.sessionStore.get(testToken);
      expect(sessionInStore).toBeNull();

      // Subsequent attempt fails immediately with 410 SESSION_EXPIRED
      const retryRes = await request(context.app)
        .get('/api/v1/student/attendance')
        .set('x-session-token', testToken);

      expect(retryRes.status).toBe(410);
      expect(retryRes.body.code).toBe('SESSION_EXPIRED');
    });

    it('returns 503 Service Unavailable when Plumware throws gateway dropout', async () => {
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchAuthenticatedPath').mockRejectedValue(
        new PlumwareDownError('Plumware server connection timed out')
      );

      const res = await request(context.app)
        .get('/api/v1/student/attendance')
        .set('x-session-token', testToken);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('PLUMWARE_UNAVAILABLE');
    });
  });

  describe('GET /api/v1/student/registered-courses', () => {
    it('resolves registered courses and returns student group profile with componentGroups', async () => {
      const menuHtml = `
        <a href="plum_url.php?EncryptedRegCoursesHash456">Current Sem Courses Registered</a>
      `;
      const coursesHtml = readFixture('courses_registered.html');

      vi.spyOn(PlumwareHttpClient.prototype, 'fetchAuthenticatedPath').mockImplementation(
        async (_jar, path) => {
          if (path.includes('student_index') || path.includes('student_menu')) {
            return { html: menuHtml, statusCode: 200 };
          }
          if (path.includes('plum_url.php?EncryptedRegCoursesHash456')) {
            return { html: coursesHtml, statusCode: 200 };
          }
          return { html: '<html></html>', statusCode: 200 };
        }
      );

      const res = await request(context.app)
        .get('/api/v1/student/registered-courses')
        .set('x-session-token', testToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.defaultGroup).toBe('G1');
      expect(res.body.data.courseGroups['FCEE0106']).toBe('G2');
      expect(res.body.data.componentGroups['FCEE0106:PRACTICAL']).toBe('G2');
      expect(res.body.data.registeredCourses.length).toBe(7);
    });
  });

  describe('GET / POST /api/v1/student/dashboard', () => {
    it('aggregates full student academic profile in parallel including componentGroups', async () => {
      const menuHtml = `
        <a href="plum_url.php?EncryptedAttendanceHash123">My Attendance</a>
        <a href="plum_url.php?EncryptedRegCoursesHash456">Current Sem Courses Registered</a>
      `;
      const attendanceHtml = readFixture('attendance_normal.html');
      const coursesHtml = readFixture('courses_registered.html');

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
          return { html: '<html></html>', statusCode: 200 };
        }
      );

      const res = await request(context.app)
        .post('/api/v1/student/dashboard')
        .send({ sessionToken: testToken });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.rollNo).toBe('2024UCB1234');
      expect(res.body.data.overallSummary.totalHeld).toBe(19);
      expect(res.body.data.subjects.length).toBe(3);
      expect(res.body.data.groupProfile.defaultGroup).toBe('G1');
      expect(res.body.data.groupProfile.componentGroups['FCEE0106:PRACTICAL']).toBe('G2');
      expect(res.body.data.attendanceRecords.length).toBe(5);
    });
  });
});
