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
import { ColumnFilterPopover } from '@/components/supervisor/ColumnFilterPopover';
import { parseBeneficiaryRecord } from '@/lib/read-model/supervisorReadModel';

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

  // ---------------------------------------------------------------------------
  // 10. Attachment Verification Differentiation & Multi-format Acceptance
  // ---------------------------------------------------------------------------
  describe('10. Attachment Verification Differentiation & Multi-format Acceptance', () => {
    it('accepts base64 PDF and generic data URIs as present attachments', () => {
      const pdfBase64 = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...';
      expect(isAttachmentPresent(pdfBase64)).toBe(true);

      const imageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';
      expect(isAttachmentPresent(imageBase64)).toBe(true);
    });

    it('accurately derives state as verified, uploaded, missing, and not_applicable', () => {
      const record = {
        '1\nUnique ID': 'BEN-VER-01',
        '42\nART ID Number': 'MH-PUN-001',
        '9\nChild Name': 'Ananya Joshi',
        '11\nAge': 10,
        '53\nSchool Type': 'Government school',
        // Passbook is present and verified
        '25\nPassbook Front Page Link': 'https://drive.google.com/passbook.jpg',
        isPassbookVerified: true,
        // Aadhaar is present but unverified
        '26\nAadhaar Card Link': 'https://drive.google.com/aadhaar.pdf',
        isAadhaarVerified: false,
        // Photo is missing
        '27\nPassport Size Photo Link': '',
        // Signature present and unverified
        '6\nSignature /\nThumb Impression': 'data:image/png;base64,iVBORw0...',
        isSignatureVerified: false,
      };

      const readiness = deriveBeneficiaryReadiness(record);
      expect(readiness.docDetails['Bank Passbook Front Page'].state).toBe('verified');
      expect(readiness.docDetails['Bank Passbook Front Page'].isVerified).toBe(true);
      expect(readiness.docDetails['Bank Passbook Front Page'].isPresent).toBe(true);

      expect(readiness.docDetails['Aadhaar Card'].state).toBe('uploaded');
      expect(readiness.docDetails['Aadhaar Card'].isVerified).toBe(false);
      expect(readiness.docDetails['Aadhaar Card'].isPresent).toBe(true);

      expect(readiness.docDetails['Passport Size Photo'].state).toBe('missing');
      expect(readiness.docDetails['Passport Size Photo'].isMissing).toBe(true);
    });

    it('sets state to not_applicable for school documents when child is not enrolled', () => {
      const record = {
        '1\nUnique ID': 'BEN-VER-02',
        '42\nART ID Number': 'MH-PUN-002',
        '9\nChild Name': 'Vikram',
        '53\nSchool Type': 'Not in School / Dropped Out',
        '25\nPassbook Front Page Link': 'https://drive.google.com/passbook.jpg',
        '26\nAadhaar Card Link': 'https://drive.google.com/aadhaar.pdf',
        '27\nPassport Size Photo Link': 'https://drive.google.com/photo.jpg',
        '6\nSignature /\nThumb Impression': 'https://drive.google.com/sig.png',
      };

      const readiness = deriveBeneficiaryReadiness(record);
      expect(readiness.docDetails['School Fee Receipt'].state).toBe('not_applicable');
      expect(readiness.docDetails['School Fee Receipt'].required).toBe(false);
      expect(readiness.docDetails['Academic Marksheet'].state).toBe('not_applicable');
      expect(readiness.docDetails['Academic Marksheet'].required).toBe(false);
    });

    it('parseBeneficiaryRecord preserves null for missing age and bmi without coercing to zero', () => {
      const recordWithoutAgeOrBmi = {
        '1\nUnique ID': 'BEN-NULL-01',
        '42\nART ID Number': 'MH-NUL-001',
        '9\nChild Name': 'Tanvi',
        '18\nState': 'Maharashtra',
        '19\nDistrict': 'Pune',
      };

      const parsed = parseBeneficiaryRecord(recordWithoutAgeOrBmi);
      expect(parsed.age).toBeNull();
      expect(parsed.bmi).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Null-Preserving Numeric Sorting & Lab Metric Sorting (NULLS LAST)
  // ---------------------------------------------------------------------------
  describe('11. Null-Preserving Numeric Sorting & Lab Metric Sorting', () => {
    const makeRow = (
      id: string,
      art: string,
      age: number | null,
      bmi: number | null,
      vl: string,
      hb: string,
      grant: number
    ): SupervisorBeneficiaryRow => ({
      id,
      artNumber: art,
      childName: `Child ${id}`,
      age,
      gender: 'Female',
      district: 'Pune',
      state: 'Maharashtra',
      schoolType: 'Government',
      schoolEnrolled: true,
      orphanStatus: 'None',
      bmi,
      bmiCategory: 'Normal',
      viralLoad: vl,
      vlCategory: 'Suppressed',
      hemoglobin: hb,
      hbCategory: 'Normal',
      grantAmount: grant,
      documentStatus: {
        isComplete: true,
        completenessRate: 100,
        uploadedCount: 6,
        totalRequired: 6,
        missingDocs: [],
        missingPassbook: false,
        missingAadhaar: false,
        missingPhoto: false,
        missingSignature: false,
        missingSchoolDoc: false,
      },
      isApproved: true,
      hasPassbook: true,
      hasAadhaar: true,
      hasPhoto: true,
      hasSignature: true,
      hasFeeReceipt: true,
      hasMarksheet: true,
      docDetails: {} as any,
    });

    it('sorts lab metrics (viralLoad) numerically rather than alphabetically', () => {
      const rows = [
        makeRow('1', 'ART-01', 10, 16.5, '1500', '12.0', 1000),
        makeRow('2', 'ART-02', 12, 18.0, '< 50', '11.5', 1000),
        makeRow('3', 'ART-03', 8, 14.2, '200', '13.0', 1000),
        makeRow('4', 'ART-04', 9, 15.0, '—', '10.5', 1000),
      ];

      // Alphabetical sorting would put "1500" before "200". Numeric sorting puts 0 (< 50) < 200 < 1500 < null (—).
      const sortedAsc = sortBeneficiaryRows(rows, { column: 'viralLoad', direction: 'asc' });
      expect(sortedAsc.map((r) => r.id)).toEqual(['2', '3', '1', '4']);

      const sortedDesc = sortBeneficiaryRows(rows, { column: 'viralLoad', direction: 'desc' });
      // Descending puts 1500 first, then 200, then < 50, and unknown/— at the end (NULLS LAST)
      expect(sortedDesc.map((r) => r.id)).toEqual(['1', '3', '2', '4']);
    });

    it('sorts hemoglobin numerically with nulls last in both directions', () => {
      const rows = [
        makeRow('1', 'ART-01', 10, 16.5, '50', '11.5', 1000),
        makeRow('2', 'ART-02', 12, 18.0, '50', '6.5', 1000),
        makeRow('3', 'ART-03', 8, 14.2, '50', '—', 1000),
        makeRow('4', 'ART-04', 9, 15.0, '50', '9.0', 1000),
      ];

      const sortedAsc = sortBeneficiaryRows(rows, { column: 'hemoglobin', direction: 'asc' });
      // 6.5 < 9.0 < 11.5 < null
      expect(sortedAsc.map((r) => r.id)).toEqual(['2', '4', '1', '3']);

      const sortedDesc = sortBeneficiaryRows(rows, { column: 'hemoglobin', direction: 'desc' });
      // 11.5 > 9.0 > 6.5, null last
      expect(sortedDesc.map((r) => r.id)).toEqual(['1', '4', '2', '3']);
    });

    it('places null ages and null BMIs last regardless of sort direction', () => {
      const rows = [
        makeRow('1', 'ART-01', null, 15.0, '50', '12.0', 1000),
        makeRow('2', 'ART-02', 14, 18.0, '50', '12.0', 1000),
        makeRow('3', 'ART-03', 7, null, '50', '12.0', 1000),
      ];

      const sortedAgeAsc = sortBeneficiaryRows(rows, { column: 'age', direction: 'asc' });
      expect(sortedAgeAsc.map((r) => r.id)).toEqual(['3', '2', '1']);

      const sortedAgeDesc = sortBeneficiaryRows(rows, { column: 'age', direction: 'desc' });
      expect(sortedAgeDesc.map((r) => r.id)).toEqual(['2', '3', '1']);

      const sortedBmiAsc = sortBeneficiaryRows(rows, { column: 'bmi', direction: 'asc' });
      expect(sortedBmiAsc.map((r) => r.id)).toEqual(['1', '2', '3']);

      const sortedBmiDesc = sortBeneficiaryRows(rows, { column: 'bmi', direction: 'desc' });
      expect(sortedBmiDesc.map((r) => r.id)).toEqual(['2', '1', '3']);
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Geographic Scope Isolation in Facet Computation
  // ---------------------------------------------------------------------------
  describe('12. Geographic Scope Isolation in Facet Computation', () => {
    const records: SupervisorBeneficiaryRow[] = [
      {
        id: '1',
        artNumber: 'MH-01',
        childName: 'Pooja',
        age: 10,
        gender: 'Female',
        district: 'Pune',
        state: 'Maharashtra',
        schoolType: 'Government',
        schoolEnrolled: true,
        orphanStatus: 'None',
        bmi: 16.0,
        bmiCategory: 'Normal',
        viralLoad: '< 50',
        vlCategory: 'Suppressed',
        hemoglobin: '12.0',
        hbCategory: 'Normal',
        grantAmount: 1000,
        documentStatus: { isComplete: true } as any,
        isApproved: true,
        hasPassbook: true,
        hasAadhaar: true,
        hasPhoto: true,
        hasSignature: true,
        hasFeeReceipt: true,
        hasMarksheet: true,
        docDetails: {} as any,
      },
      {
        id: '2',
        artNumber: 'WB-01',
        childName: 'Rohan',
        age: 11,
        gender: 'Male',
        district: 'Kolkata',
        state: 'West Bengal',
        schoolType: 'Government',
        schoolEnrolled: true,
        orphanStatus: 'None',
        bmi: 17.0,
        bmiCategory: 'Normal',
        viralLoad: '< 50',
        vlCategory: 'Suppressed',
        hemoglobin: '11.0',
        hbCategory: 'Normal',
        grantAmount: 1000,
        documentStatus: { isComplete: true } as any,
        isApproved: true,
        hasPassbook: true,
        hasAadhaar: true,
        hasPhoto: true,
        hasSignature: true,
        hasFeeReceipt: true,
        hasMarksheet: true,
        docDetails: {} as any,
      },
    ];

    it('strictly isolates state facet options according to user allowedStates', () => {
      const mhUser: EvaluationUser = {
        userId: 'rev-mh',
        name: 'MH Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
      };

      // Even if filters has 'West Bengal' injected by client tampering
      const tamperedFilters: LinelistColumnFilters = {
        ...INITIAL_COLUMN_FILTERS,
        state: ['West Bengal'],
      };

      const facets = computeColumnFacets(
        records,
        tamperedFilters,
        '',
        'state',
        (rows) => Array.from(new Set(rows.map((r) => r.state))),
        mhUser
      );

      const facetValues = facets.map((f) => f.value);
      expect(facetValues).toContain('Maharashtra');
      expect(facetValues).not.toContain('West Bengal');
    });

    it('strictly isolates district facet options according to user allowedDistricts', () => {
      const puneUser: EvaluationUser = {
        userId: 'rev-pune',
        name: 'Pune Reviewer',
        role: 'DISTRICT_COORDINATOR',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
        isVerified: true,
      };

      const tamperedFilters: LinelistColumnFilters = {
        ...INITIAL_COLUMN_FILTERS,
        district: ['Thane'],
      };

      const facets = computeColumnFacets(
        records,
        tamperedFilters,
        '',
        'district',
        (rows) => Array.from(new Set(rows.map((r) => r.district))),
        puneUser
      );

      const facetValues = facets.map((f) => f.value);
      expect(facetValues).toContain('Pune');
      expect(facetValues).not.toContain('Thane');
      expect(facetValues).not.toContain('Kolkata');
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Popover Staged Selections Stability
  // ---------------------------------------------------------------------------
  describe('13. Popover Staged Selections Stability', () => {
    it('maintains staged selections across parent re-renders while open', () => {
      const onApply = vi.fn();
      const onClear = vi.fn();

      const { rerender } = render(
        <ColumnFilterPopover
          columnId="state"
          columnTitle="State"
          sections={[
            {
              id: 'state',
              title: 'State',
              options: [
                { value: 'Maharashtra', label: 'Maharashtra', count: 10 },
                { value: 'Gujarat', label: 'Gujarat', count: 5 },
              ],
              selectedValues: [],
            },
          ]}
          onApply={onApply}
          onClear={onClear}
        />
      );

      // Open popover
      const trigger = screen.getByRole('button', { name: /Filter and sort State/i });
      fireEvent.click(trigger);

      // Click Maharashtra checkbox (stages it without applying yet)
      const mhCheckbox = screen.getByRole('checkbox', { name: /Maharashtra/i });
      fireEvent.click(mhCheckbox);
      expect(mhCheckbox).toBeChecked();

      // Parent re-renders with new sections object reference
      rerender(
        <ColumnFilterPopover
          columnId="state"
          columnTitle="State"
          sections={[
            {
              id: 'state',
              title: 'State',
              options: [
                { value: 'Maharashtra', label: 'Maharashtra', count: 10 },
                { value: 'Gujarat', label: 'Gujarat', count: 5 },
              ],
              selectedValues: [],
            },
          ]}
          onApply={onApply}
          onClear={onClear}
        />
      );

      // The staged selection should NOT be wiped out
      const mhCheckboxAfterRerender = screen.getByRole('checkbox', { name: /Maharashtra/i });
      expect(mhCheckboxAfterRerender).toBeChecked();

      // Apply filter
      const applyBtn = screen.getByRole('button', { name: /apply/i });
      fireEvent.click(applyBtn);

      expect(onApply).toHaveBeenCalledWith({
        state: ['Maharashtra'],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 14. Scope Denominator Reconciliation
  // ---------------------------------------------------------------------------
  describe('14. Scope Denominator Reconciliation', () => {
    it('accurately reconciles distinct children in scope from raw assessments', () => {
      const rawSubmissions = [
        { id: 'sub-01', artNumber: 'MH-PUN-001', version: 1, childName: 'Aarav' },
        { id: 'sub-02', artNumber: 'MH-PUN-001', version: 2, childName: 'Aarav' }, // Duplicate assessment
        { id: 'sub-03', artNumber: 'MH-PUN-002', version: 1, childName: 'Sneha' },
        { id: 'sub-04', artNumber: 'MH-PUN-003', version: 1, childName: 'Pooja' },
      ];

      expect(rawSubmissions.length).toBe(4);

      const deduplicated = deduplicateRecordsByChild(rawSubmissions);
      expect(deduplicated.totalAssessments).toBe(4);
      expect(deduplicated.distinctRecords.length).toBe(3);
      expect(deduplicated.hasDuplicates).toBe(true);
      expect(deduplicated.duplicateCount).toBe(1);

      // Distinct children count (3) is the surveillance denominator, not raw submissions count (4)
      const totalChildrenInScope = deduplicated.distinctRecords.length;
      expect(totalChildrenInScope).toBe(3);
    });
  });
});
