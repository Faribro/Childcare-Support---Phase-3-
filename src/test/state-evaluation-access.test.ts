import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  authenticateUser,
  verifySessionToken,
  createSessionToken,
  signSessionToken,
  resetPasswordHashCache,
} from '@/lib/server/sessionService';
import {
  initializeTestFixtures,
  registerCredential,
  rotateCredential,
  deactivateCredential,
  clearRegistry,
  getCredentialByIdentifier,
  checkRateLimit,
  recordAuthAttempt,
  resetRateLimits,
  CANONICAL_EVALUATION_STATES,
  LEADERSHIP_ACCESS_IDENTIFIER,
  ADMIN_ACCESS_IDENTIFIER,
  getTestStatePassword,
  getTestLeadershipPassword,
  getTestAdminPassword,
} from '@/lib/server/credentialRegistry';
import { resolveUserAccessScope, isStateAuthorized } from '@/lib/server/authorisation';
import { GET as getSubmissionsRoute, POST as postSubmissionsRoute } from '@/app/api/submissions/route';
import { GET as getSummaryRoute } from '@/app/api/submissions/summary/route';
import {
  GET as getSubmissionDetailRoute,
  PATCH as patchSubmissionRoute,
  DELETE as deleteSubmissionRoute,
} from '@/app/api/submissions/[submissionId]/route';
import { GET as getExportRoute } from '@/app/api/submissions/[submissionId]/export/route';
import { POST as postAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { POST as postLoginRoute } from '@/app/api/auth/login/route';
import { GET as getSessionRoute } from '@/app/api/auth/session/route';
import {
  CANONICAL_INITIAL_METADATA_ROWS,
  buildSheetRowValues,
} from '../../scripts/admin/setup-passwords-sheet-tab';

describe('State-Scoped Evaluation Access & Password-Free Form Workflows', () => {
  const TEST_IP = '192.168.1.100';
  const TEST_LEADERSHIP_PWD = process.env.INITIAL_LEADERSHIP_PWD || getTestLeadershipPassword();
  const TEST_ADMIN_PWD = process.env.INITIAL_ADMIN_PWD || getTestAdminPassword();

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'a_very_secure_test_session_secret_for_cryptographic_signing_32_chars_long!';
    (process.env as any).NODE_ENV = 'test';
    await initializeTestFixtures();
    resetRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Password-Free Field Workflow & Anonymous Read Gate
  // ==========================================================================
  describe('1. Password-Free Field Workflow & Read Isolation', () => {
    it('allows field user to submit assessment via POST without evaluation session cookie', async () => {
      const validPayload = {
        uuid: 'a0000000-0000-4000-8000-000000000001',
        clientSubmissionId: 'a0000000-0000-4000-8000-000000000001',
        interviewerName: 'Sunita Sharma',
        demographics: {
          artNumber: 'MH-PUN-2045',
          childName: 'Priyanka Sunil D.',
          dob: '2019-06-15',
          gender: 'Female',
          caregiverName: 'Sunil D.',
          caregiverRelationship: 'Father',
          caregiverPhone: '9822123456',
          district: 'Pune',
        },
        household: {
          orphanStatus: 'None',
          primaryCaregiverOccupation: 'Agricultural Labor',
          monthlyHouseholdIncome: 4500,
          rationCardType: 'BPL',
          numberOfSiblings: 2,
        },
        nutrition: {
          heightCm: 105,
          weightKg: 14.2,
          muacMm: 122,
          bilateralPittingOedema: false,
          clinicalNotes: 'Initial field screening',
        },
        education: {
          schoolEnrolled: true,
          schoolType: 'Government',
          schoolGrade: 'Standard 2',
          attendancePercentage: 85,
          supportMaterialsNeeded: ['Notebooks', 'School Uniform'],
        },
        bankDetails: {
          accountHolderName: 'Sunil D.',
          accountNumber: '987654321012',
          ifscCode: 'SBIN0001234',
          bankName: 'State Bank of India',
          branchName: 'Pune Rural',
          passbookPhotoCaptured: true,
        },
        declaration: {
          consentAcknowledged: true,
          caseworkerName: 'Sunita Sharma',
          declarationDate: '2026-09-08',
        },
      };

      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-test-field-001',
        },
        body: JSON.stringify(validPayload),
      });

      const res = await postSubmissionsRoute(req);
      // Valid payload accepted without evaluation cookie
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      expect(data.status).toBe('success');
      expect(data.acknowledged).toBe(true);
    });

    it('denies anonymous unauthenticated caller on GET /api/submissions with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: { 'x-test-unauthenticated': 'true' },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
      expect(data.message).toContain('Authentication required');
    });

    it('denies anonymous unauthenticated caller on GET /api/submissions/summary with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions/summary', {
        method: 'GET',
        headers: { 'x-test-unauthenticated': 'true' },
      });

      const res = await getSummaryRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('denies anonymous unauthenticated caller on GET /api/submissions/[id] with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'GET',
        headers: { 'x-test-unauthenticated': 'true' },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('denies anonymous unauthenticated caller on GET /api/submissions/[id]/export with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/export', {
        method: 'GET',
        headers: { 'x-test-unauthenticated': 'true' },
      });

      const res = await getExportRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('denies anonymous unauthenticated caller on POST /api/submissions/[id]/asset with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/asset', {
        method: 'POST',
        headers: { 'x-test-unauthenticated': 'true', 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetType: 'passbook' }),
      });

      const res = await postAssetRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('denies anonymous unauthenticated caller on DELETE /api/submissions/[id] with 403 FORBIDDEN', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'DELETE',
        headers: {
          'x-test-unauthenticated': 'true',
          Origin: 'http://localhost:3000',
        },
      });

      const res = await deleteSubmissionRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });
  });

  // ==========================================================================
  // 2. State-Scoped Evaluation Access & Isolation
  // ==========================================================================
  describe('2. State Evaluation Access & Geographic Isolation', () => {
    it('authenticates Maharashtra state credential and binds scope strictly to Maharashtra', async () => {
      const authResult = await authenticateUser('STATE-MH', getTestStatePassword('MH'), TEST_IP);
      expect(authResult.success).toBe(true);
      if (!authResult.success) return;

      expect(authResult.user.role).toBe('STATE_REVIEWER');
      expect(authResult.user.allowedStates).toEqual(['Maharashtra']);
      expect(authResult.user.allowedDistricts).toEqual(['*']);

      // State is verified server-side
      const tokenPayload = verifySessionToken(authResult.token);
      expect(tokenPayload).not.toBeNull();
      expect(tokenPayload?.allowedStates).toEqual(['Maharashtra']);
    });

    it('authenticates state by state name (e.g. "West Bengal") resolving to STATE-WB', async () => {
      const authResult = await authenticateUser('West Bengal', getTestStatePassword('WB'), TEST_IP);
      expect(authResult.success).toBe(true);
      if (!authResult.success) return;

      expect(authResult.user.username).toBe('STATE-WB');
      expect(authResult.user.role).toBe('STATE_REVIEWER');
      expect(authResult.user.allowedStates).toEqual(['West Bengal']);
    });

    it('prevents Maharashtra credential from accessing West Bengal records (HTTP 403 FORBIDDEN_SCOPE)', async () => {
      const mhAuth = await authenticateUser('STATE-MH', getTestStatePassword('MH'), TEST_IP);
      if (!mhAuth.success) throw new Error('Auth failed');

      // Attempt to query West Bengal submissions
      const crossReq = new NextRequest('http://localhost:3000/api/submissions?state=West+Bengal', {
        method: 'GET',
        headers: {
          Cookie: `evaluation_session_token=${mhAuth.token}`,
        },
      });

      const res = await getSubmissionsRoute(crossReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN_SCOPE');
    });

    it('prevents West Bengal credential from accessing Maharashtra records (HTTP 403 FORBIDDEN_SCOPE)', async () => {
      const wbAuth = await authenticateUser('STATE-WB', getTestStatePassword('WB'), TEST_IP);
      if (!wbAuth.success) throw new Error('Auth failed');

      // Attempt to query Maharashtra submissions
      const crossReq = new NextRequest('http://localhost:3000/api/submissions?state=Maharashtra', {
        method: 'GET',
        headers: {
          Cookie: `evaluation_session_token=${wbAuth.token}`,
        },
      });

      const res = await getSubmissionsRoute(crossReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN_SCOPE');
    });

    it('rejects client-side attempts to elevate scope via query tampering', async () => {
      const mhAuth = await authenticateUser('STATE-MH', getTestStatePassword('MH'), TEST_IP);
      if (!mhAuth.success) throw new Error('Auth failed');

      // Attempt to query with state=ALL using single-state credential
      const tamperReq = new NextRequest('http://localhost:3000/api/submissions?state=ALL', {
        method: 'GET',
        headers: {
          Cookie: `evaluation_session_token=${mhAuth.token}`,
        },
      });

      const res = await getSubmissionsRoute(tamperReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN_SCOPE');
    });

    it('rejects STATE_REVIEWER hard delete attempts with HTTP 403 FORBIDDEN', async () => {
      const mhAuth = await authenticateUser('STATE-MH', getTestStatePassword('MH'), TEST_IP);
      if (!mhAuth.success) throw new Error('Auth failed');

      const deleteReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${mhAuth.token}`,
        },
      });

      const res = await deleteSubmissionRoute(deleteReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });

    it('rejects STATE_REVIEWER record edit (PATCH) attempts with HTTP 403 FORBIDDEN under Model A', async () => {
      const mhAuth = await authenticateUser('STATE-MH', getTestStatePassword('MH'), TEST_IP);
      if (!mhAuth.success) throw new Error('Auth failed');

      const patchReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${mhAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          editReason: 'State evaluator edit attempt',
        }),
      });

      const res = await patchSubmissionRoute(patchReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
      expect(data.message).toContain('Record edits and approvals are restricted to verified Administrator and Leadership roles');
    });

    it('rejects STATE_REVIEWER asset upload (POST asset) attempts with HTTP 403 FORBIDDEN under Model A', async () => {
      const mhAuth = await authenticateUser('STATE-MH', getTestStatePassword('MH'), TEST_IP);
      if (!mhAuth.success) throw new Error('Auth failed');

      const assetReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/asset', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${mhAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assetType: 'passbook' }),
      });

      const res = await postAssetRoute(assetReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
      expect(data.message).toContain('Asset upload is restricted to verified Administrator role');
    });

    it('rejects unverified anonymous record edit (PATCH) attempts with HTTP 401 UNAUTHORIZED', async () => {
      const patchReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'x-test-unauthenticated': 'true',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          editReason: 'Anonymous edit attempt',
        }),
      });

      const res = await patchSubmissionRoute(patchReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // 3. Leadership Evaluation Access & Capability Restrictions
  // ==========================================================================
  describe('3. Leadership Evaluation Access & Capability Restrictions', () => {
    it('authenticates leadership credential with all-state read evaluation scope', async () => {
      const leadAuth = await authenticateUser('LEADERSHIP-ALL', TEST_LEADERSHIP_PWD, TEST_IP);
      expect(leadAuth.success).toBe(true);
      if (!leadAuth.success) return;

      expect(leadAuth.user.role).toBe('LEADERSHIP');
      expect(leadAuth.user.allowedStates).toEqual(['*']);
      expect(leadAuth.user.allowedDistricts).toEqual(['*']);

      const tokenPayload = verifySessionToken(leadAuth.token);
      expect(tokenPayload).not.toBeNull();
      expect(tokenPayload?.role).toBe('LEADERSHIP');
      expect(tokenPayload?.allowedStates).toEqual(['*']);
    });

    it('allows leadership credential to query records across states', async () => {
      const leadAuth = await authenticateUser('LEADERSHIP-ALL', TEST_LEADERSHIP_PWD, TEST_IP);
      if (!leadAuth.success) throw new Error('Auth failed');

      const reqAll = new NextRequest('http://localhost:3000/api/submissions?state=ALL', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${leadAuth.token}` },
      });

      const resAll = await getSubmissionsRoute(reqAll);
      expect(resAll.status).toBe(200);
      const dataAll = await resAll.json();
      expect(dataAll.status).toBe('success');
    });

    it('rejects leadership credential attempting to DELETE records with HTTP 403 FORBIDDEN', async () => {
      const leadAuth = await authenticateUser('LEADERSHIP-ALL', TEST_LEADERSHIP_PWD, TEST_IP);
      if (!leadAuth.success) throw new Error('Auth failed');

      const deleteReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${leadAuth.token}`,
        },
      });

      const res = await deleteSubmissionRoute(deleteReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });

    it('permits leadership credential to PATCH records within authorized scope with HTTP 200', async () => {
      const leadAuth = await authenticateUser('LEADERSHIP-ALL', TEST_LEADERSHIP_PWD, TEST_IP);
      if (!leadAuth.success) throw new Error('Auth failed');

      const patchReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${leadAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          editReason: 'Supervisor update attempt',
        }),
      });

      const res = await patchSubmissionRoute(patchReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('success');
    });

    it('rejects leadership credential attempting to upload assets with HTTP 403 FORBIDDEN', async () => {
      const leadAuth = await authenticateUser('LEADERSHIP-ALL', TEST_LEADERSHIP_PWD, TEST_IP);
      if (!leadAuth.success) throw new Error('Auth failed');

      const assetReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/asset', {
        method: 'POST',
        headers: {
          Cookie: `evaluation_session_token=${leadAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assetType: 'passbook' }),
      });

      const res = await postAssetRoute(assetReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });
  });

  // ==========================================================================
  // 4. Credential Lifecycle, Rotation & Immediate Session Invalidation
  // ==========================================================================
  describe('4. Credential Lifecycle, Rotation & Invalidation', () => {
    it('rejects incorrect password with 401 and generic error message', async () => {
      const result = await authenticateUser('STATE-MH', 'WrongPassword123!', TEST_IP);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid username or password.');
    });

    it('rejects non-existent access identifier with 401 and generic error message', async () => {
      const result = await authenticateUser('NON-EXISTENT-STATE', 'SomePassword123!', TEST_IP);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid username or password.');
    });

    it('rejects deactivated credential during authentication', async () => {
      deactivateCredential('STATE-DL');
      const result = await authenticateUser('STATE-DL', getTestStatePassword('DL'), TEST_IP);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.statusCode).toBe(401);
    });

    it('invalidates previously issued session tokens after credential rotation', async () => {
      // 1. Authenticate initially (version 1)
      const auth1 = await authenticateUser('STATE-MH', getTestStatePassword('MH'), TEST_IP);
      if (!auth1.success) throw new Error('Initial auth failed');

      const token1 = auth1.token;
      expect(verifySessionToken(token1)).not.toBeNull();

      // 2. Rotate Maharashtra credential to new password hash
      rotateCredential('STATE-MH', '$argon2id$v=19$m=65536,t=3,p=4$new_hash_after_rotation$abc');

      // 3. Previously issued token must now fail verification immediately
      const verifiedAfterRotation = verifySessionToken(token1);
      expect(verifiedAfterRotation).toBeNull();
    });

    it('invalidates previously issued session tokens after credential deactivation', async () => {
      const auth = await authenticateUser('STATE-KA', getTestStatePassword('KA'), TEST_IP);
      if (!auth.success) throw new Error('Initial auth failed');

      expect(verifySessionToken(auth.token)).not.toBeNull();

      // Deactivate
      deactivateCredential('STATE-KA');

      // Token must now be rejected
      expect(verifySessionToken(auth.token)).toBeNull();
    });

    it('enforces rate limits on repeated failed attempts without permanent lockout', async () => {
      const target = 'STATE-TN';
      const ip = '10.0.0.99';

      // 4 failed attempts: allowed
      for (let i = 0; i < 4; i++) {
        const res = await authenticateUser(target, 'WrongPassword!', ip);
        expect(res.success).toBe(false);
        if (!res.success) expect(res.statusCode).toBe(401);
      }

      // 5th failed attempt: triggers temporary lockout
      const res5 = await authenticateUser(target, 'WrongPassword!', ip);
      expect(res5.success).toBe(false);

      // 6th attempt: rejected with 429 rate limit exceeded
      const res6 = await authenticateUser(target, 'WrongPassword!', ip);
      expect(res6.success).toBe(false);
      if (!res6.success) {
        expect(res6.statusCode).toBe(429);
        expect(res6.error).toContain('temporarily locked');
      }

      // Resetting window allows retry (no permanent lockout)
      resetRateLimits();
      const resAfterReset = await authenticateUser(target, getTestStatePassword('TN'), ip);
      expect(resAfterReset.success).toBe(true);
    });
  });

  // ==========================================================================
  // 5. Zero Secret Exposure & Privacy Guarantees
  // ==========================================================================
  describe('5. Zero Secret Exposure & Metadata Safety', () => {
    it('ensures POST /api/auth/login response never leaks password hashes or salts', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessIdentifier: 'STATE-MH',
          password: getTestStatePassword('MH'),
        }),
      });

      const res = await postLoginRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.status).toBe('success');
      expect(json.data.user).toBeDefined();
      expect(json.data.user.passwordHash).toBeUndefined();
      expect(json.data.user.password).toBeUndefined();
      expect(json.data.user.salt).toBeUndefined();
    });

    it('ensures GET /api/auth/session exposes only safe scope attributes', async () => {
      const auth = await authenticateUser('STATE-MH', getTestStatePassword('MH'), TEST_IP);
      if (!auth.success) throw new Error('Auth failed');

      const req = new NextRequest('http://localhost:3000/api/auth/session', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${auth.token}` },
      });

      const res = await getSessionRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data).toEqual({
        userId: expect.any(String),
        name: 'Maharashtra State Evaluation',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
      });
      expect(json.data.passwordHash).toBeUndefined();
    });

    it('allows verified ADMIN role to pass Model A authorization checks on PATCH', async () => {
      const adminAuth = await authenticateUser(ADMIN_ACCESS_IDENTIFIER, TEST_ADMIN_PWD, TEST_IP);
      expect(adminAuth.success).toBe(true);
      if (!adminAuth.success) return;

      expect(adminAuth.user.role).toBe('ADMIN');
      expect(adminAuth.user.allowedStates).toEqual(['*']);

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${adminAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          weightKg: 15.5,
          editReason: 'Admin verification update',
        }),
      });

      const scope = await resolveUserAccessScope(req);
      expect(scope.isVerified).toBe(true);
      expect(scope.role).toBe('ADMIN');
    });

    it('ensures Google Sheets passwords tab rows contain zero secrets or hashes', () => {
      for (const row of CANONICAL_INITIAL_METADATA_ROWS) {
        const values = buildSheetRowValues(row);

        // Check each cell value
        for (const val of values) {
          expect(val).not.toContain('$argon2id$');
          expect(val).not.toContain('password');
          expect(val).not.toContain('secret');
        }

        expect(values[0]).toMatch(/^(STATE-[A-Z]{2}|LEADERSHIP-ALL)$/); // Access ID
        expect(values[6]).toMatch(/^(TRUE|FALSE)$/); // Active
        expect(values[11]).toMatch(/^vault:\/\//); // Delivery Reference
      }
    });

    it('authenticates bootstrap environment credentials using evaluation aliases in production mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalLeadPwd = process.env.INITIAL_LEADERSHIP_PWD;
      const originalRevPwd = process.env.INITIAL_REV_MH_PWD;
      try {
        (process.env as any).NODE_ENV = 'production';
        clearRegistry();
        resetPasswordHashCache();
        resetRateLimits();

        process.env.INITIAL_LEADERSHIP_PWD = 'TestBootstrap123!';
        process.env.INITIAL_REV_MH_PWD = 'TestBootstrap123!';

        // 1. Leadership login via LEADERSHIP-ALL
        const leadRes = await authenticateUser('LEADERSHIP-ALL', 'TestBootstrap123!', '127.0.0.1');
        expect(leadRes.success).toBe(true);
        if (leadRes.success) {
          expect(leadRes.user.role).toBe('LEADERSHIP');
          expect(leadRes.user.allowedStates).toEqual(['*']);
        }

        // 2. State Evaluation login via Maharashtra
        const mhNameRes = await authenticateUser('Maharashtra', 'TestBootstrap123!', '127.0.0.1');
        expect(mhNameRes.success).toBe(true);
        if (mhNameRes.success) {
          expect(mhNameRes.user.role).toBe('STATE_REVIEWER');
          expect(mhNameRes.user.allowedStates).toEqual(['Maharashtra']);
        }

        // 3. State Evaluation login via STATE-MH
        const mhCodeRes = await authenticateUser('STATE-MH', 'TestBootstrap123!', '127.0.0.1');
        expect(mhCodeRes.success).toBe(true);
        if (mhCodeRes.success) {
          expect(mhCodeRes.user.role).toBe('STATE_REVIEWER');
          expect(mhCodeRes.user.allowedStates).toEqual(['Maharashtra']);
        }
      } finally {
        (process.env as any).NODE_ENV = originalNodeEnv;
        process.env.INITIAL_LEADERSHIP_PWD = originalLeadPwd;
        process.env.INITIAL_REV_MH_PWD = originalRevPwd;
        resetPasswordHashCache();
        resetRateLimits();
        await initializeTestFixtures();
      }
    });
  });
});
