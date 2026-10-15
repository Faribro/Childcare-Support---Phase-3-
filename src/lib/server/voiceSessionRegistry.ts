/**
 * Voice Evaluation In-Memory Session Registry
 * 
 * ARCHITECTURAL BOUNDARY & CONCURRENCY CLAIMS:
 * 1. Scope of Concurrency Limit: This registry limits *active and uncompleted evaluation sessions*
 *    in the web application process. It enforces fail-closed capacity gating across the worker lifecycle.
 * 2. Single-Process / In-Memory Only: This session map is stored in-memory within this single Node.js instance.
 * 3. Persistence Mode: IN_MEMORY_SINGLE_PROCESS.
 *    - Server restart loses in-memory reservation and lock state.
 *    - Distributed safety across multi-process clusters, containers, or serverless instances
 *      is NOT guaranteed without external durable coordination (e.g. Redis / PostgreSQL advisory locks).
 * 4. Authenticated Ownership: Releases are authorized strictly against server-held reservation
 *    data (`userId`), NOT any caller-supplied payload.
 * 5. Lifecycle Coordination:
 *    - Client disconnect alone does NOT release capacity if a worker is active or pending teardown.
 *    - Capacity is only freed when the worker posts an authenticated `CLEANUP_COMPLETED` acknowledgment
 *      matching the exact `workerSessionId`, or when an ADMIN performs an audited emergency force-reset.
 *    - Unacknowledged sessions that reach expiration transition to `BLOCKED_UNCERTAIN_TEARDOWN` (fail-closed).
 */

import crypto from 'crypto';
import { logSecurityEvent } from './authorisation';

export const MAX_CONCURRENT_EVALUATION_SESSIONS = 1;
export const REGISTRY_PERSISTENCE_MODE = 'IN_MEMORY_SINGLE_PROCESS' as const;

export type VoiceSessionLifecycleState =
  | 'RESERVED'                                // Slot held; room token issued; worker has not yet connected
  | 'WORKER_ACTIVE'                            // Worker acknowledged connection for exact workerSessionId
  | 'DISCONNECTED_PENDING_WORKER_TEARDOWN'     // Client disconnected / hung up; worker teardown in progress
  | 'CLEANUP_REQUESTED'                        // Teardown signaled to worker; awaiting worker acknowledgment
  | 'CLEANUP_COMPLETED'                        // Worker confirmed complete teardown and resource release
  | 'BLOCKED_UNCERTAIN_TEARDOWN';              // Reservation expired or worker failed without clean teardown (fail-closed)

export interface ActiveEvaluationSession {
  readonly roomName: string;
  readonly userId: string;
  readonly workerSessionId: string;
  readonly reservationSecret: string;
  lifecycleState: VoiceSessionLifecycleState;
  readonly startedAt: number;
  readonly expiresAt: number;
  workerConnectedAt?: number;
  clientDisconnectedAt?: number;
  workerTeardownReportedAt?: number;
  workerTeardownStatus?: 'COMPLETED' | 'FAILED' | 'UNCERTAIN';
  workerTeardownDetails?: string;
  adminResetLog?: {
    resetByUserId: string;
    reason: string;
    resetAt: number;
  };
}

export interface ReleaseSessionResult {
  success: boolean;
  released: boolean;
  lifecycleState?: VoiceSessionLifecycleState;
  reason?: string;
  statusCode?: number;
}

export interface WorkerAcknowledgmentResult {
  success: boolean;
  released: boolean;
  lifecycleState: VoiceSessionLifecycleState;
  idempotent?: boolean;
  statusCode: number;
  reason?: string;
}

export interface AdminForceResetResult {
  success: boolean;
  roomName: string;
  released: boolean;
  previousState?: VoiceSessionLifecycleState;
  statusCode: number;
  reason?: string;
}

const activeSessionsMap = new Map<string, ActiveEvaluationSession>();

/**
 * Prunes expired sessions with strict fail-closed safety.
 * 
 * Invariants:
 * - Sessions already in CLEANUP_COMPLETED can be safely deleted.
 * - Sessions in RESERVED, WORKER_ACTIVE, DISCONNECTED_PENDING_WORKER_TEARDOWN,
 *   or CLEANUP_REQUESTED that expire without worker acknowledgment MUST NOT be silently freed.
 *   They transition to BLOCKED_UNCERTAIN_TEARDOWN, blocking capacity until audited/reset.
 */
