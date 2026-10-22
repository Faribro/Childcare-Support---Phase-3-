import { NextRequest, NextResponse } from 'next/server';
import { authorizeVoiceStaffAccess } from '@/lib/server/voiceStaffAuth';
import { logSecurityEvent } from '@/lib/server/authorisation';
import {
  recordWorkerAcknowledgment,
  adminForceResetSession,
  getActiveSessionsCount,
  getActiveSession,
} from '@/lib/server/voiceSessionRegistry';

export const dynamic = 'force-dynamic';

/**
 * GET: Read-only inspection of session lifecycle and worker acknowledgment state.
 */
export async function GET(req: NextRequest) {
  const auth = authorizeVoiceStaffAccess(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: auth.statusCode });
  }

  const roomName = req.nextUrl.searchParams.get('roomName');
  if (!roomName) {
    return NextResponse.json(
      { error: 'Missing roomName parameter', activeSessions: getActiveSessionsCount() },
      { status: 400 }
    );
  }

  const session = getActiveSession(roomName);
  if (!session) {
    return NextResponse.json(
      { found: false, roomName, message: 'Session not found or already completed' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    found: true,
    roomName: session.roomName,
    userId: session.userId,
    workerSessionId: session.workerSessionId,
    lifecycleState: session.lifecycleState,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    workerConnectedAt: session.workerConnectedAt,
    clientDisconnectedAt: session.clientDisconnectedAt,
    workerTeardownReportedAt: session.workerTeardownReportedAt,
    workerTeardownStatus: session.workerTeardownStatus,
    workerTeardownDetails: session.workerTeardownDetails,
  });
}

/**
 * POST: Worker posts authenticated lifecycle acknowledgment.
 * 
 * Supports:
 * - 'STARTED': Worker connected and accepted job.
 * - 'CLEANUP_REQUESTED': Worker initiated stream and audio teardown.
 * - 'CLEANUP_COMPLETED': Worker successfully closed all audio tracks, provider sessions, and disconnected. (Releases capacity).
 * - 'CLEANUP_FAILED_OR_UNCERTAIN': Worker encountered error during teardown. (Transitions to BLOCKED_UNCERTAIN_TEARDOWN fail-closed).
 * 
 * Validation:
 * - Authenticates against session reservationSecret.
 * - Enforces exact workerSessionId match (rejects cross-session and stale attempts with 409 Conflict).
 * - Repeated valid CLEANUP_COMPLETED calls are idempotent.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { roomName, workerSessionId, reservationSecret, status, details } = body || {};

  if (!roomName || typeof roomName !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid roomName' }, { status: 400 });
  }

  if (!workerSessionId || typeof workerSessionId !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid workerSessionId' }, { status: 400 });
  }

  if (!reservationSecret || typeof reservationSecret !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid reservationSecret' }, { status: 401 });
  }

  const validStatuses = [
    'STARTED',
    'CLEANUP_REQUESTED',
    'CLEANUP_COMPLETED',
    'CLEANUP_FAILED_OR_UNCERTAIN',
  ] as const;

  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
      { status: 400 }
    );
  }

  const result = recordWorkerAcknowledgment({
    roomName,
    workerSessionId,
    reservationSecret,
    status,
    details,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: result.statusCode });
  }

  return NextResponse.json({
    success: true,
    released: result.released,
    lifecycleState: result.lifecycleState,
    idempotent: result.idempotent || false,
    message: result.reason,
    activeSessions: getActiveSessionsCount(),
  });
}

/**
 * DELETE: Emergency Administrative Force-Reset.
 * 
 * SECURITY CONTRACT:
 * - Strictly restricted to role 'ADMIN'.
 * - Requires explicit non-empty justification reason (minimum 10 characters).
 * - Audited under SECURITY_OVERRIDE.
 * - Frees fail-closed blocked capacity.
 */
export async function DELETE(req: NextRequest) {
  const auth = authorizeVoiceStaffAccess(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: auth.statusCode });
  }

  if (auth.user?.role !== 'ADMIN') {
    logSecurityEvent({
      actor: auth.user?.userId || 'unknown',
      actorRole: auth.user?.role || 'UNKNOWN',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      targetResource: '/api/staff/voice/worker-acknowledgment',
      details: 'Non-ADMIN user attempted to perform emergency force-reset on worker session',
    });
    return NextResponse.json(
      { error: 'Forbidden: Emergency force-reset is strictly restricted to ADMIN role.' },
      { status: 403 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Check searchParams as fallback
  }

  const roomName = body?.roomName || req.nextUrl.searchParams.get('roomName');
  const reason = body?.reason || req.nextUrl.searchParams.get('reason');

  if (!roomName || typeof roomName !== 'string') {
    return NextResponse.json({ error: 'Missing roomName parameter' }, { status: 400 });
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
    return NextResponse.json(
      { error: 'Administrative force-reset requires a documented reason of at least 10 characters.' },
      { status: 400 }
    );
  }

  const resetResult = adminForceResetSession({
    roomName,
    adminUser: {
      userId: auth.user.userId,
      role: auth.user.role,
    },
    reason: reason.trim(),
  });

  if (!resetResult.success) {
    return NextResponse.json({ error: resetResult.reason }, { status: resetResult.statusCode });
  }

  return NextResponse.json({
    success: true,
    roomName: resetResult.roomName,
    released: resetResult.released,
    previousState: resetResult.previousState,
    message: resetResult.reason,
    activeSessions: getActiveSessionsCount(),
  });
}
