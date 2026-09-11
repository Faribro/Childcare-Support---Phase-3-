/**
 * Zod Runtime Validation Schemas for Childcare Support — Phase 3
 * Exactly aligned with official KoboToolbox CHILD_HIV_SUPPORT_FORM
 * and CARETAKER SIGNATURE POLICY OVERRIDE.
 */

import { z } from 'zod';

export const genderEnum = z.enum(['Male', 'Female', 'Other']);

export const orphanStatusEnum = z.enum([
  'Both parents alive',
  'Single orphan (one parent deceased)',
  'Double orphan (both parents deceased)',
  // Legacy aliases
  'None',
  'Maternal Orphan',
  'Paternal Orphan',
  'Double Orphan (Both Parents Deceased)',
  'Single Parent with Vulnerability',
]);

export const caregiverRelationshipEnum = z.enum([
  'Mother',
  'Father',
  'Grandparent',
  'Legal Guardian',
  'Other',
]);

export const mainSourceOfIncomeEnum = z.enum([
  'Daily wage labour',
  'Salaried employment',
  'Self-employed',
  'Pension / Government support',
  'No regular income',
]);

export const appetiteEnum = z.enum(['Good', 'Reduced', 'Poor / Very low']);

export const educationStatusEnum = z.enum([
  'Currently going to school',
  'Dropped out of school',
  'Never enrolled in school',
  'Completed schooling',
  'Other',
]);

export const schoolTypeEnum = z.enum([
  'Government school',
  'Private school',
  'Aided school',
]);

export const permissiveSchoolType = z.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return undefined;
  if (val === 'Government aided') return 'Aided school';
  if (val === 'Special school') return 'Private school';
  return val;
}, schoolTypeEnum.optional());

export const attendanceEnum = z.enum(['Regular', 'Irregular', 'Dropped out']);

export const permissiveAttendance = z.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return undefined;
  return val;
}, attendanceEnum.optional());

export const signatureStatusEnum = z.enum([
  'NOT_REQUIRED',
  'PENDING',
  'CAPTURED_LOCAL',
  'QUEUED_FOR_UPLOAD',
  'UPLOADED',
  'FAILED',
  'NEEDS_REVIEW',
]);

// Step 1: Demographics Schema
export const demographicsSchema = z.object({
  artNumber: z
    .string()
    .min(3, 'Reference ID must be at least 3 characters')
    .max(50, 'Reference ID cannot exceed 50 characters'),
  dateOfFilling: z.string().optional(),
  childName: z.string().min(2, 'Child full name is required'),
  dob: z
    .string()
    .refine((val) => {
      const d = new Date(val);
      return !isNaN(d.getTime()) && d <= new Date();
    }, 'Date of Birth cannot be in the future'),
  gender: z.enum(['Male', 'Female', 'Other', 'Transgender']).default('Male'),
  orphanStatus: orphanStatusEnum.default('Both parents alive'),
  caregiverName: z.string().min(2, 'Caregiver name is required'),
  caregiverRelationship: z.string().min(2, 'Caregiver relationship is required'),
  contactNumber: z
    .string()
    .refine((val) => !val || /^[6-9]\d{9}$/.test(val), {
      message: 'Must be a valid 10-digit Indian mobile number starting with 6-9',
    })
    .optional()
    .or(z.literal('')),
  caregiverPhone: z.string().optional(),
  fullAddress: z.string().min(2, 'Full address is required').optional().or(z.literal('')),
  state: z.string().min(2, 'State / Union Territory is required').default('Maharashtra'),
  district: z.string().min(2, 'District is required'),
  calculatedAgeYears: z.number().min(0).optional(),
  calculatedAgeMonths: z.number().min(0).optional(),
  childAadhaarNumber: z.string().optional(),
  maskedAadhaar: z.string().optional(),
});

// Step 2: Caregiver Consent & Signature Schema
export const caregiverConsentSchema = z.object({
  consentProvided: z.literal(true, {
    errorMap: () => ({ message: 'Caregiver consent must be provided to record this assessment' }),
  }),
  consentVersion: z.string().default('v1.0-2026'),
  caregiverName: z.string().min(1, 'Caregiver name is required for signature').default('Caregiver'),
  caregiverRelationship: z.string().min(1, 'Caregiver relationship is required').default('Caregiver'),
  consentCapturedAt: z.string().default(() => new Date().toISOString()),
  signatureRequired: z.boolean().default(true),
  signatureStatus: signatureStatusEnum.default('CAPTURED_LOCAL'),
  signatureAssetId: z.string().optional(),
  signatureDataUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
});

