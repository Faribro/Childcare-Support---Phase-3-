import { NextRequest, NextResponse } from 'next/server';
import { issueStateTeamInvitation } from '@/lib/server/stateTeamAuthChallenge';
import { extractSessionToken, verifySessionToken } from '@/lib/server/sessionService';
import { validateMutationOrigin } from '@/lib/server/authorisation';

export async function POST(req: NextRequest) {
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', error: originCheck.reason || 'Cross-site request rejected' },
      { status: 403 }
    );
  }

  // Verify caller's authenticated session
  const token = extractSessionToken(req);
  const session = token ? verifySessionToken(token) : null;

  if (!session || (session.role !== 'STATE_REVIEWER' && session.role !== 'ADMIN')) {
    return NextResponse.json(
      { status: 'error', error: 'Unauthorized: State Reviewer or Admin session required.' },
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
  const targetState = state || session.allowedStates[0];

  if (!targetState) {
    return NextResponse.json({ status: 'error', error: 'State is required.' }, { status: 400 });
  }

  // Ensure caller cannot issue codes for states they are not authorized for
  if (
    !session.allowedStates.includes('*') &&
    !session.allowedStates.map((s) => s.toLowerCase()).includes(targetState.toLowerCase())
  ) {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: You cannot issue invitation codes outside your assigned state.' },
      { status: 403 }
    );
  }

  const result = await issueStateTeamInvitation({
    stateTeamId: session.userId,
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
