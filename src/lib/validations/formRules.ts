/**
 * formRules.ts
 *
 * Single Source of Truth for Intake Form Required Fields,
 * Clinical Skip Logic, and Payload Sanitization.
 * Version: 2 (Intake Form Schema V2)
 */

import { FormValidationError, FIELD_REGISTRY } from './formValidationRegistry';
import { isCurrentRegimenApplicable } from '../clinical/artStatusLogic';

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Returns true if the given fieldKey is currently applicable/visible
 * based on skip logic and parent answer conditions.
 */
export function isFieldApplicable(fieldKey: string, data: Record<string, any>): boolean {
  // Clinical / Health Skip Logic
  if (
    fieldKey === 'health.artInitiationDate' ||
    fieldKey === 'health.artIdNumber' ||
    fieldKey === 'artInitiationDate' ||
    fieldKey === 'artIdNumber'
  ) {
    return data.artStatus === 'On ART';
  }

  if (
    fieldKey === 'health.currentlyOnArt' ||
    fieldKey === 'currentlyOnArt'
  ) {
    return data.artStatus === 'Transferred In';
  }

  if (
    fieldKey === 'health.artMedicineType' ||
    fieldKey === 'artMedicineType'
  ) {
    return isCurrentRegimenApplicable(data.artStatus, data.currentlyOnArt);
  }

  if (
    fieldKey === 'health.vlDate' ||
    fieldKey === 'health.viralLoad' ||
    fieldKey === 'vlDate' ||
    fieldKey === 'viralLoad'
  ) {
    const status = data.vlStatus || '';
    return status.startsWith('Suppressed') || status.startsWith('Unsuppressed');
  }

  if (
    fieldKey === 'health.disabilityType' ||
    fieldKey === 'health.disabilityCertificateStatus' ||
    fieldKey === 'disabilityType' ||
    fieldKey === 'disabilityCertificateStatus'
  ) {
    return data.hasDisability === 'Yes';
  }

  // Education Skip Logic
  if (
    fieldKey === 'educationStatus.schoolName' ||
    fieldKey === 'educationStatus.schoolType' ||
    fieldKey === 'educationStatus.currentClass' ||
    fieldKey === 'educationStatus.attendance' ||
    fieldKey === 'schoolName' ||
    fieldKey === 'schoolType' ||
    fieldKey === 'currentClass' ||
    fieldKey === 'attendance'
  ) {
    return data.educationStatus === 'Currently going to school';
  }

  if (
    fieldKey === 'educationStatus.currentClassSpecify' ||
    fieldKey === 'currentClassSpecify'
  ) {
    return data.educationStatus === 'Currently going to school' && data.currentClass === 'Other (specify)';
  }

  // Banking Section: Optional at intake, collected after supervisor approval
  if (fieldKey.startsWith('bankingAndKyc.') || fieldKey.startsWith('banking.')) {
    return true; // visible, but not mandatory at submit
  }

  // All other core intake fields are applicable
  return true;
}

/**
 * Strips stale or hidden skip-logic fields from the payload prior to submission.
 */
export function sanitizeSubmissionPayload<T extends Record<string, any>>(data: T): T {
  const sanitized = { ...data };

  // 1. Clinical Health Sanitization
  if (sanitized.artStatus !== 'On ART') {
    if (sanitized.artStatus !== 'Transferred In') {
      delete sanitized.artInitiationDate;
      delete sanitized.artIdNumber;
      delete sanitized.currentlyOnArt;
      delete sanitized.artMedicineType;
    } else {
      // Transferred In
      delete sanitized.artInitiationDate;
      delete sanitized.artIdNumber;
      const isTaking =
        sanitized.currentlyOnArt === true ||
        sanitized.currentlyOnArt === 'Yes' ||
        sanitized.currentlyOnArt === 'true';
      if (!isTaking) {
        delete sanitized.artMedicineType;
      }
    }
  }

  // Viral load
  const vlStatus = sanitized.vlStatus || '';
  if (!vlStatus.startsWith('Suppressed') && !vlStatus.startsWith('Unsuppressed')) {
    delete sanitized.vlDate;
    delete sanitized.viralLoad;
    delete sanitized.vlCategory;
  }

  // Disability
  if (sanitized.hasDisability !== 'Yes') {
    delete sanitized.disabilityType;
    delete sanitized.disabilityCertificateStatus;
  }

  // 2. Education Sanitization
  if (sanitized.educationStatus !== 'Currently going to school') {
    delete sanitized.schoolName;
    delete sanitized.schoolSessionStartDate;
    delete sanitized.schoolType;
    delete sanitized.currentClass;
    delete sanitized.currentClassSpecify;
    delete sanitized.attendance;
    delete sanitized.receivingEducationSchemeBenefit;
  } else if (sanitized.currentClass !== 'Other (specify)') {
    delete sanitized.currentClassSpecify;
  }

  // Also sanitize nested objects if present
  const anySanitized = sanitized as Record<string, any>;
  if (anySanitized.health && typeof anySanitized.health === 'object') {
    anySanitized.health = sanitizeSubmissionPayload(anySanitized.health);
  }
  if (anySanitized.educationStatus && typeof anySanitized.educationStatus === 'object') {
    anySanitized.educationStatus = sanitizeSubmissionPayload(anySanitized.educationStatus);
  }

  return sanitized;
}

