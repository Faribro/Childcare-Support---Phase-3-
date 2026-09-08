/**
 * Clinical Nutrition & Pediatric Anthropometry Calculation Utilities
 * Based on WHO Child Growth Standards and National Health Mission (NHM) Paediatric Guidelines.
 */

import {
  NutritionStatus,
  OrphanStatus,
  BMICategory,
  HbCategory,
  VLCategory,
} from '@/types/domain';

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

  if (
    orphanStatus === 'Double orphan (both parents deceased)' ||
    orphanStatus === 'Double Orphan (Both Parents Deceased)'
  ) {
    totalGrant += 1000;
    reasons.push('Double orphan high-vulnerability allowance (+₹1,000)');
  } else if (
    orphanStatus === 'Single orphan (one parent deceased)' ||
    orphanStatus === 'Maternal Orphan' ||
    orphanStatus === 'Paternal Orphan' ||
    orphanStatus === 'Single Parent with Vulnerability'
  ) {
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

/**
 * Classifies Body Mass Index (BMI) Category for children and adolescents
 */
export function classifyBMICategory(bmi: number, ageYears: number = 5): BMICategory {
  if (!bmi || bmi <= 0) return 'Normal';

  // Pediatric cutoffs (WHO approximation)
  if (ageYears <= 18) {
    if (bmi < 13.5) return 'Severe Underweight';
    if (bmi < 15.0) return 'Underweight';
    if (bmi <= 22.0) return 'Normal';
    return 'Overweight / Obese';
  }

  // Adult cutoffs
  if (bmi < 16.0) return 'Severe Underweight';
  if (bmi < 18.5) return 'Underweight';
  if (bmi <= 24.9) return 'Normal';
  return 'Overweight / Obese';
}

/**
 * Classifies Hemoglobin (Hb) into anemia severity category based on WHO pediatric guidelines
 */
export function classifyHbCategory(haemoglobinGdl?: number | string, ageYears: number = 5): HbCategory {
  const hb = Number(haemoglobinGdl);
  if (!hb || isNaN(hb) || hb <= 0) return 'Normal';

  if (hb < 7.0) return 'Severe Anemia';
  if (hb < 10.0) return 'Moderate Anemia';

  // Mild threshold depends on age group
  let normalThreshold = 11.5;
  if (ageYears < 5) normalThreshold = 11.0;
  else if (ageYears >= 12) normalThreshold = 12.0;

  if (hb < normalThreshold) return 'Mild Anemia';
  return 'Normal';
}

/**
 * Classifies HIV Viral Load (VL) suppression status based on NACO / WHO guidelines
 */
export function classifyVLCategory(viralLoad?: number | string): VLCategory {
  if (viralLoad === undefined || viralLoad === null || String(viralLoad).trim() === '') {
    return 'Unknown / Pending';
  }

  const str = String(viralLoad).trim().toLowerCase();
  if (
    str === '< 50' ||
    str === '<50' ||
    str === 'tnd' ||
    str.includes('not detect') ||
    str.includes('undetect')
  ) {
    return 'Undetectable (<50 copies/mL)';
  }

  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return 'Unknown / Pending';

  if (num < 50) return 'Undetectable (<50 copies/mL)';
  if (num < 1000) return 'Suppressed (<1000 copies/mL)';
  return 'Unsuppressed (≥1000 copies/mL)';
}
