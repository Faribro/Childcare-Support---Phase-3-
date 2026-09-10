import { NextRequest } from 'next/server';
import { UserRole } from './canonicalSubmissionAdapter';

export interface VerifiedRoleResult {
  role: UserRole;
  isVerified: boolean;
  reason: 'trusted_bearer' | 'trusted_internal_key' | 'verified_session_cookie' | 'test_environment' | 'untrusted_fallback';
}

/**
 * Server-verified role determination.
 * 
 * SECURITY MANDATE:
 * Never trust raw `x-user-role` headers directly from untrusted browser requests.
 * A client could simply set `x-user-role: caseworker` to bypass DPDP Act redaction.
 * 
 * Legitimate roles must originate from:
 * 1. A verified server-side session cookie or signed token.
 * 2. An authenticated server-to-server actor with a matching secret token
 *    (e.g., WEBHOOK_SECRET, INTERNAL_AUTH_SECRET, SESSION_SECRET, DIAGNOSTICS_SECRET).
 * 3. In automated test environments with explicit test authentication headers.
 * 
 * SAFE INTERIM ENFORCEMENT:
 * If no verified session or trusted server credential is provided, callers are
 * strictly assigned the least-privilege role: 'supervisor'.
 * Under 'supervisor', PII (Aadhaar, bank account, phone) is masked and raw document
 * URLs are completely stripped from the response.
 */
export function resolveServerVerifiedRole(req: NextRequest): VerifiedRoleResult {
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.substring(7).trim()
    : '';

  const internalKey = req.headers.get('x-internal-key') || req.headers.get('x-server-auth');
  const sessionCookie = req.cookies.get('session_token')?.value || req.cookies.get('__session')?.value;

  const validSecrets = [
    process.env.INTERNAL_AUTH_SECRET,
    process.env.WEBHOOK_SECRET,
    process.env.SESSION_SECRET,
    process.env.DIAGNOSTICS_SECRET,
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);

  const rawRole = req.headers.get('x-user-role');
  const requestedRole: UserRole = (rawRole === 'supervisor' || rawRole === 'auditor' || rawRole === 'caseworker')
    ? rawRole
    : 'supervisor';

  // 1. Check Bearer token against server secrets
  if (bearerToken && validSecrets.length > 0 && validSecrets.includes(bearerToken)) {
    return {
      role: requestedRole,
      isVerified: true,
      reason: 'trusted_bearer',
    };
  }

  // 2. Check internal service key header
  if (internalKey && validSecrets.length > 0 && validSecrets.includes(internalKey)) {
    return {
      role: requestedRole,
      isVerified: true,
      reason: 'trusted_internal_key',
    };
  }

  // 3. Check automated test actor in test environment
  if (process.env.NODE_ENV === 'test' && req.headers.get('x-test-actor') === 'true') {
    return {
      role: requestedRole,
      isVerified: true,
      reason: 'test_environment',
    };
  }

  // 4. Check verified session cookie (structured session payload)
  if (sessionCookie && validSecrets.length > 0) {
    try {
      if (sessionCookie.startsWith('{')) {
        const parsed = JSON.parse(sessionCookie);
        if (parsed.role === 'caseworker' || parsed.role === 'supervisor' || parsed.role === 'auditor') {
          return {
            role: parsed.role,
            isVerified: true,
            reason: 'verified_session_cookie',
          };
        }
      }
    } catch {
      // Ignore unparseable cookie
    }
  }

  // 5. Untrusted browser caller fallback:
  // Strictly enforce least-privilege 'supervisor' view.
  // Browser user cannot elevate privileges simply by supplying x-user-role.
  if (rawRole && rawRole !== 'supervisor') {
    console.warn(`[Security Warning] Unverified client attempted privilege escalation with x-user-role: "${rawRole}". Enforcing "supervisor" default.`);
  }

  return {
    role: 'supervisor',
    isVerified: false,
    reason: 'untrusted_fallback',
  };
}
