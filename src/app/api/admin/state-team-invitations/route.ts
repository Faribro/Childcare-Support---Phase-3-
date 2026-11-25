import { NextRequest, NextResponse } from 'next/server';
import {
  resolveUserAccessScope,
  validateMutationOrigin,
  logSecurityEvent,
} from '@/lib/server/authorisation';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { canonicalizeStateName } from '@/lib/constants/stateNormalization';
import {
  generatePlaintextInvitationCode,
  createInvitationVerifierPair,
} from '@/lib/server/invitationCrypto';
import { sendStateTeamAccessInvitationEmail } from '@/lib/server/emailProvider';

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
  const rawState = typeof body?.assignedState === 'string' ? body.assignedState.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : undefined;
  const rawDays = Number(body?.expiresInDays);
  const expiresInDays = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 30 ? Math.floor(rawDays) : 7;

  if (!invitedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
    return NextResponse.json(
      { status: 'error', error: 'A valid official work email address is required.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!rawState) {
    return NextResponse.json(
      { status: 'error', error: 'Assigned state is required.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const assignedState = canonicalizeStateName(rawState) || rawState;
  const plainCode = generatePlaintextInvitationCode(assignedState);
  const { salt, verifier } = createInvitationVerifierPair(plainCode);
  const issuedBy = scope.username || scope.userId || 'administration';
  const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;

  const store = getOnboardingStore();
  const invitation = await store.createStateTeamAccessInvitation({
    invitedEmail,
    assignedState,
    codeSalt: salt,
    codeVerifier: verifier,
    issuedBy,
    expiresAt,
    note,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'https://childcare.allianceindia.org';
  const portalUrl = `${baseUrl.replace(/\/+$/, '')}/app`;
  const emailRes = await sendStateTeamAccessInvitationEmail({
    to: invitedEmail,
    assignedState,
    plainCode,
    issuedBy,
    expiresAtIso: new Date(expiresAt).toISOString(),
    portalUrl,
  });

  logSecurityEvent({
    actor: scope.userId,
    actorRole: scope.role,
    eventType: 'STATE_TEAM_INVITATION_ISSUED',
    outcome: 'ALLOW',
    targetResource: invitation.id,
    scope: `state=${assignedState},email=${invitedEmail}`,
    details: `Issued single-use State Team access invitation for ${invitedEmail} (${assignedState})`,
  });

  const { codeSalt: _s, codeVerifier: _v, ...sanitized } = invitation;
  return NextResponse.json(
    {
      status: 'success',
      invitation: sanitized,
      plainCode,
      emailDispatched: emailRes.success,
      emailError: emailRes.success ? undefined : emailRes.error,
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
