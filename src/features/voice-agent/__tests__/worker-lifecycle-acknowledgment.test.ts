import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  reserveEvaluationSession,
  recordWorkerConnection,
  releaseEvaluationSession,
  recordWorkerAcknowledgment,
  adminForceResetSession,
  isSessionSlotAvailable,
  getActiveSessionsCount,
  getActiveSession,
  hasUncertainBlockedSessions,
  pruneExpiredSessions,
  _resetActiveSessionsForTesting,
  REGISTRY_PERSISTENCE_MODE,
} from '@/lib/server/voiceSessionRegistry';
import {
  GET as ackGetHandler,
  POST as ackPostHandler,
  DELETE as ackDeleteHandler,
} from '@/app/api/staff/voice/worker-acknowledgment/route';
import {
  POST as tokenPostHandler,
  DELETE as tokenDeleteHandler,
} from '@/app/api/staff/voice/token/route';
import { createSessionToken } from '@/lib/server/sessionService';
import {
  isOfflineWorkerModeEnabled,
  checkWorkerCredentials,
  runOfflineWorkerJobSimulation,
} from '@/features/voice-agent/worker/livekit-agent-worker';

describe('Worker Lifecycle & Teardown Acknowledgment Safeguards', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetActiveSessionsForTesting();
    process.env = { ...originalEnv };
    (process.env as any).NODE_ENV = 'development';
    process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS = 'true';
    process.env.LIVEKIT_URL = 'wss://eval-livekit.example.com';
    process.env.LIVEKIT_API_KEY = 'test_api_key_lk';
    process.env.LIVEKIT_API_SECRET = 'test_api_secret_lk_32_characters_minimum!';
    process.env.SARVAM_API_KEY = 'mock_sarvam_key';
    process.env.OPENAI_API_KEY = 'mock_openai_key';
  });

  afterEach(() => {
    _resetActiveSessionsForTesting();
    process.env = originalEnv;
  });

  // 1. Persistence Mode Contract
  it('1. explicit persistence mode: verifies in-memory single-process boundary', () => {
    expect(REGISTRY_PERSISTENCE_MODE).toBe('IN_MEMORY_SINGLE_PROCESS');
  });

  // 2. Client Disconnect Does NOT Release Capacity when Worker is Active
  it('2. client disconnect alone does NOT release capacity when worker is active', () => {
    const room = 'synth-eval-room-dc1';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);
    expect(reservation.success).toBe(true);

    // Worker connects and confirms active connection
    const connectRes = recordWorkerConnection(room, reservation.workerSessionId, reservation.reservationSecret);
    expect(connectRes.success).toBe(true);
    expect(getActiveSession(room)?.lifecycleState).toBe('WORKER_ACTIVE');

    // Client hangs up / browser disconnects
    const releaseRes = releaseEvaluationSession(room, 'staff-user-01', 'STATE_REVIEWER');
    expect(releaseRes.success).toBe(true);
    expect(releaseRes.released).toBe(false); // CAPACITY NOT FREED!
    expect(releaseRes.lifecycleState).toBe('DISCONNECTED_PENDING_WORKER_TEARDOWN');

    // Capacity remains consumed because worker teardown has not been confirmed
    expect(isSessionSlotAvailable()).toBe(false);
    expect(getActiveSessionsCount()).toBe(1);

    // Attempting a second reservation must be rejected
    const secondReservation = reserveEvaluationSession('synth-eval-room-dc2', 'staff-user-02', 180);
    expect(secondReservation.success).toBe(false);
    expect(secondReservation.error).toContain('concurrency ceiling reached');
  });

  // 3. Worker Acknowledgment Rejection: Invalid Secret
  it('3. rejects worker acknowledgment with invalid reservation secret', async () => {
    const room = 'synth-eval-room-auth1';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);

    const postReq = new NextRequest('http://localhost:3000/api/staff/voice/worker-acknowledgment', {
      method: 'POST',
      body: JSON.stringify({
        roomName: room,
        workerSessionId: reservation.workerSessionId,
        reservationSecret: 'wrong_secret_1234',
        status: 'CLEANUP_COMPLETED',
      }),
    });

    const res = await ackPostHandler(postReq);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Invalid reservation secret');

    // Capacity remains held
    expect(isSessionSlotAvailable()).toBe(false);
  });

  // 4. Worker Acknowledgment Rejection: Mismatched / Cross-Session workerSessionId
  it('4. rejects cross-session and stale workerSessionId with 409 Conflict', async () => {
    const room = 'synth-eval-room-cross1';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);

    const postReq = new NextRequest('http://localhost:3000/api/staff/voice/worker-acknowledgment', {
      method: 'POST',
      body: JSON.stringify({
        roomName: room,
        workerSessionId: 'stale-worker-instance-999',
        reservationSecret: reservation.reservationSecret,
        status: 'CLEANUP_COMPLETED',
      }),
    });

    const res = await ackPostHandler(postReq);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('Conflict');
    expect(data.error).toContain('stale-worker-instance-999');

    // Capacity remains held
    expect(isSessionSlotAvailable()).toBe(false);
  });

  // 5. Worker Cleanup Completion Releases Capacity
  it('5. valid CLEANUP_COMPLETED acknowledgment releases capacity slot', async () => {
    const room = 'synth-eval-room-clean1';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);

    // Worker posts CLEANUP_COMPLETED
    const postReq = new NextRequest('http://localhost:3000/api/staff/voice/worker-acknowledgment', {
      method: 'POST',
      body: JSON.stringify({
        roomName: room,
        workerSessionId: reservation.workerSessionId,
        reservationSecret: reservation.reservationSecret,
        status: 'CLEANUP_COMPLETED',
        details: 'LiveKit room and Sarvam streams closed cleanly',
      }),
    });

    const res = await ackPostHandler(postReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.released).toBe(true);
    expect(data.lifecycleState).toBe('CLEANUP_COMPLETED');

    // Capacity is now safely freed
    expect(isSessionSlotAvailable()).toBe(true);
    expect(getActiveSessionsCount()).toBe(0);

    // Subsequent reservation succeeds
    const nextReservation = reserveEvaluationSession('synth-eval-room-clean2', 'staff-user-02', 180);
    expect(nextReservation.success).toBe(true);
  });

  // 6. Idempotency of Repeated Valid Acknowledgment
  it('6. repeated valid CLEANUP_COMPLETED acknowledgment is idempotent', async () => {
    const room = 'synth-eval-room-idemp1';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);

    const payload = {
      roomName: room,
      workerSessionId: reservation.workerSessionId,
      reservationSecret: reservation.reservationSecret,
      status: 'CLEANUP_COMPLETED',
    };

    // First call
    const res1 = await ackPostHandler(
      new NextRequest('http://localhost:3000/api/staff/voice/worker-acknowledgment', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.released).toBe(true);

    // Second call (duplicate/network retry)
    // Note: session was deleted from active map on first cleanup, so 404 or idempotent return is safe
    const res2 = await ackPostHandler(
      new NextRequest('http://localhost:3000/api/staff/voice/worker-acknowledgment', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
    // Returns 404 cleanly since session was already removed
    expect([200, 404]).toContain(res2.status);
  });

  // 7. Worker Failure -> BLOCKED_UNCERTAIN_TEARDOWN (Fail-Closed)
  it('7. worker failure transitions to BLOCKED_UNCERTAIN_TEARDOWN and blocks capacity', async () => {
    const room = 'synth-eval-room-fail1';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);

    // Worker posts failure
    const postReq = new NextRequest('http://localhost:3000/api/staff/voice/worker-acknowledgment', {
      method: 'POST',
      body: JSON.stringify({
        roomName: room,
        workerSessionId: reservation.workerSessionId,
        reservationSecret: reservation.reservationSecret,
        status: 'CLEANUP_FAILED_OR_UNCERTAIN',
        details: 'Sarvam streaming websocket hung; force kill attempted',
      }),
    });

    const res = await ackPostHandler(postReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.released).toBe(false);
    expect(data.lifecycleState).toBe('BLOCKED_UNCERTAIN_TEARDOWN');

    // Capacity is BLOCKED (fail-closed)
    expect(hasUncertainBlockedSessions()).toBe(true);
    expect(isSessionSlotAvailable()).toBe(false);

    // New reservations are blocked
    const newRes = reserveEvaluationSession('synth-eval-room-fail2', 'staff-user-02', 180);
    expect(newRes.success).toBe(false);
    expect(newRes.error).toContain('BLOCKED due to uncertain worker teardown');
  });

  // 8. Missing Acknowledgment on Expiration -> BLOCKED_UNCERTAIN_TEARDOWN (Fail-Closed)
  it('8. missing acknowledgment at expiry transitions to BLOCKED_UNCERTAIN_TEARDOWN', () => {
    const room = 'synth-eval-room-expire1';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);
    expect(reservation.success).toBe(true);

    // Advance time past 180 seconds without worker posting acknowledgment
    const futureTime = Date.now() + 200 * 1000;
    pruneExpiredSessions(futureTime);

    const session = getActiveSession(room);
    expect(session?.lifecycleState).toBe('BLOCKED_UNCERTAIN_TEARDOWN');
    expect(session?.workerTeardownStatus).toBe('UNCERTAIN');

    // Capacity remains blocked fail-closed
    expect(isSessionSlotAvailable()).toBe(false);
    expect(hasUncertainBlockedSessions()).toBe(true);
  });

  // 9. Admin Force-Reset: Role and Justification Enforcement
  it('9. admin force-reset requires ADMIN role and documented justification (>= 10 chars)', async () => {
    const room = 'synth-eval-room-reset1';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);

    // Simulate uncertain block
    recordWorkerAcknowledgment({
      roomName: room,
      workerSessionId: reservation.workerSessionId,
      reservationSecret: reservation.reservationSecret,
      status: 'CLEANUP_FAILED_OR_UNCERTAIN',
    });
    expect(hasUncertainBlockedSessions()).toBe(true);

    // Non-admin attempt
    const reviewerToken = createSessionToken({
      userId: 'rev-01',
      role: 'STATE_REVIEWER',
      name: 'State Reviewer',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    });
    const nonAdminReq = new NextRequest(
      `http://localhost:3000/api/staff/voice/worker-acknowledgment?roomName=${room}&reason=Worker%20hung`,
      {
        method: 'DELETE',
        headers: { Cookie: `evaluation_session_token=${reviewerToken}` },
      }
    );
    const nonAdminRes = await ackDeleteHandler(nonAdminReq);
    expect(nonAdminRes.status).toBe(403);

    // Admin attempt with short reason (< 10 chars)
    const adminToken = createSessionToken({
      userId: 'admin-01',
      role: 'ADMIN',
      name: 'System Admin',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    });
    const shortReasonReq = new NextRequest(
      `http://localhost:3000/api/staff/voice/worker-acknowledgment?roomName=${room}&reason=TooShort`,
      {
        method: 'DELETE',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      }
    );
    const shortReasonRes = await ackDeleteHandler(shortReasonReq);
    expect(shortReasonRes.status).toBe(400);
    const shortData = await shortReasonRes.json();
    expect(shortData.error).toContain('documented reason of at least 10 characters');

    // Admin attempt with valid justification
    const validReq = new NextRequest(
      `http://localhost:3000/api/staff/voice/worker-acknowledgment?roomName=${room}&reason=Verified%20process%20killed%20manually%20by%20operator`,
      {
        method: 'DELETE',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      }
    );
    const validRes = await ackDeleteHandler(validReq);
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.success).toBe(true);
    expect(validData.released).toBe(true);
    expect(validData.previousState).toBe('BLOCKED_UNCERTAIN_TEARDOWN');

    // Slot is now unblocked
    expect(hasUncertainBlockedSessions()).toBe(false);
    expect(isSessionSlotAvailable()).toBe(true);
  });

  // 10. Offline Worker Simulation: Credential Gating in Development
  it('10. offline worker mode in development passes credentials check without provider keys', () => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.SARVAM_API_KEY;
    delete process.env.OPENAI_API_KEY;

    // Without offline mode flag -> should report missing variables
    process.env.VOICE_WORKER_OFFLINE_MODE = 'false';
    const missingCheck = checkWorkerCredentials();
    expect(missingCheck.isConfigured).toBe(false);
    expect(missingCheck.missingVariables).toEqual([
      'LIVEKIT_URL',
      'LIVEKIT_API_KEY',
      'LIVEKIT_API_SECRET',
      'SARVAM_API_KEY',
      'OPENAI_API_KEY',
    ]);

    // With offline mode enabled in development
    process.env.VOICE_WORKER_OFFLINE_MODE = 'true';
    expect(isOfflineWorkerModeEnabled()).toBe(true);
    const offlineCheck = checkWorkerCredentials();
    expect(offlineCheck.isConfigured).toBe(true);
    expect(offlineCheck.isOfflineSimulation).toBe(true);
    expect(offlineCheck.missingVariables).toHaveLength(0);
  });

  // 11. Offline Worker Simulation: Fails Closed in Production
  it('11. offline worker mode is strictly ignored in production (fails closed)', () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.VOICE_WORKER_OFFLINE_MODE = 'true';

    // Must be disabled in production
    expect(isOfflineWorkerModeEnabled()).toBe(false);

    // Stripped credentials in production must fail closed
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.SARVAM_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const check = checkWorkerCredentials();
    expect(check.isConfigured).toBe(false);
    expect(check.isOfflineSimulation).toBe(false);
    expect(check.missingVariables.length).toBeGreaterThan(0);
  });

  // 12. Offline Simulation Runner Fails Closed in Production
  it('12. runOfflineWorkerJobSimulation throws immediately in production', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.VOICE_WORKER_OFFLINE_MODE = 'true';

    await expect(
      runOfflineWorkerJobSimulation({
        roomName: 'prod-attempt-room',
        workerSessionId: 'prod-worker-1',
        reservationSecret: 'prod-secret',
      })
    ).rejects.toThrow('Offline worker simulation is strictly prohibited in production environment.');
  });

  // 13. Offline Simulation Runner Executes Lifecycle and Releases Capacity
  it('13. runOfflineWorkerJobSimulation runs dialog turns and releases capacity via acknowledgment', async () => {
    process.env.VOICE_WORKER_OFFLINE_MODE = 'true';
    const room = 'synth-eval-offline-clean';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);
    expect(reservation.success).toBe(true);
    expect(isSessionSlotAvailable()).toBe(false);

    // Wire fetch to internal ackPostHandler
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new NextRequest(input as string, {
        method: init?.method || 'POST',
        headers: init?.headers as any,
        body: init?.body as any,
      });
      return ackPostHandler(req);
    });

    try {
      const result = await runOfflineWorkerJobSimulation({
        roomName: room,
        workerSessionId: reservation.workerSessionId,
        reservationSecret: reservation.reservationSecret,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.turnsSimulated).toBe(3);
      expect(result.acknowledged).toBe(true);

      // Verify that CLEANUP_COMPLETED freed the capacity
      expect(isSessionSlotAvailable()).toBe(true);
      expect(getActiveSession(room)).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // 14. Offline Simulation Runner with Simulated Failure Blocks Capacity
  it('14. runOfflineWorkerJobSimulation with simulateFailure blocks capacity fail-closed', async () => {
    process.env.VOICE_WORKER_OFFLINE_MODE = 'true';
    const room = 'synth-eval-offline-fail';
    const reservation = reserveEvaluationSession(room, 'staff-user-01', 180);
    expect(reservation.success).toBe(true);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new NextRequest(input as string, {
        method: init?.method || 'POST',
        headers: init?.headers as any,
        body: init?.body as any,
      });
      return ackPostHandler(req);
    });

    try {
      const result = await runOfflineWorkerJobSimulation({
        roomName: room,
        workerSessionId: reservation.workerSessionId,
        reservationSecret: reservation.reservationSecret,
        simulateFailure: true,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.acknowledged).toBe(true);

      // Verify fail-closed state
      expect(isSessionSlotAvailable()).toBe(false);
      expect(hasUncertainBlockedSessions()).toBe(true);
      expect(getActiveSession(room)?.lifecycleState).toBe('BLOCKED_UNCERTAIN_TEARDOWN');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

