/**
 * Field Worker Email Authentication Challenge & Ticket Manager
 *
 * Guarantees:
 * - 6-digit cryptographically secure numeric OTP
 * - 10-minute challenge expiration
 * - Max 3 verification attempts before challenge revocation
 * - Rate limit: max 5 requests per hour per email, 60s cooldown
 * - Single-use atomic verification via durable shared Firestore challenge storage
 * - HMAC-SHA256 signed email verification ticket for registration
 * - Prevents email enumeration (generic response if unverified during login request)
 * - Zero OTP exposure in logs, API responses, or errors
 * - Email address redaction in logs (first2***@domain)
 * - Zero SMS credit consumption
 */

import crypto from 'crypto';
import { FirestoreOtpStore } from './firestoreOtpStore';
import { getOnboardingStore } from './onboardingStore';
import { sendFieldUserOtpEmail } from './emailProvider';
import { createSessionToken } from './sessionService';
import { logSecurityEvent } from './authorisation';

export const FIELD_EMAIL_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const EMAIL_TICKET_TTL_MS = 15 * 60 * 1000; // 15 minutes

const TICKET_SECRET = process.env.SESSION_SECRET || process.env.DIAGNOSTICS_SECRET || 'childcare-email-ticket-key-local';

/**
 * Normalizes email: trimmed, lowercase.
 */
export function normalizeEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Redacts an email address for safe logging (e.g. jo***@allianceindia.org)
 */
