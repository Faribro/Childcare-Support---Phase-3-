/**
 * State Team Registration, OTP Verification, and Invitation Issuance Challenge Manager
 *
 * Invariants:
 * - 6-digit cryptographically secure numeric OTP for state-team email verification
 * - Salted SHA-256 verifier storage (zero plaintext OTP in persistence)
 * - 10-minute challenge expiration
 * - Lockout after 5 failed verification attempts
 * - Email verification proves email ownership, NOT administrative authority over state
 * - Automatic allowlist matching for configured domains/emails, otherwise PENDING_APPROVAL
 * - Plaintext invitation code delivered strictly via approved email to verified staff
 */

import crypto from 'crypto';
import { getOnboardingStore } from './onboardingStore';
import { sendStateTeamOtpEmail, sendStateTeamInvitationEmail } from './emailProvider';
import { createSessionToken } from './sessionService';
import {
  generatePlaintextInvitationCode,
  createInvitationVerifierPair,
  DEFAULT_MAX_REDEMPTIONS,
  DEFAULT_INVITATION_EXPIRY_MS,
  DEFAULT_INVITATION_EXPIRY_DAYS,
} from './invitationCrypto';

export const STATE_TEAM_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const STATE_TEAM_MAX_VERIFY_ATTEMPTS = 5;

export interface StateTeamOtpChallenge {
  challengeId: string;
  workEmail: string;
  name: string;
  state: string;
  codeSalt: string;
  codeHash: string;
  expiresAt: number;
  failedAttempts: number;
  isUsed: boolean;
  isLocked: boolean;
}

// In-memory challenge store (keyed by lowercase normalized workEmail)
const activeChallenges = new Map<string, StateTeamOtpChallenge>();

function hashOtp(code: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${code.trim()}`).digest('hex');
}

/**
 * Normalizes email: trimmed, lowercase.
 */
export function normalizeEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Checks if a work email domain or specific email is in the pre-approved state-team allowlist.
 */
export function isEmailPreApprovedForState(email: string, state: string): boolean {
  const normEmail = normalizeEmail(email);
  if (!normEmail) return false;

  // 1. Check exact email allowlist from env
  const exactAllowlist = (process.env.STATE_TEAM_APPROVED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (exactAllowlist.includes(normEmail)) {
    return true;
  }

  // 2. Check approved domain patterns (e.g. allianceindia.org)
  const approvedDomains = (process.env.STATE_TEAM_APPROVED_DOMAINS || 'allianceindia.org')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const domain = normEmail.split('@')[1];
  if (domain && approvedDomains.includes(domain)) {
    return true;
  }

  // 3. Optional state-specific allowlist: STATE_TEAM_APPROVED_<STATE_CODE>
  const stateKey = `STATE_TEAM_APPROVED_${state.toUpperCase().replace(/\s+/g, '_')}`;
  const stateAllowlist = (process.env[stateKey] || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (stateAllowlist.includes(normEmail)) {
    return true;
  }

  return false;
}

/**
 * Requests a State-Team registration & verification OTP.
 */
export async function requestStateTeamOtp(params: {
  firstName: string;
  lastName?: string;
  workEmail: string;
  requestedState: string;
  organization: string;
}): Promise<{
  success: boolean;
  error?: string;
  statusCode: number;
  message?: string;
  otp?: string;
  registration?: any;
}> {
  const normEmail = normalizeEmail(params.workEmail);
  if (!normEmail || !normEmail.includes('@')) {
    return { success: false, error: 'A valid work email address is required.', statusCode: 400 };
  }
  if (!params.firstName?.trim()) {
    return { success: false, error: 'First name is required.', statusCode: 400 };
  }
  if (!params.requestedState?.trim()) {
    return { success: false, error: 'Requested state is required.', statusCode: 400 };
  }

  const store = getOnboardingStore();
  const now = Date.now();

  // Rate limit: 5 requests per 15 minutes per email
  const rateLimit = await store.checkRateLimit(`state-team-otp:${normEmail}`, now, 5, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Too many verification requests. Please retry in ${rateLimit.retryAfterSeconds} seconds.`,
      statusCode: 429,
    };
  }

  const autoApprove = isEmailPreApprovedForState(normEmail, params.requestedState);

  // Register or retrieve existing registration
  const registration = await store.createStateTeamRegistration({
    firstName: params.firstName,
    lastName: params.lastName || '',
    workEmail: normEmail,
    requestedState: params.requestedState,
    organization: params.organization || 'Alliance India Partner',
    autoApprove,
  });

  // Generate 6-digit numeric OTP
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashOtp(rawOtp, salt);

  const challenge: StateTeamOtpChallenge = {
    challengeId: crypto.randomUUID(),
    workEmail: normEmail,
    name: `${registration.firstName} ${registration.lastName}`.trim(),
    state: registration.requestedState,
    codeSalt: salt,
    codeHash,
    expiresAt: now + STATE_TEAM_OTP_TTL_MS,
    failedAttempts: 0,
    isUsed: false,
    isLocked: false,
  };

  activeChallenges.set(normEmail, challenge);

  // Dispatch OTP email
  const emailResult = await sendStateTeamOtpEmail({
    to: normEmail,
    name: challenge.name,
    state: challenge.state,
    code: rawOtp,
    expiryMinutes: 10,
  });

  if (!emailResult.success) {
    activeChallenges.delete(normEmail);
    return {
      success: false,
      error: 'Unable to deliver verification email. Please check the address or try again later.',
      statusCode: 502,
    };
  }

  return {
    success: true,
    statusCode: 200,
    message: 'Verification code sent to your work email address.',
    otp: rawOtp,
    registration,
  };
}

