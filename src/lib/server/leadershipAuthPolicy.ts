/**
 * Shared Leadership Authentication Policy Resolver
 * 
 * Central authoritative resolver for Leadership authentication mode and feature gating.
 * Zero external dependencies (no database, no mailer, no cryptography) to ensure
 * ultra-fast resolution for status inquiry routes (GET /api/auth/leader/status)
 * and strict enforcement across mutation routes (/request-code, /verify-code, /login).
 * 
 * Policy rules:
 * - email_only: shared Leadership password rejected; email OTP permitted (if enabled).
 * - password_only: email code request & verification rejected; shared password permitted.
 * - hybrid: both approved methods permitted (email OTP requires enabled flag).
 * - Default mode when missing or invalid: 'hybrid' (documented default).
 */

export const VALID_AUTH_MODES = ['hybrid', 'email_only', 'password_only'] as const;
export type LeadershipAuthMode = (typeof VALID_AUTH_MODES)[number];

/**
 * Resolves the configured Leadership auth mode from environment.
 * Defaults to 'hybrid' if missing or invalid.
 */
export function getLeadershipAuthMode(): LeadershipAuthMode {
  const raw = process.env.LEADERSHIP_EMAIL_AUTH_MODE?.trim();
  if (raw && (VALID_AUTH_MODES as readonly string[]).includes(raw)) {
    return raw as LeadershipAuthMode;
  }
  return 'hybrid';
}

/**
 * Checks whether the server-side email authentication feature flag is enabled.
 */
export function isLeadershipEmailAuthFlagEnabled(): boolean {
  return process.env.LEADERSHIP_EMAIL_AUTH_ENABLED === 'true';
}

/**
 * Determines whether Leadership email authentication (OTP) is permitted.
 * Requires BOTH:
 * 1. The policy mode permits email authentication (not 'password_only').
 * 2. The server feature flag LEADERSHIP_EMAIL_AUTH_ENABLED is 'true'.
 */
export function isLeadershipEmailAuthPermitted(): boolean {
  const mode = getLeadershipAuthMode();
  if (mode === 'password_only') {
    return false;
  }
  return isLeadershipEmailAuthFlagEnabled();
}

/**
 * Determines whether shared-password authentication for Leadership is permitted.
 * In 'email_only' cutover mode, shared-password login for Leadership is disallowed.
 * In 'hybrid' and 'password_only' modes, shared-password login is permitted.
 */
export function isLeadershipSharedPasswordPermitted(): boolean {
  const mode = getLeadershipAuthMode();
  return mode !== 'email_only';
}

/**
 * Authoritative runtime status payload for GET /api/auth/leader/status.
 */
export function getLeadershipAuthPolicyStatus(): {
  emailAuthEnabled: boolean;
  authMode: LeadershipAuthMode;
} {
  const authMode = getLeadershipAuthMode();
  const emailAuthEnabled = isLeadershipEmailAuthPermitted();
  return {
    emailAuthEnabled,
    authMode,
  };
}
