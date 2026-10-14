/**
 * Individual Leadership Session Store & Lifecycle
 * 
 * Rules:
 * - Cookie name: `leader_session_id`
 * - Cookie attributes: HttpOnly, SameSite=Lax, Secure (prod), Path=/
 * - Absolute session lifetime: 8 hours
 * - Sliding idle timeout: 30 minutes
 * - Non-sliding background polling: requests with X-Poll do NOT extend idle window
 * - Instant mid-session revocation: checks leader.isActive and leader.authVersion
 */

import crypto from 'crypto';
import { NextResponse, NextRequest } from 'next/server';
import {
  findLeaderById,
  type LeaderIdentity,
} from './leaderIdentityStore';

export const LEADER_COOKIE_NAME = 'leader_session_id';
export const LEADER_IDLE_TIMEOUT_MS = 30 * 60 * 1000;      // 30 minutes
export const LEADER_ABSOLUTE_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface LeaderSession {
  sessionId: string;
  leaderId: string;
  email: string;
  name: string;
  title: string;
  role: 'LEADERSHIP';
  allowedStates: string[];
  allowedDistricts: string[];
  authVersion: number;
  createdAt: number;
  lastActivityAt: number;
  absoluteExpiresAt: number;
}

const activeLeaderSessions = new Map<string, LeaderSession>();

/**
 * Creates a new leadership session upon successful code verification.
 */
export function createLeaderSession(leader: LeaderIdentity): LeaderSession {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  const session: LeaderSession = {
    sessionId,
    leaderId: leader.id,
    email: leader.email,
    name: leader.name,
    title: leader.title,
    role: 'LEADERSHIP',
    allowedStates: leader.allowedStates || ['*'],
    allowedDistricts: leader.allowedDistricts || ['*'],
    authVersion: leader.authVersion,
    createdAt: now,
    lastActivityAt: now,
    absoluteExpiresAt: now + LEADER_ABSOLUTE_LIFETIME_MS,
  };

  activeLeaderSessions.set(sessionId, session);
  return session;
}

/**
 * Validates a leadership session ID.
 * 
 * Options:
 * - isPoll: When true (e.g. from X-Poll header), does NOT extend lastActivityAt
 */
export function validateLeaderSession(
  sessionId?: string | null,
  options?: { isPoll?: boolean }
): LeaderSession | null {
  if (!sessionId || typeof sessionId !== 'string') return null;

  const session = activeLeaderSessions.get(sessionId);
  if (!session) return null;

  const now = Date.now();

  // 1. Check absolute 8-hour expiry
  if (now > session.absoluteExpiresAt) {
    activeLeaderSessions.delete(sessionId);
    return null;
  }

  // 2. Check 30-minute sliding idle timeout
  if (now - session.lastActivityAt > LEADER_IDLE_TIMEOUT_MS) {
    activeLeaderSessions.delete(sessionId);
    return null;
  }

  // 3. Mid-session revocation & authVersion check against identity store
  const leader = findLeaderById(session.leaderId);
  if (!leader || !leader.isActive || leader.authVersion !== session.authVersion) {
    activeLeaderSessions.delete(sessionId);
    return null;
  }

  // 4. Slide idle window UNLESS request is a background poll
  if (!options?.isPoll) {
    session.lastActivityAt = now;
  }

  return { ...session };
}

/**
 * Revokes a session explicitly (e.g. on logout).
 */
export function revokeLeaderSession(sessionId?: string | null): void {
  if (sessionId) {
    activeLeaderSessions.delete(sessionId);
  }
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
 * Clears all active sessions for unit testing.
 */
export function resetLeaderSessionsForTesting(): void {
  activeLeaderSessions.clear();
}
