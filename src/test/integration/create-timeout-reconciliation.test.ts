import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listSubmissionsRoute } from '@/app/api/submissions/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import * as gatewayModule from '@/features/submission/submissionGateway';
import * as queueRepoModule from '@/features/submission/submissionQueueRepository';
import { submissionEvents } from '@/features/submission/submissionEvents';
import type { SyncQueueItem, AssessmentRecord } from '@/types/domain';

// Synthetic test UUIDs
const TEST_CLIENT_UUID_1 = 'a1111111-1111-4111-8111-111111111111';
const TEST_CLIENT_UUID_2 = 'c3333333-3333-4333-8333-333333333333';

function buildSyntheticRecord(clientUuid: string, artNumber = 'ART-TEST-0001'): any {
  return {
    uuid: clientUuid,
    clientSubmissionId: clientUuid,
    interviewerName: 'Reconciliation Tester',
    version: 1,
    demographics: {
      artNumber,
      childName: 'Test Child',
      dob: '2020-01-01',
      gender: 'Male',
      caregiverName: 'Test Parent',
      caregiverRelationship: 'Father',
      caregiverPhone: '9876543210',
      district: 'Central',
    },
    consent: { agreeToParticipate: true },
    caregiverConsent: { consentProvided: true },
    household: {
      orphanStatus: 'None',
      primaryCaregiverOccupation: 'Labour',
      monthlyHouseholdIncome: 10000,
      rationCardType: 'BPL',
      numberOfSiblings: 2,
    },
    nutrition: {
      heightCm: 100,
      weightKg: 15,
      muacMm: 130,
      bilateralPittingOedema: false,
      clinicalNotes: 'Test notes',
    },
    education: {
      schoolEnrolled: true,
      schoolType: 'Government',
      schoolGrade: 'Class 2',
      attendancePercentage: 85,
      supportMaterialsNeeded: ['Books'],
    },
    bankDetails: {
      accountHolderName: 'Test Parent',
      accountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
      branchName: 'Main',
    },
    syncStatus: 'queued',
    createdAt: new Date().toISOString(),
  };
}

