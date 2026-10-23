import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAuthUrl, GOOGLE_AUTH_COOKIE_STATE } from '@/lib/server/googleAuth';

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/assessment/new';
  const { authUrl, stateToken } = buildGoogleAuthUrl(req, returnTo);

  const response = NextResponse.redirect(authUrl);
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set({
    name: GOOGLE_AUTH_COOKIE_STATE,
    value: stateToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60, // 15 minutes
  });

  return response;
}
