/**
 * State Team Registration, OTP Verification, Sign-In, and Invitation Challenge Manager
 *
 * Security Invariants:
 * - Zero domain-based self-approval (`isEmailPreApprovedForState` always returns false)
 * - Self-registration without an Administration-issued email-bound invitation stays `PENDING_APPROVAL`
 *   with zero sessions, passwords, or active field invitations until Administration approves
 * - Administration-issued email-bound single-use invitations assign `assignedState` server-side and
 *   redeem atomically only after 6-digit email OTP verification succeeds
 * - Existing approved State Team members sign in via individual email OTP (`requestStateTeamLoginOtp`)
 */

import crypto from 'crypto';
import { getOnboardingStore } from './onboardingStore';
import { DuplicateRegistrationError } from '@/lib/types/onboarding';
import { sendStateTeamOtpEmail, sendStateTeamInvitationEmail, sendAdminPendingRegistrationEmail } from './emailProvider';
import { createSessionToken } from './sessionService';
import {
  getCredentialByIdentifier,
} from './credentialRegistry';
import { canonicalizeStateName } from '@/lib/constants/stateNormalization';
import {
  generatePlaintextInvitationCode,
  createInvitationVerifierPair,
  DEFAULT_MAX_REDEMPTIONS,
  DEFAULT_INVITATION_EXPIRY_DAYS,
} from './invitationCrypto';

export const STATE_TEAM_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const STATE_TEAM_MAX_VERIFY_ATTEMPTS = 5;