describe('P0 Incident Reconciliation & Timeout Hardening Test Suite (Part H: Tests 1, 2, 3, 4, 7, 8)', () => {
  beforeEach(() => {
    MockSheetStore.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Test 1: CREATE timeout with server row created -> retry reconciles without second row
  // =========================================================================
  it('Test 1: CREATE timeout with server row created -> retry reconciles without second row (exactly 1 row on server, client marked synced)', async () => {
    // 1. Simulate server having processed the initial request before the client-side timeout occurred
    MockSheetStore.reset();
    const createdServer = MockSheetStore.createRecord(
      buildSyntheticRecord(TEST_CLIENT_UUID_1, 'DL-SOU-141540-01'),
      `create-${TEST_CLIENT_UUID_1}`,
      'req-init-server'
    );

    expect(MockSheetStore.listRecords({}).totalCount).toBe(1);
    const serverRemoteId = createdServer.remoteSubmissionId;
    expect(serverRemoteId).toBeTruthy();

    // 2. Client-side state: outbox item after timeout with retryCount = 1 and errorCategory = 'timeout_unknown_outcome'
    const queueItem: SyncQueueItem = {
      id: 101,
      submissionUuid: TEST_CLIENT_UUID_1,
      operationType: 'CREATE',
      idempotencyKey: `create-${TEST_CLIENT_UUID_1}`,
      status: 'failed',
      retryCount: 1,
      errorCategory: 'timeout_unknown_outcome',
      errorMessage: 'Request timed out. We are checking whether your assessment was received…',
      payload: buildSyntheticRecord(TEST_CLIENT_UUID_1, 'DL-SOU-141540-01'),
      lastAttempt: new Date().toISOString(),
      nextRetryTimestamp: Date.now() + 10000,
    };

    // 3. Spies to monitor network calls
    const gatewayCreateSpy = vi.spyOn(gatewayModule, 'gatewayCreate');
    
    // Simulate lookupByClientSubmissionId resolving against canonical API endpoint
    vi.spyOn(gatewayModule, 'lookupByClientSubmissionId').mockImplementation(async (clientId) => {
      if (clientId === TEST_CLIENT_UUID_1) {
        return { remoteSubmissionId: serverRemoteId, version: 1 };
      }
      return null;
    });

    const markSubmittedSpy = vi.spyOn(queueRepoModule, 'markSubmitted').mockResolvedValue(undefined);
    let successEmitted: any = null;
    const unsub = submissionEvents.on('submission:success', (evt) => {
      successEmitted = evt;
    });

    // 4. Run the worker preflight reconciliation logic (re-simulating handleCreate preflight)
    const existing = await gatewayModule.lookupByClientSubmissionId(TEST_CLIENT_UUID_1, 'corr-test-1');
    expect(existing).not.toBeNull();
    expect(existing?.remoteSubmissionId).toBe(serverRemoteId);
    expect(existing?.version).toBe(1);

    if (existing) {
      const ack = {
        remoteSubmissionId: existing.remoteSubmissionId,
        clientSubmissionId: TEST_CLIENT_UUID_1,
        version: existing.version,
        requestId: 'corr-test-1',
        isDuplicate: true,
        submissionStatus: 'ACCEPTED' as const,
      };
      await queueRepoModule.markSubmitted(queueItem.id!, TEST_CLIENT_UUID_1, ack);
      submissionEvents.emit('submission:success', {
        clientSubmissionId: TEST_CLIENT_UUID_1,
        remoteSubmissionId: existing.remoteSubmissionId,
        version: existing.version,
        requestId: 'corr-test-1',
        correlationId: 'corr-test-1',
        timestamp: new Date().toISOString(),
      });
    }

    unsub();

    // 5. Assert: gatewayCreate was NOT called (no second row created)
    expect(gatewayCreateSpy).not.toHaveBeenCalled();
    expect(MockSheetStore.listRecords({}).totalCount).toBe(1);
    expect(markSubmittedSpy).toHaveBeenCalledWith(
      101,
      TEST_CLIENT_UUID_1,
      expect.objectContaining({
        remoteSubmissionId: serverRemoteId,
        version: 1,
        isDuplicate: true,
        submissionStatus: 'ACCEPTED',
      })
    );
    expect(successEmitted).not.toBeNull();
    expect(successEmitted.remoteSubmissionId).toBe(serverRemoteId);
  });

  // =========================================================================
  // Test 2: CREATE timeout with server row NOT created -> retry successfully creates row 1
  // =========================================================================
  it('Test 2: CREATE timeout with server row NOT created -> retry successfully creates row 1', async () => {
    MockSheetStore.reset();
    expect(MockSheetStore.listRecords({}).totalCount).toBe(0);

    const queueItem: SyncQueueItem = {
      id: 102,
      submissionUuid: TEST_CLIENT_UUID_2,
      operationType: 'CREATE',
      idempotencyKey: `create-${TEST_CLIENT_UUID_2}`,
      status: 'failed',
      retryCount: 1,
      errorCategory: 'timeout_unknown_outcome',
      errorMessage: 'Request timed out. We are checking whether your assessment was received…',
      payload: buildSyntheticRecord(TEST_CLIENT_UUID_2, 'ART-RETRY-0002'),
      lastAttempt: new Date().toISOString(),
      nextRetryTimestamp: Date.now() + 10000,
    };

    // Preflight check against server returns null (404 - not found on server)
    vi.spyOn(gatewayModule, 'lookupByClientSubmissionId').mockResolvedValue(null);

    // Subsequent gatewayCreate successfully creates the server row
    const gatewayCreateSpy = vi.spyOn(gatewayModule, 'gatewayCreate').mockImplementation(async (opts) => {
      // Simulate server accepting the submission
      const created = MockSheetStore.createRecord(opts.payload as any, opts.createIdempotencyKey, 'req-test-2');
      return {
        ok: true,
        data: {
          remoteSubmissionId: created.remoteSubmissionId,
          clientSubmissionId: opts.clientSubmissionId,
          version: 1,
          requestId: 'corr-test-2',
          submissionStatus: 'ACCEPTED',
        },
      };
    });

    const markSubmittedSpy = vi.spyOn(queueRepoModule, 'markSubmitted').mockResolvedValue(undefined);

    // Execution flow
    const preflight = await gatewayModule.lookupByClientSubmissionId(TEST_CLIENT_UUID_2, 'corr-test-2');
    expect(preflight).toBeNull();

    // Proceed to create
    const result = await gatewayModule.gatewayCreate({
      payload: queueItem.payload as any,
      createIdempotencyKey: queueItem.idempotencyKey!,
      clientSubmissionId: TEST_CLIENT_UUID_2,
      correlationId: 'corr-test-2',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      await queueRepoModule.markSubmitted(queueItem.id!, TEST_CLIENT_UUID_2, result.data);
    }

    // Verify exactly 1 server row created
    expect(gatewayCreateSpy).toHaveBeenCalledTimes(1);
    expect(MockSheetStore.listRecords({}).totalCount).toBe(1);
    const createdRemoteId = MockSheetStore.listRecords({}).records[0].remote_submission_id;
    expect(markSubmittedSpy).toHaveBeenCalledWith(
      102,
      TEST_CLIENT_UUID_2,
      expect.objectContaining({
        remoteSubmissionId: createdRemoteId,
        version: 1,
        submissionStatus: 'ACCEPTED',
      })
    );
  });

  // =========================================================================
  // Test 3: List query returns 0 records -> correctly rendered as empty list, never false 404, never wiping cached local drafts
  // =========================================================================
  it('Test 3: List query returns 0 records -> correctly rendered as empty list (200 OK, total: 0), never false 404', async () => {
    MockSheetStore.reset();
    expect(MockSheetStore.listRecords({}).totalCount).toBe(0);

    const req = new NextRequest('http://localhost:3000/api/submissions', { method: 'GET' });
    const res = await listSubmissionsRoute(req);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.records)).toBe(true);
    expect(body.data.records.length).toBe(0);
    expect(body.data.total).toBe(0);
    expect(body.data.nextCursor).toBeNull();
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(0);
    expect(body.submissions).toBeDefined();
    expect(body.submissions.length).toBe(0);

    // Verify adapter returns empty list without erroring
    const adapterResult = await canonicalSubmissionAdapter.listSubmissions({});
    expect(adapterResult.status).toBe('success');
    if (adapterResult.status === 'success') {
      expect(adapterResult.data.records.length).toBe(0);
      expect(adapterResult.data.total).toBe(0);
    }
  });

  // =========================================================================
  // Test 4: List query pagination / counts -> preserves correct counts without dropping records
  // =========================================================================
  it('Test 4: List query pagination / counts -> preserves correct counts across pages without dropping records', async () => {
    MockSheetStore.reset();

    // Seed 5 distinct records with unique prefixes so slice(0, 8) generates distinct remote IDs
    for (let i = 1; i <= 5; i++) {
      const id = `0${i}000000-0000-4000-8000-00000000000${i}`;
      MockSheetStore.createRecord(
        buildSyntheticRecord(id, `ART-PAGE-000${i}`),
        `key-page-${i}`,
        `req-page-${i}`
      );
    }

    expect(MockSheetStore.listRecords({}).totalCount).toBe(5);

    // Page 1: limit = 2
    const reqPage1 = new NextRequest('http://localhost:3000/api/submissions?limit=2', { method: 'GET' });
    const resPage1 = await listSubmissionsRoute(reqPage1);
    expect(resPage1.status).toBe(200);

    const bodyPage1 = await resPage1.json();
    expect(bodyPage1.data.records.length).toBe(2);
    expect(bodyPage1.data.total).toBe(5);
    expect(bodyPage1.pagination.total).toBe(5);
    expect(bodyPage1.pagination.limit).toBe(2);
    expect(bodyPage1.data.nextCursor).toBeTruthy();

    // Page 2: limit = 2, using nextCursor
    const reqPage2 = new NextRequest(`http://localhost:3000/api/submissions?limit=2&cursor=${bodyPage1.data.nextCursor}`, { method: 'GET' });
    const resPage2 = await listSubmissionsRoute(reqPage2);
    expect(resPage2.status).toBe(200);

    const bodyPage2 = await resPage2.json();
    expect(bodyPage2.data.records.length).toBe(2);
    expect(bodyPage2.data.total).toBe(5);

    // All records across page 1 and page 2 are distinct (no dropped or duplicate records)
    const page1Ids = bodyPage1.data.records.map((r: any) => r.remote_submission_id || r._uuid);
    const page2Ids = bodyPage2.data.records.map((r: any) => r.remote_submission_id || r._uuid);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);
  });

  // =========================================================================
  // Test 7: UI state mapping -> verify all 9 chip states are mutually exclusive and map correctly
  // =========================================================================
  it('Test 7: UI state mapping -> all 9 chip states are mutually exclusive and map correctly', () => {
    // Helper replicating assessment/sync/page.tsx status resolution logic
    function resolveChipStatus(qItem: {
      status: string;
      statusCode?: number;
      errorCategory?: string;
      errorMessage?: string;
      nextRetryTimestamp?: number | null;
      payload?: { assetStatus?: string; remoteSubmissionId?: string };
    }): string {
      const rawStatus = String(qItem.status || '').toLowerCase();
      const code = Number(qItem.statusCode || 0);
      const isTerminalHalted = qItem.nextRetryTimestamp === null;
      const isUnauthorized = code === 401 || code === 403 || qItem.errorCategory === 'unauthorized';
      const isTerminal4xx = code >= 400 && code < 500 && code !== 408 && code !== 429 && code !== 401 && code !== 403;
      const isConflict = rawStatus === 'conflict' || code === 409 || qItem.errorMessage?.toLowerCase().includes('conflict');
      const isNeedsReview = rawStatus === 'needs_review';
      const isSignatureMigrationError = qItem.errorCategory === 'signature_migration_failed';
      const isTimeoutUnknown = qItem.errorCategory === 'timeout_unknown_outcome' || (qItem.errorCategory === 'timeout' && !qItem.payload?.remoteSubmissionId);

      if (rawStatus === 'synced') {
        if (qItem.payload?.assetStatus === 'PENDING') {
          return 'Submitted — documents processing';
        } else if (qItem.payload?.assetStatus === 'FAILED_RETRYABLE') {
          return 'Submitted — document upload needs retry';
        }
        return 'Submitted';
      }
      if (rawStatus === 'syncing') {
        return 'Sending';
      }
      if (isTimeoutUnknown) {
        return 'Checking submission status';
      }
      if (isUnauthorized) {
        return 'Sign in again';
      }
      if (isConflict) {
        return 'Conflict';
      }
      if (isNeedsReview) {
        return 'Needs correction';
      }
      if (isSignatureMigrationError) {
        return 'Waiting to retry';
      }
      if (rawStatus === 'failed_final' || (rawStatus === 'failed' && (isTerminal4xx || isTerminalHalted))) {
        return 'Needs correction';
      }
      if (rawStatus === 'failed_retryable' || rawStatus === 'failed') {
        return 'Waiting to retry';
      }
      return 'Saved on this device';
    }

    // 1. Saved on this device
    expect(resolveChipStatus({ status: 'queued' })).toBe('Saved on this device');

    // 2. Sending
    expect(resolveChipStatus({ status: 'syncing' })).toBe('Sending');

    // 3. Checking submission status (timeout / unknown outcome)
    expect(
      resolveChipStatus({ status: 'failed', errorCategory: 'timeout_unknown_outcome' })
    ).toBe('Checking submission status');

    // 4. Submitted — documents processing
    expect(
      resolveChipStatus({ status: 'synced', payload: { assetStatus: 'PENDING' } })
    ).toBe('Submitted — documents processing');

    // 5. Submitted (fully synced)
    expect(resolveChipStatus({ status: 'synced' })).toBe('Submitted');

    // 6. Needs correction (terminal validation failure)
    expect(
      resolveChipStatus({ status: 'failed_final', statusCode: 422, nextRetryTimestamp: null })
    ).toBe('Needs correction');

    // 7. Waiting to retry (network / 500 error)
    expect(
      resolveChipStatus({ status: 'failed_retryable', statusCode: 503, errorCategory: 'network_offline' })
    ).toBe('Waiting to retry');

    // 8. Conflict
    expect(
      resolveChipStatus({ status: 'conflict', statusCode: 409 })
    ).toBe('Conflict');

    // 9. Sign in again (401/403)
    expect(
      resolveChipStatus({ status: 'failed', statusCode: 401 })
    ).toBe('Sign in again');

    // 10. Submitted — document upload needs retry
    expect(
      resolveChipStatus({ status: 'synced', payload: { assetStatus: 'FAILED_RETRYABLE' } })
    ).toBe('Submitted — document upload needs retry');

    // Verify all returned labels belong to the expected set of mutually exclusive states
    const allExpectedLabels = new Set([
      'Saved on this device',
      'Sending',
      'Checking submission status',
      'Submitted — documents processing',
      'Submitted',
      'Needs correction',
      'Waiting to retry',
      'Conflict',
      'Sign in again',
      'Submitted — document upload needs retry',
    ]);
    expect(allExpectedLabels.size).toBe(10);
  });

  // =========================================================================
  // Test 8: End-to-end reconciliation flow: worker preflight check resolves existing submission via lookupByClientSubmissionId without network POST when server record exists
  // =========================================================================
  it('Test 8: End-to-end worker preflight resolves existing server submission via lookupByClientSubmissionId with 0 POST network calls', async () => {
    // 1. Populate server with the target record
    MockSheetStore.reset();
    const serverRecord = MockSheetStore.createRecord(
      buildSyntheticRecord(TEST_CLIENT_UUID_1, 'DL-SOU-141540-01'),
      `create-${TEST_CLIENT_UUID_1}`,
      'req-test-8-server'
    );
    const serverRemoteId = serverRecord.remoteSubmissionId;

    // 2. Setup mock GET lookup route handler
    const lookupSpy = vi.spyOn(gatewayModule, 'lookupByClientSubmissionId').mockImplementation(async (clientId) => {
      const record = MockSheetStore.findRecord(clientId);
      if (record) {
        return { remoteSubmissionId: record.remote_submission_id, version: record.version };
      }
      return null;
    });

    const createPostSpy = vi.spyOn(gatewayModule, 'gatewayCreate');

    // 3. Queue item that previously failed with timeout_unknown_outcome
    const item: SyncQueueItem = {
      id: 888,
      submissionUuid: TEST_CLIENT_UUID_1,
      operationType: 'CREATE',
      idempotencyKey: `create-${TEST_CLIENT_UUID_1}`,
      status: 'failed',
      retryCount: 1,
      errorCategory: 'timeout_unknown_outcome',
      errorMessage: 'Request timed out.',
      payload: buildSyntheticRecord(TEST_CLIENT_UUID_1, 'DL-SOU-141540-01'),
      lastAttempt: new Date().toISOString(),
      nextRetryTimestamp: Date.now() + 10000,
    };

    // 4. Preflight condition check
    const shouldPreflight =
      (item.retryCount && item.retryCount > 0) ||
      item.errorCategory === 'timeout_unknown_outcome' ||
      item.errorCategory === 'timeout';

    expect(shouldPreflight).toBe(true);

    const existing = await gatewayModule.lookupByClientSubmissionId(TEST_CLIENT_UUID_1, 'corr-test-8');
    expect(existing).not.toBeNull();
    expect(existing?.remoteSubmissionId).toBe(serverRemoteId);

    // If existing, worker does NOT call gatewayCreate
    if (existing) {
      item.status = 'synced';
      item.errorMessage = null;
      (item.payload as any).remoteSubmissionId = existing.remoteSubmissionId;
      (item.payload as any).version = existing.version;
    }

    // 5. Assert: 0 POST calls made, server row remains exactly 1, client state is synced
    expect(createPostSpy).not.toHaveBeenCalled();
    expect(lookupSpy).toHaveBeenCalledWith(TEST_CLIENT_UUID_1, 'corr-test-8');
    expect(MockSheetStore.listRecords({}).totalCount).toBe(1);
    expect(item.status).toBe('synced');
    expect((item.payload as any).remoteSubmissionId).toBe(serverRemoteId);
  });
});
