/**
 * Individual Leadership Session Store & Lifecycle
 * 
 * Rules:
 * - Cookie name: `leader_session_id`
 * - Device binding cookie name: `leader_device_binding`
 * - Cookie attributes: HttpOnly, SameSite=Lax, Secure (prod), Path=/
 * - Absolute session lifetime: 8 hours
 * - Sliding idle timeout: 30 minutes
 * - Non-sliding background polling: requests with X-Poll do NOT extend idle window
 * - Instant mid-session revocation: checks leader.isActive and leader.authVersion against identity store
 * - Single active session per leader enforced via distributed store
 */

import { NextResponse, NextRequest } from 'next/server';
import {
  findLeaderById,
  type LeaderIdentity,
} from './leaderIdentityStore';
import {
  getLeaderAuthStore,
  LEADER_COOKIE_NAME,
  LEADER_DEVICE_COOKIE_NAME,
  LEADER_IDLE_TIMEOUT_MS,
  LEADER_ABSOLUTE_LIFETIME_MS,
  type LeaderSessionRecord,
} from './leaderAuthStore';

export {
  LEADER_COOKIE_NAME,
  LEADER_DEVICE_COOKIE_NAME,
  LEADER_IDLE_TIMEOUT_MS,
  LEADER_ABSOLUTE_LIFETIME_MS,
  type LeaderSessionRecord,
};

export type LeaderSession = LeaderSessionRecord;

/**
 * Validates a leadership session ID against distributed store and identity rules.
 * 
 * Options:
 * - isPoll: When true (e.g. from X-Poll header), does NOT extend lastActivityAt
 */
export async function validateLeaderSession(
  sessionId?: string | null,
  options?: { isPoll?: boolean; req?: NextRequest }
): Promise<LeaderSessionRecord | null> {
  if (!sessionId || typeof sessionId !== 'string') return null;

  const store = getLeaderAuthStore();
  const session = await store.getSession(sessionId);
  if (!session || session.isRevoked) return null;

  const now = Date.now();

  // 1. Check absolute 8-hour expiry
  if (now > session.absoluteExpiresAt) {
    await store.revokeSession(sessionId);
    return null;
  }

  // 2. Check 30-minute sliding idle timeout
  if (now - session.lastActivityAt > LEADER_IDLE_TIMEOUT_MS) {
    await store.revokeSession(sessionId);
    return null;
  }

  // 3. Mid-session revocation & authVersion check against identity store
  const leader = findLeaderById(session.leaderId);
  if (!leader || !leader.isActive || leader.authVersion !== session.authVersion) {
    await store.revokeSession(sessionId);
    return null;
  }

  // 4. Slide idle window UNLESS request is a background poll
  if (!options?.isPoll) {
    await store.updateSessionActivity(sessionId, now);
    session.lastActivityAt = now;
  }

  return { ...session };
}

/**
 * Revokes a session explicitly (e.g. on logout).
 */
export async function revokeLeaderSession(sessionId?: string | null): Promise<void> {
  if (sessionId) {
    const store = getLeaderAuthStore();
    await store.revokeSession(sessionId);
  }
}

/**
 * Revokes all sessions for a leader (e.g. on deactivation or security reset).
 */
export async function revokeAllSessionsForLeader(leaderId: string): Promise<void> {
  const store = getLeaderAuthStore();
  await store.revokeAllSessionsForLeader(leaderId);
}

/**
 * Sets the HttpOnly leader session cookie.
 */
export function attachLeaderSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set(LEADER_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: LEADER_ABSOLUTE_LIFETIME_MS / 1000,
    path: '/',
  });
}

/**
 * Clears the leader session cookie.
 */
export function clearLeaderSessionCookie(response: NextResponse): void {
  response.cookies.set(LEADER_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Sets the HttpOnly browser device binding cookie.
 */
export function attachDeviceBindingCookie(response: NextResponse, secret: string): void {
  response.cookies.set(LEADER_DEVICE_COOKIE_NAME, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });
}

/**
 * Clears the device binding cookie.
 */
export function clearDeviceBindingCookie(response: NextResponse): void {
  response.cookies.set(LEADER_DEVICE_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Extracts leader session ID from incoming request cookie or header.
 */
export function extractLeaderSessionId(req: NextRequest): string | null {
  const cookieVal = req.cookies.get(LEADER_COOKIE_NAME)?.value;
  if (cookieVal) return cookieVal.trim();

  // Header fallback for testing / API clients
  const headerVal = req.headers.get('x-leader-session-id');
  if (headerVal) return headerVal.trim();

  return null;
}

/**
 * Extracts browser device binding secret from incoming request cookie or header.
 */
export function extractDeviceBindingSecret(req: NextRequest): string | null {
  const cookieVal = req.cookies.get(LEADER_DEVICE_COOKIE_NAME)?.value;
  if (cookieVal) return cookieVal.trim();

  // Header fallback for testing
  const headerVal = req.headers.get('x-device-binding');
  if (headerVal) return headerVal.trim();

  return null;
}

/**
 * Resets all sessions for unit testing.
 */
export async function resetLeaderSessionsForTesting(): Promise<void> {
  const store = getLeaderAuthStore();
  if (store.clearAllForTesting) {
    await store.clearAllForTesting();
  }
}
