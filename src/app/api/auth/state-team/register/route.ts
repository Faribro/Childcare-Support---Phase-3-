import { NextRequest, NextResponse } from 'next/server';
import { requestStateTeamOtp } from '@/lib/server/stateTeamAuthChallenge';
import { validateMutationOrigin } from '@/lib/server/authorisation';

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

  const { firstName, lastName, workEmail, requestedState, organization } = body || {};

  try {
    const result = await requestStateTeamOtp({
      firstName,
      lastName,
      workEmail,
      requestedState,
      organization,
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
        message: result.message,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[State Team Register:DB_ERROR]', err?.message);
    return NextResponse.json(
      { status: 'error', error: 'Database service is temporarily unavailable. Please retry in a moment.' },
      { status: 503 }
    );
  }
}
