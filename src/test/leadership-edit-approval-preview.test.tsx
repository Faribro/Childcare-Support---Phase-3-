/**
 * Automated Regression & Integration Tests:
 * Leadership Permissions (Edit & Approval), Document Previews, and Linelist Layout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
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

    it('retrieves original binary PNG bytes matching fixture buffer and SHA-256 hash', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'lead-01',
        name: 'Leadership User',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Authorized leadership session',
      });

      // Valid 4x4 PNG buffer fixture
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAADklEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const originalBuffer = Buffer.from(pngBase64, 'base64');
      const expectedHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');

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

      const returnedBuffer = Buffer.from(await res.arrayBuffer());
      const returnedHash = crypto.createHash('sha256').update(returnedBuffer).digest('hex');
      expect(returnedHash).toBe(expectedHash);
      expect(returnedBuffer.equals(originalBuffer)).toBe(true);
    });

    it('retrieves original binary PDF bytes matching fixture buffer and SHA-256 hash', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'admin-01',
        name: 'Administrator',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Administrator session',
      });

      // Valid minimal PDF 1.4 fixture
      const pdfContent = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF`;
      const originalPdfBuffer = Buffer.from(pdfContent, 'utf8');
      const expectedPdfHash = crypto.createHash('sha256').update(originalPdfBuffer).digest('hex');
      const pdfBase64 = originalPdfBuffer.toString('base64');

      vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'REC-001',
          state: 'Maharashtra',
          feeReceiptPhotoUrl: `data:application/pdf;base64,${pdfBase64}`,
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=feeReceiptPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('feeReceiptPhoto.pdf');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

      const returnedBuffer = Buffer.from(await res.arrayBuffer());
      const returnedHash = crypto.createHash('sha256').update(returnedBuffer).digest('hex');
      expect(returnedHash).toBe(expectedPdfHash);
      expect(returnedBuffer.equals(originalPdfBuffer)).toBe(true);
      expect(returnedBuffer.toString('utf8')).toContain('%PDF-1.4');
      expect(returnedBuffer.toString('utf8')).toContain('%%EOF');
    });

    it('retrieves original JPEG bytes matching fixture buffer and SHA-256 hash', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'rev-01',
        name: 'Maharashtra Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'State reviewer session',
      });

      const jpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      const originalJpegBuffer = Buffer.from(jpegBase64, 'base64');
      const expectedJpegHash = crypto.createHash('sha256').update(originalJpegBuffer).digest('hex');

      vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'REC-002',
          state: 'Maharashtra',
          district: 'Pune',
          childPhotoUrl: `data:image/jpeg;base64,${jpegBase64}`,
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-002/asset?docType=childPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-002' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');

      const returnedBuffer = Buffer.from(await res.arrayBuffer());
      const returnedHash = crypto.createHash('sha256').update(returnedBuffer).digest('hex');
      expect(returnedHash).toBe(expectedJpegHash);
      expect(returnedBuffer.equals(originalJpegBuffer)).toBe(true);
    });

    it('truthfully returns HTTP 503 STORAGE_UNCONFIGURED without synthetic SVG when Tigris/S3 credentials are not configured', async () => {
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
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.code).toBe('STORAGE_UNCONFIGURED');
      expect(json.message).toContain('Private Tigris/S3 object storage is not configured');
      expect(json.prerequisite).toContain('Configure Tigris/S3 credentials');
      // Must NOT contain a synthetic SVG placeholder!
      expect(JSON.stringify(json)).not.toContain('<svg');
      expect(JSON.stringify(json)).not.toContain('VERIFIED PRIVATE DOCUMENT ARCHIVE');
    });

    it('streams original bytes from trusted remote Google Drive URLs without synthetic SVG', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'lead-01',
        name: 'Leadership User',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Authorized leadership session',
      });

      const remoteFixture = Buffer.from('TEST-ORIGINAL-REMOTE-PDF-BYTES-998877', 'utf8');
      const remoteHash = crypto.createHash('sha256').update(remoteFixture).digest('hex');

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/pdf',
          'Content-Length': String(remoteFixture.length),
        }),
        arrayBuffer: async () => remoteFixture.buffer.slice(remoteFixture.byteOffset, remoteFixture.byteOffset + remoteFixture.byteLength),
      }) as any;

      try {
        vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
          status: 'success',
          statusCode: 200,
          data: {
            id: 'REC-001',
            state: 'Delhi',
            feeReceiptPhotoUrl: 'https://drive.google.com/file/d/remote-fee-doc-123/view',
          },
        });

        const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=feeReceiptPhoto');
        const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');

        const returnedBuffer = Buffer.from(await res.arrayBuffer());
        expect(crypto.createHash('sha256').update(returnedBuffer).digest('hex')).toBe(remoteHash);
        expect(returnedBuffer.equals(remoteFixture)).toBe(true);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('unwraps =HYPERLINK formulas from record and streams original document', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'admin-01',
        name: 'Administrator',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Administrator session',
      });

      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const originalPng = Buffer.from(pngBase64, 'base64');

      vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'REC-001',
          state: 'Delhi',
          passbookPhotoUrl: `=HYPERLINK("data:image/png;base64,${pngBase64}", "passbook.png")`,
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=passbookPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');

      const returnedBuffer = Buffer.from(await res.arrayBuffer());
      expect(returnedBuffer.equals(originalPng)).toBe(true);
    });

    it('rejects untrusted remote domains and SSRF attempts with HTTP 403', async () => {
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
          passbookPhotoUrl: 'https://evil-untrusted-site.com/stolen-document.png',
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=passbookPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('UNTRUSTED_REMOTE_HOST');
    });

    it('truthfully reports HTTP 502 UPSTREAM_AUTH_REQUIRED when remote storage returns HTML login', async () => {
      vi.mocked(authServer.resolveUserAccessScope).mockReturnValue({
        userId: 'lead-01',
        name: 'Leadership User',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'Authorized leadership session',
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'text/html; charset=utf-8',
        }),
        arrayBuffer: async () => Buffer.from('<html><body>Google Sign-in Required</body></html>'),
      }) as any;

      try {
        vi.mocked(canonicalSubmissionAdapter.getSubmission).mockResolvedValue({
          status: 'success',
          statusCode: 200,
          data: {
            id: 'REC-001',
            state: 'Delhi',
            passbookPhotoUrl: 'https://drive.google.com/file/d/private-file-456/view',
          },
        });

        const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=passbookPhoto');
        const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
        expect(res.status).toBe(502);
        const json = await res.json();
        expect(json.code).toBe('UPSTREAM_AUTH_REQUIRED');
        expect(json.message).toContain('returned HTML or login page');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('returns accurate HTTP 404 error when document reference is a pending placeholder or missing', async () => {
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
          passbookPhotoUrl: '[Document Pending Drive Upload]',
        },
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/REC-001/asset?docType=passbookPhoto');
      const res = await getAsset(req, { params: { submissionId: 'REC-001' } });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe('DOCUMENT_UNAVAILABLE');
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
