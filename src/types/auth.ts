import { z } from 'zod';
import { verifySessionTokenSignature } from '../utils/crypto.js';

/**
 * Validates session token format and cryptographic signature.
 */
export const SessionTokenSchema = z
  .string()
  .min(10, { message: 'Session token format invalid; token too short.' })
  .refine(
    (val) => verifySessionTokenSignature(val),
    { message: 'Invalid session token signature or unauthorized format.' }
  );

/**
 * Schema for initial authentication handshake payload.
 */
export const LoginPayloadSchema = z.object({
  sessionToken: SessionTokenSchema,
  rollNo: z
    .string()
    .min(3, { message: 'Roll number must be at least 3 characters.' })
    .max(30, { message: 'Roll number cannot exceed 30 characters.' })
    .transform((val) => val.trim().toUpperCase()),
  password: z
    .string()
    .min(1, { message: 'Password is required.' }),
  captchaText: z
    .string()
    .min(1, { message: 'CAPTCHA security code is required.' })
    .max(10, { message: 'CAPTCHA security code cannot exceed 10 characters.' })
    .transform((val) => val.trim()),
});

export type LoginPayload = z.infer<typeof LoginPayloadSchema>;

/**
 * Schema for refreshing CAPTCHA for an active session.
 */
export const RefreshCaptchaSchema = z.object({
  sessionToken: SessionTokenSchema,
});

export type RefreshCaptchaPayload = z.infer<typeof RefreshCaptchaSchema>;

/**
 * Public response returned after initializing a Plumware session.
 */
export interface SessionInitResponse {
  status: 'success';
  data: {
    sessionToken: string;
    captchaBase64: string;
    academicYear: string;
    expiresInSeconds: number;
    timestamp: number;
  };
}

/**
 * Public response returned after successful authentication.
 */
export interface LoginSuccessResponse {
  status: 'success';
  data: {
    sessionToken: string;
    rollNo: string;
    academicYear: string;
    authenticatedAt: number;
    message: string;
  };
}

/**
 * Structured error response envelope.
 */
export interface AuthErrorResponse {
  status: 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
