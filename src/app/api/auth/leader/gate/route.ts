import { NextRequest, NextResponse } from 'next/server';
import {
  verifyLeaderGateRequest,
  resolveActiveLeaderContacts,
} from '@/lib/server/staffAccessGateService';
import {
  extractLeaderSessionId,
  validateLeaderSession,
} from '@/lib/server/leaderSessionStore';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

/**
 * Returns allowlisted Administration contacts (`{ id, name, email }` — strictly no job title)
 * only when the caller presents a valid server-signed csc_admin_gate cookie, an `X-Admin-Gate`
 * header carrying that signed token, or an active server-verified Leadership session (`__session`
 * or direct session cookie).
 */
export async function GET(req: NextRequest) {
  let authorized = verifyLeaderGateRequest(req);

  if (!authorized) {
    const leaderSessionId = extractLeaderSessionId(req);
    if (leaderSessionId) {
      const leaderSession = await validateLeaderSession(leaderSessionId, {
        isPoll: true,
        req,
      }).catch(() => null);
      if (leaderSession?.role === 'LEADERSHIP') {
        authorized = true;
      }
    }
  }

  if (!authorized) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'AUTH_REQUIRED',
        error: 'Valid Administration Staff Access gate or session required.',
      },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const leaders = await resolveActiveLeaderContacts();
  return NextResponse.json(
    {
      status: 'success',
      data: {
        leaders,
      },
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
