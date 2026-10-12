import type { Request, Response, NextFunction } from 'express';
import type { SessionEngineService } from '../services/session_engine.service.js';
import type { LoginPayload, RefreshCaptchaPayload } from '../types/auth.js';

export class AuthController {
  constructor(private readonly sessionEngine: SessionEngineService) {}

  /**
   * GET /api/v1/auth/session
   * Spawns an isolated session cookie jar, fetches upstream Plumware tokens,
   * and returns the base64-encoded CAPTCHA challenge bound to this session.
   */
  initSession = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.sessionEngine.initializeSession();
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/login
   * Validates credentials and CAPTCHA challenge against Plumware ERP.
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = req.body as LoginPayload;
      const data = await this.sessionEngine.authenticate(payload);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/refresh-captcha
   * Refreshes the CAPTCHA for an active unauthenticated session.
   */
  refreshCaptcha = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionToken } = req.body as RefreshCaptchaPayload;
      const data = await this.sessionEngine.refreshCaptcha(sessionToken);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/health
   * Telemetry health check verifying engine status.
   */
  healthCheck = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'operational',
      engine: 'NS Cognito Core Proxy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  };
}
