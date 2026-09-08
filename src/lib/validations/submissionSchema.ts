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

export const attendanceEnum = z.enum(['Regular', 'Irregular', 'Dropped out']);

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
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
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
    errorMap: () => ({ message: 'Caregiver consent must be provided to continue and submit' }),
  }),
  consentVersion: z.string().default('v1.0-2026'),
  caregiverName: z.string().min(2, 'Caregiver name is required for signature'),
  caregiverRelationship: z.string().min(2, 'Caregiver relationship is required'),
  consentCapturedAt: z.string().min(8, 'Consent timestamp is required'),
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
  weightKg: z.number().min(2, 'Weight must be at least 2 kg').max(150),
  heightCm: z.number().min(40, 'Height must be at least 40 cm').max(220),
  bmi: z.number().min(5).max(60),
  bmiCategory: z.string().optional(),
  haemoglobinGdl: z.number().min(2).max(25).optional(),
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
  appetite: appetiteEnum.default('Good'),
  mealsPerDay: z.number().min(1).max(10).default(3),
});

// Step 6: Education Status
export const educationStatusSchema = z.object({
  educationStatus: educationStatusEnum.default('Currently going to school'),
  educationStatusSpecify: z.string().optional(),
  schoolName: z.string().optional(),
  schoolSessionStartDate: z.string().optional(),
  schoolType: schoolTypeEnum.optional(),
  currentClass: z.string().optional(),
  attendance: attendanceEnum.optional(),
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
    errorMap: () => ({ message: 'All information must be confirmed correct before submission' }),
  }),
  organizationName: z.string().default('India HIV/AIDS Alliance'),
  formSubmittedBy: z.string().min(2, 'Submitter name is required'),
  organizationEmail: z.string().email().optional().or(z.literal('')),
  submissionDate: z.string().optional(),
  approvedAllianceIndia: z.string().optional(),
  reviewConfirmed: z.boolean().optional(),
});

// Allowlisted Schema for PATCH Mutations with Optimistic Concurrency Control
export const patchSubmissionSchema = z.object({
  expectedVersion: z.number().int().positive('expectedVersion must be a positive integer'),
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
  agreeToParticipate: z.boolean().optional(),
  bankAccountHolderName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfscCode: z.string().optional(),
  bankLinkedMobileNumber: z.string().optional(),
  totalFamilyMembers: z.number().optional(),
  numberOfChildrenUnder18: z.number().optional(),
  monthlyIncomeRs: z.number().optional(),
  mainSourceOfIncome: z.string().optional(),
  weightKg: z.number().optional(),
  heightCm: z.number().optional(),
  haemoglobinGdl: z.union([z.number(), z.string()]).optional(),
  otherHealthConditions: z.array(z.string()).optional(),
  otherHealthConditionSpecify: z.string().optional(),
  artStatus: z.string().optional(),
  artRegistrationDate: z.string().optional(),
  artIdNumber: z.string().optional(),
  vlStatus: z.string().optional(),
  vlDate: z.string().optional(),
  viralLoad: z.string().optional(),
  appetite: z.string().optional(),
  mealsPerDay: z.number().optional(),
  educationStatus: z.string().optional(),
  educationStatusSpecify: z.string().optional(),
  schoolName: z.string().optional(),
  schoolSessionStartDate: z.string().optional(),
  schoolType: z.string().optional(),
  currentClass: z.string().optional(),
  attendance: z.string().optional(),
  schoolFees: z.number().optional(),
  tuitionFees: z.number().optional(),
  books: z.number().optional(),
  stationery: z.number().optional(),
  uniform: z.number().optional(),
  transport: z.number().optional(),
  otherExpenses: z.number().optional(),
  totalAnnualCost: z.number().optional(),
  requiredSchoolFees: z.number().optional(),
  requiredBooks: z.number().optional(),
  requiredStationery: z.number().optional(),
  requiredUniform: z.number().optional(),
  requiredTransport: z.number().optional(),
  requiredOtherSupport: z.number().optional(),
  totalRequiredSupport: z.number().optional(),
  remarks: z.string().optional(),
  approvedAllianceIndia: z.string().optional(),
  formSubmittedBy: z.string().optional(),
  organizationName: z.string().optional(),
  organizationEmail: z.string().optional(),
  allInfoCorrect: z.boolean().optional(),
  // Legacy aliases
  primaryCaregiverOccupation: z.string().optional(),
  monthlyHouseholdIncome: z.number().optional(),
  rationCardType: z.string().optional(),
  numberOfSiblings: z.number().optional(),
  muacMm: z.number().optional(),
  bilateralPittingOedema: z.boolean().optional(),
  clinicalNotes: z.string().optional(),
  schoolEnrolled: z.boolean().optional(),
  schoolGrade: z.string().optional(),
  attendancePercentage: z.number().optional(),
  supportMaterialsNeeded: z.array(z.string()).optional(),
  accountHolderName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  bankName: z.string().optional(),
  branchName: z.string().optional(),
  passbookPhotoCaptured: z.boolean().optional(),
  passbookPhotoUrl: z.string().optional(),
  aadhaarCardPhotoUrl: z.string().optional(),
  childPhotoUrl: z.string().optional(),
  feeReceiptPhotoUrl: z.string().optional(),
  marksheetPhotoUrl: z.string().optional(),
  signatureDataUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
}).passthrough();

// Complete Submission Schema for API Ingestion
export const completeSubmissionSchema = z.object({
  uuid: z.string().uuid('Invalid client UUIDv4'),
  clientSubmissionId: z.string().uuid().optional(),
  uniqueId: z.string().optional(),
  interviewerName: z.string().min(2).default('Caseworker'),
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
