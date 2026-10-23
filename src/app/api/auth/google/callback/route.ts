import { NextRequest, NextResponse } from 'next/server';
import {
  verifyOAuthState,
  exchangeGoogleCodeForUser,
  signOnboardingTicket,
  GOOGLE_AUTH_COOKIE_STATE,
  ONBOARDING_TICKET_COOKIE,
  ONBOARDING_TICKET_TTL_MS,
} from '@/lib/server/googleAuth';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { createSessionToken } from '@/lib/server/sessionService';

const SESSION_COOKIE_NAME = 'evaluation_session_token';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const errorParam = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const appBaseUrl = `${url.protocol}//${url.host}/app`;

  // 1. Safe handling for user cancellation
  if (errorParam === 'access_denied' || errorParam === 'consent_required') {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_cancelled=1`);
    res.cookies.delete(GOOGLE_AUTH_COOKIE_STATE);
    return res;
  }

  if (errorParam) {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_error=${encodeURIComponent(errorParam)}`);
    res.cookies.delete(GOOGLE_AUTH_COOKIE_STATE);
    return res;
  }

  // 2. Validate state against CSRF cookie
  const storedState = req.cookies.get(GOOGLE_AUTH_COOKIE_STATE)?.value;
  if (!state || !storedState || state !== storedState) {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_error=invalid_csrf_state`);
    res.cookies.delete(GOOGLE_AUTH_COOKIE_STATE);
    return res;
  }

  const verifiedState = verifyOAuthState(state);
  if (!verifiedState) {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_error=expired_state`);
    res.cookies.delete(GOOGLE_AUTH_COOKIE_STATE);
    return res;
  }

  if (!code) {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_error=missing_code`);
    res.cookies.delete(GOOGLE_AUTH_COOKIE_STATE);
    return res;
  }

  // 3. Exchange code for verified user profile
  const userResult = await exchangeGoogleCodeForUser(code, req);
  if (!userResult.success || !userResult.user) {
    const res = NextResponse.redirect(
      `${appBaseUrl}?auth_error=${encodeURIComponent(userResult.error || 'google_auth_failed')}`
    );
    res.cookies.delete(GOOGLE_AUTH_COOKIE_STATE);
    return res;
  }

  const googleUser = userResult.user;
  const store = getOnboardingStore();

  // 4. Check for existing persistent field profile
  const existingProfile = await store.getFieldUserProfileByGoogleSub(googleUser.sub);
  const isProduction = process.env.NODE_ENV === 'production';

  if (existingProfile && existingProfile.status === 'ACTIVE') {
    // RETURNING FIELD USER: established session immediately without re-entering invitation
    const sessionToken = createSessionToken({
      userId: existingProfile.id,
      username: existingProfile.googleEmail,
      name: `${existingProfile.firstName} ${existingProfile.lastName}`.trim(),
      role: 'FIELD_USER',
      allowedStates: [existingProfile.assignedState],
      allowedDistricts: [existingProfile.assignedDistrict],
    });

    const destination = verifiedState.returnTo || '/assessment/new';
    const redirectUrl = `${url.protocol}//${url.host}${destination}`;
    const response = NextResponse.redirect(redirectUrl);

    response.cookies.delete(GOOGLE_AUTH_COOKIE_STATE);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  }

  // FIRST-TIME FIELD USER: issue signed onboarding ticket and continue to Welcome Kite
  const ticket = signOnboardingTicket({
    googleSub: googleUser.sub,
    googleEmail: googleUser.email,
    firstName: googleUser.given_name || '',
    lastName: googleUser.family_name || '',
  });

  const response = NextResponse.redirect(`${appBaseUrl}?onboarding=open`);
  response.cookies.delete(GOOGLE_AUTH_COOKIE_STATE);

  response.cookies.set({
    name: ONBOARDING_TICKET_COOKIE,
    value: ticket,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ONBOARDING_TICKET_TTL_MS / 1000),
  });

  return response;
}
