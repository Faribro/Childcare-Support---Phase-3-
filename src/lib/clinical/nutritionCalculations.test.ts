import { describe, it, expect } from 'vitest';
import {
  calculateAge,
  calculateBMI,
  classifyNutritionStatus,
  calculateGrantEntitlement,
} from './nutritionCalculations';

describe('Clinical Nutrition & Growth Standards (TCK-005)', () => {
  describe('calculateAge', () => {
    it('should correctly calculate age from DOB', () => {
      const referenceDate = new Date('2026-09-08');
      const age = calculateAge('2019-03-15', referenceDate);
      expect(age.years).toBe(7);
      expect(age.months).toBe(5);
      expect(age.totalMonths).toBe(89);
    });

    it('should throw an error for invalid date format', () => {
      expect(() => calculateAge('invalid-date')).toThrow('Invalid Date of Birth format');
    });
  });

  describe('calculateBMI', () => {
    it('should accurately calculate BMI rounded to 1 decimal place', () => {
      // 14.5 kg, 102 cm (1.02 m) -> 14.5 / (1.02 * 1.02) = 13.936... -> 13.9
      const bmi = calculateBMI(14.5, 102);
      expect(bmi).toBe(13.9);
    });

    it('should return 0 when height or weight is non-positive', () => {
      expect(calculateBMI(0, 100)).toBe(0);
      expect(calculateBMI(20, 0)).toBe(0);
    });
  });

  describe('classifyNutritionStatus', () => {
    it('should flag SAM immediately if bilateral pitting oedema is present', () => {
      const result = classifyNutritionStatus({
        ageYears: 4,
        heightCm: 95,
        weightKg: 13,
        bilateralPittingOedema: true,
      });
      expect(result.nutritionStatus).toBe('SAM (Severe Acute Malnutrition)');
      expect(result.isEmergencyReferral).toBe(true);
      expect(result.triageNotes).toContain('Bilateral pitting oedema');
    });

    it('should flag SAM if MUAC is under 115mm in child <= 5 years', () => {
      const result = classifyNutritionStatus({
        ageYears: 3,
        heightCm: 88,
        weightKg: 10,
        muacMm: 110,
        bilateralPittingOedema: false,
      });
      expect(result.nutritionStatus).toBe('SAM (Severe Acute Malnutrition)');
      expect(result.isEmergencyReferral).toBe(true);
      expect(result.triageNotes).toContain('Critical MUAC');
    });

    it('should flag MAM if MUAC is between 115mm and 124mm', () => {
      const result = classifyNutritionStatus({
        ageYears: 4,
        heightCm: 95,
        weightKg: 12.5,
        muacMm: 120,
        bilateralPittingOedema: false,
      });
      expect(result.nutritionStatus).toBe('MAM (Moderate Acute Malnutrition)');
      expect(result.isEmergencyReferral).toBe(false);
      expect(result.triageNotes).toContain('Borderline MUAC');
    });

    it('should return Normal for healthy anthropometric values', () => {
      const result = classifyNutritionStatus({
        ageYears: 7,
        heightCm: 118,
        weightKg: 21,
        bilateralPittingOedema: false,
      });
      expect(result.nutritionStatus).toBe('Normal');
      expect(result.isEmergencyReferral).toBe(false);
    });
  });

  describe('calculateGrantEntitlement', () => {
    it('should not recommend grant if child is not enrolled in school', () => {
      const result = calculateGrantEntitlement({
        schoolEnrolled: false,
        nutritionStatus: 'Normal',
        orphanStatus: 'None',
      });
      expect(result.grantRecommended).toBe(false);
      expect(result.recommendedGrantAmount).toBe(0);
    });

    it('should calculate baseline grant + SAM boost + double orphan boost', () => {
      const result = calculateGrantEntitlement({
        schoolEnrolled: true,
        attendancePercentage: 85,
        nutritionStatus: 'SAM (Severe Acute Malnutrition)',
        orphanStatus: 'Double Orphan (Both Parents Deceased)',
      });
      // 2000 (base) + 1500 (SAM) + 1000 (Double orphan) = 4500
      expect(result.grantRecommended).toBe(true);
      expect(result.recommendedGrantAmount).toBe(4500);
      expect(result.rationale).toContain('₹2,000');
      expect(result.rationale).toContain('₹1,500');
      expect(result.rationale).toContain('₹1,000');
    });
  });
});
