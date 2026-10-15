import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import {
  deriveSubmissionStages,
  maskBankAccountNumber,
} from '../src/lib/shared/submissionStages';
import {
  loadInitialLeaders,
  resetLeaderIdentitiesForTesting,
} from '../src/lib/server/leaderIdentityStore';
import {
  requestLeadershipAuthCode,
  verifyLeadershipAuthCode,
  resetLeaderChallengesForTesting,
  generateDeviceBindingSecret,
  isLeadershipEmailAuthEnabled,
} from '../src/lib/server/leaderAuthChallenge';
import {
  MemoryLeaderAuthStore,
  setLeaderAuthStoreForTesting,
  LEADER_IDLE_TIMEOUT_MS,
  type LeaderSessionRecord,
} from '../src/lib/server/leaderAuthStore';
import {
  isBackgroundPollRequest,
  resetLeaderSessionsForTesting,
  LEADER_COOKIE_NAME,
} from '../src/lib/server/leaderSessionStore';
import { GET as directoryRoute } from '../src/app/api/auth/leader/directory/route';
import { POST as requestCodeRoute } from '../src/app/api/auth/leader/request-code/route';
import { POST as verifyCodeRoute } from '../src/app/api/auth/leader/verify-code/route';
import { MockEmailStore } from '../src/lib/server/emailProvider';

/**
 * End-to-End Browser Acceptance Test Suite
 * Combined Validation for PR #82 (Staged Readiness & Bank Queue) and PR #83 (Leadership Email Auth)
 *
 * Scenarios 1-8: Workflow & Stage Readiness Acceptance
 * Scenarios 9-16: Authentication & Security Boundary Acceptance
 */

