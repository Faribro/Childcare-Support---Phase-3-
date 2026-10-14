import { NextRequest, NextResponse } from 'next/server';
import {
  extractLeaderSessionId,
  validateLeaderSession,
  clearLeaderSessionCookie,
} from '@/lib/server/leaderSessionStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionId = extractLeaderSessionId(req);
  if (!sessionId) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'No active leadership session found.',
      },
      { status: 401 }
    );
  }

  // Check background polling header / query param
  const isPoll =
    req.headers.get('x-poll') === 'true' ||
    req.headers.get('x-poll') === '1' ||
    req.nextUrl.searchParams.get('poll') === 'true';

  const session = validateLeaderSession(sessionId, { isPoll });

  if (!session) {
    const response = NextResponse.json(
      {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Leadership session expired, revoked, or invalidated.',
      },
      { status: 401 }
    );
    clearLeaderSessionCookie(response);
    return response;
  }

  return NextResponse.json({
    status: 'success',
    data: {
      user: {
        id: session.leaderId,
        email: session.email,
        name: session.name,
        title: session.title,
        role: session.role,
        allowedStates: session.allowedStates,
        allowedDistricts: session.allowedDistricts,
        authVersion: session.authVersion,
      },
    },
  });
}
