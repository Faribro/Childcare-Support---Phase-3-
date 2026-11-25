import { NextRequest, NextResponse } from 'next/server';
import {
  resolveUserAccessScope,
  validateMutationOrigin,
  logSecurityEvent,
} from '@/lib/server/authorisation';
import { getOnboardingStore } from '@/lib/server/onboardingStore';

export const dynamic = 'force-dynamic';

/**
 * Revokes an approved or pending State Team registration immediately.
 * Only verified ADMIN or LEADERSHIP callers can invoke this endpoint.
 * Preserves audit fields (`revokedBy`, `revokedAt`, `revocationReason`) and increments `authVersion`
 * so all existing sessions for that individual fail immediately on the next request.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden request origin.' },
      { status: 403 }
    );
  }

  const scope = await resolveUserAccessScope(req);
  if (!scope.isVerified || (scope.role !== 'ADMIN' && scope.role !== 'LEADERSHIP')) {
    logSecurityEvent({
      actor: scope.userId || 'unknown',
      actorRole: scope.role || 'UNKNOWN',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      ip: clientIp,
      details: 'Unauthorized attempt to revoke a State Team registration',
    });
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: Administration or Admin privileges required.' },
      { status: 403 }
    );
  }

  const registrationId = params.id;
  if (!registrationId) {
    return NextResponse.json(
      { status: 'error', error: 'Registration ID is required.' },
      { status: 400 }
    );
  }

  let reason = 'Access revoked by Administration';
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body.reason === 'string' && body.reason.trim()) {
      reason = body.reason.trim();
    }
  } catch {
    // Optional body
  }

  const store = getOnboardingStore();
  const registration = await store.getStateTeamRegistrationById(registrationId);
  if (!registration) {
    return NextResponse.json(
      { status: 'error', error: 'Registration not found.' },
      { status: 404 }
    );
  }

  const revokerIdentifier = scope.username || scope.userId || 'admin';
  const revoked = await store.revokeStateTeamRegistration(registrationId, revokerIdentifier, reason);

  if (!revoked) {
    return NextResponse.json(
      { status: 'error', error: 'Failed to revoke registration.' },
      { status: 500 }
    );
  }

  logSecurityEvent({
    actor: scope.userId,
    actorRole: scope.role,
    eventType: 'STATE_TEAM_ACCESS_REVOKED',
    outcome: 'ALLOW',
    targetResource: registration.id,
    scope: `state=${registration.assignedState || registration.requestedState}`,
    ip: clientIp,
    details: `Revoked State Team access for ${registration.workEmail}: ${reason}`,
  });

  const updated = await store.getStateTeamRegistrationById(registrationId);
  return NextResponse.json({
    status: 'success',
    message: `Access revoked for ${registration.workEmail}. Existing sessions invalidated immediately.`,
    registration: updated,
  });
}
