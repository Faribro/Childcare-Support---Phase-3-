import { NextRequest } from 'next/server';
import { verifySessionToken } from './sessionService';
import { AuthPolicyRole } from './authorisation';

export interface VoiceStaffAuthResult {
  authorized: boolean;
  user?: {
    userId: string;
    name: string;
    role: AuthPolicyRole;
  };
  reason: string;
  statusCode: number; // 200, 401, or 403
}

export const AUTHORIZED_VOICE_STAFF_ROLES: readonly AuthPolicyRole[] = [
  'ADMIN',
  'LEADERSHIP',
  'STATE_REVIEWER',
];

export function isLoopbackHost(hostOrIp?: string | null): boolean {
  if (!hostOrIp) return false;
  let val = hostOrIp.trim().toLowerCase();

  // Bracketed IPv6 e.g. [::1]:3000 or [::1]
  const bracketMatch = val.match(/^\[([a-f0-9:]+)\](?::\d+)?$/);
  if (bracketMatch) {
    val = bracketMatch[1];
  } else if (!val.includes('::') && (val.match(/:/g) || []).length <= 1) {
    // IPv4 or hostname with optional port, e.g. localhost:3000 or 127.0.0.1:8080
    val = val.split(':')[0];
  }

  return val === 'localhost' || val === '127.0.0.1' || val === '::1';
}

/**
 * Server-side authorization check for Staff Voice Calling-Agent Prototype.
 * 
 * SECURITY CONTRACT:
 * 1. Checks cryptographically signed session token ('evaluation_session_token' cookie or Bearer token).
 * 2. Enforces authorized roles: ADMIN, LEADERSHIP, STATE_REVIEWER. Other roles (e.g. FIELD_USER) receive 403.
 * 3. Local Development Bypass:
 *    - STRICTLY PROHIBITED in production (`NODE_ENV === 'production'`).
 *    - Requires explicit opt-in: `ALLOW_LOCAL_STAFF_VOICE_BYPASS === 'true'`.
 *    - Requires request host/IP to be loopback (`localhost`, `127.0.0.1`, `::1`).
 * 4. Fails closed with 401/403.
 */
export function authorizeVoiceStaffAccess(
  req: {
    cookies: { get: (name: string) => { value: string } | undefined };
    headers: { get: (name: string) => string | null };
  }
): VoiceStaffAuthResult {
  // 1. Check session cookie
  const cookieToken = req.cookies.get('evaluation_session_token')?.value ||
                      req.cookies.get('session_token')?.value;

  let token = cookieToken;

  // Also support Authorization header Bearer token
  if (!token) {
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (token) {
    const session = verifySessionToken(token);
    if (session) {
      if (AUTHORIZED_VOICE_STAFF_ROLES.includes(session.role)) {
        return {
          authorized: true,
          user: {
            userId: session.userId,
            name: session.name,
            role: session.role,
          },
          reason: 'verified_staff_session',
          statusCode: 200,
        };
      }
      return {
        authorized: false,
        reason: `Role '${session.role}' is not authorized to access staff voice evaluation. Requires ADMIN, LEADERSHIP, or STATE_REVIEWER.`,
        statusCode: 403,
      };
    }
  }

  // 2. Strict local development loopback bypass
  const isProduction = process.env.NODE_ENV === 'production';
  const isBypassEnabled = process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS === 'true';

  if (!isProduction && isBypassEnabled) {
    const hostHeader = req.headers.get('host') || req.headers.get('x-forwarded-host');
    const remoteIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    const hostIsLoopback = isLoopbackHost(hostHeader);
    const ipIsLoopback = !remoteIp || isLoopbackHost(remoteIp.split(',')[0].trim());

    if (hostIsLoopback && ipIsLoopback) {
      return {
        authorized: true,
        user: {
          userId: 'local-staff-evaluator',
          name: 'Local Staff Evaluator (Loopback Bypass)',
          role: 'ADMIN',
        },
        reason: 'local_loopback_bypass',
        statusCode: 200,
      };
    }
  }

  return {
    authorized: false,
    reason: 'Authentication required. No valid staff session found.',
    statusCode: 401,
  };
}
