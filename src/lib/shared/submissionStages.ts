/**
 * Pure typed submission stage definitions and stage derivation engine.
 * 
 * Five orthogonal dimensions — never collapse into a single boolean:
 * 1. SubmissionLifecycle: draft | queued | submitting | submitted | submission_failed
 * 2. IntakeCompleteness: complete | incomplete | unknown
 * 3. ApprovalState: approved | pending | rejected | unknown
 * 4. BankWorkflowState: not_yet_due | pending | complete
 * 5. DocumentReviewState: uploaded | verified | missing | not_applicable
 */

import { isAttachmentPresent, isChildEnrolledInSchool } from '@/lib/read-model/beneficiaryReadiness';

export type SubmissionLifecycle =
  | 'draft'
  | 'queued'
  | 'submitting'
  | 'submitted'
  | 'submission_failed';

export type IntakeCompleteness =
  | 'complete'         // all required non-bank fields and docs present
  | 'incomplete'       // at least one required non-bank field/doc missing
  | 'unknown';         // insufficient data to determine

export type ApprovalState =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'unknown';

export type BankWorkflowState =
  | 'not_yet_due'      // record not approved yet
  | 'pending'          // approved, bank info incomplete
  | 'complete';        // approved, all bank fields + proof present

export type DocumentReviewState =
  | 'uploaded'         // file reference present, not explicitly verified
  | 'verified'         // explicitly verified by evaluator
  | 'missing'          // required but absent
  | 'not_applicable';  // not required for this record type

export type BankFieldName =
  | 'accountNumber'
  | 'accountHolderName'
  | 'bankName'
  | 'branchName'
  | 'ifscCode'
  | 'passbookProof';

export interface BankFieldsRecord {
  accountNumber: string;
  accountHolderName: string;
  bankName: string;
  branchName: string;
  ifscCode: string;
  passbookProof: string;
}

export interface SubmissionStages {
  lifecycle: SubmissionLifecycle;
  intakeCompleteness: IntakeCompleteness;
  approvalState: ApprovalState;
  bankWorkflow: BankWorkflowState;
  documentReview: {
    passbook: DocumentReviewState;
    aadhaar: DocumentReviewState;
    photo: DocumentReviewState;
    signature: DocumentReviewState;
    feeReceipt: DocumentReviewState;
    marksheet: DocumentReviewState;
  };
  bankFields: BankFieldsRecord;
  missingBankFields: BankFieldName[];
  missingIntakeFields: string[];
}

/**
 * Masks a bank account number to show only the last 4 digits per DPDP Act standards.
 * Preserves leading zero string representation for the trailing digits if needed.
 */
