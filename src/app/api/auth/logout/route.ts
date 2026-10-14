import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/sessionService';
import {
  extractLeaderSessionId,
  revokeLeaderSession,
  clearLeaderSessionCookie,
  clearDeviceBindingCookie,
} from '@/lib/server/leaderSessionStore';
import { validateCsrfOrigin } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Enforce CSRF Origin validation on logout
  const csrf = validateCsrfOrigin(req);
  if (!csrf.isValid) {
    return NextResponse.json(
      { status: 'error', code: 'CSRF_VIOLATION', message: csrf.reason || 'Forbidden request origin.' },
      { status: 403 }
    );
  }

  // Also revoke any active individual leadership session
  const leaderSessionId = extractLeaderSessionId(req);
  if (leaderSessionId) {
    await revokeLeaderSession(leaderSessionId);
  }

  const response = NextResponse.json({
    status: 'success',
    message: 'Signed out successfully.',
  });

  clearSessionCookie(response);
  clearLeaderSessionCookie(response);
  clearDeviceBindingCookie(response);
  return response;
}
