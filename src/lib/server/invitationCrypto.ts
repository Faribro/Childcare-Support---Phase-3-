/**
 * Cryptographic routines for State-Team Invitation Codes
 *
 * Invariants:
 * - High-entropy random code generation (unambiguous charset: 2-9, A-Z excluding 0, O, 1, I)
 * - Structured format: ALN-<STATE_CODE>-<XXXX>-<XXXX>
 * - Plaintext is never stored; only salted SHA-256 verifier hex is persisted
 * - Timing-safe constant-time equality check against timing attacks
 * - Canonical code normalization (strips whitespace, dashes, uppercase)
 */

import crypto from 'crypto';

export const DEFAULT_INVITATION_EXPIRY_DAYS = 30;
export const DEFAULT_INVITATION_EXPIRY_MS = DEFAULT_INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_REDEMPTIONS = 50;

// Base32-like unambiguous character set (32 chars)
const SAFE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Normalizes user-submitted or generated code for consistent verification.
 * Removes all hyphens, spaces, and forces uppercase.
 */
export function normalizeInvitationCode(rawCode: string): string {
  if (!rawCode || typeof rawCode !== 'string') return '';
  return rawCode.trim().toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Maps a full Indian State Name to an unambiguous 2-letter uppercase abbreviation
 * for prefixing readable invitation codes.
 */
export function getStateAbbreviation(stateName: string): string {
  const norm = (stateName || '').trim().toLowerCase();
  const map: Record<string, string> = {
    maharashtra: 'MH',
    delhi: 'DL',
    karnataka: 'KA',
    'tamil nadu': 'TN',
    'west bengal': 'WB',
    gujarat: 'GJ',
    telangana: 'TG',
    'uttar pradesh': 'UP',
    bihar: 'BR',
    rajasthan: 'RJ',
    punjab: 'PB',
    kerala: 'KL',
    odisha: 'OD',
    haryana: 'HR',
    jharkhand: 'JH',
    assam: 'AS',
    chhattisgarh: 'CG',
    'andhra pradesh': 'AP',
    'madhya pradesh': 'MP',
  };
  return map[norm] || norm.substring(0, 2).toUpperCase();
}

/**
 * Generates a cryptographically strong, random plaintext invitation code.
 * Example: ALN-MH-8K4W-9X2M
 */
export function generatePlaintextInvitationCode(stateName: string): string {
  const stateCode = getStateAbbreviation(stateName);
  const randomBytes = crypto.randomBytes(8);
  let segment1 = '';
  let segment2 = '';

  for (let i = 0; i < 4; i++) {
    segment1 += SAFE_CHARSET[randomBytes[i] % SAFE_CHARSET.length];
  }
  for (let i = 4; i < 8; i++) {
    segment2 += SAFE_CHARSET[randomBytes[i] % SAFE_CHARSET.length];
  }

  return `ALN-${stateCode}-${segment1}-${segment2}`;
}

export const generateInvitationCode = generatePlaintextInvitationCode;

/**
 * Computes salted SHA-256 verifier for the normalized invitation code.
 * If salt is omitted, generates a random salt and returns { salt, verifier }.
 */
export function computeInvitationVerifier(plainCode: string): { salt: string; verifier: string };
export function computeInvitationVerifier(plainCode: string, salt: string): string;
export function computeInvitationVerifier(
  plainCode: string,
  salt?: string
): string | { salt: string; verifier: string } {
  if (salt === undefined) {
    return createInvitationVerifierPair(plainCode);
  }
  const normalized = normalizeInvitationCode(plainCode);
  return crypto
    .createHash('sha256')
    .update(`${salt}:${normalized}`)
    .digest('hex');
}

/**
 * Creates salt and verifier pair for a newly generated code.
 */
export function createInvitationVerifierPair(plainCode: string): { salt: string; verifier: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const normalized = normalizeInvitationCode(plainCode);
  const verifier = crypto
    .createHash('sha256')
    .update(`${salt}:${normalized}`)
    .digest('hex');
  return { salt, verifier };
}

/**
 * Verifies submitted plaintext code against stored salt and verifier using timing-safe comparison.
 */
export function verifyInvitationCode(
  submittedPlainCode: string,
  storedSalt: string,
  storedVerifierHex: string
): boolean {
  if (!submittedPlainCode || !storedSalt || !storedVerifierHex) return false;
  const candidateVerifier = computeInvitationVerifier(submittedPlainCode, storedSalt);

  const candidateBuf = Buffer.from(candidateVerifier, 'hex');
  const storedBuf = Buffer.from(storedVerifierHex, 'hex');

  if (candidateBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, storedBuf);
}

function getEnvelopeKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.LEADERSHIP_SESSION_SECRET ||
    process.env.WEBHOOK_SECRET ||
    'alliance-invitation-envelope-salt-key';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plaintext invitation code using authenticated AES-256-GCM.
 * Used exclusively for ephemeral OTP challenge retry delivery without storing plaintext in ordinary database tables.
 */
export function encryptInvitationEnvelope(plainCode: string): string {
  const key = getEnvelopeKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainCode.trim(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts authenticated AES-256-GCM invitation envelope.
 * Returns null if authentication fails or envelope is malformed.
 */
export function decryptInvitationEnvelope(envelope: string): string | null {
  if (!envelope || typeof envelope !== 'string') return null;
  const parts = envelope.split(':');
  if (parts.length !== 3) return null;
  try {
    const [ivHex, tagHex, dataHex] = parts;
    const key = getEnvelopeKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
