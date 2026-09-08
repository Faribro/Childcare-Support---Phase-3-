/**
 * In-Memory Staging Sheet & OCC Audit Store for Local Development & Automated Integration Testing
 * Implements the exact canonical Apps Script data contracts and OCC guarantees.
 */

import { CompleteSubmissionPayload, PatchSubmissionPayload } from '@/lib/validations/submissionSchema';
import { calculateBMI, calculateGrantEntitlement, classifyNutritionStatus } from '@/lib/clinical/nutritionCalculations';

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
  caseworker_name: string;
  declaration_date: string;
  sync_state: 'SYNCED';
  raw_payload?: CompleteSubmissionPayload;
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

// Pre-populate with 5 baseline synthetic records matching linelist
const SEED_RECORDS: Array<Partial<StoredSheetRecord> & { _uuid: string; art_number: string; child_name: string }> = [
  {
    _uuid: 'e0111111-1111-4111-8111-111111111111',
    client_submission_id: 'e0111111-1111-4111-8111-111111111111',
    remote_submission_id: 'rem-001-pune',
    version: 1,
    art_number: 'MH-PUN-0842',
    child_name: 'Pooja Ramesh K.',
    dob: '2019-02-15',
    calculated_age: 7,
    gender: 'Female',
    district: 'Pune',
    caregiver_name: 'Ramesh K.',
    caregiver_relationship: 'Father',
    caregiverPhone: '9822011223',
    height_cm: 108,
    weight_kg: 13.5,
    muac_mm: 114,
    bilateral_pitting_oedema: false,
    bmi: 11.6,
    bmi_z_score: -3.2,
    nutrition_status: 'SAM (Severe Acute Malnutrition)',
    school_enrolled: true,
    school_grade: 'Standard 2',
    grant_recommended: true,
    recommended_grant_amount: 3500,
    sync_state: 'SYNCED',
    created_at: '2026-09-04T10:00:00.000Z',
    updated_at: '2026-09-04T10:00:00.000Z',
  },
  {
    _uuid: 'e0222222-2222-4222-8222-222222222222',
    client_submission_id: 'e0222222-2222-4222-8222-222222222222',
    remote_submission_id: 'rem-002-pune',
    version: 1,
    art_number: 'MH-PUN-0914',
    child_name: 'Aarav Sachin P.',
    dob: '2021-04-10',
    calculated_age: 5,
    gender: 'Male',
    district: 'Pune',
    caregiver_name: 'Kavita P.',
    caregiver_relationship: 'Mother',
    caregiverPhone: '9822022334',
    height_cm: 102,
    weight_kg: 14.1,
    muac_mm: 121,
    bilateral_pitting_oedema: false,
    bmi: 13.6,
    bmi_z_score: -2.1,
    nutrition_status: 'MAM (Moderate Acute Malnutrition)',
    school_enrolled: true,
    school_grade: 'Standard 1',
    grant_recommended: true,
    recommended_grant_amount: 3000,
    sync_state: 'SYNCED',
    created_at: '2026-09-05T11:30:00.000Z',
    updated_at: '2026-09-05T11:30:00.000Z',
  },
  {
    _uuid: 'e0333333-3333-4333-8333-333333333333',
    client_submission_id: 'e0333333-3333-4333-8333-333333333333',
    remote_submission_id: 'rem-003-mum',
    version: 1,
    art_number: 'MH-MUM-1102',
    child_name: 'Tanvi Dilip M.',
    dob: '2017-08-20',
    calculated_age: 9,
    gender: 'Female',
    district: 'Mumbai Suburban',
    caregiver_name: 'Dilip M.',
    caregiver_relationship: 'Father',
    caregiverPhone: '9822033445',
    height_cm: 125,
    weight_kg: 24.5,
    muac_mm: 148,
    bilateral_pitting_oedema: false,
    bmi: 15.7,
    bmi_z_score: 0.1,
    nutrition_status: 'Normal',
    school_enrolled: true,
    school_grade: 'Standard 4',
    grant_recommended: true,
    recommended_grant_amount: 2000,
    sync_state: 'SYNCED',
    created_at: '2026-09-06T09:15:00.000Z',
    updated_at: '2026-09-06T09:15:00.000Z',
  },
  {
    _uuid: 'e0444444-4444-4444-8444-444444444444',
    client_submission_id: 'e0444444-4444-4444-8444-444444444444',
    remote_submission_id: 'rem-004-thn',
    version: 1,
    art_number: 'MH-THN-0418',
    child_name: 'Omkar Suresh V.',
    dob: '2015-11-05',
    calculated_age: 11,
    gender: 'Male',
    district: 'Thane',
    caregiver_name: 'Sunita V.',
    caregiver_relationship: 'Mother',
    caregiverPhone: '9822044556',
    height_cm: 138,
    weight_kg: 31.0,
    muac_mm: 162,
    bilateral_pitting_oedema: false,
    bmi: 16.3,
    bmi_z_score: 0.2,
    nutrition_status: 'Normal',
    school_enrolled: true,
    school_grade: 'Standard 6',
    grant_recommended: true,
    recommended_grant_amount: 2000,
    sync_state: 'SYNCED',
    created_at: '2026-09-07T14:45:00.000Z',
    updated_at: '2026-09-07T14:45:00.000Z',
  },
  {
    _uuid: 'e0555555-5555-4555-8555-555555555555',
    client_submission_id: 'e0555555-5555-4555-8555-555555555555',
    remote_submission_id: 'rem-005-pune',
    version: 1,
    art_number: 'MH-PUN-1049',
    child_name: 'Rahul Manoj S.',
    dob: '2020-03-22',
    calculated_age: 6,
    gender: 'Male',
    district: 'Pune',
    caregiver_name: 'Manoj S.',
    caregiver_relationship: 'Father',
    caregiverPhone: '9822055667',
    height_cm: 105,
    weight_kg: 13.8,
    muac_mm: 112,
    bilateral_pitting_oedema: false,
    bmi: 12.5,
    bmi_z_score: -3.0,
    nutrition_status: 'SAM (Severe Acute Malnutrition)',
    school_enrolled: false,
    grant_recommended: true,
    recommended_grant_amount: 4500,
    sync_state: 'SYNCED',
    created_at: '2026-09-08T08:00:00.000Z',
    updated_at: '2026-09-08T08:00:00.000Z',
  },
];

