import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as completeOnboardingHandler } from '@/app/api/auth/field-user/complete-onboarding/route';
import { POST as requestEmailOtpHandler } from '@/app/api/auth/field-user/email-otp/request/route';
import { POST as verifyEmailOtpHandler } from '@/app/api/auth/field-user/email-otp/verify/route';
import { GET as getSessionHandler, DELETE as deleteSessionHandler } from '@/app/api/auth/session/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import { issueStateTeamInvitation } from '@/lib/server/stateTeamAuthChallenge';
import {
  requestFieldEmailOtp,
  verifyFieldEmailOtp,
  createEmailTicket,
  setTestEmailOtpStore,
  normalizeEmail,
} from '@/lib/server/fieldEmailOtpChallenge';
import { FirestoreOtpStore } from '@/lib/server/firestoreOtpStore';
import { verifySessionToken, createSessionToken } from '@/lib/server/sessionService';
import { filterRecordsByScope, resolveUserAccessScope } from '@/lib/server/authorisation';

describe('Field Worker Email OTP Authentication & Account Recovery Suite', () => {
  let store: MemoryOnboardingStore;
  let invitationCode: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);

    // Create a memory-backed challenge store for testing
    const memoryChallengeStore = new FirestoreOtpStore();
    setTestEmailOtpStore(memoryChallengeStore);

    // Seed state team & invitation for Maharashtra
    const reg = await store.createStateTeamRegistration({
      firstName: 'Anjali',
      lastName: 'Deshmukh',
      workEmail: 'anjali@allianceindia.org',
      requestedState: 'Maharashtra',
      organization: 'Alliance India MH State Office',
      autoApprove: true,
    });
    await store.verifyStateTeamEmail(reg.workEmail);

    const inv = await issueStateTeamInvitation({ stateTeamId: reg.id });
    invitationCode = inv.plainInvitationCode;
  });

  describe('1. First-Time Registration with Mandatory Invitation Code + Email OTP Verification', () => {
    it('creates stable worker profile with verified email OTP ticket + valid invitation code and issues session token', async () => {
      const caseworkerEmail = 'ramesh.shinde@allianceindia.org';
      const emailTicket = createEmailTicket(caseworkerEmail);

      const req = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Ramesh',
          lastName: 'Shinde',
          state: 'Maharashtra',
          district: 'Pune',
          emailTicket,
          invitationCode,
          srName: 'Alliance India Maharashtra SR',
          ssrName: 'Pune Care Unit',
        }),
      });

      const res = await completeOnboardingHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.profile.firstName).toBe('Ramesh');
      expect(json.profile.googleEmail).toBe(caseworkerEmail);
      expect(json.profile.id).toBeDefined();
      expect(json.data.session.role).toBe('FIELD_USER');

      // Check session cookie issued
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('evaluation_session_token=');

      // Verify server store has the profile mapped by email
      const savedProfile = await store.getFieldUserProfileByEmail(caseworkerEmail);
      expect(savedProfile).not.toBeNull();
      expect(savedProfile?.id).toBe(json.profile.id);
      expect(savedProfile?.assignedState).toBe('Maharashtra');
      expect(savedProfile?.assignedDistrict).toBe('Pune');
    });

    it('rejects registration when invitation code is missing even if email OTP ticket is valid', async () => {
      const caseworkerEmail = 'shaukat.field@allianceindia.org';
      const emailTicket = createEmailTicket(caseworkerEmail);

      const req = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Shaukat',
          lastName: 'Sayyed',
          state: 'Maharashtra',
          district: 'Mumbai Suburban',
          emailTicket,
          srName: 'Alliance India Maharashtra SR',
          ssrName: 'Mumbai Care Unit',
        }),
      });

      const res = await completeOnboardingHandler(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.status).toBe('error');
      expect(json.error).toMatch(/invitation code is required/i);
    });

    it('rejects registration when email verification ticket is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Unauthorized',
          lastName: 'User',
          state: 'Maharashtra',
          district: 'Pune',
          invitationCode,
        }),
      });

      const res = await completeOnboardingHandler(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.status).toBe('error');
      expect(json.error).toMatch(/verified official email is required/i);
    });

    it('prevents duplicate registration when email address is already registered', async () => {
      const caseworkerEmail = 'duplicate.worker@allianceindia.org';
      const emailTicket1 = createEmailTicket(caseworkerEmail);

      // Register first time
      const req1 = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Initial',
          lastName: 'Registration',
          state: 'Maharashtra',
          district: 'Pune',
          emailTicket: emailTicket1,
          invitationCode,
        }),
      });
      const res1 = await completeOnboardingHandler(req1);
      expect(res1.status).toBe(200);

      // Attempt second registration with new ticket for same email
      const emailTicket2 = createEmailTicket(caseworkerEmail);
      const req2 = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Duplicate',
          lastName: 'Attempt',
          state: 'Maharashtra',
          district: 'Pune',
          emailTicket: emailTicket2,
          invitationCode,
        }),
      });
      const res2 = await completeOnboardingHandler(req2);
      const json2 = await res2.json();

      expect(res2.status).toBe(409);
      expect(json2.status).toBe('error');
      expect(json2.code).toBe('EMAIL_ALREADY_REGISTERED');
      expect(json2.error).toMatch(/This email is already registered\. Please sign in instead\./i);
    });
  });

  describe('2. Request Email OTP (Sign-In & Anti-Enumeration)', () => {
    let workerProfileId: string;
    const workerEmail = 'sunita.patil@allianceindia.org';

    beforeEach(async () => {
      // Register worker Sunita with invitationCode + emailTicket
      const emailTicket = createEmailTicket(workerEmail);
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Sunita',
          lastName: 'Patil',
          state: 'Maharashtra',
          district: 'Pune',
          emailTicket,
          invitationCode,
          srName: 'Alliance India Maharashtra SR',
          ssrName: 'Pune Center',
        }),
      });
      const res = await completeOnboardingHandler(req);
      const json = await res.json();
      workerProfileId = json.profile.id;
    });

    it('generates 6-digit numeric OTP and dispatches to registered email', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: workerEmail, purpose: 'login' }),
      });

      const res = await requestEmailOtpHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.message).toMatch(/Verification code sent/i);
      expect(json.debugCode).toBeDefined();
      expect(json.debugCode).toMatch(/^\d{6}$/);
    });

    it('enforces anti-enumeration: unregistered email receives generic 200 response without sending code', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'unregistered.stranger@example.com', purpose: 'login' }),
      });

      const res = await requestEmailOtpHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.message).toContain('If this email address is registered');
      // No debugCode should be generated or returned
      expect(json.debugCode).toBeUndefined();
    });

    it('enforces 60-second cooldown rate limit against immediate duplicate requests', async () => {
      const freshEmail = 'cooldown.tester@allianceindia.org';
      const emailTicket = createEmailTicket(freshEmail);
      // Register worker for cooldown test
      const regReq = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Cooldown',
          lastName: 'Tester',
          state: 'Maharashtra',
          district: 'Pune',
          emailTicket,
          invitationCode,
          srName: 'Alliance India MH SR',
        }),
      });
      await completeOnboardingHandler(regReq);

      const req1 = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: freshEmail, purpose: 'login' }),
      });
      const res1 = await requestEmailOtpHandler(req1);
      expect(res1.status).toBe(200);

      // Immediate second request
      const req2 = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: freshEmail, purpose: 'login' }),
      });
      const res2 = await requestEmailOtpHandler(req2);
      const json2 = await res2.json();

      expect(res2.status).toBe(429);
      expect(json2.status).toBe('error');
      expect(json2.error).toMatch(/wait/i);
    });
  });

  describe('3. Verify Email OTP & Session Resolution', () => {
    let testIdx = 0;
    let workerProfileId: string;
    let workerEmail: string;
    let validOtpCode: string;

    beforeEach(async () => {
      testIdx++;
      workerEmail = `deepak.kamble${testIdx}@allianceindia.org`;
      const emailTicket = createEmailTicket(workerEmail);

      const req = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Deepak',
          lastName: 'Kamble',
          state: 'Maharashtra',
          district: 'Nagpur',
          emailTicket,
          invitationCode,
          srName: 'Alliance India MH SR',
          ssrName: 'Nagpur NGO',
        }),
      });
      const res = await completeOnboardingHandler(req);
      const json = await res.json();
      workerProfileId = json.profile.id;

      // Request OTP
      const otpReq = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: workerEmail, purpose: 'login' }),
      });
      const otpRes = await requestEmailOtpHandler(otpReq);
      const otpJson = await otpRes.json();
      validOtpCode = otpJson.debugCode;
    });

    it('rejects invalid OTP code and decrements remaining attempts', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: workerEmail,
          code: '000000',
          purpose: 'login',
        }),
      });

      const res = await verifyEmailOtpHandler(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.status).toBe('error');
      expect(json.remainingAttempts).toBe(2);
    });

    it('revokes challenge after 3 failed verification attempts', async () => {
      for (let i = 0; i < 3; i++) {
        const req = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: workerEmail,
            code: '111111',
            purpose: 'login',
          }),
        });
        await verifyEmailOtpHandler(req);
      }

      // 4th attempt with the otherwise valid OTP must be rejected because challenge was revoked
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: workerEmail,
          code: validOtpCode,
          purpose: 'login',
        }),
      });

      const res = await verifyEmailOtpHandler(req);
      const json = await res.json();

      expect([400, 401]).toContain(res.status);
      expect(json.status).toBe('error');
      expect(json.error).toMatch(/exceeded|invalid|expired/i);
    });

    it('verifies valid 6-digit OTP and binds session token to the EXACT same worker ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/email-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: workerEmail,
          code: validOtpCode,
          purpose: 'login',
        }),
      });

      const res = await verifyEmailOtpHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.profile.id).toBe(workerProfileId); // EXACT same immutable worker ID
      expect(json.profile.firstName).toBe('Deepak');
      expect(json.profile.assignedState).toBe('Maharashtra');
      expect(json.profile.assignedDistrict).toBe('Nagpur');

      // Check session token payload
      const token = json.sessionToken;
      expect(token).toBeDefined();
      const decoded = verifySessionToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(workerProfileId);
      expect(decoded?.role).toBe('FIELD_USER');
      expect(decoded?.allowedStates).toEqual(['Maharashtra']);
      expect(decoded?.allowedDistricts).toEqual(['Nagpur']);

      // Check cookie is set
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('evaluation_session_token=');
    });
  });

  describe('4. Submissions Ownership & Data Isolation for Returning Workers', () => {
    it('restores returning worker access to previous submissions and enforces cross-worker isolation', async () => {
      const workerA_id = 'fld_worker_aaa_111';
      const workerB_id = 'fld_worker_bbb_222';

      // Create session tokens for Worker A and Worker B
      const tokenA = createSessionToken({
        userId: workerA_id,
        username: 'workerA@allianceindia.org',
        name: 'Worker A',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const tokenB = createSessionToken({
        userId: workerB_id,
        username: 'workerB@allianceindia.org',
        name: 'Worker B',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      // Sample records in database
      const records = [
        {
          id: 'sub-001',
          authorId: workerA_id,
          state: 'Maharashtra',
          district: 'Pune',
          beneficiaryName: 'Child 1',
        },
        {
          id: 'sub-002',
          authorId: workerA_id,
          state: 'Maharashtra',
          district: 'Pune',
          beneficiaryName: 'Child 2',
        },
        {
          id: 'sub-003',
          authorId: workerB_id,
          state: 'Maharashtra',
          district: 'Pune',
          beneficiaryName: 'Child 3',
        },
      ];

      // Decode scope for Worker A
      const reqA = new NextRequest('http://localhost:3000/api/submissions', {
        headers: { cookie: `evaluation_session_token=${tokenA}` },
      });
      const scopeA = await resolveUserAccessScope(reqA);
      expect(scopeA.isVerified).toBe(true);
      expect(scopeA.userId).toBe(workerA_id);

      // Filter records for Worker A
      const workerA_records = filterRecordsByScope(scopeA, records);
      expect(workerA_records.length).toBe(2);
      expect(workerA_records.map((r: any) => r.id)).toEqual(['sub-001', 'sub-002']);

      // Decode scope for Worker B
      const reqB = new NextRequest('http://localhost:3000/api/submissions', {
        headers: { cookie: `evaluation_session_token=${tokenB}` },
      });
      const scopeB = await resolveUserAccessScope(reqB);
      expect(scopeB.isVerified).toBe(true);
      expect(scopeB.userId).toBe(workerB_id);

      // Filter records for Worker B
      const workerB_records = filterRecordsByScope(scopeB, records);
      expect(workerB_records.length).toBe(1);
      expect(workerB_records[0].id).toBe('sub-003');

      // Worker B cannot see Worker A's records
      expect(workerB_records.find((r: any) => r.id === 'sub-001')).toBeUndefined();
    });
  });

  describe('5. Deliberate Logout & Session Revocation', () => {
    it('DELETE /api/auth/session and POST /api/auth/logout clear session cookie', async () => {
      // 1. DELETE /api/auth/session
      const delReq = new NextRequest('http://localhost:3000/api/auth/session', {
        method: 'DELETE',
      });
      const delRes = await deleteSessionHandler(delReq);
      expect(delRes.status).toBe(200);
      const delCookie = delRes.headers.get('set-cookie');
      expect(delCookie).toContain('evaluation_session_token=');
      expect(delCookie).toMatch(/Max-Age=0|expires=/i);

      // 2. POST /api/auth/logout with CSRF origin
      const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });
      const logoutRes = await logoutHandler(logoutReq);
      expect(logoutRes.status).toBe(200);
      const logoutCookie = logoutRes.headers.get('set-cookie');
      expect(logoutCookie).toContain('evaluation_session_token=');
    });
  });
});
