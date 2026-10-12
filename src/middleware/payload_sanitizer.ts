/**
 * Payload Sanitizer & PII Scrubbing Interceptor.
 * Enforces zero-persistence security by ensuring student passwords,
 * raw CAPTCHA codes, cookie jars, and roll numbers are NEVER leaked to logs or disk.
 */

const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'captchatext',
  'captcha_text',
  'cookie',
  'cookies',
  'phpsessid',
  'authorization',
  'auth_token',
  'authtoken',
  'token',
  'sessionsecret',
  'session_secret',
]);

/**
 * Masks a student roll number to preserve auditability while preventing public PII exposure.
 * Example: '2024UCB1234' -> '2024***1234'
 */
export function maskRollNumber(rollNo: string): string {
  if (!rollNo || typeof rollNo !== 'string') return '';
  const trimmed = rollNo.trim();
  if (trimmed.length >= 8) {
    return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
  }
  return '***';
}

/**
 * Masks a transient session token to its prefix to prevent token hijacking via logs.
 * Example: 'd3b07384-d113-4e86-904c-123456789abc' -> 'd3b07384...'
 */
export function maskSessionToken(token: string): string {
  if (!token || typeof token !== 'string') return '';
  if (token.length <= 8) return '***';
  return `${token.slice(0, 8)}...`;
}

/**
 * Recursively sanitizes any data structure, scrubbing passwords and masking sensitive identifiers.
 */
export function sanitizeLogPayload(data: unknown, depth = 0): unknown {
  if (depth > 5) return '[MAX_DEPTH_REACHED]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Scrub potential PHPSESSID strings in text
    if (data.includes('PHPSESSID=')) {
      return data.replace(/PHPSESSID=[a-zA-Z0-9_-]+/g, 'PHPSESSID=[REDACTED]');
    }
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogPayload(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = REDACTED;
    } else if (lowerKey === 'rollno' || lowerKey === 'roll_no' || lowerKey === 'roll') {
      sanitized[key] = typeof value === 'string' ? maskRollNumber(value) : REDACTED;
    } else if (lowerKey === 'sessiontoken' || lowerKey === 'session_token' || lowerKey === 'x-session-token') {
      sanitized[key] = typeof value === 'string' ? maskSessionToken(value) : REDACTED;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogPayload(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
