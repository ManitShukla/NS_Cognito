import type { IncomingMessage, ServerResponse } from 'node:http';
import express, { type Express } from 'express';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';

let appInstance: Express;
let initError: Error | null = null;

// Global safety listener to prevent unhandled rejections from terminating the serverless lambda
process.on('unhandledRejection', (reason) => {
  logger.error('SERVERLESS', 'Trapped unhandled promise rejection in serverless runtime', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

try {
  const initialized = createApp();
  appInstance = initialized.app;
  logger.info('SERVERLESS', 'NS Cognito Serverless Function handler primed for Vercel deployment');
} catch (err: unknown) {
  initError = err instanceof Error ? err : new Error(String(err));
  appInstance = express(); // Fallback instance to preserve Express interface contract
  logger.error('SERVERLESS', `Critical startup error during module initialization: ${initError.message}`, {
    stack: initError.stack,
  });
}

/**
 * Vercel Serverless Function entry point.
 * Dispatches HTTP requests directly to the hardened Express telemetry engine.
 * Guarantees 100% structured JSON responses on any error mode (zero HTML 500s).
 */
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  // If app initialization failed at module scope, emit structured JSON 500 immediately
  if (initError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        status: 'error',
        code: 'SERVERLESS_INITIALIZATION_ERROR',
        message: 'The telemetry engine encountered a fatal initialization error.',
        details: {
          error: initError.message,
          name: initError.name,
        },
      })
    );
    return;
  }

  try {
    appInstance(req as any, res as any, (err?: any) => {
      if (err && !res.headersSent) {
        const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            status: 'error',
            code: err.code || 'UNHANDLED_GATEWAY_ERROR',
            message: err.message || 'An unhandled gateway execution failure occurred.',
          })
        );
      }
    });
  } catch (err: unknown) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          status: 'error',
          code: 'SERVERLESS_UNCAUGHT_EXCEPTION',
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }
}

export const app: Express = appInstance;