/**
 * Verifies the State-Team OTP.
 */
export async function verifyStateTeamOtp(params: {
  workEmail?: string;
  email?: string;
  code?: string;
  otp?: string;
}): Promise<{
  success: boolean;
  error?: string;
  statusCode: number;
  status?: 'APPROVED' | 'PENDING_APPROVAL';
  sessionToken?: string;
  session?: any;
  registration?: any;
}> {
  const emailInput = params.email || params.workEmail;
  const codeInput = params.otp || params.code || '';
  const normEmail = normalizeEmail(emailInput);
  const challenge = activeChallenges.get(normEmail);
  const now = Date.now();

  if (!challenge || challenge.isUsed) {
    return {
      success: false,
      error: 'No active verification code found for this email address. Please request a new code.',
      statusCode: 404,
    };
  }

  if (challenge.isLocked) {
    return {
      success: false,
      error: 'This verification code has been locked due to too many failed attempts. Please request a new code.',
      statusCode: 429,
    };
  }

  if (now > challenge.expiresAt) {
    activeChallenges.delete(normEmail);
    return {
      success: false,
      error: 'Verification code has expired. Please request a new code.',
      statusCode: 410,
    };
  }

  const cleanCode = codeInput.trim();
  const submittedHash = hashOtp(cleanCode, challenge.codeSalt);

  const candidateBuf = Buffer.from(submittedHash, 'hex');
  const storedBuf = Buffer.from(challenge.codeHash, 'hex');

  const matches =
    candidateBuf.length === storedBuf.length && crypto.timingSafeEqual(candidateBuf, storedBuf);

  if (!matches) {
    challenge.failedAttempts += 1;
    if (challenge.failedAttempts >= STATE_TEAM_MAX_VERIFY_ATTEMPTS) {
      challenge.isLocked = true;
      activeChallenges.delete(normEmail);
      return {
        success: false,
        error: 'Too many incorrect attempts. This verification code has been locked. Please request a new code.',
        statusCode: 429,
      };
    }
    return {
      success: false,
      error: `Invalid verification code. ${STATE_TEAM_MAX_VERIFY_ATTEMPTS - challenge.failedAttempts} attempt(s) remaining.`,
      statusCode: 401,
    };
  }

  // Mark challenge used
  challenge.isUsed = true;
  activeChallenges.delete(normEmail);

  const store = getOnboardingStore();
  await store.verifyStateTeamEmail(normEmail);
  const registration = await store.getStateTeamRegistrationByEmail(normEmail);

  if (!registration) {
    return { success: false, error: 'Registration record not found.', statusCode: 404 };
  }

  if (registration.status === 'APPROVED') {
    // Generate authenticated State Reviewer session token
    const token = createSessionToken({
      userId: registration.id,
      username: registration.workEmail,
      name: `${registration.firstName} ${registration.lastName}`.trim(),
      role: 'STATE_REVIEWER',
      allowedStates: [registration.requestedState],
      allowedDistricts: ['*'],
      credentialKind: 'STATE_EVALUATION',
    });

    const session = {
      userId: registration.id,
      name: `${registration.firstName} ${registration.lastName}`.trim(),
      role: 'STATE_REVIEWER' as const,
      allowedStates: [registration.requestedState],
      allowedDistricts: ['*'],
      token,
    };

    return {
      success: true,
      statusCode: 200,
      status: 'APPROVED',
      sessionToken: token,
      session,
      registration,
    };
  }

  return {
    success: true,
    statusCode: 200,
    status: 'PENDING_APPROVAL',
    registration,
  };
}