// Banking & KYC Schema
export const bankingAndKycSchema = z.object({
  bankAccountHolderName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfscCode: z.string().optional(),
  bankLinkedMobileNumber: z.string().optional(),
  childAadhaarNumber: z.string().optional(),
  passbookPhotoUrl: z.string().optional(),
  aadhaarCardPhotoUrl: z.string().optional(),
  childPhotoUrl: z.string().optional(),
});

// Step 3: Household & Financial Schema
export const householdFinancialSchema = z.object({
  totalFamilyMembers: z.number().min(1).default(3),
  numberOfChildrenUnder18: z.number().min(0).default(1),
  monthlyIncomeRs: z.number().min(0).default(0),
  mainSourceOfIncome: mainSourceOfIncomeEnum.default('Daily wage labour'),
  // Legacy aliases
  orphanStatus: orphanStatusEnum.optional(),
  primaryCaregiverOccupation: z.string().optional(),
  monthlyHouseholdIncome: z.number().optional(),
  rationCardType: z.string().optional(),
  numberOfSiblings: z.number().optional(),
});

// Step 4: Health & Clinical Information
export const healthSchema = z.object({
  weightKg: z.number().min(0).max(150).optional(),
  heightCm: z.number().min(0).max(220).optional(),
  bmi: z.number().min(0).max(60).optional(),
  bmiCategory: z.string().optional(),
  haemoglobinGdl: z.number().min(0).max(25).optional(),
  hbCategory: z.string().optional(),
  otherHealthConditions: z.array(z.string()).default([]),
  otherHealthConditionSpecify: z.string().optional(),
  // ART & Viral Load clinical tracking
  artStatus: z.string().optional(),
  artRegistrationDate: z.string().optional(),
  artIdNumber: z.string().optional(),
  vlStatus: z.string().optional(),
  vlDate: z.string().optional(),
  viralLoad: z.union([z.number(), z.string()]).optional(),
  vlCategory: z.string().optional(),
  // Clinical
  muacMm: z.number().optional(),
  bilateralPittingOedema: z.boolean().default(false),
  clinicalNotes: z.string().optional(),
});

// Step 5: Nutrition & Eating Habits
export const nutritionHabitsSchema = z.object({
  appetite: z.string().optional().default('Good'),
  mealsPerDay: z.number().min(0).max(10).default(3),
});

// Step 6: Education Status
export const educationStatusSchema = z.object({
  educationStatus: z.string().optional().default('Currently going to school'),
  educationStatusSpecify: z.string().optional(),
  schoolName: z.string().optional(),
  schoolSessionStartDate: z.string().optional(),
  schoolType: permissiveSchoolType,
  currentClass: z.string().optional(),
  attendance: permissiveAttendance,
  // Legacy
  schoolEnrolled: z.boolean().optional(),
  schoolGrade: z.string().optional(),
  attendancePercentage: z.number().optional(),
  supportMaterialsNeeded: z.array(z.string()).optional(),
});

// Step 7: Education Current Expenses
export const educationExpensesSchema = z.object({
  schoolFees: z.number().min(0).default(0),
  tuitionFees: z.number().min(0).default(0),
  books: z.number().min(0).default(0),
  stationery: z.number().min(0).default(0),
  uniform: z.number().min(0).default(0),
  transport: z.number().min(0).default(0),
  otherExpenses: z.number().min(0).default(0),
  totalAnnualCost: z.number().min(0).default(0),
  feeReceiptPhotoUrl: z.string().optional(),
  marksheetPhotoUrl: z.string().optional(),
  remarks: z.string().optional(),
});

// Step 8: Education Support Required
export const educationSupportRequiredSchema = z.object({
  requiredSchoolFees: z.number().min(0).default(0),
  requiredBooks: z.number().min(0).default(0),
  requiredStationery: z.number().min(0).default(0),
  requiredUniform: z.number().min(0).default(0),
  requiredTransport: z.number().min(0).default(0),
  requiredOtherSupport: z.number().min(0).default(0),
  totalRequiredSupport: z.number().min(0).default(0),
});

// Step 9: Final Review & Attestation
export const finalReviewSchema = z.object({
  allInfoCorrect: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm that all information is correct' }),
  }),
  organizationName: z.string().default('India HIV/AIDS Alliance'),
  formSubmittedBy: z.string().trim().min(2, 'Please enter your name using at least 2 characters.').default('Caseworker'),
  organizationEmail: z.string().email().optional().or(z.literal('')),
  submissionDate: z.string().optional(),
  approvedAllianceIndia: z.string().optional(),
  reviewConfirmed: z.boolean().optional(),
});

