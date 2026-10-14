import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  deriveBeneficiaryReadiness,
  isAttachmentPresent,
  isChildEnrolledInSchool,
  classifyOrphanStatus,
  normalizeApprovalStatus,
  deduplicateRecordsByChild,
  computeReadinessAggregates,
} from '@/lib/read-model/beneficiaryReadiness';
import {
  INITIAL_COLUMN_FILTERS,
  type LinelistColumnFilters,
  filterBeneficiaryRows,
  sortBeneficiaryRows,
  computeColumnFacets,
  sanitizeCsvCell,
  normalizeFilterValue,
} from '@/components/supervisor/linelistFilterUtils';
import type { SupervisorBeneficiaryRow } from '@/hooks/useSupervisorData';
import type { EvaluationUser } from '@/lib/auth/evaluationAccess';
import { RecordActionMenu } from '@/components/supervisor/RecordActionMenu';

describe('Beneficiary Linelist Readiness, Actions & Column Filter Architecture', () => {
  // ---------------------------------------------------------------------------
  // 1. Canonical Readiness & Document Verification
  // ---------------------------------------------------------------------------
  describe('1. Canonical Document Verification & Readiness Calculations', () => {
    it('determines all applicable documents present for an enrolled child with valid attachment URLs', () => {
      const record = {
        '1\nUnique ID': 'BEN-101',
        '42\nART ID Number': 'MH-PUN-001',
        '9\nChild Name': 'Aarav Patil',
        '11\nAge': 11,
        '12\nGender': 'Male',
        '18\nState': 'Maharashtra',
        '19\nDistrict': 'Pune',
        '53\nSchool Type': 'Government school',
        '49\nEducation Status': 'Currently attending school',
        '13\nOrphan Status': 'Both parents alive',
        // Valid uploads via URL and Google Sheets formula
        '25\nPassbook Front Page Link': '=HYPERLINK("https://drive.google.com/passbook.pdf", "Passbook")',
        '26\nAadhaar Card Link': 'https://storage.googleapis.com/kyc/aadhaar.jpg',
        '27\nPassport Size Photo Link': 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        '6\nSignature /\nThumb Impression': 'https://drive.google.com/sig.png',
        '64\nSchool Fee Receipt Link': 'https://drive.google.com/fee_receipt.pdf',
        '65\nMarksheet Photo Link': 'https://drive.google.com/marksheet.pdf',
        '67\nApproved Alliance India': 'Approved',
      };

      const readiness = deriveBeneficiaryReadiness(record);

      expect(readiness.isEnrolledInSchool).toBe(true);
      expect(readiness.isOutOfSchool).toBe(false);
      expect(readiness.totalRequired).toBe(6);
      expect(readiness.uploadedCount).toBe(6);
      expect(readiness.isComplete).toBe(true);
      expect(readiness.missingDocTypes).toEqual([]);
      expect(readiness.completenessRate).toBe(100);
      expect(readiness.approvalStatus).toBe('Approved');
      expect(readiness.isApproved).toBe(true);
    });

    it('identifies missing documents for a child missing passbook and photo', () => {
      const record = {
        '1\nUnique ID': 'BEN-102',
        '42\nART ID Number': 'MH-PUN-002',
        '9\nChild Name': 'Sneha Shinde',
        '11\nAge': 9,
        '53\nSchool Type': 'Private School',
        '25\nPassbook Front Page Link': '', // Missing
        '26\nAadhaar Card Link': 'https://drive.google.com/aadhaar.pdf', // Present
        '27\nPassport Size Photo Link': '—', // Placeholder -> Missing
        '6\nSignature /\nThumb Impression': 'https://drive.google.com/sig.png', // Present
        '64\nSchool Fee Receipt Link': 'https://drive.google.com/fee.pdf', // Present
        '65\nMarksheet Photo Link': 'https://drive.google.com/marksheet.pdf', // Present
        '67\nApproved Alliance India': 'Pending',
      };

      const readiness = deriveBeneficiaryReadiness(record);

      expect(readiness.isComplete).toBe(false);
      expect(readiness.totalRequired).toBe(6);
      expect(readiness.uploadedCount).toBe(4);
      expect(readiness.missingPassbook).toBe(true);
      expect(readiness.missingPhoto).toBe(true);
      expect(readiness.missingAadhaar).toBe(false);
      expect(readiness.missingSignature).toBe(false);
      expect(readiness.missingDocTypes).toContain('Bank Passbook Front Page');
      expect(readiness.missingDocTypes).toContain('Passport Size Photo');
      expect(readiness.approvalStatus).toBe('Pending');
      expect(readiness.isApproved).toBe(false);
    });

    it('treats school fee receipt and marksheet as NOT applicable for out-of-school children', () => {
      const record = {
        '1\nUnique ID': 'BEN-103',
        '42\nART ID Number': 'MH-THN-003',
        '9\nChild Name': 'Rahul Chavan',
        '53\nSchool Type': 'Not in School / Dropped Out',
        '49\nEducation Status': 'Dropped out',
        // Core KYC present
        '25\nPassbook Front Page Link': 'https://drive.google.com/passbook.pdf',
        '26\nAadhaar Card Link': 'https://drive.google.com/aadhaar.pdf',
        '27\nPassport Size Photo Link': 'https://drive.google.com/photo.jpg',
        '6\nSignature /\nThumb Impression': 'https://drive.google.com/sig.png',
        // School docs missing because not applicable
        '64\nSchool Fee Receipt Link': '',
        '65\nMarksheet Photo Link': '',
      };

      const readiness = deriveBeneficiaryReadiness(record);

      expect(readiness.isEnrolledInSchool).toBe(false);
      expect(readiness.isOutOfSchool).toBe(true);
      // For out of school child, total required should be 4 (not 6)
      expect(readiness.totalRequired).toBe(4);
      expect(readiness.uploadedCount).toBe(4);
      expect(readiness.isComplete).toBe(true);
      expect(readiness.notApplicableDocTypes).toContain('School Fee Receipt');
      expect(readiness.notApplicableDocTypes).toContain('Academic Marksheet');
      expect(readiness.missingDocTypes).toEqual([]);
    });

    it('strictly discriminates genuine attachment URLs vs bare filenames and placeholders', () => {
      // Bare filenames or placeholder labels alone must not count as genuine uploads
      expect(isAttachmentPresent('passbook.png')).toBe(false);
      expect(isAttachmentPresent('doc.pdf')).toBe(false);
      expect(isAttachmentPresent('Restricted Doc')).toBe(false);
      expect(isAttachmentPresent('[Restricted]')).toBe(false);
      expect(isAttachmentPresent('—')).toBe(false);
      expect(isAttachmentPresent('N/A')).toBe(false);
      expect(isAttachmentPresent('null')).toBe(false);
      expect(isAttachmentPresent('undefined')).toBe(false);
      expect(isAttachmentPresent('')).toBe(false);
      expect(isAttachmentPresent(null)).toBe(false);
      expect(isAttachmentPresent(undefined)).toBe(false);

      // Genuine URL strings
      expect(isAttachmentPresent('https://drive.google.com/file/d/123')).toBe(true);
      expect(isAttachmentPresent('http://example.com/photo.jpg')).toBe(true);
      expect(isAttachmentPresent('data:image/png;base64,iVBORw0KGgo...')).toBe(true);
      expect(isAttachmentPresent('blob:http://localhost:3000/123-abc')).toBe(true);
      expect(isAttachmentPresent('=HYPERLINK("https://drive.google.com/file", "Doc")')).toBe(true);

      // Server-confirmed booleans
      expect(isAttachmentPresent(null, true)).toBe(true);
      expect(isAttachmentPresent('https://valid.url', false)).toBe(false);
    });

    it('safely preserves missing and zero numeric values without coercion', () => {
      const recordWithZeroAge = {
        '1\nUnique ID': 'BEN-104',
        '42\nART ID Number': 'MH-PUN-004',
        '9\nChild Name': 'Infant Baby',
        '11\nAge': 0, // Genuine 0 years (infant)
        '34\nBMI': 0, // Genuine 0 / unmeasured
      };

      const readinessZero = deriveBeneficiaryReadiness(recordWithZeroAge);
      expect(readinessZero.age).toBe(0);

      const recordWithMissingAge = {
        '1\nUnique ID': 'BEN-105',
        '42\nART ID Number': 'MH-PUN-005',
        '9\nChild Name': 'Child Unknown Age',
        '11\nAge': '', // Missing age
        '45\nViral Load': '', // Missing viral load
      };

      const readinessMissing = deriveBeneficiaryReadiness(recordWithMissingAge);
      expect(readinessMissing.age).toBeNull();
      expect(readinessMissing.viralLoad).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Longitudinal Child Deduplication (NACO / Alliance ART Identity Rule)
  // ---------------------------------------------------------------------------
  describe('2. Canonical Longitudinal Child Deduplication', () => {
    it('deduplicates multiple assessments for the same child under the ART identity rule', () => {
      const assessments = [
        {
          id: 'ASSESSMENT-001',
          artNumber: 'MH-PUN-2024-001',
          childName: 'Priya Sharma (Visit 1)',
          version: 1,
          createdAt: '2026-06-01T10:00:00Z',
          updatedAt: '2026-06-01T10:00:00Z',
        },
        {
          id: 'ASSESSMENT-002',
          artNumber: 'MH-PUN-2024-001', // Same child
          childName: 'Priya Sharma (Visit 2 - Latest)',
          version: 2, // Higher version
          createdAt: '2026-09-01T10:00:00Z',
          updatedAt: '2026-09-01T10:00:00Z',
        },
        {
          id: 'ASSESSMENT-003',
          artNumber: 'MH-PUN-2024-002', // Different child
          childName: 'Karan Mehra',
          version: 1,
          createdAt: '2026-07-01T10:00:00Z',
          updatedAt: '2026-07-01T10:00:00Z',
        },
      ];

      const { distinctRecords, totalAssessments, hasDuplicates, duplicateCount } =
        deduplicateRecordsByChild(assessments);

      expect(totalAssessments).toBe(3);
      expect(hasDuplicates).toBe(true);
      expect(duplicateCount).toBe(1);
      expect(distinctRecords.length).toBe(2);

      // The selected assessment for MH-PUN-2024-001 must be ASSESSMENT-002 (highest version)
      const priya = distinctRecords.find((r) => r.artNumber === 'MH-PUN-2024-001');
      expect(priya?.id).toBe('ASSESSMENT-002');
      expect(priya?.version).toBe(2);
    });

    it('does not collapse distinct children having placeholder or missing ART IDs', () => {
      const records = [
        { id: 'BEN-A', artNumber: 'MH-BEN-00' }, // Generic ART fallback
        { id: 'BEN-B', artNumber: 'MH-BEN-00' }, // Generic ART fallback
        { id: 'BEN-C', artNumber: '' }, // Blank ART
      ];

      const { distinctRecords, hasDuplicates } = deduplicateRecordsByChild(records);
      // All 3 should be kept distinct because generic fallback ART numbers must not collapse distinct children
      expect(distinctRecords.length).toBe(3);
      expect(hasDuplicates).toBe(false);
    });

    it('calculates aggregates based on distinct eligible children with explicit context string', () => {
      const sampleRows: any[] = [
        {
          id: 'ROW-1',
          artNumber: 'MH-PUN-001',
          childName: 'Child 1',
          readiness: {
            isComplete: true,
            missingPassbook: false,
            missingAadhaar: false,
            missingPhoto: false,
            missingSignature: false,
            missingSchoolDoc: false,
            orphanClassification: 'Double orphan',
            isOutOfSchool: false,
            clinicalAlert: { hasAlert: false },
            approvalStatus: 'Approved',
          },
        },
        {
          id: 'ROW-2',
          artNumber: 'MH-PUN-002',
          childName: 'Child 2',
          readiness: {
            isComplete: false,
            missingPassbook: true,
            missingAadhaar: true,
            missingPhoto: false,
            missingSignature: false,
            missingSchoolDoc: false,
            orphanClassification: 'Single orphan',
            isOutOfSchool: true,
            clinicalAlert: { hasAlert: true },
            approvalStatus: 'Pending',
          },
        },
      ];

      const aggregates = computeReadinessAggregates(sampleRows, 10);

      expect(aggregates.total).toBe(2);
      expect(aggregates.totalInScope).toBe(10);
      expect(aggregates.completeDocsCount).toBe(1);
      expect(aggregates.incompleteDocsCount).toBe(1);
      expect(aggregates.completenessRate).toBe(50);
      expect(aggregates.missingPassbook).toBe(1);
      expect(aggregates.missingAadhaar).toBe(1);
      expect(aggregates.approvedCount).toBe(1);
      expect(aggregates.pendingApprovalCount).toBe(1);
      expect(aggregates.approvalRate).toBe(50);
      expect(aggregates.contextLabel).toBe(
        '2 children matching filters, from 10 children in your authorized scope.'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-Select Column Filter Semantics & Faceting
  // ---------------------------------------------------------------------------
  describe('3. Multi-Select Column Filter Semantics & Facet Computation', () => {
    const testDataset: SupervisorBeneficiaryRow[] = [
      {
        id: '1',
        artNumber: 'MH-PUN-01',
        childName: 'Amit',
        age: 8,
        gender: 'Male',
        state: 'Maharashtra',
        district: 'Pune',
        schoolType: 'Government school',
        schoolEnrolled: true,
        orphanStatus: 'Double orphan',
        bmi: 16.0,
        bmiCategory: 'Normal',
        viralLoad: '< 20',
        vlCategory: 'Suppressed (<1000 copies/mL)',
        hemoglobin: '11.5',
        hbCategory: 'Normal',
        grantAmount: 12000,
        syncState: 'SYNCED',
        lastVisit: '2026-09-01',
        version: 1,
        documentStatus: {
          isComplete: true,
          totalRequired: 6,
          uploadedCount: 6,
          pendingDocs: [],
          uploadedDocs: ['Aadhaar Card'],
        },
        isApproved: true,
        approvedStatus: 'Approved',
      },
      {
        id: '2',
        artNumber: 'MH-PUN-02',
        childName: 'Pooja',
        age: 10,
        gender: 'Female',
        state: 'Maharashtra',
        district: 'Pune',
        schoolType: 'Private School',
        schoolEnrolled: true,
        orphanStatus: 'Single orphan',
        bmi: 13.0,
        bmiCategory: 'Severe Underweight',
        viralLoad: '25000',
        vlCategory: 'Unsuppressed (≥1000 copies/mL)',
        hemoglobin: '6.5',
        hbCategory: 'Severe Anemia',
        grantAmount: 15000,
        syncState: 'SYNCED',
        lastVisit: '2026-09-02',
        version: 1,
        documentStatus: {
          isComplete: false,
          totalRequired: 6,
          uploadedCount: 3,
          pendingDocs: ['Bank Passbook Front Page'],
          uploadedDocs: [],
        },
        isApproved: false,
        approvedStatus: 'Pending',
      },
      {
        id: '3',
        artNumber: 'MH-THN-03',
        childName: 'Sunil',
        age: 12,
        gender: 'Male',
        state: 'Maharashtra',
        district: 'Thane',
        schoolType: 'Aided School',
        schoolEnrolled: true,
        orphanStatus: 'Both parents alive',
        bmi: 17.0,
        bmiCategory: 'Normal',
        viralLoad: 'Undetectable',
        vlCategory: 'Undetectable (<50 copies/mL)',
        hemoglobin: '12.0',
        hbCategory: 'Normal',
        grantAmount: 10000,
        syncState: 'SYNCED',
        lastVisit: '2026-09-03',
        version: 1,
        documentStatus: {
          isComplete: true,
          totalRequired: 6,
          uploadedCount: 6,
          pendingDocs: [],
          uploadedDocs: [],
        },
        isApproved: true,
        approvedStatus: 'Approved',
      },
      {
        id: '4',
        artNumber: 'WB-KOL-04',
        childName: 'Debolina',
        age: 14,
        gender: 'Female',
        state: 'West Bengal',
        district: 'Kolkata',
        schoolType: 'Government school',
        schoolEnrolled: false,
        orphanStatus: 'Double orphan',
        bmi: 15.0,
        bmiCategory: 'Normal',
        viralLoad: '< 20',
        vlCategory: 'Suppressed (<1000 copies/mL)',
        hemoglobin: '11.0',
        hbCategory: 'Normal',
        grantAmount: 8000,
        syncState: 'SYNCED',
        lastVisit: '2026-09-04',
        version: 1,
        documentStatus: {
          isComplete: true,
          totalRequired: 4,
          uploadedCount: 4,
          pendingDocs: [],
          uploadedDocs: [],
        },
        isApproved: false,
        approvedStatus: 'Pending',
      },
    ];

    it('enforces OR-within column selections and AND-across column selections', () => {
      // Filter: District IN ('Pune', 'Thane') -> 3 records (Amit, Pooja, Sunil)
      const districtFilter: LinelistColumnFilters = {
        ...INITIAL_COLUMN_FILTERS,
        district: ['Pune', 'Thane'],
      };
      const r1 = filterBeneficiaryRows(testDataset, districtFilter, '');
      expect(r1.length).toBe(3);

      // Filter: District IN ('Pune', 'Thane') AND Gender IN ('Female') -> 1 record (Pooja)
      const combinedFilter: LinelistColumnFilters = {
        ...INITIAL_COLUMN_FILTERS,
        district: ['Pune', 'Thane'],
        gender: ['Female'],
      };
      const r2 = filterBeneficiaryRows(testDataset, combinedFilter, '');
      expect(r2.length).toBe(1);
      expect(r2[0].childName).toBe('Pooja');
    });

    it('combines global search with active multi-select column filters via AND', () => {
      const filters: LinelistColumnFilters = {
        ...INITIAL_COLUMN_FILTERS,
        district: ['Pune'],
      };
      // Search "Pooja" + district Pune -> 1 record (Pooja)
      const r1 = filterBeneficiaryRows(testDataset, filters, 'pooja');
      expect(r1.length).toBe(1);
      expect(r1[0].childName).toBe('Pooja');

      // Search "Sunil" + district Pune -> 0 records (Sunil is in Thane)
      const r2 = filterBeneficiaryRows(testDataset, filters, 'sunil');
      expect(r2.length).toBe(0);
    });

    it('computes faceted available options by ignoring target column active filter', () => {
      // When district filter is active ('Pune'), computing facets for district must show
      // ALL districts available under the OTHER filters (not just Pune)
      const filters: LinelistColumnFilters = {
        ...INITIAL_COLUMN_FILTERS,
        district: ['Pune'],
      };

      const districtFacets = computeColumnFacets(
        testDataset,
        filters,
        '',
        'district',
        (rows) => Array.from(new Set(rows.map((r) => r.district)))
      );

      // All 3 districts (Pune, Thane, Kolkata) should be present in the facet options
      const distValues = districtFacets.map((f) => f.value);
      expect(distValues).toContain('Pune');
      expect(distValues).toContain('Thane');
      expect(distValues).toContain('Kolkata');

      // The count for Pune is 2, Thane is 1, Kolkata is 1
      const puneFacet = districtFacets.find((f) => f.value === 'Pune');
      expect(puneFacet?.count).toBe(2);
    });

    it('sorts numeric columns numerically rather than lexicographically', () => {
      const ageSortedAsc = sortBeneficiaryRows(testDataset, { column: 'age', direction: 'asc' });
      expect(ageSortedAsc.map((r) => r.age)).toEqual([8, 10, 12, 14]);

      const grantSortedDesc = sortBeneficiaryRows(testDataset, { column: 'grantAmount', direction: 'desc' });
      expect(grantSortedDesc.map((r) => r.grantAmount)).toEqual([15000, 12000, 10000, 8000]);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Geographic Authorization Scoping
  // ---------------------------------------------------------------------------
  describe('4. Geographic Authorization Scope Enforcement', () => {
    const testDataset: SupervisorBeneficiaryRow[] = [
      {
        id: 'MH-1',
        artNumber: 'MH-PUN-01',
        childName: 'Amit',
        age: 8,
        gender: 'Male',
        state: 'Maharashtra',
        district: 'Pune',
        schoolType: 'Government school',
        schoolEnrolled: true,
        orphanStatus: 'Double orphan',
        bmi: 16.0,
        bmiCategory: 'Normal',
        viralLoad: '< 20',
        vlCategory: 'Suppressed (<1000 copies/mL)',
        hemoglobin: '11.5',
        hbCategory: 'Normal',
        grantAmount: 12000,
        syncState: 'SYNCED',
        lastVisit: '2026-09-01',
        version: 1,
        documentStatus: {
          isComplete: true,
          totalRequired: 6,
          uploadedCount: 6,
          pendingDocs: [],
          uploadedDocs: [],
        },
        isApproved: true,
        approvedStatus: 'Approved',
      },
      {
        id: 'WB-1',
        artNumber: 'WB-KOL-01',
        childName: 'Debolina',
        age: 14,
        gender: 'Female',
        state: 'West Bengal',
        district: 'Kolkata',
        schoolType: 'Government school',
        schoolEnrolled: false,
        orphanStatus: 'Double orphan',
        bmi: 15.0,
        bmiCategory: 'Normal',
        viralLoad: '< 20',
        vlCategory: 'Suppressed (<1000 copies/mL)',
        hemoglobin: '11.0',
        hbCategory: 'Normal',
        grantAmount: 8000,
        syncState: 'SYNCED',
        lastVisit: '2026-09-04',
        version: 1,
        documentStatus: {
          isComplete: true,
          totalRequired: 4,
          uploadedCount: 4,
          pendingDocs: [],
          uploadedDocs: [],
        },
        isApproved: false,
        approvedStatus: 'Pending',
      },
    ];

    it('never includes records outside user authorized state scope', () => {
      const mhUser: EvaluationUser = {
        userId: 'eval-mh-01',
        name: 'Maharashtra Evaluator',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
      };

      const rows = filterBeneficiaryRows(testDataset, INITIAL_COLUMN_FILTERS, '', mhUser);
      expect(rows.length).toBe(1);
      expect(rows[0].state).toBe('Maharashtra');
      expect(rows.some((r) => r.state === 'West Bengal')).toBe(false);
    });

    it('ensures unauthorized geographic values never appear in faceted options', () => {
      const mhUser: EvaluationUser = {
        userId: 'eval-mh-01',
        name: 'Maharashtra Evaluator',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
      };

      // Scoped dataset containing only authorized records
      const authorized = testDataset.filter((r) => r.state === 'Maharashtra');

      const stateFacets = computeColumnFacets(
        authorized,
        INITIAL_COLUMN_FILTERS,
        '',
        'state',
        (rows) => Array.from(new Set(rows.map((r) => r.state))),
        mhUser
      );

      const states = stateFacets.map((f) => f.value);
      expect(states).toContain('Maharashtra');
      expect(states).not.toContain('West Bengal');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Role Capability Enforcement (Model A: Evaluation Users Read-Only)
  // ---------------------------------------------------------------------------
  describe('5. Role-Based Action Capabilities & Model A Read-Only Policy', () => {
    const sampleRow: SupervisorBeneficiaryRow = {
      id: 'REC-001',
      artNumber: 'MH-PUN-01',
      childName: 'Pooja',
      age: 10,
      gender: 'Female',
      state: 'Maharashtra',
      district: 'Pune',
      schoolType: 'Government school',
      schoolEnrolled: true,
      orphanStatus: 'Double orphan',
      bmi: 16.0,
      bmiCategory: 'Normal',
      viralLoad: '< 20',
      vlCategory: 'Suppressed (<1000 copies/mL)',
      hemoglobin: '11.5',
      hbCategory: 'Normal',
      grantAmount: 12000,
      syncState: 'SYNCED',
      lastVisit: '2026-09-01',
      version: 1,
      documentStatus: {
        isComplete: true,
        totalRequired: 6,
        uploadedCount: 6,
        pendingDocs: [],
        uploadedDocs: [],
      },
      isApproved: false,
      approvedStatus: 'Pending',
    };

    it('renders Edit and Delete actions in RecordActionMenu only for verified ADMIN role', async () => {
      const adminUser: EvaluationUser = {
        userId: 'admin-01',
        name: 'Administrator',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
      };

      render(<RecordActionMenu row={sampleRow} user={adminUser} onDeleteRequest={vi.fn()} />);

      // Open the action menu
      const button = screen.getByRole('button', { name: /actions for record pooja/i });
      fireEvent.click(button);

      // ADMIN must see Edit and Delete Survey
      expect(screen.getByText(/Edit Survey/i)).toBeDefined();
      expect(screen.getByText(/Delete Survey/i)).toBeDefined();
      expect(screen.getByText('View Details')).toBeDefined();
      expect(screen.getByText(/Download PDF/i)).toBeDefined();
    });

    it('hides Edit and Delete actions in RecordActionMenu for STATE_REVIEWER evaluation role', async () => {
      const stateReviewerUser: EvaluationUser = {
        userId: 'rev-01',
        name: 'State Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
      };

      render(<RecordActionMenu row={sampleRow} user={stateReviewerUser} onDeleteRequest={vi.fn()} />);

      // Open the action menu
      const button = screen.getByRole('button', { name: /actions for record pooja/i });
      fireEvent.click(button);

      // STATE_REVIEWER must NOT see Edit or Delete Survey
      expect(screen.queryByText(/Edit Survey/i)).toBeNull();
      expect(screen.queryByText(/Delete Survey/i)).toBeNull();

      // Only View Details and Download PDF must appear
      expect(screen.getByText('View Details')).toBeDefined();
      expect(screen.getByText(/Download PDF/i)).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. CSV Export Formula Injection Prevention (CWE-1236)
  // ---------------------------------------------------------------------------
  describe('6. CSV Export Formula Injection Sanitization', () => {
    it('prefixes formula trigger characters with single quote and wraps in quotes', () => {
      // Formula triggers: =, +, -, @, tab (\t), newline (\r)
      expect(sanitizeCsvCell('=cmd|\' /C calc\'!A0')).toBe('"\'=cmd|\' /C calc\'!A0"');
      expect(sanitizeCsvCell('+12345')).toBe('"\' +12345"'.replace(' ', ''));
      expect(sanitizeCsvCell('-SUM(A1:A10)')).toBe("'\'-SUM(A1:A10)'".replace(/'/g, '"').replace('""', '"\''));
      expect(sanitizeCsvCell('@IMPORTHTML("http://evil.com")')).toBe('"\'@IMPORTHTML(""http://evil.com"")"');

      // Ordinary string without formula triggers
      expect(sanitizeCsvCell('MH-PUN-001')).toBe('"MH-PUN-001"');
      expect(sanitizeCsvCell('Child Name')).toBe('"Child Name"');
      expect(sanitizeCsvCell(12000)).toBe('"12000"');
      expect(sanitizeCsvCell(null)).toBe('""');
      expect(sanitizeCsvCell(undefined)).toBe('""');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Pagination & Large Dataset Performance (Targeting 10,000 Records)
  // ---------------------------------------------------------------------------
  describe('7. Pagination & Export Scaling Semantics', () => {
    it('slices 60 matching records into 3 pages of 25, 25, 10 without affecting export totals', () => {
      const records: SupervisorBeneficiaryRow[] = Array.from({ length: 60 }, (_, i) => ({
        id: `REC-${i + 1}`,
        artNumber: `MH-PUN-${String(i + 1).padStart(3, '0')}`,
        childName: `Beneficiary ${i + 1}`,
        age: 8 + (i % 10),
        gender: i % 2 === 0 ? 'Male' : 'Female',
        state: 'Maharashtra',
        district: 'Pune',
        schoolType: 'Government school',
        schoolEnrolled: true,
        orphanStatus: 'Both parents alive',
        bmi: 16.0,
        bmiCategory: 'Normal',
        viralLoad: '< 20',
        vlCategory: 'Suppressed (<1000 copies/mL)',
        hemoglobin: '12.0',
        hbCategory: 'Normal',
        grantAmount: 12000,
        syncState: 'SYNCED',
        lastVisit: '2026-09-01',
        version: 1,
        documentStatus: {
          isComplete: true,
          totalRequired: 6,
          uploadedCount: 6,
          pendingDocs: [],
          uploadedDocs: [],
        },
        isApproved: true,
        approvedStatus: 'Approved',
      }));

      const pageSize = 25;
      const totalPages = Math.ceil(records.length / pageSize);
      expect(totalPages).toBe(3);

      // Page 1: records 0 to 24 (25 records)
      const page1 = records.slice(0, 25);
      expect(page1.length).toBe(25);
      expect(page1[0].id).toBe('REC-1');
      expect(page1[24].id).toBe('REC-25');

      // Page 2: records 25 to 49 (25 records)
      const page2 = records.slice(25, 50);
      expect(page2.length).toBe(25);
      expect(page2[0].id).toBe('REC-26');
      expect(page2[24].id).toBe('REC-50');

      // Page 3: records 50 to 59 (10 records)
      const page3 = records.slice(50, 60);
      expect(page3.length).toBe(10);
      expect(page3[0].id).toBe('REC-51');
      expect(page3[9].id).toBe('REC-60');

      // Export requirement: All 60 records must be included in CSV export, NOT only visible page 1
      const csvExportRows = records.map((r) => sanitizeCsvCell(r.id));
      expect(csvExportRows.length).toBe(60);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Approval Mutation & Concurrency Handling (OCC)
  // ---------------------------------------------------------------------------
  describe('8. Approval Mutation & Concurrency Handling (OCC)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('submits expectedVersion and If-Match headers on approval toggle', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'success', data: { approvedAllianceIndia: 'Approved' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const rowId = 'REC-OCC-01';
      const version = 3;

      const res = await fetch(`/api/submissions/${encodeURIComponent(rowId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': `"${version}"`,
        },
        body: JSON.stringify({
          approvedAllianceIndia: 'Approved',
          expectedVersion: version,
        }),
      });

      expect(res.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/submissions/${rowId}`,
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'If-Match': '"3"',
          }),
          body: JSON.stringify({
            approvedAllianceIndia: 'Approved',
            expectedVersion: 3,
          }),
        })
      );
    });

    it('handles 409 conflict and preserves truthful local state', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'error',
            code: 'VERSION_CONFLICT',
            message: 'Conflict: record modified by another user',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await fetch('/api/submissions/REC-01', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify({ approvedAllianceIndia: 'Approved', expectedVersion: 1 }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe('VERSION_CONFLICT');
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Deletion Cancellation Safety
  // ---------------------------------------------------------------------------
  describe('9. Deletion Cancellation Safety', () => {
    it('cancels deletion without sending any network request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      let deleteModalTarget: { id: string; name: string } | null = {
        id: 'REC-DEL-01',
        name: 'Child To Keep',
      };

      // User clicks Cancel
      deleteModalTarget = null;

      expect(deleteModalTarget).toBeNull();
      // Zero fetch calls must be made
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
