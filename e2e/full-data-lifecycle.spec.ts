/**
 * Full Data Lifecycle & Concurrency E2E Certification Suite
 * Viewport: 390px mobile and API level verification
 * 
 * Strict Safety:
 * - Uses 100% synthetic data generated with syntheticAssessmentFactory.
 * - Labels all records with E2E_TEST_DO_NOT_USE_REAL_DATA_<timestamp>.
 * - Asserts canonical acknowledgment, idempotency, read parity, OCC updates,
 *   and 409 conflict surfacing.
 */

import { test, expect } from '@playwright/test';
import {
  createSyntheticSubmission,
  createSyntheticPatch,
  generateTestUuid,
} from '../src/test/fixtures/syntheticAssessmentFactory';

test.describe('End-to-End Data Lifecycle Certification', () => {
  const runTimestamp = Date.now();
  const runId = `run-${runTimestamp}`;

  test('Step 1-6: Complete Online Assessment Creation & Idempotency Gate', async ({ request }) => {
    const syntheticPayload = createSyntheticSubmission({
      runId,
      orphanStatus: 'Both parents alive',
      educationStatus: 'Currently going to school',
      withDocuments: true,
      withSignature: true,
    });

    const idempotencyKey = `idem-${syntheticPayload.uuid}`;

    // 1. Initial Creation
    const createRes = await request.post('/api/submissions', {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      data: syntheticPayload,
    });

    expect(createRes.status()).toBe(201);
    const createData = await createRes.json();
    expect(createData.status).toBe('success');
    expect(createData.acknowledged).toBe(true);
    expect(createData.remoteSubmissionId).toBeTruthy();
    expect(createData.version).toBe(1);
    expect(createData.isDuplicate).toBeFalsy();

    const canonicalId = createData.remoteSubmissionId;

    // 2. Idempotent Duplicate Submission
    const duplicateRes = await request.post('/api/submissions', {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      data: syntheticPayload,
    });

    expect(duplicateRes.status()).toBe(200);
    const duplicateData = await duplicateRes.json();
    expect(duplicateData.status).toBe('success');
    expect(duplicateData.acknowledged).toBe(true);
    expect(duplicateData.isDuplicate).toBe(true);
    expect(duplicateData.remoteSubmissionId).toBe(canonicalId);
    expect(duplicateData.version).toBe(1);
  });

  test('Step 7-9: Canonical Record Read & Field Integrity Verification', async ({ request }) => {
    const syntheticPayload = createSyntheticSubmission({
      runId,
      customWeight: 18.2,
      customHeight: 110.0,
      withDocuments: true,
      withSignature: true,
    });

    const idempotencyKey = `idem-${syntheticPayload.uuid}`;
    const createRes = await request.post('/api/submissions', {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      data: syntheticPayload,
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    const submissionId = created.remoteSubmissionId;

    // Read canonical record
    const readRes = await request.get(`/api/submissions/${encodeURIComponent(submissionId)}`);
    expect(readRes.status()).toBe(200);
    const readBody = await readRes.json();
    expect(readBody.status).toBe('success');
    expect(readBody.data).toBeTruthy();

    const record = readBody.data;
    expect(record.childName || record.child_name).toBe(syntheticPayload.demographics.childName);
    expect(Number(record.weightKg || record.weight_kg)).toBe(18.2);
    expect(Number(record.heightCm || record.height_cm)).toBe(110.0);
    expect(readBody.version).toBe(1);

    // Verify Drive Asset links are not raw base64 data URLs
    if (record.signatureDataUrl) {
      expect(record.signatureDataUrl).not.toContain('data:image');
    }
  });

  test('Step 10-12: Allowlisted Edit & Optimistic Concurrency Revision (1 -> 2)', async ({ request }) => {
    const syntheticPayload = createSyntheticSubmission({ runId });
    const createRes = await request.post('/api/submissions', {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `create-${syntheticPayload.uuid}`,
      },
      data: syntheticPayload,
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    const submissionId = created.remoteSubmissionId;

    // Apply allowlisted PATCH with expectedVersion: 1
    const patchPayload = createSyntheticPatch(1, { runId });
    const patchRes = await request.patch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
      headers: {
        'Content-Type': 'application/json',
        'If-Match': '"1"',
        'Idempotency-Key': `patch-${submissionId}-1`,
      },
      data: patchPayload,
    });

    expect(patchRes.status()).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.status).toBe('success');
    expect(patchBody.acknowledged).toBe(true);
    expect(patchBody.version).toBe(2);

    // Verify the record now reflects the updated weight and version 2
    const verifyRes = await request.get(`/api/submissions/${encodeURIComponent(submissionId)}`);
    expect(verifyRes.status()).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.version).toBe(2);
    expect(Number(verifyBody.data.weightKg || verifyBody.data.weight_kg)).toBe(17.2);
    expect(verifyBody.data.contactNumber || verifyBody.data.caregiverPhone).toBe('9820099887');
  });

  test('Step 13: Stale Concurrent Edit Detection (OCC 409 Conflict)', async ({ request }) => {
    const syntheticPayload = createSyntheticSubmission({ runId });
    const createRes = await request.post('/api/submissions', {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `create-${syntheticPayload.uuid}`,
      },
      data: syntheticPayload,
    });
    const created = await createRes.json();
    const submissionId = created.remoteSubmissionId;

    // Worker A commits Revision 2
    const patchA = createSyntheticPatch(1, { runId });
    const patchResA = await request.patch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
      headers: {
        'Content-Type': 'application/json',
        'If-Match': '"1"',
      },
      data: patchA,
    });
    expect(patchResA.status()).toBe(200);

    // Worker B attempts to commit using stale expectedVersion: 1
    const patchB = {
      expectedVersion: 1,
      weightKg: 19.0,
      remarks: 'Conflicting concurrent edit attempt',
    };
    const patchResB = await request.patch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
      headers: {
        'Content-Type': 'application/json',
        'If-Match': '"1"',
      },
      data: patchB,
    });

    expect(patchResB.status()).toBe(409);
    const conflictBody = await patchResB.json();
    expect(conflictBody.code).toBe('CONCURRENCY_CONFLICT');
    expect(conflictBody.currentVersion).toBe(2);
    expect(conflictBody.expectedVersion).toBe(1);

    // Verify Worker B did not overwrite newer Version 2 data
    const verifyRes = await request.get(`/api/submissions/${encodeURIComponent(submissionId)}`);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.version).toBe(2);
    expect(Number(verifyBody.data.weightKg || verifyBody.data.weight_kg)).toBe(17.2); // Retains Worker A value
  });

  test('Step 14: Caregiver Consent Enforcement Gate (Server-side 422)', async ({ request }) => {
    const invalidPayload: any = createSyntheticSubmission({ runId });
    // Remove or deny consent
    invalidPayload.caregiverConsent = {
      consentProvided: false,
      caregiverName: 'Refusing Caregiver',
    };

    const res = await request.post('/api/submissions', {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `consent-test-${Date.now()}`,
      },
      data: invalidPayload,
    });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.issues.some((i: any) => i.path.includes('caregiverConsent'))).toBe(true);
  });

  test('Mobile Viewport (390px): Assessment Wizard Intake UI Rendering', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Navigate to field dashboard
    await page.goto('/app');
    await expect(page.locator('text=Child Nutrition & Support Form')).toBeVisible();

    // Click New Assessment
    const newSurveyBtn = page.locator('a[href="/assessment/new"]').first();
    await expect(newSurveyBtn).toBeVisible();
    await newSurveyBtn.click();

    // Verify wizard opens at 390px without horizontal scroll
    await page.waitForURL('**/assessment/new');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Verify Consent section and agreement radio controls render
    await expect(page.locator('#sec-consent')).toBeVisible();
    await expect(page.locator('input[name="agreeToParticipate"]').first()).toBeVisible();
  });
});
