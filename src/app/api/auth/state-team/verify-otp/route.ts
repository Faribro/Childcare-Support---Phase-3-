import { NextRequest, NextResponse } from 'next/server';
import { verifyStateTeamOtp } from '@/lib/server/stateTeamAuthChallenge';
import { validateMutationOrigin } from '@/lib/server/authorisation';

const SESSION_COOKIE_NAME = 'evaluation_session_token';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

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

  const { workEmail, code } = body || {};

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
      },
      { status: 200 }
    );

    const isProduction = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: result.sessionToken,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  }

  return NextResponse.json(
    {
      status: 'success',
      registrationStatus: 'PENDING_APPROVAL',
      message:
        'Email verified successfully. Your registration has been submitted for programme administrator review.',
      registration: result.registration,
    },
    { status: 200 }
  );
}
