/**
 * Canonical Beneficiary Readiness, Document Verification & Surveillance Model
 * 
 * Implements pure, typed readiness derivation and aggregate semantics:
 * - Deterministic document verification readiness according to canonical form rules
 * - Safe attachment verification distinction (distinguishing present, verified, missing, N/A)
 * - Safe numeric preservation (never coercing missing age or lab values to zero)
 * - Canonical child deduplication under established NACO/Alliance ART identity rule
 * - Full audit and aggregate summary metrics
 */

import type { BMICategory, VLCategory, HbCategory } from '@/types/domain';

export type CanonicalDocumentType =
  | 'Bank Passbook Front Page'
  | 'Aadhaar Card'
  | 'Passport Size Photo'
  | 'Caregiver Signature'
  | 'School Fee Receipt'
  | 'Academic Marksheet';

export type DocumentAttachmentState =
  | 'missing'
  | 'uploaded'
  | 'verified'
  | 'not_applicable';

export interface DocumentVerificationDetail {
  docType: CanonicalDocumentType;
  required: boolean;
  state: DocumentAttachmentState;
  label: string;
  isMissing: boolean;
  isPresent: boolean;
  isVerified: boolean;
  isNotApplicable: boolean;
}

export type CanonicalApprovalStatus = 'Approved' | 'Pending' | 'Rejected' | 'Unknown';

export type CanonicalOrphanStatus =
  | 'Double orphan'
  | 'Single orphan'
  | 'Both parents alive'
  | 'Unknown';

export interface ClinicalAlertInfo {
  hasAlert: boolean;
  alerts: string[];
  isSevereUnderweight: boolean;
  isHighViralLoad: boolean;
  isSevereAnemia: boolean;
}

export interface CanonicalRecordReadiness {
  recordId: string;
  artNumber: string;
  childName: string;

  // Documents
  requiredDocTypes: CanonicalDocumentType[];
  presentDocTypes: CanonicalDocumentType[];
  missingDocTypes: CanonicalDocumentType[];
  notApplicableDocTypes: CanonicalDocumentType[];
  docDetails: Record<CanonicalDocumentType, DocumentVerificationDetail>;
  isComplete: boolean;
  totalRequired: number;
  uploadedCount: number;
  completenessRate: number; // 0 to 100 percentage integer

  // Specific document missing flags for fast filtering and aggregates
  missingPassbook: boolean;
  missingAadhaar: boolean;
  missingPhoto: boolean;
  missingSignature: boolean;
  missingSchoolDoc: boolean;

  // Approval
  approvalStatus: CanonicalApprovalStatus;
  isApproved: boolean;

  // Vulnerability & Education
  orphanClassification: CanonicalOrphanStatus;
  isEnrolledInSchool: boolean;
  isOutOfSchool: boolean;

  // Clinical alerts
  clinicalAlert: ClinicalAlertInfo;

  // Preserved values (never coercing missing values to 0)
  age: number | null;
  bmi: number | null;
  viralLoad: string | null;
  hemoglobin: string | null;
  grantAmount: number;
}

/**
 * Validates whether an attachment field value represents a genuine uploaded attachment.
 * 
 * Safety invariants:
 * - A filename ("passbook.png"), placeholder ("—", "N/A"), or label ("Restricted Doc")
 *   alone does NOT count as an uploaded attachment unless verified by contract.
 * - Bare string "Restricted Doc" without a hyperlink or confirmed boolean is a placeholder.
 * - URL strings (http://, https://, data:image/, blob:) and =HYPERLINK("http...") formulas
 *   represent genuine uploads.
 * - Server-derived confirmed boolean flags (e.g., hasPassbook === true) count as uploaded.
 */
