import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { generateBeneficiaryPdfBuffer } from '@/lib/server/pdfExportService';
import { GET as getExportRoute } from '@/app/api/submissions/[submissionId]/export/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { createSessionToken } from '@/lib/server/sessionService';

describe('Supervisor Features Suite: Issues #53, #54, #55, #56', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  describe('Issue #56: Zero-Dependency Standards-Compliant PDF Export Service', () => {
    const mockRecord = {
      id: 'MH-PUN-081200-01',
      demographics: {
        childName: 'Aarav Sharma',
        artNumber: 'ART-9921',
        calculatedAgeYears: 11,
        gender: 'Male',
        state: 'Maharashtra',
        district: 'Pune',
        orphanStatus: 'Double orphan',
        caregiverName: 'Sunita Sharma',
      },
      clinical: {
        bmi: 16.2,
        bmiCategory: 'Normal',
        viralLoadCopies: 20,
        vlCategory: 'Suppressed (< 50 copies/mL)',
        hemoglobinLevel: 12.4,
        hbCategory: 'Normal (> 11 g/dL)',
      },
      education: {
        schoolType: 'Government School',
        currentClass: 'Class 6',
      },
      grantCalculation: {
        totalGrantAmount: 18000,
      },
      finalReview: {
        approvedAllianceIndia: true,
      },
    };

    it('generates a valid binary PDF buffer starting with %PDF-1.4 and ending with %%EOF', () => {
      const pdfBuffer = generateBeneficiaryPdfBuffer(mockRecord);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(500);

      const pdfText = pdfBuffer.toString('utf-8');
      expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfText.trim().endsWith('%%EOF')).toBe(true);
    });

    it('embeds confidential internal notice into PDF text without unsupported statutory claims', () => {
      const pdfBuffer = generateBeneficiaryPdfBuffer(mockRecord);
      const pdfText = pdfBuffer.toString('utf-8');

      expect(pdfText).toContain('INDIA HIV/AIDS ALLIANCE');
      expect(pdfText).toContain('Aarav Sharma');
      expect(pdfText).toContain('ART-9921');
      expect(pdfText).toContain('Maharashtra');
      expect(pdfText).toContain('Pune');
      expect(pdfText).toContain('Double orphan');
      expect(pdfText).toContain('Confidential - contains personal and programme information.');
      expect(pdfText).toContain('For authorized internal use only. Do not forward or distribute.');
      expect(pdfText).not.toContain('DPDP');
      expect(pdfText).toContain('18000');
    });

    it('properly escapes special characters in strings to avoid PDF syntax corruption', () => {
      const recordWithSpecialChars = {
        ...mockRecord,
        demographics: {
          ...mockRecord.demographics,
          childName: 'Pooja (Special \\ Child)',
        },
      };
      const pdfBuffer = generateBeneficiaryPdfBuffer(recordWithSpecialChars);
      const pdfText = pdfBuffer.toString('utf-8');
      expect(pdfText).toContain('Pooja \\(Special \\\\ Child\\)');
    });
  });

  describe('Issue #56 & #57: Authorized PDF Export API Route Endpoint', () => {
    it('returns 404 if the requested submission does not exist', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Record not found',
        statusCode: 404,
      });

      const token = createSessionToken({
        userId: 'admin-01',
        name: 'Administrator',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/NONEXISTENT/export', {
        headers: {
          Cookie: `evaluation_session_token=${token}`,
        },
      });

      const res = await getExportRoute(req, { params: { submissionId: 'NONEXISTENT' } });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe('NOT_FOUND');
    });

    it('rejects STATE_REVIEWER trying to export a record outside their assigned state with 403 FORBIDDEN_SCOPE', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'WB-KOL-081200-99',
          demographics: {
            state: 'West Bengal',
            district: 'Kolkata',
            childName: 'Priya Roy',
          },
        },
        version: 1,
      });

      // Maharashtra reviewer attempting to export West Bengal record
      const mhToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'MH Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-99/export', {
        headers: {
          Cookie: `evaluation_session_token=${mhToken}`,
        },
      });

      const res = await getExportRoute(req, { params: { submissionId: 'WB-KOL-081200-99' } });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('FORBIDDEN_SCOPE');
    });

    it('allows authorized reviewer within assigned state to export PDF with proper application/pdf content type and attachment header', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'MH-PUN-081200-01',
          demographics: {
            state: 'Maharashtra',
            district: 'Pune',
            childName: 'Sanjay Deshmukh',
          },
        },
        version: 1,
      });

      const mhToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'MH Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-01/export', {
        headers: {
          Cookie: `evaluation_session_token=${mhToken}`,
        },
      });

      const res = await getExportRoute(req, { params: { submissionId: 'MH-PUN-081200-01' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="Alliance_Record_MH-PUN-081200-01.pdf"');

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.toString('utf-8').startsWith('%PDF-1.4')).toBe(true);
    });

    it('allows ADMIN to export records across any state', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'getSubmission').mockResolvedValueOnce({
        status: 'success',
        statusCode: 200,
        data: {
          id: 'WB-KOL-081200-99',
          demographics: {
            state: 'West Bengal',
            district: 'Kolkata',
            childName: 'Priya Roy',
          },
        },
        version: 1,
      });

      const adminToken = createSessionToken({
        userId: 'admin-01',
        name: 'Administrator',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-99/export', {
        headers: {
          Cookie: `evaluation_session_token=${adminToken}`,
        },
      });

      const res = await getExportRoute(req, { params: { submissionId: 'WB-KOL-081200-99' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });
  });

  describe('Issue #54: CaseStatusSummaryDashboard Component', () => {
    const sampleRows = [
      {
        id: 'ROW-1',
        artNumber: 'ART-01',
        childName: 'Child Complete',
        age: 10,
        gender: 'Male',
        district: 'Pune',
        state: 'Maharashtra',
        schoolType: 'Government school',
        schoolEnrolled: true,
        orphanStatus: 'Double orphan',
        bmi: 16.5,
        bmiCategory: 'Normal' as const,
        viralLoad: '< 20',
        vlCategory: 'Suppressed (<1000 copies/mL)' as const,
        hemoglobin: '12.0',
        hbCategory: 'Normal' as const,
        grantAmount: 15000,
        syncState: 'SYNCED' as const,
        lastVisit: '2026-09-10',
        version: 1,
        documentStatus: {
          isComplete: true,
          totalRequired: 4,
          uploadedCount: 4,
          pendingDocs: [],
          uploadedDocs: ['Aadhaar Card', 'Bank Passbook Front Page'],
        },
        isApproved: true,
        approvedStatus: 'Approved',
      },
      {
        id: 'ROW-2',
        artNumber: 'ART-02',
        childName: 'Child Incomplete',
        age: 12,
        gender: 'Female',
        district: 'Mumbai Suburban',
        state: 'Maharashtra',
        schoolType: 'Government school',
        schoolEnrolled: false,
        orphanStatus: 'Single parent deceased',
        bmi: 13.0,
        bmiCategory: 'Severe Underweight' as const,
        viralLoad: '15000',
        vlCategory: 'Unsuppressed (≥1000 copies/mL)' as const,
        hemoglobin: '7.5',
        hbCategory: 'Severe Anemia' as const,
        grantAmount: 12000,
        syncState: 'SYNCED' as const,
        lastVisit: '2026-09-12',
        version: 1,
        documentStatus: {
          isComplete: false,
          totalRequired: 4,
          uploadedCount: 2,
          pendingDocs: ['Aadhaar Card', 'Bank Passbook Front Page'],
          uploadedDocs: ['Passport Size Photo'],
        },
        isApproved: false,
        approvedStatus: 'Pending',
      },
    ];

    it('returns null when records array is empty', async () => {
      const { CaseStatusSummaryDashboard } = await import('@/components/supervisor/CaseStatusSummaryDashboard');
      const { render } = await import('@testing-library/react');
      const { container } = render(<CaseStatusSummaryDashboard records={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders accurate completeness, orphan, and bottleneck metrics', async () => {
      const { CaseStatusSummaryDashboard } = await import('@/components/supervisor/CaseStatusSummaryDashboard');
      const { render, screen } = await import('@testing-library/react');
      render(<CaseStatusSummaryDashboard records={sampleRows} />);

      // Completeness rate: 1 of 2 = 50%
      expect(screen.getAllByText(/50%/).length).toBeGreaterThan(0);
      expect(screen.getByText(/1 \/ 2 Complete/)).toBeDefined();

      // Missing document breakdown chips
      expect(screen.getByText(/Aadhaar Card:/)).toBeDefined();
      expect(screen.getByText(/Bank Passbook:/)).toBeDefined();

      // Vulnerability counts
      expect(screen.getByText(/Double/)).toBeDefined();
      expect(screen.getByText(/Single Orphan Cases/)).toBeDefined();
    });
  });

  describe('Issue #53: StateDistrictFilterBar Component', () => {
    it('renders state selector and triggers onStateChange and cascades reset', async () => {
      const { StateDistrictFilterBar } = await import('@/components/supervisor/StateDistrictFilterBar');
      const { render, screen, fireEvent } = await import('@testing-library/react');

      const onStateChange = vi.fn();
      const onDistrictChange = vi.fn();

      render(
        <StateDistrictFilterBar
          selectedState="ALL"
          selectedDistrict="ALL"
          onStateChange={onStateChange}
          onDistrictChange={onDistrictChange}
        />
      );

      const stateSelect = screen.getByLabelText(/Filter by State/i);
      expect(stateSelect).toBeDefined();

      fireEvent.change(stateSelect, { target: { value: 'Maharashtra' } });
      expect(onStateChange).toHaveBeenCalledWith('Maharashtra');
      expect(onDistrictChange).toHaveBeenCalledWith('ALL');
    });

    it('renders cascading district options when state is selected', async () => {
      const { StateDistrictFilterBar } = await import('@/components/supervisor/StateDistrictFilterBar');
      const { render, screen } = await import('@testing-library/react');

      render(
        <StateDistrictFilterBar
          selectedState="Maharashtra"
          selectedDistrict="Pune"
          onStateChange={vi.fn()}
          onDistrictChange={vi.fn()}
        />
      );

      const districtSelect = screen.getByLabelText(/Filter by District/i);
      expect(districtSelect).toBeDefined();

      // District options should contain Pune, Mumbai Suburban, Thane
      const options = (districtSelect as HTMLSelectElement).options;
      const optionValues = Array.from(options).map((o) => o.value);
      expect(optionValues).toContain('Pune');
      expect(optionValues).toContain('Mumbai Suburban');
      expect(optionValues).toContain('Thane');
    });
  });

  describe('Issue #55: Accessible RecordActionMenu Component', () => {
    const sampleRow = {
      id: 'MH-PUN-081200-01',
      artNumber: 'ART-01',
      childName: 'Aarav Sharma',
      age: 10,
      gender: 'Male',
      district: 'Pune',
      state: 'Maharashtra',
      schoolType: 'Government school',
      schoolEnrolled: true,
      orphanStatus: 'Double orphan',
      bmi: 16.5,
      bmiCategory: 'Normal' as const,
      viralLoad: '< 20',
      vlCategory: 'Suppressed (<1000 copies/mL)' as const,
      hemoglobin: '12.0',
      hbCategory: 'Normal' as const,
      grantAmount: 15000,
      syncState: 'SYNCED' as const,
      lastVisit: '2026-09-10',
      version: 1,
      documentStatus: {
        isComplete: true,
        totalRequired: 4,
        uploadedCount: 4,
        pendingDocs: [],
        uploadedDocs: ['Aadhaar Card', 'Bank Passbook Front Page'],
      },
      isApproved: true,
      approvedStatus: 'Approved',
    };

    it('opens accessible popup menu and dispatches onDeleteRequest when clicked', async () => {
      const { RecordActionMenu } = await import('@/components/supervisor/RecordActionMenu');
      const { render, screen, fireEvent } = await import('@testing-library/react');

      const onDeleteRequest = vi.fn();
      render(<RecordActionMenu row={sampleRow} onDeleteRequest={onDeleteRequest} />);

      const triggerBtn = screen.getByLabelText(/Actions for record Aarav Sharma/i);
      expect(triggerBtn).toBeDefined();

      // Menu initially closed
      expect(screen.queryByRole('menu')).toBeNull();

      // Click trigger to open menu
      fireEvent.click(triggerBtn);
      expect(screen.getByRole('menu')).toBeDefined();
      expect(screen.getByText('View Details')).toBeDefined();
      expect(screen.getByText('Edit Survey')).toBeDefined();
      expect(screen.getByText('Download PDF Dossier')).toBeDefined();

      const deleteItem = screen.getByText('Delete Survey');
      expect(deleteItem).toBeDefined();

      fireEvent.click(deleteItem);
      expect(onDeleteRequest).toHaveBeenCalledWith(sampleRow);
    });
  });
});
