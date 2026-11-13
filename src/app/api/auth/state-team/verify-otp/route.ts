import { NextRequest, NextResponse } from 'next/server';
import { verifyStateTeamOtp } from '@/lib/server/stateTeamAuthChallenge';
import { validateMutationOrigin } from '@/lib/server/authorisation';
import { setSessionCookie } from '@/lib/server/sessionService';

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
  const code = body?.code || body?.otp;

  if (!workEmail || !code) {
    return NextResponse.json(
      { status: 'error', error: 'Work email and verification code are required.' },
      { status: 400 }
    );
  }

  const result = await verifyStateTeamOtp({ workEmail, code });

  if (!result.success) {
    return NextResponse.json(
      { status: 'error', error: result.error },
      { status: result.statusCode }
    );
  }

  if (result.status === 'APPROVED' && result.sessionToken) {
    const response = NextResponse.json(
      {
        status: 'success',
        registrationStatus: 'APPROVED',
        message: 'Authentication successful. State Evaluation unlocked.',
        registration: result.registration,
        data: {
          session: result.session,
          registration: result.registration,
        },
      },
      { status: 200 }
    );

    setSessionCookie(response, result.sessionToken, req);

    return response;
  }

  return NextResponse.json(
    {
      status: 'success',
      registrationStatus: 'PENDING_APPROVAL',
      message:
        'Email verified successfully. Your registration has been submitted for programme administrator review.',
      registration: result.registration,
      data: {
        registration: result.registration,
        session: null,
      },
    },
    { status: 200 }
  );
}
