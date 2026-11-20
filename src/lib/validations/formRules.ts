/**
 * formRules.ts
 *
 * Single Source of Truth for Intake Form Required Fields,
 * Clinical Skip Logic, and Payload Sanitization.
 * Version: 2 (Intake Form Schema V2) | Version 3 adds category-awareness
 */

import { FormValidationError, FIELD_REGISTRY } from './formValidationRegistry';
import { isCurrentRegimenApplicable } from '../clinical/artStatusLogic';
import {
  type SupportCategory,
  isFieldApplicableForCategories,
  isSectionApplicable,
  deriveGuardianStatus,
} from '../assessment/categoryApplicability';
import { validateServerSubmissionIntake } from '../server/intakeValidation';

export { deriveGuardianStatus };

export const CURRENT_SCHEMA_VERSION = 2;
export const CATEGORY_SCHEMA_VERSION = 3;

/**
 * Universal Value Resolver: Seamlessly extracts values from BOTH flat objects (e.g., formData)
 * and canonical nested assessment records (e.g., finalRecord).
 */
export function getFieldValue(data: Record<string, any>, fieldKey: string): any {
  if (!data) return undefined;

  // 1. Direct match on full key (e.g. data['health.artStatus'] or data['artStatus'])
  if (data[fieldKey] !== undefined && data[fieldKey] !== null) {
    return data[fieldKey];
  }

  // 2. Direct traversal through dot path (e.g. data.health.artStatus)
  const parts = fieldKey.split('.');
  if (parts.length > 1) {
    let current: any = data;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        current = undefined;
        break;
      }
    }
    if (current !== undefined && current !== null) {
      return current;
    }
  }

  // 3. Direct match on short name (last part of dot path, e.g. 'artIdNumber' on flat objects)
  const lastPart = parts[parts.length - 1];
  if (data[lastPart] !== undefined && data[lastPart] !== null) {
    return data[lastPart];
  }

  // 4. Section alias mappings (e.g. data.householdFinancial for 'household.monthlyIncomeRs')
  if (parts.length === 2) {
    const [sec, prop] = parts;
    const aliases: Record<string, string[]> = {
      consent: ['consent', 'caregiverConsent'],
      caregiverConsent: ['caregiverConsent', 'consent'],
      demographics: ['demographics'],
      banking: ['bankingAndKyc', 'banking'],
      household: ['householdFinancial', 'household'],
      householdFinancial: ['householdFinancial', 'household'],
      health: ['health', 'clinical'],
      nutrition: ['nutrition'],
      education: ['educationStatus', 'education'],
      educationStatus: ['educationStatus', 'education'],
      expenses: ['educationExpenses', 'expenses'],
      educationExpenses: ['educationExpenses', 'expenses'],
      review: ['finalReview', 'review'],
      finalReview: ['finalReview', 'review'],
    };
    const possibleSections = aliases[sec] || [sec];
    for (const s of possibleSections) {
      if (data[s] && typeof data[s] === 'object' && data[s][prop] !== undefined) {
        return data[s][prop];
      }
    }
  }

  return undefined;
}

/**
 * Returns true if the given fieldKey is currently applicable/visible
 * based on skip logic, parent answer conditions, AND (optionally) selected support categories.
 *
 * Pass `categories` from categoryApplicability.ts to enable category-aware validation.
 * Pass `undefined` or `[]` for legacy schema-v2 mode (all fields applicable).
 */