export function isAttachmentPresent(val: any, confirmedBoolean?: boolean): boolean {
  if (confirmedBoolean === true) return true;
  if (confirmedBoolean === false) return false;
  if (val === true) return true;
  if (val === false || val === null || val === undefined) return false;

  // Handle trusted private attachment metadata object
  if (typeof val === 'object') {
    // Explicit status field (e.g. from storage service / API normalization)
    if (typeof val.status === 'string') {
      const s = val.status.trim().toUpperCase();
      if (['MISSING', 'PENDING', 'FAILED', 'NOT_UPLOADED', 'DELETED', 'REJECTED'].includes(s)) {
        return false;
      }
      if (['UPLOADED', 'STORED', 'CAPTURED', 'VERIFIED', 'PRESENT', 'COMPLETED', 'CAPTURED_LOCAL', 'SYNCED'].includes(s)) {
        return true;
      }
    }

    // Explicit boolean indicator flags in metadata
    if (typeof val.isPresent === 'boolean') return val.isPresent;
    if (typeof val.uploaded === 'boolean') return val.uploaded;
    if (typeof val.hasAttachment === 'boolean') return val.hasAttachment;
    if (typeof val.captured === 'boolean') return val.captured;

    // Check for trusted private asset identifier or storage reference key
    const rawAssetId =
      val.assetId ||
      val.asset_id ||
      val.storageId ||
      val.storageKey ||
      val.storage_key ||
      val.fileId ||
      val.file_id ||
      val.key ||
      val.path ||
      val.id;

    if (typeof rawAssetId === 'string') {
      const trimmedAsset = rawAssetId.trim();
      const lowerAsset = trimmedAsset.toLowerCase();
      const invalidAssetPlaceholders = ['—', '-', 'n/a', 'none', 'null', 'undefined', 'missing', 'pending', 'not uploaded'];
      if (trimmedAsset && !invalidAssetPlaceholders.includes(lowerAsset)) {
        return true;
      }
    }

    // Check nested URL or URI if present in metadata object
    const nestedRef = val.url || val.uri || val.link || val.signedUrl;
    if (nestedRef && typeof nestedRef !== 'object') {
      return isAttachmentPresent(nestedRef);
    }

    return false;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return false;

    // Reject standard placeholder / empty values
    const lower = trimmed.toLowerCase();
    if (
      trimmed === '—' ||
      trimmed === '-' ||
      trimmed === 'N/A' ||
      trimmed === 'n/a' ||
      lower === 'none' ||
      lower === 'null' ||
      lower === 'undefined' ||
      lower === 'not uploaded' ||
      lower === 'no fee receipt' ||
      lower === 'no marksheet' ||
      lower === 'pending' ||
      lower === 'missing'
    ) {
      return false;
    }

    // Google Sheets HYPERLINK formula with real URL or private URI
    if (trimmed.startsWith('=')) {
      const match = trimmed.match(/=HYPERLINK\("([^"]+)"/i);
      if (match && match[1]) {
        const link = match[1].trim();
        return (
          link.startsWith('http://') ||
          link.startsWith('https://') ||
          link.startsWith('asset://') ||
          link.startsWith('storage://') ||
          link.startsWith('vault://')
        );
      }
      return false;
    }

    // Direct Web URL or Base64 / Blob data URL
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('data:') ||
      lower.startsWith('blob:')
    ) {
      return true;
    }

    // Private attachment URI schemes (does not require public HTTP URL)
    if (
      lower.startsWith('asset://') ||
      lower.startsWith('storage://') ||
      lower.startsWith('file://') ||
      lower.startsWith('vault://') ||
      lower.startsWith('urn:asset:')
    ) {
      return true;
    }

    // Trusted opaque asset reference tokens (e.g. "sig-asset-9988", "asset-uuid-1234")
    if (
      lower.startsWith('sig-asset-') ||
      lower.startsWith('asset-') ||
      lower.startsWith('doc-asset-') ||
      /^(asset|sig-asset|doc-asset)[-_][a-zA-Z0-9_-]+$/i.test(trimmed)
    ) {
      return true;
    }

    // Bare placeholder strings like "Restricted Doc", "Restricted Document", or generic filenames without URL/protocol
    if (
      lower.startsWith('restricted doc') ||
      lower === 'restricted document' ||
      lower === '[restricted]'
    ) {
      // Bare label without an actual URL or verified server flag is not a verified attachment
      return false;
    }

    // If string is just a bare filename like "passbook.jpg" or "doc.pdf" without URL protocol
    if (/^[a-zA-Z0-9_\-.\s]+\.(jpg|jpeg|png|pdf|webp)$/i.test(trimmed)) {
      return false;
    }

    return false;
  }

  return false;
}

/**
 * Determines whether a child is enrolled in school based on education fields.
 */
export function isChildEnrolledInSchool(raw: any, schoolTypeStr?: string): boolean {
  const schoolType = (schoolTypeStr || raw.schoolType || raw['53\nSchool Type'] || raw.educationStatus?.schoolType || raw.education?.schoolType || '').toString().toLowerCase();
  const eduStatus = (raw.educationStatus || raw['49\nEducation Status'] || raw.education?.educationStatus || '').toString().toLowerCase();

  // Explicit enrollment boolean if present
  if (typeof raw.schoolEnrolled === 'boolean') {
    return raw.schoolEnrolled;
  }
  if (typeof raw.school_enrolled === 'boolean') {
    return raw.school_enrolled;
  }

  // Check out-of-school patterns
  if (
    schoolType.includes('not in school') ||
    schoolType.includes('out of school') ||
    schoolType.includes('never enrolled') ||
    schoolType.includes('dropped out') ||
    eduStatus.includes('not') ||
    eduStatus.includes('dropped') ||
    eduStatus.includes('never') ||
    eduStatus.includes('completed')
  ) {
    return false;
  }

  return true;
}

/**
 * Normalizes orphan status string to canonical orphan classification.
 */
export function classifyOrphanStatus(rawOrphan: any): CanonicalOrphanStatus {
  if (!rawOrphan) return 'Unknown';
  const str = String(rawOrphan).toLowerCase().trim();
  if (str.includes('double') || str.includes('both parents deceased')) {
    return 'Double orphan';
  }
  if (
    str.includes('single') ||
    str.includes('one parent deceased') ||
    str.includes('maternal') ||
    str.includes('paternal') ||
    str.includes('deceased')
  ) {
    return 'Single orphan';
  }
  if (str.includes('both parents alive') || str === 'none') {
    return 'Both parents alive';
  }
  return 'Unknown';
}

