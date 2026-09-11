/**
 * formValidationRegistry.ts
 *
 * Central Form Validation Registry & Exact Field Navigation Pipeline.
 *
 * Provides:
 * - Normalized FormValidationError model for all validation sources.
 * - Central registry mapping canonical paths, legacy aliases, custom controls,
 *   nested expense items, and review fields to UI sections, DOM targets, and labels.
 * - Stable form-order sorting (Section 1 -> Section 9).
 * - Exact field navigation (double requestAnimationFrame, section auto-expand,
 *   sticky-header offset scroll, and smart target/custom-control focus).
 * - Safe fallback for unknown schema paths without silent generic degradation.
 * - Schema completeness assertion for CI validation.
 */

import type { ZodIssue } from 'zod';

// ── 1. Normalized Validation Error Model ──────────────────────────────────────

export type FormValidationError = {
  path: string[];
  fieldKey: string;
  sectionKey: string;
  message: string;
  label: string;
  elementId: string;
};

// ── 2. Registry Metadata Types ───────────────────────────────────────────────

export interface FieldRegistryEntry {
  sectionKey: string;
  elementId: string;
  label: string;
  defaultMessage?: string;
  order: number;
}

// ── 3. Stable Section and DOM Ordering ───────────────────────────────────────

export const SECTION_ORDER: string[] = [
  'consent',
  'demographics',
  'banking',
  'household',
  'health',
  'nutrition',
  'education',
  'expenses',
  'review',
];

export const SECTION_DOM_IDS: Record<string, string> = {
  consent: 'sec-consent',
  demographics: 'sec-child',
  child: 'sec-child',
  banking: 'sec-banking',
  household: 'sec-household',
  health: 'sec-health',
  nutrition: 'sec-nutrition',
  education: 'sec-education',
  expenses: 'sec-expenses',
  review: 'sec-review',
};

// ── 4. Central Field Registry ───────────────────────────────────────────────

