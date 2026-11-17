import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAuthUrl, attachOAuthStateCookie, isGoogleOAuthConfigured } from '@/lib/server/googleAuth';

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/assessment/new';

  if (!isGoogleOAuthConfigured()) {
    const redirectUrl = new URL(returnTo, req.url);
    redirectUrl.searchParams.set('onboarding', 'direct');
    redirectUrl.searchParams.set('notice', 'google_auth_not_configured');
    return NextResponse.redirect(redirectUrl);
  }

  const { authUrl, stateToken } = buildGoogleAuthUrl(req, returnTo);

  const response = NextResponse.redirect(authUrl);
  attachOAuthStateCookie(response, stateToken, req);

  return response;
}
