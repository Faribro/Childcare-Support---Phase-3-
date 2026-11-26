/**
 * Shared Service for Issuing Single-Use, Email-Bound, Expiring State Team Invitations
 *
 * Used by:
 * - Browser Administration UI: POST /api/admin/state-team-invitations
 * - Google Sheets Bridge:      POST /api/admin/state-team-invitations/sheet-bridge
 *
 * Security Guarantees:
 * - Dedicated SHEET_INVITATION_BRIDGE_SECRET verification (never reuses WEBHOOK_SECRET)
 * - Active administrator allowlist verification on server
 * - Strict canonical 36-State/UT resolution (LGD catalog; numeric code never grants access)
 * - Non-enumerating duplicate/existing-account rejection (never overwrites existing records)
 * - Distributed sliding-window rate limiting per actor and per recipient
 * - Administrator security alert email on every bridge send (zero plaintext invite codes or secrets)
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getOnboardingStore } from './onboardingStore';
import { getCredentialByIdentifier } from './credentialRegistry';
import { getLeaderAuthStore } from './leaderAuthStore';
import {
  findLeaderByEmail,
  getActiveLeaderIdentities,
  type LeaderIdentity,
} from './leaderIdentityStore';
import {
  generatePlaintextInvitationCode,
  createInvitationVerifierPair,
} from './invitationCrypto';
import {
  sendStateTeamAccessInvitationEmail,
  sendAdminStateInvitationNotificationEmail,
} from './emailProvider';
import { resolveCanonicalStateEntry } from '@/lib/constants/stateCatalog';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACTOR_WINDOW_MS = 15 * 60 * 1000;
const ACTOR_MAX_INVITES_15M = 10;
const RECIPIENT_WINDOW_MS = 60 * 60 * 1000;
const RECIPIENT_MAX_INVITES_60M = 3;

export interface IssueInvitationServiceInput {
  source: 'admin_portal' | 'sheet_bridge';
  recipientName?: string;
  invitedEmail: string;
  assignedState: string;
  issuedBy: string;
  actorRateKey: string;
  note?: string;
  expiresInDays?: number;
  portalUrl: string;
  notifyAdministrators?: boolean;
}

export type IssueInvitationServiceResult =
  | {
      success: true;
      statusCode: 201;
      invitation: {
        id: string;
        invitedEmail: string;
        assignedState: string;
        status: string;
        issuedBy: string;
        issuedAt: number;
        expiresAt: number;
        note?: string;
      };
      plainCode?: string;
      emailDispatched: boolean;
      emailError?: string;
      remainingDailyQuota?: number | null;
      adminNotifiedCount?: number;
    }
  | {
      success: false;
      statusCode: number;
      code: string;
      error: string;
      retryAfterSeconds?: number;
    };

function sha256TimingSafeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Verifies dedicated SHEET_INVITATION_BRIDGE_SECRET from request headers.
 * Strictly fails closed and NEVER falls back to WEBHOOK_SECRET.
 */
export function verifySheetInvitationBridgeSecret(req: NextRequest): {
  authorized: boolean;
  statusCode: number;
  code?: string;
  error?: string;
} {
  const expectedSecret = (process.env.SHEET_INVITATION_BRIDGE_SECRET || '').trim();
  if (!expectedSecret) {
    return {
      authorized: false,
      statusCode: 503,
      code: 'BRIDGE_NOT_CONFIGURED',
      error: 'Sheet invitation bridge secret is not configured.',
    };
  }

  const callerSecret = (req.headers.get('x-invitation-bridge-secret') || '').trim();
  if (!callerSecret || !sha256TimingSafeEqual(callerSecret, expectedSecret)) {
    return {
      authorized: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized: invalid or missing bridge secret.',
    };
  }

  return { authorized: true, statusCode: 200 };
}

/**
 * Verifies that the supplied sender email belongs to an active administrator allowlist entry.
 */
