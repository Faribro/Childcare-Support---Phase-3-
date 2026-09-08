/**
 * Zod Runtime Validation Schemas for Childcare Support — Phase 3
 * Enforces strict data integrity across all 6 wizard steps and backend API ingestion.
 */

import { z } from 'zod';

export const genderEnum = z.enum(['Male', 'Female', 'Transgender', 'Other']);

export const orphanStatusEnum = z.enum([
  'None',
  'Maternal Orphan',
  'Paternal Orphan',
  'Double Orphan (Both Parents Deceased)',
  'Single Parent with Vulnerability',
]);

export const rationCardEnum = z.enum(['BPL', 'AAY (Antyodaya)', 'APL', 'None']);

export const nutritionStatusEnum = z.enum([
  'Normal',
  'MAM (Moderate Acute Malnutrition)',
  'SAM (Severe Acute Malnutrition)',
  'Overweight / Obese',
]);

// Step 1: Child Demographics Schema
export const demographicsSchema = z.object({
  artNumber: z
    .string()
    .min(3, 'ART Number must be at least 3 characters')
    .max(30, 'ART Number cannot exceed 30 characters')
    .regex(/^[A-Z0-9\-_/]+$/i, 'ART Number contains invalid characters'),
  childName: z
    .string()
    .min(2, 'Child name must be at least 2 characters')
    .max(100, 'Child name cannot exceed 100 characters'),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of Birth must be in YYYY-MM-DD format')
    .refine((val) => {
      const d = new Date(val);
      return !isNaN(d.getTime()) && d <= new Date();
    }, 'Date of Birth cannot be in the future'),
  gender: genderEnum,
  caregiverName: z.string().min(2, 'Caregiver name must be at least 2 characters'),
  caregiverRelationship: z.string().min(2, 'Relationship to child is required'),
  caregiverPhone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
  maskedAadhaar: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^XXXX-XXXX-\d{4}$/.test(val) || /^\d{12}$/.test(val),
      'Aadhaar must be formatted as XXXX-XXXX-1234 or 12 digits'
    ),
  district: z.string().min(2, 'District is required'),
  artCenter: z.string().min(2, 'ART Centre name is required'),
});

// Step 2: Household & Family Schema
export const householdSchema = z.object({
  orphanStatus: orphanStatusEnum,
  primaryCaregiverOccupation: z.string().min(2, 'Caregiver occupation is required'),
  monthlyHouseholdIncome: z
    .number({ invalid_type_error: 'Please enter a valid income' })
    .min(0, 'Income cannot be negative'),
  rationCardType: rationCardEnum,
  numberOfSiblings: z
    .number({ invalid_type_error: 'Please enter number of siblings' })
    .int()
    .min(0, 'Cannot be negative'),
});

// Step 3: Clinical Nutrition Anthropometry Schema
export const nutritionSchema = z.object({
  heightCm: z
    .number({ invalid_type_error: 'Height in cm is required' })
    .min(40, 'Height must be at least 40 cm')
    .max(220, 'Height cannot exceed 220 cm'),
  weightKg: z
    .number({ invalid_type_error: 'Weight in kg is required' })
    .min(2, 'Weight must be at least 2 kg')
    .max(150, 'Weight cannot exceed 150 kg'),
  muacMm: z
    .number()
    .min(50, 'MUAC must be at least 50 mm')
    .max(300, 'MUAC cannot exceed 300 mm')
    .optional(),
  bilateralPittingOedema: z.boolean().default(false),
  clinicalNotes: z.string().max(500).optional(),
});

// Step 4: Education & Support Schema
export const educationSchema = z.object({
  schoolEnrolled: z.boolean(),
  schoolType: z
    .enum(['Government', 'Government-Aided', 'Private', 'Non-Formal'])
    .optional(),
  schoolGrade: z.string().max(30).optional(),
  attendancePercentage: z.number().min(0).max(100).optional(),
  supportMaterialsNeeded: z.array(z.string()).default([]),
});

// Step 5: Direct Benefit Transfer (DBT) Bank Details Schema
export const bankDetailsSchema = z.object({
  accountHolderName: z.string().min(2, 'Account holder name is required'),
  accountNumber: z
    .string()
    .regex(/^\d{9,18}$/, 'Bank account number must be 9 to 18 digits'),
  ifscCode: z
    .string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code (e.g. SBIN0001234)'),
  bankName: z.string().min(2, 'Bank name is required'),
  branchName: z.string().min(2, 'Branch name is required'),
  passbookPhotoCaptured: z.boolean().default(false),
});

// Step 6: Caseworker Declaration Schema
export const declarationSchema = z.object({
  consentAcknowledged: z.literal(true, {
    errorMap: () => ({ message: 'Informed consent must be confirmed before submission' }),
  }),
  caseworkerName: z.string().min(2, 'Caseworker name is required'),
  declarationDate: z.string().min(8, 'Declaration date is required'),
});

// Complete Submission Schema for API Ingestion
export const completeSubmissionSchema = z.object({
  uuid: z.string().uuid('Invalid client UUIDv4'),
  interviewerName: z.string().min(2),
  demographics: demographicsSchema,
  household: householdSchema,
  nutrition: nutritionSchema,
  education: educationSchema,
  bankDetails: bankDetailsSchema,
  declaration: declarationSchema,
});

export type DemographicsFormValues = z.infer<typeof demographicsSchema>;
export type HouseholdFormValues = z.infer<typeof householdSchema>;
export type NutritionFormValues = z.infer<typeof nutritionSchema>;
export type EducationFormValues = z.infer<typeof educationSchema>;
export type BankDetailsFormValues = z.infer<typeof bankDetailsSchema>;
export type DeclarationFormValues = z.infer<typeof declarationSchema>;
export type CompleteSubmissionPayload = z.infer<typeof completeSubmissionSchema>;
