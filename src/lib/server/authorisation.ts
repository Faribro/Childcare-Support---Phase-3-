import { NextRequest } from 'next/server';
import { UserRole } from './canonicalSubmissionAdapter';
import { extractSessionToken, verifySessionToken } from './sessionService';
import { extractLeaderSessionId, validateLeaderSession } from './leaderSessionStore';
import { isLeadershipSharedPasswordPermitted } from './leadershipAuthPolicy';

export interface VerifiedRoleResult {
  role: UserRole;
  isVerified: boolean;
  reason: 'trusted_bearer' | 'trusted_internal_key' | 'verified_session_cookie' | 'test_environment' | 'untrusted_fallback';
}

export type AuthPolicyRole =
  | 'FIELD_USER'
  | 'STATE_REVIEWER'
  | 'LEADERSHIP'
  | 'ADMIN'
  | 'AUDITOR';

export interface UserAccessScope {
  userId: string;
  name: string;
  role: AuthPolicyRole;
  allowedStates: string[];
  allowedDistricts: string[];
  isVerified: boolean;
  reason: string;
}

export interface SecurityAuditEvent {
  timestamp: string;
  actor: string;
  actorRole: string;
  eventType:
    | 'AUTH_SUCCESS'
    | 'AUTH_FAILURE'
    | 'ACCESS_DENIED'
    | 'SCOPE_VIOLATION'
    | 'RECORD_ACCESSED'
    | 'RECORD_MODIFIED'
    | 'APPROVAL_CHANGED'
    | 'RECORD_DELETED'
    | 'EXPORT_ATTEMPT'
    | 'RECORD_EXPORTED';
  targetResource?: string;
  scope?: string;
  outcome: 'ALLOW' | 'DENY';
  ip?: string;
  userAgent?: string;
  details?: string;
}

/**
 * Audit log recording with strict privacy protections (no PII, no credentials).
 */
export function logSecurityEvent(event: Omit<SecurityAuditEvent, 'timestamp'>): void {
  const fullEvent: SecurityAuditEvent = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  console.info(`[SECURITY_AUDIT] ${JSON.stringify(fullEvent)}`);
}

/**
 * Server-verified role determination.
 * 
 * SECURITY MANDATE:
 * Never trust raw `x-user-role` headers directly from untrusted browser requests.
 * A client could simply set `x-user-role: caseworker` to bypass DPDP Act redaction.
 */
export async function resolveServerVerifiedRole(req: NextRequest): Promise<VerifiedRoleResult> {
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

  // 4. Check individual Leadership session cookie FIRST (explicit precedence over shared session)
  const leaderSessionId = extractLeaderSessionId(req);
  if (leaderSessionId) {
    const isPoll = req.headers.get('x-poll') === 'true' || req.headers.get('x-poll') === '1';
    try {
      const leaderSession = await validateLeaderSession(leaderSessionId, { isPoll, req });
      if (leaderSession) {
        return {
          role: 'supervisor',
          isVerified: true,
          reason: 'verified_session_cookie',
        };
      }
    } catch (err: any) {
      console.error('[AUTH:ERROR] validateLeaderSession failed, failing closed:', err?.message);
    }
  }

  // 4b. Check verified legacy session cookie (cryptographically signed token or test-only structured payload)
  if (sessionCookie) {
    const verifiedSession = verifySessionToken(sessionCookie);
    if (verifiedSession) {
      // In email_only cutover mode, legacy shared Leadership sessions are rejected
      if (verifiedSession.role === 'LEADERSHIP' && !isLeadershipSharedPasswordPermitted()) {
        logSecurityEvent({
          actor: verifiedSession.userId || 'shared-leadership',
          actorRole: 'LEADERSHIP',
          eventType: 'AUTH_FAILURE',
          outcome: 'DENY',
          details: 'Legacy shared Leadership session rejected in resolveServerVerifiedRole under email_only cutover mode.',
        });
      } else {
        const mappedRole: UserRole =
          verifiedSession.role === 'FIELD_USER'
            ? 'caseworker'
            : verifiedSession.role === 'AUDITOR'
              ? 'auditor'
              : 'supervisor';
        return {
          role: mappedRole,
          isVerified: true,
          reason: 'verified_session_cookie',
        };
      }
    }

    if (process.env.NODE_ENV === 'test' && validSecrets.length > 0 && sessionCookie.startsWith('{')) {
      try {
        const parsed = JSON.parse(sessionCookie);
        if (parsed.role === 'caseworker' || parsed.role === 'supervisor' || parsed.role === 'auditor') {
          return {
            role: parsed.role,
            isVerified: true,
            reason: 'verified_session_cookie',
          };
        }
      } catch {
        // Ignore unparseable cookie
      }
    }
  }

  // 5. Untrusted browser caller fallback:
  if (rawRole && rawRole !== 'supervisor') {
    console.warn(`[Security Warning] Unverified client attempted privilege escalation with x-user-role: "${rawRole}". Enforcing "supervisor" default.`);
  }

  return {
    role: 'supervisor',
    isVerified: false,
    reason: 'untrusted_fallback',
  };
}

