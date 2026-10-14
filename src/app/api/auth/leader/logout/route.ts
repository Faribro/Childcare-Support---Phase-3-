import { NextRequest, NextResponse } from 'next/server';
import {
  extractLeaderSessionId,
  revokeLeaderSession,
  clearLeaderSessionCookie,
} from '@/lib/server/leaderSessionStore';
import { logSecurityEvent } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sessionId = extractLeaderSessionId(req);
  if (sessionId) {
    revokeLeaderSession(sessionId);
    logSecurityEvent({
      actor: sessionId.substring(0, 8),
      actorRole: 'LEADERSHIP',
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      details: 'Leadership session explicitly terminated on logout',
    });
  }

  const response = NextResponse.json({
    status: 'success',
    message: 'Leadership session logged out successfully.',
  });

  clearLeaderSessionCookie(response);
  return response;
}