export function isFieldApplicable(
  fieldKey: string,
  data: Record<string, any>,
  categories?: SupportCategory[]
): boolean {
  // Category-level gate: if categories provided, check category applicability first
  if (categories && categories.length > 0) {
    if (!isFieldApplicableForCategories(fieldKey, categories)) {
      return false;
    }
  }
  const artStatus = getFieldValue(data, 'health.artStatus') || '';
  const currentlyOnArt = getFieldValue(data, 'health.currentlyOnArt');
  const vlStatus = getFieldValue(data, 'health.vlStatus') || '';
  const hasDisability = getFieldValue(data, 'health.hasDisability') || '';
  const educationStatus = getFieldValue(data, 'educationStatus.educationStatus') || '';
  const currentClass = getFieldValue(data, 'educationStatus.currentClass') || '';

  // Clinical / Health Skip Logic
  if (
    fieldKey === 'health.artInitiationDate' ||
    fieldKey === 'health.artIdNumber' ||
    fieldKey === 'artInitiationDate' ||
    fieldKey === 'artIdNumber'
  ) {
    return artStatus === 'On ART';
  }

  if (
    fieldKey === 'health.currentlyOnArt' ||
    fieldKey === 'currentlyOnArt'
  ) {
    return artStatus === 'Transferred In';
  }

  if (
    fieldKey === 'health.artMedicineType' ||
    fieldKey === 'artMedicineType'
  ) {
    return isCurrentRegimenApplicable(artStatus, currentlyOnArt);
  }

  if (
    fieldKey === 'health.vlDate' ||
    fieldKey === 'health.viralLoad' ||
    fieldKey === 'vlDate' ||
    fieldKey === 'viralLoad'
  ) {
    if (fieldKey === 'health.vlDate' || fieldKey === 'vlDate') {
      return (
        vlStatus !== 'Not tested' &&
        vlStatus !== 'Pending test results' &&
        vlStatus !== 'Awaiting results' &&
        vlStatus !== ''
      );
    }
    return vlStatus.startsWith('Tested') || vlStatus.startsWith('Suppressed') || vlStatus.startsWith('Unsuppressed');
  }

  if (
    fieldKey === 'health.disabilityType' ||
    fieldKey === 'health.disabilityCertificateStatus' ||
    fieldKey === 'disabilityType' ||
    fieldKey === 'disabilityCertificateStatus'
  ) {
    return hasDisability === 'Yes';
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
    return educationStatus === 'Currently going to school';
  }

  if (
    fieldKey === 'educationStatus.currentClassSpecify' ||
    fieldKey === 'currentClassSpecify'
  ) {
    return educationStatus === 'Currently going to school' && currentClass === 'Other (specify)';
  }

  // Education Scheme Benefit Skip Logic
  if (
    fieldKey === 'educationStatus.educationSchemeName' ||
    fieldKey === 'educationSchemeName'
  ) {
    const benefit = getFieldValue(data, 'educationStatus.receivingEducationSchemeBenefit');
    return benefit === 'Yes' || benefit === 'Applied / Under Review';
  }

  if (
    fieldKey === 'educationStatus.educationSchemeNameSpecify' ||
    fieldKey === 'educationSchemeNameSpecify'
  ) {
    const benefit = getFieldValue(data, 'educationStatus.receivingEducationSchemeBenefit');
    const scheme = getFieldValue(data, 'educationStatus.educationSchemeName');
    return (
      (benefit === 'Yes' || benefit === 'Applied / Under Review') &&
      (scheme === 'Other Scheme (specify)' || scheme === 'State Government Scheme (Bicycle, Laptop, Uniform, or Stipend)')
    );
  }

  // Banking Section: Optional at intake, collected after supervisor approval
  if (fieldKey.startsWith('bankingAndKyc.') || fieldKey.startsWith('banking.')) {
    return true; // visible, but not mandatory at submit
  }

  // Document Verification Proofs: Mandated when child is enrolled in school
  if (
    fieldKey === 'educationExpenses.feeReceiptPhotoUrl' ||
    fieldKey === 'educationExpenses.marksheetPhotoUrl' ||
    fieldKey === 'feeReceiptPhotoUrl' ||
    fieldKey === 'marksheetPhotoUrl'
  ) {
    return educationStatus === 'Currently going to school' || !educationStatus;
  }

  // Structured Address Fields (Paper Form A12):
  // Applicable when structured address fields are present in the form or record
  if (
    fieldKey === 'demographics.residenceType' ||
    fieldKey === 'demographics.doorAndColony' ||
    fieldKey === 'demographics.street' ||
    fieldKey === 'demographics.villageCity' ||
    fieldKey === 'demographics.talukMandalBlock' ||
    fieldKey === 'demographics.pinCode' ||
    fieldKey === 'residenceType' ||
    fieldKey === 'doorAndColony' ||
    fieldKey === 'street' ||
    fieldKey === 'villageCity' ||
    fieldKey === 'talukMandalBlock' ||
    fieldKey === 'pinCode'
  ) {
    const demo = (data.demographics && typeof data.demographics === 'object') ? data.demographics : data;
    return (
      demo.residenceType !== undefined ||
      demo.doorAndColony !== undefined ||
      demo.street !== undefined ||
      demo.villageCity !== undefined ||
      demo.talukMandalBlock !== undefined ||
      demo.pinCode !== undefined
    );
  }

  // All other core intake fields are applicable
  return true;
}

/**
 * Strips stale or hidden skip-logic fields from the payload prior to submission.
 */
