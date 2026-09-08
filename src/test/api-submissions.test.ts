import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createSubmission, GET as listSubmissions } from '@/app/api/submissions/route';
import { GET as getSubmission, PATCH as patchSubmission } from '@/app/api/submissions/[submissionId]/route';
import { GET as getHistory } from '@/app/api/submissions/[submissionId]/history/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

describe('API Gateway & OCC Integration Test Suite', () => {
  const validPayload = {
    uuid: 'a0000000-0000-4000-8000-000000000001',
    clientSubmissionId: 'a0000000-0000-4000-8000-000000000001',
    interviewerName: 'Sunita Sharma',
    demographics: {
      artNumber: 'MH-PUN-2045',
      childName: 'Priyanka Sunil D.',
      dob: '2019-06-15',
      gender: 'Female',
      caregiverName: 'Sunil D.',
      caregiverRelationship: 'Father',
      caregiverPhone: '9822123456',
      district: 'Pune',
    },
    household: {
      orphanStatus: 'None',
      primaryCaregiverOccupation: 'Agricultural Labor',
      monthlyHouseholdIncome: 4500,
      rationCardType: 'BPL',
      numberOfSiblings: 2,
    },
    nutrition: {
      heightCm: 105,
      weightKg: 14.2,
      muacMm: 122,
      bilateralPittingOedema: false,
      clinicalNotes: 'Initial field screening',
    },
    education: {
      schoolEnrolled: true,
      schoolType: 'Government',
      schoolGrade: 'Standard 2',
      attendancePercentage: 85,
      supportMaterialsNeeded: ['Notebooks', 'School Uniform'],
    },
    bankDetails: {
      accountHolderName: 'Sunil D.',
      accountNumber: '987654321012',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
      branchName: 'Pune Rural',
      passbookPhotoCaptured: true,
    },
    declaration: {
      consentAcknowledged: true,
      caseworkerName: 'Sunita Sharma',
      declarationDate: '2026-09-08',
    },
  };

  it('should require Idempotency-Key header on POST /api/submissions', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await createSubmission(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('should reject submission containing illegal artCenter field or failing validation', async () => {
    const invalid = { ...validPayload, demographics: { ...validPayload.demographics, artNumber: 'X' } };
    const req = new NextRequest('http://localhost:3000/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-test-val-err',
      },
      body: JSON.stringify(invalid),
    });

    const res = await createSubmission(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should create new record and return version 1 with canonical remote ID', async () => {
    const idemKey = 'idem-unique-12345';
    const req = new NextRequest('http://localhost:3000/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify(validPayload),
    });

    const res = await createSubmission(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.acknowledged).toBe(true);
    expect(body.version).toBe(1);
    expect(body.remoteSubmissionId).toBeDefined();
    expect(body.isDuplicate).toBe(false);

    // Repeat with SAME Idempotency-Key -> returns original canonical result without creating duplicate
    const repeatReq = new NextRequest('http://localhost:3000/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify(validPayload),
    });

    const repeatRes = await createSubmission(repeatReq);
    expect(repeatRes.status).toBe(200);
    const repeatBody = await repeatRes.json();
    expect(repeatBody.isDuplicate).toBe(true);
    expect(repeatBody.remoteSubmissionId).toBe(body.remoteSubmissionId);
    expect(repeatBody.version).toBe(1);
  });

  it('should list submissions via GET /api/submissions', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=5');
    const res = await listSubmissions(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should fetch single record by ID and apply PATCH with optimistic concurrency control', async () => {
    // 1. Fetch created record
    const getReq = new NextRequest('http://localhost:3000/api/submissions/a0000000-0000-4000-8000-000000000001');
    const getRes = await getSubmission(getReq, { params: { submissionId: 'a0000000-0000-4000-8000-000000000001' } });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.child_name).toBe('Priyanka Sunil D.');
    expect(getBody.data.version).toBe(1);

    // 2. PATCH with matching expectedVersion: 1
    const patchReq = new NextRequest('http://localhost:3000/api/submissions/a0000000-0000-4000-8000-000000000001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 1,
        caregiverPhone: '9822999888',
        weightKg: 15.0,
      }),
    });

    const patchRes = await patchSubmission(patchReq, { params: { submissionId: 'a0000000-0000-4000-8000-000000000001' } });
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.version).toBe(2);
    expect(patchBody.data.caregiverPhone).toBe('9822999888');

    // 3. Stale PATCH with expectedVersion: 1 -> MUST return HTTP 409 CONFLICT
    const staleReq = new NextRequest('http://localhost:3000/api/submissions/a0000000-0000-4000-8000-000000000001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 1, // Stale! Current version is 2
        caregiverPhone: '9111111111',
      }),
    });

    const conflictRes = await patchSubmission(staleReq, { params: { submissionId: 'a0000000-0000-4000-8000-000000000001' } });
    expect(conflictRes.status).toBe(409);
    const conflictBody = await conflictRes.json();
    expect(conflictBody.code).toBe('CONCURRENCY_CONFLICT');
    expect(conflictBody.currentVersion).toBe(2);
    expect(conflictBody.expectedVersion).toBe(1);

    // 4. Verify privacy-safe audit trail
    const histReq = new NextRequest('http://localhost:3000/api/submissions/a0000000-0000-4000-8000-000000000001/history');
    const histRes = await getHistory(histReq, { params: { submissionId: 'a0000000-0000-4000-8000-000000000001' } });
    expect(histRes.status).toBe(200);
    const histBody = await histRes.json();
    expect(histBody.history.length).toBeGreaterThanOrEqual(2);
    expect(histBody.history[0].operation).toBe('UPDATE');
    expect(histBody.history[0].version).toBe(2);
    expect(histBody.history[0].changedFields).toContain('caregiverPhone');
  });
});