export function redactEmail(email: string): string {
  const norm = normalizeEmail(email);
  if (!norm || !norm.includes('@')) return '[INVALID_EMAIL]';
  const [local, domain] = norm.split('@');
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/**
 * Creates a cryptographically signed email verification ticket proving email ownership.
 */
export function createEmailTicket(email: string, ttlMs: number = EMAIL_TICKET_TTL_MS): string {
  const normEmail = normalizeEmail(email);
  const expiresAt = Date.now() + ttlMs;
  const payload = `${normEmail}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', TICKET_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Verifies a signed email verification ticket and returns the normalized email.
 */
export function verifyEmailTicket(ticket?: string | null): { valid: boolean; email?: string; error?: string } {
  if (!ticket || typeof ticket !== 'string') {
    return { valid: false, error: 'Email ticket is missing.' };
  }
  try {
    const decoded = Buffer.from(ticket, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) {
      return { valid: false, error: 'Malformed email verification ticket structure.' };
    }
    const [email, expiresAtStr, sig] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, error: 'Email verification ticket has expired. Please verify your email again.' };
    }
    const expectedSig = crypto.createHmac('sha256', TICKET_SECRET).update(`${email}:${expiresAtStr}`).digest('hex');
    const isSigValid = crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
    if (!isSigValid) {
      return { valid: false, error: 'Invalid email verification ticket signature.' };
    }
    return { valid: true, email };
  } catch {
    return { valid: false, error: 'Failed to parse email verification ticket.' };
  }
}

let otpStoreInstance: FirestoreOtpStore | null = null;
function getChallengeStore(): FirestoreOtpStore {
  if (!otpStoreInstance) {
    otpStoreInstance = new FirestoreOtpStore();
  }
  return otpStoreInstance;
}

export function setTestEmailOtpStore(store: FirestoreOtpStore): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setTestEmailOtpStore is strictly prohibited outside NODE_ENV=test');
  }
  otpStoreInstance = store;
}

/**
 * Requests an email OTP for field worker sign-in or registration.
 */
export async function requestFieldEmailOtp(params: {
  email: string;
  purpose?: 'login' | 'registration';
}): Promise<{
  success: boolean;
  message: string;
  error?: string;
  statusCode: number;
  retryAfterSeconds?: number;
  debugCode?: string;
}> {
  const normEmail = normalizeEmail(params.email);
  const purpose = params.purpose || 'login';

  if (!normEmail || !normEmail.includes('@') || !normEmail.includes('.')) {
    return {
      success: false,
      error: 'Please enter a valid official email address.',
      message: 'Please enter a valid official email address.',
      statusCode: 400,
    };
  }

  const store = getOnboardingStore();
  const existingProfile = await store.getFieldUserProfileByEmail(normEmail);

  // Anti-enumeration policy: If logging in with an email that is NOT registered,
  // do not expose whether the email exists. Return success to the client without sending.
  if (purpose === 'login' && !existingProfile) {
    logSecurityEvent({
      actor: normEmail,
      actorRole: 'FIELD_USER',
      eventType: 'AUTH_FAILURE',
      outcome: 'DENY',
      details: `Login attempted for unregistered field worker email ${redactEmail(normEmail)}`,
    });
    return {
      success: true,
      message: 'If this email address is registered, a 6-digit verification code has been sent.',
      statusCode: 200,
    };
  }

  // Generate cryptographically strong 6-digit numeric code
  const code = crypto.randomInt(100000, 1000000).toString();
  const challengeKey = `email:${normEmail}`;

  const challengeStore = getChallengeStore();
  const saveResult = await challengeStore.saveChallenge(
    challengeKey,
    `field_${purpose}`,
    code,
    FIELD_EMAIL_OTP_TTL_MS
  );

  if (!saveResult.success) {
    const isRateLimit = saveResult.error === 'COOLDOWN_ACTIVE' || saveResult.error === 'RATE_LIMIT_EXCEEDED';
    return {
      success: false,
      error: saveResult.message,
      message: saveResult.message,
      statusCode: isRateLimit ? 429 : 503,
      retryAfterSeconds: saveResult.retryAfterSeconds,
    };
  }

  // Dispatch email (Apps Script or configured transactional email provider)
  const recipientName = existingProfile
    ? `${existingProfile.firstName} ${existingProfile.lastName}`.trim()
    : undefined;

  const emailRes = await sendFieldUserOtpEmail({
    to: normEmail,
    name: recipientName,
    code,
    expiryMinutes: 10,
    purpose,
  });

  if (!emailRes.success && process.env.NODE_ENV !== 'test') {
    return {
      success: false,
      error: 'Unable to deliver verification email. Please check the address or try again in a few moments.',
      message: 'Unable to deliver verification email. Please check the address or try again in a few moments.',
      statusCode: 502,
    };
  }

  logSecurityEvent({
    actor: normEmail,
    actorRole: 'FIELD_USER',
    eventType: 'AUTH_SUCCESS',
    outcome: 'ALLOW',
    details: `Dispatched field worker email OTP (purpose=${purpose}) to ${redactEmail(normEmail)}`,
  });

  return {
    success: true,
    message: `Verification code sent to ${redactEmail(normEmail)}. Valid for 10 minutes.`,
    statusCode: 200,
    debugCode: process.env.NODE_ENV === 'test' ? code : undefined,
  };
}

/**
 * Verifies the 6-digit email OTP and resolves the stable field worker identity or issues an email ticket.
 */
export async function verifyFieldEmailOtp(params: {
  email: string;
  code: string;
  purpose?: 'login' | 'registration';
}): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  statusCode: number;
  remainingAttempts?: number;
  sessionToken?: string;
  profile?: any;
  emailTicket?: string;
}> {
  const normEmail = normalizeEmail(params.email);
  const purpose = params.purpose || 'login';
  const cleanCode = (params.code || '').trim();

  if (!normEmail || !normEmail.includes('@')) {
    return { success: false, error: 'Valid email address is required.', statusCode: 400 };
  }
  if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    return { success: false, error: 'Please enter the 6-digit numeric verification code.', statusCode: 400 };
  }

  const challengeKey = `email:${normEmail}`;
  const challengeStore = getChallengeStore();
  const verifyRes = await challengeStore.verifyChallenge(challengeKey, cleanCode, `field_${purpose}`);

  if (!verifyRes.success) {
    logSecurityEvent({
      actor: normEmail,
      actorRole: 'FIELD_USER',
      eventType: 'AUTH_FAILURE',
      outcome: 'DENY',
      details: `Field email OTP verification failed for ${redactEmail(normEmail)}: ${verifyRes.error}`,
    });
    return {
      success: false,
      error: verifyRes.message || 'Invalid or expired verification code.',
      message: verifyRes.message,
      remainingAttempts: verifyRes.remainingAttempts,
      statusCode: 401,
    };
  }

  // Purpose: Registration -> return signed ticket proving email ownership
  if (purpose === 'registration') {
    const emailTicket = createEmailTicket(normEmail);
    logSecurityEvent({
      actor: normEmail,
      actorRole: 'FIELD_USER',
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      details: `Email ownership verified for registration: ${redactEmail(normEmail)}`,
    });
    return {
      success: true,
      statusCode: 200,
      message: 'Email address verified successfully.',
      emailTicket,
    };
  }

  // Purpose: Login -> resolve the existing immutable worker profile
  const store = getOnboardingStore();
  const profile = await store.getFieldUserProfileByEmail(normEmail);

  if (!profile) {
    return {
      success: false,
      error: 'No active caseworker profile found for this email address. Please register with your invitation code.',
      statusCode: 404,
    };
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  // Create authenticated session token bound to the IMMUTABLE profile ID
  const sessionToken = createSessionToken({
    userId: profile.id, // Immutable stable worker ID
    username: profile.googleEmail || normEmail,
    name: fullName,
    role: 'FIELD_USER',
    allowedStates: [profile.assignedState],
    allowedDistricts: [profile.assignedDistrict],
    srName: profile.srName,
    ssrName: profile.ssrName,
  });

  logSecurityEvent({
    actor: profile.id,
    actorRole: 'FIELD_USER',
    eventType: 'AUTH_SUCCESS',
    outcome: 'ALLOW',
    scope: `${profile.assignedState}/${profile.assignedDistrict}`,
    details: `Returning field worker ${profile.id} (${fullName}) authenticated via Email OTP (${redactEmail(normEmail)})`,
  });

  const safeProfile = {
    id: profile.id,
    name: fullName,
    firstName: profile.firstName,
    lastName: profile.lastName,
    assignedState: profile.assignedState,
    assignedDistrict: profile.assignedDistrict,
    srName: profile.srName,
    ssrName: profile.ssrName,
    googleEmail: profile.googleEmail || normEmail,
    maskedMobile: profile.mobileNumber ? `+91 ******${profile.mobileNumber.slice(-4)}` : undefined,
  };

  return {
    success: true,
    statusCode: 200,
    message: `Welcome back, ${profile.firstName}!`,
    sessionToken,
    profile: safeProfile,
  };
}
