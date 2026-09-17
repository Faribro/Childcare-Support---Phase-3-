/**
 * drive-asset-sheet-reconciliation.test.ts
 *
 * Integration Test Suite for Part H Tests 5 and 6 (Row-Identity-Safe):
 * - Test 5: Signature/document upload lifecycle & fail-safe Drive integration
 *   - 5A: Successful Drive upload writes approved hyperlink formula; raw data URL never reaches Sheet
 *   - 5B: Temporary Drive failure marks asset FAILED_RETRYABLE while assessment row remains accepted
 *   - 5C: Document retry updates only asset reference cell and does NOT create a duplicate submission row
 * - Test 6: Row-Identity-Safe Dynamic Reconciliation & Concurrency Guards
 *   - 6A: Record currently at Row 5, not Row 18: script dynamically resolves Row 5 by ID
 *   - 6B: Reordering/inserting rows does not change target selection
 *   - 6C: Zero matches fails closed with ZERO mutations
 *   - 6D: Duplicate matches fails closed with ZERO mutations
 *   - 6E: Changed cell after dry-run fails optimistic concurrency
 *   - 6F: Execution mode requires ALL safety gates (exact ID, hash, confirmation token, pre-write relookup)
 *   - 6G: Asset update modifies only resolved asset cell plus allowed timestamp column
 *   - 6H: No appendRow / no record count increase occurs
 *   - 6I: Script strictly rejects arbitrary --row CLI argument fail-closed
 *   - 6J: Dry-run output contains ONLY safe redacted metadata with ZERO PII/secrets/signatures
 * - Apps Script Contract Tests (gas/Code.js)
 *
 * Synthetic non-PII test data only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { POST as updateAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
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

  describe('Part H — Test 6: Row-Identity-Safe Dynamic Reconciliation & Concurrency Guards', () => {
    const businessId = 'DL-SOU-141540-01';

    function seedTestRecordAtRow(targetRowIndex: number) {
      MockSheetStore.reset();
      // In Sheet linelist: Rows 1, 2, 3 are headers. Data starts at Row 4.
      // If targetRowIndex is 5, prepend 1 dummy record (Row 4 = dummy 1, Row 5 = target).
      // If targetRowIndex is 18, prepend 14 dummy records (Rows 4-17 = dummy, Row 18 = target).
      const dummyCount = Math.max(0, targetRowIndex - 4);
      if (dummyCount > 0) {
        MockSheetStore.prependDummyRecords(dummyCount, 'PRE-PAD');
      }

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

      canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey: `idemp-dlsou-${businessId}-${targetRowIndex}`,
        requestId: `req-dlsou-${businessId}`,
      });
      MockSheetStore.setDriveFailure(false);
    }

    it('6A: record currently at Row 5, not Row 18: script dynamically resolves Row 5 by ID', async () => {
      // Seed record at Row 5 (matching the visible Google Sheet screenshot)
      seedTestRecordAtRow(5);

      const report = await runReconciliation(['--dry-run', '--id', businessId]);

      expect(report.mode).toBe('DRY_RUN');
      expect(report.matchVerification).toBe('EXACT_SINGLE_ROW_MATCH');
      expect(report.reconciliationVerdict).toBe('DRY_RUN_READY_FOR_APPROVAL');

      // CRITICAL PROOF: Row is dynamically resolved to Row 5, NEVER hardcoded to Row 18
      expect(report.resolvedRowIndex).toBe(5);
      expect(report.targetColumn).toBe('Column 6 (F) — Signature / Thumb Impression');
      expect(report.currentCellStateCategory).toBe('PENDING_DRIVE_UPLOAD');
      expect(report.currentCellStateHash).toBeTruthy();

      // Zero mutations during dry run
      const record = MockSheetStore.findRecord(businessId);
      expect(record?.signature_data_url).toBe('[Document Pending Drive Upload]');
      expect(MockSheetStore.recordCount()).toBe(2); // 1 dummy + 1 target = 2
    });

    it('6B: reordering / inserting rows does not change target selection', async () => {
      // Initially at Row 5
      seedTestRecordAtRow(5);

      // Now insert 10 additional rows before it, shifting target to Row 15
      MockSheetStore.prependDummyRecords(10, 'SHIFT');

      const report = await runReconciliation(['--dry-run', '--id', businessId]);

      // Script resolves dynamic position Row 15 without confusing targets
      expect(report.matchVerification).toBe('EXACT_SINGLE_ROW_MATCH');
      expect(report.resolvedRowIndex).toBe(15);
      expect(report.targetColumn).toBe('Column 6 (F) — Signature / Thumb Impression');
    });

    it('6C: zero matches fails closed with ZERO mutations', async () => {
      seedTestRecordAtRow(5);
      const countBefore = MockSheetStore.recordCount();

      const report = await runReconciliation(['--dry-run', '--id', 'DL-NON-000000-01']);

      expect(report.matchVerification).toBe('ZERO_MATCHES_FAIL_CLOSED');
      expect(report.reconciliationVerdict).toBe('RECORD_NOT_FOUND_EXECUTION_BLOCKED');
      expect(report.resolvedRowIndex).toBe(-1);
      expect(MockSheetStore.recordCount()).toBe(countBefore);
    });

    it('6D: duplicate matches fails closed with ZERO mutations', async () => {
      seedTestRecordAtRow(5);
      // Inject duplicate record with identical clientSubmissionId
      MockSheetStore.injectDuplicateRecord(businessId);
      const countBefore = MockSheetStore.recordCount();

      const report = await runReconciliation(['--dry-run', '--id', businessId]);

      expect(report.matchVerification).toBe('AMBIGUOUS_DUPLICATE_FAIL_CLOSED');
      expect(report.reconciliationVerdict).toBe('AMBIGUOUS_DUPLICATE_EXECUTION_BLOCKED');
      expect(report.resolvedRowIndex).toBe(-1);
      expect(MockSheetStore.recordCount()).toBe(countBefore);
    });

    it('6E: changed cell after dry-run fails optimistic concurrency with ZERO mutations', async () => {
      seedTestRecordAtRow(5);

      // 1. Dry run to obtain hash
      const dryRunReport = await runReconciliation(['--dry-run', '--id', businessId]);
      const initialHash = dryRunReport.currentCellStateHash;
      expect(initialHash).toBeTruthy();

      // 2. Simulate concurrent modification to the cell
      const record = MockSheetStore.findRecord(businessId);
      record!.signature_data_url = 'CONCURRENTLY_MODIFIED_CELL_VALUE';

      // 3. Attempt execution with the stale dry-run hash
      const execReport = await runReconciliation([
        '--execute',
        '--id', businessId,
        '--expected-hash', initialHash,
        '--confirm-token', `CONFIRM_RECONCILE_${businessId}`,
      ]);

      expect(execReport.reconciliationVerdict).toBe('STALE_CELL_STATE_OCC_CONFLICT');
      // Cell was NOT overwritten
      expect(record?.signature_data_url).toBe('CONCURRENTLY_MODIFIED_CELL_VALUE');
    });

    it('6F: execution mode requires ALL safety gates (exact ID, hash, confirmation token, pre-write check)', async () => {
      seedTestRecordAtRow(5);

      // Missing ID refuses execution
      const noIdReport = await runReconciliation(['--execute']);
      expect(noIdReport.reconciliationVerdict).toBe('MISSING_EXPLICIT_ID_REFUSED');

      // Missing hash refuses execution
      const noHashReport = await runReconciliation(['--execute', '--id', businessId]);
      expect(noHashReport.reconciliationVerdict).toBe('MISSING_EXPECTED_HASH_REFUSED');

      // Missing or wrong confirmation token refuses execution
      const dryRun = await runReconciliation(['--dry-run', '--id', businessId]);
      const wrongTokenReport = await runReconciliation([
        '--execute',
        '--id', businessId,
        '--expected-hash', dryRun.currentCellStateHash,
        '--confirm-token', 'WRONG_TOKEN',
      ]);
      expect(wrongTokenReport.reconciliationVerdict).toBe('INVALID_CONFIRMATION_TOKEN_REFUSED');

      // With ALL valid parameters, execution succeeds
      const successReport = await runReconciliation([
        '--execute',
        '--id', businessId,
        '--expected-hash', dryRun.currentCellStateHash,
        '--confirm-token', `CONFIRM_RECONCILE_${businessId}`,
      ]);
      expect(successReport.reconciliationVerdict).toBe('RECONCILIATION_COMPLETED');
    });

    it('6G: asset update modifies only resolved asset cell plus allowed timestamp column', async () => {
      seedTestRecordAtRow(5);

      const before = JSON.parse(JSON.stringify(MockSheetStore.findRecord(businessId)));
      expect(before.signature_data_url).toBe('[Document Pending Drive Upload]');

      const dryRun = await runReconciliation(['--dry-run', '--id', businessId]);
      await runReconciliation([
        '--execute',
        '--id', businessId,
        '--expected-hash', dryRun.currentCellStateHash,
        '--confirm-token', `CONFIRM_RECONCILE_${businessId}`,
      ]);

      const after = MockSheetStore.findRecord(businessId)!;

      // Asset cell modified to approved hyperlink
      expect(after.signature_data_url).toContain('=HYPERLINK(');
      expect(after.signature_data_url).toContain('Restricted Doc [Signature]');

      // Timestamp updated
      expect(after.updated_at).toBeTruthy();

      // ALL 9 clinical/demographic/consent/banking categories strictly unaltered
      expect(after.child_name).toBe(before.child_name);
      expect(after.dob).toBe(before.dob);
      expect(after.gender).toBe(before.gender);
      expect(after.orphan_status).toBe(before.orphan_status);
      expect(after.caregiver_name).toBe(before.caregiver_name);
      expect(after.caregiver_relationship).toBe(before.caregiver_relationship);
      expect(after.caregiverPhone).toBe(before.caregiverPhone);
      expect(after.weight_kg).toBe(before.weight_kg);
      expect(after.height_cm).toBe(before.height_cm);
      expect(after.muac_mm).toBe(before.muac_mm);
      expect(after.bank_account_number).toBe(before.bank_account_number);
      expect(after.ifsc_code).toBe(before.ifsc_code);
      expect(after.monthly_household_income).toBe(before.monthly_household_income);
      expect(after.version).toBe(before.version);
    });

    it('6H: no appendRow / no record data field mutation occurs', async () => {
      seedTestRecordAtRow(5);
      const countBefore = MockSheetStore.recordCount();

      const dryRun = await runReconciliation(['--dry-run', '--id', businessId]);
      await runReconciliation([
        '--execute',
        '--id', businessId,
        '--expected-hash', dryRun.currentCellStateHash,
        '--confirm-token', `CONFIRM_RECONCILE_${businessId}`,
      ]);

      expect(MockSheetStore.recordCount()).toBe(countBefore);
    });

    it('6I: script strictly rejects arbitrary --row CLI argument fail-closed', async () => {
      await expect(runReconciliation(['--row', '18'])).rejects.toThrow(
        /Arbitrary row arguments \(--row\) are strictly prohibited/
      );
      await expect(runReconciliation(['--row-number', '5'])).rejects.toThrow(
        /Arbitrary row arguments \(--row\) are strictly prohibited/
      );
      await expect(runReconciliation(['-r', '5'])).rejects.toThrow(
        /Arbitrary row arguments \(--row\) are strictly prohibited/
      );
    });

    it('6J: dry-run output contains ONLY safe redacted metadata with ZERO PII/secrets/signatures', async () => {
      seedTestRecordAtRow(5);

      const report = await runReconciliation(['--dry-run', '--id', businessId]);
      expect(report.redactedRecordId).toBe('DL-SOU-***-01');
      expect(report.recordIdHashPrefix).toBeTruthy();

      const json = JSON.stringify(report);
      // Zero PII / zero clinical / zero raw data URLs / zero signatures
      expect(json).not.toContain('Incident Child');
      expect(json).not.toContain('9123456780');
      expect(json).not.toContain('Caregiver A');
      expect(json).not.toContain('data:image');
      expect(json).not.toContain('base64');
      expect(json).not.toContain('iVBORw0KGgo');
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

    it('verifies handleUpdateAsset_ resolves row dynamically by Column 1 scan', () => {
      expect(gasCode).toContain('function handleUpdateAsset_(payload, requestId)');
      expect(gasCode).toContain('var ids = sheet.getRange(4, 1, lastRow - 3, 1).getValues();');
      expect(gasCode).toContain('matchingRows.push(4 + r);');
    });

    it('verifies handleUpdateAsset_ fails closed on zero or duplicate row matches', () => {
      expect(gasCode).toContain('if (matchingRows.length === 0)');
      expect(gasCode).toContain("return errorResponse_('Record not found with ID: ' + targetId, 'NOT_FOUND', 404, requestId);");
      expect(gasCode).toContain('if (matchingRows.length > 1)');
      expect(gasCode).toContain("return errorResponse_('Ambiguous match: multiple rows found with ID: ' + targetId + '. Execution refused.', 'CONFLICT', 409, requestId);");
    });

    it('verifies handleUpdateAsset_ checks expectedVersion and expectedCurrentCellStateHash', () => {
      expect(gasCode).toContain('var expectedVersion = payload.expectedVersion || payload.expectedRevision;');
      expect(gasCode).toContain("if (currentVersion !== Number(expectedVersion))");
      expect(gasCode).toContain('if (payload.expectedCurrentCellStateHash)');
      expect(gasCode).toContain("return errorResponse_('Optimistic concurrency failed: current cell state hash changed after dry-run.', 'OCC_CONFLICT', 409, requestId);");
    });

    it('verifies handleUpdateAsset_ updates cell without calling appendRow', () => {
      expect(gasCode).toContain('sheet.getRange(foundRow, targetCol).setValue(cellFormula);');
      // Must not call sheet.appendRow in handleUpdateAsset_
      const updateAssetFn = gasCode.substring(gasCode.indexOf('function handleUpdateAsset_'), gasCode.indexOf('function handleUpdateAsset_') + 4500);
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

  describe('Part H — Fast-Follow: Mandatory OCC Enforcement on Asset Retry Route (POST /api/submissions/[submissionId]/asset)', () => {
    const validDummyFileData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const testId = 'DL-SOU-141540-01';

    async function setupExistingRecord(signatureCellVal: string = 'DATA_URL_STORED_PENDING_AUTH', version: number = 1) {
      MockSheetStore.reset();
      const payload = createSyntheticSubmissionPayload({
        uuid: testId,
        clientSubmissionId: testId,
      });
      MockSheetStore.setDriveFailure(true);
      await canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey: `setup-key-${testId}-${Date.now()}`,
        requestId: `setup-req-${testId}`,
      });
      MockSheetStore.setDriveFailure(false);

      const stored = MockSheetStore.findRecord(testId);
      if (stored) {
        stored.version = version;
        stored.signature_data_url = signatureCellVal;
        stored.signatureDataUrl = signatureCellVal;
      }
      return {
        expectedVersion: version,
        expectedCellHash: crypto.createHash('sha256').update(signatureCellVal.trim()).digest('hex'),
      };
    }

    it('rejects asset retry request when expectedVersion is missing (400 VALIDATION_ERROR)', async () => {
      const { expectedCellHash } = await setupExistingRecord();
      const req = new NextRequest(`http://localhost:3000/api/submissions/${testId}/asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'caseworker' },
        body: JSON.stringify({
          docType: 'signature',
          fileData: validDummyFileData,
          expectedCurrentCellStateHash: expectedCellHash,
          // expectedVersion omitted
        }),
      });

      const res = await updateAssetRoute(req, { params: { submissionId: testId } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(json.message).toContain('expectedVersion');
    });

    it('rejects asset retry request when expectedVersion is not a positive integer (400 VALIDATION_ERROR)', async () => {
      const { expectedCellHash } = await setupExistingRecord();
      for (const badVer of [0, -1, 1.5, '1', null, {}]) {
        const req = new NextRequest(`http://localhost:3000/api/submissions/${testId}/asset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-role': 'caseworker' },
          body: JSON.stringify({
            docType: 'signature',
            fileData: validDummyFileData,
            expectedVersion: badVer,
            expectedCurrentCellStateHash: expectedCellHash,
          }),
        });

        const res = await updateAssetRoute(req, { params: { submissionId: testId } });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.code).toBe('VALIDATION_ERROR');
        expect(json.message).toContain('expectedVersion');
      }
    });

    it('rejects asset retry request when expectedCurrentCellStateHash is missing (400 VALIDATION_ERROR)', async () => {
      const { expectedVersion } = await setupExistingRecord();
      const req = new NextRequest(`http://localhost:3000/api/submissions/${testId}/asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'caseworker' },
        body: JSON.stringify({
          docType: 'signature',
          fileData: validDummyFileData,
          expectedVersion,
          // expectedCurrentCellStateHash omitted
        }),
      });

      const res = await updateAssetRoute(req, { params: { submissionId: testId } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(json.message).toContain('expectedCurrentCellStateHash');
    });

    it('rejects asset retry request when expectedCurrentCellStateHash is not a 64-character hex string (400 VALIDATION_ERROR)', async () => {
      const { expectedVersion } = await setupExistingRecord();
      for (const badHash of ['', 'short', 'not-a-hex-hash'.padEnd(64, 'z'), 12345, null]) {
        const req = new NextRequest(`http://localhost:3000/api/submissions/${testId}/asset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-role': 'caseworker' },
          body: JSON.stringify({
            docType: 'signature',
            fileData: validDummyFileData,
            expectedVersion,
            expectedCurrentCellStateHash: badHash,
          }),
        });

        const res = await updateAssetRoute(req, { params: { submissionId: testId } });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.code).toBe('VALIDATION_ERROR');
        expect(json.message).toContain('expectedCurrentCellStateHash');
      }
    });

    it('rejects asset retry request when expectedCurrentCellStateHash does not match current cell state (409 OCC_CONFLICT)', async () => {
      const { expectedVersion } = await setupExistingRecord('DATA_URL_STORED_PENDING_AUTH');
      const staleHash = '0000000000000000000000000000000000000000000000000000000000000000';

      const req = new NextRequest(`http://localhost:3000/api/submissions/${testId}/asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'caseworker' },
        body: JSON.stringify({
          docType: 'signature',
          fileData: validDummyFileData,
          expectedVersion,
          expectedCurrentCellStateHash: staleHash,
        }),
      });

      const res = await updateAssetRoute(req, { params: { submissionId: testId } });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe('OCC_CONFLICT');
    });

    it('accepts valid asset retry request when expectedVersion and expectedCurrentCellStateHash match current state (200 OK)', async () => {
      // First create standard record via canonical adapter
      const payload = createSyntheticSubmissionPayload({
        uuid: 'test-occ-success-id',
        clientSubmissionId: 'test-occ-success-id',
      });
      MockSheetStore.setDriveFailure(true);
      await canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey: 'occ-succ-key',
        requestId: 'occ-succ-req',
      });
      MockSheetStore.setDriveFailure(false);

      const targetId = payload.uuid;
      const initialStored = MockSheetStore.findRecord(targetId);
      const initialCellVal = initialStored?.signature_data_url || '';
      const correctHash = crypto.createHash('sha256').update(initialCellVal.trim()).digest('hex');

      const req = new NextRequest(`http://localhost:3000/api/submissions/${targetId}/asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'caseworker' },
        body: JSON.stringify({
          docType: 'signature',
          fileData: validDummyFileData,
          expectedVersion: initialStored?.version || 1,
          expectedCurrentCellStateHash: correctHash,
        }),
      });

      const res = await updateAssetRoute(req, { params: { submissionId: targetId } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('success');
      expect(json.assetStatus).toBe('UPLOADED');
      expect(json.cellFormula).toMatch(/^=HYPERLINK/);
    });
  });
});