export const permissiveExpectedVersion = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  const num = typeof val === 'number' ? val : parseInt(String(val), 10);
  return isNaN(num) || num < 1 ? undefined : Math.floor(num);
}, z.number().int().positive('expectedVersion must be a positive integer'));

export const optionalNumber = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
}, z.number().optional());

export const optionalBoolean = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  if (String(val).toLowerCase() === 'true') return true;
  if (String(val).toLowerCase() === 'false') return false;
  return Boolean(val);
}, z.boolean().optional());

export const optionalStringArray = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}, z.array(z.string()).optional());

export function flattenPatchBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const flat = { ...body };

  if (body.demographics && typeof body.demographics === 'object') {
    const d = body.demographics;
    if (flat.childName === undefined) flat.childName = d.childName;
    if (flat.artNumber === undefined) flat.artNumber = d.artNumber;
    if (flat.dob === undefined) flat.dob = d.dob;
    if (flat.gender === undefined) flat.gender = d.gender;
    if (flat.orphanStatus === undefined) flat.orphanStatus = d.orphanStatus;
    if (flat.caregiverName === undefined) flat.caregiverName = d.caregiverName;
    if (flat.caregiverRelationship === undefined) flat.caregiverRelationship = d.caregiverRelationship;
    if (flat.caregiverPhone === undefined) flat.caregiverPhone = d.contactNumber || d.caregiverPhone;
    if (flat.contactNumber === undefined) flat.contactNumber = d.contactNumber || d.caregiverPhone;
    if (flat.fullAddress === undefined) flat.fullAddress = d.fullAddress;
    if (flat.state === undefined) flat.state = d.state;
    if (flat.district === undefined) flat.district = d.district;
    if (flat.childAadhaarNumber === undefined) flat.childAadhaarNumber = d.childAadhaarNumber;
    if (flat.calculatedAgeYears === undefined) flat.calculatedAgeYears = d.calculatedAgeYears;
    if (flat.calculatedAgeMonths === undefined) flat.calculatedAgeMonths = d.calculatedAgeMonths;
  }

  if (body.consent && typeof body.consent === 'object') {
    if (flat.agreeToParticipate === undefined) flat.agreeToParticipate = body.consent.agreeToParticipate;
    if (flat.signatureDataUrl === undefined) flat.signatureDataUrl = body.consent.signatureDataUrl;
  }

  if (body.caregiverConsent && typeof body.caregiverConsent === 'object') {
    if (flat.agreeToParticipate === undefined) flat.agreeToParticipate = body.caregiverConsent.agreeToParticipate;
    if (flat.signatureDataUrl === undefined) flat.signatureDataUrl = body.caregiverConsent.signatureDataUrl;
  }

  if (body.bankingAndKyc && typeof body.bankingAndKyc === 'object') {
    const b = body.bankingAndKyc;
    if (flat.bankAccountHolderName === undefined) flat.bankAccountHolderName = b.bankAccountHolderName;
    if (flat.bankAccountNumber === undefined) flat.bankAccountNumber = b.bankAccountNumber;
    if (flat.bankIfscCode === undefined) flat.bankIfscCode = b.bankIfscCode;
    if (flat.bankLinkedMobileNumber === undefined) flat.bankLinkedMobileNumber = b.bankLinkedMobileNumber;
    if (flat.passbookPhotoUrl === undefined) flat.passbookPhotoUrl = b.passbookPhotoUrl;
    if (flat.aadhaarCardPhotoUrl === undefined) flat.aadhaarCardPhotoUrl = b.aadhaarCardPhotoUrl;
    if (flat.childPhotoUrl === undefined) flat.childPhotoUrl = b.childPhotoUrl;
  }

  if (body.householdFinancial && typeof body.householdFinancial === 'object') {
    const h = body.householdFinancial;
    if (flat.totalFamilyMembers === undefined) flat.totalFamilyMembers = h.totalFamilyMembers;
    if (flat.numberOfChildrenUnder18 === undefined) flat.numberOfChildrenUnder18 = h.numberOfChildrenUnder18;
    if (flat.monthlyIncomeRs === undefined) flat.monthlyIncomeRs = h.monthlyIncomeRs;
    if (flat.mainSourceOfIncome === undefined) flat.mainSourceOfIncome = h.mainSourceOfIncome;
  }

  if (body.health && typeof body.health === 'object') {
    const hl = body.health;
    if (flat.weightKg === undefined) flat.weightKg = hl.weightKg;
    if (flat.heightCm === undefined) flat.heightCm = hl.heightCm;
    if (flat.bmi === undefined) flat.bmi = hl.bmi;
    if (flat.bmiCategory === undefined) flat.bmiCategory = hl.bmiCategory;
    if (flat.haemoglobinGdl === undefined) flat.haemoglobinGdl = hl.haemoglobinGdl;
    if (flat.hbCategory === undefined) flat.hbCategory = hl.hbCategory;
    if (flat.otherHealthConditions === undefined) flat.otherHealthConditions = hl.otherHealthConditions;
    if (flat.otherHealthConditionSpecify === undefined) flat.otherHealthConditionSpecify = hl.otherHealthConditionSpecify;
    if (flat.artStatus === undefined) flat.artStatus = hl.artStatus;
    if (flat.artRegistrationDate === undefined) flat.artRegistrationDate = hl.artRegistrationDate;
    if (flat.artIdNumber === undefined) flat.artIdNumber = hl.artIdNumber;
    if (flat.vlStatus === undefined) flat.vlStatus = hl.vlStatus;
    if (flat.vlDate === undefined) flat.vlDate = hl.vlDate;
    if (flat.viralLoad === undefined) flat.viralLoad = hl.viralLoad;
    if (flat.vlCategory === undefined) flat.vlCategory = hl.vlCategory;
    if (flat.nutritionStatus === undefined) flat.nutritionStatus = hl.nutritionStatus;
  }

  if (body.nutrition && typeof body.nutrition === 'object') {
    if (flat.appetite === undefined) flat.appetite = body.nutrition.appetite;
    if (flat.mealsPerDay === undefined) flat.mealsPerDay = body.nutrition.mealsPerDay;
  }

  if (body.nutritionHabits && typeof body.nutritionHabits === 'object') {
    if (flat.appetite === undefined) flat.appetite = body.nutritionHabits.appetite;
    if (flat.mealsPerDay === undefined) flat.mealsPerDay = body.nutritionHabits.mealsPerDay;
  }

  if (body.educationStatus && typeof body.educationStatus === 'object') {
    const ed = body.educationStatus;
    if (flat.schoolName === undefined) flat.schoolName = ed.schoolName;
    if (flat.schoolSessionStartDate === undefined) flat.schoolSessionStartDate = ed.schoolSessionStartDate;
    if (flat.schoolType === undefined) flat.schoolType = ed.schoolType;
    if (flat.currentClass === undefined) flat.currentClass = ed.currentClass;
    if (flat.attendance === undefined) flat.attendance = ed.attendance;
    flat.educationStatus = ed.educationStatus || 'Currently going to school';
  }

  if (body.educationExpenses && typeof body.educationExpenses === 'object') {
    const ee = body.educationExpenses;
    if (flat.schoolFees === undefined) flat.schoolFees = ee.schoolFees;
    if (flat.tuitionFees === undefined) flat.tuitionFees = ee.tuitionFees;
    if (flat.books === undefined) flat.books = ee.books;
    if (flat.stationery === undefined) flat.stationery = ee.stationery;
    if (flat.uniform === undefined) flat.uniform = ee.uniform;
    if (flat.transport === undefined) flat.transport = ee.transport;
    if (flat.otherExpenses === undefined) flat.otherExpenses = ee.otherExpenses;
    if (flat.totalAnnualCost === undefined) flat.totalAnnualCost = ee.totalAnnualCost;
    if (flat.feeReceiptPhotoUrl === undefined) flat.feeReceiptPhotoUrl = ee.feeReceiptPhotoUrl;
    if (flat.marksheetPhotoUrl === undefined) flat.marksheetPhotoUrl = ee.marksheetPhotoUrl;
    if (flat.remarks === undefined) flat.remarks = ee.remarks;
  }

  if (body.educationSupportRequired && typeof body.educationSupportRequired === 'object') {
    const es = body.educationSupportRequired;
    if (flat.requiredSchoolFees === undefined) flat.requiredSchoolFees = es.requiredSchoolFees;
    if (flat.requiredTuitionFees === undefined) flat.requiredTuitionFees = es.requiredTuitionFees;
    if (flat.requiredBooks === undefined) flat.requiredBooks = es.requiredBooks;
    if (flat.requiredStationery === undefined) flat.requiredStationery = es.requiredStationery;
    if (flat.requiredUniform === undefined) flat.requiredUniform = es.requiredUniform;
    if (flat.requiredTransport === undefined) flat.requiredTransport = es.requiredTransport;
    if (flat.requiredOtherSupport === undefined) flat.requiredOtherSupport = es.requiredOtherSupport;
    if (flat.totalRequiredSupport === undefined) flat.totalRequiredSupport = es.totalRequiredSupport;
  }

  if (body.finalReview && typeof body.finalReview === 'object') {
    const fr = body.finalReview;
    if (flat.approvedAllianceIndia === undefined) flat.approvedAllianceIndia = fr.approvedAllianceIndia;
    if (flat.allInfoCorrect === undefined) flat.allInfoCorrect = fr.allInfoCorrect;
    if (flat.organizationName === undefined) flat.organizationName = fr.organizationName;
    if (flat.formSubmittedBy === undefined) flat.formSubmittedBy = fr.formSubmittedBy;
    if (flat.organizationEmail === undefined) flat.organizationEmail = fr.organizationEmail;
  }

  return flat;
}