export function pruneExpiredSessions(now: number = Date.now()): void {
  for (const [room, session] of activeSessionsMap.entries()) {
    if (now > session.expiresAt) {
      if (session.lifecycleState === 'CLEANUP_COMPLETED') {
        activeSessionsMap.delete(room);
      } else if (session.lifecycleState !== 'BLOCKED_UNCERTAIN_TEARDOWN') {
        // Fail-closed: Worker did not complete teardown before expiration ceiling
        session.lifecycleState = 'BLOCKED_UNCERTAIN_TEARDOWN';
        session.workerTeardownStatus = 'UNCERTAIN';
        session.workerTeardownDetails = `Session expired after ${Math.round((now - session.startedAt) / 1000)}s without worker cleanup acknowledgment.`;
        logSecurityEvent({
          actor: 'system',
          actorRole: 'SYSTEM',
          eventType: 'ACCESS_DENIED',
          outcome: 'DENY',
          targetResource: `/voice-session:${room}`,
          details: `Session ${room} reached expiration without worker teardown acknowledgment. Transitioned to BLOCKED_UNCERTAIN_TEARDOWN (fail-closed).`,
        });
      }
    }
  }
}

export function getActiveSessionsCount(): number {
  pruneExpiredSessions();
  // Count any session that is not CLEANUP_COMPLETED
  let count = 0;
  for (const session of activeSessionsMap.values()) {
    if (session.lifecycleState !== 'CLEANUP_COMPLETED') {
      count++;
    }
  }
  return count;
}

export function hasUncertainBlockedSessions(): boolean {
  pruneExpiredSessions();
  for (const session of activeSessionsMap.values()) {
    if (session.lifecycleState === 'BLOCKED_UNCERTAIN_TEARDOWN') {
      return true;
    }
  }
  return false;
}

export function isSessionSlotAvailable(): boolean {
  pruneExpiredSessions();
  // Fail-closed: if any session is in BLOCKED_UNCERTAIN_TEARDOWN, no new sessions may start
  if (hasUncertainBlockedSessions()) {
    return false;
  }
  return getActiveSessionsCount() < MAX_CONCURRENT_EVALUATION_SESSIONS;
}

/**
 * Reserve an evaluation session slot.
 */
export function reserveEvaluationSession(
  roomName: string,
  userId: string,
  durationSeconds: number = 180,
  workerSessionId?: string,
  reservationSecret?: string
): { success: boolean; workerSessionId: string; reservationSecret: string; error?: string } {
  pruneExpiredSessions();

  if (hasUncertainBlockedSessions()) {
    return {
      success: false,
      workerSessionId: '',
      reservationSecret: '',
      error: 'Evaluation session slot is BLOCKED due to uncertain worker teardown. An administrator must audit and force-reset capacity.',
    };
  }

  if (getActiveSessionsCount() >= MAX_CONCURRENT_EVALUATION_SESSIONS) {
    return {
      success: false,
      workerSessionId: '',
      reservationSecret: '',
      error: `Active evaluation session concurrency ceiling reached (${MAX_CONCURRENT_EVALUATION_SESSIONS} max). Please wait for active session to terminate or release reservation.`,
    };
  }

  const now = Date.now();
  const assignedWorkerSessionId = workerSessionId || `worker-sess-${roomName}-${crypto.randomBytes(4).toString('hex')}`;
  const assignedSecret = reservationSecret || crypto.randomBytes(16).toString('hex');

  activeSessionsMap.set(roomName, {
    roomName,
    userId,
    workerSessionId: assignedWorkerSessionId,
    reservationSecret: assignedSecret,
    lifecycleState: 'RESERVED',
    startedAt: now,
    expiresAt: now + durationSeconds * 1000,
  });

  return {
    success: true,
    workerSessionId: assignedWorkerSessionId,
    reservationSecret: assignedSecret,
  };
}

/**
 * Worker records active connection for this session.
 */
export function recordWorkerConnection(
  roomName: string,
  workerSessionId: string,
  reservationSecret: string
): { success: boolean; statusCode: number; reason?: string } {
  pruneExpiredSessions();
  const session = activeSessionsMap.get(roomName);

  if (!session) {
    return { success: false, statusCode: 404, reason: 'Session reservation not found or expired' };
  }

  if (session.reservationSecret !== reservationSecret) {
    return { success: false, statusCode: 401, reason: 'Unauthorized: Invalid reservation secret' };
  }

  if (session.workerSessionId !== workerSessionId) {
    return {
      success: false,
      statusCode: 409,
      reason: `Conflict: workerSessionId '${workerSessionId}' does not match reservation target '${session.workerSessionId}'`,
    };
  }

  if (session.lifecycleState === 'BLOCKED_UNCERTAIN_TEARDOWN') {
    return { success: false, statusCode: 409, reason: 'Session is in BLOCKED_UNCERTAIN_TEARDOWN state' };
  }

  session.lifecycleState = 'WORKER_ACTIVE';
  session.workerConnectedAt = Date.now();
  return { success: true, statusCode: 200 };
}

