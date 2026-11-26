import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getSubmissionRoute,
  PATCH as patchSubmissionRoute,
  DELETE as deleteSubmissionRoute,
} from '@/app/api/submissions/[submissionId]/route';
import { POST as restoreSubmissionRoute } from '@/app/api/submissions/[submissionId]/restore/route';
import { GET as listSubmissionsRoute } from '@/app/api/submissions/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { FirestoreSubmissionAdapter } from '@/lib/server/firestoreSubmissionAdapter';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { createSessionToken } from '@/lib/server/sessionService';
import { MemoryOnboardingStore, setOnboardingStoreForTesting } from '@/lib/server/onboardingStore';
import { clearRegistry, createMockFirestore, setFirestoreDbForTesting } from '@/lib/server/credentialRegistry';
import { isReconcileSnapshotEnabled, isNightlyReconciliationEnabled, isTrashMirrorTabEnabled } from '@/lib/server/reconciliationFlags';

describe('Soft Delete, Restore, & DELETE Bug Fix Suite', () => {
  const savedDataEngine = process.env.DATA_ENGINE;
  const savedSessionSecret = process.env.SESSION_SECRET;
  let gatewayCalls: Record<string, any>[];
  let fsAdapter: FirestoreSubmissionAdapter;
  let onboardingStore: MemoryOnboardingStore;
  let approvedStateRegId: string;

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'a_very_secure_test_session_secret_for_cryptographic_signing_32_chars_long!';
    process.env.DATA_ENGINE = 'firestore';
    gatewayCalls = [];
    clearRegistry();
    setFirestoreDbForTesting(createMockFirestore());
    onboardingStore = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(onboardingStore);
    const reg = await onboardingStore.createStateTeamRegistration({
      firstName: 'State',
      lastName: 'MH',
      workEmail: 'state.mh.softdel@allianceindia.org',
      requestedState: 'Maharashtra',
      organization: 'Alliance MH',
    });
    await onboardingStore.verifyStateTeamEmail(reg.workEmail);
    await onboardingStore.approveStateTeamRegistration(reg.id, 'lead-admin-01', 'Maharashtra');
    approvedStateRegId = reg.id;

    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
    fsAdapter = new FirestoreSubmissionAdapter({
      appEnv: 'development',
      databaseId: '(default)',
      gatewayClient: {
        callGateway: async (payload) => {
          gatewayCalls.push(payload);
          return { status: 'success', statusCode: 200 };
        },
      },
    });
    canonicalSubmissionAdapter.setFirestoreAdapter(fsAdapter);

    await fsAdapter.createSubmission({
      payload: {
        clientSubmissionId: 'SD-MH-001',
        uniqueId: 'SD-MH-001',
        demographics: { childName: 'Aarav', state: 'Maharashtra', district: 'Pune' },
        state: 'Maharashtra',
        district: 'Pune',
      } as any,
      idempotencyKey: 'sd-key-mh-001',
      requestId: 'req-sd-1',
    });

    await fsAdapter.createSubmission({
      payload: {
        clientSubmissionId: 'SD-WB-001',
        uniqueId: 'SD-WB-001',
        demographics: { childName: 'Riya', state: 'West Bengal', district: 'Kolkata' },
        state: 'West Bengal',
        district: 'Kolkata',
      } as any,
      idempotencyKey: 'sd-key-wb-001',
      requestId: 'req-sd-2',
    });
  });

  afterEach(() => {
    if (savedDataEngine === undefined) delete process.env.DATA_ENGINE;
    else process.env.DATA_ENGINE = savedDataEngine;
    if (savedSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = savedSessionSecret;
  });

  it('reconciliation feature flags default OFF', () => {
    delete process.env.RECONCILIATION_SNAPSHOT_ENABLED;
    delete process.env.SHEET_RECONCILE_ENABLED;
    delete process.env.SHEET_TRASH_MIRROR_ENABLED;
    expect(isReconcileSnapshotEnabled()).toBe(false);
    expect(isNightlyReconciliationEnabled()).toBe(false);
    expect(isTrashMirrorTabEnabled()).toBe(false);
  });

  it('fixes the DELETE bug in DATA_ENGINE=firestore (.success: true, tombstone preserved, hidden from active reads) and restores via Administration', async () => {
    const leadershipToken = createSessionToken({
      userId: 'lead-admin-01',
      name: 'National Lead',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    });

    // 1. Soft-delete cross-state record via DELETE HTTP handler
    const delReq = new NextRequest('http://localhost:3000/api/submissions/SD-WB-001', {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: `evaluation_session_token=${leadershipToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Confirmed duplicate child profile' }),
    });
    const delRes = await deleteSubmissionRoute(delReq, { params: { submissionId: 'SD-WB-001' } });
    expect(delRes.status).toBe(200);
    const delJson = await delRes.json();
    expect(delJson.status).toBe('success');
    expect(delJson.deleted).toBe(true);
    expect(delJson.softDeleted).toBe(true);
    expect(delJson.reason).toBe('Confirmed duplicate child profile');

    // Gateway received softDelete=true payload
    expect(gatewayCalls.some((c) => c.action === 'delete' && c.softDelete === true && c.uniqueId === 'SD-WB-001')).toBe(true);

    // 2. Active GET & LIST exclude soft-deleted tombstone
    const getRes = await getSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-WB-001', {
        headers: { Cookie: `evaluation_session_token=${leadershipToken}` },
      }),
      { params: { submissionId: 'SD-WB-001' } }
    );
    expect(getRes.status).toBe(404);

    const listRes = await listSubmissionsRoute(
      new NextRequest('http://localhost:3000/api/submissions', {
        headers: { Cookie: `evaluation_session_token=${leadershipToken}` },
      })
    );
    const listJson = await listRes.json();
    const ids = (listJson.data?.records || []).map((r: any) => r.uniqueId || r.id);
    expect(ids).toContain('SD-MH-001');
    expect(ids).not.toContain('SD-WB-001');

    // 3. Tombstone still exists durably with metadata
    const tombstone = await fsAdapter.getSubmission('SD-WB-001', undefined, { includeDeleted: true });
    expect(tombstone).not.toBeNull();
    expect(tombstone.deletedBy).toBe('lead-admin-01');
    expect(tombstone.deleteReason).toBe('Confirmed duplicate child profile');
    expect(tombstone.deletedAt).toBeTruthy();

    // 4. PATCH against soft-deleted record fails closed with 404
    const patchDeletedRes = await patchSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-WB-001', {
        method: 'PATCH',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${leadershipToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expectedVersion: 1, childName: 'Should Fail' }),
      }),
      { params: { submissionId: 'SD-WB-001' } }
    );
    expect(patchDeletedRes.status).toBe(404);

    // 5. Administration restores soft-deleted record via POST /restore
    const restoreRes = await restoreSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-WB-001/restore', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${leadershipToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Audit cleared; restore active record' }),
      }),
      { params: { submissionId: 'SD-WB-001' } }
    );
    expect(restoreRes.status).toBe(200);
    const restoreJson = await restoreRes.json();
    expect(restoreJson.restored).toBe(true);

    // Active GET sees record again
    const restoredGet = await getSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-WB-001', {
        headers: { Cookie: `evaluation_session_token=${leadershipToken}` },
      }),
      { params: { submissionId: 'SD-WB-001' } }
    );
    expect(restoredGet.status).toBe(200);

    // Restoring already-active record returns 409 NOT_DELETED
    const secondRestore = await restoreSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-WB-001/restore', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${leadershipToken}`,
        },
      }),
      { params: { submissionId: 'SD-WB-001' } }
    );
    expect(secondRestore.status).toBe(409);
    expect((await secondRestore.json()).code).toBe('NOT_DELETED');
  });

  it('enforces state scope and mandatory reason for STATE_REVIEWER, denies restore to non-Administration, and blocks FIELD_USER', async () => {
    const stateToken = createSessionToken({
      userId: approvedStateRegId,
      username: 'state.mh.softdel@allianceindia.org',
      name: 'MH Coordinator',
      role: 'STATE_REVIEWER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
      credentialVersion: 1,
      authMethod: 'email_otp',
      canEdit: true,
    });
    const fieldToken = createSessionToken({
      userId: 'field-mh-01',
      name: 'Field Worker',
      role: 'FIELD_USER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
    });

    // State reviewer without reason -> 400
    const noReasonRes = await deleteSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-MH-001', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${stateToken}`,
        },
      }),
      { params: { submissionId: 'SD-MH-001' } }
    );
    expect(noReasonRes.status).toBe(400);
    expect((await noReasonRes.json()).code).toBe('DELETE_REASON_REQUIRED');

    // State reviewer cross-state with reason -> 403 FORBIDDEN_SCOPE
    const crossRes = await deleteSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-WB-001', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${stateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Attempting cross-state delete' }),
      }),
      { params: { submissionId: 'SD-WB-001' } }
    );
    expect(crossRes.status).toBe(403);
    expect((await crossRes.json()).code).toBe('FORBIDDEN_SCOPE');

    // State reviewer in-state with reason -> 200
    const okStateRes = await deleteSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-MH-001', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${stateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Child migrated permanently out of state' }),
      }),
      { params: { submissionId: 'SD-MH-001' } }
    );
    expect(okStateRes.status).toBe(200);

    // State reviewer cannot restore -> 403
    const stateRestoreRes = await restoreSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-MH-001/restore', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${stateToken}`,
        },
      }),
      { params: { submissionId: 'SD-MH-001' } }
    );
    expect(stateRestoreRes.status).toBe(403);
    expect((await stateRestoreRes.json()).code).toBe('FORBIDDEN');

    // Field user denied delete and restore -> 403
    const fieldDelRes = await deleteSubmissionRoute(
      new NextRequest('http://localhost:3000/api/submissions/SD-WB-001', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${fieldToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Worker delete' }),
      }),
      { params: { submissionId: 'SD-WB-001' } }
    );
    expect(fieldDelRes.status).toBe(403);
  });
});
