import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/server/authorisation';
import {
  verifySheetInvitationBridgeSecret,
  verifyAuthorisedAdministratorEmail,
} from '@/lib/server/stateTeamInvitationService';
import {
  resolveActiveLeaderContacts,
  getConfiguredAdminAccessCode,
} from '@/lib/server/staffAccessGateService';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { sendAdminPortalAccessCodeEmail } from '@/lib/server/emailProvider';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

const ACTOR_WINDOW_MS = 15 * 60 * 1000;
const ACTOR_MAX_SENDS_15M = 10;
const TARGET_WINDOW_MS = 60 * 60 * 1000;
const TARGET_MAX_SENDS_60M = 5;

/**
 * Google Sheets Staff Access Admin Bridge:
 * - action: 'list' -> returns allowlisted administrator `{ id, name, email }` options
 * - action: 'send' -> dispatches server-only ADMIN_PORTAL_ACCESS_CODE strictly to the
 *   chosen allowlisted administrator's stored email (never returns code in HTTP JSON).
 */
export async function POST(req: NextRequest) {
  const secretCheck = verifySheetInvitationBridgeSecret(req);
  if (!secretCheck.authorized) {
    logSecurityEvent({
      actor: 'admin_sheet_bridge',
      actorRole: 'UNKNOWN',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      details: `Admin access sheet bridge rejected request (${secretCheck.code || 'UNAUTHORIZED'})`,
    });
    return NextResponse.json(
      {
        status: 'error',
        code: secretCheck.code || 'UNAUTHORIZED',
        error: secretCheck.error || 'Unauthorized request.',
      },
      { status: secretCheck.statusCode, headers: NO_STORE_HEADERS }
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: 'error', code: 'MALFORMED_JSON', error: 'Invalid JSON request body.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const actorEmail = typeof body?.actorEmail === 'string' ? body.actorEmail.trim().toLowerCase() : '';
  const authCheck = await verifyAuthorisedAdministratorEmail(actorEmail);
  if (!authCheck.authorised || !authCheck.leader) {
    const maskedActor = actorEmail ? `${actorEmail.slice(0, 3)}***` : 'empty';
    logSecurityEvent({
      actor: maskedActor,
      actorRole: 'UNAUTHORISED_SHEET_USER',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      details: 'Non-allowlisted or inactive sender rejected by Admin Access sheet bridge',
    });
    return NextResponse.json(
      {
        status: 'error',
        code: 'FORBIDDEN_SENDER',
        error: 'Only authorised programme administrators can access Administration code dispatch.',
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : 'send';
  const contacts = await resolveActiveLeaderContacts();

  if (action === 'list') {
    return NextResponse.json(
      {
        status: 'success',
        administrators: contacts,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const configuredAdminCode = getConfiguredAdminAccessCode();
  if (!configuredAdminCode) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'ADMIN_GATE_NOT_CONFIGURED',
        error: 'Server Administration access code (ADMIN_PORTAL_ACCESS_CODE) is not configured or collides with a State PIN.',
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const targetEmailRaw =
    typeof body?.targetEmail === 'string'
      ? body.targetEmail.trim().toLowerCase()
      : typeof body?.recipientEmail === 'string'
        ? body.recipientEmail.trim().toLowerCase()
        : '';
  const targetIdRaw = typeof body?.targetId === 'string' ? body.targetId.trim() : '';

  const targetContact = contacts.find(
    (c) => (targetEmailRaw && c.email === targetEmailRaw) || (targetIdRaw && c.id === targetIdRaw)
  );
  if (!targetContact) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'RECIPIENT_NOT_ALLOWLISTED',
        error: 'Selected recipient is not an active allowlisted Programme Administrator.',
      },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const now = Date.now();
  const store = getOnboardingStore();
  const actorRl = await store.checkRateLimit(
    `admin-code-actor:${authCheck.leader.email.trim().toLowerCase()}`,
    now,
    ACTOR_MAX_SENDS_15M,
    ACTOR_WINDOW_MS
  );
  if (!actorRl.allowed) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'RATE_LIMITED',
        error: `Too many requests sent recently. Retry in ${actorRl.retryAfterSeconds || 60} seconds.`,
        retryAfterSeconds: actorRl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...(actorRl.retryAfterSeconds ? { 'Retry-After': String(actorRl.retryAfterSeconds) } : {}),
        },
      }
    );
  }

  const targetRl = await store.checkRateLimit(
    `admin-code-target:${targetContact.email}`,
    now,
    TARGET_MAX_SENDS_60M,
    TARGET_WINDOW_MS
  );
  if (!targetRl.allowed) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'RECIPIENT_RATE_LIMITED',
        error: `Too many Admin access code emails dispatched to this recipient recently. Retry in ${targetRl.retryAfterSeconds || 60} seconds.`,
        retryAfterSeconds: targetRl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...(targetRl.retryAfterSeconds ? { 'Retry-After': String(targetRl.retryAfterSeconds) } : {}),
        },
      }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'https://childcare.allianceindia.org';
  const portalUrl = `${baseUrl.replace(/\/+$/, '')}/app`;

  const mailRes = await sendAdminPortalAccessCodeEmail({
    to: targetContact.email,
    recipientName: targetContact.name,
    issuedBy: authCheck.leader.email,
    adminCode: configuredAdminCode,
    portalUrl,
  });

  if (!mailRes.success) {
    logSecurityEvent({
      actor: authCheck.leader.id,
      actorRole: 'LEADERSHIP',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      targetResource: targetContact.id,
      details: `Admin access code dispatch failed (${mailRes.error || 'email provider failure'})`,
    });
    return NextResponse.json(
      {
        status: 'error',
        code: 'EMAIL_DELIVERY_FAILED',
        error: mailRes.error || 'Failed to deliver Administration access code email.',
      },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }

  logSecurityEvent({
    actor: authCheck.leader.id,
    actorRole: 'LEADERSHIP',
    eventType: 'AUTH_SUCCESS',
    outcome: 'ALLOW',
    targetResource: targetContact.id,
    scope: 'admin_access_code_dispatched',
    details: 'Confidential Administration access code dispatched to allowlisted administrator via Sheet bridge',
  });

  return NextResponse.json(
    {
      status: 'success',
      recipientId: targetContact.id,
      recipientName: targetContact.name,
      deliveredTo: targetContact.email,
      emailDispatched: true,
      remainingDailyQuota: mailRes.remainingDailyQuota ?? null,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