export const FIELD_REGISTRY: Record<string, FieldRegistryEntry> = {
  // ── Section 1: Caregiver Consent & Signature ──────────────────────────────
  'caregiverConsent.consentProvided': {
    sectionKey: 'consent',
    elementId: 'caregiver-consent',
    label: 'Caregiver consent',
    defaultMessage: 'Caregiver consent must be confirmed before this assessment can be submitted.',
    order: 10,
  },
  'caregiverConsent.signature': {
    sectionKey: 'consent',
    elementId: 'caregiver-signature',
    label: 'Caregiver signature',
    defaultMessage: 'Please save the caregiver signature before submitting.',
    order: 11,
  },
  'caregiverConsent.signatureDataUrl': {
    sectionKey: 'consent',
    elementId: 'caregiver-signature',
    label: 'Caregiver signature',
    defaultMessage: 'Please save the caregiver signature before submitting.',
    order: 12,
  },
  'caregiverConsent.caregiverName': {
    sectionKey: 'consent',
    elementId: 'caregiver-name',
    label: 'Caregiver name for consent',
    defaultMessage: 'Caregiver name is required for consent.',
    order: 13,
  },
  'caregiverConsent.caregiverRelationship': {
    sectionKey: 'consent',
    elementId: 'caregiver-relationship',
    label: 'Caregiver relationship',
    defaultMessage: 'Caregiver relationship is required.',
    order: 14,
  },
  'consent.agreeToParticipate': {
    sectionKey: 'consent',
    elementId: 'caregiver-consent',
    label: 'Caregiver consent',
    defaultMessage: 'Caregiver consent must be confirmed before this assessment can be submitted.',
    order: 15,
  },
  'consent.signatureDataUrl': {
    sectionKey: 'consent',
    elementId: 'caregiver-signature',
    label: 'Caregiver signature',
    defaultMessage: 'Please save the caregiver signature before submitting.',
    order: 16,
  },
  agreeToParticipate: {
    sectionKey: 'consent',
    elementId: 'caregiver-consent',
    label: 'Caregiver consent',
    defaultMessage: 'Caregiver consent must be confirmed before this assessment can be submitted.',
    order: 17,
  },
  signatureDataUrl: {
    sectionKey: 'consent',
    elementId: 'caregiver-signature',
    label: 'Caregiver signature',
    defaultMessage: 'Please save the caregiver signature before submitting.',
    order: 18,
  },
  caregiverConsent: {
    sectionKey: 'consent',
    elementId: 'caregiver-consent',
    label: 'Caregiver consent',
    defaultMessage: 'Caregiver consent must be confirmed before this assessment can be submitted.',
    order: 19,
  },
  consent: {
    sectionKey: 'consent',
    elementId: 'caregiver-consent',
    label: 'Caregiver consent',
    defaultMessage: 'Caregiver consent must be confirmed before this assessment can be submitted.',
    order: 20,
  },

  // ── Section 2: Child Demographics ─────────────────────────────────────────
  'demographics.artNumber': {
    sectionKey: 'demographics',
    elementId: 'demographics-artNumber',
    label: 'ART / Reference ID',
    defaultMessage: 'A valid ART / reference number is required (at least 3 characters).',
    order: 21,
  },
  'demographics.childName': {
    sectionKey: 'demographics',
    elementId: 'demographics-childName',
    label: 'Child full name',
    defaultMessage: 'Child full name is required (at least 2 characters).',
    order: 22,
  },
  'demographics.dob': {
    sectionKey: 'demographics',
    elementId: 'demographics-dob',
    label: 'Child date of birth',
    defaultMessage: 'A valid date of birth is required and cannot be in the future.',
    order: 23,
  },
  'demographics.gender': {
    sectionKey: 'demographics',
    elementId: 'demographics-gender',
    label: 'Child gender',
    defaultMessage: 'Child gender must be selected.',
    order: 24,
  },
  'demographics.orphanStatus': {
    sectionKey: 'demographics',
    elementId: 'demographics-orphanStatus',
    label: 'Orphan status',
    defaultMessage: 'Orphan status must be selected.',
    order: 25,
  },
  'demographics.caregiverName': {
    sectionKey: 'demographics',
    elementId: 'demographics-caregiverName',
    label: 'Caregiver full name',
    defaultMessage: 'Caregiver full name is required.',
    order: 26,
  },
  'demographics.caregiverRelationship': {
    sectionKey: 'demographics',
    elementId: 'demographics-caregiverRelationship',
    label: 'Caregiver relationship',
    defaultMessage: 'Caregiver relationship must be selected.',
    order: 27,
  },
  'demographics.contactNumber': {
    sectionKey: 'demographics',
    elementId: 'demographics-contactNumber',
    label: 'Caregiver contact number',
    defaultMessage: 'Must be a valid 10-digit Indian mobile number starting with 6-9.',
    order: 28,
  },
  'demographics.caregiverPhone': {
    sectionKey: 'demographics',
    elementId: 'demographics-contactNumber',
    label: 'Caregiver contact number',
    defaultMessage: 'Must be a valid 10-digit Indian mobile number starting with 6-9.',
    order: 29,
  },
  'demographics.fullAddress': {
    sectionKey: 'demographics',
    elementId: 'demographics-fullAddress',
    label: 'Residential address',
    defaultMessage: 'Residential address is required (at least 2 characters).',
    order: 30,
  },
  'demographics.district': {
    sectionKey: 'demographics',
    elementId: 'demographics-district',
    label: 'District',
    defaultMessage: 'District is required.',
    order: 31,
  },
  'demographics.state': {
    sectionKey: 'demographics',
    elementId: 'demographics-state',
    label: 'State / Union Territory',
    defaultMessage: 'State / Union Territory is required.',
    order: 32,
  },
  'demographics.childAadhaarNumber': {
    sectionKey: 'demographics',
    elementId: 'demographics-childAadhaarNumber',
    label: 'Child Aadhaar number',
    defaultMessage: 'A valid Aadhaar number is required if provided.',
    order: 33,
  },
  'demographics.dateOfFilling': {
    sectionKey: 'demographics',
    elementId: 'demographics-dateOfFilling',
    label: 'Date of assessment',
    defaultMessage: 'Date of assessment is required.',
    order: 34,
  },
  demographics: {
    sectionKey: 'demographics',
    elementId: 'sec-child',
    label: 'Child demographics',
    defaultMessage: 'Please complete all required demographic fields.',
    order: 35,
  },

  // Direct unnested demographic aliases
  artNumber: {
    sectionKey: 'demographics',
    elementId: 'demographics-artNumber',
    label: 'ART / Reference ID',
    order: 36,
  },
  childName: {
    sectionKey: 'demographics',
    elementId: 'demographics-childName',
    label: 'Child full name',
    order: 37,
  },
  dob: {
    sectionKey: 'demographics',
    elementId: 'demographics-dob',
    label: 'Child date of birth',
    order: 38,
  },
  gender: {
    sectionKey: 'demographics',
    elementId: 'demographics-gender',
    label: 'Child gender',
    order: 39,
  },
  orphanStatus: {
    sectionKey: 'demographics',
    elementId: 'demographics-orphanStatus',
    label: 'Orphan status',
    order: 40,
  },
  caregiverName: {
    sectionKey: 'demographics',
    elementId: 'demographics-caregiverName',
    label: 'Caregiver full name',
    order: 41,
  },
  caregiverRelationship: {
    sectionKey: 'demographics',
    elementId: 'demographics-caregiverRelationship',
    label: 'Caregiver relationship',
    order: 42,
  },
  contactNumber: {
    sectionKey: 'demographics',
    elementId: 'demographics-contactNumber',
    label: 'Caregiver contact number',
    order: 43,
  },
  fullAddress: {
    sectionKey: 'demographics',
    elementId: 'demographics-fullAddress',
    label: 'Residential address',
    order: 44,
  },
  district: {
    sectionKey: 'demographics',
    elementId: 'demographics-district',
    label: 'District',
    order: 45,
  },
  state: {
    sectionKey: 'demographics',
    elementId: 'demographics-state',
    label: 'State / Union Territory',
    order: 46,
  },

  // ── Section 3: Banking & KYC Details ──────────────────────────────────────
  'bankingAndKyc.passbookPhotoUrl': {
    sectionKey: 'banking',
    elementId: 'banking-passbookPhotoUrl',
    label: 'Passbook photo',
    defaultMessage: 'Please upload a clear photo of the bank passbook front page.',
    order: 50,
  },
  'bankingAndKyc.aadhaarCardPhotoUrl': {
    sectionKey: 'banking',
    elementId: 'banking-aadhaarCardPhotoUrl',
    label: 'Aadhaar card document',
    defaultMessage: 'Please upload the child or caregiver Aadhaar card.',
    order: 51,
  },
  'bankingAndKyc.childPhotoUrl': {
    sectionKey: 'banking',
    elementId: 'banking-childPhotoUrl',
    label: 'Child photo',
    defaultMessage: 'Please upload the child passport size photo.',
    order: 52,
  },
  'bankingAndKyc.bankAccountHolderName': {
    sectionKey: 'banking',
    elementId: 'banking-bankAccountHolderName',
    label: 'Bank account holder name',
    defaultMessage: 'Account holder name is required.',
    order: 53,
  },
  'bankingAndKyc.bankAccountNumber': {
    sectionKey: 'banking',
    elementId: 'banking-bankAccountNumber',
    label: 'Bank account number',
    defaultMessage: 'Bank account number is required.',
    order: 54,
  },
  'bankingAndKyc.bankIfscCode': {
    sectionKey: 'banking',
    elementId: 'banking-bankIfscCode',
    label: 'Bank IFSC code',
    defaultMessage: 'Bank IFSC code is required.',
    order: 55,
  },
  'bankingAndKyc.bankLinkedMobileNumber': {
    sectionKey: 'banking',
    elementId: 'banking-bankLinkedMobileNumber',
    label: 'Bank linked mobile number',
    order: 56,
  },
  bankingAndKyc: {
    sectionKey: 'banking',
    elementId: 'sec-banking',
    label: 'Banking & KYC',
    order: 57,
  },
  passbookPhotoUrl: {
    sectionKey: 'banking',
    elementId: 'banking-passbookPhotoUrl',
    label: 'Passbook photo',
    order: 58,
  },
  aadhaarCardPhotoUrl: {
    sectionKey: 'banking',
    elementId: 'banking-aadhaarCardPhotoUrl',
    label: 'Aadhaar card document',
    order: 59,
  },
  childPhotoUrl: {
    sectionKey: 'banking',
    elementId: 'banking-childPhotoUrl',
    label: 'Child photo',
    order: 60,
  },

  // ── Section 4: Household & Financial ──────────────────────────────────────
  'householdFinancial.totalFamilyMembers': {
    sectionKey: 'household',
    elementId: 'household-totalFamilyMembers',
    label: 'Total family members',
    defaultMessage: 'Total family members must be at least 1.',
    order: 61,
  },
  'householdFinancial.numberOfChildrenUnder18': {
    sectionKey: 'household',
    elementId: 'household-numberOfChildrenUnder18',
    label: 'Children under 18',
    defaultMessage: 'Number of children under 18 must be 0 or more.',
    order: 62,
  },
  'householdFinancial.monthlyIncomeRs': {
    sectionKey: 'household',
    elementId: 'household-monthlyIncomeRs',
    label: 'Monthly household income',
    defaultMessage: 'Monthly income must be 0 or more.',
    order: 63,
  },
  'householdFinancial.mainSourceOfIncome': {
    sectionKey: 'household',
    elementId: 'household-mainSourceOfIncome',
    label: 'Main source of income',
    defaultMessage: 'Please select the primary source of income.',
    order: 64,
  },
  householdFinancial: {
    sectionKey: 'household',
    elementId: 'sec-household',
    label: 'Household & financial details',
    order: 65,
  },

  // ── Section 5: Health & Clinical ──────────────────────────────────────────
  'health.weightKg': {
    sectionKey: 'health',
    elementId: 'health-weightKg',
    label: 'Child weight (kg)',
    defaultMessage: 'Weight must be between 0 and 150 kg.',
    order: 70,
  },
  'health.heightCm': {
    sectionKey: 'health',
    elementId: 'health-heightCm',
    label: 'Child height (cm)',
    defaultMessage: 'Height must be between 0 and 220 cm.',
    order: 71,
  },
  'health.haemoglobinGdl': {
    sectionKey: 'health',
    elementId: 'health-haemoglobinGdl',
    label: 'Haemoglobin level (g/dL)',
    defaultMessage: 'Haemoglobin must be between 0 and 25 g/dL.',
    order: 72,
  },
  'health.artStatus': {
    sectionKey: 'health',
    elementId: 'health-artStatus',
    label: 'ART status',
    defaultMessage: 'Please select ART status.',
    order: 73,
  },
  'health.artRegistrationDate': {
    sectionKey: 'health',
    elementId: 'health-artRegistrationDate',
    label: 'ART registration date',
    order: 74,
  },
  'health.artIdNumber': {
    sectionKey: 'health',
    elementId: 'health-artIdNumber',
    label: 'ART ID number',
    order: 75,
  },
  'health.vlStatus': {
    sectionKey: 'health',
    elementId: 'health-vlStatus',
    label: 'Viral load status',
    defaultMessage: 'Please select viral load status.',
    order: 76,
  },
  'health.vlDate': {
    sectionKey: 'health',
    elementId: 'health-vlDate',
    label: 'Viral load date',
    order: 77,
  },
  'health.viralLoad': {
    sectionKey: 'health',
    elementId: 'health-viralLoad',
    label: 'Viral load count',
    order: 78,
  },
  health: {
    sectionKey: 'health',
    elementId: 'sec-health',
    label: 'Health & clinical information',
    order: 79,
  },

  // ── Section 6: Nutrition ──────────────────────────────────────────────────
  'nutrition.appetite': {
    sectionKey: 'nutrition',
    elementId: 'nutrition-appetite',
    label: 'Child appetite',
    defaultMessage: 'Please select the child appetite level.',
    order: 80,
  },
  'nutrition.mealsPerDay': {
    sectionKey: 'nutrition',
    elementId: 'nutrition-mealsPerDay',
    label: 'Meals per day',
    defaultMessage: 'Meals per day must be between 0 and 10.',
    order: 81,
  },
  'nutritionHabits.appetite': {
    sectionKey: 'nutrition',
    elementId: 'nutrition-appetite',
    label: 'Child appetite',
    order: 82,
  },
  'nutritionHabits.mealsPerDay': {
    sectionKey: 'nutrition',
    elementId: 'nutrition-mealsPerDay',
    label: 'Meals per day',
    order: 83,
  },
  nutrition: {
    sectionKey: 'nutrition',
    elementId: 'sec-nutrition',
    label: 'Nutrition habits',
    order: 84,
  },

  // ── Section 7: Education Status ───────────────────────────────────────────
  'educationStatus.educationStatus': {
    sectionKey: 'education',
    elementId: 'education-educationStatus',
    label: 'Education enrollment status',
    defaultMessage: 'Please select the current education status.',
    order: 90,
  },
  'educationStatus.schoolName': {
    sectionKey: 'education',
    elementId: 'education-schoolName',
    label: 'School name',
    defaultMessage: 'School name is required.',
    order: 91,
  },
  'educationStatus.schoolType': {
    sectionKey: 'education',
    elementId: 'education-schoolType',
    label: 'School type',
    defaultMessage: 'Please select the school type.',
    order: 92,
  },
  'educationStatus.currentClass': {
    sectionKey: 'education',
    elementId: 'education-currentClass',
    label: 'Current class / grade',
    defaultMessage: 'Current class / grade is required.',
    order: 93,
  },
  'educationStatus.attendance': {
    sectionKey: 'education',
    elementId: 'education-attendance',
    label: 'School attendance',
    order: 94,
  },
  educationStatus: {
    sectionKey: 'education',
    elementId: 'sec-education',
    label: 'Education status',
    order: 95,
  },

  // ── Section 8: Education Expenses & Aid ────────────────────────────────────
  'educationExpenses.schoolFees': {
    sectionKey: 'expenses',
    elementId: 'expenses-schoolFees',
    label: 'School fees',
    defaultMessage: 'School fees must be 0 or more.',
    order: 100,
  },
  'educationExpenses.schoolFees.currentCost': {
    sectionKey: 'expenses',
    elementId: 'school-fees-current-cost',
    label: 'School fees current cost',
    defaultMessage: 'School fees current cost is required.',
    order: 101,
  },
  'educationExpenses.tuitionFees': {
    sectionKey: 'expenses',
    elementId: 'expenses-tuitionFees',
    label: 'Tuition fees',
    defaultMessage: 'Tuition fees must be 0 or more.',
    order: 102,
  },
  'educationExpenses.tuitionFees.currentCost': {
    sectionKey: 'expenses',
    elementId: 'expenses-tuitionFees',
    label: 'Tuition fees current cost',
    order: 103,
  },
  'educationExpenses.books': {
    sectionKey: 'expenses',
    elementId: 'expenses-books',
    label: 'Books & syllabi expense',
    defaultMessage: 'Books expense must be 0 or more.',
    order: 104,
  },
  'educationExpenses.books.currentCost': {
    sectionKey: 'expenses',
    elementId: 'expenses-books',
    label: 'Books current cost',
    order: 105,
  },
  'educationExpenses.stationery': {
    sectionKey: 'expenses',
    elementId: 'expenses-stationery',
    label: 'Stationery expense',
    defaultMessage: 'Stationery expense must be 0 or more.',
    order: 106,
  },
  'educationExpenses.stationery.currentCost': {
    sectionKey: 'expenses',
    elementId: 'expenses-stationery',
    label: 'Stationery current cost',
    order: 107,
  },
  'educationExpenses.uniform': {
    sectionKey: 'expenses',
    elementId: 'expenses-uniform',
    label: 'Uniform expense',
    defaultMessage: 'Uniform expense must be 0 or more.',
    order: 108,
  },
  'educationExpenses.uniform.currentCost': {
    sectionKey: 'expenses',
    elementId: 'expenses-uniform',
    label: 'Uniform current cost',
    order: 109,
  },
  'educationExpenses.transport': {
    sectionKey: 'expenses',
    elementId: 'expenses-transport',
    label: 'Transport expense',
    defaultMessage: 'Transport expense must be 0 or more.',
    order: 110,
  },
  'educationExpenses.transport.currentCost': {
    sectionKey: 'expenses',
    elementId: 'expenses-transport',
    label: 'Transport current cost',
    order: 111,
  },
  'educationExpenses.otherExpenses': {
    sectionKey: 'expenses',
    elementId: 'expenses-otherExpenses',
    label: 'Other educational expenses',
    defaultMessage: 'Other expenses must be 0 or more.',
    order: 112,
  },
  'educationExpenses.otherExpenses.currentCost': {
    sectionKey: 'expenses',
    elementId: 'expenses-otherExpenses',
    label: 'Other expenses current cost',
    order: 113,
  },
  'educationExpenses.feeReceiptPhotoUrl': {
    sectionKey: 'expenses',
    elementId: 'expenses-feeReceiptPhotoUrl',
    label: 'Fee receipt photo',
    defaultMessage: 'Fee receipt photo is required.',
    order: 114,
  },
  'educationExpenses.marksheetPhotoUrl': {
    sectionKey: 'expenses',
    elementId: 'expenses-marksheetPhotoUrl',
    label: 'Marksheet photo',
    defaultMessage: 'Marksheet photo is required.',
    order: 115,
  },
  'educationExpenses.remarks': {
    sectionKey: 'expenses',
    elementId: 'expenses-remarks',
    label: 'Education expenses remarks',
    order: 116,
  },
  educationExpenses: {
    sectionKey: 'expenses',
    elementId: 'sec-expenses',
    label: 'Education expenses',
    order: 117,
  },
  schoolFees: {
    sectionKey: 'expenses',
    elementId: 'expenses-schoolFees',
    label: 'School fees',
    order: 118,
  },

  // ── Section 9: Final Review & Attestation ──────────────────────────────────
  'finalReview.allInfoCorrect': {
    sectionKey: 'review',
    elementId: 'review-allInfoCorrect',
    label: 'Confirmation of information correctness',
    defaultMessage: 'You must confirm that all information is correct before submitting.',
    order: 120,
  },
  'finalReview.formSubmittedBy': {
    sectionKey: 'review',
    elementId: 'review-formSubmittedBy',
    label: 'Interviewer / Caseworker name',
    defaultMessage: 'Please enter the interviewer name (at least 2 characters) before submitting.',
    order: 121,
  },
  'finalReview.organizationName': {
    sectionKey: 'review',
    elementId: 'review-organizationName',
    label: 'Organization name',
    order: 122,
  },
  'finalReview.organizationEmail': {
    sectionKey: 'review',
    elementId: 'review-organizationEmail',
    label: 'Organization email',
    order: 123,
  },
  allInfoCorrect: {
    sectionKey: 'review',
    elementId: 'review-allInfoCorrect',
    label: 'Confirmation of information correctness',
    defaultMessage: 'You must confirm that all information is correct before submitting.',
    order: 124,
  },
  formSubmittedBy: {
    sectionKey: 'review',
    elementId: 'review-formSubmittedBy',
    label: 'Interviewer / Caseworker name',
    defaultMessage: 'Please enter the interviewer name (at least 2 characters) before submitting.',
    order: 125,
  },
  interviewerName: {
    sectionKey: 'review',
    elementId: 'review-formSubmittedBy',
    label: 'Interviewer / Caseworker name',
    defaultMessage: 'Please enter the interviewer name (at least 2 characters) before submitting.',
    order: 126,
  },
  finalReview: {
    sectionKey: 'review',
    elementId: 'sec-review',
    label: 'Final review and attestation',
    defaultMessage: 'Please complete the final review section before submitting.',
    order: 127,
  },
  uuid: {
    sectionKey: 'review',
    elementId: 'sec-review',
    label: 'Client submission ID',
    defaultMessage: 'A valid client submission ID is required. Please restart the form.',
    order: 128,
  },
};

