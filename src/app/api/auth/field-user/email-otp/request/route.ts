import { NextRequest, NextResponse } from 'next/server';
import { requestFieldEmailOtp } from '@/lib/server/fieldEmailOtpChallenge';
import { checkUserAwareRateLimit, buildRateLimitHeaders } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  try {
    // IP rate limit: 15 per minute
    const rl = checkUserAwareRateLimit({
      req,
      namespace: 'field_email_otp_request',
      perUserLimit: 15,
      sharedIpLimit: 60,
      windowMs: 60 * 1000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          error: 'Too many verification code requests. Please wait a moment before trying again.',
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

    const { email, purpose = 'login' } = body || {};

    const result = await requestFieldEmailOtp({ email, purpose });

    const responsePayload: Record<string, any> = {
      status: result.success ? 'success' : 'error',
      message: result.message,
    };

    if (!result.success) {
      responsePayload.error = result.error;
      if (result.statusCode === 409) {
        responsePayload.code = 'EMAIL_ALREADY_REGISTERED';
      }
      if (result.retryAfterSeconds) {
        responsePayload.retryAfter = result.retryAfterSeconds;
      }
      return NextResponse.json(responsePayload, { status: result.statusCode });
    }

    if (process.env.NODE_ENV === 'test' && result.debugCode) {
      responsePayload.debugCode = result.debugCode;
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: any) {
    console.error('[API:field-user/email-otp/request] Uncaught error:', err?.message);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', error: 'Internal server error processing verification request.' },
      { status: 500 }
    );
  }
}