export function sanitizeSubmissionPayload<T extends Record<string, any>>(data: T): T {
  const sanitized = { ...data };
  const artStatus = getFieldValue(sanitized, 'health.artStatus') || '';
  const currentlyOnArt = getFieldValue(sanitized, 'health.currentlyOnArt');
  const vlStatus = getFieldValue(sanitized, 'health.vlStatus') || '';
  const hasDisability = getFieldValue(sanitized, 'health.hasDisability') || '';
  const educationStatus = getFieldValue(sanitized, 'educationStatus.educationStatus') || '';
  const currentClass = getFieldValue(sanitized, 'educationStatus.currentClass') || '';

  // 1. Clinical Health Sanitization
  if (artStatus !== 'On ART') {
    if (artStatus !== 'Transferred In') {
      delete sanitized.artInitiationDate;
      delete sanitized.artIdNumber;
      delete sanitized.currentlyOnArt;
      delete sanitized.artMedicineType;
      if (sanitized.health && typeof sanitized.health === 'object') {
        delete sanitized.health.artInitiationDate;
        delete sanitized.health.artIdNumber;
        delete sanitized.health.currentlyOnArt;
        delete sanitized.health.artMedicineType;
      }
    } else {
      // Transferred In
      delete sanitized.artInitiationDate;
      delete sanitized.artIdNumber;
      if (sanitized.health && typeof sanitized.health === 'object') {
        delete sanitized.health.artInitiationDate;
        delete sanitized.health.artIdNumber;
      }
      const isTaking =
        currentlyOnArt === true ||
        currentlyOnArt === 'Yes' ||
        currentlyOnArt === 'true';
      if (!isTaking) {
        delete sanitized.artMedicineType;
        if (sanitized.health && typeof sanitized.health === 'object') {
          delete sanitized.health.artMedicineType;
        }
      }
    }
  }

  // Viral load
  if (vlStatus === 'Not tested') {
    delete sanitized.vlDate;
    delete sanitized.viralLoad;
    delete sanitized.vlCategory;
    if (sanitized.health && typeof sanitized.health === 'object') {
      delete sanitized.health.vlDate;
      delete sanitized.health.viralLoad;
      delete sanitized.health.vlCategory;
    }
  } else if (vlStatus === 'Awaiting results') {
    delete sanitized.viralLoad;
    delete sanitized.vlCategory;
    if (sanitized.health && typeof sanitized.health === 'object') {
      delete sanitized.health.viralLoad;
      delete sanitized.health.vlCategory;
    }
  } else if (vlStatus && !vlStatus.startsWith('Tested') && !vlStatus.startsWith('Suppressed') && !vlStatus.startsWith('Unsuppressed')) {
    delete sanitized.vlDate;
    delete sanitized.viralLoad;
    delete sanitized.vlCategory;
    if (sanitized.health && typeof sanitized.health === 'object') {
      delete sanitized.health.vlDate;
      delete sanitized.health.viralLoad;
      delete sanitized.health.vlCategory;
    }
  }

  // Disability
  if (hasDisability !== 'Yes') {
    delete sanitized.disabilityType;
    delete sanitized.disabilityCertificateStatus;
    if (sanitized.health && typeof sanitized.health === 'object') {
      delete sanitized.health.disabilityType;
      delete sanitized.health.disabilityCertificateStatus;
    }
  }

  // 2. Education Sanitization
  if (educationStatus !== 'Currently going to school') {
    delete sanitized.schoolName;
    delete sanitized.schoolSessionStartDate;
    delete sanitized.schoolType;
    delete sanitized.currentClass;
    delete sanitized.currentClassSpecify;
    delete sanitized.attendance;
    delete sanitized.receivingEducationSchemeBenefit;
    if (sanitized.educationStatus && typeof sanitized.educationStatus === 'object') {
      delete sanitized.educationStatus.schoolName;
      delete sanitized.educationStatus.schoolSessionStartDate;
      delete sanitized.educationStatus.schoolType;
      delete sanitized.educationStatus.currentClass;
      delete sanitized.educationStatus.currentClassSpecify;
      delete sanitized.educationStatus.attendance;
      delete sanitized.educationStatus.receivingEducationSchemeBenefit;
    }
  } else if (currentClass !== 'Other (specify)') {
    delete sanitized.currentClassSpecify;
    if (sanitized.educationStatus && typeof sanitized.educationStatus === 'object') {
      delete sanitized.educationStatus.currentClassSpecify;
    }
  }

  // 3. Education Scheme Sanitization
  const benefit = getFieldValue(sanitized, 'educationStatus.receivingEducationSchemeBenefit');
  const scheme = getFieldValue(sanitized, 'educationStatus.educationSchemeName');
  if (benefit !== 'Yes' && benefit !== 'Applied / Under Review') {
    delete sanitized.educationSchemeName;
    delete sanitized.educationSchemeNameSpecify;
    if (sanitized.educationStatus && typeof sanitized.educationStatus === 'object') {
      delete sanitized.educationStatus.educationSchemeName;
      delete sanitized.educationStatus.educationSchemeNameSpecify;
    }
  } else if (scheme !== 'Other Scheme (specify)' && scheme !== 'State Government Scheme (Bicycle, Laptop, Uniform, or Stipend)') {
    delete sanitized.educationSchemeNameSpecify;
    if (sanitized.educationStatus && typeof sanitized.educationStatus === 'object') {
      delete sanitized.educationStatus.educationSchemeNameSpecify;
    }
  }

  // 4. Support Category Payload Sanitization (Schema V3)
  // When supportCategories is specified, inactive category answers are excluded from the submitted assessment
  const cats = sanitized.supportCategories;
  if (Array.isArray(cats) && cats.length > 0) {
    // If education is not selected, omit all education and expenses data
    if (!cats.includes('education')) {
      delete sanitized.educationStatus;
      delete sanitized.educationExpenses;
      delete sanitized.educationSupportRequired;
      delete sanitized.schoolFees;
      delete sanitized.tuitionFees;
      delete sanitized.books;
      delete sanitized.stationery;
      delete sanitized.uniform;
      delete sanitized.transport;
      delete sanitized.otherExpenses;
      delete sanitized.totalAnnualCost;
      delete sanitized.feeReceiptPhotoUrl;
      delete sanitized.marksheetPhotoUrl;
      delete sanitized.schoolName;
      delete sanitized.currentClass;
      delete sanitized.currentClassSpecify;
      delete sanitized.attendance;
      delete sanitized.receivingEducationSchemeBenefit;
      delete sanitized.educationSchemeName;
      delete sanitized.educationSchemeNameSpecify;
      delete sanitized.requiredSchoolFees;
      delete sanitized.requiredTuitionFees;
      delete sanitized.requiredBooks;
      delete sanitized.requiredStationery;
      delete sanitized.requiredUniform;
      delete sanitized.requiredTransport;
      delete sanitized.requiredOtherSupport;
      delete sanitized.totalRequiredSupport;
    }

    // If nutrition is not selected, omit nutrition habit questions
    if (!cats.includes('nutrition')) {
      delete sanitized.nutrition;
      delete sanitized.nutritionSupport;
      delete sanitized.appetite;
      delete sanitized.mealsPerDay;
      delete sanitized.malnutritionSymptoms;
    }

    // If hiv_support is not selected, omit HIV clinical fields
    if (!cats.includes('hiv_support')) {
      delete sanitized.artStatus;
      delete sanitized.artRegistrationDate;
      delete sanitized.artInitiationDate;
      delete sanitized.artIdNumber;
      delete sanitized.artMedicineType;
      delete sanitized.currentlyOnArt;
      delete sanitized.cd4Count;
      delete sanitized.vlStatus;
      delete sanitized.vlDate;
      delete sanitized.viralLoad;
      delete sanitized.vlCategory;
      if (sanitized.health && typeof sanitized.health === 'object') {
        delete sanitized.health.artStatus;
        delete sanitized.health.artRegistrationDate;
        delete sanitized.health.artInitiationDate;
        delete sanitized.health.artIdNumber;
        delete sanitized.health.artMedicineType;
        delete sanitized.health.currentlyOnArt;
        delete sanitized.health.cd4Count;
        delete sanitized.health.vlStatus;
        delete sanitized.health.vlDate;
        delete sanitized.health.viralLoad;
        delete sanitized.health.vlCategory;
      }
    }

    // If neither education nor nutrition is selected (e.g. HIV-only), omit Banking & Household Income
    if (!cats.includes('education') && !cats.includes('nutrition')) {
      delete sanitized.bankingAndKyc;
      delete sanitized.bankDetails;
      delete sanitized.bankAccountHolderName;
      delete sanitized.bankAccountNumber;
      delete sanitized.bankName;
      delete sanitized.bankBranch;
      delete sanitized.ifscCode;
      delete sanitized.bankPassbookPhotoUrl;
      delete sanitized.aadhaarCardPhotoUrl;
      delete sanitized.consentFormPhotoUrl;

      delete sanitized.household;
      delete sanitized.householdFinancial;
      delete sanitized.totalFamilyIncome;
      delete sanitized.familyMembersCount;
      delete sanitized.mainSourceOfIncome;
      delete sanitized.majorSourceOfIncome;
      delete sanitized.rationCardType;
      delete sanitized.bplCardNumber;
    }

    // Anthropometrics: omit whenever nutrition is not selected
    if (!cats.includes('nutrition')) {
      delete sanitized.weightKg;
      delete sanitized.heightCm;
      delete sanitized.bmi;
      delete sanitized.bmiCategory;
      delete sanitized.haemoglobinGdl;
      delete sanitized.hbCategory;
      delete sanitized.nutritionStatus;
      if (sanitized.health && typeof sanitized.health === 'object') {
        delete sanitized.health.weightKg;
        delete sanitized.health.heightCm;
        delete sanitized.health.bmi;
        delete sanitized.health.bmiCategory;
        delete sanitized.health.haemoglobinGdl;
        delete sanitized.health.hbCategory;
        delete sanitized.health.nutritionStatus;
      }
    }

    // If neither nutrition nor hiv_support is selected (e.g. Education only), omit general health comorbidities
    if (!cats.includes('nutrition') && !cats.includes('hiv_support')) {
      delete sanitized.otherHealthConditions;
      delete sanitized.otherHealthConditionSpecify;
      if (sanitized.health && typeof sanitized.health === 'object') {
        delete sanitized.health.otherHealthConditions;
        delete sanitized.health.otherHealthConditionSpecify;
      }
    }
  }

  // Authoritatively derive guardianStatus from orphanStatus if orphanStatus is present
  const rawOrphan = sanitized.orphanStatus || (sanitized.demographics && sanitized.demographics.orphanStatus);
  const currentGuardian = sanitized.guardianStatus || (sanitized.demographics && sanitized.demographics.guardianStatus);
  if (rawOrphan) {
    const derived = deriveGuardianStatus(rawOrphan, currentGuardian);
    (sanitized as any).guardianStatus = derived;
    if (sanitized.demographics && typeof sanitized.demographics === 'object') {
      (sanitized.demographics as any).guardianStatus = derived;
    }
  }

  return sanitized;
}