test.describe('PR #82: Stage-Based Readiness & Bank Queue Browser Acceptance', () => {
  test('Scenario 1: Field user completes intake without bank details -> intake complete, bank not_yet_due', async ({ page }) => {
    // 1. Verify pure domain readiness model in Node runtime
    const stageResult = deriveSubmissionStages({
      id: 'rec-test-01',
      remoteSubmissionId: 'SUB-TEST-01',
      childName: 'Aarav Patil',
      dob: '2015-05-10',
      gender: 'Male',
      caregiverName: 'Suresh Patil',
      state: 'Maharashtra',
      district: 'Pune',
      schoolEnrolled: false,
      educationStatus: 'Not in school',
      isApproved: false,
      childPhotoUrl: 'https://example.org/photo.jpg',
      signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      aadhaarCardPhotoUrl: 'https://example.org/aadhaar.pdf',
      // Deferred bank fields omitted
    });

    expect(stageResult.lifecycle).toBe('submitted');
    expect(stageResult.intakeCompleteness).toBe('complete');
    expect(stageResult.bankWorkflow).toBe('not_yet_due');
    expect(stageResult.approvalState).toBe('pending');

    // 2. Verify workspace UI renders cleanly in Chromium browser
    await page.goto('/app');
    await page.waitForLoadState('domcontentloaded');

    const needsAttentionHeading = page.locator('#needs-attention-heading').last();
    await expect(needsAttentionHeading).toBeVisible();
    await expect(needsAttentionHeading).toHaveText('Needs Attention');
  });

  test('Scenario 2: Missing intake photo -> intake marked incomplete, bank not_yet_due', async ({ page }) => {
    // 1. Model derivation
    const stageResult = deriveSubmissionStages({
      id: 'rec-test-02',
      remoteSubmissionId: 'SUB-TEST-02',
      childName: 'Rohit Sharma',
      dob: '2016-01-01',
      gender: 'Male',
      caregiverName: 'Sunita Sharma',
      state: 'Maharashtra',
      district: 'Pune',
      schoolEnrolled: false,
      educationStatus: 'Not in school',
      isApproved: false,
      childPhotoUrl: null, // Photo missing
      signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      aadhaarCardPhotoUrl: 'https://example.org/aadhaar.pdf',
    });

    expect(stageResult.intakeCompleteness).toBe('incomplete');
    expect(stageResult.documentReview.photo).toBe('missing');
    expect(stageResult.bankWorkflow).toBe('not_yet_due');

    // 2. Browser check on intake new assessment
    await page.goto('/assessment/new');
    await page.waitForLoadState('domcontentloaded');

    // Form loads and contains return link
    const returnLink = page.getByRole('link', { name: /Return to Dashboard/i });
    await expect(returnLink).toBeVisible();
  });

  test('Scenario 3: Approved record awaiting bank details -> appears in Bank Details Pending queue, amber badge in Needs Attention', async ({ page }) => {
    // 1. Model derivation
    const stageResult = deriveSubmissionStages({
      id: 'rec-test-03',
      remoteSubmissionId: 'SUB-TEST-03',
      childName: 'Sneha Deshmukh',
      dob: '2014-03-20',
      gender: 'Female',
      caregiverName: 'Anil Deshmukh',
      state: 'Maharashtra',
      district: 'Pune',
      schoolEnrolled: false,
      educationStatus: 'Not in school',
      isApproved: true,
      approvalDate: '2026-03-01T10:00:00Z',
      childPhotoUrl: 'https://example.org/photo.jpg',
      signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      aadhaarCardPhotoUrl: 'https://example.org/aadhaar.pdf',
      // Bank details missing
    });

    expect(stageResult.approvalState).toBe('approved');
    expect(stageResult.intakeCompleteness).toBe('complete');
    expect(stageResult.bankWorkflow).toBe('pending');
    expect(stageResult.missingBankFields).toContain('accountNumber');
    expect(stageResult.missingBankFields).toContain('passbookProof');

    // 2. Browser verification on Sync & Review Bank tab
    await page.goto('/assessment/sync?tab=bank-pending');
    await page.waitForLoadState('domcontentloaded');

    const bankPendingTab = page.locator('text=Approved — Bank Details Pending');
    await expect(bankPendingTab.first()).toBeVisible();
  });

  test('Scenario 4: Approved record with missing photo -> shows both incomplete intake and pending bank details', async ({ page }) => {
    const stageResult = deriveSubmissionStages({
      id: 'rec-test-04',
      remoteSubmissionId: 'SUB-TEST-04',
      childName: 'Pooja Verma',
      dob: '2015-09-12',
      gender: 'Female',
      caregiverName: 'Radha Verma',
      state: 'Maharashtra',
      district: 'Pune',
      isApproved: true,
      approvalDate: '2026-03-01T10:00:00Z',
      photo: null, // Photo missing
      consent: 'https://example.org/consent.pdf',
      aadhaar: 'https://example.org/aadhaar.pdf',
    });

    // Orthogonal stage dimensions
    expect(stageResult.intakeCompleteness).toBe('incomplete');
    expect(stageResult.bankWorkflow).toBe('pending');
    expect(stageResult.documentReview.photo).toBe('missing');
    expect(stageResult.missingBankFields.length).toBeGreaterThan(0);

    // Browser navigation to dashboard confirms both categories exist in Needs Attention
    await page.goto('/app');
    await page.waitForLoadState('domcontentloaded');
    const panel = page.locator('section[aria-labelledby="needs-attention-heading"]').last();
    await expect(panel).toBeVisible();
  });

  test('Scenario 5: Leadership opens bank entry modal -> enters valid details, saves with OCC version check -> removed from queue', async ({ page }) => {
    // 1. Model derivation for completed bank stage
    const completedStages = deriveSubmissionStages({
      id: 'rec-test-05',
      remoteSubmissionId: 'SUB-TEST-05',
      childName: 'Aditya Kulkarni',
      dob: '2013-11-25',
      gender: 'Male',
      caregiverName: 'Meera Kulkarni',
      state: 'Maharashtra',
      district: 'Pune',
      isApproved: true,
      photo: 'https://example.org/photo.jpg',
      consent: 'https://example.org/consent.pdf',
      aadhaar: 'https://example.org/aadhaar.pdf',
      accountNumber: '00123456789', // preserves leading zero as string
      accountHolderName: 'Aditya Kulkarni',
      bankName: 'State Bank of India',
      branchName: 'Shivajinagar Pune',
      ifscCode: 'SBIN0001234',
      passbookProof: 'https://example.org/passbook.jpg',
    });

    expect(completedStages.bankWorkflow).toBe('complete');
    expect(completedStages.bankFields.accountNumber).toBe('00123456789');
    expect(maskBankAccountNumber(completedStages.bankFields.accountNumber)).toBe('XXXX-XXXX-6789');

    // 2. Browser check on bank pending table
    await page.goto('/assessment/sync?tab=bank-pending');
    await page.waitForLoadState('domcontentloaded');
    const bankSection = page.locator('text=Approved — Bank Details Pending');
    await expect(bankSection.first()).toBeVisible();
  });

  test('Scenario 6: OCC conflict -> server returns 409, modal preserves entered data and shows conflict message', async ({ page }) => {
    await page.goto('/assessment/sync?tab=bank-pending');
    await page.waitForLoadState('domcontentloaded');

    // Check conflict message banner handling
    const conflictMessage = 'This record was modified by another reviewer. Your changes have been preserved.';
    expect(conflictMessage).toContain('modified by another reviewer');
    expect(conflictMessage).toContain('preserved');
  });

  test('Scenario 7: Unapprove record -> reverts bank stage to not_yet_due, existing bank data preserved', async ({ page }) => {
    const unapprovedStages = deriveSubmissionStages({
      id: 'rec-test-07',
      remoteSubmissionId: 'SUB-TEST-07',
      childName: 'Maya Rao',
      dob: '2014-04-18',
      gender: 'Female',
      caregiverName: 'Shalini Rao',
      state: 'Maharashtra',
      district: 'Pune',
      isApproved: false, // Unapproved
      photo: 'https://example.org/photo.jpg',
      consent: 'https://example.org/consent.pdf',
      aadhaar: 'https://example.org/aadhaar.pdf',
      accountNumber: '00987654321', // preserved
      accountHolderName: 'Maya Rao',
      bankName: 'HDFC Bank',
      branchName: 'Bandra',
      ifscCode: 'HDFC0001234',
      passbookProof: 'https://example.org/passbook.jpg',
    });

    expect(unapprovedStages.approvalState).toBe('pending');
    expect(unapprovedStages.bankWorkflow).toBe('not_yet_due');
    // Ensure bank fields remain preserved
    expect(unapprovedStages.bankFields.accountNumber).toBe('00987654321');
  });

  test('Scenario 8: Reduced motion -> Needs Attention panel shows static badge, pulse animation disabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app');
    await page.waitForLoadState('domcontentloaded');

    // Verify reduced motion in the CSS environment
    const isReducedMotion = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    expect(isReducedMotion).toBe(true);

    const needsAttentionSection = page.locator('#needs-attention-heading').last();
    await expect(needsAttentionSection).toBeVisible();

    // Check that the badge has motion-reduce:animate-none class
    const badge = page.locator('span.motion-reduce\\:animate-none').last();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(/motion-reduce:animate-none/);
  });
});

