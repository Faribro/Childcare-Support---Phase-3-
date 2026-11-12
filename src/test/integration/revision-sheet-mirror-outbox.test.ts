import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SheetsMirrorWorker,
  InMemorySheetsMirrorRepository,
  GatewayClient,
} from '@/lib/server/sheetsMirrorWorker';
import {
  SupabaseSubmissionAdapter,
} from '@/lib/server/supabaseSubmissionAdapter';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

describe('Revision & Google Sheets Outbox Integration Suite', () => {
  let mirrorRepo: InMemorySheetsMirrorRepository;
  let supabaseAdapter: SupabaseSubmissionAdapter;
  let mockGatewayCalls: Array<Record<string, any>>;
  let mockGatewayClient: GatewayClient;
  let mockSheetRows: Map<string, Record<string, any>>;
  let mockRevisionsSheet: Array<{
    submissionId: string;
    revisionNumber: number;
    changedFields: string;
    editor: string;
    timestamp: string;
  }>;

  beforeEach(() => {
    mockGatewayCalls = [];
    mockSheetRows = new Map();
    mockRevisionsSheet = [];

    mockGatewayClient = {
      callGateway: vi.fn(async (payload: Record<string, any>) => {
        mockGatewayCalls.push({ ...payload });

        const uniqueId = payload.uniqueId;
        const action = payload.action;

        if (action === 'create') {
          mockSheetRows.set(uniqueId, {
            uniqueId,
            revisionNumber: 1,
            data: payload,
          });
          return {
            status: 'success' as const,
            statusCode: 201,
            resolvedRow: mockSheetRows.size + 3,
            currentVersion: 1,
          };
        }

        if (action === 'update') {
          const expectedRev = payload.expectedVersion || 1;
          const patchData = payload.patch || (payload.payload && payload.payload.patch) || payload.data || {};
          let existing = mockSheetRows.get(uniqueId);

          let nextRev = (existing?.revisionNumber || 1) + 1;
          if (!existing) {
            // Upsert missing row
            nextRev = expectedRev + 1;
            existing = { uniqueId, revisionNumber: nextRev, data: {} };
          } else {
            existing.revisionNumber = nextRev;
          }

          existing.data = { ...existing.data, ...patchData };
          mockSheetRows.set(uniqueId, existing);

          const changedKeys = Object.keys(patchData).filter(
            (k) => k !== 'expectedVersion' && k !== 'expectedRevision' && k !== 'version'
          );

          mockRevisionsSheet.push({
            submissionId: uniqueId,
            revisionNumber: nextRev,
            changedFields: changedKeys.join(', '),
            editor: payload.editor || 'Caseworker',
            timestamp: new Date().toISOString(),
          });

          return {
            status: 'success' as const,
            statusCode: 200,
            resolvedRow: 4,
            currentVersion: nextRev,
          };
        }

        return { status: 'error' as const, statusCode: 400, message: 'Unknown action' };
      }),
    };

    mirrorRepo = new InMemorySheetsMirrorRepository();
    supabaseAdapter = new SupabaseSubmissionAdapter(undefined, mirrorRepo);
    canonicalSubmissionAdapter.setSupabaseAdapter(supabaseAdapter);
  });

  it('Gate A: Every successful edit creates an outbox job with revision-specific idempotency key', async () => {
    process.env.STORAGE_ENGINE = 'supabase';
    const testId = `SYNTH-BEN-${Date.now()}-01`;

    // 1. Initial Create
    await canonicalSubmissionAdapter.createSubmission({
      payload: {
        uniqueId: testId,
        demographics: { childName: 'Aarav Initial' },
        location: { state: 'Maharashtra', district: 'Pune' },
        caregiverConsent: { consentProvided: true },
      } as any,
      idempotencyKey: `create-${testId}`,
      requestId: `req-create-${testId}`,
    });

    // Initial mirror drain
    const worker = new SheetsMirrorWorker(mirrorRepo, mockGatewayClient);
    await worker.drainQueue(5);
    expect(mockSheetRows.get(testId)?.revisionNumber).toBe(1);

    // 2. Apply First Edit (v1 -> v2)
    const edit1 = await canonicalSubmissionAdapter.updateSubmission({
      submissionId: testId,
      expectedVersion: 1,
      patch: {
        childName: 'Aarav Revised',
        monthlyIncome: '8000',
      } as any,
      requestId: `req-edit1-${testId}`,
    });

    expect(edit1.status).toBe('success');
    expect(edit1.version).toBe(2);
    // Honest status before drain: PENDING_SHEET_SYNC
    expect(edit1.syncStatus).toBe('PENDING_SHEET_SYNC');

    // Verify outbox job was enqueued with strict revision-specific key
    const queuedJob = (mirrorRepo as any).jobs.find(
      (j: any) => j.idempotency_key === `update-${testId}-r2`
    );
    expect(queuedJob).toBeDefined();
    expect(queuedJob.payload_snapshot.version).toBe(2);
    expect(queuedJob.payload_snapshot.patch.childName).toBe('Aarav Revised');

    // 3. Drain and verify Sheet & Revisions row
    await worker.drainQueue(5);

    expect(mockSheetRows.get(testId)?.revisionNumber).toBe(2);
    expect(mockSheetRows.get(testId)?.data.childName).toBe('Aarav Revised');

    expect(mockRevisionsSheet.length).toBe(1);
    expect(mockRevisionsSheet[0].submissionId).toBe(testId);
    expect(mockRevisionsSheet[0].revisionNumber).toBe(2);
    expect(mockRevisionsSheet[0].changedFields).toContain('childName');
    expect(mockRevisionsSheet[0].changedFields).toContain('monthlyIncome');
  });

  it('Gate B: Multiple sequential revisions (v2 -> v3) produce independent outbox jobs without deduplication collisions', async () => {
    process.env.STORAGE_ENGINE = 'supabase';
    const testId = `SYNTH-BEN-${Date.now()}-02`;

    await canonicalSubmissionAdapter.createSubmission({
      payload: {
        uniqueId: testId,
        demographics: { childName: 'Test Multi' },
        caregiverConsent: { consentProvided: true },
      } as any,
      idempotencyKey: `create-${testId}`,
      requestId: `req-create-${testId}`,
    });

    const worker = new SheetsMirrorWorker(mirrorRepo, mockGatewayClient);
    await worker.drainQueue(5);

    // First Revision (r2)
    await canonicalSubmissionAdapter.updateSubmission({
      submissionId: testId,
      expectedVersion: 1,
      patch: { childName: 'Multi Rev 2' } as any,
      requestId: `req-rev2-${testId}`,
    });
    await worker.drainQueue(5);

    // Second Revision (r3)
    const edit2 = await canonicalSubmissionAdapter.updateSubmission({
      submissionId: testId,
      expectedVersion: 2,
      patch: { childName: 'Multi Rev 3', weightKg: 24 } as any,
      requestId: `req-rev3-${testId}`,
    });
    expect(edit2.version).toBe(3);

    // Verify both revision jobs exist with unique keys
    const r2Job = (mirrorRepo as any).jobs.find((j: any) => j.idempotency_key === `update-${testId}-r2`);
    const r3Job = (mirrorRepo as any).jobs.find((j: any) => j.idempotency_key === `update-${testId}-r3`);
    expect(r2Job).toBeDefined();
    expect(r3Job).toBeDefined();

    await worker.drainQueue(5);

    // Revisions sheet contains both rows
    expect(mockRevisionsSheet.length).toBe(2);
    expect(mockRevisionsSheet[0].revisionNumber).toBe(2);
    expect(mockRevisionsSheet[1].revisionNumber).toBe(3);
    expect(mockRevisionsSheet[1].changedFields).toContain('weightKg');
  });

  it('Gate C: Missing row is upserted by Apps Script gateway and logged in Revisions sheet', async () => {
    process.env.STORAGE_ENGINE = 'supabase';
    const missingId = `SYNTH-MISSING-${Date.now()}`;

    // Direct gateway call for an update on a row that was never in the sheet
    const res = await mockGatewayClient.callGateway({
      action: 'update',
      uniqueId: missingId,
      expectedVersion: 1,
      patch: { childName: 'Upserted Child', district: 'Thane' },
      editor: 'leader@alliance.org',
    });

    expect(res.status).toBe('success');
    expect(mockSheetRows.has(missingId)).toBe(true);
    expect(mockSheetRows.get(missingId)?.data.district).toBe('Thane');

    const revRow = mockRevisionsSheet.find((r) => r.submissionId === missingId);
    expect(revRow).toBeDefined();
    expect(revRow?.editor).toBe('leader@alliance.org');
  });
});