export async function verifyAuthorisedAdministratorEmail(actorEmail: string): Promise<{
  authorised: boolean;
  leader?: LeaderIdentity;
}> {
  const norm = (actorEmail || '').trim().toLowerCase();
  if (!norm || !EMAIL_REGEX.test(norm)) {
    return { authorised: false };
  }

  const authStore = getLeaderAuthStore();
  let leader = await authStore.getLeaderIdentityByEmail(norm).catch(() => null);
  if (!leader) {
    leader = findLeaderByEmail(norm);
  }
  if (!leader || !leader.isActive) {
    return { authorised: false };
  }

  return { authorised: true, leader };
}

async function resolveAdminNotificationRecipients(): Promise<string[]> {
  const recipients = new Set<string>();

  for (const leader of getActiveLeaderIdentities()) {
    const email = leader.email.trim().toLowerCase();
    if (EMAIL_REGEX.test(email)) {
      recipients.add(email);
    }
  }

  try {
    const authStore = getLeaderAuthStore();
    if (typeof authStore.listActiveLeaderIdentities === 'function') {
      const storeLeaders = await authStore.listActiveLeaderIdentities();
      for (const leader of storeLeaders) {
        const email = (leader.email || '').trim().toLowerCase();
        // Exclude synthetic @example.org placeholder IDs returned by FirestoreLeaderAuthStore fallback
        if (leader.isActive && EMAIL_REGEX.test(email) && !email.endsWith('@example.org')) {
          recipients.add(email);
        }
      }
    }
  } catch {
    // Fallback cleanly to env allowlist already loaded above
  }

  const extraAdminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL || '').trim().toLowerCase();
  if (EMAIL_REGEX.test(extraAdminEmail)) {
    recipients.add(extraAdminEmail);
  }

  return Array.from(recipients);
}

/**
 * Validates inputs, checks rate limits & duplicates, creates an email-bound single-use
 * State Team access invitation, dispatches email, and optionally alerts administrators.
 */
