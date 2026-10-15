/**
 * Voice Evaluation In-Memory Session Registry
 * 
 * ARCHITECTURAL LIMITATION & SCOPE NOTICE:
 * 1. Single-Process / Local Only: This session map is stored strictly in memory
 *    within the running Node.js process.
 * 2. Non-Distributed: It does NOT provide a distributed lock across multiple serverless
 *    lambdas, cluster pods, or container replicas.
 * 3. Enforces a local concurrency ceiling (1 active evaluation session max)
 *    to prevent runaway local resource consumption.
 */

export const MAX_CONCURRENT_EVALUATION_SESSIONS = 1;

export interface ActiveEvaluationSession {
  roomName: string;
  userId: string;
  startedAt: number;
  expiresAt: number;
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

export function releaseEvaluationSession(roomName: string): boolean {
  return activeSessionsMap.delete(roomName);
}

/**
 * Reset helper for test suite isolation.
 */
export function _resetActiveSessionsForTesting(): void {
  activeSessionsMap.clear();
}
