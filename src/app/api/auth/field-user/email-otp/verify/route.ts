import { NextRequest, NextResponse } from 'next/server';
import { verifyFieldEmailOtp } from '@/lib/server/fieldEmailOtpChallenge';
import { setSessionCookie } from '@/lib/server/sessionService';
import { checkUserAwareRateLimit, buildRateLimitHeaders } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  try {
    const rl = checkUserAwareRateLimit({
      req,
      namespace: 'field_email_otp_verify',
      perUserLimit: 15,
      sharedIpLimit: 60,
      windowMs: 60 * 1000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          error: 'Too many verification attempts. Please wait a moment before trying again.',
        },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', error: 'Malformed request JSON.' },
        { status: 400 }
      );
    }

    const { email, code, purpose = 'login' } = body || {};

    const result = await verifyFieldEmailOtp({ email, code, purpose });

    if (!result.success) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VERIFICATION_FAILED',
          error: result.error,
          remainingAttempts: result.remainingAttempts,
        },
        { status: result.statusCode || 401 }
      );
    }

    if (purpose === 'registration') {
      return NextResponse.json(
        {
          status: 'success',
          message: result.message,
          emailTicket: result.emailTicket,
        },
        { status: 200 }
      );
    }

    // Login successful: Issue session cookie and return profile
    const response = NextResponse.json(
      {
        status: 'success',
        message: result.message,
        sessionToken: result.sessionToken,
        profile: result.profile,
        data: {
          profile: result.profile,
          session: {
            role: 'FIELD_USER',
            token: result.sessionToken,
            userId: result.profile?.id,
          },
        },
      },
      { status: 200 }
    );

    if (result.sessionToken) {
      setSessionCookie(response, result.sessionToken, req);
    }

    return response;
  } catch (err: any) {
    console.error('[API:field-user/email-otp/verify] Uncaught error:', err?.message);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', error: 'Internal server error verifying code.' },
      { status: 500 }
    );
  }
}