// ── 5. Lookup and Normalization Helpers ─────────────────────────────────────

export function getFieldMetadata(
  target: string | (string | number)[] | HTMLElement
): FieldRegistryEntry {
  let dotPath = '';

  if (typeof target === 'string') {
    dotPath = target;
  } else if (Array.isArray(target)) {
    dotPath = target.map(String).join('.');
  } else if (target && typeof target === 'object' && 'id' in target) {
    const el = target as HTMLElement;
    const directId = el.id;
    for (const [key, meta] of Object.entries(FIELD_REGISTRY)) {
      if (meta.elementId === directId || key === directId) {
        return meta;
      }
    }
    const nameAttr = el.getAttribute('name');
    if (nameAttr && FIELD_REGISTRY[nameAttr]) {
      return FIELD_REGISTRY[nameAttr];
    }
    dotPath = directId || nameAttr || '';
  }

  // 1. Exact match
  if (FIELD_REGISTRY[dotPath]) {
    return FIELD_REGISTRY[dotPath];
  }

  // 2. Leaf match
  const parts = dotPath.split('.');
  const leaf = parts[parts.length - 1];
  if (FIELD_REGISTRY[leaf]) {
    return FIELD_REGISTRY[leaf];
  }

  // 3. Prefix match
  for (const key of Object.keys(FIELD_REGISTRY)) {
    if (dotPath.startsWith(key)) {
      return FIELD_REGISTRY[key];
    }
  }

  // 4. Section fallback from namespace
  const topNamespace = parts[0] || '';
  let fallbackSection = 'consent';
  if (SECTION_ORDER.includes(topNamespace)) {
    fallbackSection = topNamespace;
  } else if (topNamespace === 'child' || topNamespace === 'demographics') {
    fallbackSection = 'demographics';
  }

  reportMissingFieldMapping(dotPath);

  return {
    sectionKey: fallbackSection,
    elementId: dotPath ? `field-${dotPath.replace(/[^a-zA-Z0-9_-]/g, '-')}` : SECTION_DOM_IDS[fallbackSection] || 'sec-consent',
    label: leaf ? leaf.replace(/([A-Z])/g, ' $1').toLowerCase() : 'Field',
    defaultMessage: 'Some information needs review in this section.',
    order: 999,
  };
}