/**
 * Validates a single field by key on blur or during section/form validation.
 * Returns a FormValidationError if invalid, or null if valid.
 */
export function validateField(
  fieldKey: string,
  data: Record<string, any>,
  hasSavedSignature: boolean = false,
  categories?: SupportCategory[]
): FormValidationError | null {
  // If field is not applicable due to skip logic or category gate, it is never invalid
  if (!isFieldApplicable(fieldKey, data, categories)) {
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

  // ── Section 1: Consent ─────────────────────────────────────────────────────
  if (fieldKey === 'caregiverConsent.consentProvided' || fieldKey === 'agreeToParticipate') {
    const consent = getFieldValue(data, 'caregiverConsent.consentProvided') ?? getFieldValue(data, 'consent.agreeToParticipate') ?? data.agreeToParticipate;
    if (consent !== true) {
      return createErr('Caregiver consent must be confirmed before this assessment can be submitted.');
    }
  }

  if (fieldKey === 'caregiverConsent.signature' || fieldKey === 'signatureDataUrl') {
    const sig = getFieldValue(data, 'caregiverConsent.signatureDataUrl') || getFieldValue(data, 'signatureDataUrl') || data.signatureAssetId;
    if (!hasSavedSignature && !sig) {
      return createErr('Please save the caregiver signature before submitting.');
    }
  }

  if (fieldKey === 'caregiverConsent.caregiverName' || fieldKey === 'caregiverName') {
    const val = (getFieldValue(data, 'caregiverConsent.caregiverName') || getFieldValue(data, 'demographics.caregiverName') || '').toString().trim();
    if (val.length < 2) {
      return createErr('Caregiver name is required (at least 2 characters).');
    }
  }

  if (fieldKey === 'caregiverConsent.caregiverRelationship' || fieldKey === 'caregiverRelationship') {
    const val = (getFieldValue(data, 'caregiverConsent.caregiverRelationship') || getFieldValue(data, 'demographics.caregiverRelationship') || '').toString().trim();
    if (val.length < 2) {
      return createErr('Caregiver relationship is required.');
    }
  }

  // ── Section 2: Demographics ────────────────────────────────────────────────
  if (fieldKey === 'demographics.artNumber' || fieldKey === 'artNumber') {
    const val = (getFieldValue(data, 'demographics.artNumber') || '').toString().trim();
    if (val.length < 3) {
      return createErr('Reference ID must be at least 3 characters.');
    }
  }

  if (fieldKey === 'demographics.childName' || fieldKey === 'childName') {
    const val = (getFieldValue(data, 'demographics.childName') || '').toString().trim();
    if (val.length < 2) {
      return createErr('Child full name is required (at least 2 characters).');
    }
  }

  if (fieldKey === 'demographics.dob' || fieldKey === 'dob') {
    const val = getFieldValue(data, 'demographics.dob');
    if (!val) {
      return createErr('Date of birth is required.');
    }
    const d = new Date(val);
    if (isNaN(d.getTime()) || d > new Date()) {
      return createErr('Date of birth cannot be in the future.');
    }
  }

  if (fieldKey === 'demographics.gender' || fieldKey === 'gender') {
    const val = getFieldValue(data, 'demographics.gender');
    if (!val) {
      return createErr('Child gender must be selected.');
    }
  }

  if (fieldKey === 'demographics.orphanStatus' || fieldKey === 'orphanStatus') {
    const val = getFieldValue(data, 'demographics.orphanStatus');
    if (!val) {
      return createErr('Orphan status must be selected.');
    }
  }

  if (fieldKey === 'demographics.contactNumber' || fieldKey === 'contactNumber') {
    const val = (getFieldValue(data, 'demographics.contactNumber') || getFieldValue(data, 'demographics.caregiverPhone') || '').toString().trim();
    if (!val || !/^[6-9]\d{9}$/.test(val)) {
      return createErr('Must be a valid 10-digit Indian mobile number starting with 6-9.');
    }
  }

  if (fieldKey === 'demographics.fullAddress' || fieldKey === 'fullAddress') {
    const val = (getFieldValue(data, 'demographics.fullAddress') || '').toString().trim();
    if (val.length < 3) {
      return createErr('Full address is required (at least 3 characters).');
    }
  }

  if (fieldKey === 'demographics.state' || fieldKey === 'state') {
    const val = (getFieldValue(data, 'demographics.state') || '').toString().trim();
    if (val.length < 2) {
      return createErr('State is required.');
    }
  }

  if (fieldKey === 'demographics.district' || fieldKey === 'district') {
    const val = (getFieldValue(data, 'demographics.district') || '').toString().trim();
    if (val.length < 2) {
      return createErr('District is required.');
    }
  }

  if (fieldKey === 'demographics.residenceType' || fieldKey === 'residenceType') {
    const val = (getFieldValue(data, 'demographics.residenceType') || data.residenceType || '').toString().trim();
    if (!val) {
      return createErr('Type of residence is required.');
    }
  }

  if (fieldKey === 'demographics.doorAndColony' || fieldKey === 'doorAndColony') {
    const val = (getFieldValue(data, 'demographics.doorAndColony') || data.doorAndColony || '').toString().trim();
    if (!val) {
      return createErr('Door No / Ward No / House Name / Colony is required.');
    }
  }

  if (fieldKey === 'demographics.street' || fieldKey === 'street') {
    const val = (getFieldValue(data, 'demographics.street') || data.street || '').toString().trim();
    if (!val) {
      return createErr('Street name is required.');
    }
  }

  if (fieldKey === 'demographics.villageCity' || fieldKey === 'villageCity') {
    const val = (getFieldValue(data, 'demographics.villageCity') || data.villageCity || '').toString().trim();
    if (!val) {
      return createErr('Village or City is required.');
    }
  }

  if (fieldKey === 'demographics.talukMandalBlock' || fieldKey === 'talukMandalBlock') {
    const val = (getFieldValue(data, 'demographics.talukMandalBlock') || data.talukMandalBlock || '').toString().trim();
    if (!val) {
      return createErr('Taluk / Mandal / Block is required.');
    }
  }

  if (fieldKey === 'demographics.pinCode' || fieldKey === 'pinCode') {
    const val = (getFieldValue(data, 'demographics.pinCode') || data.pinCode || '').toString().trim();
    if (!/^[1-9]\d{5}$/.test(val)) {
      return createErr('A valid 6-digit PIN code is required.');
    }
  }

  // ── Section 4: Household & Financial ───────────────────────────────────────
  if (fieldKey === 'householdFinancial.totalFamilyMembers' || fieldKey === 'totalFamilyMembers') {
    const raw = getFieldValue(data, 'householdFinancial.totalFamilyMembers');
    const val = Number(raw);
    if (raw === '' || raw === undefined || isNaN(val) || val < 1) {
      return createErr('Total family members must be at least 1.');
    }
  }

  if (fieldKey === 'householdFinancial.numberOfChildrenUnder18' || fieldKey === 'numberOfChildrenUnder18') {
    const raw = getFieldValue(data, 'householdFinancial.numberOfChildrenUnder18');
    const val = Number(raw);
    if (raw === '' || raw === undefined || isNaN(val) || val < 0) {
      return createErr('Number of children under 18 must be 0 or more.');
    }
  }

  if (fieldKey === 'householdFinancial.monthlyIncomeRs' || fieldKey === 'monthlyIncomeRs') {
    const raw = getFieldValue(data, 'householdFinancial.monthlyIncomeRs');
    const val = Number(raw);
    if (raw === '' || raw === undefined || isNaN(val) || val < 0) {
      return createErr('Monthly income is required (0 or greater).');
    }
  }

  if (fieldKey === 'householdFinancial.mainSourceOfIncome' || fieldKey === 'mainSourceOfIncome') {
    const val = getFieldValue(data, 'householdFinancial.mainSourceOfIncome');
    if (!val) {
      return createErr('Main source of income must be selected.');
    }
  }

  // ── Section 5: Clinical / Health ───────────────────────────────────────────
  if (fieldKey === 'health.weightKg' || fieldKey === 'weightKg') {
    const raw = getFieldValue(data, 'health.weightKg');
    const val = Number(raw);
    if (raw === '' || raw === undefined || isNaN(val) || val <= 0 || val > 150) {
      return createErr('Weight must be between 1 and 150 kg.');
    }
  }

  if (fieldKey === 'health.heightCm' || fieldKey === 'heightCm') {
    const raw = getFieldValue(data, 'health.heightCm');
    const val = Number(raw);
    if (raw === '' || raw === undefined || isNaN(val) || val <= 0 || val > 220) {
      return createErr('Height must be between 1 and 220 cm.');
    }
  }

  if (fieldKey === 'health.haemoglobinGdl' || fieldKey === 'haemoglobinGdl') {
    const raw = getFieldValue(data, 'health.haemoglobinGdl');
    if (raw !== '' && raw !== undefined && raw !== null) {
      const val = Number(raw);
      if (isNaN(val) || val < 1 || val > 25) {
        return createErr('Haemoglobin must be between 1 and 25 g/dL.');
      }
    }
  }

  if (fieldKey === 'health.artStatus' || fieldKey === 'artStatus') {
    const val = getFieldValue(data, 'health.artStatus');
    if (!val) {
      return createErr('ART status must be selected.');
    }
  }

  if (fieldKey === 'health.artInitiationDate' || fieldKey === 'artInitiationDate') {
    const artStatus = getFieldValue(data, 'health.artStatus');
    const val = getFieldValue(data, 'health.artInitiationDate');
    if (artStatus === 'On ART' && (!val || val.toString().trim().length === 0)) {
      return createErr('ART initiation date is required when child is On ART.');
    }
  }

  if (fieldKey === 'health.artIdNumber' || fieldKey === 'artIdNumber') {
    const artStatus = getFieldValue(data, 'health.artStatus');
    const val = (getFieldValue(data, 'health.artIdNumber') || '').toString().trim();
    if (artStatus === 'On ART' && val.length < 2) {
      return createErr('ART ID Number is required when child is On ART.');
    }
  }

  if (fieldKey === 'health.artMedicineType' || fieldKey === 'artMedicineType') {
    const artStatus = getFieldValue(data, 'health.artStatus');
    const currentlyOnArt = getFieldValue(data, 'health.currentlyOnArt');
    const val = (getFieldValue(data, 'health.artMedicineType') || '').toString().trim();
    if (isCurrentRegimenApplicable(artStatus, currentlyOnArt)) {
      if (!val || val.length === 0) {
        return createErr('Current ART regimen is required.');
      }
    }
  }

  if (fieldKey === 'health.currentlyOnArt' || fieldKey === 'currentlyOnArt') {
    const artStatus = getFieldValue(data, 'health.artStatus');
    const val = getFieldValue(data, 'health.currentlyOnArt');
    if (artStatus === 'Transferred In' && (val === undefined || val === '' || val === null)) {
      return createErr('Please confirm whether the child is currently taking ART.');
    }
  }

  if (fieldKey === 'health.vlDate' || fieldKey === 'vlDate') {
    const status = (getFieldValue(data, 'health.vlStatus') || '').toString();
    const val = getFieldValue(data, 'health.vlDate');
    if ((status.startsWith('Suppressed') || status.startsWith('Unsuppressed')) && !val) {
      return createErr('Viral load test date is required.');
    }
  }

  if (fieldKey === 'health.viralLoad' || fieldKey === 'viralLoad') {
    const status = (getFieldValue(data, 'health.vlStatus') || '').toString();
    const raw = getFieldValue(data, 'health.viralLoad');
    if (status.startsWith('Suppressed') || status.startsWith('Unsuppressed')) {
      if (raw === '' || raw === undefined || isNaN(Number(raw))) {
        return createErr('Viral load count is required.');
      }
    }
  }

  if (fieldKey === 'health.disabilityType' || fieldKey === 'disabilityType') {
    const hasDisability = getFieldValue(data, 'health.hasDisability');
    const val = (getFieldValue(data, 'health.disabilityType') || '').toString().trim();
    if (hasDisability === 'Yes' && val.length === 0) {
      return createErr('Please specify the disability type.');
    }
  }

  if (fieldKey === 'health.disabilityCertificateStatus' || fieldKey === 'disabilityCertificateStatus') {
    const hasDisability = getFieldValue(data, 'health.hasDisability');
    const val = getFieldValue(data, 'health.disabilityCertificateStatus');
    if (hasDisability === 'Yes' && !val) {
      return createErr('Please specify disability certificate status.');
    }
  }

  // ── Section 6: Nutrition ───────────────────────────────────────────────────
  if (fieldKey === 'nutrition.appetite' || fieldKey === 'appetite') {
    const val = getFieldValue(data, 'nutrition.appetite');
    if (!val) {
      return createErr('Appetite level must be selected.');
    }
  }

  if (fieldKey === 'nutrition.mealsPerDay' || fieldKey === 'mealsPerDay') {
    const raw = getFieldValue(data, 'nutrition.mealsPerDay');
    const val = Number(raw);
    if (raw === '' || raw === undefined || isNaN(val) || val < 1 || val > 10) {
      return createErr('Meals per day must be between 1 and 10.');
    }
  }

  // ── Section 7: Education ───────────────────────────────────────────────────
  if (fieldKey === 'educationStatus.educationStatus' || fieldKey === 'educationStatus') {
    const val = getFieldValue(data, 'educationStatus.educationStatus');
    if (!val) {
      return createErr('Education status must be selected.');
    }
  }

  if (fieldKey === 'educationStatus.schoolName' || fieldKey === 'schoolName') {
    const eduStatus = getFieldValue(data, 'educationStatus.educationStatus');
    const val = (getFieldValue(data, 'educationStatus.schoolName') || '').toString().trim();
    if (eduStatus === 'Currently going to school' && val.length < 2) {
      return createErr('School name is required.');
    }
  }

  if (fieldKey === 'educationStatus.schoolType' || fieldKey === 'schoolType') {
    const eduStatus = getFieldValue(data, 'educationStatus.educationStatus');
    const val = getFieldValue(data, 'educationStatus.schoolType');
    if (eduStatus === 'Currently going to school' && !val) {
      return createErr('School type must be selected.');
    }
  }

  if (fieldKey === 'educationStatus.currentClass' || fieldKey === 'currentClass') {
    const eduStatus = getFieldValue(data, 'educationStatus.educationStatus');
    const val = getFieldValue(data, 'educationStatus.currentClass');
    if (eduStatus === 'Currently going to school' && !val) {
      return createErr('Current class/grade must be selected.');
    }
  }

  if (fieldKey === 'educationStatus.currentClassSpecify' || fieldKey === 'currentClassSpecify') {
    const eduStatus = getFieldValue(data, 'educationStatus.educationStatus');
    const currentClass = getFieldValue(data, 'educationStatus.currentClass');
    const val = (getFieldValue(data, 'educationStatus.currentClassSpecify') || '').toString().trim();
    if (
      eduStatus === 'Currently going to school' &&
      currentClass === 'Other (specify)' &&
      val.length === 0
    ) {
      return createErr('Please specify the class/course.');
    }
  }

  if (fieldKey === 'educationStatus.attendance' || fieldKey === 'attendance') {
    const eduStatus = getFieldValue(data, 'educationStatus.educationStatus');
    const val = getFieldValue(data, 'educationStatus.attendance');
    if (eduStatus === 'Currently going to school' && !val) {
      return createErr('Attendance regularity must be selected.');
    }
  }

  if (fieldKey === 'educationStatus.educationSchemeName' || fieldKey === 'educationSchemeName') {
    const benefit = getFieldValue(data, 'educationStatus.receivingEducationSchemeBenefit');
    const val = (getFieldValue(data, 'educationStatus.educationSchemeName') || '').toString().trim();
    if ((benefit === 'Yes' || benefit === 'Applied / Under Review') && (!val || val.length === 0)) {
      return createErr('Please select the education scheme name.');
    }
  }

  if (fieldKey === 'educationStatus.educationSchemeNameSpecify' || fieldKey === 'educationSchemeNameSpecify') {
    const benefit = getFieldValue(data, 'educationStatus.receivingEducationSchemeBenefit');
    const scheme = getFieldValue(data, 'educationStatus.educationSchemeName');
    const val = (getFieldValue(data, 'educationStatus.educationSchemeNameSpecify') || '').toString().trim();
    if (
      (benefit === 'Yes' || benefit === 'Applied / Under Review') &&
      (scheme === 'Other Scheme (specify)' || scheme === 'State Government Scheme (Bicycle, Laptop, Uniform, or Stipend)') &&
      val.length < 2
    ) {
      return createErr('Please specify the scheme name.');
    }
  }

  // ── Section 8: Expenses & Document Verification Proofs ─────────────────────
  if (
    fieldKey === 'educationExpenses.feeReceiptPhotoUrl' ||
    fieldKey === 'feeReceiptPhotoUrl' ||
    fieldKey === 'educationExpenses.marksheetPhotoUrl' ||
    fieldKey === 'marksheetPhotoUrl'
  ) {
    const feeReceipt = getFieldValue(data, 'educationExpenses.feeReceiptPhotoUrl') || data.feeReceiptPhotoUrl;
    const marksheet = getFieldValue(data, 'educationExpenses.marksheetPhotoUrl') || data.marksheetPhotoUrl;
    const remarks = (getFieldValue(data, 'educationExpenses.remarks') || data.remarks || '').toString().trim();

    if (!feeReceipt && !marksheet && remarks.length < 3) {
      return createErr('Document verification proof is required: please upload a fee receipt or marksheet photo (or provide reason in Remarks).');
    }
  }

  // ── Section 9: Final Review ────────────────────────────────────────────────
  if (fieldKey === 'finalReview.formSubmittedBy' || fieldKey === 'formSubmittedBy') {
    const val = (getFieldValue(data, 'finalReview.formSubmittedBy') || '').toString().trim();
    if (val.length < 2) {
      return createErr('Please enter your name using at least 2 characters.');
    }
  }

  if (fieldKey === 'finalReview.allInfoCorrect' || fieldKey === 'allInfoCorrect') {
    const val = getFieldValue(data, 'finalReview.allInfoCorrect');
    if (val !== true) {
      return createErr('You must confirm that all information is correct before submitting.');
    }
  }

  return null;
}

/**
 * Validates an entire section when the user scrolls past it.
 * Pass `categories` to skip validation for sections not applicable to the current assessment.
 */
export function validateSection(
  sectionKey: string,
  data: Record<string, any>,
  hasSavedSignature: boolean = false,
  categories?: SupportCategory[]
): FormValidationError[] {
  // If the whole section is not applicable for selected categories, return no errors
  if (categories && categories.length > 0 && !isSectionApplicable(sectionKey, categories)) {
    return [];
  }

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
      'demographics.residenceType',
      'demographics.doorAndColony',
      'demographics.street',
      'demographics.villageCity',
      'demographics.talukMandalBlock',
      'demographics.pinCode',
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
      'educationStatus.educationSchemeName',
      'educationStatus.educationSchemeNameSpecify',
    ],
    expenses: [
      'educationExpenses.feeReceiptPhotoUrl',
    ],
    review: [
      'finalReview.formSubmittedBy',
      'finalReview.allInfoCorrect',
    ],
  };

  const fields = sectionFields[sectionKey] || [];
  for (const field of fields) {
    const err = validateField(field, data, hasSavedSignature, categories);
    if (err) {
      errors.push(err);
    }
  }

  return errors;
}