/**
 * Validates request Origin and Sec-Fetch-Site for state-changing authentication mutations.
 * Rejects cross-site requests to prevent CSRF attacks.
 */
export function validateMutationOrigin(req: NextRequest): { valid: boolean; reason?: string } {
  // If Sec-Fetch-Site is cross-site, reject
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return { valid: false, reason: 'Cross-site request rejected by Sec-Fetch-Site.' };
  }

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const reqUrl = new URL(req.url);
      if (originUrl.host !== reqUrl.host) {
        return { valid: false, reason: `Origin mismatch: ${originUrl.host} vs ${reqUrl.host}.` };
      }
    } catch {
      return { valid: false, reason: 'Malformed origin header.' };
    }
  }

  return { valid: true };
}

/**
 * Determines whether an unauthenticated request is allowed to receive synthetic local mock fixtures.
 *
 * SECURITY MANDATE:
 * - Never true in live/production environments or when live staging/Supabase bridges are active.
 * - Never true when a test explicitly probes unauthenticated behavior via `x-test-unauthenticated: true`.
 * - Never used as a production authorization bypass.
 */
export function isSyntheticDemoModeAllowed(req: NextRequest): boolean {
  if (req.headers.get('x-test-unauthenticated') === 'true') {
    return false;
  }
  return (
    process.env.E2E_ALLOW_LOCAL_MOCK === 'true' &&
    process.env.E2E_STAGING_ENABLED !== 'true' &&
    process.env.SUPABASE_LIVE_TEST !== 'true'
  );
}

/**
 * Resolves comprehensive geographic and role scope for Issue #57.
 */
