import { NextRequest, NextResponse } from 'next/server';
import { validateAndFormatIndianMobile, createMobileTicket } from '@/lib/server/phoneValidation';
import { getOtpProvider } from '@/lib/server/otpgatewayAdapter';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { createSessionToken, setSessionCookie } from '@/lib/server/sessionService';
import { logSecurityEvent } from '@/lib/server/authorisation';
import { checkUserAwareRateLimit, buildRateLimitHeaders } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limit verification attempts (max 10/min)
    const rl = checkUserAwareRateLimit({
      req,
      namespace: 'mobile_otp_verify',
      perUserLimit: 10,
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

    const { mobile, code, purpose = 'login' } = body || {};

    if (!mobile || typeof mobile !== 'string' || !code || typeof code !== 'string') {
      return NextResponse.json(
        {
          status: 'error',
          code: 'MISSING_FIELDS',
          error: 'Both mobile number and verification code are required.',
        },
        { status: 400 }
      );
    }

    // 2. Validate canonical mobile
    const phoneResult = validateAndFormatIndianMobile(mobile);
    if (!phoneResult.isValid || !phoneResult.canonical) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'INVALID_PHONE_FORMAT',
          error: phoneResult.reason || 'Please provide a valid Indian mobile number.',
        },
        { status: 400 }
      );
    }

    const canonicalMobile = phoneResult.canonical;

    // 3. Verify OTP code via otpgateway adapter
    const otpProvider = getOtpProvider();
    const verifyResult = await otpProvider.verifyOtp(canonicalMobile, code, purpose);

    if (!verifyResult.success) {
      logSecurityEvent({
        actor: canonicalMobile,
        actorRole: 'FIELD_USER',
        eventType: 'AUTH_FAILURE',
        outcome: 'DENY',
        details: `OTP verification failed for ${phoneResult.masked}: ${verifyResult.error}`,
      });

      return NextResponse.json(
        {
          status: 'error',
          code: verifyResult.error || 'INVALID_OTP',
          error: verifyResult.message,
          remainingAttempts: verifyResult.remainingAttempts,
        },
        { status: 400 }
      );
    }

    // 4. Handle Registration Purpose: issue signed mobile verification ticket
    if (purpose === 'registration') {
      const mobileTicket = createMobileTicket(canonicalMobile);

      logSecurityEvent({
        actor: canonicalMobile,
        actorRole: 'FIELD_USER',
        eventType: 'AUTH_SUCCESS',
        outcome: 'ALLOW',
        details: `Mobile OTP verified for registration: ${phoneResult.masked}`,
      });

      return NextResponse.json(
        {
          status: 'success',
          isVerified: true,
          mobileTicket,
          canonicalMobile,
          message: 'Mobile number verified successfully.',
        },
        { status: 200 }
      );
    }

    // 5. Handle Returning Login / Recovery Purpose: resolve stable profile
    const store = getOnboardingStore();
    const profile = await store.getFieldUserProfileByMobile(canonicalMobile);

    if (!profile) {
      logSecurityEvent({
        actor: canonicalMobile,
        actorRole: 'FIELD_USER',
        eventType: 'AUTH_FAILURE',
        outcome: 'DENY',
        details: `Mobile verified but no active profile found for ${phoneResult.masked}`,
      });

      return NextResponse.json(
        {
          status: 'error',
          code: 'PROFILE_NOT_FOUND',
          error: 'No active field worker profile found for this mobile number. Please register with your invitation code.',
        },
        { status: 404 }
      );
    }

    // Issue session token bound to the existing stable worker ID
    const fullName = `${profile.firstName} ${profile.lastName}`.trim();
    const sessionToken = createSessionToken({
      userId: profile.id, // Immutable profile ID
      username: profile.googleEmail || canonicalMobile,
      name: fullName,
      role: 'FIELD_USER',
      allowedStates: [profile.assignedState],
      allowedDistricts: [profile.assignedDistrict],
      srName: profile.srName,
      ssrName: profile.ssrName,
    });

    logSecurityEvent({
      actor: profile.id,
      actorRole: 'FIELD_USER',
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      scope: `${profile.assignedState}/${profile.assignedDistrict}`,
      details: `Returning field worker ${profile.id} (${fullName}) authenticated via mobile OTP (${phoneResult.masked})`,
    });

    const response = NextResponse.json(
      {
        status: 'success',
        message: `Welcome back, ${profile.firstName}!`,
        redirectUrl: '/app',
        sessionToken,
        profile: {
          id: profile.id,
          name: fullName,
          firstName: profile.firstName,
          lastName: profile.lastName,
          assignedState: profile.assignedState,
          assignedDistrict: profile.assignedDistrict,
          srName: profile.srName,
          ssrName: profile.ssrName,
          mobileNumber: canonicalMobile,
        },
        data: {
          profile,
          session: {
            role: 'FIELD_USER',
            token: sessionToken,
            userId: profile.id,
          },
        },
      },
      { status: 200 }
    );

    setSessionCookie(response, sessionToken, req);
    return response;
  } catch (err: any) {
    console.error('[API:mobile/otp/verify] Uncaught error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', error: 'Internal server error verifying OTP.' },
      { status: 500 }
    );
  }
}