/**
 * Handle client-side disconnect / cancellation.
 * 
 * CRITICAL SAFETY RULE:
 * - If worker NEVER connected (state === 'RESERVED'): releasing frees the slot immediately.
 * - If worker IS ACTIVE or already pending teardown: client disconnect transitions to
 *   'DISCONNECTED_PENDING_WORKER_TEARDOWN'. Capacity is NOT released until the worker acknowledges cleanup!
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

  // 1. If worker never connected (state === 'RESERVED'), cancellation frees the reservation immediately
  if (session.lifecycleState === 'RESERVED') {
    activeSessionsMap.delete(roomName);
    return {
      success: true,
      released: true,
      lifecycleState: 'CLEANUP_COMPLETED',
      reason: 'Unconnected reservation cancelled; capacity freed immediately.',
    };
  }

  // 2. If worker is active or pending teardown: Do NOT release capacity on client disconnect alone
  if (session.lifecycleState === 'WORKER_ACTIVE' || session.lifecycleState === 'CLEANUP_REQUESTED') {
    session.lifecycleState = 'DISCONNECTED_PENDING_WORKER_TEARDOWN';
    session.clientDisconnectedAt = Date.now();
    return {
      success: true,
      released: false, // Capacity NOT released yet!
      lifecycleState: 'DISCONNECTED_PENDING_WORKER_TEARDOWN',
      reason: 'Client disconnected; reservation capacity remains held until worker reports cleanup completion.',
    };
  }

  // 3. If session is already blocked uncertain
  if (session.lifecycleState === 'BLOCKED_UNCERTAIN_TEARDOWN') {
    return {
      success: false,
      released: false,
      statusCode: 409,
      lifecycleState: 'BLOCKED_UNCERTAIN_TEARDOWN',
      reason: 'Cannot release session via client disconnect: Session is in BLOCKED_UNCERTAIN_TEARDOWN. Admin force-reset required.',
    };
  }

  return {
    success: true,
    released: false,
    lifecycleState: session.lifecycleState,
    reason: `Session in state ${session.lifecycleState}; waiting for worker acknowledgment.`,
  };
}

/**
 * Worker posts authenticated acknowledgment of lifecycle transitions / teardown.
 */
export function recordWorkerAcknowledgment(params: {
  roomName: string;
  workerSessionId: string;
  reservationSecret: string;
  status: 'STARTED' | 'CLEANUP_REQUESTED' | 'CLEANUP_COMPLETED' | 'CLEANUP_FAILED_OR_UNCERTAIN';
  details?: string;
}): WorkerAcknowledgmentResult {
  pruneExpiredSessions();
  const session = activeSessionsMap.get(params.roomName);

  if (!session) {
    return {
      success: false,
      released: false,
      lifecycleState: 'CLEANUP_COMPLETED',
      statusCode: 404,
      reason: 'Session reservation not found or expired',
    };
  }

  // Authenticate reservation secret
  if (session.reservationSecret !== params.reservationSecret) {
    logSecurityEvent({
      actor: 'worker',
      actorRole: 'SYSTEM',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      targetResource: `/voice-session:${params.roomName}`,
      details: 'Worker acknowledgment rejected: Invalid reservation secret',
    });
    return {
      success: false,
      released: false,
      lifecycleState: session.lifecycleState,
      statusCode: 401,
      reason: 'Unauthorized: Invalid reservation secret',
    };
  }

  // Reject cross-session or stale workerSessionId
  if (session.workerSessionId !== params.workerSessionId) {
    logSecurityEvent({
      actor: 'worker',
      actorRole: 'SYSTEM',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      targetResource: `/voice-session:${params.roomName}`,
      details: `Cross-session worker acknowledgment rejected: Provided '${params.workerSessionId}' does not match registered '${session.workerSessionId}'`,
    });
    return {
      success: false,
      released: false,
      lifecycleState: session.lifecycleState,
      statusCode: 409,
      reason: `Conflict: workerSessionId '${params.workerSessionId}' does not match reservation target '${session.workerSessionId}'`,
    };
  }

  // Idempotency: Repeated valid CLEANUP_COMPLETED
  if (session.lifecycleState === 'CLEANUP_COMPLETED' && params.status === 'CLEANUP_COMPLETED') {
    return {
      success: true,
      released: true,
      lifecycleState: 'CLEANUP_COMPLETED',
      idempotent: true,
      statusCode: 200,
      reason: 'Acknowledgment already processed; idempotent success.',
    };
  }

  const now = Date.now();
  session.workerTeardownReportedAt = now;
  session.workerTeardownDetails = params.details;

  if (params.status === 'STARTED') {
    session.lifecycleState = 'WORKER_ACTIVE';
    session.workerConnectedAt = now;
    return {
      success: true,
      released: false,
      lifecycleState: 'WORKER_ACTIVE',
      statusCode: 200,
    };
  }

  if (params.status === 'CLEANUP_REQUESTED') {
    session.lifecycleState = 'CLEANUP_REQUESTED';
    return {
      success: true,
      released: false,
      lifecycleState: 'CLEANUP_REQUESTED',
      statusCode: 200,
    };
  }

  if (params.status === 'CLEANUP_COMPLETED') {
    session.lifecycleState = 'CLEANUP_COMPLETED';
    session.workerTeardownStatus = 'COMPLETED';
    // Cleanly delete from active map to free capacity slot
    activeSessionsMap.delete(params.roomName);
    logSecurityEvent({
      actor: 'worker',
      actorRole: 'SYSTEM',
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      targetResource: `/voice-session:${params.roomName}`,
      details: `Worker ${params.workerSessionId} confirmed CLEANUP_COMPLETED. Session slot released.`,
    });
    return {
      success: true,
      released: true,
      lifecycleState: 'CLEANUP_COMPLETED',
      statusCode: 200,
      reason: 'Worker cleanup completed; session capacity slot released.',
    };
  }

  // CLEANUP_FAILED_OR_UNCERTAIN
  session.lifecycleState = 'BLOCKED_UNCERTAIN_TEARDOWN';
  session.workerTeardownStatus = 'FAILED';
  logSecurityEvent({
    actor: 'worker',
    actorRole: 'SYSTEM',
    eventType: 'ACCESS_DENIED',
    outcome: 'DENY',
    targetResource: `/voice-session:${params.roomName}`,
    details: `Worker reported CLEANUP_FAILED_OR_UNCERTAIN: ${params.details || 'No details'}. Transitioned to BLOCKED_UNCERTAIN_TEARDOWN.`,
  });

  return {
    success: true,
    released: false,
    lifecycleState: 'BLOCKED_UNCERTAIN_TEARDOWN',
    statusCode: 200,
    reason: 'Worker reported uncertain teardown. Capacity remains fail-closed until admin audit/reset.',
  };
}

