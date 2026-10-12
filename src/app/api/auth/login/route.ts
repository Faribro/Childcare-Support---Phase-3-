import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, setSessionCookie } from '@/lib/server/sessionService';
import { logSecurityEvent, validateCsrfOrigin } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

  // Enforce CSRF Origin validation on login
  const csrf = validateCsrfOrigin(req);
  if (!csrf.isValid) {
    logSecurityEvent({
      actor: 'unknown',
      actorRole: 'UNKNOWN',
      eventType: 'AUTH_FAILURE',
      outcome: 'DENY',
      ip: clientIp,
      details: `CSRF Origin check failed: ${csrf.reason}`,
    });
    return NextResponse.json(
      { status: 'error', code: 'CSRF_VIOLATION', message: csrf.reason || 'Forbidden request origin.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_CREDENTIALS', message: 'Username and password are required.' },
        { status: 400 }
      );
    }

    const authResult = await authenticateUser(username, password, clientIp);

    if (!authResult.success) {
      logSecurityEvent({
        actor: username,
        actorRole: 'UNKNOWN',
        eventType: 'AUTH_FAILURE',
        outcome: 'DENY',
        ip: clientIp,
        details: authResult.error,
      });

      return NextResponse.json(
        { status: 'error', code: 'AUTH_FAILED', message: authResult.error },
        { status: authResult.statusCode }
      );
    }

    logSecurityEvent({
      actor: authResult.user.username,
      actorRole: authResult.user.role,
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      ip: clientIp,
      scope: authResult.user.allowedStates.join(','),
    });

    const response = NextResponse.json({
      status: 'success',
      data: {
        user: authResult.user,
        token: authResult.token,
      },
    });

    setSessionCookie(response, authResult.token);
    return response;
  } catch (err: any) {
    console.error('POST /api/auth/login error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error during authentication.' },
      { status: 500 }
    );
  }
}
