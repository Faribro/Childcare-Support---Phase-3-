import { NextRequest, NextResponse } from 'next/server';
import {
  verifyOAuthState,
  exchangeGoogleCodeForUser,
  signOnboardingTicket,
  extractOAuthStateCookie,
  clearOAuthStateCookie,
  attachOnboardingTicketCookie,
} from '@/lib/server/googleAuth';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { createSessionToken, setSessionCookie } from '@/lib/server/sessionService';
import { getPublicAppBaseUrl, resolveSafeRedirectUrl } from '@/lib/server/appUrl';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const errorParam = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const appBaseUrl = `${getPublicAppBaseUrl(req)}/app`;

  // 1. Safe handling for user cancellation
  if (errorParam === 'access_denied' || errorParam === 'consent_required') {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_cancelled=1`);
    clearOAuthStateCookie(res, req);
    return res;
  }

  if (errorParam) {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_error=${encodeURIComponent(errorParam)}`);
    clearOAuthStateCookie(res, req);
    return res;
  }

  // 2. Validate state against CSRF cookie
  const storedState = extractOAuthStateCookie(req);
  if (!state || !storedState || state !== storedState) {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_error=invalid_csrf_state`);
    clearOAuthStateCookie(res, req);
    return res;
  }

  const verifiedState = verifyOAuthState(state);
  if (!verifiedState) {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_error=expired_state`);
    clearOAuthStateCookie(res, req);
    return res;
  }

  if (!code) {
    const res = NextResponse.redirect(`${appBaseUrl}?auth_error=missing_code`);
    clearOAuthStateCookie(res, req);
    return res;
  }

  // 3. Exchange code for verified user profile
  const userResult = await exchangeGoogleCodeForUser(code, req);
  if (!userResult.success || !userResult.user) {
    const res = NextResponse.redirect(
      `${appBaseUrl}?auth_error=${encodeURIComponent(userResult.error || 'google_auth_failed')}`
    );
    clearOAuthStateCookie(res, req);
    return res;
  }

  const googleUser = userResult.user;
  const store = getOnboardingStore();

  // 4. Check for existing persistent field profile (with resilient error guard)
  let existingProfile = null;
  try {
    existingProfile = await store.getFieldUserProfileByGoogleSub(googleUser.sub);
  } catch (dbErr: any) {
    console.error('[Google Callback:DB_WARNING] Failed to query existing field profile from Supabase:', dbErr?.message);
  }

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
    const redirectUrl = resolveSafeRedirectUrl(destination, req).toString();
    const response = NextResponse.redirect(redirectUrl);

    clearOAuthStateCookie(response, req);
    setSessionCookie(response, sessionToken, req);

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
  clearOAuthStateCookie(response, req);
  attachOnboardingTicketCookie(response, ticket, req);

  return response;
}
