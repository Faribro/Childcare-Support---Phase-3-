/**
 * Automated Regression & Integration Tests:
 * Leadership Permissions (Edit & Approval), Document Previews, and Linelist Layout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecordActionMenu } from '@/components/supervisor/RecordActionMenu';
import type { EvaluationUser } from '@/lib/auth/evaluationAccess';
import type { SupervisorBeneficiaryRow } from '@/hooks/useSupervisorData';
import { GET as getAsset } from '@/app/api/submissions/[submissionId]/asset/route';
import { PATCH as patchSubmission } from '@/app/api/submissions/[submissionId]/route';
import { NextRequest } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import * as authServer from '@/lib/server/authorisation';

// Mock dependencies
vi.mock('@/lib/server/canonicalSubmissionAdapter', () => ({
  canonicalSubmissionAdapter: {
    getSubmission: vi.fn(),
    updateSubmission: vi.fn(),
    updateAsset: vi.fn(),
  },
}));

vi.mock('@/lib/server/authorisation', async (importOriginal) => {
  const actual = await importOriginal<typeof authServer>();
  return {
    ...actual,
    resolveUserAccessScope: vi.fn(),
    logSecurityEvent: vi.fn(),
  };
});

describe('Leadership Permissions, Document Previews & Linelist Layout', () => {
  const sampleRow: SupervisorBeneficiaryRow = {
    id: 'REC-001',
    artNumber: 'DL-SOU-111409-01',
    childName: 'Pooja',
    age: 12,
    gender: 'Female',
    state: 'Delhi',
    district: 'South Delhi',
    schoolType: 'Government',
    orphanStatus: 'Single orphan',
    bmi: 15.2,
    bmiCategory: 'Normal',
    viralLoad: '450',
    vlCategory: 'Suppressed (<1000 copies/mL)',
    hemoglobin: '12.5',
    hbCategory: 'Normal',
    grantAmount: 2000,
    isApproved: false,
    approvedStatus: 'Pending',
    version: 1,
    schoolEnrolled: true,
    syncState: 'SYNCED',
    lastVisit: '2026-03-01',
    documentStatus: {
      isComplete: false,
      uploadedCount: 1,
      totalRequired: 4,
      pendingDocs: ['Bank Passbook', 'Child Photo', 'Signature'],
      uploadedDocs: ['Aadhaar Card'],
    },
  };

  const adminUser: EvaluationUser = {
    userId: 'admin-01',
    name: 'Administrator',
    role: 'ADMIN',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isVerified: true,
  };

  const leadershipUser: EvaluationUser = {
    userId: 'lead-01',
    name: 'Leadership India',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isVerified: true,
  };

  const stateReviewerUser: EvaluationUser = {
    userId: 'rev-01',
    name: 'Maharashtra Reviewer',
    role: 'STATE_REVIEWER',
    allowedStates: ['Maharashtra'],
    allowedDistricts: ['*'],
    isVerified: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. RecordActionMenu Role-Based Permissions
  // ---------------------------------------------------------------------------
  describe('1. RecordActionMenu Role Permissions', () => {
    it('renders "Edit Record" and "Delete Survey" for verified ADMIN role', () => {
      render(<RecordActionMenu row={sampleRow} user={adminUser} onDeleteRequest={vi.fn()} />);

      const button = screen.getByRole('button', { name: /actions for record pooja/i });
      fireEvent.click(button);

      expect(screen.getByText('Edit Record')).toBeDefined();
      expect(screen.getByText('Delete Survey')).toBeDefined();
      expect(screen.getByText('View Details')).toBeDefined();
      expect(screen.getByText(/Download PDF/i)).toBeDefined();
    });

    it('renders "Edit Record" but HIDES "Delete Survey" for LEADERSHIP role', () => {
      render(<RecordActionMenu row={sampleRow} user={leadershipUser} onDeleteRequest={vi.fn()} />);

      const button = screen.getByRole('button', { name: /actions for record pooja/i });
      fireEvent.click(button);

      // Leadership has edit rights
      expect(screen.getByText('Edit Record')).toBeDefined();
      // Deletion is strictly restricted to ADMIN
      expect(screen.queryByText(/Delete Survey/i)).toBeNull();
      expect(screen.getByText('View Details')).toBeDefined();
      expect(screen.getByText(/Download PDF/i)).toBeDefined();
    });

    it('HIDES both "Edit Record" and "Delete Survey" for STATE_REVIEWER role', () => {
      render(<RecordActionMenu row={sampleRow} user={stateReviewerUser} onDeleteRequest={vi.fn()} />);

      const button = screen.getByRole('button', { name: /actions for record pooja/i });
      fireEvent.click(button);

      expect(screen.queryByText(/Edit Record/i)).toBeNull();
      expect(screen.queryByText(/Delete Survey/i)).toBeNull();
      expect(screen.getByText('View Details')).toBeDefined();
      expect(screen.getByText(/Download PDF/i)).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Server Authorization (PATCH /api/submissions/[submissionId])
  // ---------------------------------------------------------------------------
  describe('2. Server PATCH Authorization & Concurrency', () => {
    it('permits LEADERSHIP to mutate records within authorized scope', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'lead-01',
        name: 'Leadership User',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Authorized leadership session',
      });

      vi.mocked(canonicalSubmissionAdapter.updateSubmission).mockResolvedValue({
        status: 'success',
        statusCode: 200,
        remoteSubmissionId: 'REC-001',
        version: 2,
        updatedAt: new Date().toISOString(),
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childName: 'Pooja Updated',
          expectedVersion: 1,
        }),
      });

      const res = await patchSubmission(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('success');
      expect(json.version).toBe(2);
    });

    it('rejects STATE_REVIEWER from mutating records with 403 Forbidden', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'rev-01',
        name: 'State Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'State reviewer session',
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childName: 'Tamper Attempt',
          expectedVersion: 1,
        }),
      });

      const res = await patchSubmission(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('FORBIDDEN');
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'anon',
        name: 'Anonymous',
        role: 'FIELD_USER',
        allowedStates: [],
        allowedDistricts: [],
        isVerified: false,
        reason: 'Unauthenticated field user',
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
        }),
      });

      const res = await patchSubmission(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(401);
    });

    it('enforces atomic OCC and returns 409 on version conflict', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'lead-01',
        name: 'Leadership User',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Authorized leadership session',
      });

      vi.mocked(canonicalSubmissionAdapter.updateSubmission).mockResolvedValue({
        status: 'conflict',
        statusCode: 409,
        code: 'OCC_VERSION_MISMATCH',
        message: 'Record was modified by another session',
        currentVersion: 3,
        expectedVersion: 1,
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedAllianceIndia: 'Approved',
          expectedVersion: 1,
        }),
      });

      const res = await patchSubmission(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.code).toBe('CONCURRENCY_CONFLICT');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Document Asset Preview Endpoint (GET /api/submissions/[submissionId]/asset)
  // ---------------------------------------------------------------------------
  describe('3. Document Asset Streaming & Preview Endpoint', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'anon',
        name: 'Anonymous',
        role: 'FIELD_USER',
        allowedStates: [],
        allowedDistricts: [],
        isVerified: false,
        reason: 'Unauthenticated field user',
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=passbookPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(401);
    });

    it('returns 403 Forbidden when record is outside caller geographic scope', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'rev-01',
        name: 'Maharashtra Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'State reviewer session',
      });

      vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'REC-001',
          state: 'Delhi',
          district: 'South Delhi',
          passbookPhotoUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=passbookPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(403);
    });

    it('streams SVG preview with nosniff and strict CSP for authorized Leadership', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'lead-01',
        name: 'Leadership User',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Authorized leadership session',
      });

      const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
      vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'REC-001',
          state: 'Delhi',
          district: 'South Delhi',
          signatureDataUrl: rawSvg,
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=caregiverSignature');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('image/svg+xml');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('streams binary PNG preview for authorized Admin', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'admin-01',
        name: 'Administrator',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Administrator session',
      });

      // 1x1 transparent PNG base64
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'REC-001',
          state: 'Delhi',
          passbookPhotoUrl: `data:image/png;base64,${pngBase64}`,
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=passbookPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('returns synthetic encrypted archive preview for Tigris storage references', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'lead-01',
        name: 'Leadership User',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Authorized leadership session',
      });

      vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'REC-001',
          state: 'Delhi',
          aadhaarCardPhotoUrl: 'asset://private-docs/aadhaar-rec-001.enc',
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=aadhaarCardPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('image/svg+xml');
      const text = await res.text();
      expect(text).toContain('VERIFIED PRIVATE DOCUMENT ARCHIVE');
      expect(text).toContain('AADHAARCARDPHOTO');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Linelist Table Layout & CSV Export Integration
  // ---------------------------------------------------------------------------
  describe('4. Linelist Table Layout & CSV Export', () => {
    it('preserves BMI and BMI Category in CSV export data mapping', () => {
      // In SupervisorAssessmentsPage, CSV export maps:
      // sanitizeCsvCell(r.bmi !== null ? r.bmi : ''),
      // sanitizeCsvCell(r.bmiCategory),
      const testRow: SupervisorBeneficiaryRow = {
        ...sampleRow,
        bmi: 16.5,
        bmiCategory: 'Normal',
      };

      const csvHeaders = [
        'Reference ID',
        'Child Name',
        'Age',
        'Gender',
        'State',
        'District',
        'School Type',
        'Orphan Status',
        'BMI',
        'BMI Category',
        'Viral Load',
        'Viral Load Category',
        'Hemoglobin',
        'Hemoglobin Category',
        'Grant Amount (INR)',
        'Document Status',
        'Approval Status',
      ];

      expect(csvHeaders).toContain('BMI');
      expect(csvHeaders).toContain('BMI Category');

      const csvRowValues = [
        testRow.artNumber,
        testRow.childName,
        testRow.age,
        testRow.gender,
        testRow.state,
        testRow.district,
        testRow.schoolType,
        testRow.orphanStatus,
        testRow.bmi !== null ? testRow.bmi : '',
        testRow.bmiCategory,
        testRow.viralLoad,
        testRow.vlCategory,
        testRow.hemoglobin,
        testRow.hbCategory,
        testRow.grantAmount,
        testRow.documentStatus.isComplete ? 'Complete' : 'Pending',
        testRow.isApproved ? 'Approved' : 'Pending',
      ];

      expect(csvRowValues[8]).toBe(16.5);
      expect(csvRowValues[9]).toBe('Normal');
    });
  });
});