export function reportMissingFieldMapping(dotPath: string): void {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.warn(`[FormValidationRegistry] Unregistered schema path: "${dotPath}". Using safe fallback.`);
  }
}

export function normalizeValidationErrors(options: {
  zodIssues?: ZodIssue[];
  customErrors?: FormValidationError[];
  nativeErrors?: FormValidationError[];
}): FormValidationError[] {
  const result: FormValidationError[] = [];
  const seenFieldKeys = new Set<string>();

  const getDeduplicationKey = (
    path: string[] | undefined,
    fieldKey: string,
    elementId: string
  ): string => {
    if (path && path.length > 0) {
      return path.join('.');
    }
    return fieldKey || elementId;
  };

  if (options.customErrors) {
    for (const ce of options.customErrors) {
      const key = getDeduplicationKey(ce.path, ce.fieldKey, ce.elementId);
      if (!seenFieldKeys.has(key)) {
        seenFieldKeys.add(key);
        result.push(ce);
      }
    }
  }

  if (options.nativeErrors) {
    for (const ne of options.nativeErrors) {
      const key = getDeduplicationKey(ne.path, ne.fieldKey, ne.elementId);
      if (!seenFieldKeys.has(key)) {
        seenFieldKeys.add(key);
        result.push(ne);
      }
    }
  }

  if (options.zodIssues) {
    for (const issue of options.zodIssues) {
      const meta = getFieldMetadata(issue.path);
      const fieldKey = issue.path[issue.path.length - 1]?.toString() || meta.elementId;
      const elementId = meta.elementId;
      const key = getDeduplicationKey(issue.path.map(String), fieldKey, elementId);

      if (!seenFieldKeys.has(key)) {
        seenFieldKeys.add(key);
        result.push({
          path: issue.path.map(String),
          fieldKey,
          sectionKey: meta.sectionKey,
          message: issue.message && !issue.message.startsWith('Required') && !issue.message.startsWith('Invalid')
            ? issue.message
            : meta.defaultMessage || issue.message || 'Please review this field before submitting.',
          label: meta.label,
          elementId,
        });
      }
    }
  }

  return result.sort((a, b) => {
    const secIndexA = SECTION_ORDER.indexOf(a.sectionKey);
    const secIndexB = SECTION_ORDER.indexOf(b.sectionKey);

    const safeSecA = secIndexA === -1 ? 999 : secIndexA;
    const safeSecB = secIndexB === -1 ? 999 : secIndexB;

    if (safeSecA !== safeSecB) {
      return safeSecA - safeSecB;
    }

    const orderA = FIELD_REGISTRY[a.path.join('.')]?.order ?? 999;
    const orderB = FIELD_REGISTRY[b.path.join('.')]?.order ?? 999;
    return orderA - orderB;
  });
}

