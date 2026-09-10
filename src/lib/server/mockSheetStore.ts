/**
 * In-Memory Staging Sheet & OCC Audit Store for Local Development & Automated Integration Testing
 * Implements the exact canonical Apps Script data contracts and OCC guarantees.
 */

import { CompleteSubmissionPayload, PatchSubmissionPayload } from '@/lib/validations/submissionSchema';
import { calculateBMI, calculateGrantEntitlement, classifyNutritionStatus } from '@/lib/clinical/nutritionCalculations';
import {
  SAMPLE_PASSBOOK_SVG,
  SAMPLE_AADHAAR_SVG,
  SAMPLE_CHILD_PHOTO_SVG,
  SAMPLE_FEE_RECEIPT_SVG,
  SAMPLE_MARKSHEET_SVG,
  SAMPLE_CAREGIVER_SIGNATURE_SVG,
} from '@/lib/constants/sampleDocuments';

export interface StoredSheetRecord {
  _uuid: string;
  client_submission_id: string;
  remote_submission_id: string;
  version: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  interviewer_name: string;
  art_number: string;
  child_name: string;
  dob: string;
  calculated_age: number;
  gender: string;
  caregiver_name: string;
  caregiver_relationship: string;
  caregiverPhone: string;
  masked_aadhaar?: string;
  district: string;
  orphan_status: string;
  primary_caregiver_occupation: string;
  monthly_household_income: number;
  ration_card_type: string;
  number_of_siblings: number;
  height_cm: number;
  weight_kg: number;
  muac_mm?: number;
  bilateral_pitting_oedema: boolean;
  bmi: number;
  bmi_z_score: number;
  nutrition_status: string;
  clinical_notes?: string;
  school_enrolled: boolean;
  school_type?: string;
  school_grade?: string;
  attendance_percentage?: number;
  grant_recommended: boolean;
  recommended_grant_amount: number;
  support_materials_needed: string[];
  account_holder_name: string;
  bank_account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string;
  passbook_photo_captured: boolean;
  passbook_photo_url?: string;
  aadhaar_card_photo_url?: string;
  child_photo_url?: string;
  fee_receipt_photo_url?: string;
  marksheet_photo_url?: string;
  signature_data_url?: string;
  passbookPhotoUrl?: string;
  aadhaarCardPhotoUrl?: string;
  childPhotoUrl?: string;
  feeReceiptPhotoUrl?: string;
  marksheetPhotoUrl?: string;
  signatureDataUrl?: string;
  approved_alliance_india?: string;
  approvedAllianceIndia?: string;
  caseworker_name: string;
  declaration_date: string;
  sync_state: 'SYNCED';
  raw_payload?: CompleteSubmissionPayload;
  [key: string]: any;
}

export interface SheetAuditEvent {
  version: number;
  timestamp: string;
  actor: string;
  operation: 'CREATE' | 'UPDATE';
  changedFields: string[];
  requestId: string;
  previousVersion?: number;
}

export interface CreateRecordResult {
  status: string;
  acknowledged: boolean;
  remoteSubmissionId: string;
  clientSubmissionId: string;
  version: number;
  updatedAt: string;
  requestId: string;
  syncStatus: string;
  isDuplicate: boolean;
}

// In-memory sheet database singleton
const recordsByRemoteId = new Map<string, StoredSheetRecord>();
const recordsByUuid = new Map<string, StoredSheetRecord>();
const idempotencyMap = new Map<string, { remoteId: string; response: CreateRecordResult }>();
const auditLogsByRemoteId = new Map<string, SheetAuditEvent[]>();

function simulateDriveUrl(val?: string, assetName: string = 'asset'): string {
  if (!val) return '';
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  if (val.startsWith('data:')) {
    return `https://drive.google.com/file/d/staging-drive-${assetName}-${Date.now().toString(36)}/view`;
  }
  return val;
}


