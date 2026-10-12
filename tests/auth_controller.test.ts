import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../src/app.js';
import { PlumwareHttpClient } from '../src/adapters/plumware/plumware_http_client.js';

describe('Auth API Endpoints Integration', () => {
  let context: AppContext;

  beforeEach(() => {
    context = createApp();
  });

  afterEach(async () => {
    await context.sessionStore.destroy();
    vi.restoreAllMocks();
  });

  describe('GET /api/health', () => {
    it('returns operational status with engine metadata', async () => {
      const res = await request(context.app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('operational');
      expect(res.body.engine).toBe('NS Cognito Core Proxy');
      expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/v1/auth/session', () => {
    it('returns 200 with sessionToken, captchaBase64, and academicYear', async () => {
      // Mock Plumware HTTP calls
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchLoginPage').mockResolvedValue({
        html: `
          <html><body>
            <input type="hidden" name="enc_fy" value="ENC_TOKEN">
            <select name="fy"><option value="2026-27" selected>2026-27</option></select>
            <input type="hidden" name="comp" value="NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY">
            <input type="hidden" name="t" value="swx">
            <input type="hidden" name="HRAND_NUM" value="12345">
            <img id="captchaimg" src="images/captcha/mock.jpg">
          </body></html>
        `,
        statusCode: 200,
      });

      vi.spyOn(PlumwareHttpClient.prototype, 'fetchCaptchaBuffer').mockResolvedValue(
        Buffer.from('MOCK_JPEG_IMAGE_DATA')
      );

      const res = await request(context.app).get('/api/v1/auth/session');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.sessionToken).toBeDefined();
      expect(res.body.data.academicYear).toBe('2026-27');
      expect(res.body.data.captchaBase64).toContain('data:image/jpeg;base64,');
      expect(res.body.data.expiresInSeconds).toBe(180);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns 422 when required payload fields are missing', async () => {
      const res = await request(context.app).post('/api/v1/auth/login').send({
        rollNo: '',
        password: '',
      });

      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details?.validationErrors).toBeDefined();
    });

    it('returns 410 when session token does not exist in transient store', async () => {
      const nonExistentUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const res = await request(context.app).post('/api/v1/auth/login').send({
        sessionToken: nonExistentUuid,
        rollNo: '2024UCB1234',
        password: 'MyPassword',
        captchaText: '12345',
      });

      expect(res.status).toBe(410);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('returns 400 when CAPTCHA is rejected by Plumware', async () => {
      // Mock session initialization
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchLoginPage').mockResolvedValue({
        html: `
          <html><body>
            <input type="hidden" name="enc_fy" value="ENC_TOKEN">
            <select name="fy"><option value="2026-27" selected>2026-27</option></select>
            <input type="hidden" name="comp" value="NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY">
            <input type="hidden" name="t" value="swx">
            <input type="hidden" name="HRAND_NUM" value="12345">
            <img id="captchaimg" src="images/captcha/mock.jpg">
          </body></html>
        `,
        statusCode: 200,
      });
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchCaptchaBuffer').mockResolvedValue(
        Buffer.from('MOCK_JPEG_IMAGE_DATA')
      );

      const sessionRes = await request(context.app).get('/api/v1/auth/session');
      const token = sessionRes.body.data.sessionToken;

      // Mock Plumware returning invalid captcha response
      vi.spyOn(PlumwareHttpClient.prototype, 'submitLogin').mockResolvedValue({
        html: `<font color=red size=2><br><br>Invalid Security Number..Please try again<br><br></font>`,
        statusCode: 200,
      });

      const res = await request(context.app).post('/api/v1/auth/login').send({
        sessionToken: token,
        rollNo: '2024UCB1234',
        password: 'ValidPassword',
        captchaText: '99999',
      });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('INVALID_CAPTCHA');
    });

    it('returns 401 when student credentials are rejected', async () => {
      // Mock session initialization
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchLoginPage').mockResolvedValue({
        html: `
          <html><body>
            <input type="hidden" name="enc_fy" value="ENC_TOKEN">
            <select name="fy"><option value="2026-27" selected>2026-27</option></select>
            <input type="hidden" name="comp" value="NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY">
            <input type="hidden" name="t" value="swx">
            <input type="hidden" name="HRAND_NUM" value="12345">
            <img id="captchaimg" src="images/captcha/mock.jpg">
          </body></html>
        `,
        statusCode: 200,
      });
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchCaptchaBuffer').mockResolvedValue(
        Buffer.from('MOCK_JPEG_IMAGE_DATA')
      );

      const sessionRes = await request(context.app).get('/api/v1/auth/session');
      const token = sessionRes.body.data.sessionToken;

      // Mock Plumware returning invalid credentials
      vi.spyOn(PlumwareHttpClient.prototype, 'submitLogin').mockResolvedValue({
        html: `<font color=red size=2><br><br>Invalid Login..Please try again<br><br></font>`,
        statusCode: 200,
      });

      const res = await request(context.app).post('/api/v1/auth/login').send({
        sessionToken: token,
        rollNo: '2024UCB1234',
        password: 'WrongPassword',
        captchaText: '12345',
      });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns 200 on successful authentication', async () => {
      // Mock session initialization
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchLoginPage').mockResolvedValue({
        html: `
          <html><body>
            <input type="hidden" name="enc_fy" value="ENC_TOKEN">
            <select name="fy"><option value="2026-27" selected>2026-27</option></select>
            <input type="hidden" name="comp" value="NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY">
            <input type="hidden" name="t" value="swx">
            <input type="hidden" name="HRAND_NUM" value="12345">
            <img id="captchaimg" src="images/captcha/mock.jpg">
          </body></html>
        `,
        statusCode: 200,
      });
      vi.spyOn(PlumwareHttpClient.prototype, 'fetchCaptchaBuffer').mockResolvedValue(
        Buffer.from('MOCK_JPEG_IMAGE_DATA')
      );

      const sessionRes = await request(context.app).get('/api/v1/auth/session');
      const token = sessionRes.body.data.sessionToken;

      // Mock Plumware returning successful redirect to student frameset
      vi.spyOn(PlumwareHttpClient.prototype, 'submitLogin').mockResolvedValue({
        html: `<html><frameset><frame src="student_menu.php"></frameset></html>`,
        statusCode: 200,
        location: 'student_index.htm',
      });

      const res = await request(context.app).post('/api/v1/auth/login').send({
        sessionToken: token,
        rollNo: '2024UCB1234',
        password: 'CorrectPassword',
        captchaText: '12345',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.rollNo).toBe('2024UCB1234');
      expect(res.body.data.academicYear).toBe('2026-27');
    });
  });

  describe('404 Fallback', () => {
    it('returns structured 404 for unknown endpoints', async () => {
      const res = await request(context.app).get('/api/non-existent-endpoint');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ROUTE_NOT_FOUND');
    });
  });
});