export const issueStateTeamOtpChallenge = requestStateTeamOtp;
export const verifyStateTeamOtpChallenge = verifyStateTeamOtp;

/**
 * Generates and issues an approved Field-Team Invitation Code.
 * Plaintext code is delivered ONLY to the authorized state team recipient's email.
 */
export async function issueStateTeamInvitation(params: {
  stateTeamId: string;
  state?: string;
  rotate?: boolean;
  maxRedemptions?: number;
  expiryDays?: number;
}): Promise<{
  success: boolean;
  error?: string;
  statusCode: number;
  invitationId: string;
  state: string;
  maxRedemptions: number;
  expiresAt: number;
  deliveredTo: string;
  plainInvitationCode: string;
}> {
  const store = getOnboardingStore();
  const registration = await store.getStateTeamRegistrationById(params.stateTeamId);

  if (!registration) {
    throw new Error('State team member not found.');
  }

  if (registration.status !== 'APPROVED') {
    throw new Error('Cannot issue invitation codes. State team registration is pending approval.');
  }

  const targetState = (params.state || registration.requestedState || '').trim();
  const plainCode = generatePlaintextInvitationCode(targetState);
  const { salt, verifier } = createInvitationVerifierPair(plainCode);

  const maxRedemptions = params.maxRedemptions ?? DEFAULT_MAX_REDEMPTIONS;
  const expiryDays = params.expiryDays ?? DEFAULT_INVITATION_EXPIRY_DAYS;
  const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000;

  // Check for any currently active invitation for this state to rotate it
  const activeExisting = await store.getActiveInvitationForState(targetState);
  let invitation;
  if (activeExisting && params.rotate) {
    invitation = await store.rotateInvitation(activeExisting.id, salt, verifier);
  } else {
    invitation = await store.createInvitation({
      stateTeamId: registration.id,
      state: targetState,
      salt,
      verifier,
      maxRedemptions,
      expiresAt,
    });
  }

  // Send invitation email with plaintext code strictly to the verified coordinator
  await sendStateTeamInvitationEmail({
    to: registration.workEmail,
    name: `${registration.firstName} ${registration.lastName}`.trim(),
    state: targetState,
    plainCode,
    maxRedemptions,
    expiryDays,
  });

  const maskedEmail = registration.workEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3');

  return {
    success: true,
    statusCode: 200,
    invitationId: invitation.id,
    state: invitation.state,
    maxRedemptions: invitation.maxRedemptions,
    expiresAt: invitation.expiresAt,
    deliveredTo: maskedEmail,
    plainInvitationCode: plainCode,
  };
}
