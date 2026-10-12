import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/app.js';
import { logger } from '../src/utils/logger.js';

// Pre-initialize application context at module scope to eliminate cold-start initialization per invocation
const { app } = createApp();

logger.info('SERVERLESS', 'NS Cognito Serverless Function handler primed for Vercel deployment');

/**
 * Vercel Serverless Function entry point.
 * Dispatches HTTP requests directly to the hardened Express telemetry engine.
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req as any, res as any);
}

export { app };