/**
 * Validates a single field by key on blur.
 * Returns a FormValidationError if invalid, or null if valid.
 */
export function validateField(
  fieldKey: string,
  data: Record<string, any>,
  hasSavedSignature: boolean = false
): FormValidationError | null {
  // If field is not applicable due to skip logic, it is never invalid
  if (!isFieldApplicable(fieldKey, data)) {
    return null;
  }

  const reg = FIELD_REGISTRY[fieldKey] || {
    sectionKey: 'demographics',
    elementId: fieldKey,
    label: fieldKey,
    order: 999,
  };

  const createErr = (message: string): FormValidationError => ({
    path: fieldKey.split('.'),
    fieldKey,
    sectionKey: reg.sectionKey,
    message,
    label: reg.label,
    elementId: reg.elementId,
  });

  // Consent
  if (fieldKey === 'caregiverConsent.consentProvided' || fieldKey === 'agreeToParticipate') {
    if (data.agreeToParticipate !== true && data.consentProvided !== true) {
      return createErr('Caregiver consent must be confirmed before this assessment can be submitted.');
    }
  }

  if (fieldKey === 'caregiverConsent.signature' || fieldKey === 'signatureDataUrl') {
    if (!hasSavedSignature && !data.signatureDataUrl && !data.signatureAssetId) {
      return createErr('Please save the caregiver signature before submitting.');
    }
  }

  if (fieldKey === 'caregiverConsent.caregiverName' || fieldKey === 'caregiverName') {
    const val = (data.caregiverName || '').trim();
    if (val.length < 2) {
      return createErr('Caregiver name is required (at least 2 characters).');
    }
  }

  if (fieldKey === 'caregiverConsent.caregiverRelationship' || fieldKey === 'caregiverRelationship') {
    const val = (data.caregiverRelationship || '').trim();
    if (val.length < 2) {
      return createErr('Caregiver relationship is required.');
    }
  }

  if (fieldKey === 'demographics.artNumber' || fieldKey === 'artNumber') {
    const val = (data.artNumber || '').trim();
    if (val.length < 3) {
      return createErr('Reference ID must be at least 3 characters.');
    }
  }

  if (fieldKey === 'demographics.childName' || fieldKey === 'childName') {
    const val = (data.childName || '').trim();
    if (val.length < 2) {
      return createErr('Child full name is required (at least 2 characters).');
    }
  }

  if (fieldKey === 'demographics.dob' || fieldKey === 'dob') {
    const val = data.dob;
    if (!val) {
      return createErr('Date of birth is required.');
    }
    const d = new Date(val);
    if (isNaN(d.getTime()) || d > new Date()) {
      return createErr('Date of birth cannot be in the future.');
    }
  }

  if (fieldKey === 'demographics.gender' || fieldKey === 'gender') {
    if (!data.gender) {
      return createErr('Child gender must be selected.');
    }
  }

  if (fieldKey === 'demographics.orphanStatus' || fieldKey === 'orphanStatus') {
    if (!data.orphanStatus) {
      return createErr('Orphan status must be selected.');
    }
  }

  if (fieldKey === 'demographics.contactNumber' || fieldKey === 'contactNumber') {
    const val = (data.contactNumber || data.caregiverPhone || '').trim();
    if (!val || !/^[6-9]\d{9}$/.test(val)) {
      return createErr('Must be a valid 10-digit Indian mobile number starting with 6-9.');
    }
  }

  if (fieldKey === 'demographics.fullAddress' || fieldKey === 'fullAddress') {
    const val = (data.fullAddress || '').trim();
    if (val.length < 2) {
      return createErr('Residential address is required (at least 2 characters).');
    }
  }

  if (fieldKey === 'demographics.state' || fieldKey === 'state') {
    const val = (data.state || '').trim();
    if (val.length < 2) {
      return createErr('State / Union Territory is required.');
    }
  }

  if (fieldKey === 'demographics.district' || fieldKey === 'district') {
    const val = (data.district || '').trim();
    if (val.length < 2) {
      return createErr('District is required.');
    }
  }

  // Household
  if (fieldKey === 'householdFinancial.totalFamilyMembers' || fieldKey === 'totalFamilyMembers') {
    const val = Number(data.totalFamilyMembers);
    if (isNaN(val) || val < 1) {
      return createErr('Total family members must be at least 1.');
    }
  }

  if (fieldKey === 'householdFinancial.numberOfChildrenUnder18' || fieldKey === 'numberOfChildrenUnder18') {
    const val = Number(data.numberOfChildrenUnder18);
    if (isNaN(val) || val < 0) {
      return createErr('Number of children under 18 must be 0 or more.');
    }
  }

  if (fieldKey === 'householdFinancial.monthlyIncomeRs' || fieldKey === 'monthlyIncomeRs') {
    const val = Number(data.monthlyIncomeRs);
    if (isNaN(val) || val < 0) {
      return createErr('Monthly income must be 0 or more.');
    }
  }

  if (fieldKey === 'householdFinancial.mainSourceOfIncome' || fieldKey === 'mainSourceOfIncome') {
    if (!data.mainSourceOfIncome) {
      return createErr('Main source of income must be selected.');
    }
  }

  // Clinical Health
  if (fieldKey === 'health.weightKg' || fieldKey === 'weightKg') {
    const val = Number(data.weightKg);
    if (isNaN(val) || val <= 0 || val > 150) {
      return createErr('Weight must be between 0.1 and 150 kg.');
    }
  }

  if (fieldKey === 'health.heightCm' || fieldKey === 'heightCm') {
    const val = Number(data.heightCm);
    if (isNaN(val) || val <= 0 || val > 220) {
      return createErr('Height must be between 1 and 220 cm.');
    }
  }

  if (fieldKey === 'health.haemoglobinGdl' || fieldKey === 'haemoglobinGdl') {
    const val = Number(data.haemoglobinGdl);
    if (isNaN(val) || val <= 0 || val > 25) {
      return createErr('Haemoglobin must be between 0.1 and 25 g/dL.');
    }
  }

  if (fieldKey === 'health.artStatus' || fieldKey === 'artStatus') {
    if (!data.artStatus) {
      return createErr('ART status must be selected.');
    }
  }

  if (fieldKey === 'health.artInitiationDate' || fieldKey === 'artInitiationDate') {
    if (data.artStatus === 'On ART' && !data.artInitiationDate) {
      return createErr('ART initiation date is required when child is On ART.');
    }
  }

  if (fieldKey === 'health.artIdNumber' || fieldKey === 'artIdNumber') {
    if (data.artStatus === 'On ART' && (!data.artIdNumber || data.artIdNumber.trim().length < 2)) {
      return createErr('ART ID Number is required when child is On ART.');
    }
  }

  if (fieldKey === 'health.artMedicineType' || fieldKey === 'artMedicineType') {
    if (isCurrentRegimenApplicable(data.artStatus, data.currentlyOnArt)) {
      if (!data.artMedicineType || data.artMedicineType.trim().length === 0) {
        return createErr('Current ART regimen is required.');
      }
    }
  }

  if (fieldKey === 'health.currentlyOnArt' || fieldKey === 'currentlyOnArt') {
    if (data.artStatus === 'Transferred In' && data.currentlyOnArt === undefined) {
      return createErr('Please confirm whether the child is currently taking ART.');
    }
  }

  if (fieldKey === 'health.vlDate' || fieldKey === 'vlDate') {
    const status = data.vlStatus || '';
    if ((status.startsWith('Suppressed') || status.startsWith('Unsuppressed')) && !data.vlDate) {
      return createErr('Viral load test date is required.');
    }
  }

  if (fieldKey === 'health.viralLoad' || fieldKey === 'viralLoad') {
    const status = data.vlStatus || '';
    if ((status.startsWith('Suppressed') || status.startsWith('Unsuppressed')) && (data.viralLoad === undefined || data.viralLoad === '')) {
      return createErr('Viral load count (copies/mL) is required.');
    }
  }

  if (fieldKey === 'health.disabilityType' || fieldKey === 'disabilityType') {
    if (data.hasDisability === 'Yes' && (!data.disabilityType || data.disabilityType.trim().length === 0)) {
      return createErr('Please specify the type of disability.');
    }
  }

  if (fieldKey === 'health.disabilityCertificateStatus' || fieldKey === 'disabilityCertificateStatus') {
    if (data.hasDisability === 'Yes' && !data.disabilityCertificateStatus) {
      return createErr('Please specify disability certificate status.');
    }
  }

  // Nutrition
  if (fieldKey === 'nutrition.appetite' || fieldKey === 'appetite') {
    if (!data.appetite) {
      return createErr('Appetite level must be selected.');
    }
  }

  if (fieldKey === 'nutrition.mealsPerDay' || fieldKey === 'mealsPerDay') {
    const val = Number(data.mealsPerDay);
    if (isNaN(val) || val < 1 || val > 10) {
      return createErr('Meals per day must be between 1 and 10.');
    }
  }

  // Education
  if (fieldKey === 'educationStatus.educationStatus' || fieldKey === 'educationStatus') {
    if (!data.educationStatus) {
      return createErr('Education status must be selected.');
    }
  }

  if (fieldKey === 'educationStatus.schoolName' || fieldKey === 'schoolName') {
    if (data.educationStatus === 'Currently going to school' && (!data.schoolName || data.schoolName.trim().length < 2)) {
      return createErr('School name is required.');
    }
  }

  if (fieldKey === 'educationStatus.schoolType' || fieldKey === 'schoolType') {
    if (data.educationStatus === 'Currently going to school' && !data.schoolType) {
      return createErr('School type must be selected.');
    }
  }

  if (fieldKey === 'educationStatus.currentClass' || fieldKey === 'currentClass') {
    if (data.educationStatus === 'Currently going to school' && !data.currentClass) {
      return createErr('Current class/grade must be selected.');
    }
  }

  if (fieldKey === 'educationStatus.currentClassSpecify' || fieldKey === 'currentClassSpecify') {
    if (
      data.educationStatus === 'Currently going to school' &&
      data.currentClass === 'Other (specify)' &&
      (!data.currentClassSpecify || data.currentClassSpecify.trim().length === 0)
    ) {
      return createErr('Please specify the class/course.');
    }
  }

  if (fieldKey === 'educationStatus.attendance' || fieldKey === 'attendance') {
    if (data.educationStatus === 'Currently going to school' && !data.attendance) {
      return createErr('Attendance regularity must be selected.');
    }
  }

  // Final Review
  if (fieldKey === 'finalReview.formSubmittedBy' || fieldKey === 'formSubmittedBy') {
    const val = (data.formSubmittedBy || '').trim();
    if (val.length < 2) {
      return createErr('Please enter your name using at least 2 characters.');
    }
  }

  if (fieldKey === 'finalReview.allInfoCorrect' || fieldKey === 'allInfoCorrect') {
    if (data.allInfoCorrect !== true) {
      return createErr('You must confirm that all information is correct before submitting.');
    }
  }

  return null;
}

