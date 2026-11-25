import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/submissions/[submissionId]/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { createSessionToken } from '@/lib/server/sessionService';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import { clearRegistry } from '@/lib/server/credentialRegistry';

describe('State Team Record Edit Journey & Edge Cases', () => {
  let createdSubmissionId: string;
  let onboardingStore: MemoryOnboardingStore;
  let mhRegId: string;
  let kaRegId: string;

  beforeEach(async () => {
    clearRegistry();
    onboardingStore = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(onboardingStore);

    const mhReg = await onboardingStore.createStateTeamRegistration({
      firstName: 'Pooja',
      lastName: 'Deshmukh',
      workEmail: 'coordinator.mh@allianceindia.org',
      requestedState: 'Maharashtra',
      organization: 'Alliance India Maharashtra',
    });
    await onboardingStore.verifyStateTeamEmail('coordinator.mh@allianceindia.org');
    await onboardingStore.approveStateTeamRegistration(mhReg.id, 'admin-01', 'Maharashtra');
    mhRegId = mhReg.id;

    const kaReg = await onboardingStore.createStateTeamRegistration({
      firstName: 'Ravi',
      lastName: 'Gowda',
      workEmail: 'coordinator.ka@allianceindia.org',
      requestedState: 'Karnataka',
      organization: 'Alliance India Karnataka',
    });
    await onboardingStore.verifyStateTeamEmail('coordinator.ka@allianceindia.org');
    await onboardingStore.approveStateTeamRegistration(kaReg.id, 'admin-01', 'Karnataka');
    kaRegId = kaReg.id;

    MockSheetStore.reset();
    const testUuid = `test-sub-${Date.now()}`;
    const createResult = await canonicalSubmissionAdapter.createSubmission({
      payload: {
        uuid: testUuid,
        clientSubmissionId: testUuid,
        uniqueId: 'MH-PUN-2026-001',
        koboId: 'MH-PUN-2026-001',
        interviewerName: 'Sunita Patil',
        state: 'Maharashtra',
        district: 'Pune',
        demographics: {
          artNumber: 'MH-PUN-2026-001',
          childName: 'Aarav Patil',
          dob: '2018-05-12',
          gender: 'Male',
          state: 'Maharashtra',
          district: 'Pune',
          srName: 'Alliance India Maharashtra SR',
          ssrName: 'Pune Care Center',
        },
        formSubmittedBy: 'Sunita Patil',
        approvedAllianceIndia: 'Pending',
      } as any,
      idempotencyKey: `init-${Date.now()}`,
      requestId: `req-${testUuid}`,
    });

    createdSubmissionId = createResult.remoteSubmissionId || testUuid;
  });

  afterEach(() => {
    setOnboardingStoreForTesting(null);
    clearRegistry();
  });

  it('1. allows State Evaluator with matching state scope to edit record', async () => {
    const stateToken = createSessionToken({
      userId: mhRegId,
      username: 'coordinator.mh@allianceindia.org',
      name: 'Pooja Deshmukh',
      role: 'STATE_REVIEWER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
      canEdit: true,
    });

    const patchReq = new NextRequest(
      `https://cs-p3-production.web.app/api/submissions/${createdSubmissionId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${stateToken}`,
          Origin: 'https://cs-p3-production.web.app',
          Host: 'cs-p3-production.web.app',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          childName: 'Aarav Ramesh Patil',
          notes: 'Name spelling corrected per Aadhaar card verification.',
        }),
      }
    );

    const res = await PATCH(patchReq, { params: { submissionId: createdSubmissionId } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.version).toBe(2);
    expect(json.updatedAt).toBeDefined();
  });

  it('2. forbids State Evaluator from editing a record outside authorized state scope (403 FORBIDDEN_SCOPE)', async () => {
    // Evaluator has Karnataka scope only, but record is in Maharashtra
    const karnatakaToken = createSessionToken({
      userId: kaRegId,
      username: 'coordinator.ka@allianceindia.org',
      name: 'Ravi Gowda',
      role: 'STATE_REVIEWER',
      allowedStates: ['Karnataka'],
      allowedDistricts: ['Bangalore Urban'],
      canEdit: true,
    });

    const patchReq = new NextRequest(
      `https://cs-p3-production.web.app/api/submissions/${createdSubmissionId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${karnatakaToken}`,
          Origin: 'https://cs-p3-production.web.app',
          Host: 'cs-p3-production.web.app',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          notes: 'Attempted cross-state modification',
        }),
      }
    );

    const res = await PATCH(patchReq, { params: { submissionId: createdSubmissionId } });
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.code).toBe('FORBIDDEN_SCOPE');
    expect(json.message).toContain('Access denied to edit records in state "Maharashtra"');
  });

  it('3. rejects concurrent edits with outdated expectedVersion (409 CONCURRENCY_CONFLICT)', async () => {
    const adminToken = createSessionToken({
      userId: 'admin-01',
      username: 'admin@allianceindia.org',
      name: 'System Admin',
      role: 'ADMIN',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    });

    // First edit succeeds, advancing version from 1 to 2
    const firstReq = new NextRequest(
      `https://cs-p3-production.web.app/api/submissions/${createdSubmissionId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          Origin: 'https://cs-p3-production.web.app',
          Host: 'cs-p3-production.web.app',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          childName: 'Aarav P.',
        }),
      }
    );
    const firstRes = await PATCH(firstReq, { params: { submissionId: createdSubmissionId } });
    expect(firstRes.status).toBe(200);

    // Second edit uses stale expectedVersion: 1 -> MUST conflict with 409
    const secondReq = new NextRequest(
      `https://cs-p3-production.web.app/api/submissions/${createdSubmissionId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          Origin: 'https://cs-p3-production.web.app',
          Host: 'cs-p3-production.web.app',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          childName: 'Aarav Conflict',
        }),
      }
    );
    const secondRes = await PATCH(secondReq, { params: { submissionId: createdSubmissionId } });
    expect(secondRes.status).toBe(409);

    const json = await secondRes.json();
    expect(json.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('4. editing an existing record preserves remoteSubmissionId and marks syncStatus for re-sync without duplicating', async () => {
    const adminToken = createSessionToken({
      userId: 'admin-01',
      username: 'admin@allianceindia.org',
      name: 'System Admin',
      role: 'ADMIN',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    });

    const patchReq = new NextRequest(
      `https://cs-p3-production.web.app/api/submissions/${createdSubmissionId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          Origin: 'https://cs-p3-production.web.app',
          Host: 'cs-p3-production.web.app',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          approvedAllianceIndia: 'Approved',
        }),
      }
    );

    const res = await PATCH(patchReq, { params: { submissionId: createdSubmissionId } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.remoteSubmissionId).toBe(createdSubmissionId);
    expect(json.syncStatus).toBeDefined();
    expect(['SYNCED', 'PENDING_SHEET_SYNC']).toContain(json.syncStatus);
  });
});
