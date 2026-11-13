import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  FirestoreLeaderAuthStore,
  LeaderAuthStore,
  LeaderAuthChallengeRecord,
  CHALLENGE_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
  LEADER_OTP_CHALLENGES_COLLECTION,
  LEADERSHIP_SESSIONS_COLLECTION,
  AUTH_ATTEMPTS_COLLECTION,
  setLeaderAuthStoreForTesting,
} from '@/lib/server/leaderAuthStore';
import {
  FirestoreOnboardingStore,
  OnboardingStore,
  STATE_TEAM_REGISTRATIONS_COLLECTION,
  STATE_TEAM_INVITATIONS_COLLECTION,
  STATE_TEAM_CHALLENGES_COLLECTION,
  FIELD_USER_PROFILES_COLLECTION,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import { createInvitationVerifierPair } from '@/lib/server/invitationCrypto';
import {
  FirestoreExportConfirmationStore,
  EXPORT_PREVIEW_CONTRACTS_COLLECTION,
  EXPORT_DELIVERY_JOBS_COLLECTION,
} from '@/features/leadership-reporting/export-confirmation-store';
import {
  FirestoreReportingSessionRepository,
  REPORTING_SESSIONS_COLLECTION,
} from '@/features/leadership-reporting/session-repository';
import {
  createMockFirestore,
  setFirestoreDbForTesting,
  resetFirestoreDb,
  sanitizeIpForDocId,
} from '@/lib/server/credentialRegistry';
import { validateFirestoreDatabaseEnvironment } from '@/lib/server/firestoreSubmissionAdapter';
import { GET as getStateSrs } from '@/app/api/reference-data/state-srs/route';
import { NextRequest } from 'next/server';
import type { LeaderIdentity } from '@/lib/server/leaderIdentityStore';
import type { ExportPreviewContract, ReportingSession } from '@/features/leadership-reporting/types';

describe('Phase B: Firestore Distributed Stores & Multi-Instance Synchronization', () => {
  let sharedMockDb: any;
  const originalEnv = { ...process.env };
  const TEST_IP = '203.0.113.195';

  const testLeader: LeaderIdentity = {
    id: 'lead-test-01',
    email: 'leader.test@allianceindia.org',
    name: 'Dr. Test Leader',
    title: 'National Director',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isActive: true,
    authVersion: 1,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sharedMockDb = createMockFirestore();
    setFirestoreDbForTesting(sharedMockDb);

    process.env.DATA_ENGINE = 'firestore';
    process.env.APP_ENV = 'staging';
    process.env.FIRESTORE_DATABASE_ID = 'staging';
    process.env.GOOGLE_CLOUD_PROJECT = 'cs-p3-production';
    (process.env as any).NODE_ENV = 'test';
  });

  afterEach(() => {
    resetFirestoreDb();
    setLeaderAuthStoreForTesting(null);
    setOnboardingStoreForTesting(null);
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Leadership Auth Multi-Instance Synchronization (B1 & B6)
  // ==========================================================================
  describe('1. Leadership Auth: Multi-Instance Synchronization & Lifecycle', () => {
    it('issues OTP on simulated instance A and successfully verifies on simulated instance B', async () => {
      // Simulate two separate Cloud Run instances sharing the same Firestore database
      const instanceAStore = new FirestoreLeaderAuthStore(sharedMockDb);
      const instanceBStore = new FirestoreLeaderAuthStore(sharedMockDb);

      const plainOtp = '482910';
      const codeHash = crypto.createHash('sha256').update(plainOtp).digest('hex');
      const challengeId = crypto.randomUUID();
      const now = Date.now();
      const deviceBindingHash = crypto.createHash('sha256').update('device-uuid-test').digest('hex');

      const challenge: LeaderAuthChallengeRecord = {
        challengeId,
        leaderId: testLeader.id,
        email: testLeader.email,
        codeHash,
        deviceBindingHash,
        userAgentHash: 'ua-hash-test',
        ip: TEST_IP,
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      };

      // Instance A creates the challenge in Firestore
      await instanceAStore.createChallenge(challenge);

      // Instance B retrieves the pending challenge by email
      const pendingOnB = await instanceBStore.getPendingChallenge(testLeader.email);
      expect(pendingOnB).not.toBeNull();
      expect(pendingOnB?.challengeId).toBe(challengeId);
      expect(pendingOnB?.codeHash).toBe(codeHash);

      // Instance B verifies the code and establishes session
      const verifyResult = await instanceBStore.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: codeHash,
        deviceBindingHash,
        leader: testLeader,
        now: now + 1000,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.session).toBeDefined();
      expect(verifyResult.session?.leaderId).toBe(testLeader.id);
      expect(verifyResult.statusCode).toBe(200);

      // Verify challenge is marked consumed on Instance A as well
      const challengeOnA = await instanceAStore.getPendingChallengeById(challengeId);
      expect(challengeOnA).toBeNull(); // consumed challenge is no longer returned as pending
    });

    it('rejects OTP reuse (single-use) across instances', async () => {
      const instanceAStore = new FirestoreLeaderAuthStore(sharedMockDb);
      const instanceBStore = new FirestoreLeaderAuthStore(sharedMockDb);

      const plainOtp = '112233';
      const codeHash = crypto.createHash('sha256').update(plainOtp).digest('hex');
      const challengeId = crypto.randomUUID();
      const now = Date.now();
      const deviceBindingHash = crypto.createHash('sha256').update('device-binding-1').digest('hex');

      await instanceAStore.createChallenge({
        challengeId,
        leaderId: testLeader.id,
        email: testLeader.email,
        codeHash,
        deviceBindingHash,
        userAgentHash: 'ua-hash',
        ip: TEST_IP,
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      });

      // First verification on Instance A succeeds
      const first = await instanceAStore.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: codeHash,
        deviceBindingHash,
        leader: testLeader,
        now,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });
      expect(first.success).toBe(true);

      // Duplicate attempt on Instance B fails (already consumed)
      const second = await instanceBStore.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: codeHash,
        deviceBindingHash,
        leader: testLeader,
        now: now + 500,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });
      expect(second.success).toBe(false);
      expect(second.statusCode).toBe(401);
      expect(second.error).toMatch(/already consumed|no active verification code/i);
    });

    it('rejects expired OTP after 10-minute TTL across instances', async () => {
      const instanceAStore = new FirestoreLeaderAuthStore(sharedMockDb);
      const instanceBStore = new FirestoreLeaderAuthStore(sharedMockDb);

      const plainOtp = '998877';
      const codeHash = crypto.createHash('sha256').update(plainOtp).digest('hex');
      const challengeId = crypto.randomUUID();
      const now = Date.now();
      const deviceBindingHash = crypto.createHash('sha256').update('device-binding-2').digest('hex');

      await instanceAStore.createChallenge({
        challengeId,
        leaderId: testLeader.id,
        email: testLeader.email,
        codeHash,
        deviceBindingHash,
        userAgentHash: 'ua-hash',
        ip: TEST_IP,
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      });

      // 11 minutes later (past TTL)
      const expiredNow = now + 11 * 60 * 1000;
      const result = await instanceBStore.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: codeHash,
        deviceBindingHash,
        leader: testLeader,
        now: expiredNow,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toMatch(/expired/i);
    });

    it('enforces single active session per leader: establishing session on instance B revokes instance A session', async () => {
      const instanceAStore = new FirestoreLeaderAuthStore(sharedMockDb);
      const instanceBStore = new FirestoreLeaderAuthStore(sharedMockDb);

      const deviceBindingHash = crypto.createHash('sha256').update('device-binding-3').digest('hex');
      const now = Date.now();

      // Issue and consume challenge 1 on Instance A
      const challengeId1 = crypto.randomUUID();
      const codeHash1 = crypto.createHash('sha256').update('111111').digest('hex');
      await instanceAStore.createChallenge({
        challengeId: challengeId1,
        leaderId: testLeader.id,
        email: testLeader.email,
        codeHash: codeHash1,
        deviceBindingHash,
        userAgentHash: 'ua',
        ip: TEST_IP,
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      });
      const res1 = await instanceAStore.consumeChallengeAndCreateSession({
        challengeId: challengeId1,
        submittedCodeHash: codeHash1,
        deviceBindingHash,
        leader: testLeader,
        now,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });
      const session1Id = res1.session!.sessionId;

      // Session 1 is active on Instance B
      const checkB1 = await instanceBStore.getSession(session1Id);
      expect(checkB1).not.toBeNull();
      expect(checkB1?.sessionId).toBe(session1Id);

      // Now issue and consume challenge 2 on Instance B for the SAME leader
      const challengeId2 = crypto.randomUUID();
      const codeHash2 = crypto.createHash('sha256').update('222222').digest('hex');
      await instanceBStore.createChallenge({
        challengeId: challengeId2,
        leaderId: testLeader.id,
        email: testLeader.email,
        codeHash: codeHash2,
        deviceBindingHash,
        userAgentHash: 'ua',
        ip: TEST_IP,
        createdAt: now + 5000,
        expiresAt: now + 5000 + CHALLENGE_TTL_MS,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      });
      const res2 = await instanceBStore.consumeChallengeAndCreateSession({
        challengeId: challengeId2,
        submittedCodeHash: codeHash2,
        deviceBindingHash,
        leader: testLeader,
        now: now + 6000,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });
      const session2Id = res2.session!.sessionId;
      expect(session2Id).not.toBe(session1Id);

      // Verify Session 1 was atomically revoked across all instances
      const session1OnA = await instanceAStore.getSession(session1Id);
      expect(session1OnA).toBeNull(); // revoked sessions return null

      // Session 2 is active on Instance A
      const session2OnA = await instanceAStore.getSession(session2Id);
      expect(session2OnA).not.toBeNull();
      expect(session2OnA?.sessionId).toBe(session2Id);
    });

    it('revokes session on explicit logout across instances', async () => {
      const instanceAStore = new FirestoreLeaderAuthStore(sharedMockDb);
      const instanceBStore = new FirestoreLeaderAuthStore(sharedMockDb);

      const deviceBindingHash = crypto.createHash('sha256').update('device-binding-4').digest('hex');
      const now = Date.now();
      const challengeId = crypto.randomUUID();
      const codeHash = crypto.createHash('sha256').update('333333').digest('hex');

      await instanceAStore.createChallenge({
        challengeId,
        leaderId: testLeader.id,
        email: testLeader.email,
        codeHash,
        deviceBindingHash,
        userAgentHash: 'ua',
        ip: TEST_IP,
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      });

      const res = await instanceAStore.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: codeHash,
        deviceBindingHash,
        leader: testLeader,
        now,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });

      const sessionId = res.session!.sessionId;

      // Instance B revokes the session (user clicked logout on Instance B)
      await instanceBStore.revokeSession(sessionId);

      // Instance A immediately sees the revocation
      const sessionOnA = await instanceAStore.getSession(sessionId);
      expect(sessionOnA).toBeNull();
    });

    it('enforces brute-force lockout after 5 incorrect code attempts across instances', async () => {
      const instanceAStore = new FirestoreLeaderAuthStore(sharedMockDb);
      const instanceBStore = new FirestoreLeaderAuthStore(sharedMockDb);

      const realOtp = '555555';
      const wrongOtp = '000000';
      const realCodeHash = crypto.createHash('sha256').update(realOtp).digest('hex');
      const wrongCodeHash = crypto.createHash('sha256').update(wrongOtp).digest('hex');
      const challengeId = crypto.randomUUID();
      const now = Date.now();
      const deviceBindingHash = crypto.createHash('sha256').update('device-binding-5').digest('hex');

      await instanceAStore.createChallenge({
        challengeId,
        leaderId: testLeader.id,
        email: testLeader.email,
        codeHash: realCodeHash,
        deviceBindingHash,
        userAgentHash: 'ua',
        ip: TEST_IP,
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      });

      // Fail 3 times on Instance A
      for (let i = 1; i <= 3; i++) {
        const res = await instanceAStore.consumeChallengeAndCreateSession({
          challengeId,
          submittedCodeHash: wrongCodeHash,
          deviceBindingHash,
          leader: testLeader,
          now,
          absoluteLifetimeMs: 8 * 60 * 60 * 1000,
        });
        expect(res.success).toBe(false);
        expect(res.statusCode).toBe(401);
      }

      // Fail 2 times on Instance B (reaching 5 total attempts)
      const res4 = await instanceBStore.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: wrongCodeHash,
        deviceBindingHash,
        leader: testLeader,
        now,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });
      expect(res4.success).toBe(false);

      const res5 = await instanceBStore.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: wrongCodeHash,
        deviceBindingHash,
        leader: testLeader,
        now,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });
      expect(res5.success).toBe(false);
      expect(res5.statusCode).toBe(429);
      expect(res5.error).toMatch(/locked/i);

      // Even correct OTP submitted on Instance A now fails with 429
      const lockedAttempt = await instanceAStore.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: realCodeHash,
        deviceBindingHash,
        leader: testLeader,
        now,
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });
      expect(lockedAttempt.success).toBe(false);
      expect(lockedAttempt.statusCode).toBe(429);
    });

    it('enforces shared IP rate limiting (3 requests in 15 min) across instances', async () => {
      const instanceAStore = new FirestoreLeaderAuthStore(sharedMockDb);
      const instanceBStore = new FirestoreLeaderAuthStore(sharedMockDb);

      const ipKey = 'client-ip-198.51.100.22';
      const now = Date.now();

      // Request 1 on Instance A: allowed
      const r1 = await instanceAStore.checkAndRecordRateLimit(ipKey, now);
      expect(r1.allowed).toBe(true);

      // Request 2 on Instance B: allowed
      const r2 = await instanceBStore.checkAndRecordRateLimit(ipKey, now + 1000);
      expect(r2.allowed).toBe(true);

      // Request 3 on Instance A: allowed
      const r3 = await instanceAStore.checkAndRecordRateLimit(ipKey, now + 2000);
      expect(r3.allowed).toBe(true);

      // Request 4 on Instance B: blocked with 429
      const r4 = await instanceBStore.checkAndRecordRateLimit(ipKey, now + 3000);
      expect(r4.allowed).toBe(false);
      expect(r4.retryAfterSeconds).toBeGreaterThan(0);
      expect(r4.reason).toMatch(/too many verification code requests/i);
    });
  });

  // ==========================================================================
  // 2. Onboarding Multi-Instance Synchronization & Atomic Redemptions (B2)
  // ==========================================================================
  describe('2. Onboarding: Multi-Instance Synchronization & Atomic Redemptions', () => {
    it('creates invitation on instance A, validates on instance B, and redeems atomically with maxRedemptions guard', async () => {
      const instanceA = new FirestoreOnboardingStore(sharedMockDb);
      const instanceB = new FirestoreOnboardingStore(sharedMockDb);

      const plainCode = 'TEST-CODE-123';
      const { salt, verifier } = createInvitationVerifierPair(plainCode);

      // Create invitation with maxRedemptions = 2 on Instance A
      const inv = await instanceA.createInvitation({
        stateTeamId: 'coord-mh-01',
        state: 'Maharashtra',
        salt,
        verifier,
        maxRedemptions: 2,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      expect(inv.id).toBeDefined();

      // Instance B validates the invitation code
      const validation = await instanceB.findAndValidateInvitation(plainCode, 'Maharashtra');
      expect(validation.valid).toBe(true);
      expect(validation.invitation?.id).toBe(inv.id);

      // Redemption 1 on Instance A succeeds
      const r1 = await instanceA.atomicRedeemInvitation(inv.id);
      expect(r1.success).toBe(true);

      // Redemption 2 on Instance B succeeds
      const r2 = await instanceB.atomicRedeemInvitation(inv.id);
      expect(r2.success).toBe(true);

      // Redemption 3 on Instance A fails (limit exceeded)
      const r3 = await instanceA.atomicRedeemInvitation(inv.id);
      expect(r3.success).toBe(false);
      expect(r3.error).toMatch(/fully redeemed/i);
    });

    it('creates state team registration on instance A and approves on instance B', async () => {
      const instanceA = new FirestoreOnboardingStore(sharedMockDb);
      const instanceB = new FirestoreOnboardingStore(sharedMockDb);

      const reg = await instanceA.createStateTeamRegistration({
        firstName: 'Sunita',
        lastName: 'Patil',
        workEmail: 'sunita.patil@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India MH',
      });

      expect(reg.status).toBe('PENDING_APPROVAL');

      // Instance B approves registration
      const approved = await instanceB.approveStateTeamRegistration(reg.id, 'admin-user');
      expect(approved).toBe(true);

      // Instance A reads updated registration
      const fetched = await instanceA.getStateTeamRegistrationById(reg.id);
      expect(fetched?.status).toBe('APPROVED');
      expect(fetched?.approvedBy).toBe('admin-user');
    });

    it('creates field user profile on instance A and retrieves on instance B', async () => {
      const instanceA = new FirestoreOnboardingStore(sharedMockDb);
      const instanceB = new FirestoreOnboardingStore(sharedMockDb);

      const profile = await instanceA.createFieldUserProfile({
        googleSub: 'google-sub-998877',
        googleEmail: 'field.user@example.org',
        firstName: 'Ramesh',
        lastName: 'Kulkarni',
        assignedState: 'Maharashtra',
        assignedDistrict: 'Pune',
        invitationId: 'inv-test-01',
      });

      const onB = await instanceB.getFieldUserProfileByGoogleSub('google-sub-998877');
      expect(onB).not.toBeNull();
      expect(onB?.firstName).toBe('Ramesh');
      expect(onB?.assignedDistrict).toBe('Pune');
    });
  });

  // ==========================================================================
  // 3. Export Confirmation Store & Atomic Two-Phase Confirmation (B3)
  // ==========================================================================
  describe('3. Export Confirmation Store: Two-Phase Confirmation & Single-Use', () => {
    it('registers preview contract on instance A, confirms atomically on instance B, and rejects duplicate re-confirmation', async () => {
      const instanceA = new FirestoreExportConfirmationStore(sharedMockDb);
      const instanceB = new FirestoreExportConfirmationStore(sharedMockDb);

      const exportId = 'exp_test_778899';
      const shortCode = '778899';
      const parametersHash = crypto.createHash('sha256').update('mock-parameters-payload').digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const previewContract: ExportPreviewContract = {
        exportId,
        reportType: 'COHORT_SUMMARY',
        title: 'Q3 Surveillance Export',
        stateFilter: 'Maharashtra',
        year: 2026,
        month: 'ALL',
        dateBasis: 'VISIT_DATE',
        dateField: 'visit_date',
        uniqueBeneficiaries: 120,
        totalAssessments: 340,
        columns: ['childId', 'nutritionCurrent'],
        recipientUserId: testLeader.id,
        recipientEmailMasked: 'l****@allianceindia.org',
        recipientEmailExact: testLeader.email,
        confirmationCode: shortCode,
        immutableParametersHash: parametersHash,
        expiresAt,
      };

      // Instance A registers preview contract
      await instanceA.registerPreviewContract(previewContract);

      // Instance B confirms export atomically using short code and parameter hash
      const confirmResult = await instanceB.consumeConfirmationTokenAtomic({
        exportId,
        parametersHash,
        userId: testLeader.id,
        userConfirmationText: `CONFIRM ${shortCode}`,
        caller: {
          userId: testLeader.id,
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
      });

      expect(confirmResult.success).toBe(true);
      expect(confirmResult.status).toBe('CONSUMED');
      expect(confirmResult.job).toBeDefined();
      expect(confirmResult.job?.status).toBe('QUEUED');
      expect(confirmResult.job?.deliveryTarget).toBe('APPS_SCRIPT_EMAIL_DISPATCHER');

      // Duplicate confirmation on Instance A is rejected (single-use replay prevention)
      const duplicateConfirm = await instanceA.consumeConfirmationTokenAtomic({
        exportId,
        parametersHash,
        userId: testLeader.id,
        userConfirmationText: `CONFIRM ${shortCode}`,
        caller: {
          userId: testLeader.id,
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
      });

      expect(duplicateConfirm.success).toBe(false);
      expect(duplicateConfirm.status).toBe('ALREADY_CONSUMED');
      expect(duplicateConfirm.errorReason).toMatch(/already been confirmed|replay_rejected/i);
    });

    it('rejects confirmation when parameters hash does not match contract', async () => {
      const instance = new FirestoreExportConfirmationStore(sharedMockDb);
      const exportId = 'exp_tamper_001';
      const shortCode = '123456';
      const legitimateHash = crypto.createHash('sha256').update('original').digest('hex');
      const tamperedHash = crypto.createHash('sha256').update('tampered').digest('hex');

      await instance.registerPreviewContract({
        exportId,
        reportType: 'COHORT_SUMMARY',
        title: 'Tamper Test',
        stateFilter: null,
        year: 2026,
        month: 'ALL',
        dateBasis: 'VISIT_DATE',
        dateField: 'visit_date',
        uniqueBeneficiaries: 10,
        totalAssessments: 10,
        columns: ['childId'],
        recipientUserId: testLeader.id,
        recipientEmailMasked: 'l****@allianceindia.org',
        recipientEmailExact: testLeader.email,
        confirmationCode: shortCode,
        immutableParametersHash: legitimateHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const res = await instance.consumeConfirmationTokenAtomic({
        exportId,
        parametersHash: tamperedHash,
        userId: testLeader.id,
        userConfirmationText: shortCode,
        caller: {
          userId: testLeader.id,
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('MISMATCH');
    });
  });

  // ==========================================================================
  // 4. Reporting Sessions Persistence (B4)
  // ==========================================================================
  describe('4. Leadership Reporting Sessions: Multi-Instance Persistence', () => {
    it('saves session on instance A, retrieves on instance B, and deletes on instance A', async () => {
      const instanceA = new FirestoreReportingSessionRepository(sharedMockDb);
      const instanceB = new FirestoreReportingSessionRepository(sharedMockDb);

      const userId = 'user-reporting-01';
      const mockSession: ReportingSession = {
        sessionId: 'session-xyz-123',
        ownerUserId: userId,
        callerScope: {
          userId,
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
        activeStateFilter: 'Maharashtra',
        activeDateBasis: 'VISIT_DATE',
        confirmedYear: 2026,
        confirmedDateBasis: 'VISIT_DATE',
        confirmedYearExplicitlyClarified: true,
        confirmedDateBasisExplicitlyClarified: true,
        isConfirmedPolicy: true,
        pendingClarification: null,
        pendingExport: null,
        lastCohortResult: null,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Show me Maharashtra data',
            timestamp: new Date().toISOString(),
            isSynthetic: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Instance A saves session
      await instanceA.saveSession(userId, mockSession);

      // Instance B retrieves session
      const fetched = await instanceB.getSession(userId);
      expect(fetched).not.toBeNull();
      expect(fetched?.sessionId).toBe('session-xyz-123');
      expect(fetched?.activeStateFilter).toBe('Maharashtra');
      expect(fetched?.messages).toHaveLength(1);

      // Instance A deletes session
      await instanceA.deleteSession(userId);

      // Instance B sees session is gone
      const afterDelete = await instanceB.getSession(userId);
      expect(afterDelete).toBeNull();
    });
  });

  // ==========================================================================
  // 5. Fail-Closed in Production When Firestore is Unreachable (B1, B2, B3, B4)
  // ==========================================================================
  describe('5. Production Fail-Closed Policy: 503 on Firestore Outage', () => {
    it('fails closed when Firestore throws in production mode across all stores', async () => {
      process.env.APP_ENV = 'production';
      process.env.FIRESTORE_DATABASE_ID = '(default)';
      (process.env as any).NODE_ENV = 'production';

      const brokenDb = {
        collection() {
          throw new Error('Cloud Firestore connection timed out (UNAVAILABLE)');
        },
        async runTransaction() {
          throw new Error('Cloud Firestore transaction aborted (UNAVAILABLE)');
        },
      };

      // 1. LeaderAuthStore fails closed
      const leaderStore = new FirestoreLeaderAuthStore(brokenDb);
      await expect(
        leaderStore.checkAndRecordRateLimit('test-key', Date.now())
      ).rejects.toThrow(/UNAVAILABLE/i);

      // 2. OnboardingStore fails closed
      const onboardingStore = new FirestoreOnboardingStore(brokenDb);
      await expect(
        onboardingStore.checkRateLimit('test-key', Date.now(), 5, 60000)
      ).rejects.toThrow(/UNAVAILABLE/i);

      // 3. ExportConfirmationStore fails closed
      const exportStore = new FirestoreExportConfirmationStore(brokenDb);
      await expect(
        exportStore.registerPreviewContract({
          exportId: 'test',
          expiresAt: new Date().toISOString(),
        } as any)
      ).rejects.toThrow(/UNAVAILABLE/i);

      // 4. ReportingSessionRepository fails closed
      const sessionRepo = new FirestoreReportingSessionRepository(brokenDb);
      await expect(
        sessionRepo.getSession('test-user')
      ).rejects.toThrow(/UNAVAILABLE/i);
    });
  });

  // ==========================================================================
  // 6. Database Environment Isolation Guard (B6)
  // ==========================================================================
  describe('6. Environment Isolation: Refuses (default) in Staging and staging in Production', () => {
    it('refuses to run with APP_ENV=staging against database (default)', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('staging', '(default)');
      }).toThrow(/CONFIGURATION_ERROR.*staging.*\(default\)/i);
    });

    it('refuses to run with APP_ENV=production against database staging', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('production', 'staging');
      }).toThrow(/CONFIGURATION_ERROR.*production.*staging/i);
    });

    it('permits staging with database staging', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('staging', 'staging');
      }).not.toThrow();
    });

    it('permits production with database (default)', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('production', '(default)');
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 7. Zero Secret Exposure Guarantee (B6)
  // ==========================================================================
  describe('7. Zero Secret Exposure: No Passwords, OTPs, or Tokens in Captured Logs', () => {
    it('ensures raw OTP codes, session tokens, and passwords are never logged', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      const consoleInfoSpy = vi.spyOn(console, 'info');
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const consoleErrorSpy = vi.spyOn(console, 'error');

      const rawOtp = 'SecretOTP8910';
      const codeHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
      const rawSessionToken = 'raw_session_secret_token_123456';

      const store = new FirestoreLeaderAuthStore(sharedMockDb);
      const challengeId = crypto.randomUUID();

      await store.createChallenge({
        challengeId,
        leaderId: testLeader.id,
        email: testLeader.email,
        codeHash,
        deviceBindingHash: 'dev-hash',
        userAgentHash: 'ua-hash',
        ip: TEST_IP,
        createdAt: Date.now(),
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      });

      await store.consumeChallengeAndCreateSession({
        challengeId,
        submittedCodeHash: codeHash,
        deviceBindingHash: 'dev-hash',
        leader: testLeader,
        now: Date.now(),
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
      });

      const allLoggedMessages = [
        ...consoleLogSpy.mock.calls,
        ...consoleInfoSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ].flat().join(' ');

      expect(allLoggedMessages).not.toContain(rawOtp);
      expect(allLoggedMessages).not.toContain(rawSessionToken);
    });
  });

  // ==========================================================================
  // 8. State-SRs Reference Data Route (Firestore Path) (B4)
  // ==========================================================================
  describe('8. State-SRs Reference Data Route (Firestore Path)', () => {
    it('returns empty array gracefully when collection is empty or unconfigured', async () => {
      const req = new NextRequest('http://localhost:3000/api/reference-data/state-srs');
      const res = await getStateSrs(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('success');
      expect(json.data).toEqual([]);
    });

    it('returns sorted active state sub-recipients filtered by state from Firestore', async () => {
      await sharedMockDb.collection('state_sub_recipients').doc('sr-1').set({
        code: 'SR-MH-01',
        name: 'Maharashtra SR 1',
        state: 'Maharashtra',
        status: 'ACTIVE',
      });
      await sharedMockDb.collection('state_sub_recipients').doc('sr-2').set({
        code: 'SR-DL-01',
        name: 'Delhi SR 1',
        state: 'Delhi',
        status: 'ACTIVE',
      });

      const req = new NextRequest('http://localhost:3000/api/reference-data/state-srs?state=Maharashtra');
      const res = await getStateSrs(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('success');
      expect(json.data).toHaveLength(1);
      expect(json.data[0].state).toBe('Maharashtra');
    });
  });
});