export interface StateTeamOtpChallenge {
  challengeId: string;
  purpose?: 'registration' | 'login';
  workEmail: string;
  name: string;
  state: string;
  registrationId?: string;
  pendingAccessInvitationId?: string | null;
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
export function isEmailPreApprovedForState(_email: string, _state: string): boolean {
  // Security hardening: email-domain self-approval is permanently disabled.
  // State Team access requires either an Administration-issued email-bound single-use
  // invitation or explicit Administration approval after email OTP verification.
  return false;
}

/**
 * Requests a State-Team access request OTP (either with an Administration-issued single-use
 * email-bound invitation code, or an unprivileged pending access request awaiting Administration approval).
 */
export async function requestStateTeamOtp(params: {
  firstName: string;
  lastName?: string;
  workEmail: string;
  requestedState: string;
  organization: string;
  invitationCode?: string;
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

  const trimmedInviteCode = typeof params.invitationCode === 'string' ? params.invitationCode.trim() : '';
  if (!params.requestedState?.trim() && !trimmedInviteCode) {
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

  // Prevent overwriting or hijacking any existing registration or active credential
  const existingReg = await store.getStateTeamRegistrationByEmail(normEmail);
  if (existingReg) {
    if (
      existingReg.status === 'APPROVED' ||
      existingReg.emailVerified ||
      existingReg.status === 'REJECTED' ||
      existingReg.status === 'SUSPENDED' ||
      existingReg.status === 'REVOKED'
    ) {
      return {
        success: false,
        error: 'An account or registration for this email already exists and cannot be overwritten. Use Sign in with email OTP or contact Administration.',
        statusCode: 409,
      };
    }
  }

  const existingCred = await getCredentialByIdentifier(normEmail).catch(() => null);
  if (existingCred && existingCred.isActive) {
    return {
      success: false,
      error: 'An active staff account for this email already exists. Please use Sign in with email OTP.',
      statusCode: 409,
    };
  }

  // If an invitation code is provided, verify it against an Administration-issued email-bound invitation
  // (Atomic single-use redemption happens strictly AFTER OTP verification succeeds)
  let validInviteId: string | null = null;
  let authoritativeState = params.requestedState
    ? canonicalizeStateName(params.requestedState) || params.requestedState.trim()
    : '';

  if (trimmedInviteCode) {
    const inviteCheck = await store.findValidStateTeamAccessInvitation({
      invitedEmail: normEmail,
      plainCode: trimmedInviteCode,
      now,
    });
    if (!inviteCheck.valid || !inviteCheck.invitation) {
      return {
        success: false,
        error: inviteCheck.error || 'Invalid, expired, or email-mismatched invitation code.',
        statusCode: inviteCheck.statusCode || 403,
      };
    }
    validInviteId = inviteCheck.invitation.id;
    // Server invitation strictly dictates assigned state (never client-chosen state)
    authoritativeState = canonicalizeStateName(inviteCheck.invitation.assignedState) || inviteCheck.invitation.assignedState;
  }

  let registration;
  try {
    registration = await store.createStateTeamRegistration({
      firstName: params.firstName,
      lastName: params.lastName || '',
      workEmail: normEmail,
      requestedState: authoritativeState,
      assignedState: validInviteId ? authoritativeState : undefined,
      invitationId: validInviteId || undefined,
      organization: params.organization || 'Alliance India Partner',
      autoApprove: false,
    });
  } catch (err: any) {
    if (err instanceof DuplicateRegistrationError || err?.code === 'EMAIL_ALREADY_REGISTERED') {
      return {
        success: false,
        error: 'An account or registration for this email already exists and cannot be overwritten.',
        statusCode: 409,
      };
    }
    throw err;
  }

  // Generate 6-digit numeric OTP (NO credentials, NO passwords, NO field-team invitations created prior to approval)
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashOtp(rawOtp, salt);

  const challenge: StateTeamOtpChallenge = {
    challengeId: crypto.randomUUID(),
    purpose: 'registration',
    workEmail: normEmail,
    name: `${registration.firstName} ${registration.lastName}`.trim(),
    state: authoritativeState,
    registrationId: registration.id,
    pendingAccessInvitationId: validInviteId,
    codeSalt: salt,
    codeHash,
    expiresAt: now + STATE_TEAM_OTP_TTL_MS,
    failedAttempts: 0,
    isUsed: false,
    isLocked: false,
  };

  await store.saveStateTeamChallenge(challenge);
  activeChallenges.set(normEmail, challenge);

  const emailResult = await sendStateTeamOtpEmail({
    to: normEmail,
    name: challenge.name,
    state: challenge.state,
    code: rawOtp,
    expiryMinutes: 10,
    isLoginOtp: false,
  });

  if (!emailResult.success) {
    await store.deleteStateTeamChallenge(normEmail);
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
    message: validInviteId
      ? `Verification code sent to ${normEmail}. Enter the code to activate your invited ${authoritativeState} State Team access.`
      : `Verification code sent to ${normEmail}. After confirming your email, your access request will await Administration approval.`,
    registration,
  };
}

/**
 * Requests a sign-in OTP exclusively for an already-approved, active State Team coordinator.
 * Rejects unapproved, pending, rejected, revoked, suspended, or unknown accounts without granting credentials.
 */
export async function requestStateTeamLoginOtp(params: {
  workEmail: string;
}): Promise<{
  success: boolean;
  error?: string;
  statusCode: number;
  message?: string;
}> {
  const normEmail = normalizeEmail(params.workEmail);
  if (!normEmail || !normEmail.includes('@')) {
    return { success: false, error: 'A valid work email address is required.', statusCode: 400 };
  }

  const store = getOnboardingStore();
  const now = Date.now();

  const rateLimit = await store.checkRateLimit(`state-team-login-otp:${normEmail}`, now, 5, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Too many sign-in attempts. Please retry in ${rateLimit.retryAfterSeconds} seconds.`,
      statusCode: 429,
    };
  }

  const reg = await store.getStateTeamRegistrationByEmail(normEmail);
  if (!reg) {
    return {
      success: false,
      error: 'No approved State Team account found for this work email. Submit Request access or contact Administration.',
      statusCode: 403,
    };
  }

  if (reg.status === 'PENDING_APPROVAL' || reg.status === 'PENDING') {
    return {
      success: false,
      error: 'Your access request is awaiting Administration approval.',
      statusCode: 403,
    };
  }

  if (reg.status !== 'APPROVED' || !reg.emailVerified) {
    return {
      success: false,
      error: 'Your State Team access is inactive or has been revoked. Contact Administration.',
      statusCode: 403,
    };
  }

  const cred = await getCredentialByIdentifier(normEmail).catch(() => null);
  if (cred && !cred.isActive) {
    return {
      success: false,
      error: 'Your State Team access has been deactivated. Contact Administration.',
      statusCode: 403,
    };
  }

  const assignedState = canonicalizeStateName(reg.assignedState || reg.requestedState) || reg.requestedState;
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashOtp(rawOtp, salt);

  const challenge: StateTeamOtpChallenge = {
    challengeId: crypto.randomUUID(),
    purpose: 'login',
    workEmail: normEmail,
    name: `${reg.firstName} ${reg.lastName}`.trim(),
    state: assignedState,
    registrationId: reg.id,
    pendingAccessInvitationId: null,
    codeSalt: salt,
    codeHash,
    expiresAt: now + STATE_TEAM_OTP_TTL_MS,
    failedAttempts: 0,
    isUsed: false,
    isLocked: false,
  };

  await store.saveStateTeamChallenge(challenge);
  activeChallenges.set(normEmail, challenge);

  const emailResult = await sendStateTeamOtpEmail({
    to: normEmail,
    name: challenge.name,
    state: assignedState,
    code: rawOtp,
    expiryMinutes: 10,
    isLoginOtp: true,
  });

  if (!emailResult.success) {
    await store.deleteStateTeamChallenge(normEmail);
    activeChallenges.delete(normEmail);
    return {
      success: false,
      error: 'Unable to deliver sign-in code. Please try again later.',
      statusCode: 502,
    };
  }

  return {
    success: true,
    statusCode: 200,
    message: `One-time sign-in code sent to ${normEmail}.`,
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
  const store = getOnboardingStore();
  const challenge = (await store.getStateTeamChallenge(normEmail)) || activeChallenges.get(normEmail);
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
    const isLocked = challenge.failedAttempts >= STATE_TEAM_MAX_VERIFY_ATTEMPTS;
    challenge.isLocked = isLocked;
    await store.recordStateTeamChallengeAttempt(normEmail, challenge.failedAttempts, isLocked);
    if (isLocked) {
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
  await store.deleteStateTeamChallenge(normEmail);

  let registration = await store.getStateTeamRegistrationByEmail(normEmail);
  if (!registration) {
    return { success: false, error: 'Registration record not found.', statusCode: 404 };
  }

  if (registration.status === 'REJECTED' || registration.status === 'SUSPENDED' || registration.status === 'REVOKED') {
    return {
      success: false,
      error: 'Your State Team access is inactive or has been revoked. Contact Administration.',
      statusCode: 403,
    };
  }

  if (challenge.purpose !== 'login') {
    await store.verifyStateTeamEmail(normEmail);

    if (challenge.pendingAccessInvitationId) {
      const redeem = await store.atomicRedeemStateTeamAccessInvitation({
        invitationId: challenge.pendingAccessInvitationId,
        invitedEmail: normEmail,
        registrationId: registration.id,
        now,
      });
      if (!redeem.success || !redeem.invitation) {
        return {
          success: false,
          error: redeem.error || 'This single-use invitation code could not be redeemed.',
          statusCode: redeem.statusCode || 409,
        };
      }
      await store.approveStateTeamRegistration(
        registration.id,
        redeem.invitation.issuedBy,
        redeem.invitation.assignedState
      );

      // Dispatch best-effort welcome/approval confirmation containing the all-time 3-digit State PIN
      const approvedState =
        canonicalizeStateName(redeem.invitation.assignedState) || redeem.invitation.assignedState;
      const appUrl = (
        process.env.NEXT_PUBLIC_APP_URL || 'https://childcare.allianceindia.org'
      ).replace(/\/+$/, '');
      try {
        const { sendCoordinatorApprovalNotificationEmail } = await import('./emailProvider');
        await sendCoordinatorApprovalNotificationEmail({
          coordinatorEmail: normEmail,
          coordinatorName: `${registration.firstName} ${registration.lastName}`.trim(),
          state: approvedState,
          portalUrl: `${appUrl}/app`,
        });
      } catch (emailErr: any) {
        console.warn('[STATE_TEAM_OTP:WARN] Welcome approval email failed after invite redemption:', emailErr?.message);
      }
    }

    registration = await store.getStateTeamRegistrationByEmail(normEmail);
    if (!registration) {
      return { success: false, error: 'Registration record not found.', statusCode: 404 };
    }
  } else {
    if (!registration.emailVerified || registration.status !== 'APPROVED') {
      return {
        success: false,
        error: 'Your State Team access is pending Administration approval or has been revoked.',
        statusCode: 403,
      };
    }
  }

  if (registration.status === 'APPROVED') {
    const canonicalState =
      canonicalizeStateName(registration.assignedState || registration.requestedState) ||
      registration.assignedState ||
      registration.requestedState;
    const authVersion = registration.authVersion || 1;
    // Generate individual State Reviewer session token bound to server-assigned state & revocation version
    const token = createSessionToken({
      userId: registration.id,
      username: registration.workEmail,
      name: `${registration.firstName} ${registration.lastName}`.trim(),
      role: 'STATE_REVIEWER',
      allowedStates: [canonicalState],
      allowedDistricts: ['*'],
      credentialVersion: authVersion,
      credentialKind: 'STATE_EVALUATION',
      canEdit: true,
      authMethod: 'email_otp',
    });

    const session = {
      userId: registration.id,
      name: `${registration.firstName} ${registration.lastName}`.trim(),
      role: 'STATE_REVIEWER' as const,
      allowedStates: [canonicalState],
      allowedDistricts: ['*'],
      canEdit: true,
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

  // Notify designated administrator if not already notified (deduplicated)
  let notesObj: any = {};
  try {
    if (registration.notes) notesObj = JSON.parse(registration.notes);
  } catch {
    notesObj = { text: registration.notes };
  }

  if (!notesObj.adminNotifiedAt) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://childcare-support-phase-3.vercel.app';
    const reviewUrl = `${appUrl}/supervisor/registrations?id=${registration.id}`;
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'fsayyed@allianceindia.org';

    try {
      const notifyRes = await sendAdminPendingRegistrationEmail({
        adminEmail,
        applicantName: `${registration.firstName} ${registration.lastName}`.trim(),
        applicantEmail: registration.workEmail,
        organization: registration.organization,
        requestedState: registration.requestedState,
        verifiedAtIso: new Date().toISOString(),
        reviewUrl,
      });

      if (notifyRes.success) {
        notesObj.adminNotifiedAt = new Date().toISOString();
        notesObj.adminNotificationRecipient = adminEmail;
        notesObj.adminNotificationProvider = notifyRes.provider;
        notesObj.adminNotificationMessageId = notifyRes.messageId || null;
        notesObj.adminNotificationStatus = 'ACCEPTED';
        delete notesObj.adminNotificationError;
        await store.updateRegistrationNotes(registration.id, JSON.stringify(notesObj));
        registration.notes = JSON.stringify(notesObj);
      } else {
        notesObj.adminNotificationError = notifyRes.error || 'Provider rejected notification dispatch';
        notesObj.adminNotificationLastAttemptAt = new Date().toISOString();
        notesObj.adminNotificationStatus = 'FAILED';
        await store.updateRegistrationNotes(registration.id, JSON.stringify(notesObj));
        registration.notes = JSON.stringify(notesObj);
      }
    } catch (err: any) {
      console.error('[ADMIN_NOTIFY:ERROR] Failed to dispatch admin pending notification:', err?.message);
      notesObj.adminNotificationError = err?.message || 'Unexpected notification dispatch error';
      notesObj.adminNotificationLastAttemptAt = new Date().toISOString();
      notesObj.adminNotificationStatus = 'FAILED';
      try {
        await store.updateRegistrationNotes(registration.id, JSON.stringify(notesObj));
        registration.notes = JSON.stringify(notesObj);
      } catch (_) {}
    }
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
    throw new Error('Cannot issue invitation codes. State team access is not approved or has been revoked.');
  }

  const authoritativeState =
    canonicalizeStateName(registration.assignedState || registration.requestedState) ||
    registration.assignedState ||
    registration.requestedState;
  const targetState = (params.state || authoritativeState || '').trim();
  if (authoritativeState && targetState && canonicalizeStateName(targetState).toLowerCase() !== authoritativeState.toLowerCase()) {
    throw new Error(`Forbidden: Cannot issue field invitations outside assigned state (${authoritativeState}).`);
  }
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
