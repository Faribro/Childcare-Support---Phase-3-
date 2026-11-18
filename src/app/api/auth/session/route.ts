import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessScope, shouldClearLeaderSessionCookie } from '@/lib/server/authorisation';
import { clearLeaderSessionCookie } from '@/lib/server/leaderSessionStore';
import { clearSessionCookie } from '@/lib/server/sessionService';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

export async function GET(req: NextRequest) {
  const scope = await resolveUserAccessScope(req);

  const response = NextResponse.json(
    {
      status: 'success',
      data: {
        userId: scope.userId,
        name: scope.name,
        role: scope.role,
        allowedStates: scope.allowedStates,
        allowedDistricts: scope.allowedDistricts,
        isVerified: scope.isVerified,
        srName: scope.srName,
        ssrName: scope.ssrName,
      },
    },
    {
      headers: NO_STORE_HEADERS,
    }
  );

  // Clear stale leader session cookie only when the rejection is definitive (not transient).
  // This breaks the 401 loop where a browser with a stale pre-cutover cookie never gets cleared.
  if (shouldClearLeaderSessionCookie(scope, req)) {
    clearLeaderSessionCookie(response, req);
  }

  return response;
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.json(
    {
      status: 'success',
      message: 'Session cleared successfully.',
    },
    { headers: NO_STORE_HEADERS }
  );

  clearSessionCookie(response, req);
  return response;
}

