import { NextRequest, NextResponse } from 'next/server';
import { requestStateTeamLoginOtp } from '@/lib/server/stateTeamAuthChallenge';
import { validateMutationOrigin } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

/**
 * Initiates individual Email OTP sign-in for an already-approved, active State Team coordinator.
 */
export async function POST(req: NextRequest) {
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', error: originCheck.reason || 'Cross-site request rejected' },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Malformed JSON payload' }, { status: 400 });
  }

  const workEmail = body?.workEmail || body?.email;
  try {
    const result = await requestStateTeamLoginOtp({ workEmail });
    if (!result.success) {
      return NextResponse.json(
        { status: 'error', error: result.error },
        { status: result.statusCode }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        message: result.message,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[State Team Login OTP:DB_ERROR]', err?.message);
    return NextResponse.json(
      { status: 'error', error: 'Authentication service is temporarily unavailable. Please retry in a moment.' },
      { status: 503 }
    );
  }
}
