import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent, validateMutationOrigin } from '@/lib/server/authorisation';
import {
  verifyStaffAccessGateCode,
  setAdminGateCookie,
} from '@/lib/server/staffAccessGateService';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

function resolveClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Staff Access Gate Endpoint:
 * - Accepts a 3-digit State Gate PIN (001-038) -> returns state-scoped UI routing hint (mode: 'state_team').
 * - Accepts the server-only confidential Administration access code -> sets HMAC-signed HttpOnly
 *   csc_admin_gate cookie and returns redirect target + { id, name, email } admin contacts (no title).
 */
export async function POST(req: NextRequest) {
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', code: 'FORBIDDEN_ORIGIN', error: originCheck.reason || 'Cross-site request rejected' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: 'error', code: 'MALFORMED_JSON', error: 'Invalid JSON request body.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const clientIp = resolveClientIp(req);
  const result = await verifyStaffAccessGateCode({
    rawCode: body?.code,
    clientIp,
  });

  if (!result.ok) {
    logSecurityEvent({
      actor: 'staff_access_gate',
      actorRole: 'UNKNOWN',
      eventType: 'AUTH_FAILURE',
      outcome: 'DENY',
      ip: clientIp,
      details: `Staff Access gate rejected code (${result.code})`,
    });
    return NextResponse.json(
      {
        status: 'error',
        code: result.code,
        error: result.error,
        ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      },
      {
        status: result.statusCode,
        headers: {
          ...NO_STORE_HEADERS,
          ...(result.retryAfterSeconds ? { 'Retry-After': String(result.retryAfterSeconds) } : {}),
        },
      }
    );
  }

  if (result.mode === 'state_team') {
    return NextResponse.json(
      {
        status: 'success',
        mode: 'state_team',
        data: {
          state: result.state,
          lgdNumericCode: result.lgdNumericCode,
          isoCode: result.isoCode,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  logSecurityEvent({
    actor: 'staff_access_gate',
    actorRole: 'GATE_USER',
    eventType: 'AUTH_SUCCESS',
    scope: 'administration_gate',
    outcome: 'ALLOW',
    ip: clientIp,
    details: 'Administration Staff Access gate unlocked via confidential server code',
  });

  const res = NextResponse.json(
    {
      status: 'success',
      mode: 'administration',
      data: {
        redirectUrl: result.redirectUrl,
        leaders: result.leaders,
      },
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
  setAdminGateCookie(res, result.gateToken, req);
  return res;
}
