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
    const identifier = body.accessIdentifier || body.state || body.username;
    const { password } = body;

    if (!identifier || !password || typeof identifier !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_CREDENTIALS', message: 'Access identifier and password are required.' },
        { status: 400 }
      );
    }

    // Cutover enforcement: When LEADERSHIP_EMAIL_AUTH_MODE is 'email_only',
    // shared password login for Leadership is strictly blocked.
    if (process.env.LEADERSHIP_EMAIL_AUTH_MODE === 'email_only') {
      const upper = identifier.toUpperCase();
      if (
        upper === 'LEADERSHIP' ||
        upper === 'LEADERSHIP-ALL' ||
        upper === 'LEADERSHIP_INDIA' ||
        upper.includes('LEADERSHIP')
      ) {
        logSecurityEvent({
          actor: identifier,
          actorRole: 'LEADERSHIP',
          eventType: 'AUTH_FAILURE',
          outcome: 'DENY',
          ip: clientIp,
          details: 'Shared password login for Leadership is disabled under email_only cutover mode.',
        });
        return NextResponse.json(
          {
            status: 'error',
            code: 'AUTH_METHOD_DISABLED',
            message: 'Shared password login for Leadership is disabled. Please use individual allowlisted email sign-in.',
          },
          { status: 403 }
        );
      }
    }

    const authResult = await authenticateUser(identifier, password, clientIp);

    if (!authResult.success) {
      logSecurityEvent({
        actor: identifier,
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

    // Post-authentication cutover check for role
    if (process.env.LEADERSHIP_EMAIL_AUTH_MODE === 'email_only' && authResult.user.role === 'LEADERSHIP') {
      logSecurityEvent({
        actor: authResult.user.username,
        actorRole: 'LEADERSHIP',
        eventType: 'AUTH_FAILURE',
        outcome: 'DENY',
        ip: clientIp,
        details: 'Shared password login for Leadership role is disabled under email_only cutover mode.',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'AUTH_METHOD_DISABLED',
          message: 'Shared password login for Leadership is disabled. Please use individual allowlisted email sign-in.',
        },
        { status: 403 }
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