// Allowlisted Editable Fields Schema for PATCH Changes
export const allowlistedPatchChangesSchema = z.object({
  editReason: z.string().optional(),
  uniqueId: z.string().optional(),
  artNumber: z.string().optional(),
  dateOfFilling: z.string().optional(),
  childName: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  orphanStatus: z.string().optional(),
  caregiverName: z.string().optional(),
  caregiverRelationship: z.string().optional(),
  contactNumber: z.string().optional(),
  caregiverPhone: z.string().optional(),
  fullAddress: z.string().optional(),
  state: z.string().optional(),
  district: z.string().optional(),
  childAadhaarNumber: z.string().optional(),
  agreeToParticipate: optionalBoolean,
  bankAccountHolderName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfscCode: z.string().optional(),
  bankLinkedMobileNumber: z.string().optional(),
  totalFamilyMembers: optionalNumber,
  numberOfChildrenUnder18: optionalNumber,
  monthlyIncomeRs: optionalNumber,
  mainSourceOfIncome: z.string().optional(),
  weightKg: optionalNumber,
  heightCm: optionalNumber,
  haemoglobinGdl: z.union([optionalNumber, z.string()]).optional(),
  otherHealthConditions: optionalStringArray,
  otherHealthConditionSpecify: z.string().optional(),
  artStatus: z.string().optional(),
  artRegistrationDate: z.string().optional(),
  artIdNumber: z.string().optional(),
  vlStatus: z.string().optional(),
  vlDate: z.string().optional(),
  viralLoad: z.string().optional(),
  appetite: z.string().optional(),
  mealsPerDay: optionalNumber,
  educationStatus: z.union([z.string(), z.record(z.any()), z.any()]).optional(),
  educationStatusSpecify: z.string().optional(),
  schoolName: z.string().optional(),
  schoolSessionStartDate: z.string().optional(),
  schoolType: z.string().optional(),
  currentClass: z.string().optional(),
  attendance: z.string().optional(),
  schoolFees: optionalNumber,
  tuitionFees: optionalNumber,
  books: optionalNumber,
  stationery: optionalNumber,
  uniform: optionalNumber,
  transport: optionalNumber,
  otherExpenses: optionalNumber,
  totalAnnualCost: optionalNumber,
  requiredSchoolFees: optionalNumber,
  requiredTuitionFees: optionalNumber,
  requiredBooks: optionalNumber,
  requiredStationery: optionalNumber,
  requiredUniform: optionalNumber,
  requiredTransport: optionalNumber,
  requiredOtherSupport: optionalNumber,
  totalRequiredSupport: optionalNumber,
  remarks: z.string().optional(),
  approvedAllianceIndia: z.string().optional(),
  formSubmittedBy: z.string().optional(),
  organizationName: z.string().optional(),
  organizationEmail: z.string().optional(),
  allInfoCorrect: optionalBoolean,
  // Section object allowlisting
  demographics: z.record(z.any()).optional(),
  consent: z.record(z.any()).optional(),
  caregiverConsent: z.record(z.any()).optional(),
  bankingAndKyc: z.record(z.any()).optional(),
  householdFinancial: z.record(z.any()).optional(),
  health: z.record(z.any()).optional(),
  nutrition: z.record(z.any()).optional(),
  educationExpenses: z.record(z.any()).optional(),
  educationSupportRequired: z.record(z.any()).optional(),
  finalReview: z.record(z.any()).optional(),
  // Legacy aliases
  primaryCaregiverOccupation: z.string().optional(),
  monthlyHouseholdIncome: optionalNumber,
  rationCardType: z.string().optional(),
  numberOfSiblings: optionalNumber,
  muacMm: optionalNumber,
  bilateralPittingOedema: optionalBoolean,
  clinicalNotes: z.string().optional(),
  schoolEnrolled: optionalBoolean,
  schoolGrade: z.string().optional(),
  attendancePercentage: optionalNumber,
  supportMaterialsNeeded: optionalStringArray,
  accountHolderName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  bankName: z.string().optional(),
  branchName: z.string().optional(),
  passbookPhotoCaptured: optionalBoolean,
  passbookPhotoUrl: z.string().optional(),
  aadhaarCardPhotoUrl: z.string().optional(),
  childPhotoUrl: z.string().optional(),
  feeReceiptPhotoUrl: z.string().optional(),
  marksheetPhotoUrl: z.string().optional(),
  signatureDataUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
  bmi: optionalNumber,
  calculatedAgeYears: optionalNumber,
  calculatedAgeMonths: optionalNumber,
  nutritionStatus: z.string().optional(),
  bmiCategory: z.string().optional(),
  hbCategory: z.string().optional(),
  vlCategory: z.string().optional(),
  version: optionalNumber,
  revision: optionalNumber,
});

