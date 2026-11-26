/**
 * Canonical 83-Column Sheet Mirror Row Hash & Version Integrity Utilities
 *
 * Computes a deterministic SHA-256 `rowHash` across all 83 Sheet columns plus
 * soft-delete tombstone markers (`isDeleted`, `deletedAt`) so Firestore and
 * Google Apps Script Nightly Reconciliation produce identical hashes for in-sync rows.
 *
 * SECURITY & INTEGRITY INVARIANT:
 * - Every submission write/update/asset/soft-delete/restore/sync-mark path MUST pass
 *   through `stampSubmissionRowIntegrity()` so `rowVersion` and `rowHash` never drift stale.
 */

import crypto from 'crypto';

export const SHEET_TOTAL_COLUMNS = 83;

/** 0-based indices for Google Drive document hyperlink columns (1-based: 6, 25, 26, 27, 64, 65). */
export const SHEET_DOC_COL_ZERO_INDICES = new Set<number>([5, 24, 25, 26, 63, 64]);

function isNonEmptyValue(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function pickFirst(record: Record<string, any>, ...values: unknown[]): unknown {
  for (const val of values) {
    if (isNonEmptyValue(val)) return val;
  }
  return '';
}

function asTrimmedString(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ');
  return String(val).replace(/\r\n/g, '\n').trim();
}

function asNumberOrZeroString(val: unknown): string {
  if (val === undefined || val === null || val === '') return '0';
  const n = Number(val);
  return Number.isFinite(n) ? String(n) : '0';
}

/**
 * Extracts a normalized `drive:<fileId>` identifier from a Google Drive URL or
 * Sheet `=HYPERLINK(...)` formula so Firestore doc references and Sheet formulas
 * hash identically.
 */
export function extractCanonicalDriveFileId(rawValue: unknown): string {
  const s = asTrimmedString(rawValue);
  if (!s) return '';

  const hyperlinkMatch = s.match(/=HYPERLINK\(\s*"([^"]+)"/i);
  const urlCandidate = hyperlinkMatch ? hyperlinkMatch[1] : s;

  const filePathMatch = urlCandidate.match(/\/file\/d\/([a-zA-Z0-9_-]{8,})/);
  if (filePathMatch) {
    return `drive:${filePathMatch[1]}`;
  }

  const queryIdMatch = urlCandidate.match(/[?&]id=([a-zA-Z0-9_-]{8,})/);
  if (queryIdMatch) {
    return `drive:${queryIdMatch[1]}`;
  }

  return s;
}

/**
 * Normalizes any individual cell value/formula at 0-based column index `colIdx`
 * for canonical hashing.
 */
export function normalizeCellForRowHash(colIdx: number, val: unknown, formula?: string): string {
  if (SHEET_DOC_COL_ZERO_INDICES.has(colIdx)) {
    const formulaId = formula ? extractCanonicalDriveFileId(formula) : '';
    if (formulaId.startsWith('drive:')) return formulaId;
    const valueId = extractCanonicalDriveFileId(val);
    if (valueId) return valueId;
    return asTrimmedString(formula || val);
  }
  return asTrimmedString(val);
}

/**
 * Builds the canonical 83-element normalized string array mirroring `COLUMN_HEADERS`
 * in `gas/Code.js` from a Firestore or Mock submission record.
 */
export function buildCanonicalSheetColumns(doc: Record<string, any>): string[] {
  const p = (doc?.payload && typeof doc.payload === 'object' ? doc.payload : doc) || {};
  const d = p.demographics || p.childProfile || {};
  const h = p.health || p.clinicalAssessment || p.clinical || {};
  const n = p.nutrition || (p.clinicalAssessment && p.clinicalAssessment.appetite ? p.clinicalAssessment : {});
  const e = p.educationStatus || p.educationSupport || p.education || {};
  const exp = p.educationExpenses || (p.educationSupport && (p.educationSupport.annualExpenses || p.educationSupport)) || {};
  const b = p.bankingAndKyc || p.bankDetails || p.caregiverHousehold || {};
  const hf = p.householdFinancial || {};
  const f = p.finalReview || p.remarksReview || {};

  const consentGiven =
    (p.consent && (p.consent.agreeToParticipate || p.consent.consentGiven)) ||
    (p.caregiverConsent && p.caregiverConsent.consentGiven) ||
    p.consentObtained === 'Yes' ||
    doc.consentObtained === 'Yes' ||
    doc['5\nConsent Obtained'] === 'Yes';

  const sigRaw = pickFirst(
    doc,
    p.signatureDataUrl,
    p.signatureLink,
    doc.signatureDataUrl,
    doc.signature_data_url,
    doc['6\nSignature /\nThumb Impression'],
    p.consent?.signatureDataUrl,
    p.caregiverConsent?.signatureDataUrl,
    p.signatureUrl,
    p.caregiverConsent?.signatureUrl,
    p.signatureStatus
  );
  const sigCell = sigRaw ? asTrimmedString(sigRaw) : consentGiven ? 'CAPTURED_LOCAL' : 'Not Submitted';

  const rawCols: unknown[] = new Array(SHEET_TOTAL_COLUMNS).fill('');
  rawCols[0] = pickFirst(doc, doc.uniqueId, p.uniqueId, doc['1\nUnique ID'], doc['1\nUnique Identifier'], doc.art_number, p.artNumber, d.artNumber, doc.clientSubmissionId, doc.id);
  rawCols[1] = pickFirst(doc, doc.revisionNumber, doc.version, doc['2\nRevision Number'], 1);
  rawCols[2] = pickFirst(doc, doc.submissionTime, p.submissionTime, doc.createdAt, doc.created_at, doc['3\nSubmission Time']);
  rawCols[3] = pickFirst(doc, f.formSubmittedBy, p.formSubmittedBy, doc.submittedBy, p.interviewerName, doc.interviewer_name, doc['4\nSubmitted By']);
  rawCols[4] = consentGiven ? 'Yes' : 'No';
  rawCols[5] = sigCell;
  rawCols[6] = pickFirst(doc, p.visitDate, doc.visitDate, d.dateOfFilling, doc['7\nVisit Date']);
  rawCols[7] = pickFirst(doc, p.interviewerName, f.formSubmittedBy, doc.interviewer_name, doc['8\nInterviewer Name']);
  rawCols[8] = pickFirst(doc, doc.childName, p.childName, d.childName, doc.child_name, doc['9\nChild Name']);
  rawCols[9] = pickFirst(doc, p.dob, doc.dob, d.dob, doc['10\nDate of Birth']);
  rawCols[10] = pickFirst(doc, p.age, p.calculatedAgeYears, doc.age, d.calculatedAgeYears, doc.calculated_age, doc['11\nAge']);
  rawCols[11] = pickFirst(doc, p.gender, doc.gender, d.gender, doc['12\nGender']);
  rawCols[12] = pickFirst(doc, p.orphanStatus, d.orphanStatus, doc.orphan_status, doc['13\nOrphan Status']);
  rawCols[13] = pickFirst(doc, p.caregiverFullName, p.caregiverName, doc.caregiverName, d.caregiverName, doc.caregiver_name, doc['14\nCaregiver Full Name']);
  rawCols[14] = pickFirst(doc, p.caregiverRelation, p.caregiverRelationship, d.caregiverRelationship, doc.caregiver_relationship, doc['15\nCaregiver Relation']);
  rawCols[15] = pickFirst(doc, p.caregiverContact, p.caregiverPhone, doc.caregiverPhone, d.contactNumber, d.caregiverPhone, doc['16\nCaregiver Contact']);
  rawCols[16] = pickFirst(doc, p.address, doc.address, d.fullAddress, doc['17\nAddress']);
  rawCols[17] = pickFirst(doc, doc.state, p.state, d.state, doc['18\nState']);
  rawCols[18] = pickFirst(doc, doc.district, p.district, d.district, doc['19\nDistrict']);
  rawCols[19] = pickFirst(doc, p.bankAccountHolderName, p.accountHolderName, b.bankAccountHolderName, b.accountHolderName, doc.account_holder_name, doc['20\nBank Account Holder Name']);
  rawCols[20] = pickFirst(doc, p.bankAccountNumber, p.bankAccountNo, b.bankAccountNumber, b.accountNumber, doc.bank_account_number, doc['21\nBank Account Number']);
  rawCols[21] = pickFirst(doc, p.bankIfscCode, p.bankIfsc, p.ifsc, p.ifscCode, b.bankIfscCode, b.ifscCode, doc.ifsc_code, doc['22\nBank IFSC Code']);
  rawCols[22] = pickFirst(doc, p.bankLinkedMobileNumber, p.bankMobile, b.bankLinkedMobileNumber, doc['23\nBank Linked Mobile Number']);
  rawCols[23] = pickFirst(doc, p.childAadhaarNumber, d.childAadhaarNumber, b.childAadhaarNumber, doc.masked_aadhaar, doc['24\nChild Aadhaar Number']);
  rawCols[24] = pickFirst(doc, doc.passbookPhotoUrl, p.passbookPhotoUrl, p.passbookFrontPageLink, b.passbookPhotoUrl, d.passbookPhotoUrl, doc.passbook_photo_url, doc['25\nPassbook Front Page Link']) || 'Not Submitted';
  rawCols[25] = pickFirst(doc, doc.aadhaarCardPhotoUrl, p.aadhaarCardPhotoUrl, p.aadhaarCardLink, b.aadhaarCardPhotoUrl, d.aadhaarCardPhotoUrl, doc.aadhaar_card_photo_url, doc['26\nAadhaar Card Link']) || 'Not Submitted';
  rawCols[26] = pickFirst(doc, doc.childPhotoUrl, p.childPhotoUrl, p.passportSizePhotoLink, b.childPhotoUrl, b.passportSizePhotoUrl, d.childPhotoUrl, d.passportSizePhotoUrl, doc.child_photo_url, doc['27\nPassport Size Photo Link']) || 'Not Submitted';
  rawCols[27] = pickFirst(doc, p.householdMembers, hf.totalFamilyMembers, doc['28\nHousehold Members']);
  rawCols[28] = pickFirst(doc, p.noOfChildren, p.numberOfSiblings, hf.numberOfChildrenUnder18, doc.number_of_siblings, doc['29\nNo of Children']);
  rawCols[29] = pickFirst(doc, p.monthlyIncome, p.monthlyHouseholdIncome, hf.monthlyIncomeRs, doc.monthly_household_income, doc['30\nMonthly Income']);
  rawCols[30] = pickFirst(doc, p.incomeSource, p.primaryCaregiverOccupation, hf.mainSourceOfIncome, doc.primary_caregiver_occupation, doc['31\nIncome Source']);
  rawCols[31] = pickFirst(doc, p.currentWeightKg, p.weightKg, doc.weightKg, h.weightKg, n.weightKg, doc.weight_kg, doc['32\nCurrent Weight (kg)']);
  rawCols[32] = pickFirst(doc, p.currentHeightCm, p.heightCm, doc.heightCm, h.heightCm, n.heightCm, doc.height_cm, doc['33\nCurrent Height (cm)']);
  rawCols[33] = pickFirst(doc, p.bmi, doc.bmi, h.bmi, n.bmi, doc['34\nBMI']);
  rawCols[34] = pickFirst(doc, p.bmiCategory, p.nutritionStatus, doc.nutrition_status, h.bmiCategory, h.nutritionStatus, n.nutritionStatus, doc['35\nBMI Category']);
  rawCols[35] = pickFirst(doc, p.hemoglobinGdl, p.hb, h.haemoglobinGdl, doc['36\nHemoglobin (g/dL)']);
  rawCols[36] = pickFirst(doc, p.hbCategory, h.hbCategory, doc['37\nHb Category']);
  rawCols[37] = pickFirst(doc, p.comorbidities, h.otherHealthConditions, doc['38\nComorbidities']);
  rawCols[38] = pickFirst(doc, p.comorbiditiesOther, h.otherHealthConditionSpecify, doc['39\nComorbidities Other']);
  rawCols[39] = pickFirst(doc, doc.artStatus, p.artStatus, h.artStatus, doc['40\nART Status']);
  rawCols[40] = pickFirst(doc, p.artRegistrationDate, p.artInitiationDate, h.artInitiationDate, h.artRegistrationDate, doc['41\nART Registration Date']);
  rawCols[41] = pickFirst(doc, p.artIdNumber, h.artIdNumber, doc.art_number, doc['42\nART ID Number']);
  rawCols[42] = pickFirst(doc, doc.vlStatus, p.vlStatus, h.vlStatus, doc['43\nVL Status']);
  rawCols[43] = pickFirst(doc, p.vlDate, h.vlDate, doc['44\nVL Date']);
  rawCols[44] = pickFirst(doc, p.viralLoad, h.viralLoad, doc['45\nViral Load']);
  rawCols[45] = pickFirst(doc, p.vlCategory, h.vlCategory, doc['46\nVL Category']);
  rawCols[46] = pickFirst(doc, p.appetite, n.appetite, doc['47\nAppetite']);
  rawCols[47] = pickFirst(doc, p.mealsPerDay, n.mealsPerDay, doc['48\nMeals per Day']);
  rawCols[48] = pickFirst(doc, p.educationStatus, e.educationStatus, doc['49\nEducation Status']);
  rawCols[49] = pickFirst(doc, p.educationStatusOther, e.educationStatusSpecify, doc['50\nEducation Status Other']);
  rawCols[50] = pickFirst(doc, p.schoolName, e.schoolName, doc['51\nSchool Name']);
  rawCols[51] = pickFirst(doc, p.schoolSessionStartDate, e.schoolSessionStartDate, doc['52\nSchool Session Start Date']);
  rawCols[52] = pickFirst(doc, p.schoolType, e.schoolType, doc.school_type, doc['53\nSchool Type']);
  rawCols[53] = pickFirst(doc, p.currentClass, p.schoolGrade, e.currentClass, doc.school_grade, doc['54\nCurrent Class']);
  rawCols[54] = pickFirst(doc, doc.attendanceStatus, p.attendanceStatus, e.attendance, doc['55\nAttendance Status']);
  rawCols[55] = asNumberOrZeroString(p.schoolFees ?? exp.schoolFees ?? doc['56\nSchool Fees']);
  rawCols[56] = asNumberOrZeroString(p.tuitionFees ?? exp.tuitionFees ?? doc['57\nPrivate Tuition Fee']);
  rawCols[57] = asNumberOrZeroString(p.books ?? exp.books ?? doc['58\nSchool Books']);
  rawCols[58] = asNumberOrZeroString(p.stationery ?? exp.stationery ?? doc['59\nSchool Stationery']);
  rawCols[59] = asNumberOrZeroString(p.uniform ?? exp.uniform ?? doc['60\nSchool Uniform']);
  rawCols[60] = asNumberOrZeroString(p.transport ?? exp.transport ?? doc['61\nSchool Transport']);
  rawCols[61] = asNumberOrZeroString(p.otherExpenses ?? exp.otherExpenses ?? doc['62\nSchool Other Expenses']);
  rawCols[62] = asNumberOrZeroString(p.totalAnnualEducationCost ?? exp.totalAnnualCost ?? doc.recommended_grant_amount ?? doc['63\nTotal Annual Education Cost']);
  rawCols[63] = pickFirst(doc, doc.feeReceiptPhotoUrl, p.feeReceiptPhotoUrl, p.schoolFeeReceiptLink, exp.feeReceiptPhotoUrl, e.feeReceiptPhotoUrl, doc.fee_receipt_photo_url, doc['64\nSchool Fee Receipt Link']) || 'Not Submitted';
  rawCols[64] = pickFirst(doc, doc.marksheetPhotoUrl, p.marksheetPhotoUrl, p.marksheetPhotoLink, exp.marksheetPhotoUrl, e.marksheetPhotoUrl, doc.marksheet_photo_url, doc['65\nMarksheet Photo Link']) || 'Not Submitted';
  rawCols[65] = pickFirst(doc, p.remarks, exp.remarks, doc['66\nRemarks (If Any)']);
  rawCols[66] = pickFirst(doc, doc.approvedAllianceIndia, p.approvedAllianceIndia, f.approvedAllianceIndia, doc.approved_alliance_india, doc['67\nApproved Alliance India']);
  rawCols[67] = f.allInfoCorrect || p.reviewConfirmed || doc['68\nReview Confirmed'] === 'Yes' ? 'Yes' : 'No';
  rawCols[68] = pickFirst(doc, p.organizationName, f.organizationName, doc['69\nOrganization Name']);
  rawCols[69] = pickFirst(doc, p.formSubmittedBy, f.formSubmittedBy, doc.submittedBy, p.interviewerName, doc['70\nForm Submitted By']);
  rawCols[70] = pickFirst(doc, p.organizationEmail, f.organizationEmail, doc['71\nOrganization Email']);
  rawCols[71] = pickFirst(doc, p.syncNeeded, doc['72\nSync Needed']);
  rawCols[72] = pickFirst(doc, doc.updatedAt, p.updatedAt, doc.updated_at, doc['73\nLast Updated']);
  rawCols[73] = pickFirst(doc, d.srName, p.srName, doc.srName, doc['74\nSR Name']);
  rawCols[74] = pickFirst(doc, d.ssrName, p.ssrName, doc.ssrName, doc['75\nSSR Name']);
  rawCols[75] = pickFirst(doc, d.guardianStatus, p.guardianStatus, doc['76\nStatus of Guardian/Parent']);
  rawCols[76] = pickFirst(doc, h.artMedicineType, p.artMedicineType, doc['77\nType of ART Medicines']);
  rawCols[77] = pickFirst(doc, h.cd4Count, p.cd4Count, doc['78\nCD4 Count (Latest)']);
  rawCols[78] = pickFirst(doc, h.hasDisability, p.hasDisability, doc['79\nIs Child With Disability']);
  rawCols[79] = pickFirst(doc, h.disabilityType, p.disabilityType, doc['80\nTypes of Disability']);
  rawCols[80] = pickFirst(doc, h.disabilityCertificateStatus, p.disabilityCertificateStatus, doc['81\nDisability Certificate']);
  rawCols[81] = pickFirst(doc, e.receivingEducationSchemeBenefit, p.receivingEducationSchemeBenefit, doc['82\nEducation Scheme Benefit']);
  rawCols[82] = pickFirst(doc, n.malnutritionSymptoms, p.malnutritionSymptoms, doc['83\nSymptoms of Malnutrition']);

  return rawCols.map((cell, idx) => normalizeCellForRowHash(idx, cell));
}

export function computeSheetCellsRowHash(
  cells: unknown[],
  formulas?: string[],
  isDeleted = false,
  deletedAt: string | null = null
): string {
  const columns: string[] = [];
  for (let i = 0; i < SHEET_TOTAL_COLUMNS; i++) {
    columns.push(normalizeCellForRowHash(i, cells[i], formulas?.[i]));
  }
  const canonicalPayload = JSON.stringify({
    v: 1,
    isDeleted: Boolean(isDeleted),
    deletedAt: deletedAt ? String(deletedAt) : null,
    columns,
  });
  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

export function computeSubmissionRowHash(doc: Record<string, any>): string {
  const columns = buildCanonicalSheetColumns(doc);
  const isDeleted = Boolean(doc?.deletedAt || doc?.isDeleted === true || doc?.is_deleted === true || doc?.status === 'DELETED');
  const deletedAt = doc?.deletedAt || doc?.deleted_at ? String(doc.deletedAt || doc.deleted_at) : null;
  const canonicalPayload = JSON.stringify({
    v: 1,
    isDeleted,
    deletedAt,
    columns,
  });
  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Mandatory central integrity stamper for every submission write path.
 * Always advances `rowVersion` monotonically and recomputes canonical `rowHash`.
 */
export function stampSubmissionRowIntegrity<T extends Record<string, any>>(
  existing: Record<string, any> | null,
  updates: T
): {
  nextState: Record<string, any>;
  stampedUpdates: T & { rowVersion: number; rowHash: string };
  rowVersion: number;
  rowHash: string;
} {
  const prevRowVersion =
    existing && typeof existing.rowVersion === 'number' && Number.isFinite(existing.rowVersion) && existing.rowVersion >= 1
      ? existing.rowVersion
      : existing && typeof existing.row_version === 'number' && Number.isFinite(existing.row_version) && existing.row_version >= 1
        ? existing.row_version
        : 0;

  const rowVersion = prevRowVersion + 1;
  const nextState: Record<string, any> = {
    ...(existing || {}),
    ...updates,
    rowVersion,
  };
  const rowHash = computeSubmissionRowHash(nextState);
  nextState.rowHash = rowHash;

  return {
    nextState,
    stampedUpdates: {
      ...updates,
      rowVersion,
      rowHash,
    },
    rowVersion,
    rowHash,
  };
}
