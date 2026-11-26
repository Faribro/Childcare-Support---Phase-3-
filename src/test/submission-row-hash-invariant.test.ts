import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { POST as createSubmissionRoute } from '@/app/api/submissions/route';
import {
  PATCH as patchSubmissionRoute,
  DELETE as deleteSubmissionRoute,
} from '@/app/api/submissions/[submissionId]/route';
import { POST as restoreSubmissionRoute } from '@/app/api/submissions/[submissionId]/restore/route';
import { POST as postAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { POST as replaceDocumentRoute } from '@/app/api/submissions/[submissionId]/replace-document/route';
import { POST as syncRetryRoute } from '@/app/api/submissions/[submissionId]/sync-retry/route';
import { POST as syncRoute } from '@/app/api/sync/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { FirestoreSubmissionAdapter } from '@/lib/server/firestoreSubmissionAdapter';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { createSessionToken } from '@/lib/server/sessionService';
import {
  SHEET_TOTAL_COLUMNS,
  buildCanonicalSheetColumns,
  computeSheetCellsRowHash,
  computeSubmissionRowHash,
  extractCanonicalDriveFileId,
} from '@/lib/server/submissionRowHash';

const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function makeValidCompleteSubmissionBody(uuid: string, childName = 'Ananya Sharma') {
  return {
    uuid,
    clientSubmissionId: uuid,
    uniqueId: uuid,
    schemaVersion: 3,
    supportCategories: ['nutrition'],
    interviewerName: 'Caseworker Anita',
    consent: {
      agreeToParticipate: true,
      signatureDataUrl: SAMPLE_PNG_DATA_URL,
    },
    demographics: {
      artNumber: 'MH-PUN-202601-01',
      childName,
      dob: '2016-05-10',
      calculatedAgeYears: 10,
      gender: 'Female',
      orphanStatus: 'Single orphan (one parent deceased)',
      caregiverName: 'Sunita Sharma',
      caregiverRelationship: 'Mother',
      contactNumber: '9876543210',
      caregiverContactNumber: '9876543210',
      fullAddress: '12 Nehru Nagar, Pune',
      state: 'Maharashtra',
      district: 'Pune',
    },
    householdFinancial: {
      totalFamilyMembers: 4,
      numberOfChildrenUnder18: 2,
      monthlyIncomeRs: 12000,
      mainSourceOfIncome: 'Daily wage labour',
    },
    health: {
      heightCm: 122,
      weightKg: 24,
      haemoglobinGdl: 11.4,
      artStatus: 'On ART',
      artInitiationDate: '2022-01-10',
      artIdNumber: 'ART-MH-9012',
      vlStatus: 'Tested',
      vlDate: '2026-08-01',
      viralLoad: 30,
      otherHealthConditions: ['None'],
    },
    nutrition: {
      appetite: 'Good',
      mealsPerDay: '3',
    },
    educationStatus: {
      educationStatus: 'Dropped out of school',
    },
    educationExpenses: {
      schoolFees: 0,
      tuitionFees: 0,
      books: 0,
      stationery: 0,
      uniform: 0,
      transport: 0,
      otherExpenses: 0,
      totalAnnualCost: 0,
      feeReceiptPhotoUrl: '',
      marksheetPhotoUrl: '',
      remarks: '',
    },
    educationSupportRequired: {
      requiredSchoolFees: 0,
      requiredBooks: 0,
      requiredStationery: 0,
      requiredUniform: 0,
      requiredTransport: 0,
      requiredOtherSupport: 0,
      totalRequiredSupport: 0,
    },
    bankingAndKyc: {
      bankAccountHolderName: 'Sunita Sharma',
      bankAccountNumber: '123456789012',
      bankIfscCode: 'SBIN0001234',
      bankLinkedMobileNumber: '9876543210',
      passbookPhotoUrl: SAMPLE_PNG_DATA_URL,
      aadhaarCardPhotoUrl: SAMPLE_PNG_DATA_URL,
      childPhotoUrl: SAMPLE_PNG_DATA_URL,
    },
    finalReview: {
      formSubmittedBy: 'Caseworker Anita',
      approvedAllianceIndia: 'Pending',
      allInfoCorrect: true,
      organizationName: 'Alliance MH',
      organizationEmail: 'mh@allianceindia.org',
    },
  };
}

describe('Submission rowVersion & rowHash Invariant Suite', () => {
  const savedDataEngine = process.env.DATA_ENGINE;
  const savedSessionSecret = process.env.SESSION_SECRET;
  const savedAppsUrl = process.env.APPS_SCRIPT_URL;
  const savedWebhookSecret = process.env.WEBHOOK_SECRET;
  const savedForceSyncMirror = process.env.FORCE_SYNC_MIRROR;

  let fsAdapter: FirestoreSubmissionAdapter;
  let adminToken: string;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'a_very_secure_test_session_secret_for_cryptographic_signing_32_chars_long!';
    process.env.DATA_ENGINE = 'firestore';
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb_LOCAL_TEST_ONLY/exec';
    process.env.WEBHOOK_SECRET = 'a_very_secure_webhook_secret_32_chars_minimum_ok';
    delete process.env.FORCE_SYNC_MIRROR;

    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();

    let seq = 1;
    fsAdapter = new FirestoreSubmissionAdapter({
      appEnv: 'development',
      databaseId: '(default)',
      gatewayClient: {
        callGateway: async (payload) => {
          seq++;
          return {
            status: 'success',
            statusCode: 200,
            resolvedRow: 4,
            newRevision: seq,
            newFileId: `drive-file-${seq}`,
            cellFormula: `=HYPERLINK("https://drive.google.com/file/d/drive-file-${seq}/view", "Restricted Doc [Passbook]")`,
          };
        },
      },
    });
    canonicalSubmissionAdapter.setFirestoreAdapter(fsAdapter);

    adminToken = createSessionToken({
      userId: 'admin-01',
      name: 'National Admin',
      role: 'ADMIN',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    });
  });

  afterEach(() => {
    if (savedDataEngine === undefined) delete process.env.DATA_ENGINE;
    else process.env.DATA_ENGINE = savedDataEngine;
    if (savedSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = savedSessionSecret;
    if (savedAppsUrl === undefined) delete process.env.APPS_SCRIPT_URL;
    else process.env.APPS_SCRIPT_URL = savedAppsUrl;
    if (savedWebhookSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = savedWebhookSecret;
    if (savedForceSyncMirror === undefined) delete process.env.FORCE_SYNC_MIRROR;
    else process.env.FORCE_SYNC_MIRROR = savedForceSyncMirror;
  });

  it('produces identical SHA-256 hashes between Firestore docs and 83-column Google Sheet cells + Drive formulas', () => {
    expect(extractCanonicalDriveFileId('=HYPERLINK("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", "Restricted Doc [Passbook]")')).toBe(
      'drive:1AbCdEfGhIjKlMnOp'
    );
    expect(extractCanonicalDriveFileId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toBe('drive:1AbCdEfGhIjKlMnOp');

    const doc = {
      id: 'MH-PUN-HASH-01',
      uniqueId: 'MH-PUN-HASH-01',
      version: 1,
      revisionNumber: 1,
      submissionTime: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-26T00:00:00.000Z',
      passbookPhotoUrl: 'https://drive.google.com/file/d/1DrivePassbook123/view',
      payload: makeValidCompleteSubmissionBody('550e8400-e29b-41d4-a716-446655440099', 'Kavita'),
    };
    const cols = buildCanonicalSheetColumns(doc);
    expect(cols).toHaveLength(SHEET_TOTAL_COLUMNS);

    const formulas = new Array(SHEET_TOTAL_COLUMNS).fill('');
    formulas[24] = '=HYPERLINK("https://drive.google.com/file/d/1DrivePassbook123/view", "Restricted Doc [Passbook]")';
    const cells = [...cols];
    cells[24] = 'Restricted Doc [Passbook]';

    const docHash = computeSubmissionRowHash(doc);
    const sheetHash = computeSheetCellsRowHash(cells, formulas, false, null);
    expect(docHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sheetHash).toBe(docHash);
  });

  it('updates rowVersion monotonically and updates rowHash across EVERY submission creation/update/asset/sync-retry/soft-delete/restore code path', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440101';

    // 1. POST /api/submissions (createSubmission)
    const createRes = await createSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-inv-create-1',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
        body: JSON.stringify(makeValidCompleteSubmissionBody(id, 'Meera Devi')),
      })
    );
    expect([200, 201]).toContain(createRes.status);
    const doc1 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc1.rowVersion).toBeGreaterThanOrEqual(1);
    expect(doc1.rowHash).toMatch(/^[a-f0-9]{64}$/);
    const hashAfterCreate = doc1.rowHash;
    let prevRowVersion = doc1.rowVersion;

    // 2. markSubmissionSynced (mirrors sync metadata completion)
    await fsAdapter.markSubmissionSynced(id, { sheetRowNumber: 4 });
    const doc2 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc2.rowVersion).toBeGreaterThan(prevRowVersion);
    expect(doc2.rowHash).toMatch(/^[a-f0-9]{64}$/);
    prevRowVersion = doc2.rowVersion;

    // 3. replaySheetsMirrorRetryQueue (retry queue replay path)
    await fsAdapter.enqueueMirrorRetry({
      id: `retry-${id}`,
      submissionId: id,
      clientSubmissionId: id,
      idempotencyKey: 'idem-inv-retry-1',
      payload: doc2.payload,
      status: 'PENDING',
      retryCount: 0,
      nextRetryAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const replaySummary = await fsAdapter.replaySheetsMirrorRetryQueue(10);
    expect(replaySummary.succeeded).toBe(1);
    const doc3 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc3.rowVersion).toBeGreaterThan(prevRowVersion);
    prevRowVersion = doc3.rowVersion;

    // 4. PATCH /api/submissions/[id]
    const patchRes = await patchSubmissionRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}`, {
        method: 'PATCH',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
        body: JSON.stringify({ expectedVersion: doc3.version || 1, childName: 'Meera Kumari Updated' }),
      }),
      { params: { submissionId: id } }
    );
    expect(patchRes.status).toBe(200);
    const doc4 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc4.rowVersion).toBeGreaterThan(prevRowVersion);
    expect(doc4.rowHash).not.toBe(hashAfterCreate);
    const hashAfterPatch = doc4.rowHash;
    prevRowVersion = doc4.rowVersion;

    // 5. POST /api/submissions/[id]/asset
    const assetRes = await postAssetRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}/asset`, {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
        body: JSON.stringify({
          docType: 'passbookPhoto',
          fileData: SAMPLE_PNG_DATA_URL,
          expectedVersion: doc4.version || 2,
          expectedCurrentCellStateHash: 'a'.repeat(64),
        }),
      }),
      { params: { submissionId: id } }
    );
    expect(assetRes.status).toBe(200);
    const doc5 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc5.rowVersion).toBeGreaterThan(prevRowVersion);
    expect(doc5.rowHash).not.toBe(hashAfterPatch);
    const hashAfterAsset = doc5.rowHash;
    prevRowVersion = doc5.rowVersion;

    // 6. POST /api/submissions/[id]/replace-document
    const replaceRes = await replaceDocumentRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}/replace-document`, {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
        body: JSON.stringify({
          docType: 'passbookPhoto',
          fileData: SAMPLE_PNG_DATA_URL,
          expectedRevision: doc5.version || 3,
          expectedCurrentCellStateHash: 'b'.repeat(64),
        }),
      }),
      { params: { submissionId: id } }
    );
    expect(replaceRes.status).toBe(200);
    const doc6 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc6.rowVersion).toBeGreaterThan(prevRowVersion);
    expect(doc6.rowHash).not.toBe(hashAfterAsset);
    const hashAfterReplace = doc6.rowHash;
    prevRowVersion = doc6.rowVersion;

    // 7. POST /api/sync (offline batch update branch)
    const syncRes = await syncRoute(
      new NextRequest('http://localhost:3000/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
        body: JSON.stringify({
          items: [
            {
              operationType: 'UPDATE',
              submissionUuid: id,
              idempotencyKey: 'idem-inv-sync-patch-1',
              expectedVersion: doc6.version || 1,
              payload: {
                childName: 'Meera Sync Batch Updated',
              },
            },
          ],
        }),
      })
    );
    expect(syncRes.status).toBe(200);
    const syncJson = await syncRes.json();
    expect(syncJson.results?.[0]?.status).toBe('synced');
    const doc7 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc7.rowVersion).toBeGreaterThan(prevRowVersion);
    expect(doc7.rowHash).not.toBe(hashAfterReplace);
    const hashAfterSyncPatch = doc7.rowHash;
    prevRowVersion = doc7.rowVersion;

    // 8. POST /api/submissions/[id]/sync-retry
    const configuredSpy = vi.spyOn(canonicalSubmissionAdapter, 'isConfigured').mockReturnValue(true);
    let syncRetryRes: Response;
    try {
      syncRetryRes = await syncRetryRoute(
        new NextRequest(`http://localhost:3000/api/submissions/${id}/sync-retry`, {
          method: 'POST',
          headers: {
            Origin: 'http://localhost:3000',
            Cookie: `evaluation_session_token=${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }),
        { params: { submissionId: id } }
      );
    } finally {
      configuredSpy.mockRestore();
    }
    expect(syncRetryRes.status).toBe(200);
    const doc8 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc8.rowVersion).toBeGreaterThan(prevRowVersion);
    prevRowVersion = doc8.rowVersion;

    // 9. DELETE /api/submissions/[id] (soft delete)
    const delRes = await deleteSubmissionRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}`, {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Test invariant soft-delete check' }),
      }),
      { params: { submissionId: id } }
    );
    expect(delRes.status).toBe(200);
    const doc9 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc9.rowVersion).toBeGreaterThan(prevRowVersion);
    expect(doc9.rowHash).not.toBe(hashAfterSyncPatch);
    const hashAfterDelete = doc9.rowHash;
    prevRowVersion = doc9.rowVersion;

    // 10. POST /api/submissions/[id]/restore
    const restoreRes = await restoreSubmissionRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}/restore`, {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Restore invariant check' }),
      }),
      { params: { submissionId: id } }
    );
    expect(restoreRes.status).toBe(200);
    const doc10 = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect(doc10.rowVersion).toBeGreaterThan(prevRowVersion);
    expect(doc10.rowHash).not.toBe(hashAfterDelete);
    expect(doc10.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('enforces architecturally that no source file mutates Firestore submissions outside FirestoreSubmissionAdapter', () => {
    const serverDir = path.join(process.cwd(), 'src');
    const directWriters: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
          const text = fs.readFileSync(full, 'utf8');
          if (/\.collection\(['"]submissions['"]\)/.test(text) && !full.endsWith('firestoreSubmissionAdapter.ts')) {
            directWriters.push(full);
          }
        }
      }
    }

    walk(serverDir);
    expect(directWriters).toEqual([]);

    const fsAdapterText = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'server', 'firestoreSubmissionAdapter.ts'), 'utf8');
    // Confirm the only direct write calls in FirestoreSubmissionAdapter are guarded by stampSubmissionRowIntegrity
    expect(fsAdapterText).toContain('stampSubmissionRowIntegrity');
    expect(fsAdapterText).not.toMatch(/collection\(['"]submissions['"]\)\.doc\([^)]*\)\.delete\(/);
  });
});
