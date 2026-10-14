import { NextRequest, NextResponse } from 'next/server';
import {
  extractLeaderSessionId,
  revokeLeaderSession,
  clearLeaderSessionCookie,
  clearDeviceBindingCookie,
} from '@/lib/server/leaderSessionStore';
import { getLeaderAuthStore } from '@/lib/server/leaderAuthStore';
import { logSecurityEvent, validateMutationOrigin } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

export async function POST(req: NextRequest) {
  // CSRF / Origin validation for state-changing authentication mutation
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', code: 'CSRF_REJECTED', message: originCheck.reason || 'Forbidden request origin.' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const sessionId = extractLeaderSessionId(req);
  if (sessionId) {
    const store = getLeaderAuthStore();
    const session = await store.getSession(sessionId).catch(() => null);
    await revokeLeaderSession(sessionId);

    // Audit log uses leaderId or non-secret identifier (NEVER session ID fragments)
    logSecurityEvent({
      actor: session?.leaderId || 'leadership-user',
      actorRole: 'LEADERSHIP',
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      details: 'Leadership session explicitly terminated on logout',
    });
  }

  const response = NextResponse.json(
    {
      status: 'success',
      message: 'Leadership session logged out successfully.',
    },
    { headers: NO_STORE_HEADERS }
  );

  clearLeaderSessionCookie(response);
  clearDeviceBindingCookie(response);
  return response;
}
