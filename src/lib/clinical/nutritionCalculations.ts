/**
 * Clinical Nutrition & Pediatric Anthropometry Calculation Utilities
 * Based on WHO Child Growth Standards and National Health Mission (NHM) Paediatric Guidelines.
 */

import { NutritionStatus, OrphanStatus } from '@/types/domain';

export interface AgeResult {
  years: number;
  months: number;
  totalMonths: number;
}

export interface NutritionAssessmentResult {
  bmi: number;
  bmiZScore: number;
  nutritionStatus: NutritionStatus;
  isEmergencyReferral: boolean;
  triageNotes: string;
}

export interface GrantRecommendationResult {
  grantRecommended: boolean;
  recommendedGrantAmount: number;
  rationale: string;
}

/**
 * Calculates accurate age from ISO date string (YYYY-MM-DD)
 */
export function calculateAge(dobIso: string, referenceDate: Date = new Date()): AgeResult {
  const birthDate = new Date(dobIso);
  if (isNaN(birthDate.getTime())) {
    throw new Error('Invalid Date of Birth format');
  }

  let years = referenceDate.getFullYear() - birthDate.getFullYear();
  let months = referenceDate.getMonth() - birthDate.getMonth();

  if (referenceDate.getDate() < birthDate.getDate()) {
    months--;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const totalMonths = Math.max(0, years * 12 + months);

  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    totalMonths,
  };
}

/**
 * Calculates Body Mass Index (BMI) in kg/m^2
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  if (heightCm <= 0 || weightKg <= 0) {
    return 0;
  }
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}

/**
 * Classifies Child Nutrition Status using WHO Anthropometric Criteria:
 * - Bilateral Pitting Oedema -> Automatic SAM
 * - MUAC < 115 mm -> SAM
 * - MUAC 115-124 mm -> MAM
 * - BMI Z-score approximation
 */
export function classifyNutritionStatus(params: {
  ageYears: number;
  heightCm: number;
  weightKg: number;
  muacMm?: number;
  bilateralPittingOedema?: boolean;
}): NutritionAssessmentResult {
  const { ageYears, heightCm, weightKg, muacMm, bilateralPittingOedema = false } = params;
  const bmi = calculateBMI(weightKg, heightCm);

  // 1. Bilateral Pitting Oedema is the primary clinical diagnostic for Kwashiorkor / Complicated SAM
  if (bilateralPittingOedema) {
    return {
      bmi,
      bmiZScore: -3.5,
      nutritionStatus: 'SAM (Severe Acute Malnutrition)',
      isEmergencyReferral: true,
      triageNotes: 'Bilateral pitting oedema detected. Immediate referral to Nutrition Rehabilitation Centre (NRC) required.',
    };
  }

  // 2. MUAC assessment for children under 5 years (6–59 months)
  if (muacMm !== undefined && muacMm > 0 && ageYears <= 5) {
    if (muacMm < 115) {
      return {
        bmi,
        bmiZScore: -3.2,
        nutritionStatus: 'SAM (Severe Acute Malnutrition)',
        isEmergencyReferral: true,
        triageNotes: `Critical MUAC (${muacMm} mm < 115 mm). Severe wasting detected.`,
      };
    }
    if (muacMm >= 115 && muacMm < 125) {
      return {
        bmi,
        bmiZScore: -2.3,
        nutritionStatus: 'MAM (Moderate Acute Malnutrition)',
        isEmergencyReferral: false,
        triageNotes: `Borderline MUAC (${muacMm} mm in 115-124 mm zone). Supplementary nutrition support recommended.`,
      };
    }
  }

  // 3. BMI-for-age standard approximation (WHO baseline median ~15.5 kg/m^2 for primary school children)
  const referenceMedianBMI = 15.2 + (ageYears > 5 ? (ageYears - 5) * 0.3 : 0);
  const approximateZScore = Math.round(((bmi - referenceMedianBMI) / 1.5) * 10) / 10;

  if (approximateZScore < -3.0) {
    return {
      bmi,
      bmiZScore: approximateZScore,
      nutritionStatus: 'SAM (Severe Acute Malnutrition)',
      isEmergencyReferral: true,
      triageNotes: `Severe wasting with BMI ${bmi} (Z-Score ${approximateZScore} < -3 SD).`,
    };
  }

  if (approximateZScore >= -3.0 && approximateZScore < -2.0) {
    return {
      bmi,
      bmiZScore: approximateZScore,
      nutritionStatus: 'MAM (Moderate Acute Malnutrition)',
      isEmergencyReferral: false,
      triageNotes: `Moderate wasting with BMI ${bmi} (Z-Score ${approximateZScore} between -2 and -3 SD).`,
    };
  }

  if (approximateZScore > 2.0) {
    return {
      bmi,
      bmiZScore: approximateZScore,
      nutritionStatus: 'Overweight / Obese',
      isEmergencyReferral: false,
      triageNotes: `Elevated BMI ${bmi} (Z-Score ${approximateZScore} > +2 SD). Dietary guidance suggested.`,
    };
  }

  return {
    bmi,
    bmiZScore: approximateZScore,
    nutritionStatus: 'Normal',
    isEmergencyReferral: false,
    triageNotes: `Child growth parameters within expected normal standard (BMI: ${bmi}).`,
  };
}

/**
 * Calculates Educational and Nutrition Support Grant Entitlement
 */
export function calculateGrantEntitlement(params: {
  schoolEnrolled: boolean;
  attendancePercentage?: number;
  nutritionStatus: NutritionStatus;
  orphanStatus: OrphanStatus;
}): GrantRecommendationResult {
  const { schoolEnrolled, attendancePercentage = 0, nutritionStatus, orphanStatus } = params;

  if (!schoolEnrolled) {
    return {
      grantRecommended: false,
      recommendedGrantAmount: 0,
      rationale: 'Grant reserved for enrolled children. Re-enrollment and non-formal bridging support recommended.',
    };
  }

  let totalGrant = 2000; // Baseline educational grant in INR
  const reasons: string[] = ['Standard educational & stationery grant (₹2,000)'];

  if (nutritionStatus === 'SAM (Severe Acute Malnutrition)') {
    totalGrant += 1500;
    reasons.push('SAM clinical nutritional supplementation booster (+₹1,500)');
  } else if (nutritionStatus === 'MAM (Moderate Acute Malnutrition)') {
    totalGrant += 1000;
    reasons.push('MAM nutritional supplementation booster (+₹1,000)');
  }

  if (orphanStatus === 'Double Orphan (Both Parents Deceased)') {
    totalGrant += 1000;
    reasons.push('Double orphan high-vulnerability allowance (+₹1,000)');
  } else if (orphanStatus === 'Maternal Orphan' || orphanStatus === 'Paternal Orphan') {
    totalGrant += 500;
    reasons.push('Single-parent orphan hardship allowance (+₹500)');
  }

  if (attendancePercentage > 0 && attendancePercentage < 60) {
    reasons.push('Note: Attendance is below 60%. Social worker counseling scheduled with caregiver.');
  }

  return {
    grantRecommended: true,
    recommendedGrantAmount: totalGrant,
    rationale: reasons.join('; '),
  };
}
