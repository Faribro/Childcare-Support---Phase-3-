import { NextRequest, NextResponse } from 'next/server';
import {
  isLeadershipEmailAuthEnabled,
  verifyLeadershipAuthCode,
} from '@/lib/server/leaderAuthChallenge';
import {
  attachLeaderSessionCookie,
  extractDeviceBindingSecret,
} from '@/lib/server/leaderSessionStore';
import { logSecurityEvent, validateMutationOrigin } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

export async function POST(req: NextRequest) {
  if (!isLeadershipEmailAuthEnabled()) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'FEATURE_DISABLED',
        message: 'Individual Leadership email authentication is not enabled on this environment.',
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  // CSRF / Origin validation for state-changing authentication mutation
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', code: 'CSRF_REJECTED', message: originCheck.reason || 'Forbidden request origin.' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON payload.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { email, leaderId, code } = body || {};
  if ((!email && !leaderId) || !code || typeof code !== 'string') {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_INPUT', message: 'Valid identifier and verification code are required.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const userAgent = req.headers.get('user-agent') || 'unknown';
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  const deviceBindingSecret = extractDeviceBindingSecret(req) || undefined;

  const result = await verifyLeadershipAuthCode({
    email,
    leaderId,
    code,
    deviceBindingSecret,
    userAgent,
    clientIp,
  });

  const actorMask = email
    ? email.substring(0, 3) + '***'
    : (leaderId ? String(leaderId) : 'unknown');

  if (!result.success) {
    logSecurityEvent({
      actor: actorMask,
      actorRole: 'LEADERSHIP_APPLICANT',
      eventType: 'AUTH_FAILURE',
      outcome: 'DENY',
      details: result.error,
      ip: clientIp,
      userAgent,
    });

    const errorCode =
      result.statusCode === 429
        ? 'LOCKED_OUT'
        : result.statusCode === 503
          ? 'SERVICE_UNAVAILABLE'
          : 'INVALID_CODE';

    return NextResponse.json(
      { status: 'error', code: errorCode, message: result.error },
      { status: result.statusCode, headers: NO_STORE_HEADERS }
    );
  }

  logSecurityEvent({
    actor: result.leader.id,
    actorRole: 'LEADERSHIP',
    eventType: 'AUTH_SUCCESS',
    outcome: 'ALLOW',
    details: `Leadership email sign-in verified for ${result.leader.name}`,
    ip: clientIp,
    userAgent,
  });

  const response = NextResponse.json(
    {
      status: 'success',
      data: {
        user: {
          id: result.session.leaderId,
          email: result.session.email,
          name: result.session.name,
          title: result.session.title,
          role: result.session.role,
          allowedStates: result.session.allowedStates,
          allowedDistricts: result.session.allowedDistricts,
        },
      },
    },
    { headers: NO_STORE_HEADERS }
  );

  attachLeaderSessionCookie(response, result.session.sessionId);
  return response;
}