/**
 * Validates an entire section when the user scrolls past it.
 */
export function validateSection(
  sectionKey: string,
  data: Record<string, any>,
  hasSavedSignature: boolean = false
): FormValidationError[] {
  const errors: FormValidationError[] = [];

  const sectionFields: Record<string, string[]> = {
    consent: [
      'caregiverConsent.consentProvided',
      'caregiverConsent.caregiverName',
      'caregiverConsent.caregiverRelationship',
      'caregiverConsent.signature',
    ],
    demographics: [
      'demographics.artNumber',
      'demographics.childName',
      'demographics.dob',
      'demographics.gender',
      'demographics.orphanStatus',
      'demographics.contactNumber',
      'demographics.fullAddress',
      'demographics.state',
      'demographics.district',
    ],
    banking: [], // Optional at intake
    household: [
      'householdFinancial.totalFamilyMembers',
      'householdFinancial.numberOfChildrenUnder18',
      'householdFinancial.monthlyIncomeRs',
      'householdFinancial.mainSourceOfIncome',
    ],
    health: [
      'health.weightKg',
      'health.heightCm',
      'health.haemoglobinGdl',
      'health.artStatus',
      'health.artInitiationDate',
      'health.artIdNumber',
      'health.artMedicineType',
      'health.currentlyOnArt',
      'health.vlDate',
      'health.viralLoad',
      'health.disabilityType',
      'health.disabilityCertificateStatus',
    ],
    nutrition: [
      'nutrition.appetite',
      'nutrition.mealsPerDay',
    ],
    education: [
      'educationStatus.educationStatus',
      'educationStatus.schoolName',
      'educationStatus.schoolType',
      'educationStatus.currentClass',
      'educationStatus.currentClassSpecify',
      'educationStatus.attendance',
    ],
    expenses: [],
    review: [
      'finalReview.formSubmittedBy',
      'finalReview.allInfoCorrect',
    ],
  };

  const fields = sectionFields[sectionKey] || [];
  for (const field of fields) {
    const err = validateField(field, data, hasSavedSignature);
    if (err) {
      errors.push(err);
    }
  }

  return errors;
}

/**
 * Full validation check for SUBMIT.
 * Returns { valid: boolean; errors: FormValidationError[] }
 */
export function validateEntireForm(
  data: Record<string, any>,
  hasSavedSignature: boolean = false
): { valid: boolean; errors: FormValidationError[] } {
  const errors: FormValidationError[] = [];
  const sections = [
    'consent',
    'demographics',
    'household',
    'health',
    'nutrition',
    'education',
    'review',
  ];

  for (const sec of sections) {
    const secErrors = validateSection(sec, data, hasSavedSignature);
    errors.push(...secErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
