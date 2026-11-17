import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAuthUrl, attachOAuthStateCookie, isGoogleOAuthConfigured } from '@/lib/server/googleAuth';

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/assessment/new';

  if (!isGoogleOAuthConfigured()) {
    const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'https://cs-p3-production.web.app');
    const redirectUrl = new URL(returnTo, baseUrl);
    redirectUrl.searchParams.set('onboarding', 'direct');
    redirectUrl.searchParams.set('notice', 'google_auth_not_configured');
    return NextResponse.redirect(redirectUrl);
  }

  const { authUrl, stateToken } = buildGoogleAuthUrl(req, returnTo);

  const response = NextResponse.redirect(authUrl);
  attachOAuthStateCookie(response, stateToken, req);

  return response;
}
