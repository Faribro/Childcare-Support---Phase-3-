import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createSubmission } from '@/app/api/submissions/route';
import { PATCH as updateSubmission } from '@/app/api/submissions/[submissionId]/route';
import { GET as healthCheck } from '@/app/api/health/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

describe('Server Response Contract & Health Envelope (Phase 5 & 6)', () => {
  beforeEach(() => {
    MockSheetStore.reset();
  });

  const validUuid = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
  const validSubmission = {
    uuid: validUuid,
    clientSubmissionId: validUuid,
    interviewerName: 'Staff Member',
    demographics: {
      artNumber: 'DL-SOU-101122-01',
      childName: 'Aarav Kumar',
      dob: '2020-01-01',
      gender: 'Male',
      caregiverName: 'Pooja Kumar',
      caregiverRelationship: 'Mother',
      caregiverPhone: '9876543210',
      district: 'South Delhi',
    },
    household: {
      orphanStatus: 'None',
      primaryCaregiverOccupation: 'Daily Wage',
      monthlyHouseholdIncome: 8000,
      rationCardType: 'BPL',
      numberOfSiblings: 2,
    },
    health: {
      heightCm: 95,
      weightKg: 13.5,
      muacMm: 130,
      bilateralPittingOedema: false,
    },
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    },
    education: {
      schoolEnrolled: true,
      schoolType: 'Government',
      schoolGrade: 'Class 1',
      attendancePercentage: 90,
      supportMaterialsNeeded: ['Uniform'],
    },
    bankDetails: {
      accountHolderName: 'Pooja Kumar',
      accountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
      passbookPhotoCaptured: true,
    },
    declaration: {
      consentAcknowledged: true,
      caseworkerName: 'Staff Member',
      declarationDate: '2026-09-08',
    },
  };

  describe('POST /api/submissions Contract', () => {
    it('returns canonical 201 success envelope on valid submission', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `idem-${validUuid}`,
        },
        body: JSON.stringify(validSubmission),
      });

      const res = await createSubmission(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.status).toBe('success');
      expect(body.acknowledged).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.remoteSubmissionId).toBeDefined();
      expect(body.data.clientSubmissionId).toBe(validUuid);
      expect(body.data.version).toBe(1);
      expect(body.data.syncStatus).toBe('SYNCED');
      expect(body.requestId).toBeDefined();
    });

    it('returns standardized 422 error envelope without echoing raw sensitive input', async () => {
      const invalidSubmission = {
        uuid: 'not-a-uuid', // Invalid UUID
        demographics: {
          artNumber: 'INVALID',
          // Missing childName, caregiverName, etc.
        },
      };

      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-fail-422',
        },
        body: JSON.stringify(invalidSubmission),
      });

      const res = await createSubmission(req);
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.status).toBe('error');
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('The record needs correction before it can be sent.');
      expect(body.details).toBeDefined();
      expect(Array.isArray(body.details.fields)).toBe(true);
      expect(body.details.fields.length).toBeGreaterThan(0);
      expect(body.requestId).toBeDefined();

      // Verify privacy: raw inputs are NOT echoed in details.fields
      for (const field of body.details.fields) {
        expect(field.field).toBeDefined();
        expect(field.issue).toBeDefined();
        expect((field as any).value).toBeUndefined();
        expect((field as any).input).toBeUndefined();
      }
    });
  });

  describe('PATCH /api/submissions/[submissionId] Contract', () => {
    it('returns canonical 200 success envelope on valid update', async () => {
      // Seed initial record
      MockSheetStore.createRecord(validSubmission as any, 'seed-key-1', 'req-seed-1');

      const patchReq = new NextRequest(`http://localhost:3000/api/submissions/${validUuid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"1"',
          'Idempotency-Key': 'idem-patch-1',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          changes: {
            childName: 'Aarav Kumar Updated',
            monthlyIncomeRs: 9000,
          },
        }),
      });

      const res = await updateSubmission(patchReq, { params: { submissionId: validUuid } });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('success');
      expect(body.acknowledged).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.version).toBe(2);
      expect(body.data.syncStatus).toBe('SYNCED');
      expect(body.requestId).toBeDefined();
    });

    it('returns standardized 422 error envelope on invalid patch payload', async () => {
      const patchReq = new NextRequest(`http://localhost:3000/api/submissions/${validUuid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"1"',
          'Idempotency-Key': 'idem-patch-fail',
        },
        body: JSON.stringify({
          expectedVersion: 0, // Must be positive integer >= 1
          changes: {
            childName: 'Aarav',
          },
        }),
      });

      const res = await updateSubmission(patchReq, { params: { submissionId: validUuid } });
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.status).toBe('error');
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('The record needs correction before it can be sent.');
      expect(body.details?.fields).toBeDefined();
      expect(body.requestId).toBeDefined();
    });

    it('returns 409 CONFLICT on OCC version mismatch', async () => {
      MockSheetStore.createRecord(validSubmission as any, 'seed-key-occ', 'req-occ-seed');

      // Update once directly to bump version to 2
      MockSheetStore.updateRecord(validUuid, { expectedVersion: 1, childName: 'Aarav V2' } as any, 'Staff', 'req-occ-update');

      // Attempt update with stale version 1
      const patchReq = new NextRequest(`http://localhost:3000/api/submissions/${validUuid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"1"',
          'Idempotency-Key': 'idem-stale-update',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          changes: { childName: 'Aarav Stale' },
        }),
      });

      const res = await updateSubmission(patchReq, { params: { submissionId: validUuid } });
      expect(res.status).toBe(409);

      const body = await res.json();
      expect(body.status).toBe('error');
      expect(body.code).toBe('CONCURRENCY_CONFLICT');
      expect(body.currentVersion).toBe(2);
    });
  });

  describe('GET /api/health Diagnostics (Phase 6)', () => {
    it('returns safe diagnostics without leaking secrets or sheet URLs', async () => {
      const res = await healthCheck();
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.apiContractVersion).toBe('v3.1.0-contract');
      expect(body.buildCommitSha).toBeDefined();
      expect(body.adapterMode).toBeDefined();
      expect(['configured', 'failing_closed_unconfigured', 'mock_development']).toContain(body.adapterMode);
      expect(body.appEnvironmentMarker).toBeDefined();

      // Strict security: verify no secrets or internal URLs are in the payload
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('script.google.com');
      expect(serialized).not.toContain('docs.google.com');
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('private_key');
    });
  });
});