/**
 * Normalizes approval field to canonical status.
 */
export function normalizeApprovalStatus(rawApproved: any): {
  status: CanonicalApprovalStatus;
  isApproved: boolean;
} {
  if (rawApproved === true) {
    return { status: 'Approved', isApproved: true };
  }
  if (rawApproved === false) {
    return { status: 'Pending', isApproved: false };
  }
  if (!rawApproved) {
    return { status: 'Pending', isApproved: false };
  }

  const str = String(rawApproved).trim().toLowerCase();
  if (str === 'approved' || str === 'yes' || str.startsWith('approv')) {
    return { status: 'Approved', isApproved: true };
  }
  if (str === 'rejected' || str === 'reject' || str.startsWith('reject')) {
    return { status: 'Rejected', isApproved: false };
  }
  if (str === 'pending' || str === 'no' || str === 'review_needed') {
    return { status: 'Pending', isApproved: false };
  }

  return { status: 'Unknown', isApproved: false };
}

/**
 * Pure typed function to derive canonical readiness and verification for any assessment record.
 */
export function deriveBeneficiaryReadiness(it: any): CanonicalRecordReadiness {
  const id = String(
    it['1\nUnique ID'] ||
    it['unique id'] ||
    it.id ||
    it._uuid ||
    it.client_submission_id ||
    it.remote_submission_id ||
    it.clientSubmissionId ||
    'BEN-UNKNOWN'
  );

  const artNumber = String(
    it['42\nART ID Number'] ||
    it['art id number'] ||
    it['1\nUnique ID'] ||
    it.demographics?.artNumber ||
    it.art_number ||
    it.artNumber ||
    id
  );

  const childName = String(
    it['9\nChild Name'] ||
    it['child name'] ||
    it.demographics?.childName ||
    it.child_name ||
    it.childName ||
    'Beneficiary Child'
  );

  const schoolType = String(
    it['53\nSchool Type'] ||
    it['school type'] ||
    it.educationStatus?.schoolType ||
    it.education?.schoolType ||
    it.school_type ||
    it.schoolType ||
    'Government school'
  );

  const isEnrolled = isChildEnrolledInSchool(it, schoolType);
  const isOutOfSchool = !isEnrolled;

  // 1. Passbook Front Page
  const passbookVal =
    it['25\nPassbook Front Page Link'] ||
    it['25\\nPassbook Front Page Link'] ||
    it['Passbook Front Page Link'] ||
    it['passbook front page link'] ||
    it.passbookPhotoUrl ||
    it.passbook_photo_url ||
    it.bankingAndKyc?.passbookPhotoUrl ||
    it.bankDetails?.passbookPhotoCaptured ||
    it.raw_payload?.bankingAndKyc?.passbookPhotoUrl;
  let passbookPresent = isAttachmentPresent(passbookVal, it.hasPassbook);

  // 2. Aadhaar Card
  const aadhaarVal =
    it['26\nAadhaar Card Link'] ||
    it['26\\nAadhaar Card Link'] ||
    it['Aadhaar Card Link'] ||
    it['aadhaar card link'] ||
    it.aadhaarCardPhotoUrl ||
    it.aadhaar_card_photo_url ||
    it.bankingAndKyc?.aadhaarCardPhotoUrl ||
    it.raw_payload?.bankingAndKyc?.aadhaarCardPhotoUrl;
  let aadhaarPresent = isAttachmentPresent(aadhaarVal, it.hasAadhaar);

  // 3. Child Photo
  const photoVal =
    it['27\nPassport Size Photo Link'] ||
    it['27\\nPassport Size Photo Link'] ||
    it['Passport Size Photo Link'] ||
    it['passport size photo link'] ||
    it.childPhotoUrl ||
    it.child_photo_url ||
    it.bankingAndKyc?.childPhotoUrl ||
    it.raw_payload?.bankingAndKyc?.childPhotoUrl;
  let photoPresent = isAttachmentPresent(photoVal, it.hasChildPhoto);

  // 4. Caregiver Signature
  const sigVal =
    it['6\nSignature /\nThumb Impression'] ||
    it['6\\nSignature /\\nThumb Impression'] ||
    it['Signature /\nThumb Impression'] ||
    it['72\nSignature Link'] ||
    it['72\\nSignature Link'] ||
    it['Signature Link'] ||
    it.signatureDataUrl ||
    it.signature_data_url ||
    it.consentSignatureUrl ||
    it.signature_url ||
    it.caregiverConsent?.signatureDataUrl ||
    it.caregiverConsent?.signatureUrl ||
    it.consent?.signatureDataUrl ||
    it.consent?.caregiverSignature ||
    it.raw_payload?.consent?.caregiverSignature;
  const isSigStatusCaptured =
    it.caregiverConsent?.signatureStatus === 'CAPTURED_LOCAL' ||
    it.caregiverConsent?.signatureStatus === 'UPLOADED';
  let sigPresent = isAttachmentPresent(sigVal, it.hasSignature ?? (isSigStatusCaptured ? true : undefined));

  // 5. School Fee Receipt (Applicable only if child is enrolled in school)
  const feeVal =
    it['64\nSchool Fee Receipt Link'] ||
    it['64\\nSchool Fee Receipt Link'] ||
    it['School Fee Receipt Link'] ||
    it['school fee receipt link'] ||
    it.feeReceiptPhotoUrl ||
    it.fee_receipt_photo_url ||
    it.educationExpenses?.feeReceiptPhotoUrl ||
    it.raw_payload?.educationExpenses?.feeReceiptPhotoUrl;
  let feeReceiptPresent = isEnrolled ? isAttachmentPresent(feeVal, it.hasFeeReceipt) : false;

  // 6. Marksheet (Applicable only if child is enrolled in school)
  const marksheetVal =
    it['65\nMarksheet Photo Link'] ||
    it['65\\nMarksheet Photo Link'] ||
    it['Marksheet Photo Link'] ||
    it['marksheet photo link'] ||
    it.marksheetPhotoUrl ||
    it.marksheet_photo_url ||
    it.educationExpenses?.marksheetPhotoUrl ||
    it.raw_payload?.educationExpenses?.marksheetPhotoUrl;
  let marksheetPresent = isEnrolled ? isAttachmentPresent(marksheetVal, it.hasMarksheet) : false;

  // Fallback to pre-existing documentStatus for mock rows or pre-parsed SupervisorBeneficiaryRows
  if (it.documentStatus && typeof it.documentStatus.isComplete === 'boolean') {
    const ds = it.documentStatus;
    if (ds.isComplete) {
      passbookPresent = true;
      aadhaarPresent = true;
      photoPresent = true;
      sigPresent = true;
      if (isEnrolled) {
        feeReceiptPresent = true;
        marksheetPresent = true;
      }
    } else {
      if (Array.isArray(ds.uploadedDocs)) {
        if (ds.uploadedDocs.some((d: string) => d.includes('Passbook'))) passbookPresent = true;
        if (ds.uploadedDocs.some((d: string) => d.includes('Aadhaar'))) aadhaarPresent = true;
        if (ds.uploadedDocs.some((d: string) => d.includes('Photo'))) photoPresent = true;
        if (ds.uploadedDocs.some((d: string) => d.includes('Signature'))) sigPresent = true;
        if (isEnrolled && ds.uploadedDocs.some((d: string) => d.includes('Fee Receipt'))) feeReceiptPresent = true;
        if (isEnrolled && ds.uploadedDocs.some((d: string) => d.includes('Marksheet'))) marksheetPresent = true;
      }
      if (Array.isArray(ds.pendingDocs)) {
        if (ds.pendingDocs.some((d: string) => d.includes('Passbook'))) passbookPresent = false;
        if (ds.pendingDocs.some((d: string) => d.includes('Aadhaar'))) aadhaarPresent = false;
        if (ds.pendingDocs.some((d: string) => d.includes('Photo'))) photoPresent = false;
        if (ds.pendingDocs.some((d: string) => d.includes('Signature'))) sigPresent = false;
        if (ds.pendingDocs.some((d: string) => d.includes('Fee Receipt'))) feeReceiptPresent = false;
        if (ds.pendingDocs.some((d: string) => d.includes('Marksheet'))) marksheetPresent = false;
      }
    }
  }

  const isPassbookVerified = Boolean(
    it.isPassbookVerified ||
    it.passbookVerified ||
    it.documentVerification?.passbookVerified ||
    it.documentStatus?.verifiedDocs?.includes('Passbook')
  );
  const isAadhaarVerified = Boolean(
    it.isAadhaarVerified ||
    it.aadhaarVerified ||
    it.documentVerification?.aadhaarVerified ||
    it.documentStatus?.verifiedDocs?.includes('Aadhaar')
  );
  const isPhotoVerified = Boolean(
    it.isPhotoVerified ||
    it.photoVerified ||
    it.documentVerification?.photoVerified ||
    it.documentStatus?.verifiedDocs?.includes('Photo')
  );
  const isSignatureVerified = Boolean(
    it.isSignatureVerified ||
    it.signatureVerified ||
    it.documentVerification?.signatureVerified ||
    it.documentStatus?.verifiedDocs?.includes('Signature')
  );
  const isFeeReceiptVerified = Boolean(
    it.isFeeReceiptVerified ||
    it.feeReceiptVerified ||
    it.documentVerification?.feeReceiptVerified ||
    it.documentStatus?.verifiedDocs?.includes('Fee Receipt')
  );
  const isMarksheetVerified = Boolean(
    it.isMarksheetVerified ||
    it.marksheetVerified ||
    it.documentVerification?.marksheetVerified ||
    it.documentStatus?.verifiedDocs?.includes('Marksheet')
  );

  // Assemble document details without exposing raw references, signed tokens, or object keys
  const docDetails: Record<CanonicalDocumentType, DocumentVerificationDetail> = {
    'Bank Passbook Front Page': {
      docType: 'Bank Passbook Front Page',
      required: true,
      state: !passbookPresent ? 'missing' : isPassbookVerified ? 'verified' : 'uploaded',
      label: 'Bank Passbook Front Page',
      isMissing: !passbookPresent,
      isPresent: passbookPresent,
      isVerified: isPassbookVerified,
      isNotApplicable: false,
    },
    'Aadhaar Card': {
      docType: 'Aadhaar Card',
      required: true,
      state: !aadhaarPresent ? 'missing' : isAadhaarVerified ? 'verified' : 'uploaded',
      label: 'Aadhaar Card',
      isMissing: !aadhaarPresent,
      isPresent: aadhaarPresent,
      isVerified: isAadhaarVerified,
      isNotApplicable: false,
    },
    'Passport Size Photo': {
      docType: 'Passport Size Photo',
      required: true,
      state: !photoPresent ? 'missing' : isPhotoVerified ? 'verified' : 'uploaded',
      label: 'Passport Size Photo',
      isMissing: !photoPresent,
      isPresent: photoPresent,
      isVerified: isPhotoVerified,
      isNotApplicable: false,
    },
    'Caregiver Signature': {
      docType: 'Caregiver Signature',
      required: true,
      state: !sigPresent ? 'missing' : isSignatureVerified ? 'verified' : 'uploaded',
      label: 'Caregiver Signature / Thumb Impression',
      isMissing: !sigPresent,
      isPresent: sigPresent,
      isVerified: isSignatureVerified,
      isNotApplicable: false,
    },
    'School Fee Receipt': {
      docType: 'School Fee Receipt',
      required: isEnrolled,
      state: !isEnrolled ? 'not_applicable' : !feeReceiptPresent ? 'missing' : isFeeReceiptVerified ? 'verified' : 'uploaded',
      label: 'School Fee Receipt',
      isMissing: isEnrolled && !feeReceiptPresent,
      isPresent: feeReceiptPresent,
      isVerified: isFeeReceiptVerified,
      isNotApplicable: !isEnrolled,
    },
    'Academic Marksheet': {
      docType: 'Academic Marksheet',
      required: isEnrolled,
      state: !isEnrolled ? 'not_applicable' : !marksheetPresent ? 'missing' : isMarksheetVerified ? 'verified' : 'uploaded',
      label: 'Academic Marksheet / Certificate',
      isMissing: isEnrolled && !marksheetPresent,
      isPresent: marksheetPresent,
      isVerified: isMarksheetVerified,
      isNotApplicable: !isEnrolled,
    },
  };

  const requiredDocTypes: CanonicalDocumentType[] = [];
  const presentDocTypes: CanonicalDocumentType[] = [];
  const missingDocTypes: CanonicalDocumentType[] = [];
  const notApplicableDocTypes: CanonicalDocumentType[] = [];

  for (const doc of Object.values(docDetails)) {
    if (doc.required) {
      requiredDocTypes.push(doc.docType);
      if (doc.isPresent) {
        presentDocTypes.push(doc.docType);
      } else {
        missingDocTypes.push(doc.docType);
      }
    } else {
      notApplicableDocTypes.push(doc.docType);
    }
  }

  const isComplete = missingDocTypes.length === 0;
  const totalRequired = requiredDocTypes.length;
  const uploadedCount = presentDocTypes.length;
  const completenessRate = totalRequired > 0 ? Math.round((uploadedCount / totalRequired) * 100) : 0;

  // Specific missing document flags
  const missingPassbook = docDetails['Bank Passbook Front Page'].isMissing;
  const missingAadhaar = docDetails['Aadhaar Card'].isMissing;
  const missingPhoto = docDetails['Passport Size Photo'].isMissing;
  const missingSignature = docDetails['Caregiver Signature'].isMissing;
  const missingSchoolDoc =
    docDetails['School Fee Receipt'].isMissing || docDetails['Academic Marksheet'].isMissing;

  // Approval status
  const rawApproved =
    it['67\nApproved Alliance India'] ||
    it['67\\nApproved Alliance India'] ||
    it['Approved Alliance India'] ||
    it['approved alliance india'] ||
    it.approvedAllianceIndia ||
    it.approved_alliance_india ||
    it.finalReview?.approvedAllianceIndia ||
    it.raw_payload?.finalReview?.approvedAllianceIndia;
  const { status: approvalStatus, isApproved } = normalizeApprovalStatus(rawApproved);

  // Orphan classification
  const rawOrphan =
    it['13\nOrphan Status'] ||
    it['orphan status'] ||
    it.demographics?.orphanStatus ||
    it.orphan_status ||
    it.orphanStatus;
  const orphanClassification = classifyOrphanStatus(rawOrphan);

  // Safe numeric preservation (never coerce missing to zero)
  const rawAge = it['11\nAge'] ?? it['age'] ?? it.demographics?.calculatedAgeYears ?? it.calculated_age ?? it.age;
  const age: number | null = rawAge !== undefined && rawAge !== null && rawAge !== '' && !isNaN(Number(rawAge))
    ? Number(rawAge)
    : null;

  const rawBmi = it['34\nBMI'] ?? it['bmi'] ?? it.nutrition?.bmi ?? it.clinical?.bmi ?? it.bmi;
  const bmi: number | null = rawBmi !== undefined && rawBmi !== null && rawBmi !== '' && !isNaN(Number(rawBmi))
    ? Number(rawBmi)
    : null;

  const rawVl = it['45\nViral Load'] ?? it['viral load'] ?? it.clinical?.viralLoad ?? it.clinical?.viralload ?? it.viralload ?? it.viralLoad;
  const viralLoad: string | null = rawVl !== undefined && rawVl !== null && String(rawVl).trim() !== ''
    ? String(rawVl)
    : null;

  const rawHb = it['36\nHemoglobin (g/dL)'] ?? it['hemoglobin (g/dl)'] ?? it.clinical?.hemoglobin ?? it.clinical?.haemoglobin ?? it.hemoglobin;
  const hemoglobin: string | null = rawHb !== undefined && rawHb !== null && String(rawHb).trim() !== ''
    ? String(rawHb)
    : null;

  const rawGrant = it['63\nTotal Annual Education Cost'] ?? it['total annual education cost'] ?? it.grantCalculation?.totalGrantAmount ?? it.recommended_grant_amount ?? it.educationExpenses?.totalRequiredSupport ?? it.grantAmount ?? 0;
  const grantAmount = Number(rawGrant) || 0;

  // Clinical Alerts: using canonical thresholds without inventing new ones
  const alerts: string[] = [];
  const bmiCat = (it['35\nBMI Category'] || it['bmi category'] || it.bmiCategory || '').toString();
  const isSevereUnderweight =
    bmiCat === 'Severe Underweight' || (bmi !== null && bmi > 0 && bmi < 13.5);
  if (isSevereUnderweight) alerts.push('Severe Underweight');

  const vlCat = (it['46\nVL Category'] || it['vl category'] || it.vlCategory || '').toString();
  const numVl = viralLoad ? parseFloat(viralLoad.replace(/[^0-9.]/g, '')) : NaN;
  const isHighViralLoad =
    vlCat.includes('Unsuppressed') || vlCat.includes('High') || (!isNaN(numVl) && numVl >= 1000);
  if (isHighViralLoad) alerts.push(`Unsuppressed Viral Load${viralLoad ? ` (${viralLoad})` : ''}`);

  const hbCat = (it['37\nHb Category'] || it['hb category'] || it.hbCategory || '').toString();
  const numHb = hemoglobin ? parseFloat(hemoglobin) : NaN;
  const isSevereAnemia =
    hbCat === 'Severe Anemia' || (!isNaN(numHb) && numHb > 0 && numHb < 7.0);
  if (isSevereAnemia) alerts.push(`Severe Anemia${hemoglobin ? ` (${hemoglobin} g/dL)` : ''}`);

  const clinicalAlert: ClinicalAlertInfo = {
    hasAlert: alerts.length > 0,
    alerts,
    isSevereUnderweight,
    isHighViralLoad,
    isSevereAnemia,
  };

  return {
    recordId: id,
    artNumber,
    childName,
    requiredDocTypes,
    presentDocTypes,
    missingDocTypes,
    notApplicableDocTypes,
    docDetails,
    isComplete,
    totalRequired,
    uploadedCount,
    completenessRate,
    missingPassbook,
    missingAadhaar,
    missingPhoto,
    missingSignature,
    missingSchoolDoc,
    approvalStatus,
    isApproved,
    orphanClassification,
    isEnrolledInSchool: isEnrolled,
    isOutOfSchool,
    clinicalAlert,
    age,
    bmi,
    viralLoad,
    hemoglobin,
    grantAmount,
  };
}