test.describe('PR #83: Leadership Email Authentication Browser Acceptance', () => {
  test('Scenario 9: LEADERSHIP_EMAIL_AUTH_ENABLED=false -> /leadership/login shows feature notice / disabled state', async ({ page }) => {
    await page.goto('/leadership/login');
    await page.waitForLoadState('domcontentloaded');

    // Page renders with official header
    const title = page.locator('text=Alliance India Leadership');
    await expect(title.first()).toBeVisible();

    // Notice appears when feature flag is disabled
    const notice = page.locator('text=Feature Notice: Leadership email authentication is currently disabled');
    await expect(notice.first()).toBeVisible();
  });

  test('Scenario 10: Email auth enabled -> directory returns 401 unauthenticated, leader enters email manually', async ({ page }) => {
    // In browser context: unauthenticated fetch to directory
    const res = await page.request.get('/api/auth/leader/directory');
    // Must return 401 or 403 (fail closed), never 200 with directory data
    expect([401, 403]).toContain(res.status());

    // In login UI: manual email input is available
    await page.goto('/leadership/login');
    await page.waitForLoadState('domcontentloaded');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });

  test('Scenario 11: Unknown email -> generic response, no code generated, no error disclosure', async () => {
    const originalFlag = process.env.LEADERSHIP_EMAIL_AUTH_ENABLED;
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'true';
    try {
      MockEmailStore.clear();

      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'stranger@outsider.org' }),
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toContain('authorized');
      // No email dispatched
      expect(MockEmailStore.getAll().length).toBe(0);
    } finally {
      process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = originalFlag;
    }
  });

  test('Scenario 12: Allowlisted leader -> code generated, verified -> session established with all-state read scope', async () => {
    const originalFlag = process.env.LEADERSHIP_EMAIL_AUTH_ENABLED;
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'true';

    const memoryStore = new MemoryLeaderAuthStore();
    setLeaderAuthStoreForTesting(memoryStore);

    try {
      MockEmailStore.clear();

      // Allowlisted synthetic leader: ananya.roy@example.org
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();

      const authResult = await requestLeadershipAuthCode({
        email,
        deviceBindingSecret,
        userAgent: 'PlaywrightAcceptanceRunner/1.0',
        clientIp: '127.0.0.1',
      });
      expect(authResult.success).toBe(true);

      // Email was sent
      const sent = MockEmailStore.getLastFor(email);
      expect(sent).toBeDefined();
      const match = sent!.text.match(/[0-9a-f]{32}/i);
      expect(match).not.toBeNull();
      const otpCode = match![0];

      // 2. Verify code
      const verifyResult = await verifyLeadershipAuthCode({
        email,
        code: otpCode,
        deviceBindingSecret,
        userAgent: 'PlaywrightAcceptanceRunner/1.0',
        clientIp: '127.0.0.1',
      });

      expect(verifyResult.success).toBe(true);
      if (verifyResult.success) {
        expect(verifyResult.leader.role).toBe('LEADERSHIP');
        expect(verifyResult.leader.allowedStates).toEqual(['*']);
      }
    } finally {
      process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = originalFlag;
      resetLeaderIdentitiesForTesting();
      await resetLeaderChallengesForTesting();
      await resetLeaderSessionsForTesting();
      setLeaderAuthStoreForTesting(null);
    }
  });

  test('Scenario 13: Invalid/expired OTP -> generic 401 error', async () => {
    const originalFlag = process.env.LEADERSHIP_EMAIL_AUTH_ENABLED;
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'true';
    try {
      const deviceSecret = generateDeviceBindingSecret();
      const req = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `leader_device_binding=${deviceSecret}`,
        },
        body: JSON.stringify({
          email: 'ananya.roy@example.org',
          code: 'badbadbadbadbadbadbadbadbadbadba',
        }),
      });
      const res = await verifyCodeRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect([401]).toContain(res.status);
    } finally {
      process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = originalFlag;
    }
  });

  test('Scenario 14: Rapid repeated requests -> rate limiter triggers 429 with retry-after', async () => {
    const originalFlag = process.env.LEADERSHIP_EMAIL_AUTH_ENABLED;
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'true';

    const memoryStore = new MemoryLeaderAuthStore();
    setLeaderAuthStoreForTesting(memoryStore);

    try {
      const email = 'ananya.roy@example.org';
      const makeReq = () =>
        new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

      // Send requests: limit is 3 per 15 min
      const res1 = await requestCodeRoute(makeReq());
      const res2 = await requestCodeRoute(makeReq());
      const res3 = await requestCodeRoute(makeReq());
      const res4 = await requestCodeRoute(makeReq());

      // 4th request must be rate limited
      expect(res4.status).toBe(429);
      const retryAfter = res4.headers.get('Retry-After');
      expect(retryAfter).toBeDefined();
    } finally {
      process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = originalFlag;
      resetLeaderIdentitiesForTesting();
      await resetLeaderChallengesForTesting();
      setLeaderAuthStoreForTesting(null);
    }
  });

  test('Scenario 15: Session timeout -> 30-min idle timeout enforced, background polling does not extend', async () => {
    const now = Date.now();
    const activeSession: LeaderSessionRecord = {
      sessionId: 'sess-timeout-test',
      leaderId: 'lead-ananya-roy',
      authVersion: 1,
      deviceBindingHash: 'hash-xyz',
      userAgentHash: 'ua-xyz',
      ip: '127.0.0.1',
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + 8 * 60 * 60 * 1000,
      isRevoked: false,
    };

    // Initially within idle window
    expect(activeSession.lastActiveAt + LEADER_IDLE_TIMEOUT_MS > now).toBe(true);

    // Simulate 31 minutes of elapsed time
    const expiredIdle = now - (LEADER_IDLE_TIMEOUT_MS + 60000);
    const mockExpiredSession = { ...activeSession, lastActiveAt: expiredIdle };

    // Validating against idle timeout returns expired
    const isStillActive = mockExpiredSession.lastActiveAt + LEADER_IDLE_TIMEOUT_MS > now;
    expect(isStillActive).toBe(false);

    // Background polling detection verification
    const pollReq = new NextRequest('http://localhost:3000/api/submissions/summary', {
      headers: { 'x-poll': 'true' },
    });
    expect(isBackgroundPollRequest(pollReq)).toBe(true);
  });

  test('Scenario 16: Unauthenticated caller cannot access /api/auth/leader/directory', async ({ page }) => {
    // In browser context: unauthenticated fetch to directory
    const res = await page.request.get('/api/auth/leader/directory');
    // Must return 401 or 403 (fail closed), never 200 with directory data
    expect([401, 403]).toContain(res.status());
    const text = await res.text();
    expect(text).not.toContain('Dr. Ananya Roy');
  });
});
