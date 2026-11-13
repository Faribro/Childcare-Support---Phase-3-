import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAuthUrl, attachOAuthStateCookie } from '@/lib/server/googleAuth';

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/assessment/new';
  const { authUrl, stateToken } = buildGoogleAuthUrl(req, returnTo);

  const response = NextResponse.redirect(authUrl);
  attachOAuthStateCookie(response, stateToken, req);

  return response;
}