export function normalizeNativeValidationError(
  element: HTMLElement
): FormValidationError {
  const meta = getFieldMetadata(element);
  const rawMsg = (element as HTMLInputElement).validationMessage;
  const nativeValidationMessage =
    rawMsg &&
    rawMsg !== 'Constraints not satisfied' &&
    !rawMsg.toLowerCase().includes('fill out this field')
      ? rawMsg
      : meta.defaultMessage || rawMsg || 'Please complete this required field.';

  return {
    path: [meta.sectionKey, meta.elementId],
    fieldKey: meta.elementId,
    sectionKey: meta.sectionKey,
    message: nativeValidationMessage,
    label: meta.label,
    elementId: meta.elementId,
  };
}

// ── 6. Navigation and Focus Engine ──────────────────────────────────────────

export function focusValidationTarget(element: HTMLElement): void {
  if (typeof document === 'undefined') return;

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
  ) {
    element.focus?.({ preventScroll: true });
    return;
  }

  const interactiveChild = element.querySelector<HTMLElement>(
    'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
  );
  if (interactiveChild) {
    interactiveChild.focus?.({ preventScroll: true });
    return;
  }

  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '-1');
  }
  element.focus?.({ preventScroll: true });
}

export function navigateToValidationError(
  error: FormValidationError,
  options?: {
    openSection?: (sectionKey: string) => void;
    offsetPx?: number;
  }
): boolean {
  if (typeof document === 'undefined') return false;

  if (options?.openSection) {
    options.openSection(error.sectionKey);
  }

  const sectionDomId = SECTION_DOM_IDS[error.sectionKey] || `sec-${error.sectionKey}`;
  const sectionEl = document.getElementById(sectionDomId);
  if (sectionEl && sectionEl.tagName === 'DETAILS' && !(sectionEl as HTMLDetailsElement).open) {
    (sectionEl as HTMLDetailsElement).open = true;
  }

  const executeScrollAndFocus = () => {
    let target = document.getElementById(error.elementId);

    if (!target) {
      const candidates = [
        `q-${error.elementId}`,
        `field-${error.elementId}`,
        error.fieldKey,
        `q-${error.fieldKey}`,
        error.path.join('-'),
        error.path[error.path.length - 1],
      ];
      for (const cand of candidates) {
        if (cand) {
          const found = document.getElementById(String(cand));
          if (found) {
            target = found;
            break;
          }
        }
      }
    }

    if (!target && sectionEl) {
      target = sectionEl;
    }

    if (!target) {
      return false;
    }

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    focusValidationTarget(target);
    return true;
  };

  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        executeScrollAndFocus();
      });
    });
  } else {
    executeScrollAndFocus();
  }

  return true;
}

export function getUnregisteredRequiredPaths(paths: string[]): string[] {
  const missing: string[] = [];
  for (const path of paths) {
    if (!FIELD_REGISTRY[path]) {
      missing.push(path);
    }
  }
  return missing;
}
