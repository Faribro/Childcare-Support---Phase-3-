import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSubmissionDetailRoute } from '@/app/api/submissions/[submissionId]/route';
import { GET as getAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { GET as getHistoryRoute } from '@/app/api/submissions/[submissionId]/history/route';
import { GET as getExportRoute } from '@/app/api/submissions/[submissionId]/export/route';
import { POST as postSyncRetryRoute } from '@/app/api/submissions/[submissionId]/sync-retry/route';
import { createSessionToken } from '@/lib/server/sessionService';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { initializeTestFixtures } from '@/lib/server/credentialRegistry';

describe('Single-Record Access Policy: Own-Record FIELD_USER, Jurisdiction STATE_REVIEWER, National LEADERSHIP', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'a_very_secure_test_session_secret_for_cryptographic_signing_32_chars_long!';
    (process.env as any).NODE_ENV = 'test';
    await initializeTestFixtures();
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('1. Allows FIELD_USER to access their own authored record across detail, attachment, history, and PDF export', async () => {
    const ownerToken = createSessionToken({
      userId: 'worker-anil',
      role: 'FIELD_USER',
      name: 'Anil Deshmukh',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
    });

    const detailRes = await getSubmissionDetailRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${ownerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.data.uniqueId).toBe('MH-PUN-081200-02');
    expect(detailJson.capabilities.canEdit).toBe(true);

    const assetRes = await getAssetRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/asset?docType=aadhaarCardPhoto', {
        headers: { cookie: `evaluation_session_token=${ownerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(assetRes.status).toBe(200);

    const historyRes = await getHistoryRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/history', {
        headers: { cookie: `evaluation_session_token=${ownerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(historyRes.status).toBe(200);

    const exportRes = await getExportRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/export', {
        headers: { cookie: `evaluation_session_token=${ownerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-type')).toContain('application/pdf');
  });

  it('2. Denies non-author FIELD_USER within the SAME state and district across detail, attachment, history, export, and sync-retry', async () => {
    const peerWorkerToken = createSessionToken({
      userId: 'worker-peer-pune',
      role: 'FIELD_USER',
      name: 'Other Pune Caseworker',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
    });

    const detailRes = await getSubmissionDetailRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${peerWorkerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(detailRes.status).toBe(403);
    const detailJson = await detailRes.json();
    expect(detailJson.code).toBe('FORBIDDEN_AUTHOR_MISMATCH');
    expect(detailJson.data).toBeUndefined();

    const assetRes = await getAssetRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/asset?docType=aadhaarCardPhoto', {
        headers: { cookie: `evaluation_session_token=${peerWorkerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(assetRes.status).toBe(403);
    const assetJson = await assetRes.json();
    expect(assetJson.code).toBe('FORBIDDEN_AUTHOR_MISMATCH');
    expect(assetJson.url).toBeUndefined();
    expect(assetJson.data).toBeUndefined();

    const historyRes = await getHistoryRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/history', {
        headers: { cookie: `evaluation_session_token=${peerWorkerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(historyRes.status).toBe(403);
    const historyJson = await historyRes.json();
    expect(historyJson.code).toBe('FORBIDDEN_AUTHOR_MISMATCH');
    expect(historyJson.history).toBeUndefined();

    const exportRes = await getExportRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/export', {
        headers: { cookie: `evaluation_session_token=${peerWorkerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(exportRes.status).toBe(403);
    expect(exportRes.headers.get('content-type')).toContain('application/json');
    expect((await exportRes.json()).code).toBe('FORBIDDEN_AUTHOR_MISMATCH');

    const retryRes = await postSyncRetryRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/sync-retry', {
        method: 'POST',
        headers: { cookie: `evaluation_session_token=${peerWorkerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );
    expect(retryRes.status).toBe(403);
    expect((await retryRes.json()).code).toBe('FORBIDDEN_AUTHOR_MISMATCH');
  });

  it('3. Denies FIELD_USER and out-of-state STATE_REVIEWER accessing a record in another state (Delhi) across all single-record endpoints', async () => {
    const mhFieldToken = createSessionToken({
      userId: 'worker-anil',
      role: 'FIELD_USER',
      name: 'Anil Deshmukh',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
    });
    const mhReviewerToken = createSessionToken({
      userId: 'rev-mh-01',
      role: 'STATE_REVIEWER',
      name: 'Maharashtra Evaluator',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
      canEdit: true,
    });

    for (const token of [mhFieldToken, mhReviewerToken]) {
      const detailRes = await getSubmissionDetailRoute(
        new NextRequest('http://localhost:3000/api/submissions/DL-CEN-081200-03', {
          headers: { cookie: `evaluation_session_token=${token}` },
        }),
        { params: { submissionId: 'DL-CEN-081200-03' } }
      );
      expect(detailRes.status).toBe(403);
      expect((await detailRes.json()).code).toBe('FORBIDDEN_SCOPE');

      const assetRes = await getAssetRoute(
        new NextRequest('http://localhost:3000/api/submissions/DL-CEN-081200-03/asset?docType=aadhaarCardPhoto', {
          headers: { cookie: `evaluation_session_token=${token}` },
        }),
        { params: { submissionId: 'DL-CEN-081200-03' } }
      );
      expect(assetRes.status).toBe(403);
      expect((await assetRes.json()).code).toBe('FORBIDDEN_SCOPE');

      const historyRes = await getHistoryRoute(
        new NextRequest('http://localhost:3000/api/submissions/DL-CEN-081200-03/history', {
          headers: { cookie: `evaluation_session_token=${token}` },
        }),
        { params: { submissionId: 'DL-CEN-081200-03' } }
      );
      expect(historyRes.status).toBe(403);
      expect((await historyRes.json()).code).toBe('FORBIDDEN_SCOPE');

      const exportRes = await getExportRoute(
        new NextRequest('http://localhost:3000/api/submissions/DL-CEN-081200-03/export', {
          headers: { cookie: `evaluation_session_token=${token}` },
        }),
        { params: { submissionId: 'DL-CEN-081200-03' } }
      );
      expect(exportRes.status).toBe(403);
      expect((await exportRes.json()).code).toBe('FORBIDDEN_SCOPE');

      const retryRes = await postSyncRetryRoute(
        new NextRequest('http://localhost:3000/api/submissions/DL-CEN-081200-03/sync-retry', {
          method: 'POST',
          headers: { cookie: `evaluation_session_token=${token}` },
        }),
        { params: { submissionId: 'DL-CEN-081200-03' } }
      );
      expect(retryRes.status).toBe(403);
      expect((await retryRes.json()).code).toBe('FORBIDDEN_SCOPE');
    }
  });

  it('4. Preserves authorised STATE_REVIEWER (in-state) and LEADERSHIP (national) access across detail, attachment, history, and PDF export', async () => {
    const mhReviewerToken = createSessionToken({
      userId: 'rev-mh-01',
      role: 'STATE_REVIEWER',
      name: 'Maharashtra Evaluator',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
      canEdit: true,
    });
    const leadershipToken = createSessionToken({
      userId: 'lead-faridsayyed1010',
      role: 'LEADERSHIP',
      name: 'National Lead',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    });

    for (const [token, id] of [
      [mhReviewerToken, 'MH-PUN-081200-02'],
      [leadershipToken, 'MH-PUN-081200-02'],
      [leadershipToken, 'DL-CEN-081200-03'],
    ] as const) {
      expect(
        (
          await getSubmissionDetailRoute(
            new NextRequest(`http://localhost:3000/api/submissions/${id}`, {
              headers: { cookie: `evaluation_session_token=${token}` },
            }),
            { params: { submissionId: id } }
          )
        ).status
      ).toBe(200);

      expect(
        (
          await getAssetRoute(
            new NextRequest(`http://localhost:3000/api/submissions/${id}/asset?docType=aadhaarCardPhoto`, {
              headers: { cookie: `evaluation_session_token=${token}` },
            }),
            { params: { submissionId: id } }
          )
        ).status
      ).toBe(200);

      expect(
        (
          await getHistoryRoute(
            new NextRequest(`http://localhost:3000/api/submissions/${id}/history`, {
              headers: { cookie: `evaluation_session_token=${token}` },
            }),
            { params: { submissionId: id } }
          )
        ).status
      ).toBe(200);

      expect(
        (
          await getExportRoute(
            new NextRequest(`http://localhost:3000/api/submissions/${id}/export`, {
              headers: { cookie: `evaluation_session_token=${token}` },
            }),
            { params: { submissionId: id } }
          )
        ).status
      ).toBe(200);
    }
  });

  it('5. Allows owning FIELD_USER to trigger POST /api/submissions/[submissionId]/sync-retry', async () => {
    const ownerToken = createSessionToken({
      userId: 'worker-anil',
      role: 'FIELD_USER',
      name: 'Anil Deshmukh',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
    });

    vi.spyOn(canonicalSubmissionAdapter, 'getDataEngine').mockReturnValue('sheets');
    vi.spyOn(canonicalSubmissionAdapter, 'getAppsScriptUrl').mockReturnValue('https://example.invalid/apps-script');
    vi.spyOn(canonicalSubmissionAdapter, 'getWebhookSecret').mockReturnValue('test-webhook-secret');
    vi.spyOn(canonicalSubmissionAdapter, 'isConfigured').mockReturnValue(true);
    vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValue({
      status: 'success',
      statusCode: 200,
      version: 1,
      remoteSubmissionId: 'MH-PUN-081200-02',
      data: {
        uniqueId: 'MH-PUN-081200-02',
        authorId: 'worker-anil',
        state: 'Maharashtra',
        district: 'Pune',
        version: 1,
      },
    });
    vi.spyOn(canonicalSubmissionAdapter, 'updateSubmission').mockResolvedValue({
      status: 'success',
      statusCode: 200,
      acknowledged: true,
      version: 2,
      remoteSubmissionId: 'MH-PUN-081200-02',
    });

    const retryRes = await postSyncRetryRoute(
      new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/sync-retry', {
        method: 'POST',
        headers: { cookie: `evaluation_session_token=${ownerToken}` },
      }),
      { params: { submissionId: 'MH-PUN-081200-02' } }
    );

    expect(retryRes.status).toBe(200);
    const json = await retryRes.json();
    expect(json.status).toBe('success');
    expect(json.syncStatus).toBe('SYNCED');
  });

  it('6. Preserves ownership compatibility for legitimate older records keyed by submittedByWorkerId, authorIdentifier, userId, or Firestore top-level authorId', async () => {
    const legacyOwnerToken = createSessionToken({
      userId: 'fld_legacy_owner_01',
      role: 'FIELD_USER',
      name: 'Legacy Worker',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
    });

    const legacyVariants = [
      { submittedByWorkerId: 'fld_legacy_owner_01' },
      { authorIdentifier: 'fld_legacy_owner_01' },
      { userId: 'fld_legacy_owner_01' },
    ];

    for (const [idx, variant] of legacyVariants.entries()) {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        version: 1,
        remoteSubmissionId: `LEGACY-${idx}`,
        data: {
          uniqueId: `LEGACY-${idx}`,
          childName: 'Legacy Child',
          state: 'Maharashtra',
          district: 'Pune',
          ...variant,
        },
      });

      const res = await getSubmissionDetailRoute(
        new NextRequest(`http://localhost:3000/api/submissions/LEGACY-${idx}`, {
          headers: { cookie: `evaluation_session_token=${legacyOwnerToken}` },
        }),
        { params: { submissionId: `LEGACY-${idx}` } }
      );
      expect(res.status).toBe(200);
    }

    // Firestore top-level authorId preserved alongside nested payload without duplicating inside payload
    vi.spyOn(canonicalSubmissionAdapter, 'getDataEngine').mockReturnValue('firestore' as any);
    vi.spyOn(canonicalSubmissionAdapter, 'getFirestoreAdapter').mockResolvedValue({
      getSubmission: async () => ({
        id: 'FS-LEGACY-01',
        uniqueId: 'FS-LEGACY-01',
        authorId: 'fld_legacy_owner_01',
        state: 'Maharashtra',
        district: 'Pune',
        version: 1,
        payload: {
          childName: 'Legacy Firestore Child',
          demographics: { state: 'Maharashtra', district: 'Pune' },
        },
      }),
    });

    const fsRes = await getSubmissionDetailRoute(
      new NextRequest('http://localhost:3000/api/submissions/FS-LEGACY-01', {
        headers: { cookie: `evaluation_session_token=${legacyOwnerToken}` },
      }),
      { params: { submissionId: 'FS-LEGACY-01' } }
    );
    expect(fsRes.status).toBe(200);
  });
});
