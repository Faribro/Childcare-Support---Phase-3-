import { NextRequest, NextResponse } from 'next/server';
import {
  requestLeadershipAuthCode,
  generateDeviceBindingSecret,
} from '@/lib/server/leaderAuthChallenge';
import {
  getLeadershipAuthMode,
  isLeadershipEmailAuthFlagEnabled,
} from '@/lib/server/leadershipAuthPolicy';
import {
  extractDeviceBindingSecret,
  attachDeviceBindingCookie,
} from '@/lib/server/leaderSessionStore';
import { logSecurityEvent, validateMutationOrigin } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

export async function POST(req: NextRequest) {
  const authMode = getLeadershipAuthMode();
  if (authMode === 'password_only') {
    return NextResponse.json(
      {
        status: 'error',
        code: 'AUTH_METHOD_DISABLED',
        message: 'Individual Leadership email authentication is disabled under password_only authentication policy.',
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  if (!isLeadershipEmailAuthFlagEnabled()) {
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

  const { email, leaderId } = body || {};
  if ((!email || typeof email !== 'string') && (!leaderId || typeof leaderId !== 'string')) {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_INPUT', message: 'Email address or leader identifier is required.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const userAgent = req.headers.get('user-agent') || 'unknown';
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  // Extract or establish device binding secret
  let deviceBindingSecret = extractDeviceBindingSecret(req);
  if (!deviceBindingSecret) {
    deviceBindingSecret = generateDeviceBindingSecret();
  }

  const result = await requestLeadershipAuthCode({
    email,
    leaderId,
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
      details: result.error || 'Request code rejected',
      ip: clientIp,
      userAgent,
    });

    const errorCode =
      result.statusCode === 429
        ? 'RATE_LIMITED'
        : result.statusCode === 503
          ? 'SERVICE_UNAVAILABLE'
          : 'REQUEST_FAILED';

    const headers: Record<string, string> = { ...NO_STORE_HEADERS };
    if (result.statusCode === 429 && typeof result.retryAfterSeconds === 'number') {
      headers['Retry-After'] = String(result.retryAfterSeconds);
    }

    return NextResponse.json(
      {
        status: 'error',
        code: errorCode,
        message: result.error,
        ...(typeof result.retryAfterSeconds === 'number'
          ? { retryAfterSeconds: result.retryAfterSeconds }
          : {}),
      },
      { status: result.statusCode, headers }
    );
  }

  logSecurityEvent({
    actor: actorMask,
    actorRole: 'LEADERSHIP_APPLICANT',
    eventType: 'AUTH_SUCCESS',
    outcome: 'ALLOW',
    details: 'Leadership OTP challenge dispatched',
    ip: clientIp,
    userAgent,
  });

  const response = NextResponse.json(
    {
      status: 'success',
      message: 'If this email is an authorized Leadership account, a verification code has been dispatched.',
    },
    { headers: NO_STORE_HEADERS }
  );

  // Attach device binding cookie so verify-code can validate device consistency
  attachDeviceBindingCookie(response, deviceBindingSecret);

  return response;
}