/**
 * Deduplicates multiple longitudinal assessments for the same child under the
 * established NACO/Alliance ART identity rule.
 * 
 * Invariants:
 * - Namespaces ART IDs by administrative scope (State : District : ART) to prevent
 *   cross-state, cross-centre, or cross-district collisions of identical local ART IDs.
 * - If ART number is missing, generic fallback ('MH-BEN-00', 'BEN-00', 'BEN-UNKNOWN'), or empty,
 *   records are preserved as distinct assessment records using unique record ID (never guess or merge by name).
 * - Current-assessment selection rule: established visit chronology (lastVisit, visitDate,
 *   dateOfFilling, createdAt) takes precedence. Per-record edit revision numbers are local
 *   and NOT compared as global visit chronology.
 * - When visit dates are identical, tie-broken by latest modification (updatedAt), then version, then ID.
 */
export function deduplicateRecordsByChild<T extends {
  id: string;
  artNumber: string;
  state?: string;
  district?: string;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  lastVisit?: string;
}>(records: T[]): {
  distinctRecords: T[];
  totalAssessments: number;
  hasDuplicates: boolean;
  duplicateCount: number;
  hasReliableChildIdentity: boolean;
} {
  const totalAssessments = records.length;
  if (totalAssessments <= 1) {
    const rawArt = records[0] ? (records[0].artNumber || '').trim().toUpperCase() : '';
    const isGeneric =
      !rawArt ||
      rawArt === 'MH-BEN-00' ||
      rawArt === 'BEN-00' ||
      rawArt === 'BEN-UNKNOWN' ||
      rawArt === '—' ||
      rawArt === '-';
    return {
      distinctRecords: records,
      totalAssessments,
      hasDuplicates: false,
      duplicateCount: 0,
      hasReliableChildIdentity: totalAssessments === 1 ? !isGeneric : true,
    };
  }

  const childGroups = new Map<string, T[]>();
  let reliableIdentityFound = false;

  for (const record of records) {
    const rawArt = (record.artNumber || (record as any)['42\nART ID Number'] || '').trim().toUpperCase();
    const isGenericArt =
      !rawArt ||
      rawArt === 'MH-BEN-00' ||
      rawArt === 'BEN-00' ||
      rawArt === 'BEN-UNKNOWN' ||
      rawArt === '—' ||
      rawArt === '-';

    if (!isGenericArt) {
      reliableIdentityFound = true;
    }

    // Namespace child identity by administrative scope (State : District : ART)
    // to strictly prevent cross-state/centre/programme collisions of identical ART numbers.
    // If ART is generic, preserve record identity using unique record ID (never guess or merge by name).
    const stateScope = (
      (record.state || (record as any)['18\nState'] || (record as any).demographics?.state || '') as string
    ).trim().toUpperCase();
    const distScope = (
      (record.district || (record as any)['19\nDistrict'] || (record as any).demographics?.district || '') as string
    ).trim().toUpperCase();

    const childKey = isGenericArt
      ? `ID:${record.id}`
      : `ART:${stateScope || 'GLOBAL'}:${distScope || 'ALL'}:${rawArt}`;

    const existing = childGroups.get(childKey) || [];
    existing.push(record);
    childGroups.set(childKey, existing);
  }

  const distinctRecords: T[] = [];
  let duplicateCount = 0;

  for (const group of childGroups.values()) {
    if (group.length === 1) {
      distinctRecords.push(group[0]);
    } else {
      duplicateCount += group.length - 1;
      // Current-assessment selection rule:
      // Uses established visit chronology first (lastVisit, visitDate, dateOfFilling, createdAt, submissionTime).
      // Per-record revisions/versions are local edit counters and are NOT compared as global visit chronology.
      const sorted = [...group].sort((a, b) => {
        const getVisitTime = (item: any): number => {
          const rawDate =
            item.lastVisit ||
            item.visitDate ||
            item['7\nDate of Assessment'] ||
            item['Date of Assessment'] ||
            item.dateOfFilling ||
            item.submissionTime ||
            item.createdAt;
          if (!rawDate) return 0;
          const parsed = new Date(rawDate).getTime();
          return isNaN(parsed) ? 0 : parsed;
        };

        const tA = getVisitTime(a);
        const tB = getVisitTime(b);
        if (tA !== tB) return tB - tA; // Later visit date wins

        // Tie-breaker for identical visit dates: latest record modification timestamp
        const getUpdateTime = (item: any): number => {
          const rawDate = item.updatedAt || item.createdAt;
          if (!rawDate) return 0;
          const parsed = new Date(rawDate).getTime();
          return isNaN(parsed) ? 0 : parsed;
        };
        const uA = getUpdateTime(a);
        const uB = getUpdateTime(b);
        if (uA !== uB) return uB - uA;

        // Tie-breaker: revision/version number
        const vA = a.version || 1;
        const vB = b.version || 1;
        if (vA !== vB) return vB - vA;

        // Stable deterministic tie-breaker
        return String(b.id).localeCompare(String(a.id));
      });
      distinctRecords.push(sorted[0]);
    }
  }

  return {
    distinctRecords,
    totalAssessments,
    hasDuplicates: duplicateCount > 0,
    duplicateCount,
    hasReliableChildIdentity: reliableIdentityFound,
  };
}

