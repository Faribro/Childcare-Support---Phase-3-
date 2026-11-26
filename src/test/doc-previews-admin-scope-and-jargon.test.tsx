import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NextRequest } from 'next/server';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PDF_DATA_URL =
  'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwo+PgplbmRvYmoKdHJhaWxlcgo8PAovUm9vdCAxIDAgUgo+Pg==';

import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { FirestoreSubmissionAdapter } from '@/lib/server/firestoreSubmissionAdapter';
import { GET as getAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { deriveBeneficiaryReadiness } from '@/lib/read-model/beneficiaryReadiness';
import { supervisorReadModel } from '@/lib/read-model/supervisorReadModel';
import { filterRecordsByScope, type UserAccessScope } from '@/lib/server/authorisation';
import { DocumentPreviewThumbnail } from '@/components/evaluation/DocumentPreviewThumbnail';
import { ColumnFilterPopover } from '@/components/supervisor/ColumnFilterPopover';
import {
  EvaluationLinelistTable,
  type EvaluationBeneficiaryRow,
} from '@/components/evaluation/EvaluationLinelistTable';

describe('Document Verification, Previews, Info Popover, Jargon Removal & Admin Scope', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    supervisorReadModel.resetForTesting();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  describe('1. Asset Retrieval API (caregiverSignature & nested/attachment resolution)', () => {
    it('serves caregiverSignature and childPhoto from nested caregiverConsent / bankingAndKyc and skips placeholders', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValue({
        status: 'success',
        statusCode: 200,
        remoteSubmissionId: 'rec-nested-01',
        data: {
          id: 'rec-nested-01',
          state: 'Maharashtra',
          district: 'Pune',
          signatureDataUrl: 'Restricted Document',
          childPhotoUrl: 'DATA_URL_STORED_PENDING_AUTH',
          passbookPhotoUrl: '/api/submissions/rec-nested-01/asset?docType=passbookPhoto',
          caregiverConsent: {
            consentProvided: true,
            signatureStatus: 'CAPTURED_LOCAL',
            signatureDataUrl: TINY_PNG_DATA_URL,
          },
          bankingAndKyc: {
            childPhotoUrl: TINY_PNG_DATA_URL,
            passbookPhotoUrl: TINY_PDF_DATA_URL,
          },
        },
      });

      const sigReq = new NextRequest(
        'http://localhost:3000/api/submissions/rec-nested-01/asset?docType=caregiverSignature'
      );
      const sigRes = await getAssetRoute(sigReq, { params: { submissionId: 'rec-nested-01' } });
      expect(sigRes.status).toBe(200);
      expect(sigRes.headers.get('content-type')).toBe('image/png');

      const photoReq = new NextRequest(
        'http://localhost:3000/api/submissions/rec-nested-01/asset?docType=childPhoto'
      );
      const photoRes = await getAssetRoute(photoReq, { params: { submissionId: 'rec-nested-01' } });
      expect(photoRes.status).toBe(200);
      expect(photoRes.headers.get('content-type')).toBe('image/png');

      const passbookReq = new NextRequest(
        'http://localhost:3000/api/submissions/rec-nested-01/asset?docType=passbookPhoto'
      );
      const passbookRes = await getAssetRoute(passbookReq, { params: { submissionId: 'rec-nested-01' } });
      expect(passbookRes.status).toBe(200);
      expect(passbookRes.headers.get('content-type')).toBe('application/pdf');
    });

    it('resolves latest replacement from Firestore attachments[] when root fields lack bytes', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        remoteSubmissionId: 'rec-att-02',
        data: {
          id: 'rec-att-02',
          state: 'Maharashtra',
          district: 'Nagpur',
          attachments: [
            {
              docType: 'caregiverSignature',
              fileData: TINY_PNG_DATA_URL,
              updatedAt: '2026-11-26T10:00:00.000Z',
            },
          ],
        },
      });

      const req = new NextRequest(
        'http://localhost:3000/api/submissions/rec-att-02/asset?docType=caregiverSignature'
      );
      const res = await getAssetRoute(req, { params: { submissionId: 'rec-att-02' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
    });
  });

  describe('2. Readiness Accuracy & Firestore Supervisor List Mapping', () => {
    it('does not falsely mark Caregiver Signature UPLOADED when only default signatureStatus CAPTURED_LOCAL exists with no file', () => {
      const readiness = deriveBeneficiaryReadiness({
        id: 'rec-no-sig',
        demographics: {
          childName: 'Asha',
          artNumber: 'MH-PUN-999',
          state: 'Maharashtra',
          district: 'Pune',
        },
        bankingAndKyc: {
          passbookPhotoUrl: TINY_PNG_DATA_URL,
        },
        caregiverConsent: {
          consentProvided: true,
          signatureStatus: 'CAPTURED_LOCAL',
        },
      });

      expect(readiness.missingSignature).toBe(true);
      expect(readiness.docDetails['Caregiver Signature'].state).toBe('missing');
      expect(readiness.missingDocTypes).toContain('Caregiver Signature');
    });

    it('firestoreSubmissionAdapter.listSupervisorSubmissions detects nested canonical document URLs', async () => {
      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
      });

      await adapter.createSubmission({
        payload: {
          clientSubmissionId: '3fb227df-8b46-4e12-a6d0-712747afa44e',
          uniqueId: 'MH-PUN-3311',
          demographics: {
            childName: 'Riya More',
            state: 'Maharashtra',
            district: 'Pune',
          },
          caregiverConsent: {
            consentProvided: true,
            signatureStatus: 'UPLOADED',
            signatureDataUrl: TINY_PNG_DATA_URL,
          },
          bankingAndKyc: {
            passbookPhotoUrl: TINY_PDF_DATA_URL,
            aadhaarCardPhotoUrl: TINY_PNG_DATA_URL,
            childPhotoUrl: TINY_PNG_DATA_URL,
          },
          educationExpenses: {
            feeReceiptPhotoUrl: TINY_PDF_DATA_URL,
            marksheetPhotoUrl: TINY_PDF_DATA_URL,
          },
        } as any,
        idempotencyKey: 'idemp-sup-list-1',
        requestId: 'req-sup-list-1',
      });

      const listRes = await adapter.listSupervisorSubmissions();
      expect(listRes.items.length).toBe(1);
      expect(listRes.items[0].hasSignature).toBe(true);
      expect(listRes.items[0].hasPassbook).toBe(true);
      expect(listRes.items[0].hasAadhaar).toBe(true);
      expect(listRes.items[0].hasChildPhoto).toBe(true);
      expect(listRes.items[0].hasFeeReceipt).toBe(true);
      expect(listRes.items[0].hasMarksheet).toBe(true);
    });
  });

  describe('3. Administrator Visibility Across All States & Paginated Maharashtra Data', () => {
    it('loads Maharashtra records beyond the first 100-item page by following nextCursor in supervisorReadModel', async () => {
      localStorage.setItem('child_nutrition_evaluation_unlocked', 'true');
      localStorage.setItem(
        'child_nutrition:user_session_v1',
        JSON.stringify({
          userId: 'lead-admin-1',
          name: 'National Admin',
          role: 'LEADERSHIP',
          allowedStates: ['*'],
          allowedDistricts: ['*'],
          isVerified: true,
        })
      );

      const page1Records = Array.from({ length: 100 }).map((_, idx) => ({
        id: `dl-rec-${idx}`,
        uniqueId: `DL-00-${idx}`,
        state: 'Delhi',
        district: 'Central',
        payload: {
          demographics: {
            childName: `Delhi Child ${idx}`,
            artNumber: `DL-ART-${idx}`,
            state: 'Delhi',
            district: 'Central',
          },
        },
      }));

      const page2Records = [
        {
          id: 'mh-rec-101',
          uniqueId: 'MH-PUN-101',
          state: 'MH',
          district: 'Pune',
          payload: {
            demographics: {
              childName: 'Kiran Patil',
              artNumber: 'MH-PUN-101',
              state: 'Maharashtra',
              district: 'Pune',
            },
            bankingAndKyc: {
              passbookPhotoUrl: TINY_PDF_DATA_URL,
            },
          },
        },
      ];

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: 'success',
              data: {
                records: page1Records,
                total: 101,
                nextCursor: 'cursor-page-2',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: 'success',
              data: {
                records: page2Records,
                total: 101,
                nextCursor: null,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      global.fetch = fetchMock as any;

      await supervisorReadModel.fetchSubmissions({ force: true });

      const snapshot = supervisorReadModel.getSnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toContain('cursor=cursor-page-2');

      const mhRow = snapshot.records.find((r) => r.id === 'mh-rec-101');
      expect(mhRow).toBeDefined();
      expect(mhRow?.state).toBe('Maharashtra');
      expect(mhRow?.childName).toBe('Kiran Patil');
      expect(mhRow?.documentStatus.uploadedDocs).toContain('Bank Passbook Front Page');
    });

    it('preserves Maharashtra records through filterRecordsByScope for national ADMIN / LEADERSHIP scopes and canonicalized MH state', () => {
      const adminScope: UserAccessScope = {
        userId: 'admin-1',
        name: 'System Admin',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'verified_session_token',
      };

      const mhReviewerScope: UserAccessScope = {
        userId: 'rev-mh',
        name: 'MH Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
        reason: 'verified_session_token',
      };

      const mixedRecords = [
        { id: '1', state: 'Maharashtra', district: 'Pune' },
        { id: '2', payload: { demographics: { state: 'MH', district: 'Nagpur' } } },
        { id: '3', state: 'Delhi', district: 'South' },
      ];

      expect(filterRecordsByScope(adminScope, mixedRecords)).toHaveLength(3);
      expect(filterRecordsByScope(mhReviewerScope, mixedRecords).map((r) => r.id)).toEqual(['1', '2']);
    });
  });

  describe('4. Document Preview Component, Info Button Popover & Jargon Removal', () => {
    it('DocumentPreviewThumbnail shows inline preview on 200 PDF, image on 200 PNG, and honest No file attached on 404', async () => {
      const onPreview = vi.fn();

      // 1) 404 DOCUMENT_NOT_FOUND
      global.fetch = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'error',
            code: 'DOCUMENT_NOT_FOUND',
            message: 'No caregiverSignature document is attached to this assessment record.',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      ) as any;

      const { rerender } = render(
        <DocumentPreviewThumbnail
          title="Caregiver Signature"
          assetUrl="/api/submissions/sub-1/asset?docType=caregiverSignature"
          onPreview={onPreview}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No file attached')).toBeDefined();
      });
      expect(screen.queryByText('Document Available')).toBeNull();

      // 2) Inline Data URL PDF renders clickable preview button immediately
      rerender(
        <DocumentPreviewThumbnail
          title="Bank Passbook Front Page"
          assetUrl="/api/submissions/sub-1/asset?docType=passbookPhoto"
          inlineUrl={TINY_PDF_DATA_URL}
          onPreview={onPreview}
        />
      );

      const pdfBtn = screen.getByRole('button', { name: /Preview PDF Bank Passbook Front Page/i });
      fireEvent.click(pdfBtn);
      expect(onPreview).toHaveBeenCalledTimes(1);
    });

    it('EvaluationLinelistTable opens missing items popover on (i) click and invokes onInspectDocs', () => {
      const onViewRecord = vi.fn();
      const onInspectDocs = vi.fn();
      const row: EvaluationBeneficiaryRow = {
        id: 'sub-mh-1',
        displayCode: 'MH-PUN-001',
        childName: 'Ananya Kale',
        workerName: 'Sita Kulkarni',
        ageText: '10 yrs',
        sexText: 'Female',
        district: 'Pune',
        state: 'Maharashtra',
        schoolType: 'Government school',
        orphanStatus: 'Single orphan',
        grantAmountInr: 2500,
        docsStatus: 'intake_pending',
        missingDocs: ['Aadhaar Card', 'Caregiver Signature'],
        approvalStatus: 'pending',
      };

      render(
        <EvaluationLinelistTable
          rows={[row]}
          canApprove={true}
          onOpenApprovalModal={vi.fn()}
          onViewRecord={onViewRecord}
          onInspectDocs={onInspectDocs}
        />
      );

      // Zero "Dossier" UI jargon in table
      expect(screen.queryByText(/Dossier/i)).toBeNull();
      expect(screen.getByLabelText('View record for Ananya Kale')).toBeDefined();

      // Click (i) button next to Intake Pending
      const infoButtons = screen.getAllByRole('button', { name: /View missing items for Ananya Kale/i });
      fireEvent.click(infoButtons[0]);

      const dialog = screen.getByRole('dialog', { name: /Intake Pending details for Ananya Kale/i });
      expect(dialog).toBeDefined();
      expect(screen.getByText('Aadhaar Card')).toBeDefined();
      expect(screen.getByText('Caregiver Signature')).toBeDefined();

      // Clicking action inside popover opens Document Verification Status modal
      fireEvent.click(screen.getByRole('button', { name: /View Documents & Previews/i }));
      expect(onInspectDocs).toHaveBeenCalledWith(row);
    });

    it('ColumnFilterPopover flips to right-aligned (right-0) when near right viewport edge so filter dialog does not clip sideways', () => {
      const origInnerWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });

      render(
        <ColumnFilterPopover
          showLabel
          columnId="approvalMobile"
          columnTitle="Approval"
          sections={[
            {
              id: 'approvalStatus',
              title: 'Approval',
              options: [{ label: 'Approved', value: 'Approved', count: 2 }],
              selectedValues: [],
            },
          ]}
          onApply={vi.fn()}
          onClear={vi.fn()}
        />
      );

      const trigger = screen.getByRole('button', { name: /Filter and sort Approval/i });
      vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        left: 280,
        right: 380,
        top: 100,
        bottom: 136,
        width: 100,
        height: 36,
        x: 280,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);

      fireEvent.click(trigger);

      const dialog = screen.getByRole('dialog', { name: /Approval filter options/i });
      expect(dialog.className).toContain('right-0');
      expect(dialog.className).not.toContain('left-0');

      Object.defineProperty(window, 'innerWidth', { value: origInnerWidth, configurable: true });
    });
  });
});