export type AllowlistedPatchChanges = z.infer<typeof allowlistedPatchChangesSchema>;

// Allowlisted Schema for PATCH Mutations with Optimistic Concurrency Control
// Accepts either new { changes: {...} } envelope or direct allowlisted fields with expectedVersion
export const patchSubmissionSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object' && val.changes && typeof val.changes === 'object') {
    return {
      ...val.changes,
      expectedVersion: val.expectedVersion ?? val.changes.expectedVersion,
    };
  }
  return val;
}, allowlistedPatchChangesSchema.extend({
  expectedVersion: permissiveExpectedVersion,
}).passthrough());

// Complete Submission Schema for API Ingestion
export const completeSubmissionSchema = z.object({
  uuid: z.string().uuid('Invalid client UUIDv4'),
  clientSubmissionId: z.string().uuid().optional(),
  uniqueId: z.string().optional(),
  interviewerName: z.string().trim().min(2, 'Please enter your name using at least 2 characters.').default('Caseworker'),
  signatureDataUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
  demographics: demographicsSchema,
  caregiverConsent: caregiverConsentSchema.optional(),
  consent: z.object({
    agreeToParticipate: z.boolean().default(true),
    signatureDataUrl: z.string().optional(),
    signatureTimestamp: z.string().optional(),
  }).optional(),
  householdFinancial: householdFinancialSchema.optional(),
  health: healthSchema.optional(),
  nutrition: z.union([nutritionHabitsSchema, z.any()]).optional(),
  educationStatus: educationStatusSchema.optional(),
  educationExpenses: educationExpensesSchema.optional(),
  educationSupportRequired: educationSupportRequiredSchema.optional(),
  finalReview: finalReviewSchema.optional(),
  bankingAndKyc: bankingAndKycSchema.optional(),
  koboId: z.string().optional(),
  approvedAllianceIndia: z.string().optional(),
  reviewConfirmed: z.boolean().optional(),
  syncNeeded: z.enum(['YES', 'NO']).optional(),
  // Legacy blocks
  household: z.any().optional(),
  education: z.any().optional(),
  bankDetails: z.any().optional(),
  declaration: z.any().optional(),
});

export type DemographicsFormValues = z.infer<typeof demographicsSchema>;
export type CaregiverConsentValues = z.infer<typeof caregiverConsentSchema>;
export type HouseholdFinancialValues = z.infer<typeof householdFinancialSchema>;
export type HealthValues = z.infer<typeof healthSchema>;
export type NutritionHabitsValues = z.infer<typeof nutritionHabitsSchema>;
export type EducationStatusValues = z.infer<typeof educationStatusSchema>;
export type EducationExpensesValues = z.infer<typeof educationExpensesSchema>;
export type EducationSupportRequiredValues = z.infer<typeof educationSupportRequiredSchema>;
export type FinalReviewValues = z.infer<typeof finalReviewSchema>;
export type CompleteSubmissionPayload = z.infer<typeof completeSubmissionSchema>;
export type PatchSubmissionPayload = z.infer<typeof patchSubmissionSchema>;
