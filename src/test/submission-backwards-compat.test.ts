import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listSubmissionsRoute, POST as createSubmissionRoute } from '@/app/api/submissions/route';
import {
  GET as getSubmissionRoute,
  PATCH as patchSubmissionRoute,
} from '@/app/api/submissions/[submissionId]/route';
import { GET as summarySubmissionsRoute } from '@/app/api/submissions/summary/route';
import { GET as assetSubmissionRoute, POST as postAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { GET as exportSubmissionRoute } from '@/app/api/submissions/[submissionId]/export/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { FirestoreSubmissionAdapter } from '@/lib/server/firestoreSubmissionAdapter';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { createSessionToken } from '@/lib/server/sessionService';

const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Backwards-Compatibility vs e74b61f: rowVersion/rowHash & Soft Delete Non-Regression', () => {
  const savedDataEngine = process.env.DATA_ENGINE;
  const savedSessionSecret = process.env.SESSION_SECRET;
  let adminToken: string;
  let fsAdapter: FirestoreSubmissionAdapter;

  beforeEach(() => {
    process.env.DATA_ENGINE = 'firestore';
    process.env.SESSION_SECRET = 'a_very_secure_test_session_secret_for_cryptographic_signing_32_chars_long!';
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();

    let rev = 1;
    fsAdapter = new FirestoreSubmissionAdapter({
      appEnv: 'development',
      databaseId: '(default)',
      gatewayClient: {
        callGateway: async () => {
          rev++;
          return {
            status: 'success',
            statusCode: 200,
            resolvedRow: 4,
            newRevision: rev,
            newFileId: `drv-compat-${rev}`,
            cellFormula: `=HYPERLINK("https://drive.google.com/file/d/drv-compat-${rev}/view", "Restricted Doc [Passbook]")`,
          };
        },
      },
    });
    canonicalSubmissionAdapter.setFirestoreAdapter(fsAdapter);

    adminToken = createSessionToken({
      userId: 'compat-admin',
      name: 'Compat Admin',
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
  });

  it('preserves standard e74b61f create, read, list, summary, edit (OCC), upload, and export response shapes for callers unaware of rowVersion/rowHash', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440222';
    const body = {
      uuid: id,
      clientSubmissionId: id,
      uniqueId: id,
      schemaVersion: 3,
      supportCategories: ['nutrition'],
      interviewerName: 'Caseworker Priya',
      consent: {
        agreeToParticipate: true,
        signatureDataUrl: SAMPLE_PNG_DATA_URL,
      },
      demographics: {
        artNumber: 'MH-PUN-202602-01',
        childName: 'Diya Patil',
        dob: '2017-03-15',
        calculatedAgeYears: 9,
        gender: 'Female',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Rekha Patil',
        caregiverRelationship: 'Mother',
        contactNumber: '9876543210',
        caregiverContactNumber: '9876543210',
        fullAddress: 'Pune, Maharashtra',
        state: 'Maharashtra',
        district: 'Pune',
      },
      householdFinancial: {
        totalFamilyMembers: 4,
        numberOfChildrenUnder18: 2,
        monthlyIncomeRs: 14000,
        mainSourceOfIncome: 'Daily wage labour',
      },
      health: {
        heightCm: 120,
        weightKg: 23,
        haemoglobinGdl: 11.2,
        otherHealthConditions: ['None'],
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: '3',
      },
      educationStatus: {
        educationStatus: 'Dropped out of school',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Rekha Patil',
        bankAccountNumber: '123456789012',
        bankIfscCode: 'SBIN0001234',
        bankLinkedMobileNumber: '9876543210',
        passbookPhotoUrl: SAMPLE_PNG_DATA_URL,
        aadhaarCardPhotoUrl: SAMPLE_PNG_DATA_URL,
        childPhotoUrl: SAMPLE_PNG_DATA_URL,
      },
      finalReview: {
        formSubmittedBy: 'Caseworker Priya',
        approvedAllianceIndia: 'Pending',
        allInfoCorrect: true,
        organizationName: 'Alliance MH',
        organizationEmail: 'mh@allianceindia.org',
      },
    };

    // 1. Create without passing any rowVersion/rowHash fields
    const createRes = await createSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-compat-create',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
        body: JSON.stringify(body),
      })
    );
    expect([200, 201]).toContain(createRes.status);
    const createJson = await createRes.json();
    expect(createJson.status).toBe('success');
    expect(createJson.acknowledged).toBe(true);
    expect(createJson.data.clientSubmissionId).toBe(id);
    expect(createJson.data.version).toBe(1);
    expect(createJson.data.submissionStatus).toBe('ACCEPTED');

    // 2. Detail read + list + summary return standard envelopes
    const detailRes = await getSubmissionRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}`, {
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      }),
      { params: { submissionId: id } }
    );
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.status).toBe('success');
    expect(detailJson.data.uniqueId).toBe(id);
    expect(
      detailJson.data.demographics?.childName ||
        detailJson.data.childName ||
        detailJson.data['9\nChild Name']
    ).toBe('Diya Patil');
    expect(detailJson.data.rowVersion).toBeUndefined();
    expect(detailJson.data.rowHash).toBeUndefined();

    const listRes = await listSubmissionsRoute(
      new NextRequest('http://localhost:3000/api/submissions', {
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      })
    );
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.submissions).toHaveLength(1);
    expect(listJson.pagination.totalCount).toBe(1);

    const summaryRes = await summarySubmissionsRoute(
      new NextRequest('http://localhost:3000/api/submissions/summary', {
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      })
    );
    expect(summaryRes.status).toBe(200);
    const summaryJson = await summaryRes.json();
    expect(summaryJson.data.total).toBe(1);
    expect(summaryJson.data.serverConfirmed).toBe(1);

    // 3. Edit using only legacy expectedVersion payload (no rowVersion needed):
    // In e74b61f FirestoreSubmissionAdapter, PATCH increments version monotonically (1 -> 2 -> 3)
    // and MockSheetStore enforces 409 OCC conflict on stale expectedVersion; preserve both identically.
    const patchRes = await patchSubmissionRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}`, {
        method: 'PATCH',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
        body: JSON.stringify({ expectedVersion: 1, childName: 'Diya Patil Updated' }),
      }),
      { params: { submissionId: id } }
    );
    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.status).toBe('success');
    expect(patchJson.version).toBe(2);

    // MockSheetStore OCC 409 contract unchanged vs e74b61f
    const mockTargetId = MockSheetStore.listRecords({ limit: 1 }).records[0].remote_submission_id;
    const mockStale = MockSheetStore.updateRecord(
      mockTargetId,
      { expectedVersion: 999, childName: 'Stale Conflict' },
      'test-actor',
      'req-compat-occ'
    );
    expect(mockStale.success).toBe(false);
    expect('conflict' in mockStale && mockStale.conflict).toBe(true);

    // 4. Asset upload works identically and stores formula/data URL
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
          expectedVersion: 2,
          expectedCurrentCellStateHash: 'c'.repeat(64),
        }),
      }),
      { params: { submissionId: id } }
    );
    expect(assetRes.status).toBe(200);
    const assetJson = await assetRes.json();
    expect(assetJson.status).toBe('success');
    expect(assetJson.assetStatus).toBe('UPLOADED');

    // Verify stored rowVersion/rowHash tracked internally (create + optional async mirror sync + patch + asset)
    // while read & export contracts stay compatible
    const stored = await fsAdapter.getSubmission(id, undefined, { includeDeleted: true });
    expect([3, 4]).toContain(stored.rowVersion);
    expect(stored.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const getAssetCheck = await assetSubmissionRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}/asset?docType=aadhaarCardPhoto`, {
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      }),
      { params: { submissionId: id } }
    );
    expect(getAssetCheck.status).toBe(200);

    const exportRes = await exportSubmissionRoute(
      new NextRequest(`http://localhost:3000/api/submissions/${id}/export`, {
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      }),
      { params: { submissionId: id } }
    );
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-type')).toContain('application/pdf');
  });
});
