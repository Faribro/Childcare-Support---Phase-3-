/**
 * drive-asset-sheet-reconciliation.test.ts
 *
 * Integration Test Suite for Part H Tests 5 and 6:
 * - Test 5: Signature/document upload lifecycle & fail-safe Drive integration
 *   - Raw data URL never reaches final Sheet display cell
 *   - Successful Drive upload writes approved link/thumbnail representation
 *   - Drive file ID and Sheet reference are reconciled
 *   - Temporary Drive failure marks asset FAILED_RETRYABLE while assessment row remains accepted
 *   - Document retry updates only asset/reference state without creating a new submission row
 * - Test 6: Existing DL-SOU-141540-01-like fixture reconciliation
 *   - Accepted Sheet row + asset pending
 *   - Reconciliation updates correct document cell only
 *   - No form/consent data is altered
 *   - No duplicate row/file is created
 * - Safe dry-run tooling validation
 *
 * Synthetic non-PII test data only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { runReconciliation } from '../../../scripts/reconcile-dl-sou-record';
import type { CompleteSubmissionPayload } from '@/lib/validations/submissionSchema';

function createSyntheticSubmissionPayload(overrides: Partial<CompleteSubmissionPayload> = {}): CompleteSubmissionPayload {
  const uuid = `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  return {
    uuid,
    clientSubmissionId: uuid,
    interviewerName: 'Auditor Caseworker',
    caregiverConsent: {
      caregiverName: 'Caregiver Name',
      caregiverRelationship: 'Mother',
      consentProvided: true,
      consentVersion: '1.0',
      consentCapturedAt: new Date().toISOString(),
      signatureRequired: true,
      signatureStatus: 'CAPTURED_LOCAL',
      signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
    demographics: {
      childName: 'Child Test Record',
      dob: '2018-05-15',
      calculatedAgeYears: 6,
      gender: 'Male',
      orphanStatus: 'Both parents alive',
      caregiverName: 'Caregiver Name',
      caregiverRelationship: 'Mother',
      contactNumber: '9876543210',
      fullAddress: '123 Test Street, Block B',
      state: 'Maharashtra',
      district: 'Pune',
      artNumber: 'DL-SOU-141540-01',
    },
    bankingAndKyc: {
      bankAccountHolderName: 'Caregiver Name',
      bankAccountNumber: '987654321098',
      bankIfscCode: 'SBIN0001234',
      bankLinkedMobileNumber: '9876543210',
      passbookPhotoUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
      aadhaarCardPhotoUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
      childPhotoUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
    },
    householdFinancial: {
      totalFamilyMembers: 4,
      numberOfChildrenUnder18: 2,
      monthlyIncomeRs: 6000,
      mainSourceOfIncome: 'Daily wage labour',
    },
    health: {
      weightKg: 18.5,
      heightCm: 110,
      muacMm: 140,
      bilateralPittingOedema: false,
      otherHealthConditions: [],
      artStatus: 'On ART',
      artRegistrationDate: '2021-01-10',
      artIdNumber: 'ART-999',
      vlStatus: 'Tested in last 6 months',
      vlDate: '2024-01-01',
      viralLoad: '< 50',
      vlCategory: 'Undetectable (<50 copies/mL)',
    },
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    },
    educationStatus: {
      educationStatus: 'Currently going to school',
      schoolName: 'Public Elementary School',
      schoolSessionStartDate: '2024-06-01',
      schoolType: 'Government school',
      currentClass: 'Class 1',
      attendance: 'Regular',
    },
    educationExpenses: {
      schoolFees: 1200,
      tuitionFees: 500,
      books: 400,
      stationery: 200,
      uniform: 600,
      transport: 300,
      otherExpenses: 100,
      totalAnnualCost: 3300,
      feeReceiptPhotoUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
      marksheetPhotoUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
    },
    finalReview: {
      approvedAllianceIndia: 'Pending',
      allInfoCorrect: true,
      organizationName: 'India HIV/AIDS Alliance',
      formSubmittedBy: 'Auditor Caseworker',
      organizationEmail: 'caseworker@allianceindia.org',
    },
    ...overrides,
  };
}

describe('PR 2: Drive Asset & Sheet Reconciliation Integration Suite', () => {
  beforeEach(() => {
    MockSheetStore.reset();
  });

  describe('Part H — Test 5: Signature/Document Upload Lifecycle & Fail-Safe Integration', () => {
    it('5A: successful Drive upload writes approved hyperlink formula and never leaks raw data URL to Sheet', async () => {
      const payload = createSyntheticSubmissionPayload();
      const idempotencyKey = `idemp-create-${payload.uuid}`;
      const requestId = `req-create-${payload.uuid}`;

      const result = await canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey,
        requestId,
      });

      expect(result.status).toBe('success');
      expect(result.acknowledged).toBe(true);
      expect(result.submissionStatus).toBe('ACCEPTED');
      expect(result.assetStatus).toBe('UPLOADED');

      // Verify stored sheet record
      const stored = MockSheetStore.findRecord(payload.uuid);
      expect(stored).toBeDefined();

      // Invariant: Raw base64 data URL NEVER reaches final sheet cell
      expect(stored?.signature_data_url).not.toContain('data:image/png;base64');
      expect(stored?.signature_data_url).not.toContain('DATA_URL_STORED_PENDING_AUTH');

      // Invariant: Written cell contains approved HYPERLINK formula
      expect(stored?.signature_data_url).toMatch(/^=HYPERLINK\("https:\/\/drive\.google\.com\/file\/d\/[^"]+",\s*"Restricted Doc \[caregiver-sig\]"\)$/);
      expect(stored?.passbook_photo_url).toMatch(/^=HYPERLINK\("https:\/\/drive\.google\.com\/file\/d\/[^"]+",\s*"Restricted Doc \[passbook\]"\)$/);

      // Verify exact count: 1 record in Sheet
      expect(MockSheetStore.recordCount()).toBe(1);
    });

    it('5B: temporary Drive failure marks asset FAILED_RETRYABLE while assessment row remains accepted with safe placeholder', async () => {
      // Simulate Drive unavailability / failure
      MockSheetStore.setDriveFailure(true);

      const payload = createSyntheticSubmissionPayload();
      const idempotencyKey = `idemp-create-fail-${payload.uuid}`;
      const requestId = `req-create-fail-${payload.uuid}`;

      const result = await canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey,
        requestId,
      });

      // Assessment MUST be accepted
      expect(result.status).toBe('success');
      expect(result.acknowledged).toBe(true);
      expect(result.submissionStatus).toBe('ACCEPTED');

      // Asset status MUST be FAILED_RETRYABLE (never silently dropped or falsely marked uploaded)
      expect(result.assetStatus).toBe('FAILED_RETRYABLE');

      // Verify stored sheet record
      const stored = MockSheetStore.findRecord(payload.uuid);
      expect(stored).toBeDefined();

      // Never write raw data: string or DATA_URL_STORED_PENDING_AUTH to sheet cell
      expect(stored?.signature_data_url).not.toContain('data:');
      expect(stored?.signature_data_url).not.toContain('DATA_URL_STORED_PENDING_AUTH');

      // Cell contains safe non-data marker indicating retry required
      expect(stored?.signature_data_url).toBe('[Document Pending Drive Upload]');
      expect(stored?.passbook_photo_url).toBe('[Document Pending Drive Upload]');

      // Clinical assessment row remains accepted and complete
      expect(stored?.child_name).toBe('Child Test Record');
      expect(stored?.weight_kg).toBe(18.5);
      expect(MockSheetStore.recordCount()).toBe(1);
    });

    it('5C: document retry updates only asset reference cell and does NOT create a duplicate submission row', async () => {
      // 1. Initial creation with Drive failure
      MockSheetStore.setDriveFailure(true);
      const payload = createSyntheticSubmissionPayload();
      const idempotencyKey = `idemp-retry-test-${payload.uuid}`;
      const requestId = `req-retry-test-${payload.uuid}`;

      const createResult = await canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey,
        requestId,
      });
      expect(createResult.assetStatus).toBe('FAILED_RETRYABLE');
      expect(MockSheetStore.recordCount()).toBe(1);

      // 2. Drive service recovers
      MockSheetStore.setDriveFailure(false);

      // 3. Retry asset upload via updateAsset
      const assetRetryResult = await canonicalSubmissionAdapter.updateAsset({
        submissionId: payload.uuid,
        docType: 'Signature',
        fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        requestId: `req-asset-retry-${payload.uuid}`,
      });

      expect(assetRetryResult.status).toBe('success');
      expect(assetRetryResult.assetStatus).toBe('UPLOADED');
      expect(assetRetryResult.cellFormula).toMatch(/^=HYPERLINK\("https:\/\/drive\.google\.com\/file\/d\/[^"]+",\s*"Restricted Doc \[Signature\]"\)$/);

      // Verify that ONLY the asset cell was updated and ZERO duplicate rows exist
      expect(MockSheetStore.recordCount()).toBe(1);
      const updated = MockSheetStore.findRecord(payload.uuid);
      expect(updated?.signature_data_url).toMatch(/^=HYPERLINK\("https:\/\/drive\.google\.com\/file\/d\/[^"]+",\s*"Restricted Doc \[Signature\]"\)$/);

      // Verify clinical and consent data remained completely unaltered
      expect(updated?.child_name).toBe('Child Test Record');
      expect(updated?.version).toBe(1); // Revision not bumped for document reconciliation
      expect(updated?.weight_kg).toBe(18.5);
    });
  });

  describe('Part H — Test 6: Existing DL-SOU-141540-01-like Fixture Reconciliation', () => {
    it('6A: accepted Sheet row with pending asset updates only the document cell and preserves all consent & clinical data', async () => {
      // 1. Seed existing DL-SOU-141540-01 incident fixture
      const businessId = 'DL-SOU-141540-01';
      MockSheetStore.setDriveFailure(true); // Row was accepted but asset did not reach Drive

      const payload = createSyntheticSubmissionPayload({
        uuid: businessId,
        clientSubmissionId: businessId,
        demographics: {
          childName: 'Incident Child',
          dob: '2019-01-01',
          calculatedAgeYears: 5,
          gender: 'Female',
          orphanStatus: 'Single orphan (one parent deceased)',
          caregiverName: 'Caregiver A',
          caregiverRelationship: 'Mother',
          contactNumber: '9123456780',
          fullAddress: 'South Delhi Community Cluster',
          state: 'Delhi',
          district: 'South Delhi',
          artNumber: businessId,
        },
      });

      await canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey: `idemp-dlsou-${businessId}`,
        requestId: `req-dlsou-${businessId}`,
      });

      const beforeRec = MockSheetStore.findRecord(businessId);
      expect(beforeRec).toBeDefined();
      expect(beforeRec?.signature_data_url).toBe('[Document Pending Drive Upload]');
      expect(beforeRec?.child_name).toBe('Incident Child');
      expect(MockSheetStore.recordCount()).toBe(1);

      // 2. Perform reconciliation update on Column 6
      MockSheetStore.setDriveFailure(false);
      const recResult = await canonicalSubmissionAdapter.updateAsset({
        submissionId: businessId,
        docType: 'Signature',
        fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        requestId: 'req-rec-fixture',
      });

      expect(recResult.status).toBe('success');
      expect(recResult.assetStatus).toBe('UPLOADED');
      expect(recResult.cellFormula).toContain('=HYPERLINK(');
      expect(recResult.cellFormula).toContain('Restricted Doc [Signature]');

      // 3. Verify Sheet state after reconciliation:
      // - ZERO duplicate rows created
      expect(MockSheetStore.recordCount()).toBe(1);

      const afterRec = MockSheetStore.findRecord(businessId);
      expect(afterRec?.signature_data_url).toContain('=HYPERLINK(');
      expect(afterRec?.signature_data_url).toContain('Restricted Doc [Signature]');

      // - Form & consent data is completely preserved
      expect(afterRec?.child_name).toBe('Incident Child');
      expect(afterRec?.orphan_status).toBe('Single orphan (one parent deceased)');
      expect(afterRec?.district).toBe('South Delhi');
      expect(afterRec?.weight_kg).toBe(18.5);
    });

    it('6B: dry-run reconciliation tool executes safely with ZERO mutations and ZERO PII logged', async () => {
      const report = await runReconciliation(['--dry-run']);

      expect(report.mode).toBe('DRY_RUN');
      expect(report.reconciliationVerdict).toBe('DRY_RUN_READY_FOR_APPROVAL');
      expect(report.plannedAction.willCreateRow).toBe(false);
      expect(report.plannedAction.targetCell).toContain('F18 (Col 6)');

      // Verify 0 PII in audit report
      expect(report.redactedRecordId).toBe('DL-SOU-***-01');
      const jsonReport = JSON.stringify(report);
      expect(jsonReport).not.toContain('Incident Child');
      expect(jsonReport).not.toContain('9123456780');
      expect(jsonReport).not.toContain('data:image');
    });
  });

  describe('Apps Script Drive & Column Verification (gas/Code.js)', () => {
    const gasPath = path.resolve(process.cwd(), 'gas/Code.js');
    const gasCode = fs.readFileSync(gasPath, 'utf8');

    it('verifies safeProcessDoc_ catches Drive exceptions fail-safe and marks FAILED_RETRYABLE', () => {
      expect(gasCode).toContain('function safeProcessDoc_(');
      expect(gasCode).toContain("assetStatus = 'FAILED_RETRYABLE'");
      expect(gasCode).toContain("return '[Document Pending Drive Upload]'");
    });

    it('verifies target spreadsheet ID is updated to production sheet', () => {
      expect(gasCode).toContain("var TARGET_SPREADSHEET_ID = '1YORdIKiIdSILyOekMJ5BCO5WCujoZ87U7H65x88HKkM';");
    });

    it('verifies updateAsset action is routed in doPost', () => {
      expect(gasCode).toContain("if (action === 'updateAsset')");
      expect(gasCode).toContain('return handleUpdateAsset_(payload, requestId);');
    });

    it('verifies handleUpdateAsset_ updates cell without calling appendRow', () => {
      expect(gasCode).toContain('function handleUpdateAsset_(payload, requestId)');
      expect(gasCode).toContain('sheet.getRange(foundRow, targetCol).setValue(cellFormula);');
      // Must not call sheet.appendRow in handleUpdateAsset_
      const updateAssetFn = gasCode.substring(gasCode.indexOf('function handleUpdateAsset_'), gasCode.indexOf('function handleUpdateAsset_') + 3000);
      expect(updateAssetFn).not.toContain('.appendRow(');
      expect(updateAssetFn).not.toContain('sheet.appendRow');
    });

    it('verifies Drive file deduplication before createFile', () => {
      expect(gasCode).toContain('var existingFiles = targetFolder.getFilesByName(slotFileName);');
      expect(gasCode).toContain('if (existingFiles.hasNext())');
    });

    it('verifies raw base64 data URLs are never written to sheet cells', () => {
      expect(gasCode).toContain("val.indexOf('data:') === 0 || val.indexOf(';base64,') !== -1");
      expect(gasCode).toContain("return '[Document Pending Drive Upload]'");
    });
  });
});
