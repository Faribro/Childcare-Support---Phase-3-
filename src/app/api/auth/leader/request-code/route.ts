import { NextRequest, NextResponse } from 'next/server';
import {
  isLeadershipEmailAuthEnabled,
  requestLeadershipAuthCode,
} from '@/lib/server/leaderAuthChallenge';
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

  const { email } = body || {};
  if (!email || typeof email !== 'string') {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_INPUT', message: 'Email address is required.' },
      { status: 400 }
    );
  }

  const userAgent = req.headers.get('user-agent') || 'unknown';
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  const result = await requestLeadershipAuthCode({
    email,
    userAgent,
    clientIp,
  });

  if (!result.success) {
    logSecurityEvent({
      actor: email.substring(0, 3) + '***',
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
    actor: email.substring(0, 3) + '***',
    actorRole: 'LEADERSHIP_APPLICANT',
    eventType: 'AUTH_SUCCESS',
    outcome: 'ALLOW',
    details: 'Leadership OTP challenge dispatched',
    ip: clientIp,
    userAgent,
  });

  return NextResponse.json({
    status: 'success',
    message: 'If this email is an authorized Leadership account, a verification code has been dispatched.',
  });
}
