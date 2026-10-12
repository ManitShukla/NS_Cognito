import { createHmac, randomUUID } from 'crypto';
import { env } from '../config/env.js';

// Ephemeral cryptographic secret for signing transient tokens
const HMAC_SECRET = process.env.SESSION_SECRET || 'ns-cognito-ephemeral-hmac-salt-2026';

/**
 * Generates a cryptographically signed session token.
 * Format: `<uuidv4>.<hmac-sha256-signature-16>`
 * Prevents session enumeration and cache key collision attacks.
 */
export function generateSignedSessionToken(): string {
  const rawId = randomUUID();
  const signature = createHmac('sha256', HMAC_SECRET)
    .update(rawId)
    .digest('hex')
    .slice(0, 16);
  return `${rawId}.${signature}`;
}

/**
 * Validates the cryptographic integrity of a signed session token.
 * In development / test mode, permits standard UUIDv4 as well for backwards compatibility.
 */
export function verifySessionTokenSignature(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length === 1) {
    // If running in development/test, permit standard UUIDv4
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return env.NODE_ENV !== 'production' && uuidRegex.test(token);
  }

  if (parts.length !== 2) {
    return false;
  }

  const [rawId, signature] = parts;
  const expectedSignature = createHmac('sha256', HMAC_SECRET)
    .update(rawId)
    .digest('hex')
    .slice(0, 16);

  return signature === expectedSignature;
}
