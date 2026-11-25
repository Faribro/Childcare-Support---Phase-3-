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
    const safeSession = result.session
      ? {
          userId: result.session.userId,
          name: result.session.name,
          role: result.session.role,
          allowedStates: result.session.allowedStates,
          allowedDistricts: result.session.allowedDistricts,
          canEdit: result.session.canEdit,
        }
      : null;

    const response = NextResponse.json(
      {
        status: 'success',
        registrationStatus: 'APPROVED',
        sessionActive: true,
        message: 'Authentication successful. State Team workspace unlocked.',
        registration: result.registration,
        data: {
          session: safeSession,
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
      sessionActive: false,
      message:
        'Email verified successfully. Your access request has been submitted for Administration review. No portal session is active until approved.',
      registration: result.registration,
      data: {
        registration: result.registration,
        session: null,
      },
    },
    { status: 200 }
  );
}
