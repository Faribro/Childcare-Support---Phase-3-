import { NextRequest, NextResponse } from 'next/server';
import {
  isLeadershipEmailAuthEnabled,
  requestLeadershipAuthCode,
  generateDeviceBindingSecret,
} from '@/lib/server/leaderAuthChallenge';
import {
  extractDeviceBindingSecret,
  attachDeviceBindingCookie,
} from '@/lib/server/leaderSessionStore';
import { logSecurityEvent } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isLeadershipEmailAuthEnabled()) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'FEATURE_DISABLED',
        message: 'Individual Leadership email authentication is not enabled on this environment.',
      },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON payload.' },
      { status: 400 }
    );
  }

  const { email, leaderId } = body || {};
  if ((!email || typeof email !== 'string') && (!leaderId || typeof leaderId !== 'string')) {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_INPUT', message: 'Email address or leader identifier is required.' },
      { status: 400 }
    );
  }

  const userAgent = req.headers.get('user-agent') || 'unknown';
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  // Extract or establish device binding secret
  let deviceBindingSecret = extractDeviceBindingSecret(req);
  let shouldSetDeviceCookie = false;
  if (!deviceBindingSecret) {
    deviceBindingSecret = generateDeviceBindingSecret();
    shouldSetDeviceCookie = true;
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

    return NextResponse.json(
      { status: 'error', code: result.statusCode === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED', message: result.error },
      { status: result.statusCode }
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

  const response = NextResponse.json({
    status: 'success',
    message: 'If this email is an authorized Leadership account, a verification code has been dispatched.',
  });

  // Attach device binding cookie so verify-code can validate device consistency
  attachDeviceBindingCookie(response, deviceBindingSecret);

  return response;
}