/**
 * Full validation check for SUBMIT.
 * Pass `categories` for schema-v3 category-aware submissions.
 * Returns { valid: boolean; errors: FormValidationError[] }
 */
export function validateEntireForm(
  data: Record<string, any>,
  hasSavedSignature: boolean = false,
  categories?: SupportCategory[]
): { valid: boolean; errors: FormValidationError[] } {
  const errors: FormValidationError[] = [];
  const sections = [
    'consent',
    'demographics',
    'household',
    'health',
    'nutrition',
    'education',
    'expenses',
    'review',
  ];

  for (const sec of sections) {
    const secErrors = validateSection(sec, data, hasSavedSignature, categories);
    errors.push(...secErrors);
  }

  // Cross-verify server intake requirements (proofs, caseworker org credentials, attachment bounds)
  if (data.consent !== undefined || data.caregiverConsent !== undefined || (data.finalReview && data.finalReview.organizationEmail)) {
    const activeCategories = (categories && categories.length > 0)
      ? categories
      : (Array.isArray(data.supportCategories) && data.supportCategories.length > 0)
      ? data.supportCategories
      : (Array.isArray(data.categories) && data.categories.length > 0)
      ? data.categories
      : undefined;

    const dataForIntake = {
      ...data,
      ...(activeCategories
        ? {
            supportCategories: activeCategories,
            schemaVersion: CATEGORY_SCHEMA_VERSION,
          }
        : {}),
    };
    const intakeCheck = validateServerSubmissionIntake(dataForIntake);
    if (!intakeCheck.valid) {
      for (const err of intakeCheck.errors) {
        if (!errors.some((e) => e.fieldKey === err.field || e.path.join('.') === err.field)) {
          const reg = FIELD_REGISTRY[err.field] || {
            sectionKey: err.field.startsWith('finalReview') ? 'review' : 'demographics',
            elementId: err.field.replace(/\./g, '-'),
            label: err.field,
            order: 999,
          };
          errors.push({
            path: err.field.split('.'),
            fieldKey: err.field,
            sectionKey: reg.sectionKey,
            message: err.issue,
            label: reg.label,
            elementId: reg.elementId,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
