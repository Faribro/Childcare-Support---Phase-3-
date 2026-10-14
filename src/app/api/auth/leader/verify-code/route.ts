import { NextRequest, NextResponse } from 'next/server';
import {
  isLeadershipEmailAuthEnabled,
  verifyLeadershipAuthCode,
} from '@/lib/server/leaderAuthChallenge';
import {
  createLeaderSession,
  attachLeaderSessionCookie,
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

  const { email, code } = body || {};
  if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_INPUT', message: 'Email and verification code are required.' },
      { status: 400 }
    );
  }

  const userAgent = req.headers.get('user-agent') || 'unknown';
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  const result = verifyLeadershipAuthCode({
    email,
    code,
    userAgent,
    clientIp,
  });

  if (!result.success) {
    logSecurityEvent({
      actor: email.substring(0, 3) + '***',
      actorRole: 'LEADERSHIP_APPLICANT',
      eventType: 'AUTH_FAILURE',
      outcome: 'DENY',
      details: result.error,
      ip: clientIp,
      userAgent,
    });

    return NextResponse.json(
      { status: 'error', code: result.statusCode === 429 ? 'LOCKED_OUT' : 'INVALID_CODE', message: result.error },
      { status: result.statusCode }
    );
  }

  // Create session
  const session = createLeaderSession(result.leader);

  logSecurityEvent({
    actor: result.leader.id,
    actorRole: 'LEADERSHIP',
    eventType: 'AUTH_SUCCESS',
    outcome: 'ALLOW',
    details: `Leadership email sign-in verified for ${result.leader.name} (${result.leader.email})`,
    ip: clientIp,
    userAgent,
  });

  const response = NextResponse.json({
    status: 'success',
    data: {
      user: {
        id: session.leaderId,
        email: session.email,
        name: session.name,
        title: session.title,
        role: session.role,
        allowedStates: session.allowedStates,
        allowedDistricts: session.allowedDistricts,
      },
    },
  });

  attachLeaderSessionCookie(response, session.sessionId);
  return response;
}