export interface ReadinessSummary {
  // Population
  total: number; // distinct children matching filters
  totalAssessments: number; // raw assessment count
  totalInScope: number; // distinct children in authorized scope
  hasDuplicates: boolean;
  hasReliableChildIdentity: boolean;

  // Documents
  completeDocsCount: number;
  incompleteDocsCount: number;
  completenessRate: number; // Math.round((completeDocsCount / total) * 100)

  // Granular Missing Bottlenecks
  missingPassbook: number;
  missingAadhaar: number;
  missingPhoto: number;
  missingSignature: number;
  missingSchoolDoc: number;

  // Vulnerability
  doubleOrphans: number;
  singleOrphans: number;
  bothParentsAlive: number;
  outOfSchool: number;

  // Clinical alerts
  clinicalAlerts: number;

  // Approval
  approvedCount: number;
  pendingApprovalCount: number;
  rejectedApprovalCount: number;
  unknownApprovalCount: number;
  approvalRate: number; // Math.round((approvedCount / total) * 100)

  // Explicit Context Strings & Metadata
  contextLabel: string;
  metricDocumentation: {
    completenessFormula: string;
    approvalFormula: string;
    deduplicationRule: string;
  };
}

/**
 * Calculates aggregate linelist metrics strictly from the complete matching dataset
 * under the canonical distinct child identity rule.
 */