export function maskBankAccountNumber(raw?: string | number | null): string {
  if (raw === undefined || raw === null) return '';
  const str = String(raw).trim();
  if (!str) return '';
  if (str.length <= 4) return str;
  const last4 = str.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

/**
 * Extracts and normalizes bank field values from any canonical record structure.
 * Preserves leading zeros in account numbers strictly as strings.
 */
export function extractBankFields(record: any): BankFieldsRecord {
  if (!record || typeof record !== 'object') {
    return {
      accountNumber: '',
      accountHolderName: '',
      bankName: '',
      branchName: '',
      ifscCode: '',
      passbookProof: '',
    };
  }

  // Account Number: preserve as string, handle numbers or strings with leading zeros
  const rawAccount =
    record.accountNumber ??
    record.bankAccountNumber ??
    record.bank_account_number ??
    record.bankingAndKyc?.bankAccountNumber ??
    record.bankDetails?.bankAccountNumber ??
    record['21\nBank Account Number'] ??
    record['Bank Account Number'] ??
    record.raw_payload?.bankingAndKyc?.bankAccountNumber;

  let accountNumber = '';
  if (rawAccount !== undefined && rawAccount !== null) {
    accountNumber = String(rawAccount).trim();
  }

  // Account Holder Name
  const accountHolderName = String(
    record.accountHolderName ||
    record.bankAccountHolderName ||
    record.account_holder_name ||
    record.bankingAndKyc?.bankAccountHolderName ||
    record.bankDetails?.bankAccountHolderName ||
    record['20\nBank Account Holder Name'] ||
    record['Bank Account Holder Name'] ||
    record.raw_payload?.bankingAndKyc?.bankAccountHolderName ||
    ''
  ).trim();

  // Bank Name
  const bankName = String(
    record.bankName ||
    record.bank_name ||
    record.bankingAndKyc?.bankName ||
    record.bankDetails?.bankName ||
    record['Bank Name'] ||
    record.raw_payload?.bankingAndKyc?.bankName ||
    ''
  ).trim();

  // Branch Name
  const branchName = String(
    record.branchName ||
    record.branch_name ||
    record.bankingAndKyc?.branchName ||
    record.bankDetails?.branchName ||
    record['Branch Name'] ||
    record.raw_payload?.bankingAndKyc?.branchName ||
    ''
  ).trim();

  // IFSC Code
  const ifscCode = String(
    record.ifscCode ||
    record.bankIfscCode ||
    record.ifsc_code ||
    record.bankingAndKyc?.bankIfscCode ||
    record.bankDetails?.bankIfscCode ||
    record['22\nBank IFSC Code'] ||
    record['Bank IFSC Code'] ||
    record.raw_payload?.bankingAndKyc?.bankIfscCode ||
    ''
  ).trim();

  // Passbook Proof: check string reference or attachment confirmation
  const passbookProofVal =
    record.passbookProof ||
    record.passbookPhotoUrl ||
    record.passbook_photo_url ||
    record.bankingAndKyc?.passbookPhotoUrl ||
    record.bankDetails?.passbookPhotoCaptured ||
    record['25\nPassbook Front Page Link'] ||
    record['Passbook Front Page Link'] ||
    record.raw_payload?.bankingAndKyc?.passbookPhotoUrl ||
    '';

  const hasPassbookBool = typeof record.hasPassbook === 'boolean' ? record.hasPassbook : undefined;
  const isProofValid = isAttachmentPresent(passbookProofVal, hasPassbookBool);
  const passbookProof = isProofValid ? (typeof passbookProofVal === 'string' && passbookProofVal ? passbookProofVal : 'verified_attachment') : '';

  return {
    accountNumber,
    accountHolderName,
    bankName,
    branchName,
    ifscCode,
    passbookProof,
  };
}

/**
 * Normalizes approval state to 'approved' | 'pending' | 'rejected' | 'unknown'.
 */
export function deriveApprovalState(record: any): ApprovalState {
  if (!record || typeof record !== 'object') return 'unknown';

  if (record.approvalState && ['approved', 'pending', 'rejected', 'unknown'].includes(record.approvalState)) {
    return record.approvalState as ApprovalState;
  }

  if (record.isApproved === true) return 'approved';

  const rawApproved =
    record['67\nApproved Alliance India'] ??
    record['Approved Alliance India'] ??
    record.approvedAllianceIndia ??
    record.approved_alliance_india ??
    record.approvedStatus ??
    record.finalReview?.approvedAllianceIndia ??
    record.raw_payload?.finalReview?.approvedAllianceIndia;

  if (rawApproved === true) return 'approved';
  if (rawApproved === false) return 'pending';
  if (!rawApproved) return 'pending';

  const str = String(rawApproved).trim().toLowerCase();
  if (str === 'approved' || str === 'yes' || str.startsWith('approv')) {
    return 'approved';
  }
  if (str === 'rejected' || str === 'reject' || str.startsWith('reject')) {
    return 'rejected';
  }
  if (str === 'pending' || str === 'no' || str === 'review_needed') {
    return 'pending';
  }

  return 'unknown';
}

/**
 * Derives submission lifecycle dimension.
 */
export function deriveLifecycle(record: any): SubmissionLifecycle {
  if (!record || typeof record !== 'object') return 'draft';

  if (record.lifecycle && ['draft', 'queued', 'submitting', 'submitted', 'submission_failed'].includes(record.lifecycle)) {
    return record.lifecycle as SubmissionLifecycle;
  }

  const rawStatus = String(record.status || record.syncStatus || '').toLowerCase();

  if (rawStatus === 'synced' || rawStatus === 'submitted' || record.serverConfirmed) {
    return 'submitted';
  }

  if (
    rawStatus === 'failed_retryable' ||
    rawStatus === 'failed_final' ||
    rawStatus === 'conflict' ||
    rawStatus === 'needs_review' ||
    rawStatus === 'failed'
  ) {
    return 'submission_failed';
  }

  if (rawStatus === 'syncing' || rawStatus === 'submitting') {
    return 'submitting';
  }

  if (rawStatus === 'ready_to_sync' || rawStatus === 'waiting' || rawStatus === 'queued' || record.queueId !== undefined) {
    return 'queued';
  }

  if (record.isDraft === true || record.draftId !== undefined || record.tableName === 'drafts') {
    return 'draft';
  }

  // If remoteSubmissionId or uniqueId with lastVisit/created_at is present without queue markers, assume submitted
  if (record.remoteSubmissionId || record.remote_submission_id || record['3\nSubmission Time']) {
    return 'submitted';
  }

  return 'draft';
}

/**
 * Pure typed function to derive all five stage dimensions of a submission.
 */
export function deriveSubmissionStages(record: any): SubmissionStages {
  if (!record || typeof record !== 'object' || Object.keys(record).length === 0) {
    return {
      lifecycle: 'draft',
      intakeCompleteness: 'unknown',
      approvalState: 'unknown',
      bankWorkflow: 'not_yet_due',
      documentReview: {
        passbook: 'missing',
        aadhaar: 'missing',
        photo: 'missing',
        signature: 'missing',
        feeReceipt: 'not_applicable',
        marksheet: 'not_applicable',
      },
      bankFields: {
        accountNumber: '',
        accountHolderName: '',
        bankName: '',
        branchName: '',
        ifscCode: '',
        passbookProof: '',
      },
      missingBankFields: [
        'accountNumber',
        'accountHolderName',
        'bankName',
        'branchName',
        'ifscCode',
        'passbookProof',
      ],
      missingIntakeFields: ['childName', 'dob', 'gender', 'caregiverName', 'state', 'district'],
    };
  }

  // 1. Lifecycle
  const lifecycle = deriveLifecycle(record);

  // 2. Approval State
  const approvalState = deriveApprovalState(record);

  // 3. Bank-stage fields inspection
  const bankFields = extractBankFields(record);
  const missingBankFields: BankFieldName[] = [];

  if (!bankFields.accountNumber) missingBankFields.push('accountNumber');
  if (!bankFields.accountHolderName) missingBankFields.push('accountHolderName');
  if (!bankFields.bankName) missingBankFields.push('bankName');
  if (!bankFields.branchName) missingBankFields.push('branchName');
  if (!bankFields.ifscCode) missingBankFields.push('ifscCode');
  if (!bankFields.passbookProof) missingBankFields.push('passbookProof');

  // 4. Bank Workflow State rule:
  // - If record is not yet submitted (draft/queued) or approvalState !== 'approved' -> 'not_yet_due'
  // - If submitted AND approved AND all 6 bank fields present -> 'complete'
  // - If submitted AND approved AND any bank field missing -> 'pending'
  let bankWorkflow: BankWorkflowState = 'not_yet_due';
  if (lifecycle === 'submitted' && approvalState === 'approved') {
    bankWorkflow = missingBankFields.length === 0 ? 'complete' : 'pending';
  }

  // 5. Intake Documents
  // Passbook front page is bank-stage, so it does NOT block intake completeness!
  const aadhaarVal =
    record.aadhaarCardPhotoUrl ||
    record.aadhaar_card_photo_url ||
    record.bankingAndKyc?.aadhaarCardPhotoUrl ||
    record['26\nAadhaar Card Link'] ||
    record['Aadhaar Card Link'] ||
    record.raw_payload?.bankingAndKyc?.aadhaarCardPhotoUrl;
  const isAadhaarPresent = isAttachmentPresent(aadhaarVal, record.hasAadhaar);
  const isAadhaarVerified = Boolean(
    record.isAadhaarVerified ||
    record.aadhaarVerified ||
    record.documentVerification?.aadhaarVerified ||
    record.documentStatus?.verifiedDocs?.includes('Aadhaar')
  );

  const photoVal =
    record.childPhotoUrl ||
    record.child_photo_url ||
    record.bankingAndKyc?.childPhotoUrl ||
    record['27\nPassport Size Photo Link'] ||
    record['Passport Size Photo Link'] ||
    record.raw_payload?.bankingAndKyc?.childPhotoUrl;
  const isPhotoPresent = isAttachmentPresent(photoVal, record.hasChildPhoto);
  const isPhotoVerified = Boolean(
    record.isPhotoVerified ||
    record.photoVerified ||
    record.documentVerification?.photoVerified ||
    record.documentStatus?.verifiedDocs?.includes('Photo')
  );

  const sigVal =
    record.signatureDataUrl ||
    record.signature_data_url ||
    record.signatureUrl ||
    record.signature_url ||
    record.consentSignatureUrl ||
    record.caregiverConsent?.signatureDataUrl ||
    record.caregiverConsent?.signatureUrl ||
    record.consent?.signatureDataUrl ||
    record['6\nSignature /\nThumb Impression'] ||
    record['72\nSignature Link'] ||
    record['Signature Link'] ||
    record.raw_payload?.consent?.caregiverSignature;
  const isSigPresent = isAttachmentPresent(sigVal, record.hasSignature);
  const isSigVerified = Boolean(
    record.isSignatureVerified ||
    record.signatureVerified ||
    record.documentVerification?.signatureVerified ||
    record.documentStatus?.verifiedDocs?.includes('Signature')
  );

  const schoolType = String(
    record.schoolType ||
    record.school_type ||
    record.educationStatus?.schoolType ||
    record['53\nSchool Type'] ||
    'Government school'
  );
  const isEnrolled = isChildEnrolledInSchool(record, schoolType);

  const feeVal =
    record.feeReceiptPhotoUrl ||
    record.fee_receipt_photo_url ||
    record.educationExpenses?.feeReceiptPhotoUrl ||
    record['64\nSchool Fee Receipt Link'] ||
    record['School Fee Receipt Link'] ||
    record.raw_payload?.educationExpenses?.feeReceiptPhotoUrl;
  const isFeeReceiptPresent = isEnrolled ? isAttachmentPresent(feeVal, record.hasFeeReceipt) : false;
  const isFeeReceiptVerified = Boolean(
    record.isFeeReceiptVerified ||
    record.feeReceiptVerified ||
    record.documentVerification?.feeReceiptVerified ||
    record.documentStatus?.verifiedDocs?.includes('Fee Receipt')
  );

  const marksheetVal =
    record.marksheetPhotoUrl ||
    record.marksheet_photo_url ||
    record.educationExpenses?.marksheetPhotoUrl ||
    record['65\nMarksheet Photo Link'] ||
    record['Marksheet Photo Link'] ||
    record.raw_payload?.educationExpenses?.marksheetPhotoUrl;
  const isMarksheetPresent = isEnrolled ? isAttachmentPresent(marksheetVal, record.hasMarksheet) : false;
  const isMarksheetVerified = Boolean(
    record.isMarksheetVerified ||
    record.marksheetVerified ||
    record.documentVerification?.marksheetVerified ||
    record.documentStatus?.verifiedDocs?.includes('Marksheet')
  );

  // Document review states
  const passbookReview: DocumentReviewState = !bankFields.passbookProof
    ? 'missing'
    : record.isPassbookVerified
    ? 'verified'
    : 'uploaded';

  const aadhaarReview: DocumentReviewState = !isAadhaarPresent
    ? 'missing'
    : isAadhaarVerified
    ? 'verified'
    : 'uploaded';

  const photoReview: DocumentReviewState = !isPhotoPresent
    ? 'missing'
    : isPhotoVerified
    ? 'verified'
    : 'uploaded';

  const signatureReview: DocumentReviewState = !isSigPresent
    ? 'missing'
    : isSigVerified
    ? 'verified'
    : 'uploaded';

  const feeReceiptReview: DocumentReviewState = !isEnrolled
    ? 'not_applicable'
    : !isFeeReceiptPresent
    ? 'missing'
    : isFeeReceiptVerified
    ? 'verified'
    : 'uploaded';

  const marksheetReview: DocumentReviewState = !isEnrolled
    ? 'not_applicable'
    : !isMarksheetPresent
    ? 'missing'
    : isMarksheetVerified
    ? 'verified'
    : 'uploaded';

  // 6. Required Intake Fields & Missing List
  const missingIntakeFields: string[] = [];

  const childName = record.childName || record.child_name || record.demographics?.childName || record['9\nChild Name'];
  if (!childName || String(childName).trim().length < 2) missingIntakeFields.push('childName');

  const dob = record.dob || record.demographics?.dob || record['10\nDate of Birth'];
  if (!dob) missingIntakeFields.push('dob');

  const gender = record.gender || record.demographics?.gender || record['12\nGender'];
  if (!gender) missingIntakeFields.push('gender');

  const caregiverName = record.caregiverName || record.caregiver_name || record.demographics?.caregiverName || record['14\nCaregiver Full Name'];
  if (!caregiverName || String(caregiverName).trim().length < 2) missingIntakeFields.push('caregiverName');

  const state = record.state || record.demographics?.state || record['18\nState'];
  if (!state) missingIntakeFields.push('state');

  const district = record.district || record.demographics?.district || record['19\nDistrict'];
  if (!district) missingIntakeFields.push('district');

  // Intake Documents Missing Checks
  if (aadhaarReview === 'missing') missingIntakeFields.push('aadhaarCardPhoto');
  if (photoReview === 'missing') missingIntakeFields.push('childPhoto');
  if (signatureReview === 'missing') missingIntakeFields.push('caregiverSignature');
  if (feeReceiptReview === 'missing') missingIntakeFields.push('feeReceiptPhoto');
  if (marksheetReview === 'missing') missingIntakeFields.push('marksheetPhoto');

  // Determine intake completeness
  const intakeCompleteness: IntakeCompleteness =
    missingIntakeFields.length === 0 ? 'complete' : 'incomplete';

  return {
    lifecycle,
    intakeCompleteness,
    approvalState,
    bankWorkflow,
    documentReview: {
      passbook: passbookReview,
      aadhaar: aadhaarReview,
      photo: photoReview,
      signature: signatureReview,
      feeReceipt: feeReceiptReview,
      marksheet: marksheetReview,
    },
    bankFields,
    missingBankFields,
    missingIntakeFields,
  };
}