export async function issueStateTeamAccessInvitationRecord(
  input: IssueInvitationServiceInput
): Promise<IssueInvitationServiceResult> {
  const cleanName = typeof input.recipientName === 'string'
    ? input.recipientName.replace(/[\r\n\t]+/g, ' ').trim()
    : '';
  const cleanEmail = (input.invitedEmail || '').trim().toLowerCase();
  const cleanStateRaw = (input.assignedState || '').trim();

  if (input.source === 'sheet_bridge') {
    if (!cleanName || cleanName.length < 2 || cleanName.length > 120) {
      return {
        success: false,
        statusCode: 400,
        code: 'INVALID_RECIPIENT_NAME',
        error: 'Recipient name must be between 2 and 120 characters.',
      };
    }
  } else if (cleanName.length > 120) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_RECIPIENT_NAME',
      error: 'Recipient name must be at most 120 characters.',
    };
  }

  if (!cleanEmail || cleanEmail.length > 254 || !EMAIL_REGEX.test(cleanEmail)) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_EMAIL',
      error: 'A valid official work email address is required.',
    };
  }

  if (!cleanStateRaw) {
    return {
      success: false,
      statusCode: 400,
      code: 'MISSING_STATE',
      error: 'Assigned state is required.',
    };
  }

  const stateEntry = resolveCanonicalStateEntry(cleanStateRaw);
  if (!stateEntry) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_STATE',
      error: 'Selected state must be a valid Indian State or Union Territory.',
    };
  }

  const rawDays = Number(input.expiresInDays);
  const expiresInDays = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 30 ? Math.floor(rawDays) : 7;
  const assignedState = stateEntry.canonicalName;
  const now = Date.now();
  const store = getOnboardingStore();

  // Rate limits: per issuing administrator & per recipient email
  const actorRl = await store.checkRateLimit(
    `invite-actor:${input.actorRateKey.trim().toLowerCase()}`,
    now,
    ACTOR_MAX_INVITES_15M,
    ACTOR_WINDOW_MS
  );
  if (!actorRl.allowed) {
    return {
      success: false,
      statusCode: 429,
      code: 'RATE_LIMITED',
      error: `Too many invitation requests sent recently. Retry in ${actorRl.retryAfterSeconds || 60} seconds.`,
      retryAfterSeconds: actorRl.retryAfterSeconds,
    };
  }

  const targetRl = await store.checkRateLimit(
    `invite-target:${cleanEmail}`,
    now,
    RECIPIENT_MAX_INVITES_60M,
    RECIPIENT_WINDOW_MS
  );
  if (!targetRl.allowed) {
    return {
      success: false,
      statusCode: 429,
      code: 'RECIPIENT_RATE_LIMITED',
      error: `Too many invitations sent to this email recently. Retry in ${targetRl.retryAfterSeconds || 60} seconds.`,
      retryAfterSeconds: targetRl.retryAfterSeconds,
    };
  }

  // Non-enumerating duplicate & already-active account prevention (zero overwrites)
  const existingReg = await store.getStateTeamRegistrationByEmail(cleanEmail).catch(() => null);
  const existingCred = await getCredentialByIdentifier(cleanEmail).catch(() => null);
  const allInvitations = await store.listStateTeamAccessInvitations().catch(() => []);
  const hasActiveInvite = allInvitations.some(
    (inv) =>
      (inv.invitedEmail || '').trim().toLowerCase() === cleanEmail &&
      inv.status === 'ACTIVE' &&
      inv.expiresAt > now
  );

  if (existingReg || existingCred?.isActive || hasActiveInvite) {
    return {
      success: false,
      statusCode: 409,
      code: 'DUPLICATE_OR_EXISTING_ACCOUNT',
      error: 'Unable to send invitation: an active account, existing registration, or pending invitation is already registered for this email.',
    };
  }

  const plainCode = generatePlaintextInvitationCode(assignedState);
  const { salt, verifier } = createInvitationVerifierPair(plainCode);
  const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;
  const expiresAtIso = new Date(expiresAt).toISOString();

  const invitation = await store.createStateTeamAccessInvitation({
    invitedEmail: cleanEmail,
    assignedState,
    codeSalt: salt,
    codeVerifier: verifier,
    issuedBy: input.issuedBy,
    expiresAt,
    note: input.note || (cleanName ? `Recipient: ${cleanName}` : undefined),
  });

  const emailRes = await sendStateTeamAccessInvitationEmail({
    to: cleanEmail,
    recipientName: cleanName || undefined,
    assignedState,
    plainCode,
    issuedBy: input.issuedBy,
    expiresAtIso,
    portalUrl: input.portalUrl,
  });

  if (input.source === 'sheet_bridge' && !emailRes.success) {
    await store
      .revokeStateTeamAccessInvitation(invitation.id, 'system:email_dispatch_failed')
      .catch(() => false);
    return {
      success: false,
      statusCode: 502,
      code: 'EMAIL_DISPATCH_FAILED',
      error: 'Unable to deliver the invitation email right now. Please try again later.',
    };
  }

  let adminNotifiedCount: number | undefined;
  if (input.notifyAdministrators) {
    const adminRecipients = await resolveAdminNotificationRecipients();
    const settled = await Promise.allSettled(
      adminRecipients.map((adminEmail) =>
        sendAdminStateInvitationNotificationEmail({
          adminEmail,
          senderEmail: input.issuedBy,
          recipientName: cleanName || undefined,
          recipientEmail: cleanEmail,
          assignedState,
          invitationId: invitation.id,
          expiresAtIso,
          source: input.source,
        })
      )
    );
    adminNotifiedCount = settled.filter(
      (r) => r.status === 'fulfilled' && r.value.success
    ).length;
  }

  const { codeSalt: _s, codeVerifier: _v, ...sanitized } = invitation;
  return {
    success: true,
    statusCode: 201,
    invitation: sanitized,
    // Strictly never return plainCode to the Sheet bridge
    ...(input.source === 'admin_portal' ? { plainCode } : {}),
    emailDispatched: emailRes.success,
    emailError: emailRes.success ? undefined : emailRes.error,
    remainingDailyQuota: emailRes.remainingDailyQuota ?? null,
    adminNotifiedCount,
  };
}
