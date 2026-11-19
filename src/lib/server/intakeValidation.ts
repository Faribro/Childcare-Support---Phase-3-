import { validateSubmissionAttachments } from './assetValidation';
import { validateCategories, type SupportCategory } from '../assessment/categoryApplicability';

export interface ServerIntakeValidationError {
  field: string;
  issue: string;
  code: string;
}

export interface ServerIntakeValidationResult {
  valid: boolean;
  statusCode?: 413 | 415 | 422;
  code?: string;
  message?: string;
  errors: ServerIntakeValidationError[];
}

function getStr(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Checks whether the submission includes at least one Document Verification Proof
 * (school fee receipt photo OR marksheet photo OR remarks of at least 3 characters).
 */
export function hasValidDocumentVerificationProof(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const ee = payload.educationExpenses && typeof payload.educationExpenses === 'object' ? payload.educationExpenses : {};
  const feeReceipt = getStr(ee.feeReceiptPhotoUrl) || getStr(payload.feeReceiptPhotoUrl);
  const marksheet = getStr(ee.marksheetPhotoUrl) || getStr(payload.marksheetPhotoUrl);
  const remarks = getStr(ee.remarks) || getStr(payload.remarks);

  return feeReceipt.length > 0 || marksheet.length > 0 || remarks.length >= 3;
}

/**
 * Validates required fields, attachment limits (2.5MB & MIME allowlist), and
 * Document Verification Proofs on API submission & sync routes.
 */
export function validateServerSubmissionIntake(
  rawBody: Record<string, any> | undefined | null
): ServerIntakeValidationResult {
  if (!rawBody || typeof rawBody !== 'object') {
    return {
      valid: false,
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Request body must be a valid JSON object.',
      errors: [{ field: 'body', issue: 'Invalid JSON payload', code: 'INVALID_BODY' }],
    };
  }

  // 1. Enforce 2.5MB upload size & MIME allowlist on all inline photo/signature slots
  const attachmentRes = validateSubmissionAttachments(rawBody);
  if (!attachmentRes.valid) {
    return {
      valid: false,
      statusCode: attachmentRes.statusCode || 422,
      code: attachmentRes.code || 'INVALID_ASSET',
      message: attachmentRes.message || 'Uploaded attachment exceeds limits or uses an unsupported format.',
      errors: [
        {
          field: attachmentRes.field || 'attachments',
          issue: attachmentRes.message || 'Invalid attachment',
          code: attachmentRes.code || 'INVALID_ASSET',
        },
      ],
    };
  }

  const errors: ServerIntakeValidationError[] = [];
  const demo = rawBody.demographics && typeof rawBody.demographics === 'object' ? rawBody.demographics : {};

  // 2. Core required child/caregiver/location fields (always required)
  if (getStr(demo.artNumber).length < 3) {
    errors.push({ field: 'demographics.artNumber', issue: 'ART / Reference ID must be at least 3 characters.', code: 'REQUIRED' });
  }
  if (getStr(demo.childName).length < 2) {
    errors.push({ field: 'demographics.childName', issue: 'Child full name is required.', code: 'REQUIRED' });
  }
  if (!getStr(demo.dob)) {
    errors.push({ field: 'demographics.dob', issue: 'Date of Birth is required.', code: 'REQUIRED' });
  }
  if (getStr(demo.caregiverName).length < 2) {
    errors.push({ field: 'demographics.caregiverName', issue: 'Caregiver name is required.', code: 'REQUIRED' });
  }
  if (getStr(demo.caregiverRelationship).length < 2) {
    errors.push({ field: 'demographics.caregiverRelationship', issue: 'Caregiver relationship is required.', code: 'REQUIRED' });
  }

  // Phone requirement (unless explicitly marked noPhoneAvailable)
  const phone = getStr(demo.contactNumber) || getStr(demo.caregiverPhone);
  const noPhoneAvailable = demo.noPhoneAvailable === true;
  if (!noPhoneAvailable && !phone) {
    errors.push({
      field: 'demographics.contactNumber',
      issue: 'Caregiver contact number is required unless "No phone available" is checked.',
      code: 'REQUIRED',
    });
  } else if (phone && !/^[6-9]\d{9}$/.test(phone)) {
    errors.push({
      field: 'demographics.contactNumber',
      issue: 'Contact number must be a valid 10-digit Indian mobile number starting with 6-9.',
      code: 'INVALID_FORMAT',
    });
  }

  // District check
  if (!getStr(demo.district)) {
    errors.push({ field: 'demographics.district', issue: 'District is required.', code: 'REQUIRED' });
  }

  // Modern Phase 3 vs legacy schema distinction
  const isModernIntake =
    rawBody.educationExpenses !== undefined ||
    rawBody.educationStatus !== undefined ||
    rawBody.finalReview !== undefined ||
    rawBody.caregiverConsent !== undefined ||
    rawBody.declaration === undefined;

  if (isModernIntake) {
    // 3. Consent enforcement (must explicitly confirm consent)
    const hasConsent =
      rawBody.caregiverConsent?.consentProvided === true ||
      rawBody.consent?.agreeToParticipate === true ||
      rawBody.declaration?.consentAcknowledged === true;
    if (!hasConsent) {
      errors.push({
        field: 'caregiverConsent.consentProvided',
        issue: 'Caregiver consent confirmation is required.',
        code: 'REQUIRED',
      });
    }

    // 4. Final Review attestation enforcement
    const hasFinalConfirmation =
      rawBody.finalReview?.allInfoCorrect === true ||
      rawBody.reviewConfirmed === true ||
      rawBody.declaration?.consentAcknowledged === true;
    if (!hasFinalConfirmation) {
      errors.push({
        field: 'finalReview.allInfoCorrect',
        issue: 'Final review confirmation ("all information is correct") is required.',
        code: 'REQUIRED',
      });
    }

    // Support Categories Validation & Organisation Credentials enforcement (Schema V3)
    const isV3 = rawBody.schemaVersion === 3 || rawBody.supportCategories !== undefined;
    let validatedCategories: SupportCategory[] = [];
    if (isV3) {
      const finalReviewObj = (rawBody.finalReview && typeof rawBody.finalReview === 'object') ? rawBody.finalReview : rawBody;
      const orgName = getStr(finalReviewObj.organizationName);
      const orgEmail = getStr(finalReviewObj.organizationEmail);
      if (!orgName) {
        errors.push({
          field: 'finalReview.organizationName',
          issue: 'Authenticated caseworker organisation name is required from profile.',
          code: 'REQUIRED',
        });
      }
      if (!orgEmail || !orgEmail.includes('@')) {
        errors.push({
          field: 'finalReview.organizationEmail',
          issue: 'Authenticated caseworker verified email is required from profile.',
          code: 'REQUIRED',
        });
      }

      if (!Array.isArray(rawBody.supportCategories) || rawBody.supportCategories.length === 0) {
        errors.push({
          field: 'supportCategories',
          issue: 'Select at least one support category to continue.',
          code: 'CATEGORY_REQUIRED',
        });
      } else {
        const valid = validateCategories(rawBody.supportCategories);
        if (!valid) {
          errors.push({
            field: 'supportCategories',
            issue: 'Invalid or unknown support category in submission payload.',
            code: 'INVALID_CATEGORY',
          });
        } else {
          validatedCategories = valid;
        }
      }
    }

    // 5. Document Verification Proofs rule:
    // Enforced ONLY when Education support is requested (or in legacy schema v2).
    const isEducationApplicable = !isV3 || validatedCategories.includes('education');
    if (isEducationApplicable) {
      if (!hasValidDocumentVerificationProof(rawBody)) {
        errors.push({
          field: 'educationExpenses.feeReceiptPhotoUrl',
          issue:
            'Document verification proof is required: upload a school fee receipt or marksheet photo, or provide remarks (at least 3 characters).',
          code: 'DOCUMENT_PROOF_REQUIRED',
        });
      }
    }

    // 6. Paper Form A12 structured address required fields (when modern structured address fields are present or finalReview exists without legacy mock state)
    const hasStructuredAddress =
      demo.residenceType !== undefined ||
      demo.doorAndColony !== undefined ||
      demo.street !== undefined ||
      demo.villageCity !== undefined ||
      demo.talukMandalBlock !== undefined ||
      demo.pinCode !== undefined;

    if (hasStructuredAddress) {
      if (!getStr(demo.state)) {
        errors.push({ field: 'demographics.state', issue: 'State / UT is required.', code: 'REQUIRED' });
      }
      if (!getStr(demo.residenceType)) {
        errors.push({ field: 'demographics.residenceType', issue: 'Type of residence is required.', code: 'REQUIRED' });
      }
      if (!getStr(demo.doorAndColony)) {
        errors.push({ field: 'demographics.doorAndColony', issue: 'Door No. / Colony / Apartment is required.', code: 'REQUIRED' });
      }
      if (!getStr(demo.street)) {
        errors.push({ field: 'demographics.street', issue: 'Street is required.', code: 'REQUIRED' });
      }
      if (!getStr(demo.villageCity)) {
        errors.push({ field: 'demographics.villageCity', issue: 'Village / City is required.', code: 'REQUIRED' });
      }
      if (!getStr(demo.talukMandalBlock)) {
        errors.push({ field: 'demographics.talukMandalBlock', issue: 'Taluk / Mandal / Block is required.', code: 'REQUIRED' });
      }
      if (!/^[1-9]\d{5}$/.test(getStr(demo.pinCode))) {
        errors.push({ field: 'demographics.pinCode', issue: 'A valid 6-digit Pin Code is required.', code: 'REQUIRED' });
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: errors[0].issue,
      errors,
    };
  }

  return { valid: true, errors: [] };
}
