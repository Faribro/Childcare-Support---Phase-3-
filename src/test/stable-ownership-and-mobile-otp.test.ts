import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { initializeTestFixtures, resetRateLimits } from '@/lib/server/credentialRegistry';
import { createSessionToken } from '@/lib/server/sessionService';
import { getOnboardingStore, MemoryOnboardingStore } from '@/lib/server/onboardingStore';
import { createInvitationVerifierPair } from '@/lib/server/invitationCrypto';
import { validateAndFormatIndianMobile, verifyMobileTicket } from '@/lib/server/phoneValidation';
import { MockOtpProvider, RemoteOtpGatewayProvider, getOtpProvider } from '@/lib/server/otpgatewayAdapter';
import { POST as requestOtpRoute } from '@/app/api/auth/mobile/otp/request/route';
import { POST as verifyOtpRoute } from '@/app/api/auth/mobile/otp/verify/route';
import { POST as completeOnboardingRoute } from '@/app/api/auth/field-user/complete-onboarding/route';
import { POST as createSubmissionRoute, GET as listSubmissionsRoute } from '@/app/api/submissions/route';
import { GET as getSubmissionDetailRoute, PATCH as patchSubmissionRoute } from '@/app/api/submissions/[submissionId]/route';
import { PUT as putAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { GET as exportSubmissionRoute } from '@/app/api/submissions/[submissionId]/export/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

describe('Stable Submission Ownership & Mobile OTP Verification', () => {
  beforeEach(async () => {
    process.env.SESSION_SECRET = 'a_very_secure_test_session_secret_for_cryptographic_signing_32_chars_long!';
    (process.env as any).NODE_ENV = 'test';
    await initializeTestFixtures();
    resetRateLimits();
    MockSheetStore.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Phone Number Normalisation & Validation (E.164)', () => {
    it('normalises various Indian mobile formats to canonical E.164 (+91XXXXXXXXXX)', () => {
      const inputs = [
        '9822012345',
        '+91 9822012345',
        '+91-98220-12345',
        '09822012345',
        '+919822012345',
      ];
      for (const input of inputs) {
        const res = validateAndFormatIndianMobile(input);
        expect(res.valid).toBe(true);
        expect(res.canonical).toBe('+919822012345');
        expect(res.canonicalE164).toBe('+919822012345');
        expect(res.masked).toBe('+91 ******2345');
      }
    });

    it('rejects invalid or non-cellular numbers', () => {
      expect(validateAndFormatIndianMobile('12345').valid).toBe(false);
      expect(validateAndFormatIndianMobile('2223456789').valid).toBe(false); // starts with 2
      expect(validateAndFormatIndianMobile('+14155552671').valid).toBe(false); // US number
      expect(validateAndFormatIndianMobile('').valid).toBe(false);
    });
  });

  describe('2. OtpGateway Mock Provider Safety & Lifetime', () => {
    it('fails closed in production environment to prevent mock leakage', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        expect(() => new MockOtpProvider()).toThrow('MockOtpProvider is strictly prohibited in production');
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
    });

    it('generates, verifies, and single-use consumes OTP codes', async () => {
      const mock = new MockOtpProvider();
      const sendRes = await mock.sendOtp('+919822012345', 'login');
      expect(sendRes.success).toBe(true);
      const code = mock.peekCode('+919822012345');
      expect(code).toBeDefined();

      // Wrong code fails
      const badRes = await mock.verifyOtp('+919822012345', '000000');
      expect(badRes.success).toBe(false);

      // Correct code succeeds
      const goodRes = await mock.verifyOtp('+919822012345', code!);
      expect(goodRes.success).toBe(true);

      // Re-use fails (single use atomic consumption)
      const reuseRes = await mock.verifyOtp('+919822012345', code!);
      expect(reuseRes.success).toBe(false);
    });
  });

  describe('3. Registration, Mobile Verification & Returning Login', () => {
    it('executes full returning user lifecycle: register -> logout -> OTP login -> resolves original profile ID', async () => {
      const store = getOnboardingStore();
      const testMobile = '+919822019999';

      // Seed valid invitation code for Maharashtra
      const { salt, verifier } = createInvitationVerifierPair('MHA-TEST-INV-01');
      await store.createInvitation({
        stateTeamId: 'state-mh-coord',
        state: 'Maharashtra',
        salt,
        verifier,
        maxRedemptions: 10,
        expiresAt: Date.now() + 86400000,
      });

      // Step A: Request OTP for registration
      const reqOtpReq = new NextRequest('http://localhost:3000/api/auth/mobile/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: '9822019999', purpose: 'registration' }),
      });
      const reqOtpRes = await requestOtpRoute(reqOtpReq);
      expect(reqOtpRes.status).toBe(200);

      const otpProvider = getOtpProvider() as MockOtpProvider;
      const code = otpProvider.peekCode(testMobile);
      expect(code).toBeDefined();

      // Step B: Verify OTP for registration -> get mobile ticket
      const verifyReq = new NextRequest('http://localhost:3000/api/auth/mobile/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: '9822019999', code, purpose: 'registration' }),
      });
      const verifyRes = await verifyOtpRoute(verifyReq);
      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.mobileTicket).toBeDefined();

      // Step C: Complete Onboarding with verified mobile ticket
      const completeReq = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          firstName: 'Ramesh',
          lastName: 'Pawar',
          state: 'Maharashtra',
          district: 'Pune',
          invitationCode: 'MHA-TEST-INV-01',
          mobileTicket: verifyData.mobileTicket,
        }),
      });
      const completeRes = await completeOnboardingRoute(completeReq);
      expect(completeRes.status).toBe(200);
      const completeData = await completeRes.json();
      const originalWorkerId = completeData.profile.id;
      expect(originalWorkerId).toBeDefined();

      // Verify profile has mobile in store
      const savedProfile = await store.getFieldUserProfileByMobile(testMobile);
      expect(savedProfile).not.toBeNull();
      expect(savedProfile?.id).toBe(originalWorkerId);
      expect(savedProfile?.isMobileVerified).toBe(true);

      // Step D: Worker logs out, now performs returning login via mobile OTP
      const loginReqOtp = new NextRequest('http://localhost:3000/api/auth/mobile/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: '9822019999', purpose: 'login' }),
      });
      const loginReqRes = await requestOtpRoute(loginReqOtp);
      expect(loginReqRes.status).toBe(200);

      const loginCode = otpProvider.peekCode(testMobile);
      expect(loginCode).toBeDefined();

      const loginVerifyReq = new NextRequest('http://localhost:3000/api/auth/mobile/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: '9822019999', code: loginCode, purpose: 'login' }),
      });
      const loginVerifyRes = await verifyOtpRoute(loginVerifyReq);
      expect(loginVerifyRes.status).toBe(200);
      const loginData = await loginVerifyRes.json();
      expect(loginData.status).toBe('success');
      expect(loginData.profile.id).toBe(originalWorkerId); // Exact stable worker ID restored!
      expect(loginData.sessionToken).toBeDefined();
    });
  });

  describe('4. Stable Submission Ownership Enforcement', () => {
    const buildValidPayload = (clientSubmissionId: string, artNumber: string, extra: Record<string, any> = {}) => ({
      uuid: clientSubmissionId,
      clientSubmissionId,
      interviewerName: 'Field Caseworker',
      demographics: {
        artNumber,
        childName: 'Priyanka Sunil D.',
        dob: '2019-06-15',
        gender: 'Female',
        caregiverName: 'Sunil D.',
        caregiverRelationship: 'Father',
        caregiverPhone: '9822123456',
        district: 'Pune',
        state: 'Maharashtra',
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
        caseworkerName: 'Field Caseworker',
        declarationDate: '2026-09-08',
      },
      ...extra,
    });

    it('two workers with the exact same display name cannot access each others records', async () => {
      // Worker A and Worker B both have display name "Rahul Sharma"
      const workerAToken = await createSessionToken({
        userId: 'worker-rahul-01',
        role: 'FIELD_USER',
        name: 'Rahul Sharma',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const workerBToken = await createSessionToken({
        userId: 'worker-rahul-02',
        role: 'FIELD_USER',
        name: 'Rahul Sharma', // Identical display name
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      // Worker A creates a submission
      const samplePayload = buildValidPayload('a0000000-0000-4000-8000-000000000001', 'MH-PUN-001');

      const createReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          cookie: `evaluation_session_token=${workerAToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-rahul-001',
        },
        body: JSON.stringify(samplePayload),
      });

      const createRes = await createSubmissionRoute(createReq);
      expect(createRes.status).toBe(201);
      const createData = await createRes.json();
      const submissionId = createData.remoteSubmissionId || 'BEN-RAHUL-001';

      // Worker B (same name "Rahul Sharma", but userId: worker-rahul-02) attempts to PATCH
      const patchReq = new NextRequest(`http://localhost:3000/api/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: {
          cookie: `evaluation_session_token=${workerBToken}`,
          'Content-Type': 'application/json',
          'If-Match': '1',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          remarks: 'Unauthorized modification by same-name worker',
        }),
      });
      const patchRes = await patchSubmissionRoute(patchReq, { params: { submissionId } });
      expect(patchRes.status).toBe(403);
      const patchData = await patchRes.json();
      expect(patchData.code).toBe('FORBIDDEN_AUTHOR_MISMATCH');

      // Worker B attempts to export dossier PDF
      const exportReq = new NextRequest(`http://localhost:3000/api/submissions/${submissionId}/export`, {
        headers: { cookie: `evaluation_session_token=${workerBToken}` },
      });
      const exportRes = await exportSubmissionRoute(exportReq, { params: { submissionId } });
      expect(exportRes.status).toBe(403);

      // In linelist, Worker B sees 0 records
      const listReqB = new NextRequest('http://localhost:3000/api/submissions', {
        headers: { cookie: `evaluation_session_token=${workerBToken}` },
      });
      const listResB = await listSubmissionsRoute(listReqB);
      expect(listResB.status).toBe(200);
      const listDataB = await listResB.json();
      expect(listDataB.count).toBe(0);

      // In linelist, Worker A sees their record
      const listReqA = new NextRequest('http://localhost:3000/api/submissions', {
        headers: { cookie: `evaluation_session_token=${workerAToken}` },
      });
      const listResA = await listSubmissionsRoute(listReqA);
      expect(listResA.status).toBe(200);
      const listDataA = await listResA.json();
      expect(listDataA.count).toBe(1);
    });

    it('worker renaming preserves submission history without data loss', async () => {
      const originalToken = await createSessionToken({
        userId: 'worker-renamed-01',
        role: 'FIELD_USER',
        name: 'Sunita Patil',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      // Submit record
      const createReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          cookie: `evaluation_session_token=${originalToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-sunita-001',
        },
        body: JSON.stringify(buildValidPayload('a0000000-0000-4000-8000-000000000002', 'MH-PUN-002')),
      });
      const createRes = await createSubmissionRoute(createReq);
      expect(createRes.status).toBe(201);
      const createData = await createRes.json();
      const subId = createData.remoteSubmissionId || 'BEN-SUNITA-001';

      // Caseworker updates their display name (e.g. marries, legal name update)
      const renamedToken = await createSessionToken({
        userId: 'worker-renamed-01', // Same immutable ID
        role: 'FIELD_USER',
        name: 'Sunita Patil-Deshmukh', // Changed display name
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      // Renamed caseworker still sees record in linelist
      const listReq = new NextRequest('http://localhost:3000/api/submissions', {
        headers: { cookie: `evaluation_session_token=${renamedToken}` },
      });
      const listRes = await listSubmissionsRoute(listReq);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.count).toBe(1);

      // Renamed caseworker can still PATCH record
      const patchReq = new NextRequest(`http://localhost:3000/api/submissions/${subId}`, {
        method: 'PATCH',
        headers: {
          cookie: `evaluation_session_token=${renamedToken}`,
          'Content-Type': 'application/json',
          'If-Match': '1',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          remarks: 'Updated after name change',
        }),
      });
      const patchRes = await patchSubmissionRoute(patchReq, { params: { submissionId: subId } });
      expect(patchRes.status).toBe(200);
    });

    it('forged owner IDs in request body are overridden by server session ID', async () => {
      const imposterToken = await createSessionToken({
        userId: 'worker-imposter-99',
        role: 'FIELD_USER',
        name: 'Imposter User',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      // Imposter tries to claim ownership under victim's ID in body
      const createReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          cookie: `evaluation_session_token=${imposterToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-forge-001',
        },
        body: JSON.stringify(
          buildValidPayload('a0000000-0000-4000-8000-000000000003', 'MH-PUN-003', {
            authorId: 'worker-victim-01', // FORGED
            submittedByWorkerId: 'worker-victim-01', // FORGED
          })
        ),
      });

      const createRes = await createSubmissionRoute(createReq);
      expect(createRes.status).toBe(201);
      const subId = (await createRes.json()).remoteSubmissionId || 'BEN-FORGE-001';

      // Victim checks their submissions
      const victimToken = await createSessionToken({
        userId: 'worker-victim-01',
        role: 'FIELD_USER',
        name: 'Victim User',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const victimListReq = new NextRequest('http://localhost:3000/api/submissions', {
        headers: { cookie: `evaluation_session_token=${victimToken}` },
      });
      const victimListRes = await listSubmissionsRoute(victimListReq);
      expect(victimListRes.status).toBe(200);
      expect((await victimListRes.json()).count).toBe(0); // Victim does not see imposter's record!

      // Imposter owns it
      const imposterListReq = new NextRequest('http://localhost:3000/api/submissions', {
        headers: { cookie: `evaluation_session_token=${imposterToken}` },
      });
      const imposterListRes = await listSubmissionsRoute(imposterListReq);
      expect(imposterListRes.status).toBe(200);
      expect((await imposterListRes.json()).count).toBe(1);
    });
  });

  describe('5. Post-Approval Document Replacement & Approval Invariance', () => {
    it('author caseworker can upload passbook to an approved record without resetting approval', async () => {
      const authorToken = await createSessionToken({
        userId: 'worker-bank-01',
        role: 'FIELD_USER',
        name: 'Sunil Gavaskar',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      // Mock an existing record that is APPROVED by Leadership
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        data: {
          uniqueId: 'MH-PUN-APP-99',
          authorId: 'worker-bank-01',
          submittedByWorkerId: 'worker-bank-01',
          state: 'Maharashtra',
          district: 'Pune',
          isApproved: true,
          approvedAllianceIndia: 'APPROVED',
          approvalStatus: 'APPROVED',
          version: 2,
        },
        version: 2,
      });

      vi.spyOn(canonicalSubmissionAdapter, 'replaceAsset').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        acknowledged: true,
        remoteSubmissionId: 'MH-PUN-APP-99',
        uniqueId: 'MH-PUN-APP-99',
        docType: 'passbookPhoto',
        cellFormula: '=HYPERLINK("https://drive.google.com/passbook-final", "Passbook")',
        assetStatus: 'UPLOADED',
        version: 3,
        updatedAt: new Date().toISOString(),
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-APP-99/asset', {
        method: 'PUT',
        headers: {
          cookie: `evaluation_session_token=${authorToken}`,
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          docType: 'passbookPhoto',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 2,
        }),
      });

      const res = await putAssetRoute(req, { params: { submissionId: 'MH-PUN-APP-99' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('success');
      expect(data.acknowledged).toBe(true);
    });

    it('rejects replacement of intake documents on an approved record with RECORD_LOCKED_APPROVED', async () => {
      const authorToken = await createSessionToken({
        userId: 'worker-bank-01',
        role: 'FIELD_USER',
        name: 'Sunil Gavaskar',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        data: {
          uniqueId: 'MH-PUN-APP-99',
          authorId: 'worker-bank-01',
          state: 'Maharashtra',
          district: 'Pune',
          isApproved: true,
          approvedAllianceIndia: 'APPROVED',
          version: 2,
        },
        version: 2,
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-APP-99/asset', {
        method: 'PUT',
        headers: {
          cookie: `evaluation_session_token=${authorToken}`,
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          docType: 'childPhoto', // INTAKE DOCUMENT
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 2,
        }),
      });

      const res = await putAssetRoute(req, { params: { submissionId: 'MH-PUN-APP-99' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('RECORD_LOCKED_APPROVED');
    });
  });

  describe('6. Read-Only Ownership Audit & Dry-Run Report Tool', () => {
    it('classifies records accurately, flags ambiguous name collisions, and never mutates data', async () => {
      const { runSubmissionOwnershipAudit } = await import('../../scripts/audit-submission-ownership');

      const mockSubmissions = [
        {
          id: 'REC-01',
          authorId: 'worker-exact-01',
          authorName: 'Aarav Patel',
          state: 'Maharashtra',
        },
        {
          id: 'REC-02',
          userEmail: 'priya@alliance.org',
          authorName: 'Priya Verma',
          state: 'Delhi',
        },
        {
          id: 'REC-03',
          authorName: 'Sunita Sharma', // 2 registered workers named Sunita Sharma
          state: 'Maharashtra',
        },
        {
          id: 'REC-04',
          authorName: 'Unregistered Worker',
          state: 'Karnataka',
        },
        {
          id: 'REC-05',
          state: 'West Bengal',
          // No authorId, email, or name
        },
      ];

      const mockProfiles = [
        { id: 'worker-exact-01', firstName: 'Aarav', lastName: 'Patel', googleEmail: 'aarav@alliance.org' },
        { id: 'worker-priya-01', firstName: 'Priya', lastName: 'Verma', googleEmail: 'priya@alliance.org' },
        { id: 'worker-sunita-01', firstName: 'Sunita', lastName: 'Sharma', assignedDistrict: 'Pune' },
        { id: 'worker-sunita-02', firstName: 'Sunita', lastName: 'Sharma', assignedDistrict: 'Mumbai' },
      ];

      const report = await runSubmissionOwnershipAudit({
        env: 'test',
        databaseId: 'test-db',
        projectId: 'test-project',
        inMemoryRecords: mockSubmissions,
        inMemoryProfiles: mockProfiles,
      });

      expect(report.totalRecordsScanned).toBe(5);
      expect(report.breakdown.explicitImmutableOwnerCount).toBe(1);
      expect(report.breakdown.legacyEmailLinkableCount).toBe(1);
      expect(report.breakdown.ambiguousNameOnlyCount).toBe(2);
      expect(report.breakdown.orphanUnattributedCount).toBe(1);

      // Verify ambiguous collision was caught and flagged with collision risk
      const sunitaFlag = report.flaggedRecords.find(r => r.submissionId === 'REC-03');
      expect(sunitaFlag).toBeDefined();
      expect(sunitaFlag?.flagReason).toContain('Multiple profiles (2) match name');
      expect(sunitaFlag?.recommendedAction).toContain('FLAGGED: Display-name matching strictly prohibited');

      // Verify unverified/unregistered name was caught
      const unregFlag = report.flaggedRecords.find(r => r.submissionId === 'REC-04');
      expect(unregFlag).toBeDefined();
      expect(unregFlag?.flagReason).toContain('does not match any registered field profile');

      // Verify orphan was caught
      const orphanFlag = report.flaggedRecords.find(r => r.submissionId === 'REC-05');
      expect(orphanFlag).toBeDefined();
      expect(orphanFlag?.classification).toBe('ORPHAN_UNATTRIBUTED');
    });
  });
});
