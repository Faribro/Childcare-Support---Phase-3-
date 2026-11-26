import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/server/authorisation';
import {
  verifySheetInvitationBridgeSecret,
  verifyAuthorisedAdministratorEmail,
  issueStateTeamAccessInvitationRecord,
} from '@/lib/server/stateTeamInvitationService';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

export async function POST(req: NextRequest) {
  const secretCheck = verifySheetInvitationBridgeSecret(req);
  if (!secretCheck.authorized) {
    logSecurityEvent({
      actor: 'sheet_bridge',
      actorRole: 'UNKNOWN',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      details: `Sheet invitation bridge rejected request (${secretCheck.code || 'UNAUTHORIZED'})`,
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
      details: 'Non-allowlisted or inactive sender rejected by Sheet invitation bridge',
    });
    return NextResponse.json(
      {
        status: 'error',
        code: 'FORBIDDEN_SENDER',
        error: 'Only authorised programme administrators can send State Code Invitations.',
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const recipientName = typeof body?.recipientName === 'string' ? body.recipientName : '';
  const recipientEmail =
    typeof body?.recipientEmail === 'string'
      ? body.recipientEmail
      : typeof body?.invitedEmail === 'string'
        ? body.invitedEmail
        : '';
  const assignedState =
    typeof body?.assignedState === 'string'
      ? body.assignedState
      : typeof body?.state === 'string'
        ? body.state
        : '';

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'https://childcare.allianceindia.org';
  const portalUrl = `${baseUrl.replace(/\/+$/, '')}/app`;

  const result = await issueStateTeamAccessInvitationRecord({
    source: 'sheet_bridge',
    recipientName,
    invitedEmail: recipientEmail,
    assignedState,
    issuedBy: authCheck.leader.email,
    actorRateKey: authCheck.leader.email,
    note: `Issued via Google Sheet Staff Access menu by ${authCheck.leader.email}`,
    expiresInDays: typeof body?.expiresInDays === 'number' ? body.expiresInDays : 7,
    portalUrl,
    notifyAdministrators: true,
  });

  if (!result.success) {
    logSecurityEvent({
      actor: authCheck.leader.id,
      actorRole: 'LEADERSHIP',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      details: `Sheet invitation bridge rejected issuance (${result.code})`,
    });
    return NextResponse.json(
      {
        status: 'error',
        code: result.code,
        error: result.error,
        ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      },
      {
        status: result.statusCode,
        headers: {
          ...NO_STORE_HEADERS,
          ...(result.retryAfterSeconds ? { 'Retry-After': String(result.retryAfterSeconds) } : {}),
        },
      }
    );
  }

  logSecurityEvent({
    actor: authCheck.leader.id,
    actorRole: 'LEADERSHIP',
    eventType: 'STATE_TEAM_INVITATION_ISSUED',
    outcome: 'ALLOW',
    targetResource: result.invitation.id,
    scope: `state=${result.invitation.assignedState},source=sheet_bridge`,
    details: `Sheet bridge issued single-use State Team access invitation (${result.invitation.assignedState})`,
  });

  return NextResponse.json(
    {
      status: 'success',
      invitation: result.invitation,
      emailDispatched: result.emailDispatched,
      remainingDailyQuota: result.remainingDailyQuota,
      adminNotifiedCount: result.adminNotifiedCount,
    },
    { status: 201, headers: NO_STORE_HEADERS }
  );
}
