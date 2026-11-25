import { NextRequest, NextResponse } from 'next/server';
import { issueStateTeamInvitation } from '@/lib/server/stateTeamAuthChallenge';
import { resolveUserAccessScope, validateMutationOrigin, logSecurityEvent } from '@/lib/server/authorisation';

export async function POST(req: NextRequest) {
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', error: originCheck.reason || 'Cross-site request rejected' },
      { status: 403 }
    );
  }

  // Verify caller's authenticated session via server-backed scope (enforces DB approval & revocation)
  const scope = await resolveUserAccessScope(req);

  if (!scope.isVerified || (scope.role !== 'STATE_REVIEWER' && scope.role !== 'ADMIN' && scope.role !== 'LEADERSHIP')) {
    logSecurityEvent({
      actor: scope.userId || 'anonymous',
      actorRole: scope.role || 'FIELD_USER',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      details: 'Unverified, pending, or revoked account attempted to issue field-team invitation code',
    });
    return NextResponse.json(
      { status: 'error', error: 'Unauthorized: Approved State Reviewer or Administration session required.' },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Malformed JSON payload' }, { status: 400 });
  }

  const { state, maxRedemptions, expiryDays } = body || {};
  const targetState = state || scope.allowedStates[0];

  if (!targetState) {
    return NextResponse.json({ status: 'error', error: 'State is required.' }, { status: 400 });
  }

  // Ensure caller cannot issue codes for states they are not authorized for
  if (
    !scope.allowedStates.includes('*') &&
    !scope.allowedStates.map((s) => s.toLowerCase()).includes(targetState.toLowerCase())
  ) {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: You cannot issue invitation codes outside your assigned state.' },
      { status: 403 }
    );
  }

  const result = await issueStateTeamInvitation({
    stateTeamId: scope.userId,
    state: targetState,
    maxRedemptions: typeof maxRedemptions === 'number' ? maxRedemptions : undefined,
    expiryDays: typeof expiryDays === 'number' ? expiryDays : undefined,
  });

  if (!result.success) {
    return NextResponse.json(
      { status: 'error', error: result.error },
      { status: result.statusCode }
    );
  }

  return NextResponse.json(
    {
      status: 'success',
      message: `Invitation code issued and delivered privately to ${result.deliveredTo}.`,
      data: {
        invitationId: result.invitationId,
        state: result.state,
        maxRedemptions: result.maxRedemptions,
        expiresAt: result.expiresAt,
        deliveredTo: result.deliveredTo,
      },
    },
    { status: 200 }
  );
}
