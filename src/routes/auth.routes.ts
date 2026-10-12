import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validate_request.js';
import { sessionRateLimiter, loginRateLimiter } from '../middleware/rate_limiter.js';
import { LoginPayloadSchema, RefreshCaptchaSchema } from '../types/auth.js';

export function createAuthRouter(authController: AuthController): Router {
  const router = Router();

  /**
   * @route GET /api/v1/auth/session
   * @desc Initialize a fresh Plumware session and fetch bound CAPTCHA
   */
  router.get('/session', sessionRateLimiter, authController.initSession);

  /**
   * @route POST /api/v1/auth/login
   * @desc Verify student credentials and bound CAPTCHA challenge
   */
  router.post('/login', loginRateLimiter, validateRequest(LoginPayloadSchema), authController.login);

  /**
   * @route POST /api/v1/auth/refresh-captcha
   * @desc Refresh CAPTCHA image for an active session
   */
  router.post(
    '/refresh-captcha',
    sessionRateLimiter,
    validateRequest(RefreshCaptchaSchema),
    authController.refreshCaptcha
  );

  return router;
}