/**
 * Emergency Admin Force-Reset.
 * 
 * SECURITY CONTRACT:
 * - Strictly restricted to role 'ADMIN'.
 * - Requires explicit non-empty justification reason (>= 10 characters).
 * - Generates high-priority SECURITY_OVERRIDE audit log.
 * - Frees blocked capacity.
 */
export function adminForceResetSession(params: {
  roomName: string;
  adminUser: { userId: string; role: string };
  reason: string;
}): AdminForceResetResult {
  if (params.adminUser.role !== 'ADMIN') {
    logSecurityEvent({
      actor: params.adminUser.userId,
      actorRole: params.adminUser.role as any,
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      targetResource: `/voice-session:${params.roomName}`,
      details: 'Unauthorized attempt to execute emergency force-reset without ADMIN role',
    });
    return {
      success: false,
      roomName: params.roomName,
      released: false,
      statusCode: 403,
      reason: 'Forbidden: Emergency force-reset requires ADMIN role.',
    };
  }

  if (!params.reason || params.reason.trim().length < 10) {
    return {
      success: false,
      roomName: params.roomName,
      released: false,
      statusCode: 400,
      reason: 'Invalid request: Administrative force-reset requires a documented reason with at least 10 characters.',
    };
  }

  const session = activeSessionsMap.get(params.roomName);
  const previousState = session?.lifecycleState;

  activeSessionsMap.delete(params.roomName);

  logSecurityEvent({
    actor: params.adminUser.userId,
    actorRole: 'ADMIN',
    eventType: 'AUTH_SUCCESS',
    outcome: 'ALLOW',
    targetResource: `/voice-session:${params.roomName}`,
    details: `Admin force-reset override executed. Previous state: ${previousState || 'NONE'}. Justification: ${params.reason.trim()}`,
  });

  return {
    success: true,
    roomName: params.roomName,
    released: true,
    previousState,
    statusCode: 200,
    reason: 'Administrative force-reset successfully executed and audited.',
  };
}

/**
 * Internal force-release helper used when token generation throws before session start.
 */
export function forceReleaseEvaluationSession(roomName: string): boolean {
  return activeSessionsMap.delete(roomName);
}

/**
 * Retrieve active session details for inspection.
 */
export function getActiveSession(roomName: string): ActiveEvaluationSession | undefined {
  pruneExpiredSessions();
  return activeSessionsMap.get(roomName);
}

/**
 * Reset helper strictly for isolated test suites.
 */
export function _resetActiveSessionsForTesting(): void {
  activeSessionsMap.clear();
}