export async function resolveUserAccessScope(req: NextRequest): Promise<UserAccessScope> {
  // 1. Check individual Leadership session cookie / header FIRST (explicit precedence)
  const leaderSessionId = extractLeaderSessionId(req);
  if (leaderSessionId) {
    const isPoll = req.headers.get('x-poll') === 'true' || req.headers.get('x-poll') === '1';
    try {
      const leaderSession = await validateLeaderSession(leaderSessionId, { isPoll, req });
      if (leaderSession) {
        return {
          userId: leaderSession.leaderId,
          name: leaderSession.name,
          role: 'LEADERSHIP',
          allowedStates: leaderSession.allowedStates || ['*'],
          allowedDistricts: leaderSession.allowedDistricts || ['*'],
          isVerified: true,
          reason: 'verified_leader_session',
        };
      }
    } catch (err: any) {
      console.error('[AUTH:ERROR] validateLeaderSession failed in resolveUserAccessScope, failing closed:', err?.message);
    }
  }

  // 2. Check signed cryptographic session token
  const token = extractSessionToken(req);
  if (token) {
    const session = verifySessionToken(token);
    if (session) {
      // In email_only cutover mode, legacy shared Leadership sessions are rejected
      if (session.role === 'LEADERSHIP' && !isLeadershipSharedPasswordPermitted()) {
        logSecurityEvent({
          actor: session.userId || 'shared-leadership',
          actorRole: 'LEADERSHIP',
          eventType: 'AUTH_FAILURE',
          outcome: 'DENY',
          details: 'Legacy shared Leadership session rejected in resolveUserAccessScope under email_only cutover mode.',
        });
      } else {
        return {
          userId: session.userId,
          name: session.name,
          role: session.role,
          allowedStates: session.allowedStates,
          allowedDistricts: session.allowedDistricts,
          isVerified: true,
          reason: 'verified_session_token',
        };
      }
    }
  }

  // 3. Check server-verified role from backend header/test secret
  const verifiedLegacy = await resolveServerVerifiedRole(req);
  if (verifiedLegacy.isVerified) {
    let role: AuthPolicyRole = 'STATE_REVIEWER';
    if (verifiedLegacy.role === 'caseworker') role = 'FIELD_USER';
    else if (verifiedLegacy.role === 'auditor') role = 'AUDITOR';

    return {
      userId: 'trusted-server-actor',
      name: `Verified Server Actor (${verifiedLegacy.role})`,
      role,
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isVerified: true,
      reason: verifiedLegacy.reason,
    };
  }

  // 3. In test environment, unless explicitly marked as unverified or scoped test, provide test actor scope
  if (process.env.NODE_ENV === 'test' && req.headers.get('x-test-unauthenticated') !== 'true') {
    const requestedState = req.headers.get('x-test-scope-state');
    const requestedDistrict = req.headers.get('x-test-scope-district');
    return {
      userId: 'test-runner',
      name: 'Automated Test Runner',
      role: 'ADMIN',
      allowedStates: requestedState ? [requestedState] : ['*'],
      allowedDistricts: requestedDistrict ? [requestedDistrict] : ['*'],
      isVerified: true,
      reason: 'test_environment',
    };
  }

  // 4. Fallback for unauthenticated callers: zero geographic scope and isVerified: false.
  // Unauthenticated callers must never receive real beneficiary records.
  return {
    userId: 'anonymous-field',
    name: 'Field Worker (Unauthenticated)',
    role: 'FIELD_USER',
    allowedStates: [],
    allowedDistricts: [],
    isVerified: false,
    reason: 'untrusted_fallback',
  };
}

/**
 * Checks if a requested state is within caller's authorized scope.
 */
export function isStateAuthorized(scope: UserAccessScope, state?: string | null): boolean {
  if (!scope.isVerified || scope.allowedStates.length === 0) {
    return false;
  }

  if (!state || state.trim() === '' || state.toUpperCase() === 'ALL' || state === '*') {
    // Cross-state wildcard access is permitted ONLY for LEADERSHIP, ADMIN, or wildcard scopes
    return scope.allowedStates.includes('*') || scope.role === 'LEADERSHIP' || scope.role === 'ADMIN';
  }

  if (scope.allowedStates.includes('*')) return true;
  return scope.allowedStates.some((s) => s.toLowerCase() === state.trim().toLowerCase());
}

/**
 * Checks if a requested district is within caller's authorized scope.
 */
export function isDistrictAuthorized(
  scope: UserAccessScope,
  state?: string | null,
  district?: string | null
): boolean {
  if (!scope.isVerified || scope.allowedStates.length === 0 || scope.allowedDistricts.length === 0) {
    return false;
  }

  if (state && state.trim() !== '' && !isStateAuthorized(scope, state)) {
    return false;
  }

  if (!district || district.trim() === '' || district.toUpperCase() === 'ALL' || district === '*') {
    return (
      scope.allowedDistricts.includes('*') ||
      scope.role === 'LEADERSHIP' ||
      scope.role === 'ADMIN' ||
      scope.role === 'STATE_REVIEWER'
    );
  }

  if (scope.allowedDistricts.includes('*')) return true;
  return scope.allowedDistricts.some((d) => d.toLowerCase() === district.trim().toLowerCase());
}

