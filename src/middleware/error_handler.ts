import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, RequestValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Global Express error handling middleware.
 * Ensures all uncaught failures and custom domain errors return a structured JSON response.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn('ERROR', `[${err.code}] ${err.message}`, err.details);
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  if (err instanceof ZodError) {
    const formattedErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const field = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') : 'root';
      formattedErrors[field] = issue.message;
    }
    const appError = new RequestValidationError('Invalid request payload parameters', {
      validationErrors: formattedErrors,
    });
    logger.warn('ERROR', `[${appError.code}] ${appError.message}`, appError.details);
    res.status(appError.statusCode).json(appError.toJSON());
    return;
  }

  // Unhandled internal server error
  logger.error('CRASH', `Unhandled internal server error: ${err.message}`, {
    stack: err.stack,
  });

  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal error occurred within the proxy engine.',
  });
}
