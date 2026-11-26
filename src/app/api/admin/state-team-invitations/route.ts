import { NextRequest, NextResponse } from 'next/server';
import {
  resolveUserAccessScope,
  validateMutationOrigin,
  logSecurityEvent,
} from '@/lib/server/authorisation';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { issueStateTeamAccessInvitationRecord } from '@/lib/server/stateTeamInvitationService';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

function requireAdminScope(scope: Awaited<ReturnType<typeof resolveUserAccessScope>>) {
  return scope.isVerified && (scope.role === 'ADMIN' || scope.role === 'LEADERSHIP');
}

export async function GET(req: NextRequest) {
  const scope = await resolveUserAccessScope(req);
  if (!requireAdminScope(scope)) {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: Administration or Admin privileges required.' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const store = getOnboardingStore();
  const invitations = await store.listStateTeamAccessInvitations();

  const sanitized = invitations.map(({ codeSalt: _s, codeVerifier: _v, ...rest }) => rest);
  return NextResponse.json(
    { status: 'success', invitations: sanitized },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden request origin.' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const scope = await resolveUserAccessScope(req);
  if (!requireAdminScope(scope)) {
    logSecurityEvent({
      actor: scope.userId || 'unknown',
      actorRole: scope.role || 'UNKNOWN',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      details: 'Unauthorized attempt to issue email-bound State Team access invitation',
    });
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: Administration or Admin privileges required.' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Invalid JSON body.' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const invitedEmail = typeof body?.invitedEmail === 'string' ? body.invitedEmail.trim().toLowerCase() : '';
  const recipientName = typeof body?.recipientName === 'string' ? body.recipientName.trim() : undefined;
  const rawState = typeof body?.assignedState === 'string' ? body.assignedState.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : undefined;
  const expiresInDays = typeof body?.expiresInDays === 'number' ? body.expiresInDays : Number(body?.expiresInDays);
  const issuedBy = scope.username || scope.userId || 'administration';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'https://childcare.allianceindia.org';
  const portalUrl = `${baseUrl.replace(/\/+$/, '')}/app`;

  const result = await issueStateTeamAccessInvitationRecord({
    source: 'admin_portal',
    recipientName,
    invitedEmail,
    assignedState: rawState,
    issuedBy,
    actorRateKey: scope.username || scope.userId || 'administration',
    note,
    expiresInDays,
    portalUrl,
    notifyAdministrators: false,
  });

  if (!result.success) {
    return NextResponse.json(
      { status: 'error', code: result.code, error: result.error },
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
    actor: scope.userId,
    actorRole: scope.role,
    eventType: 'STATE_TEAM_INVITATION_ISSUED',
    outcome: 'ALLOW',
    targetResource: result.invitation.id,
    scope: `state=${result.invitation.assignedState},email=${result.invitation.invitedEmail}`,
    details: `Issued single-use State Team access invitation for ${result.invitation.invitedEmail} (${result.invitation.assignedState})`,
  });

  return NextResponse.json(
    {
      status: 'success',
      invitation: result.invitation,
      plainCode: result.plainCode,
      emailDispatched: result.emailDispatched,
      emailError: result.emailError,
      remainingDailyQuota: result.remainingDailyQuota,
    },
    { status: 201, headers: NO_STORE_HEADERS }
  );
}

export async function DELETE(req: NextRequest) {
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json({ status: 'error', error: 'Forbidden request origin.' }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const scope = await resolveUserAccessScope(req);
  if (!requireAdminScope(scope)) {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: Administration or Admin privileges required.' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const invitationId = req.nextUrl.searchParams.get('id')?.trim();
  if (!invitationId) {
    return NextResponse.json({ status: 'error', error: 'Invitation id is required.' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const store = getOnboardingStore();
  const ok = await store.revokeStateTeamAccessInvitation(invitationId, scope.username || scope.userId || 'administration');
  if (!ok) {
    return NextResponse.json({ status: 'error', error: 'Invitation not found.' }, { status: 404, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ status: 'success', message: 'Invitation revoked.' }, { status: 200, headers: NO_STORE_HEADERS });
}