/**
 * Filters a linelist record collection strictly to authorized geographic bounds.
 */
export function filterRecordsByScope<T extends { state?: string; district?: string }>(
  scope: UserAccessScope,
  records: T[]
): T[] {
  if (!scope.isVerified || scope.allowedStates.length === 0 || scope.allowedDistricts.length === 0) {
    return [];
  }

  return records.filter((r: any) => {
    const rState = (r.state || r['18\nState'] || r.demographics?.state || 'Maharashtra').toString().trim().toLowerCase();
    const stateMatch =
      scope.allowedStates.includes('*') ||
      scope.allowedStates.some((s) => s.toLowerCase() === rState);
    if (!stateMatch) return false;

    if (scope.allowedDistricts.includes('*')) return true;
    const rDistrict = (r.district || r['19\nDistrict'] || r.demographics?.district || '').toString().trim().toLowerCase();
    return scope.allowedDistricts.some((d) => d.toLowerCase() === rDistrict);
  });
}

export interface CsrfValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Cross-Site Request Forgery (CSRF) Origin Header Validation.
 *
 * Enforces origin verification for state-changing HTTP methods (POST, PUT, PATCH, DELETE).
 *
 * Policy:
 * 1. Safe methods (GET, HEAD, OPTIONS) are exempt.
 * 2. Non-cookie service-to-service requests (Bearer authorization or internal service keys) are exempt.
 * 3. Browser-originated requests must provide an Origin header matching Host, Forwarded Host, or nextUrl origin.
 * 4. Mismatched or missing Origin on browser/cookie state-changing requests is rejected with 403 Forbidden.
 */
export function validateCsrfOrigin(req: NextRequest): CsrfValidationResult {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { isValid: true };
  }

  // Exempt non-cookie API traffic (Bearer tokens or internal server secrets)
  const authHeader = req.headers.get('authorization') || '';
  const internalKey = req.headers.get('x-internal-key') || req.headers.get('x-server-auth');
  if (authHeader.toLowerCase().startsWith('bearer ') || internalKey) {
    return { isValid: true, reason: 'exempt_non_cookie_api' };
  }

  const hasSessionCookie = Boolean(
    req.cookies.get('evaluation_session_token')?.value ||
    req.cookies.get('session_token')?.value ||
    req.cookies.get('__session')?.value
  );

  const isAuthRoute = req.nextUrl.pathname.startsWith('/api/auth/');

  // If request is neither using ambient cookie credentials nor targeting auth routes,
  // it is non-cookie API traffic (e.g., PWA background sync, mobile API client, automated tests)
  if (!hasSessionCookie && !isAuthRoute) {
    return { isValid: true, reason: 'exempt_non_cookie_api' };
  }

  const origin = req.headers.get('origin');
  if (!origin) {
    return {
      isValid: false,
      reason: 'Missing Origin header on state-changing request',
    };
  }

  try {
    const originUrl = new URL(origin);
    const hostHeader = (
      req.headers.get('x-forwarded-host') ||
      req.headers.get('host') ||
      req.nextUrl.host ||
      ''
    ).toLowerCase();

    // Match origin host with request host
    if (originUrl.host.toLowerCase() === hostHeader) {
      return { isValid: true };
    }

    // Match full origin against nextUrl.origin
    if (origin.toLowerCase() === req.nextUrl.origin.toLowerCase()) {
      return { isValid: true };
    }

    return {
      isValid: false,
      reason: `Mismatched Origin: '${origin}' does not match expected application host '${hostHeader}'`,
    };
  } catch {
    return {
      isValid: false,
      reason: 'Malformed Origin header',
    };
  }
}