// Initialize seed data once
for (const seed of SEED_RECORDS) {
  const full: StoredSheetRecord = {
    _uuid: seed._uuid!,
    client_submission_id: seed.client_submission_id || seed._uuid!,
    remote_submission_id: seed.remote_submission_id || `rem-${seed._uuid!.slice(0, 8)}`,
    version: seed.version || 1,
    idempotency_key: `seed-idem-${seed._uuid}`,
    created_at: seed.created_at || new Date().toISOString(),
    updated_at: seed.updated_at || new Date().toISOString(),
    interviewer_name: 'System Seeder',
    art_number: seed.art_number!,
    child_name: seed.child_name!,
    dob: seed.dob || '2019-01-01',
    calculated_age: seed.calculated_age || 7,
    gender: seed.gender || 'Female',
    caregiver_name: seed.caregiver_name || 'Caregiver',
    caregiver_relationship: seed.caregiver_relationship || 'Mother',
    caregiverPhone: seed.caregiverPhone || '9876543210',
    district: seed.district || 'Pune',
    orphan_status: 'None',
    primary_caregiver_occupation: 'Daily Wage',
    monthly_household_income: 5000,
    ration_card_type: 'BPL',
    number_of_siblings: 1,
    height_cm: seed.height_cm || 110,
    weight_kg: seed.weight_kg || 16,
    muac_mm: seed.muac_mm || 125,
    bilateral_pitting_oedema: seed.bilateral_pitting_oedema || false,
    bmi: seed.bmi || 13.2,
    bmi_z_score: seed.bmi_z_score || -1.5,
    nutrition_status: seed.nutrition_status || 'Normal',
    school_enrolled: seed.school_enrolled ?? true,
    school_grade: seed.school_grade || 'Standard 2',
    grant_recommended: seed.grant_recommended ?? true,
    recommended_grant_amount: seed.recommended_grant_amount || 3000,
    support_materials_needed: ['Stationery'],
    account_holder_name: seed.caregiver_name || 'Caregiver',
    bank_account_number: '123456789012',
    ifsc_code: 'SBIN0001234',
    bank_name: 'State Bank of India',
    branch_name: 'Main',
    passbook_photo_captured: true,
    caseworker_name: 'Caseworker',
    declaration_date: '2026-09-04',
    sync_state: 'SYNCED',
  };

  recordsByRemoteId.set(full.remote_submission_id, full);
  recordsByUuid.set(full._uuid, full);
  recordsByUuid.set(full.client_submission_id, full);
}

export const MockSheetStore = {
  /**
   * Reset store (useful between isolated tests)
   */
  reset() {
    recordsByRemoteId.clear();
    recordsByUuid.clear();
    idempotencyMap.clear();
    auditLogsByRemoteId.clear();
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
    return recordsByRemoteId.get(id) || recordsByUuid.get(id);
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
};