export function computeReadinessAggregates(
  records: any[],
  totalInScopeRecords?: number
): ReadinessSummary {
  // 1. Deduplicate by canonical child identity
  const { distinctRecords, totalAssessments, hasDuplicates, hasReliableChildIdentity } = deduplicateRecordsByChild(records);
  const total = distinctRecords.length;

  const totalInScope = totalInScopeRecords !== undefined ? totalInScopeRecords : total;
  const noun = hasReliableChildIdentity ? 'children' : 'assessment records';

  if (total === 0) {
    return {
      total: 0,
      totalAssessments: 0,
      totalInScope,
      hasDuplicates: false,
      hasReliableChildIdentity,
      completeDocsCount: 0,
      incompleteDocsCount: 0,
      completenessRate: 0,
      missingPassbook: 0,
      missingAadhaar: 0,
      missingPhoto: 0,
      missingSignature: 0,
      missingSchoolDoc: 0,
      doubleOrphans: 0,
      singleOrphans: 0,
      bothParentsAlive: 0,
      outOfSchool: 0,
      clinicalAlerts: 0,
      approvedCount: 0,
      pendingApprovalCount: 0,
      rejectedApprovalCount: 0,
      unknownApprovalCount: 0,
      approvalRate: 0,
      contextLabel: `0 ${noun} matching filters, from ${totalInScope} ${noun} in your authorized scope.`,
      metricDocumentation: {
        completenessFormula: 'Numerator: children with all applicable documents present. Denominator: distinct children in matching filter set.',
        approvalFormula: 'Numerator: approved distinct children. Denominator: distinct children in matching filter set.',
        deduplicationRule: 'Latest assessment per canonical child identity namespace (visit chronology timestamp, tie-broken by modification date and version).',
      },
    };
  }

  let completeDocsCount = 0;
  let missingPassbook = 0;
  let missingAadhaar = 0;
  let missingPhoto = 0;
  let missingSignature = 0;
  let missingSchoolDoc = 0;

  let doubleOrphans = 0;
  let singleOrphans = 0;
  let bothParentsAlive = 0;
  let outOfSchool = 0;
  let clinicalAlerts = 0;

  let approvedCount = 0;
  let pendingApprovalCount = 0;
  let rejectedApprovalCount = 0;
  let unknownApprovalCount = 0;

  for (const r of distinctRecords) {
    const readiness = (r as any).readiness || deriveBeneficiaryReadiness(r);

    // Document status
    if (readiness.isComplete) {
      completeDocsCount++;
    }
    if (readiness.missingPassbook) missingPassbook++;
    if (readiness.missingAadhaar) missingAadhaar++;
    if (readiness.missingPhoto) missingPhoto++;
    if (readiness.missingSignature) missingSignature++;
    if (readiness.missingSchoolDoc) missingSchoolDoc++;

    // Orphan status
    if (readiness.orphanClassification === 'Double orphan') doubleOrphans++;
    else if (readiness.orphanClassification === 'Single orphan') singleOrphans++;
    else if (readiness.orphanClassification === 'Both parents alive') bothParentsAlive++;

    // School status
    if (readiness.isOutOfSchool) outOfSchool++;

    // Clinical alerts
    if (readiness.clinicalAlert.hasAlert) clinicalAlerts++;

    // Approval status
    if (readiness.approvalStatus === 'Approved') approvedCount++;
    else if (readiness.approvalStatus === 'Rejected') rejectedApprovalCount++;
    else if (readiness.approvalStatus === 'Pending') pendingApprovalCount++;
    else unknownApprovalCount++;
  }

  const completenessRate = Math.round((completeDocsCount / total) * 100);
  const incompleteDocsCount = total - completeDocsCount;
  const approvalRate = Math.round((approvedCount / total) * 100);

  const contextLabel = `${total} ${noun} matching filters, from ${totalInScope} ${noun} in your authorized scope.`;

  return {
    total,
    totalAssessments,
    totalInScope,
    hasDuplicates,
    hasReliableChildIdentity,
    completeDocsCount,
    incompleteDocsCount,
    completenessRate,
    missingPassbook,
    missingAadhaar,
    missingPhoto,
    missingSignature,
    missingSchoolDoc,
    doubleOrphans,
    singleOrphans,
    bothParentsAlive,
    outOfSchool,
    clinicalAlerts,
    approvedCount,
    pendingApprovalCount,
    rejectedApprovalCount,
    unknownApprovalCount,
    approvalRate,
    contextLabel,
    metricDocumentation: {
      completenessFormula: 'Numerator: children with all applicable documents present. Denominator: distinct children in matching filter set.',
      approvalFormula: 'Numerator: approved distinct children. Denominator: distinct children in matching filter set.',
      deduplicationRule: 'Latest assessment per canonical child identity namespace (visit chronology timestamp, tie-broken by modification date and version).',
    },
  };
}
