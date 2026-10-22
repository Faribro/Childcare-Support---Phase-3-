import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { createSessionToken } from '@/lib/server/sessionService';
import { PUT as replaceAssetPutRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { POST as replaceDocumentPostRoute } from '@/app/api/submissions/[submissionId]/replace-document/route';
import { createSyntheticSubmission } from '../fixtures/syntheticAssessmentFactory';

describe('Two-Phase Document Replacement Architecture with OCC & Asset History', () => {
  const TEST_ID = 'TEST-REPLACE-001';

  beforeEach(() => {
    MockSheetStore.resetStore();
    const payload = createSyntheticSubmission({
      runId: 'rep-test',
      uniqueSuffix: 'REPLACE-001',
      withSignature: true,
      withDocuments: true,
    });
    payload.uuid = TEST_ID;
    payload.clientSubmissionId = TEST_ID;
    payload.demographics.artNumber = TEST_ID;

    MockSheetStore.createRecord(payload, 'idem-create-001', 'req-create-001');

    // Simulate initial uploaded passbook document
    const initialDriveId = 'passbook-init-abc123xyz';
    const initialFormula = `=HYPERLINK("https://drive.google.com/file/d/${initialDriveId}/view", "Restricted Doc [Passbook]")`;
    const rec = MockSheetStore.findRecord(TEST_ID);
    if (rec) {
      rec.passbook_photo_url = initialFormula;
      rec.passbookPhotoUrl = initialFormula;
      rec.version = 1;
    }
  });

  describe('1. Happy Path: Two-Phase Commit & OCC Revision Increment', () => {
    it('commits new asset pointer, increments revision 1 -> 2, and preserves historical asset', async () => {
      const newBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

      const result = await canonicalSubmissionAdapter.replaceAsset({
        submissionId: TEST_ID,
        docType: 'Passbook',
        fileData: newBase64,
        expectedRevision: 1,
        requestId: 'req-rep-001',
      });

      expect(result.status).toBe('success');
      expect(result.statusCode).toBe(200);
      expect(result.version).toBe(2);
      expect(result.revisionNumber).toBe(2);
      expect(result.newRevision).toBe(2);
      expect(result.previousFileId).toBe('passbook-init-abc123xyz');
      expect(result.newFileId).toBeDefined();
      expect(result.oldAssetStatus).toBe('SUPERSEDED');

      // Verify stored record state
      const record = MockSheetStore.findRecord(TEST_ID);
      expect(record).toBeDefined();
      expect(record?.version).toBe(2);
      expect(record?.passbook_photo_url).toContain(result.newFileId);
      expect(record?.passbook_photo_url).toContain('=HYPERLINK');

      // Verify asset history is preserved (non-destructive supersession)
      expect(record?.assetHistory).toBeDefined();
      expect(record?.assetHistory?.length).toBe(1);
      expect(record?.assetHistory?.[0].slot).toBe('Passbook');
      expect(record?.assetHistory?.[0].previousFileId).toBe('passbook-init-abc123xyz');
      expect(record?.assetHistory?.[0].newFileId).toBe(result.newFileId);
      expect(record?.assetHistory?.[0].status).toBe('SUPERSEDED');
    });
  });

  describe('2. Optimistic Concurrency Control (OCC) Stale Revision Guard', () => {
    it('rejects replacement request with 409 OCC_CONFLICT when expectedRevision does not match', async () => {
      // First replacement: moves 1 -> 2
      const firstBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      await canonicalSubmissionAdapter.replaceAsset({
        submissionId: TEST_ID,
        docType: 'Passbook',
        fileData: firstBase64,
        expectedRevision: 1,
        requestId: 'req-rep-001',
      });

      // Second replacement with STALE expectedRevision: 1 (current is 2)
      const secondBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const conflictResult = await canonicalSubmissionAdapter.replaceAsset({
        submissionId: TEST_ID,
        docType: 'Passbook',
        fileData: secondBase64,
        expectedRevision: 1, // Stale!
        requestId: 'req-rep-002',
      });

      expect(conflictResult.status).toBe('conflict');
      expect(conflictResult.statusCode).toBe(409);
      expect(conflictResult.code).toBe('OCC_CONFLICT');

      // Record remains at version 2, not modified
      const record = MockSheetStore.findRecord(TEST_ID);
      expect(record?.version).toBe(2);
      expect(record?.assetHistory?.length).toBe(1);
    });
  });

  describe('3. Failure Recovery & Quarantine Rollback', () => {
    it('rolls back sheet write and revision when pointer verification fails', async () => {
      const corruptBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const failResult = await canonicalSubmissionAdapter.replaceAsset({
        submissionId: TEST_ID,
        docType: 'Passbook',
        fileData: corruptBase64,
        expectedRevision: 1,
        requestId: 'req-fail-001',
        simulatePointerMismatch: true,
      });

      expect(failResult.status).toBe('error');
      expect(failResult.statusCode).toBe(500);
      expect(failResult.code).toBe('POINTER_VERIFICATION_MISMATCH');

      // Verify that revision was NOT incremented and original pointer was preserved
      const record = MockSheetStore.findRecord(TEST_ID);
      expect(record?.version).toBe(1);
      expect(record?.passbook_photo_url).toContain('passbook-init-abc123xyz');
    });
  });

  describe('4. Authorization & Security Boundaries', () => {
    it('rejects unauthenticated caller on PUT /api/submissions/[submissionId]/asset with 401', async () => {
      const req = new NextRequest(`http://localhost:3000/api/submissions/${TEST_ID}/asset`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-unauthenticated': 'true',
        },
        body: JSON.stringify({
          docType: 'Passbook',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 1,
        }),
      });

      const res = await replaceAssetPutRoute(req, { params: { submissionId: TEST_ID } });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('rejects non-admin role on PUT /api/submissions/[submissionId]/asset with 403', async () => {
      const reviewerToken = createSessionToken({
        userId: 'rev-01',
        name: 'State Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest(`http://localhost:3000/api/submissions/${TEST_ID}/asset`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `session_token=${reviewerToken}`,
        },
        body: JSON.stringify({
          docType: 'Passbook',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 1,
        }),
      });

      const res = await replaceAssetPutRoute(req, { params: { submissionId: TEST_ID } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });

    it('accepts verified admin caller on PUT /api/submissions/[submissionId]/asset with 200', async () => {
      const req = new NextRequest(`http://localhost:3000/api/submissions/${TEST_ID}/asset`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-verified': 'true',
          'x-test-role': 'ADMIN',
          'x-test-state': '*',
        },
        body: JSON.stringify({
          docType: 'Passbook',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 1,
        }),
      });

      const res = await replaceAssetPutRoute(req, { params: { submissionId: TEST_ID } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('success');
      expect(data.newRevision).toBe(2);
      expect(data.previousFileId).toBe('passbook-init-abc123xyz');
      expect(data.oldAssetStatus).toBe('SUPERSEDED');
    });
  });

  describe('5. Thread 07 Shared Contract Compatibility', () => {
    it('accepts POST /api/submissions/[submissionId]/replace-document and returns identical contract', async () => {
      const req = new NextRequest(`http://localhost:3000/api/submissions/${TEST_ID}/replace-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-verified': 'true',
          'x-test-role': 'ADMIN',
          'x-test-state': '*',
        },
        body: JSON.stringify({
          slotPrefix: 'Passbook',
          fileDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 1,
        }),
      });

      const res = await replaceDocumentPostRoute(req, { params: { submissionId: TEST_ID } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('success');
      expect(data.acknowledged).toBe(true);
      expect(data.newRevision).toBe(2);
      expect(data.previousFileId).toBe('passbook-init-abc123xyz');
      expect(data.oldAssetStatus).toBe('SUPERSEDED');
    });
  });

  describe('6. Current Cell State Hash (expectedCurrentCellStateHash) Concurrency Verification', () => {
    it('accepts replacement when expectedCurrentCellStateHash matches current cell state', async () => {
      const crypto = require('crypto');
      const initialFormula = '=HYPERLINK("https://drive.google.com/file/d/passbook-init-abc123xyz/view", "Restricted Doc [Passbook]")';
      const cellHash = crypto.createHash('sha256').update(initialFormula.trim()).digest('hex');

      const req = new NextRequest(`http://localhost:3000/api/submissions/${TEST_ID}/asset`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-verified': 'true',
          'x-test-role': 'ADMIN',
          'x-test-state': '*',
        },
        body: JSON.stringify({
          docType: 'Passbook',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 1,
          expectedCurrentCellStateHash: cellHash,
        }),
      });

      const res = await replaceAssetPutRoute(req, { params: { submissionId: TEST_ID } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('success');
      expect(data.newRevision).toBe(2);
    });

    it('rejects with 409 OCC_CONFLICT when expectedCurrentCellStateHash does not match current cell state', async () => {
      const staleHash = 'f'.repeat(64); // Wrong hash

      const req = new NextRequest(`http://localhost:3000/api/submissions/${TEST_ID}/asset`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-verified': 'true',
          'x-test-role': 'ADMIN',
          'x-test-state': '*',
        },
        body: JSON.stringify({
          docType: 'Passbook',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 1,
          expectedCurrentCellStateHash: staleHash,
        }),
      });

      const res = await replaceAssetPutRoute(req, { params: { submissionId: TEST_ID } });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe('OCC_CONFLICT');
      expect(data.message).toContain('current cell state hash');

      // Record remains unmodified at version 1
      const record = MockSheetStore.findRecord(TEST_ID);
      expect(record?.version).toBe(1);
    });

    it('rejects with 400 VALIDATION_ERROR when expectedCurrentCellStateHash is invalid format', async () => {
      const req = new NextRequest(`http://localhost:3000/api/submissions/${TEST_ID}/asset`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-verified': 'true',
          'x-test-role': 'ADMIN',
          'x-test-state': '*',
        },
        body: JSON.stringify({
          docType: 'Passbook',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 1,
          expectedCurrentCellStateHash: 'not-a-valid-hex-hash',
        }),
      });

      const res = await replaceAssetPutRoute(req, { params: { submissionId: TEST_ID } });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });
  });
});
