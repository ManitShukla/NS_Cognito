import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { RequestValidationError } from '../utils/errors.js';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Validates the specified portion of the incoming Express request against a Zod schema.
 */
export function validateRequest(schema: ZodSchema, part: RequestPart = 'body') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req[part]);
      req[part] = parsed;
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const formattedErrors: Record<string, string> = {};
        for (const err of error.issues) {
          const field = Array.isArray(err.path) && err.path.length > 0 ? err.path.join('.') : 'root';
          formattedErrors[field] = err.message;
        }

        next(
          new RequestValidationError('Invalid request payload parameters', {
            validationErrors: formattedErrors,
          })
        );
      } else {
        next(new RequestValidationError('Failed to validate request payload'));
      }
    }
  };
}
