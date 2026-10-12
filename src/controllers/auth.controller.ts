import type { Request, Response, NextFunction } from 'express';
import type { SessionEngineService } from '../services/session_engine.service.js';
import type { LoginPayload, RefreshCaptchaPayload } from '../types/auth.js';

import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

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
    } catch (error: any) {
      const errCode = error?.code || error?.name || 'HANDSHAKE_ERROR';
      const errMsg = error?.message || 'Handshake failed';

      logger.error('AUTH', `[HANDSHAKE_FAILURE] Gateway handshake failed: ${errMsg}`, {
        code: errCode,
        statusCode: error?.statusCode || error?.status,
        stack: error?.stack,
        details: error?.details,
      });

      // 1. SSL / TLS Certificate errors
      if (
        errCode === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
        errCode === 'CERT_HAS_EXPIRED' ||
        errCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        errCode === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
        errMsg.toLowerCase().includes('certificate') ||
        errMsg.toLowerCase().includes('tls')
      ) {
        res.status(502).json({
          status: 'error',
          code: 'TLS_HANDSHAKE_FAILED',
          message: `SSL/TLS handshake failure against university portal (${errCode}). Upstream certificate verification failed.`,
          details: { originalCode: errCode, message: errMsg },
        });
        return;
      }

      // 2. Network / Firewall / Egress / DNS blocking
      if (
        errCode === 'ECONNREFUSED' ||
        errCode === 'ETIMEDOUT' ||
        errCode === 'ENOTFOUND' ||
        errCode === 'EHOSTUNREACH' ||
        errCode === 'ECONNRESET' ||
        errMsg.toLowerCase().includes('econnrefused') ||
        errMsg.toLowerCase().includes('enotfound')
      ) {
        res.status(503).json({
          status: 'error',
          code: 'UPSTREAM_FIREWALL_OR_UNREACHABLE',
          message: `Failed to connect to imsnsit.org (${errCode}). Upstream portal may be blocking cloud datacenter IP ranges.`,
          details: { originalCode: errCode, message: errMsg },
        });
        return;
      }

      // 3. Upstream Timeout
      if (errCode === 'UPSTREAM_TIMEOUT' || errCode === 'ECONNABORTED' || errMsg.toLowerCase().includes('timeout')) {
        res.status(504).json({
          status: 'error',
          code: 'UPSTREAM_TIMEOUT',
          message: 'University portal took too long to respond. Please retry.',
          details: { originalCode: errCode, message: errMsg },
        });
        return;
      }

      // 4. Redis Connection Error
      if (
        errCode === 'REDIS_CONNECTION_ERROR' ||
        errCode === 'NR_CLOSED' ||
        errMsg.toLowerCase().includes('redis')
      ) {
        res.status(503).json({
          status: 'error',
          code: 'REDIS_CONNECTION_ERROR',
          message: `Session cache failure: Unable to establish connection to Redis cluster.`,
          details: { originalCode: errCode, message: errMsg },
        });
        return;
      }

      if (error instanceof AppError) {
        next(error);
        return;
      }

      res.status(502).json({
        status: 'error',
        code: 'HANDSHAKE_ERROR',
        message: `Unable to establish secure handshake with Plumware gateway: ${errMsg}`,
        details: { originalCode: errCode, message: errMsg },
      });
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
