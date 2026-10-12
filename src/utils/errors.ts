/**
 * Standard Application Error Taxonomy for NS Cognito.
 * Encapsulates distinct Plumware failure modes, HTTP mapping, and machine-readable telemetry codes.
 */

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      status: 'error',
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/**
 * Thrown when the client attempts to use an expired or uninitialized sessionToken.
 */
export class SessionExpiredError extends AppError {
  readonly statusCode = 410; // Gone
  readonly code = 'SESSION_EXPIRED';

  constructor(message = 'Session token has expired or is invalid. Please fetch a fresh CAPTCHA.') {
    super(message);
  }
}

/**
 * Thrown when Plumware rejects the CAPTCHA string.
 */
export class InvalidCaptchaError extends AppError {
  readonly statusCode = 400; // Bad Request
  readonly code = 'INVALID_CAPTCHA';

  constructor(message = 'The security code entered did not match the CAPTCHA challenge.') {
    super(message);
  }
}

/**
 * Thrown when student credentials (Roll No / Password) are rejected by Plumware.
 */
export class InvalidCredentialsError extends AppError {
  readonly statusCode = 401; // Unauthorized
  readonly code = 'INVALID_CREDENTIALS';

  constructor(message = 'Invalid student Roll Number or Password.') {
    super(message);
  }
}

/**
 * Thrown when Plumware activates bot traps, referer validation alerts, or returns "Access Denied!".
 */
export class PlumwareTripwireError extends AppError {
  readonly statusCode = 502; // Bad Gateway
  readonly code: string = 'PLUMWARE_TRIPWIRE';

  constructor(
    message = 'Plumware ERP rejected the request state or tripped a navigation security rule.',
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

/**
 * Thrown when Plumware activates frameset tripwires, referer validation alerts, or returns "Access Denied!".
 */
export class PortalDesyncError extends PlumwareTripwireError {
  override readonly code = 'PORTAL_DESYNC_DETECTED';

  constructor(
    message = 'Plumware ERP navigation desynchronized or access denied. Session self-healing recommended.',
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

/**
 * Thrown when imsnsit.org is unreachable, times out, or returns 502/503/504.
 */
export class PlumwareDownError extends AppError {
  readonly statusCode = 503; // Service Unavailable
  readonly code = 'PLUMWARE_UNAVAILABLE';

  constructor(
    message = 'The university ERP portal (imsnsit.org) is currently unreachable or timing out.',
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

/**
 * Thrown when client request payload fails Zod validation.
 */
export class RequestValidationError extends AppError {
  readonly statusCode = 422; // Unprocessable Entity
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message = 'Request validation failed',
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

/**
 * Thrown when student roll number fails NSUT structural or branch validation.
 */
export class UnrecognizedRollError extends AppError {
  readonly statusCode = 422; // Unprocessable Entity
  readonly code = 'UNRECOGNIZED_ROLL_FORMAT';

  constructor(
    message = 'Unrecognized student roll number format or unknown department code.',
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

/**
 * Thrown when an already-authenticated or consumed session token is reused for login (anti-replay protection).
 */
export class SessionAlreadyUsedError extends AppError {
  readonly statusCode = 409; // Conflict
  readonly code = 'SESSION_ALREADY_USED';

  constructor(message = 'Session token has already been authenticated or consumed. Please acquire a fresh session.') {
    super(message);
  }
}

/**
 * Thrown when client requests exceed rate limits.
 */
export class RateLimitExceededError extends AppError {
  readonly statusCode = 429; // Too Many Requests
  readonly code = 'RATE_LIMIT_EXCEEDED';

  constructor(
    message = 'Too many requests. Please slow down and try again later.',
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}