export const MockSheetStore = {
  /**
   * Reset store (useful between isolated tests)
   */
  /**
   * Delete Record
   */
  deleteRecord(id: string): boolean {
    let found = false;
    for (const [remoteId, rec] of recordsByRemoteId.entries()) {
      if (
        rec.remote_submission_id === id ||
        rec._uuid === id ||
        rec.client_submission_id === id ||
        rec.art_number === id
      ) {
        recordsByRemoteId.delete(remoteId);
        recordsByUuid.delete(rec._uuid);
        recordsByUuid.delete(rec.client_submission_id);
        auditLogsByRemoteId.delete(remoteId);
        found = true;
        break;
      }
    }
    return found;
  },

  reset() {
    recordsByRemoteId.clear();
    recordsByUuid.clear();
    idempotencyMap.clear();
    auditLogsByRemoteId.clear();
  },

  resetStore() {
    this.reset();
  },

  /**
   * Idempotent Create
   */
  createRecord(payload: CompleteSubmissionPayload, idempotencyKey: string, requestId: string): CreateRecordResult {
    // 1. Check idempotency key
    if (idempotencyMap.has(idempotencyKey)) {
      const cached = idempotencyMap.get(idempotencyKey)!;
      return { ...cached.response, isDuplicate: true };
    }

    // 2. Check if UUID or clientSubmissionId already exists
    const clientUuid = payload.uuid;
    const existing = recordsByUuid.get(clientUuid);
    if (existing) {
      const response = {
        status: 'success',
        acknowledged: true,
        remoteSubmissionId: existing.remote_submission_id,
        clientSubmissionId: existing.client_submission_id,
        version: existing.version,
        updatedAt: existing.updated_at,
        requestId,
        syncStatus: 'synced',
        isDuplicate: true,
      };
      idempotencyMap.set(idempotencyKey, { remoteId: existing.remote_submission_id, response });
      return response;
    }

    // 3. Compute clinical metrics
    const heightCm = payload.health?.heightCm ?? payload.nutrition?.heightCm ?? 100;
    const weightKg = payload.health?.weightKg ?? payload.nutrition?.weightKg ?? 15;
    const muacMm = payload.health?.muacMm ?? payload.nutrition?.muacMm;
    const bilateralPittingOedema = payload.health?.bilateralPittingOedema ?? payload.nutrition?.bilateralPittingOedema ?? false;
    const orphanStatus = payload.demographics?.orphanStatus ?? payload.household?.orphanStatus ?? 'Both parents alive';
    const schoolEnrolled = payload.educationStatus?.educationStatus === 'Currently going to school' || payload.education?.schoolEnrolled || true;
    const attendancePercentage = payload.educationStatus?.attendance === 'Regular' ? 90 : (payload.education?.attendancePercentage || 80);

    const nutrition = classifyNutritionStatus({
      ageYears: payload.demographics?.calculatedAgeYears || 6,
      heightCm,
      weightKg,
      muacMm,
      bilateralPittingOedema,
    });

    const grant = calculateGrantEntitlement({
      schoolEnrolled,
      attendancePercentage,
      nutritionStatus: nutrition.nutritionStatus,
      orphanStatus: orphanStatus as any,
    });

    const remoteSubmissionId = `rem-${clientUuid.slice(0, 8)}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const newRecord: StoredSheetRecord = {
      _uuid: clientUuid,
      client_submission_id: payload.clientSubmissionId || clientUuid,
      remote_submission_id: remoteSubmissionId,
      version: 1,
      idempotency_key: idempotencyKey,
      created_at: now,
      updated_at: now,
      interviewer_name: payload.interviewerName || payload.finalReview?.formSubmittedBy || 'Caseworker',
      art_number: payload.demographics.artNumber,
      child_name: payload.demographics.childName,
      dob: payload.demographics.dob,
      calculated_age: payload.demographics.calculatedAgeYears || 6,
      gender: payload.demographics.gender,
      caregiver_name: payload.demographics.caregiverName,
      caregiver_relationship: payload.demographics.caregiverRelationship,
      caregiverPhone: payload.demographics.contactNumber || payload.demographics.caregiverPhone || '',
      masked_aadhaar: payload.demographics.maskedAadhaar,
      district: payload.demographics.district,
      orphan_status: String(orphanStatus),
      primary_caregiver_occupation: payload.householdFinancial?.mainSourceOfIncome || payload.household?.primaryCaregiverOccupation || 'Daily wage labour',
      monthly_household_income: payload.householdFinancial?.monthlyIncomeRs ?? payload.household?.monthlyHouseholdIncome ?? 5000,
      ration_card_type: payload.household?.rationCardType || 'BPL',
      number_of_siblings: payload.householdFinancial?.numberOfChildrenUnder18 ?? payload.household?.numberOfSiblings ?? 1,
      height_cm: heightCm,
      weight_kg: weightKg,
      muac_mm: muacMm,
      bilateral_pitting_oedema: bilateralPittingOedema,
      bmi: nutrition.bmi,
      bmi_z_score: nutrition.bmiZScore,
      nutrition_status: nutrition.nutritionStatus,
      clinical_notes: payload.health?.clinicalNotes || payload.nutrition?.clinicalNotes,
      school_enrolled: schoolEnrolled,
      school_type: payload.educationStatus?.schoolType || payload.education?.schoolType,
      school_grade: payload.educationStatus?.currentClass || payload.education?.schoolGrade || 'Class 2',
      attendance_percentage: attendancePercentage,
      grant_recommended: grant.grantRecommended,
      recommended_grant_amount: payload.educationSupportRequired?.totalRequiredSupport || grant.recommendedGrantAmount,
      support_materials_needed: payload.education?.supportMaterialsNeeded || ['Books', 'Stationery'],
      account_holder_name: payload.bankingAndKyc?.bankAccountHolderName || payload.bankDetails?.accountHolderName || payload.demographics.caregiverName,
      bank_account_number: payload.bankingAndKyc?.bankAccountNumber || payload.bankDetails?.accountNumber || '123456789012',
      ifsc_code: payload.bankingAndKyc?.bankIfscCode || payload.bankDetails?.ifscCode || 'SBIN0001234',
      bank_name: payload.bankDetails?.bankName || 'State Bank of India',
      branch_name: payload.bankDetails?.branchName || 'Main',
      passbook_photo_captured: !!payload.bankingAndKyc?.passbookPhotoUrl || payload.bankDetails?.passbookPhotoCaptured || true,
      passbook_photo_url: simulateDriveUrl(payload.bankingAndKyc?.passbookPhotoUrl || (payload as any).passbookPhotoUrl, 'passbook'),
      aadhaar_card_photo_url: simulateDriveUrl(payload.bankingAndKyc?.aadhaarCardPhotoUrl || (payload as any).aadhaarCardPhotoUrl, 'aadhaar'),
      child_photo_url: simulateDriveUrl(payload.bankingAndKyc?.childPhotoUrl || (payload as any).childPhotoUrl, 'child-photo'),
      fee_receipt_photo_url: simulateDriveUrl(payload.educationExpenses?.feeReceiptPhotoUrl || (payload as any).feeReceiptPhotoUrl, 'fee-receipt'),
      marksheet_photo_url: simulateDriveUrl(payload.educationExpenses?.marksheetPhotoUrl || (payload as any).marksheetPhotoUrl, 'marksheet'),
      signature_data_url: simulateDriveUrl(payload.caregiverConsent?.signatureDataUrl || payload.consent?.signatureDataUrl || (payload as any).signatureDataUrl, 'caregiver-sig'),
      passbookPhotoUrl: simulateDriveUrl(payload.bankingAndKyc?.passbookPhotoUrl || (payload as any).passbookPhotoUrl, 'passbook'),
      aadhaarCardPhotoUrl: simulateDriveUrl(payload.bankingAndKyc?.aadhaarCardPhotoUrl || (payload as any).aadhaarCardPhotoUrl, 'aadhaar'),
      childPhotoUrl: simulateDriveUrl(payload.bankingAndKyc?.childPhotoUrl || (payload as any).childPhotoUrl, 'child-photo'),
      feeReceiptPhotoUrl: simulateDriveUrl(payload.educationExpenses?.feeReceiptPhotoUrl || (payload as any).feeReceiptPhotoUrl, 'fee-receipt'),
      marksheetPhotoUrl: simulateDriveUrl(payload.educationExpenses?.marksheetPhotoUrl || (payload as any).marksheetPhotoUrl, 'marksheet'),
      signatureDataUrl: simulateDriveUrl(payload.caregiverConsent?.signatureDataUrl || payload.consent?.signatureDataUrl || (payload as any).signatureDataUrl, 'caregiver-sig'),
      approved_alliance_india: payload.finalReview?.approvedAllianceIndia || (payload as any).approvedAllianceIndia || 'Pending',
      approvedAllianceIndia: payload.finalReview?.approvedAllianceIndia || (payload as any).approvedAllianceIndia || 'Pending',
      caseworker_name: payload.finalReview?.formSubmittedBy || payload.declaration?.caseworkerName || payload.interviewerName || 'Caseworker',
      declaration_date: payload.declaration?.declarationDate || now.split('T')[0],
      sync_state: 'SYNCED',
      raw_payload: payload,
    };

    recordsByRemoteId.set(remoteSubmissionId, newRecord);
    recordsByUuid.set(clientUuid, newRecord);
    if (payload.clientSubmissionId) {
      recordsByUuid.set(payload.clientSubmissionId, newRecord);
    }

    // Initial audit log
    auditLogsByRemoteId.set(remoteSubmissionId, [
      {
        version: 1,
        timestamp: now,
        actor: payload.interviewerName,
        operation: 'CREATE',
        changedFields: ['*'],
        requestId,
      },
    ]);

    const result = {
      status: 'success',
      acknowledged: true,
      remoteSubmissionId,
      clientSubmissionId: newRecord.client_submission_id,
      version: 1,
      updatedAt: now,
      requestId,
      syncStatus: 'synced',
      isDuplicate: false,
    };

    idempotencyMap.set(idempotencyKey, { remoteId: remoteSubmissionId, response: result });
    return result;
  },

  /**
   * Find record by remoteSubmissionId, clientSubmissionId, or _uuid
   */
  findRecord(id: string): StoredSheetRecord | undefined {
    const direct = recordsByRemoteId.get(id) || recordsByUuid.get(id);
    if (direct) return direct;
    return Array.from(recordsByRemoteId.values()).find(
      (r) => r.art_number === id || r.client_submission_id === id || r._uuid === id
    );
  },

  /**
   * List records with pagination
   */
  listRecords(options: { cursor?: string; limit?: number; status?: string; updatedAfter?: string }) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const all = Array.from(recordsByRemoteId.values());

    let filtered = all;
    if (options.status) {
      filtered = filtered.filter((r) => r.sync_state.toLowerCase() === options.status!.toLowerCase());
    }
    if (options.updatedAfter) {
      filtered = filtered.filter((r) => r.updated_at > options.updatedAfter!);
    }

    filtered.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    let startIndex = 0;
    if (options.cursor) {
      const idx = filtered.findIndex((r) => r.remote_submission_id === options.cursor || r.updated_at <= options.cursor!);
      if (idx !== -1) startIndex = idx;
    }

    const slice = filtered.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < filtered.length ? slice[slice.length - 1]?.remote_submission_id : null;

    return {
      records: slice,
      hasMore: startIndex + limit < filtered.length,
      nextCursor,
      totalCount: filtered.length,
    };
  },

  /**
   * Optimistic Concurrency Control PATCH
   */
  updateRecord(
    id: string,
    patch: PatchSubmissionPayload,
    actor: string,
    requestId: string
  ):
    | { success: true; record: StoredSheetRecord; version: number }
    | { success: false; conflict: true; currentVersion: number; expectedVersion: number }
    | { success: false; notFound: true } {
    const existing = recordsByRemoteId.get(id) || recordsByUuid.get(id);
    if (!existing) {
      return { success: false, notFound: true };
    }

    // OCC Version Check
    if (existing.version !== patch.expectedVersion) {
      return {
        success: false,
        conflict: true,
        currentVersion: existing.version,
        expectedVersion: patch.expectedVersion,
      };
    }

    const changedFields: string[] = [];
    const now = new Date().toISOString();

    // Apply only allowlisted editable fields
    if (patch.childName !== undefined && patch.childName !== existing.child_name) {
      existing.child_name = patch.childName;
      changedFields.push('childName');
    }
    if (patch.dob !== undefined && patch.dob !== existing.dob) {
      existing.dob = patch.dob;
      changedFields.push('dob');
    }
    if (patch.gender !== undefined && patch.gender !== existing.gender) {
      existing.gender = patch.gender;
      changedFields.push('gender');
    }
    if (patch.district !== undefined && patch.district !== existing.district) {
      existing.district = patch.district;
      changedFields.push('district');
    }
    if (patch.editReason !== undefined) {
      (existing as any).edit_reason = patch.editReason;
      changedFields.push('editReason');
    }
    if (patch.caregiverPhone !== undefined && patch.caregiverPhone !== existing.caregiverPhone) {
      existing.caregiverPhone = patch.caregiverPhone;
      changedFields.push('caregiverPhone');
    }
    if (patch.caregiverName !== undefined && patch.caregiverName !== existing.caregiver_name) {
      existing.caregiver_name = patch.caregiverName;
      changedFields.push('caregiverName');
    }
    if (patch.caregiverRelationship !== undefined && patch.caregiverRelationship !== existing.caregiver_relationship) {
      existing.caregiver_relationship = patch.caregiverRelationship;
      changedFields.push('caregiverRelationship');
    }
    if (patch.primaryCaregiverOccupation !== undefined && patch.primaryCaregiverOccupation !== existing.primary_caregiver_occupation) {
      existing.primary_caregiver_occupation = patch.primaryCaregiverOccupation;
      changedFields.push('primaryCaregiverOccupation');
    }
    if (patch.monthlyHouseholdIncome !== undefined && patch.monthlyHouseholdIncome !== existing.monthly_household_income) {
      existing.monthly_household_income = patch.monthlyHouseholdIncome;
      changedFields.push('monthlyHouseholdIncome');
    }
    if (patch.rationCardType !== undefined && patch.rationCardType !== existing.ration_card_type) {
      existing.ration_card_type = patch.rationCardType;
      changedFields.push('rationCardType');
    }
    if (patch.numberOfSiblings !== undefined && patch.numberOfSiblings !== existing.number_of_siblings) {
      existing.number_of_siblings = patch.numberOfSiblings;
      changedFields.push('numberOfSiblings');
    }
    if (patch.heightCm !== undefined && patch.heightCm !== existing.height_cm) {
      existing.height_cm = patch.heightCm;
      changedFields.push('heightCm');
    }
    if (patch.weightKg !== undefined && patch.weightKg !== existing.weight_kg) {
      existing.weight_kg = patch.weightKg;
      changedFields.push('weightKg');
    }
    if (patch.muacMm !== undefined && patch.muacMm !== existing.muac_mm) {
      existing.muac_mm = patch.muacMm;
      changedFields.push('muacMm');
    }
    if (patch.bilateralPittingOedema !== undefined && patch.bilateralPittingOedema !== existing.bilateral_pitting_oedema) {
      existing.bilateral_pitting_oedema = patch.bilateralPittingOedema;
      changedFields.push('bilateralPittingOedema');
    }
    if (patch.clinicalNotes !== undefined && patch.clinicalNotes !== existing.clinical_notes) {
      existing.clinical_notes = patch.clinicalNotes;
      changedFields.push('clinicalNotes');
    }
    if (patch.schoolEnrolled !== undefined && patch.schoolEnrolled !== existing.school_enrolled) {
      existing.school_enrolled = patch.schoolEnrolled;
      changedFields.push('schoolEnrolled');
    }
    if (patch.schoolType !== undefined && patch.schoolType !== existing.school_type) {
      existing.school_type = patch.schoolType;
      changedFields.push('schoolType');
    }
    if (patch.schoolGrade !== undefined && patch.schoolGrade !== existing.school_grade) {
      existing.school_grade = patch.schoolGrade;
      changedFields.push('schoolGrade');
    }
    if (patch.attendancePercentage !== undefined && patch.attendancePercentage !== existing.attendance_percentage) {
      existing.attendance_percentage = patch.attendancePercentage;
      changedFields.push('attendancePercentage');
    }
    if (patch.supportMaterialsNeeded !== undefined) {
      existing.support_materials_needed = patch.supportMaterialsNeeded;
      changedFields.push('supportMaterialsNeeded');
    }
    if (patch.accountHolderName !== undefined && patch.accountHolderName !== existing.account_holder_name) {
      existing.account_holder_name = patch.accountHolderName;
      changedFields.push('accountHolderName');
    }
    if (patch.accountNumber !== undefined && patch.accountNumber !== existing.bank_account_number) {
      existing.bank_account_number = patch.accountNumber;
      changedFields.push('accountNumber');
    }
    if (patch.ifscCode !== undefined && patch.ifscCode !== existing.ifsc_code) {
      existing.ifsc_code = patch.ifscCode;
      changedFields.push('ifscCode');
    }
    if (patch.bankName !== undefined && patch.bankName !== existing.bank_name) {
      existing.bank_name = patch.bankName;
      changedFields.push('bankName');
    }
    if (patch.branchName !== undefined && patch.branchName !== existing.branch_name) {
      existing.branch_name = patch.branchName;
      changedFields.push('branchName');
    }
    if (patch.passbookPhotoCaptured !== undefined && patch.passbookPhotoCaptured !== existing.passbook_photo_captured) {
      existing.passbook_photo_captured = patch.passbookPhotoCaptured;
      changedFields.push('passbookPhotoCaptured');
    }
    if (patch.passbookPhotoUrl !== undefined) {
      const url = simulateDriveUrl(patch.passbookPhotoUrl, 'passbook');
      existing.passbook_photo_url = url;
      existing.passbookPhotoUrl = url;
      changedFields.push('passbookPhotoUrl');
    }
    if (patch.aadhaarCardPhotoUrl !== undefined) {
      const url = simulateDriveUrl(patch.aadhaarCardPhotoUrl, 'aadhaar');
      existing.aadhaar_card_photo_url = url;
      existing.aadhaarCardPhotoUrl = url;
      changedFields.push('aadhaarCardPhotoUrl');
    }
    if (patch.childPhotoUrl !== undefined) {
      const url = simulateDriveUrl(patch.childPhotoUrl, 'child-photo');
      existing.child_photo_url = url;
      existing.childPhotoUrl = url;
      changedFields.push('childPhotoUrl');
    }
    if (patch.feeReceiptPhotoUrl !== undefined) {
      const url = simulateDriveUrl(patch.feeReceiptPhotoUrl, 'fee-receipt');
      existing.fee_receipt_photo_url = url;
      existing.feeReceiptPhotoUrl = url;
      changedFields.push('feeReceiptPhotoUrl');
    }
    if (patch.marksheetPhotoUrl !== undefined) {
      const url = simulateDriveUrl(patch.marksheetPhotoUrl, 'marksheet');
      existing.marksheet_photo_url = url;
      existing.marksheetPhotoUrl = url;
      changedFields.push('marksheetPhotoUrl');
    }
    if (patch.signatureDataUrl !== undefined) {
      const url = simulateDriveUrl(patch.signatureDataUrl, 'caregiver-sig');
      existing.signature_data_url = url;
      existing.signatureDataUrl = url;
      changedFields.push('signatureDataUrl');
    }
    if (patch.approvedAllianceIndia !== undefined) {
      existing.approved_alliance_india = patch.approvedAllianceIndia;
      existing.approvedAllianceIndia = patch.approvedAllianceIndia;
      if (existing.raw_payload) {
        if (!existing.raw_payload.finalReview) {
          existing.raw_payload.finalReview = {} as any;
        }
        (existing.raw_payload.finalReview as any).approvedAllianceIndia = patch.approvedAllianceIndia;
      }
      changedFields.push('approvedAllianceIndia');
    }

    // Recompute clinical triage and grant if anthropometry or education changed
    if (changedFields.some((f) => ['heightCm', 'weightKg', 'muacMm', 'bilateralPittingOedema'].includes(f))) {
      const rec = classifyNutritionStatus({
        ageYears: existing.calculated_age,
        heightCm: existing.height_cm,
        weightKg: existing.weight_kg,
        muacMm: existing.muac_mm,
        bilateralPittingOedema: existing.bilateral_pitting_oedema,
      });
      existing.bmi = rec.bmi;
      existing.bmi_z_score = rec.bmiZScore;
      existing.nutrition_status = rec.nutritionStatus;
    }

    if (changedFields.some((f) => ['schoolEnrolled', 'attendancePercentage', 'heightCm', 'weightKg'].includes(f))) {
      const grant = calculateGrantEntitlement({
        schoolEnrolled: existing.school_enrolled,
        attendancePercentage: existing.attendance_percentage || 0,
        nutritionStatus: existing.nutrition_status as any,
        orphanStatus: existing.orphan_status as any,
      });
      existing.grant_recommended = grant.grantRecommended;
      existing.recommended_grant_amount = grant.recommendedGrantAmount;
    }

    const prevVersion = existing.version;
    existing.version = prevVersion + 1;
    existing.updated_at = now;

    // Record audit event
    const logs = auditLogsByRemoteId.get(existing.remote_submission_id) || [];
    logs.unshift({
      version: existing.version,
      timestamp: now,
      actor: actor || 'Caseworker',
      operation: 'UPDATE',
      changedFields,
      requestId,
      previousVersion: prevVersion,
    });
    auditLogsByRemoteId.set(existing.remote_submission_id, logs);

    return {
      success: true,
      record: existing,
      version: existing.version,
    };
  },

  /**
   * Get audit log history
   */
  getHistory(remoteId: string): SheetAuditEvent[] {
    return auditLogsByRemoteId.get(remoteId) || [];
  },

  /**
   * Return number of records in store
   */
  recordCount(): number {
    return recordsByRemoteId.size;
  },

  /**
   * Seed 5 diverse realistic synthetic records conforming to the 73-column schema
   */
  seedDefaultRecords() {
    if (recordsByRemoteId.size > 0) return;

    const baseRecords = [
      {
        uniqueId: 'WB-KOL-081200-01',
        childName: 'Rohit Yadav',
        interviewer: 'Juli Yadav',
        visitDate: '2026-06-25',
        dob: '2010-04-14',
        age: 16,
        gender: 'Male',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Juli Yadav',
        caregiverRelation: 'Mother',
        caregiverContact: '9830192840',
        address: '15/1, Sujendra Seth Lane, Kolkata - 700006',
        state: 'West Bengal',
        district: 'Kolkata',
        bankAccountHolder: 'Juli Yadav',
        bankAccountNo: '30928172645',
        ifsc: 'SBIN0000123',
        aadhaar: 'XXXX-XXXX-1234',
        income: 6000,
        incomeSource: 'Domestic worker',
        weight: 38,
        height: 172,
        bmi: 12.8,
        bmiCat: 'Severe Underweight',
        hb: '11.5',
        hbCat: 'Normal',
        artStatus: 'On ART',
        artNumber: 'WB-KOL-081200-01',
        viralLoad: '1250',
        vlCat: 'Unsuppressed (≥1000 copies/mL)',
        educationStatus: 'Currently going to school',
        schoolType: 'Government school',
        schoolGrade: 'Class 10',
        attendance: 'Regular',
        grant: 12000,
        approved: 'Approved',
        passbook: SAMPLE_PASSBOOK_SVG,
        aadhaarDoc: SAMPLE_AADHAAR_SVG,
        childPhoto: SAMPLE_CHILD_PHOTO_SVG,
        feeReceipt: SAMPLE_FEE_RECEIPT_SVG,
        marksheet: SAMPLE_MARKSHEET_SVG,
        sig: SAMPLE_CAREGIVER_SIGNATURE_SVG,
        timestamp: '2026-06-25T10:30:00.000Z',
      },
      {
        uniqueId: 'MH-PUN-081200-02',
        childName: 'Puja Saha',
        interviewer: 'Anil Deshmukh',
        visitDate: '2026-06-26',
        dob: '2012-02-18',
        age: 14,
        gender: 'Female',
        orphanStatus: 'Single orphan (mother alive)',
        caregiverName: 'Meena Saha',
        caregiverRelation: 'Mother',
        caregiverContact: '9822019283',
        address: '24/B Mangalwar Peth, Pune - 411011',
        state: 'Maharashtra',
        district: 'Pune',
        bankAccountHolder: 'Meena Saha',
        bankAccountNo: '40928183921',
        ifsc: 'MAHB0000456',
        aadhaar: 'XXXX-XXXX-2345',
        income: 4500,
        incomeSource: 'Tailoring',
        weight: 32,
        height: 150,
        bmi: 14.2,
        bmiCat: 'Moderate Underweight',
        hb: '9.2',
        hbCat: 'Moderate Anemia',
        artStatus: 'On ART',
        artNumber: 'MH-PUN-081200-02',
        viralLoad: '450',
        vlCat: 'Suppressed (<1000 copies/mL)',
        educationStatus: 'Not In School',
        schoolType: 'Not In School',
        schoolGrade: 'Dropped out',
        attendance: 'Irregular',
        grant: 8000,
        approved: 'Pending',
        passbook: SAMPLE_PASSBOOK_SVG,
        aadhaarDoc: SAMPLE_AADHAAR_SVG,
        childPhoto: SAMPLE_CHILD_PHOTO_SVG,
        feeReceipt: '',
        marksheet: '',
        sig: SAMPLE_CAREGIVER_SIGNATURE_SVG,
        timestamp: '2026-06-26T11:15:00.000Z',
      },
      {
        uniqueId: 'DL-CEN-081200-03',
        childName: 'Aarav Jadhav',
        interviewer: 'Pooja Verma',
        visitDate: '2026-06-27',
        dob: '2018-08-10',
        age: 8,
        gender: 'Male',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Kavita Jadhav',
        caregiverRelation: 'Mother',
        caregiverContact: '9811092831',
        address: 'B-12 Paharganj, New Delhi - 110055',
        state: 'Delhi',
        district: 'Central Delhi',
        bankAccountHolder: 'Kavita Jadhav',
        bankAccountNo: '50192847291',
        ifsc: 'PUNB0000789',
        aadhaar: 'XXXX-XXXX-3456',
        income: 8000,
        incomeSource: 'Retail shop worker',
        weight: 24,
        height: 122,
        bmi: 16.1,
        bmiCat: 'Normal',
        hb: '12.0',
        hbCat: 'Normal',
        artStatus: 'On ART',
        artNumber: 'DL-CEN-081200-03',
        viralLoad: 'Undetectable (<50 copies/mL)',
        vlCat: 'Undetectable (<50 copies/mL)',
        educationStatus: 'Currently going to school',
        schoolType: 'Government-aided school',
        schoolGrade: 'Class 3',
        attendance: 'Regular',
        grant: 6000,
        approved: 'Pending',
        passbook: SAMPLE_PASSBOOK_SVG,
        aadhaarDoc: SAMPLE_AADHAAR_SVG,
        childPhoto: SAMPLE_CHILD_PHOTO_SVG,
        feeReceipt: '', // intentionally missing fee receipt
        marksheet: SAMPLE_MARKSHEET_SVG,
        sig: SAMPLE_CAREGIVER_SIGNATURE_SVG,
        timestamp: '2026-06-27T09:45:00.000Z',
      },
      {
        uniqueId: 'KA-BLR-081200-04',
        childName: 'Siddharth Patil',
        interviewer: 'Ramesh Gowda',
        visitDate: '2026-06-28',
        dob: '2014-05-22',
        age: 12,
        gender: 'Male',
        orphanStatus: 'Double orphan',
        caregiverName: 'Shanta Patil',
        caregiverRelation: 'Grandmother',
        caregiverContact: '9845019284',
        address: '45, 3rd Cross, Malleshwaram, Bengaluru - 560003',
        state: 'Karnataka',
        district: 'Bengaluru',
        bankAccountHolder: 'Shanta Patil',
        bankAccountNo: '60192847192',
        ifsc: 'CNRB0000321',
        aadhaar: 'XXXX-XXXX-4567',
        income: 3000,
        incomeSource: 'Pension',
        weight: 25,
        height: 140,
        bmi: 12.8,
        bmiCat: 'Severe Underweight',
        hb: '6.8',
        hbCat: 'Severe Anemia',
        artStatus: 'On ART',
        artNumber: 'KA-BLR-081200-04',
        viralLoad: '3400',
        vlCat: 'Unsuppressed (≥1000 copies/mL)',
        educationStatus: 'Currently going to school',
        schoolType: 'Government school',
        schoolGrade: 'Class 6',
        attendance: 'Regular',
        grant: 15000,
        approved: 'Approved',
        passbook: SAMPLE_PASSBOOK_SVG,
        aadhaarDoc: SAMPLE_AADHAAR_SVG,
        childPhoto: SAMPLE_CHILD_PHOTO_SVG,
        feeReceipt: SAMPLE_FEE_RECEIPT_SVG,
        marksheet: SAMPLE_MARKSHEET_SVG,
        sig: SAMPLE_CAREGIVER_SIGNATURE_SVG,
        timestamp: '2026-06-28T14:20:00.000Z',
      },
      {
        uniqueId: 'TN-CHE-081200-05',
        childName: 'Ananya Shinde',
        interviewer: 'Lakshmi Narayanan',
        visitDate: '2026-06-29',
        dob: '2016-11-04',
        age: 10,
        gender: 'Female',
        orphanStatus: 'Single orphan (father alive)',
        caregiverName: 'Ganesh Shinde',
        caregiverRelation: 'Father',
        caregiverContact: '9840019285',
        address: '12 Royapettah High Rd, Chennai - 600014',
        state: 'Tamil Nadu',
        district: 'Chennai',
        bankAccountHolder: 'Ganesh Shinde',
        bankAccountNo: '70192847183',
        ifsc: 'IOBA0000654',
        aadhaar: 'XXXX-XXXX-5678',
        income: 5500,
        incomeSource: 'Auto driver',
        weight: 30,
        height: 135,
        bmi: 16.5,
        bmiCat: 'Normal',
        hb: '12.2',
        hbCat: 'Normal',
        artStatus: 'On ART',
        artNumber: 'TN-CHE-081200-05',
        viralLoad: '< 50 copies/mL',
        vlCat: 'Undetectable (<50 copies/mL)',
        educationStatus: 'Not In School',
        schoolType: 'Not In School',
        schoolGrade: 'Not enrolled',
        attendance: 'None',
        grant: 7500,
        approved: 'Pending',
        passbook: SAMPLE_PASSBOOK_SVG,
        aadhaarDoc: SAMPLE_AADHAAR_SVG,
        childPhoto: SAMPLE_CHILD_PHOTO_SVG,
        feeReceipt: '',
        marksheet: '',
        sig: '', // intentionally missing consent signature
        timestamp: '2026-06-29T16:00:00.000Z',
      },
    ];

    for (const b of baseRecords) {
      const rec: StoredSheetRecord = {
        _uuid: b.uniqueId,
        client_submission_id: b.uniqueId,
        remote_submission_id: `rem-${b.uniqueId.toLowerCase()}`,
        version: 1,
        idempotency_key: `seed-idemp-${b.uniqueId}`,
        created_at: b.timestamp,
        updated_at: b.timestamp,
        interviewer_name: b.interviewer,
        art_number: b.artNumber,
        child_name: b.childName,
        dob: b.dob,
        calculated_age: b.age,
        gender: b.gender,
        caregiver_name: b.caregiverName,
        caregiver_relationship: b.caregiverRelation,
        caregiverPhone: b.caregiverContact,
        masked_aadhaar: b.aadhaar,
        district: b.district,
        orphan_status: b.orphanStatus,
        primary_caregiver_occupation: b.incomeSource,
        monthly_household_income: b.income,
        ration_card_type: 'BPL',
        number_of_siblings: 1,
        height_cm: b.height,
        weight_kg: b.weight,
        bilateral_pitting_oedema: false,
        bmi: b.bmi,
        bmi_z_score: 0,
        nutrition_status: b.bmiCat,
        school_enrolled: b.educationStatus.includes('going'),
        school_type: b.schoolType,
        school_grade: b.schoolGrade,
        attendance_percentage: b.attendance === 'Regular' ? 90 : 60,
        grant_recommended: true,
        recommended_grant_amount: b.grant,
        support_materials_needed: [],
        account_holder_name: b.bankAccountHolder,
        bank_account_number: b.bankAccountNo,
        ifsc_code: b.ifsc,
        bank_name: 'Nationalized Bank',
        branch_name: b.district,
        passbook_photo_captured: Boolean(b.passbook),
        passbook_photo_url: b.passbook,
        aadhaar_card_photo_url: b.aadhaarDoc,
        child_photo_url: b.childPhoto,
        fee_receipt_photo_url: b.feeReceipt,
        marksheet_photo_url: b.marksheet,
        signature_data_url: b.sig,
        passbookPhotoUrl: b.passbook,
        aadhaarCardPhotoUrl: b.aadhaarDoc,
        childPhotoUrl: b.childPhoto,
        feeReceiptPhotoUrl: b.feeReceipt,
        marksheetPhotoUrl: b.marksheet,
        signatureDataUrl: b.sig,
        approved_alliance_india: b.approved,
        approvedAllianceIndia: b.approved,
        caseworker_name: b.interviewer,
        declaration_date: b.visitDate,
        sync_state: 'SYNCED',
        // Exact 73-Column Sheet Fields for full compatibility
        '1\nUnique ID': b.uniqueId,
        '2\nRevision Number': 1,
        '3\nSubmission Time': b.timestamp,
        '4\nSubmitted By': b.interviewer,
        '5\nConsent Obtained': 'Yes',
        '6\nSignature /\nThumb Impression': b.sig,
        '7\nVisit Date': b.visitDate,
        '8\nInterviewer Name': b.interviewer,
        '9\nChild Name': b.childName,
        '10\nDate of Birth': b.dob,
        '11\nAge': b.age,
        '12\nGender': b.gender,
        '13\nOrphan Status': b.orphanStatus,
        '14\nCaregiver Full Name': b.caregiverName,
        '15\nCaregiver Relation': b.caregiverRelation,
        '16\nCaregiver Contact': b.caregiverContact,
        '17\nAddress': b.address,
        '18\nState': b.state,
        '19\nDistrict': b.district,
        '20\nBank Account Holder Name': b.bankAccountHolder,
        '21\nBank Account Number': b.bankAccountNo,
        '22\nBank IFSC Code': b.ifsc,
        '23\nBank Linked Mobile Number': b.caregiverContact,
        '24\nChild Aadhaar Number': b.aadhaar,
        '25\nPassbook Front Page Link': b.passbook,
        '26\nAadhaar Card Link': b.aadhaarDoc,
        '27\nPassport Size Photo Link': b.childPhoto,
        '30\nMonthly Income': b.income,
        '31\nIncome Source': b.incomeSource,
        '32\nCurrent Weight (kg)': b.weight,
        '33\nCurrent Height (cm)': b.height,
        '34\nBMI': b.bmi,
        '35\nBMI Category': b.bmiCat,
        '36\nHemoglobin (g/dL)': b.hb,
        '37\nHb Category': b.hbCat,
        '40\nART Status': b.artStatus,
        '42\nART ID Number': b.artNumber,
        '45\nViral Load': b.viralLoad,
        '46\nVL Category': b.vlCat,
        '49\nEducation Status': b.educationStatus,
        '53\nSchool Type': b.schoolType,
        '54\nCurrent Class': b.schoolGrade,
        '55\nAttendance Status': b.attendance,
        '63\nTotal Annual Education Cost': b.grant,
        '64\nSchool Fee Receipt Link': b.feeReceipt,
        '65\nMarksheet Photo Link': b.marksheet,
        '67\nApproved Alliance India': b.approved,
        '72\nSignature Link': b.sig,
        '73\nLast Updated': b.timestamp,
      };

      recordsByRemoteId.set(rec.remote_submission_id, rec);
      recordsByUuid.set(rec._uuid, rec);
      recordsByUuid.set(rec.client_submission_id, rec);
    }
  },
};

// Auto-seed default synthetic records on module initialization
MockSheetStore.seedDefaultRecords();

