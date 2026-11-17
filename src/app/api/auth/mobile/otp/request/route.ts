import { NextRequest, NextResponse } from 'next/server';
import { validateAndFormatIndianMobile } from '@/lib/server/phoneValidation';
import { getOtpProvider } from '@/lib/server/otpgatewayAdapter';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { checkUserAwareRateLimit, buildRateLimitHeaders } from '@/lib/server/rateLimit';
import { logSecurityEvent } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  try {
    // 1. IP & user rate limiting
    const rl = checkUserAwareRateLimit({
      req,
      namespace: 'mobile_otp_request',
      perUserLimit: 10,
      sharedIpLimit: 60,
      windowMs: 60 * 1000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          error: 'Too many OTP requests. Please wait a moment before trying again.',
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

    const { mobile, purpose = 'login' } = body || {};
    if (!mobile || typeof mobile !== 'string') {
      return NextResponse.json(
        {
          status: 'error',
          code: 'INVALID_MOBILE',
          error: 'Mobile number is required.',
        },
        { status: 400 }
      );
    }

    // 2. Canonical phone validation using libphonenumber-js
    const phoneResult = validateAndFormatIndianMobile(mobile);
    if (!phoneResult.isValid || !phoneResult.canonical) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'INVALID_PHONE_FORMAT',
          error: phoneResult.reason || 'Please enter a valid 10-digit Indian cellular mobile number.',
        },
        { status: 400 }
      );
    }

    const canonicalMobile = phoneResult.canonical;

    // 3. For login and recovery: verify profile exists in onboarding store
    if (purpose === 'login' || purpose === 'recovery') {
      const store = getOnboardingStore();
      const existingProfile = await store.getFieldUserProfileByMobile(canonicalMobile);
      if (!existingProfile) {
        logSecurityEvent({
          actor: canonicalMobile,
          actorRole: 'FIELD_USER',
          eventType: 'AUTH_FAILURE',
          outcome: 'DENY',
          details: `Returning login attempted for unverified or non-existent mobile ${phoneResult.masked}`,
        });
        return NextResponse.json(
          {
            status: 'error',
            code: 'PROFILE_NOT_FOUND',
            error: 'No active field worker profile found for this mobile number. Please register with your state team invitation code.',
          },
          { status: 404 }
        );
      }
    }

    // 4. Dispatch OTP via server-side otpgateway adapter
    const otpProvider = getOtpProvider();
    const sendResult = await otpProvider.sendOtp(canonicalMobile, purpose);

    if (!sendResult.success) {
      const status = sendResult.error === 'COOLDOWN_ACTIVE' || sendResult.error === 'RATE_LIMIT_EXCEEDED' ? 429 : 502;
      return NextResponse.json(
        {
          status: 'error',
          code: sendResult.error || 'OTP_DISPATCH_FAILED',
          error: sendResult.message,
          retryAfter: sendResult.retryAfterSeconds,
        },
        { status }
      );
    }

    logSecurityEvent({
      actor: canonicalMobile,
      actorRole: 'FIELD_USER',
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      details: `Dispatched mobile OTP for purpose=${purpose} to ${phoneResult.masked}`,
    });

    const responsePayload: Record<string, any> = {
      status: 'success',
      message: `OTP sent successfully to ${phoneResult.masked}`,
      maskedMobile: phoneResult.masked,
      cooldownSeconds: 60,
    };

    // Expose debug code exclusively in local test environments (strictly forbidden in production/staging)
    if (process.env.NODE_ENV === 'test' && sendResult.debugCode) {
      responsePayload.debugCode = sendResult.debugCode;
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: any) {
    console.error('[API:mobile/otp/request] Uncaught error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', error: 'Internal server error processing OTP request.' },
      { status: 500 }
    );
  }
}
