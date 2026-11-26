import { NextRequest, NextResponse } from 'next/server';
import {
  STAFF_ACCESS_GATE_COOKIE,
  verifyLeaderGateCookieToken,
  resolveActiveLeaderContacts,
} from '@/lib/server/staffAccessGateService';
import {
  LEADER_COOKIE_NAME,
  validateLeaderSession,
} from '@/lib/server/leaderSessionStore';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

/**
 * Returns allowlisted Administration contacts (`{ id, name, email }` — strictly no job title)
 * only when the caller presents a valid server-signed csc_admin_gate cookie or an active
 * server-verified Leadership session cookie.
 */
export async function GET(req: NextRequest) {
  const gateToken = req.cookies.get(STAFF_ACCESS_GATE_COOKIE)?.value;
  let authorized = verifyLeaderGateCookieToken(gateToken);

  if (!authorized && req.cookies.get(LEADER_COOKIE_NAME)?.value) {
    const leaderSession = await validateLeaderSession(
      req.cookies.get(LEADER_COOKIE_NAME)?.value ?? null
    ).catch(() => null);
    if (leaderSession?.role === 'LEADERSHIP') {
      authorized = true;
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
