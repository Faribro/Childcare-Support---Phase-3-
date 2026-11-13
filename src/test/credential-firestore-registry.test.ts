import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  authenticateUser,
  verifySessionToken,
  hashPassword,
} from '@/lib/server/sessionService';
import {
  getCredentialByIdentifier,
  checkRateLimit,
  recordAuthAttempt,
  resetRateLimits,
  saveCredentialToFirestore,
  rotateCredentialInFirestore,
  deactivateCredentialInFirestore,
  isCredentialActive,
  createMockFirestore,
  setFirestoreDbForTesting,
  resetFirestoreDb,
  getAuthAttemptCredDocId,
  getAuthAttemptIpDocId,
  EVALUATION_CREDENTIALS_COLLECTION,
  AUTH_ATTEMPTS_COLLECTION,
  EvaluationCredential,
} from '@/lib/server/credentialRegistry';
import { runMigration } from '../../scripts/migrate-credentials-to-firestore';
import { createTrainingAccount } from '../../scripts/create-training-account';

describe('Firestore Evaluation Credential Registry & Multi-Instance Lockouts (Task 2b)', () => {
  const TEST_IP = '192.168.10.45';
  let mockDb: any;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockDb = createMockFirestore();
    setFirestoreDbForTesting(mockDb);

    process.env.SESSION_SECRET = 'a_very_secure_test_session_secret_for_cryptographic_signing_32_chars_long!';
    process.env.DATA_ENGINE = 'firestore';
    process.env.APP_ENV = 'staging';
    process.env.FIRESTORE_DATABASE_ID = 'staging';
    process.env.GOOGLE_CLOUD_PROJECT = 'cs-p3-production';
    (process.env as any).NODE_ENV = 'test';

    resetRateLimits();
  });

  afterEach(() => {
    resetFirestoreDb();
    resetRateLimits();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Basic Firestore Authentication & Scoping
  // ==========================================================================
  describe('1. Basic Firestore Authentication & Verification', () => {
    it('authenticates valid credential stored in Firestore collection evaluation_credentials', async () => {
      const rawPassword = 'SecurePassword123!';
      const passwordHash = await hashPassword(rawPassword);

      const credential: EvaluationCredential = {
        id: 'eval-mh-01',
        accessIdentifier: 'STATE-MH',
        displayName: 'Maharashtra State Evaluation',
        credentialKind: 'STATE_EVALUATION',
        stateCode: 'Maharashtra',
        programmeScope: ['alliance-childcare-phase3'],
        passwordHash,
        credentialVersion: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveCredentialToFirestore(credential, mockDb);

      const authRes = await authenticateUser('STATE-MH', rawPassword, TEST_IP);
      expect(authRes.success).toBe(true);
      if (!authRes.success) return;

      expect(authRes.user.username).toBe('STATE-MH');
      expect(authRes.user.role).toBe('STATE_REVIEWER');
      expect(authRes.user.allowedStates).toEqual(['Maharashtra']);
      expect(authRes.token).toBeDefined();

      const verified = verifySessionToken(authRes.token);
      expect(verified).not.toBeNull();
      expect(verified?.username).toBe('STATE-MH');
    });

    it('rejects wrong password with 401 and generic error message', async () => {
      const rawPassword = 'ValidPassword99!';
      const passwordHash = await hashPassword(rawPassword);

      await saveCredentialToFirestore(
        {
          id: 'eval-wb-01',
          accessIdentifier: 'STATE-WB',
          displayName: 'West Bengal State Evaluation',
          credentialKind: 'STATE_EVALUATION',
          stateCode: 'West Bengal',
          programmeScope: ['alliance-childcare-phase3'],
          passwordHash,
          credentialVersion: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        mockDb
      );

      const authRes = await authenticateUser('STATE-WB', 'WrongPassword!', TEST_IP);
      expect(authRes.success).toBe(false);
      if (!authRes.success) {
        expect(authRes.statusCode).toBe(401);
        expect(authRes.error).toBe('Invalid username or password.');
      }
    });

    it('rejects unknown user with identical 401 and generic error message (user enumeration prevention)', async () => {
      const authRes = await authenticateUser('NON-EXISTENT-USER', 'SomePassword123!', TEST_IP);
      expect(authRes.success).toBe(false);
      if (!authRes.success) {
        expect(authRes.statusCode).toBe(401);
        expect(authRes.error).toBe('Invalid username or password.');
      }
    });

    it('rejects deactivated Firestore credential during authentication', async () => {
      const rawPassword = 'ActivePassword1!';
      const passwordHash = await hashPassword(rawPassword);

      const cred: EvaluationCredential = {
        id: 'eval-dl-01',
        accessIdentifier: 'STATE-DL',
        displayName: 'Delhi State Evaluation',
        credentialKind: 'STATE_EVALUATION',
        stateCode: 'Delhi',
        programmeScope: ['alliance-childcare-phase3'],
        passwordHash,
        credentialVersion: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveCredentialToFirestore(cred, mockDb);

      // Verify active
      expect(await isCredentialActive('STATE-DL')).toBe(true);

      // Deactivate in Firestore
      await deactivateCredentialInFirestore('STATE-DL', mockDb);
      expect(await isCredentialActive('STATE-DL')).toBe(false);

      const authRes = await authenticateUser('STATE-DL', rawPassword, TEST_IP);
      expect(authRes.success).toBe(false);
    });

    it('supports credential rotation and version tracking in Firestore', async () => {
      const initialPassword = 'InitialPassword1!';
      const newPassword = 'RotatedPassword2!';

      const initialHash = await hashPassword(initialPassword);
      const newHash = await hashPassword(newPassword);

      await saveCredentialToFirestore(
        {
          id: 'eval-ka-01',
          accessIdentifier: 'STATE-KA',
          displayName: 'Karnataka State Evaluation',
          credentialKind: 'STATE_EVALUATION',
          stateCode: 'Karnataka',
          programmeScope: ['alliance-childcare-phase3'],
          passwordHash: initialHash,
          credentialVersion: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        mockDb
      );

      // Initial login works
      const auth1 = await authenticateUser('STATE-KA', initialPassword, TEST_IP);
      expect(auth1.success).toBe(true);
      if (!auth1.success) return;

      // Rotate credential in Firestore
      const rotated = await rotateCredentialInFirestore('STATE-KA', newHash, mockDb);
      expect(rotated).not.toBeNull();
      expect(rotated?.credentialVersion).toBe(2);

      // Old password fails
      const authOld = await authenticateUser('STATE-KA', initialPassword, TEST_IP);
      expect(authOld.success).toBe(false);

      // New password succeeds
      const authNew = await authenticateUser('STATE-KA', newPassword, TEST_IP);
      expect(authNew.success).toBe(true);
      if (authNew.success) {
        expect(authNew.user.credentialVersion).toBe(2);
      }
    });
  });

  // ==========================================================================
  // 2. Multi-Instance Concurrency & Shared Lockout State
  // ==========================================================================
  describe('2. Multi-Instance Concurrency & Shared Lockout State', () => {
    it('shares lockout counter across simulated instances via Firestore collection auth_attempts', async () => {
      const targetUser = 'STATE-TN';
      const ip = '10.240.0.12';

      // Simulate Instance A recording 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await recordAuthAttempt(targetUser, ip, false);
      }

      // Instance B checks rate limit: still allowed (3 < 5)
      const checkMidway = await checkRateLimit(targetUser, ip);
      expect(checkMidway.allowed).toBe(true);

      // Simulate Instance B recording 2 more failed attempts (Total = 5)
      await recordAuthAttempt(targetUser, ip, false);
      await recordAuthAttempt(targetUser, ip, false);

      // Now both instances check rate limit: both must see lockout!
      const checkInstanceA = await checkRateLimit(targetUser, ip);
      expect(checkInstanceA.allowed).toBe(false);
      expect(checkInstanceA.retryAfterSeconds).toBeGreaterThan(0);
      expect(checkInstanceA.reason).toContain('temporarily locked');

      const checkInstanceB = await checkRateLimit(targetUser, ip);
      expect(checkInstanceB.allowed).toBe(false);
      expect(checkInstanceB.retryAfterSeconds).toBe(checkInstanceA.retryAfterSeconds);

      // Verify attempts document has expiresAt TTL field
      const attemptsDocSnap = await mockDb.collection(AUTH_ATTEMPTS_COLLECTION).doc(getAuthAttemptCredDocId(targetUser, ip)).get();
      expect(attemptsDocSnap.exists).toBe(true);
      const docData = attemptsDocSnap.data();
      expect(docData.attemptsCount).toBe(5);
      expect(docData.expiresAt).toBeInstanceOf(Date);
      expect(docData.lockoutUntil).toBeGreaterThan(Date.now());
    });

    it('enforces 429 lockout during authenticateUser when shared attempts reach threshold', async () => {
      const targetUser = 'LEADERSHIP-ALL';
      const ip = '172.16.5.99';

      // 4 failed attempts: allowed with 401
      for (let i = 0; i < 4; i++) {
        const res = await authenticateUser(targetUser, 'WrongPassword', ip);
        expect(res.success).toBe(false);
        if (!res.success) expect(res.statusCode).toBe(401);
      }

      // 5th failed attempt: triggers lockout
      const res5 = await authenticateUser(targetUser, 'WrongPassword', ip);
      expect(res5.success).toBe(false);

      // 6th attempt: rejected with 429
      const res6 = await authenticateUser(targetUser, 'WrongPassword', ip);
      expect(res6.success).toBe(false);
      if (!res6.success) {
        expect(res6.statusCode).toBe(429);
        expect(res6.error).toContain('temporarily locked');
      }
    });

    it('clears credential-specific lockout on successful login while preserving IP safety', async () => {
      const rawPassword = 'ValidPassword77!';
      const passwordHash = await hashPassword(rawPassword);

      await saveCredentialToFirestore(
        {
          id: 'eval-gj-01',
          accessIdentifier: 'STATE-GJ',
          displayName: 'Gujarat State Evaluation',
          credentialKind: 'STATE_EVALUATION',
          stateCode: 'Gujarat',
          programmeScope: ['alliance-childcare-phase3'],
          passwordHash,
          credentialVersion: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        mockDb
      );

      const ip = '10.0.1.55';

      // 2 failed attempts
      await authenticateUser('STATE-GJ', 'BadPass', ip);
      await authenticateUser('STATE-GJ', 'BadPass', ip);

      // Credential attempt doc exists
      const credDocBefore = await mockDb.collection(AUTH_ATTEMPTS_COLLECTION).doc(getAuthAttemptCredDocId('STATE-GJ', ip)).get();
      expect(credDocBefore.exists).toBe(true);

      // Successful login
      const successRes = await authenticateUser('STATE-GJ', rawPassword, ip);
      expect(successRes.success).toBe(true);

      // Credential attempt doc is deleted
      const credDocAfter = await mockDb.collection(AUTH_ATTEMPTS_COLLECTION).doc(getAuthAttemptCredDocId('STATE-GJ', ip)).get();
      expect(credDocAfter.exists).toBe(false);

      // Global IP doc remains tracked
      const ipDoc = await mockDb.collection(AUTH_ATTEMPTS_COLLECTION).doc(getAuthAttemptIpDocId(ip)).get();
      expect(ipDoc.exists).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Environment Isolation & Production Fail-Closed Policy
  // ==========================================================================
  describe('3. Environment Isolation & Production Fail-Closed Policy', () => {
    it('fails closed with 503 when Firestore is unreachable in production', async () => {
      process.env.APP_ENV = 'production';
      process.env.FIRESTORE_DATABASE_ID = '(default)';

      // Simulate Firestore database outage in production
      const failingDb = {
        collection: () => {
          throw new Error('UNAVAILABLE: Cloud Firestore connection failed');
        },
      };
      setFirestoreDbForTesting(failingDb);

      const authRes = await authenticateUser('STATE-MH', 'AnyPassword', TEST_IP);
      expect(authRes.success).toBe(false);
      if (!authRes.success) {
        expect(authRes.statusCode).toBe(503);
        expect(authRes.error).toContain('Authentication service temporarily unavailable');
      }
    });

    it('blocks environment-variable credential fallback in production unless ALLOW_ENV_CREDENTIAL_FALLBACK=true', async () => {
      process.env.APP_ENV = 'production';
      process.env.FIRESTORE_DATABASE_ID = '(default)';
      delete process.env.ALLOW_ENV_CREDENTIAL_FALLBACK;
      process.env.INITIAL_REV_MH_PWD = 'EnvConfiguredPassword123!';

      // Empty Firestore database: credential does not exist in Firestore
      const authRes = await authenticateUser('STATE-MH', 'EnvConfiguredPassword123!', TEST_IP);
      expect(authRes.success).toBe(false);
      if (!authRes.success) {
        // Fallback is blocked; returns 401
        expect(authRes.statusCode).toBe(401);
      }

      // When explicitly allowed via flag, fallback is permitted
      process.env.ALLOW_ENV_CREDENTIAL_FALLBACK = 'true';
      const authResWithFlag = await authenticateUser('STATE-MH', 'EnvConfiguredPassword123!', TEST_IP);
      expect(authResWithFlag.success).toBe(true);
    });

    it('refuses to start staging against (default) Firestore database', async () => {
      process.env.APP_ENV = 'staging';
      process.env.FIRESTORE_DATABASE_ID = '(default)';
      resetFirestoreDb();

      await expect(getCredentialByIdentifier('STATE-MH')).rejects.toThrow(
        /Refusing to start staging environment/
      );
    });

    it('refuses to start production against staging Firestore database', async () => {
      process.env.APP_ENV = 'production';
      process.env.FIRESTORE_DATABASE_ID = 'staging';
      resetFirestoreDb();

      await expect(getCredentialByIdentifier('STATE-MH')).rejects.toThrow(
        /Refusing to start production environment/
      );
    });
  });

  // ==========================================================================
  // 4. Migration & Training Account Scripts
  // ==========================================================================
  describe('4. Migration & Training Account Utilities', () => {
    it('executes credential migration dry run without writing records to Firestore', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      const result = await runMigration({
        execute: false,
        appEnv: 'staging',
        databaseId: 'staging',
      });

      expect(result.executed).toBe(false);
      expect(result.count).toBeGreaterThan(0);

      // Verify no records written to mockDb
      const checkSnap = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc('STATE-MH').get();
      expect(checkSnap.exists).toBe(false);

      // Verify no sensitive hashes logged
      const loggedText = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(loggedText).not.toContain('$argon2id$');
    });

    it('executes credential migration with --execute and populates Firestore collection', async () => {
      const result = await runMigration({
        execute: true,
        appEnv: 'staging',
        databaseId: 'staging',
      });

      expect(result.executed).toBe(true);
      expect(result.count).toBe(10); // 8 states + leadership + admin

      // Verify records exist in mockDb
      const mhSnap = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc('STATE-MH').get();
      expect(mhSnap.exists).toBe(true);
      expect(mhSnap.data().accessIdentifier).toBe('STATE-MH');
      expect(mhSnap.data().isActive).toBe(true);

      const leadSnap = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc('LEADERSHIP-ALL').get();
      expect(leadSnap.exists).toBe(true);
      expect(leadSnap.data().credentialKind).toBe('LEADERSHIP_EVALUATION');
    });

    it('creates isolated synthetic training account in staging database', async () => {
      const result = await createTrainingAccount({
        identifier: 'STATE-TR',
        appEnv: 'staging',
        databaseId: 'staging',
      });

      expect(result.identifier).toBe('STATE-TR');
      expect(result.plainPassword.length).toBe(24);

      // Verify record in Firestore
      const trSnap = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc('STATE-TR').get();
      expect(trSnap.exists).toBe(true);
      expect(trSnap.data().accessIdentifier).toBe('STATE-TR');
      expect(trSnap.data().stateCode).toBe('Training');

      // Test logging in with generated credentials
      const authRes = await authenticateUser('STATE-TR', result.plainPassword, TEST_IP);
      expect(authRes.success).toBe(true);
      if (authRes.success) {
        expect(authRes.user.allowedStates).toEqual(['Training']);
      }
    });

    it('refuses to create training account in production environment', async () => {
      await expect(
        createTrainingAccount({
          appEnv: 'production',
          databaseId: '(default)',
        })
      ).rejects.toThrow(/SECURITY_GATE_VIOLATION/);
    });
  });

  // ==========================================================================
  // 5. Zero Secret Exposure Guarantee
  // ==========================================================================
  describe('5. Zero Secret Exposure Guarantee', () => {
    it('ensures no passwords, hashes, or salts are logged across authentication operations', async () => {
      const rawPassword = 'SecretP@ssw0rd!999';
      const passwordHash = await hashPassword(rawPassword);

      await saveCredentialToFirestore(
        {
          id: 'eval-up-01',
          accessIdentifier: 'STATE-UP',
          displayName: 'Uttar Pradesh State Evaluation',
          credentialKind: 'STATE_EVALUATION',
          stateCode: 'Uttar Pradesh',
          programmeScope: ['alliance-childcare-phase3'],
          passwordHash,
          credentialVersion: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        mockDb
      );

      const logSpy = vi.spyOn(console, 'log');
      const infoSpy = vi.spyOn(console, 'info');
      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');

      // Run multiple operations
      await authenticateUser('STATE-UP', rawPassword, TEST_IP);
      await authenticateUser('STATE-UP', 'WrongPassword!', TEST_IP);
      await authenticateUser('UNKNOWN-ID', 'WrongPassword!', TEST_IP);

      const allOutput = [
        ...logSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]
        .map((args) => args.join(' '))
        .join('\n');

      expect(allOutput).not.toContain(rawPassword);
      expect(allOutput).not.toContain('WrongPassword!');
      expect(allOutput).not.toContain(passwordHash);
      expect(allOutput).not.toContain('$argon2id$');
    });
  });
});
