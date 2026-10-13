import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';

// Deterministic cryptographic secret for signing and encrypting transient tokens
const SECRET = process.env.SESSION_SECRET || 'ns_cognito_fallback_secret_key_32_bytes!';
// 256-bit derived key for AES-256-GCM authenticated encryption
const CIPHER_KEY = createHash('sha256').update(SECRET).digest();
// Ephemeral HMAC salt for legacy signed tokens
const HMAC_SECRET = SECRET;

/**
 * Payload stored within stateless, self-contained pre-login session tokens.
 * Enables zero-shared-memory session rehydration across serverless Lambda containers.
 */
export interface SessionPayload {
  phpsessid: string;
  enc_fy: string;
  HRAND_NUM: string;
  comp: string;
  fy: string;
  t: string;
  f: string;
  createdAt: number;
}

/**
 * Payload stored within authenticated stateless tokens for downstream ERP queries.
 */
export interface AuthenticatedSessionPayload {
  type: 'authenticated';
  rollNo: string;
  phpsessid: string;
  academicYear: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Encrypts and packages pre-login session state into a stateless AES-256-GCM token.
 * Format: `s.<iv-b64url>.<ciphertext-b64url>.<tag-b64url>`
 */
export function encodeStatelessSessionToken(payload: SessionPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
  const serialized = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    's',
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

/**
 * Decrypts and recovers pre-login session state from a stateless AES-256-GCM token.
 * Returns null if token format, authentication tag, or decryption fails.
 */
export function decodeStatelessSessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  // Support both 's.<iv>.<enc>.<tag>' (4 parts) and direct '<iv>.<enc>.<tag>' (3 parts)
  const isPrefixed = parts.length === 4 && parts[0] === 's';
  const isDirect = parts.length === 3;

  if (!isPrefixed && !isDirect) return null;

  try {
    const ivB64 = isPrefixed ? parts[1] : parts[0];
    const encB64 = isPrefixed ? parts[2] : parts[1];
    const tagB64 = isPrefixed ? parts[3] : parts[2];

    const iv = Buffer.from(ivB64, 'base64url');
    const enc = Buffer.from(encB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');

    if (iv.length !== 12 || tag.length !== 16) return null;

    const decipher = createDecipheriv('aes-256-gcm', CIPHER_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString('utf8')) as SessionPayload;

    if (!parsed || typeof parsed.createdAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Encrypts an authenticated student session into a stateless token.
 * Format: `a.<iv-b64url>.<ciphertext-b64url>.<tag-b64url>`
 */
export function encodeAuthenticatedToken(payload: AuthenticatedSessionPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
  const serialized = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    'a',
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

/**
 * Decrypts an authenticated student session from a stateless token.
 */
export function decodeAuthenticatedToken(token: string): AuthenticatedSessionPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'a') return null;

  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const enc = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');

    if (iv.length !== 12 || tag.length !== 16) return null;

    const decipher = createDecipheriv('aes-256-gcm', CIPHER_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString('utf8')) as AuthenticatedSessionPayload;

    if (!parsed || parsed.type !== 'authenticated') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Generates a legacy cryptographically signed session token.
 * Format: `<uuidv4>.<hmac-sha256-signature-16>`
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
 * Validates the cryptographic integrity of a session token.
 * Supports:
 * 1. AES-256-GCM stateless pre-login tokens ('s.<iv>.<enc>.<tag>' or '<iv>.<enc>.<tag>')
 * 2. AES-256-GCM authenticated tokens ('a.<iv>.<enc>.<tag>')
 * 3. Legacy HMAC-SHA256 signed UUID tokens ('<uuid>.<sig>')
 * 4. Raw UUIDs in dev/test mode for mock compatibility
 */
export function verifySessionTokenSignature(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // 1. Check if token is a valid AES-256-GCM stateless pre-login token
  if (decodeStatelessSessionToken(token) !== null) {
    return true;
  }

  // 2. Check if token is a valid AES-256-GCM authenticated token
  if (decodeAuthenticatedToken(token) !== null) {
    return true;
  }

  // 3. Fallback: Check legacy HMAC signed token or UUID
  const parts = token.split('.');
  if (parts.length === 1) {
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

  const signatureBuffer = Buffer.from(signature, 'utf-8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
