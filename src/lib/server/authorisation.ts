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
  allowedProgrammes?: string[];
  isVerified: boolean;
  reason: string;
  srName?: string;
  ssrName?: string;
  canEdit?: boolean;
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
  const sessionCookie = extractSessionToken(req);

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

function extractHostFromUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.host.toLowerCase();
  } catch {
    return trimmed.split('/')[0].split(':')[0].toLowerCase();
  }
}

/**
 * Resolves the list of expected hostnames based on APP_ENV, STAGING_SERVICE_URL,
 * PRODUCTION_URL, and ALLOWED_HOSTS.
 * Exact hosts only; zero wildcards.
 */
export function getExpectedHosts(): string[] {
  const envHosts = process.env.ALLOWED_HOSTS
    ? process.env.ALLOWED_HOSTS.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
    : [];
  const appEnv = (
    process.env.APP_ENV ||
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.NODE_ENV ||
    'development'
  ).toLowerCase();

  // If explicit ALLOWED_HOSTS is configured, enforce it strictly as the authoritative list
  if (envHosts.length > 0) {
    if (appEnv !== 'production') {
      return [...new Set([...envHosts, 'localhost', '127.0.0.1'])];
    }
    return [...new Set(envHosts)];
  }

  const defaults: string[] = [
    'cs-p3-production.web.app',
    'cs-p3-production.firebaseapp.com',
  ];

  // Staging must NOT list the production domain unless in production or explicitly configured
  if (appEnv === 'production') {
    defaults.push('childcare.allianceindia.org');
  }

  // Exact service URLs from environment
  const envUrls = [
    process.env.STAGING_SERVICE_URL,
    process.env.PRODUCTION_URL,
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];
  for (const u of envUrls) {
    const h = extractHostFromUrl(u);
    if (h) defaults.push(h);
  }

  if (appEnv !== 'production') {
    defaults.push('localhost', '127.0.0.1');
  }

  return [...new Set(defaults)];
}

/**
 * Validates request Origin and Sec-Fetch-Site for state-changing authentication mutations.
 * Rejects cross-site requests to prevent CSRF attacks.
 * Strictly verifies x-forwarded-host against allowlisted hosts for Cloud Run + Firebase Hosting rewrites.
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

      // Handle x-forwarded-host strictly against allowlisted expected hosts (Firebase Hosting rewrite / Cloud Run proxy)
      const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0].trim().toLowerCase();
      const hostHeader = (req.headers.get('host') || '').toLowerCase();
      const effectiveHost = forwardedHost || hostHeader || reqUrl.host.toLowerCase();

      if (originUrl.host.toLowerCase() === effectiveHost) {
        return { valid: true };
      }

      // Check allowlist of expected hosts for the target APP_ENV (exact matches only)
      const expectedHosts = getExpectedHosts();
      const isOriginAllowed = expectedHosts.some(
        (allowed) =>
          originUrl.host.toLowerCase() === allowed ||
          originUrl.hostname.toLowerCase() === allowed ||
          (process.env.NODE_ENV !== 'production' &&
            (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1'))
      );

      if (
        isOriginAllowed &&
        (!forwardedHost || expectedHosts.some((a) => forwardedHost === a))
      ) {
        return { valid: true };
      }

      return { valid: false, reason: `Origin mismatch: ${originUrl.host} vs ${effectiveHost}.` };
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
 * - Never true when running on Google Cloud Run (detected via K_SERVICE).
 * - Never true when a test explicitly probes unauthenticated behavior via `x-test-unauthenticated: true`.
 * - Never used as a production authorization bypass.
 */
export function isSyntheticDemoModeAllowed(req: NextRequest): boolean {
  if (req.headers.get('x-test-unauthenticated') === 'true') {
    return false;
  }

  // Hard production guard: Synthetic demo mode / local mock bypass is strictly forbidden in production or Cloud Run
  const isProductionOrLive =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.APP_ENV === 'production' ||
    process.env.NEXT_PUBLIC_APP_ENV === 'production' ||
    process.env.K_SERVICE !== undefined ||
    process.env.E2E_STAGING_ENABLED === 'true' ||
    process.env.SUPABASE_LIVE_TEST === 'true';

  if (isProductionOrLive) {
    return false;
  }

  return process.env.E2E_ALLOW_LOCAL_MOCK === 'true';
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
          allowedProgrammes: session.allowedProgrammes || ['alliance-childcare-phase3'],
          isVerified: true,
          reason: 'verified_session_token',
          srName: session.srName,
          ssrName: session.ssrName,
          canEdit: session.canEdit,
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
      allowedProgrammes: ['*'],
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
      allowedProgrammes: ['*'],
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
    allowedProgrammes: [],
    isVerified: false,
    reason: 'untrusted_fallback',
  };
}

/**
 * Determines whether the __session / leader session cookie should be actively cleared
 * from the browser in the current response.
 *
 * Policy (approved 2026-11-16):
 * - CLEAR only when the session was definitively unauthenticated (`reason === 'untrusted_fallback'`).
 *   This covers: expired sessions, revoked sessions, legacy shared-password sessions under email_only.
 * - NEVER clear on transient errors (Firestore timeouts, rate-limit back-off, partial auth failure).
 *   Those produce reasons like `verified_leader_session`, `verified_session_cookie`, `test_environment`.
 * - NEVER clear if the incoming request had no session cookie at all (nothing to clear).
 *
 * This helper is intentionally side-effect-free — the caller decides how to use the signal.
 */
export function shouldClearLeaderSessionCookie(
  scope: UserAccessScope,
  req: NextRequest
): boolean {
  // Only clear on definitively unauthenticated scope
  if (scope.isVerified || scope.reason !== 'untrusted_fallback') return false;

  // Only clear if there is actually a session cookie to clear (avoid spurious Set-Cookie headers)
  const hasSessionCookie =
    req.cookies.has('__session') ||
    req.cookies.has('leader_session_id') ||
    req.cookies.has('leader_session_token') ||
    req.headers.has('x-leader-session-id');
  return hasSessionCookie;
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
 * Checks if a requested programme is within caller's authorized scope.
 */
export function isProgrammeAuthorized(
  scope: UserAccessScope,
  programme?: string | null
): boolean {
  if (!scope.isVerified) return false;
  if (!programme || programme.trim() === '' || programme === '*') return true;
  if (!scope.allowedProgrammes || scope.allowedProgrammes.includes('*')) return true;
  return scope.allowedProgrammes.some((p) => p.toLowerCase() === programme.trim().toLowerCase());
}

/**
 * Filters a linelist record collection strictly to authorized geographic and programme bounds.
 */
export function filterRecordsByScope<T extends { state?: string; district?: string; programme_id?: string; programmeId?: string }>(
  scope: UserAccessScope,
  records: T[]
): T[] {
  if (!scope.isVerified || scope.allowedStates.length === 0 || scope.allowedDistricts.length === 0) {
    return [];
  }

  return records.filter((r: any) => {
    if (scope.allowedProgrammes && !scope.allowedProgrammes.includes('*')) {
      const rProg = (r.programme_id || r.programmeId || 'alliance-childcare-phase3').toString().trim().toLowerCase();
      if (!scope.allowedProgrammes.some((p) => p.toLowerCase() === rProg)) return false;
    }

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
