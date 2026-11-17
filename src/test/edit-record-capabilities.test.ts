import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  initializeTestFixtures,
  resetRateLimits,
} from '@/lib/server/credentialRegistry';
import { createSessionToken } from '@/lib/server/sessionService';
import {
  GET as getSubmissionDetailRoute,
  PATCH as patchSubmissionRoute,
} from '@/app/api/submissions/[submissionId]/route';
import {
  PUT as putAssetRoute,
} from '@/app/api/submissions/[submissionId]/asset/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

describe('Edit Record Capabilities & Permission Enforcement', () => {
  beforeEach(async () => {
    process.env.SESSION_SECRET = 'a_very_secure_test_session_secret_for_cryptographic_signing_32_chars_long!';
    (process.env as any).NODE_ENV = 'test';
    await initializeTestFixtures();
    resetRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. GET /api/submissions/[id] Capabilities Model', () => {
    it('returns capabilities.canEdit=true, canDelete=true for Administrator', async () => {
      const adminToken = await createSessionToken({
        userId: 'admin-01',
        role: 'ADMIN',
        name: 'Central Admin',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${adminToken}` },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.capabilities).toBeDefined();
      expect(data.capabilities.canEdit).toBe(true);
      expect(data.capabilities.canDelete).toBe(true);
    });

    it('returns capabilities.canEdit=true, canDelete=false for Leadership', async () => {
      const leaderToken = await createSessionToken({
        userId: 'lead-01',
        role: 'LEADERSHIP',
        name: 'Dr. Leadership Reviewer',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${leaderToken}` },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.capabilities).toBeDefined();
      expect(data.capabilities.canEdit).toBe(true);
      expect(data.capabilities.canDelete).toBe(false);
    });

    it('returns capabilities.canEdit=true for authorized in-state State Reviewer with edit clearance', async () => {
      const stateReviewerToken = await createSessionToken({
        userId: 'rev-mh-01',
        role: 'STATE_REVIEWER',
        name: 'Maharashtra Coordinator',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        canEdit: true,
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${stateReviewerToken}` },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.capabilities).toBeDefined();
      expect(data.capabilities.canEdit).toBe(true);
      expect(data.capabilities.canDelete).toBe(false);
    });

    it('returns capabilities.canEdit=false for read-only State Reviewer (canEdit=false)', async () => {
      const readOnlyReviewerToken = await createSessionToken({
        userId: 'rev-ro-01',
        role: 'STATE_REVIEWER',
        name: 'Maharashtra ReadOnly Evaluator',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        canEdit: false,
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${readOnlyReviewerToken}` },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.capabilities.canEdit).toBe(false);
      expect(data.capabilities.reason).toContain('read-only policy');
    });

    it('denies cross-state reviewer with 403 FORBIDDEN_SCOPE', async () => {
      const wbReviewerToken = await createSessionToken({
        userId: 'rev-wb-01',
        role: 'STATE_REVIEWER',
        name: 'West Bengal Reviewer',
        allowedStates: ['West Bengal'],
        allowedDistricts: ['*'],
        canEdit: true,
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${wbReviewerToken}` },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN_SCOPE');
    });

    it('returns canEdit=true for field worker who authored the record (when pending approval)', async () => {
      const fieldUserToken = await createSessionToken({
        userId: 'worker-anil',
        role: 'FIELD_USER',
        name: 'Anil Deshmukh', // Matches interviewer in MH-PUN-081200-02 fixture
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${fieldUserToken}` },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.capabilities).toBeDefined();
      expect(data.capabilities.canEdit).toBe(true);
      expect(data.capabilities.canDelete).toBe(false);
    });

    it('returns canEdit=false for field worker when record has been approved by Leadership', async () => {
      // Mock an approved record return
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        statusCode: 200,
        status: 'success',
        data: {
          uniqueId: 'MH-PUN-APPROVED-01',
          authorId: 'worker-anil',
          submittedByWorkerId: 'worker-anil',
          state: 'Maharashtra',
          district: 'Pune',
          submittedBy: 'Anil Deshmukh',
          interviewerName: 'Anil Deshmukh',
          isApproved: true,
          approvedAllianceIndia: 'APPROVED',
          version: 2,
        },
        version: 2,
      });

      const fieldUserToken = await createSessionToken({
        userId: 'worker-anil',
        role: 'FIELD_USER',
        name: 'Anil Deshmukh',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-APPROVED-01', {
        headers: { cookie: `evaluation_session_token=${fieldUserToken}` },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-APPROVED-01' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.capabilities).toBeDefined();
      expect(data.capabilities.canEdit).toBe(false);
      expect(data.capabilities.reason).toContain('approved by Leadership and is locked against field-worker edits');
    });

    it('returns canEdit=false for field worker who is not the author of the record', async () => {
      const nonAuthorToken = await createSessionToken({
        userId: 'worker-other',
        role: 'FIELD_USER',
        name: 'Other Worker', // Does not match Anil Deshmukh
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { cookie: `evaluation_session_token=${nonAuthorToken}` },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.capabilities).toBeDefined();
      expect(data.capabilities.canEdit).toBe(false);
      expect(data.capabilities.reason).toContain('Only the originating field worker');
    });

    it('denies anonymous unauthenticated caller with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        headers: { 'x-test-unauthenticated': 'true' },
      });

      const res = await getSubmissionDetailRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Server Guard on PATCH /api/submissions/[id]', () => {
    it('blocks field worker from editing a Leadership-approved record with 403 RECORD_LOCKED_APPROVED', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        statusCode: 200,
        status: 'success',
        data: {
          uniqueId: 'MH-PUN-APPROVED-01',
          authorId: 'worker-anil',
          submittedByWorkerId: 'worker-anil',
          state: 'Maharashtra',
          district: 'Pune',
          submittedBy: 'Anil Deshmukh',
          interviewerName: 'Anil Deshmukh',
          isApproved: true,
          approvedAllianceIndia: 'APPROVED',
          version: 2,
        },
        version: 2,
      });

      const fieldUserToken = await createSessionToken({
        userId: 'worker-anil',
        role: 'FIELD_USER',
        name: 'Anil Deshmukh',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-APPROVED-01', {
        method: 'PATCH',
        headers: {
          cookie: `evaluation_session_token=${fieldUserToken}`,
          'Content-Type': 'application/json',
          'If-Match': '2',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          expectedVersion: 2,
          remarks: 'Attempted field worker edit on approved record',
        }),
      });

      const res = await patchSubmissionRoute(req, { params: { submissionId: 'MH-PUN-APPROVED-01' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('RECORD_LOCKED_APPROVED');
    });

    it('blocks field worker from editing an assessment authored by another worker with 403 FORBIDDEN_AUTHOR_MISMATCH', async () => {
      const nonAuthorToken = await createSessionToken({
        userId: 'worker-other',
        role: 'FIELD_USER',
        name: 'Different Field Worker',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          cookie: `evaluation_session_token=${nonAuthorToken}`,
          'Content-Type': 'application/json',
          'If-Match': '1',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          remarks: 'Attempted edit by non-author',
        }),
      });

      const res = await patchSubmissionRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN_AUTHOR_MISMATCH');
    });
  });

  describe('3. Server Guard on PUT /api/submissions/[id]/asset', () => {
    it('blocks field worker from replacing intake assets on a Leadership-approved record with 403 RECORD_LOCKED_APPROVED', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        statusCode: 200,
        status: 'success',
        data: {
          uniqueId: 'MH-PUN-APPROVED-01',
          authorId: 'worker-anil',
          submittedByWorkerId: 'worker-anil',
          state: 'Maharashtra',
          district: 'Pune',
          submittedBy: 'Anil Deshmukh',
          interviewerName: 'Anil Deshmukh',
          isApproved: true,
          approvedAllianceIndia: 'APPROVED',
          version: 2,
        },
        version: 2,
      });

      const fieldUserToken = await createSessionToken({
        userId: 'worker-anil',
        role: 'FIELD_USER',
        name: 'Anil Deshmukh',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-APPROVED-01/asset', {
        method: 'PUT',
        headers: {
          cookie: `evaluation_session_token=${fieldUserToken}`,
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          docType: 'childPhoto',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 2,
        }),
      });

      const res = await putAssetRoute(req, { params: { submissionId: 'MH-PUN-APPROVED-01' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('RECORD_LOCKED_APPROVED');
    });

    it('allows field worker who authored the record to replace outstanding bank passbook on a Leadership-approved record', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        statusCode: 200,
        status: 'success',
        data: {
          uniqueId: 'MH-PUN-APPROVED-01',
          authorId: 'worker-anil',
          submittedByWorkerId: 'worker-anil',
          state: 'Maharashtra',
          district: 'Pune',
          submittedBy: 'Anil Deshmukh',
          interviewerName: 'Anil Deshmukh',
          isApproved: true,
          approvedAllianceIndia: 'APPROVED',
          version: 2,
        },
        version: 2,
      });

      vi.spyOn(canonicalSubmissionAdapter, 'replaceAsset').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        acknowledged: true,
        remoteSubmissionId: 'MH-PUN-APPROVED-01',
        uniqueId: 'MH-PUN-APPROVED-01',
        docType: 'passbookPhoto',
        cellFormula: '=HYPERLINK("https://drive.google.com/passbook-1", "Passbook")',
        assetStatus: 'UPLOADED',
        updatedAt: new Date().toISOString(),
      });

      const fieldUserToken = await createSessionToken({
        userId: 'worker-anil',
        role: 'FIELD_USER',
        name: 'Anil Deshmukh',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-APPROVED-01/asset', {
        method: 'PUT',
        headers: {
          cookie: `evaluation_session_token=${fieldUserToken}`,
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          docType: 'passbookPhoto',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expectedRevision: 2,
        }),
      });

      const res = await putAssetRoute(req, { params: { submissionId: 'MH-PUN-APPROVED-01' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('success');
      expect(data.acknowledged).toBe(true);
    });
  });
});
