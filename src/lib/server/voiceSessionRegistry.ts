/**
 * Voice Evaluation In-Memory Session Registry
 * 
 * ARCHITECTURAL BOUNDARY & CONCURRENCY CLAIM:
 * 1. Scope of Concurrency Limit: This registry limits *unexpired session reservations*
 *    in the web application process. It does NOT track or poll the OS-level worker
 *    process or LiveKit media server active participant state.
 * 2. Single-Process / Local Only: This session map is stored in-memory within this Node.js instance.
 * 3. Non-Distributed: It does not coordinate locks across multiple serverless runtimes.
 * 4. Authenticated Ownership: Releases are authorized strictly against server-held reservation
 *    data (the `userId` that performed the reservation), NOT any caller-supplied payload.
 */

export const MAX_CONCURRENT_EVALUATION_SESSIONS = 1;

export interface ActiveEvaluationSession {
  roomName: string;
  userId: string;
  startedAt: number;
  expiresAt: number;
}

export interface ReleaseSessionResult {
  success: boolean;
  released: boolean;
  reason?: string;
  statusCode?: number;
}

const activeSessionsMap = new Map<string, ActiveEvaluationSession>();

export function pruneExpiredSessions(now: number = Date.now()): void {
  for (const [room, session] of activeSessionsMap.entries()) {
    if (now > session.expiresAt) {
      activeSessionsMap.delete(room);
    }
  }
}

export function getActiveSessionsCount(): number {
  pruneExpiredSessions();
  return activeSessionsMap.size;
}

export function isSessionSlotAvailable(): boolean {
  pruneExpiredSessions();
  return activeSessionsMap.size < MAX_CONCURRENT_EVALUATION_SESSIONS;
}

export function reserveEvaluationSession(
  roomName: string,
  userId: string,
  durationSeconds: number = 180
): { success: boolean; error?: string } {
  pruneExpiredSessions();

  if (activeSessionsMap.size >= MAX_CONCURRENT_EVALUATION_SESSIONS) {
    return {
      success: false,
      error: `Active evaluation session concurrency ceiling reached (${MAX_CONCURRENT_EVALUATION_SESSIONS} max). Please wait for active session to terminate or release reservation.`,
    };
  }

  const now = Date.now();
  activeSessionsMap.set(roomName, {
    roomName,
    userId,
    startedAt: now,
    expiresAt: now + durationSeconds * 1000,
  });

  return { success: true };
}

/**
 * Release an active evaluation session with authenticated ownership verification.
 * 
 * Enforces that only the user who reserved the session (or an ADMIN) can release it,
 * using server-held reservation data rather than any client-supplied user identifier.
 */
export function releaseEvaluationSession(
  roomName: string,
  authenticatedUserId: string,
  userRole?: string
): ReleaseSessionResult {
  pruneExpiredSessions();

  const session = activeSessionsMap.get(roomName);
  if (!session) {
    return {
      success: true,
      released: false,
      reason: 'Session reservation not found or already expired',
    };
  }

  const isOwner = session.userId === authenticatedUserId;
  const isAdmin = userRole === 'ADMIN';

  if (!isOwner && !isAdmin) {
    return {
      success: false,
      released: false,
      statusCode: 403,
      reason: `Forbidden: User '${authenticatedUserId}' is not authorized to release reservation for room '${roomName}' owned by '${session.userId}'`,
    };
  }

  activeSessionsMap.delete(roomName);
  return {
    success: true,
    released: true,
  };
}

/**
 * Force release helper used for internal cleanup (e.g. when token generation fails after reservation).
 */
export function forceReleaseEvaluationSession(roomName: string): boolean {
  return activeSessionsMap.delete(roomName);
}

/**
 * Retrieve active session details for test inspection.
 */
export function getActiveSession(roomName: string): ActiveEvaluationSession | undefined {
  pruneExpiredSessions();
  return activeSessionsMap.get(roomName);
}

/**
 * Reset helper for test suite isolation.
 */
export function _resetActiveSessionsForTesting(): void {
  activeSessionsMap.clear();
}
