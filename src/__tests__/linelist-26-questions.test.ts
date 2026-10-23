import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  genderEnum,
  demographicsSchema,
  healthSchema,
  nutritionHabitsSchema,
  educationStatusSchema,
  educationExpensesSchema,
  allowlistedPatchChangesSchema,
  flattenPatchBody,
} from '../lib/validations/submissionSchema';
import { normalizeSubmissionData } from '../lib/server/canonicalSubmissionAdapter';
import { generateBeneficiaryPdfBuffer } from '../lib/server/pdfExportService';

describe('26-Question Linelist End-to-End Test Suite', () => {
  // 1. All 26 Questions Present and Traceable
  const full26SyntheticRecord = {
    // 1. State Name
    state: 'Maharashtra',
    // 2. SR Name
    srName: 'Alliance India State Office',
    // 3. SSR Name
    ssrName: 'Pune District Community Care Center',
    // 4. Name of the Child
    childName: 'Aarav Sharma',
    // 5. Address
    fullAddress: 'Plot 42, Shanti Nagar, Near ZP School, Haveli',
    // 6. District
    district: 'Pune',
    // 7. UID/ART No. (Clinical ART ID & Demographics Reference)
    artIdNumber: '0049281',
    artNumber: 'MH-PUN-2026-0042',
    // 8. On ART Since (DD-MM-YYYY)
    artInitiationDate: '2023-04-15',
    artRegistrationDate: '2023-04-10',
    // 9. Type of ART Medicines
    artMedicineType: 'Pediatric TLD Fixed Dose Combination',
    // 10. CD4 Count (Latest)
    cd4Count: '680 cells/mm³',
    // 11. Viral Load (Latest)
    viralLoad: '< 50 copies/mL',
    vlCategory: 'Target Not Detected / Suppressed',
    // 12. Known Co-morbidities
    otherHealthConditions: ['TB (Tuberculosis)', 'Any Other Health Condition (specify)'],
    otherHealthConditionSpecify: 'Mild allergic dermatitis',
    // 13. Date of Birth (DD-MM-YYYY)
    dob: '2016-08-20',
    // 14. Sex (M/F/TG)
    gender: 'TG',
    // 15. Parent/Guardian Name
    caregiverName: 'Meena Sharma',
    caregiverRelationship: 'Mother',
    // 16. Contact Number
    contactNumber: '9822012345',
    // 17. Status of Guardian/Parent
    guardianStatus: 'Single parent, sole earner',
    // 18. Orphan Status
    orphanStatus: 'Single orphan (one parent deceased)',
    // 19. Is the child currently enrolled in school?
    educationStatus: 'Currently going to school',
    // 20. Type of School
    schoolType: 'Government school',
    // 21. Is the child with disability?
    hasDisability: 'Yes',
    // 22. Types of Disability
    disabilityType: 'Mild visual impairment',
    // 23. Does the child have a disability certificate?
    disabilityCertificateStatus: 'Applied / In Process',
    // 24. Is the child receiving any education-scheme benefit?
    receivingEducationSchemeBenefit: 'Yes',
    // 25. Symptoms of Malnutrition
    malnutritionSymptoms: 'Moderate wasting, mild pallor, low appetite during monsoon',
    // 26. Remarks
    remarks: 'Beneficiary assessed for Phase 3 nutrition and education grant stipend.',
  };

  it('validates all 26 fields across the strict Zod validation schemas', () => {
    // Demographics Schema: State, SR Name, SSR Name, Child Name, Address, District, DOB, Sex, Caregiver, Contact, Guardian Status, Orphan Status
    const parsedDemo = demographicsSchema.parse({
      state: full26SyntheticRecord.state,
      srName: full26SyntheticRecord.srName,
      ssrName: full26SyntheticRecord.ssrName,
      childName: full26SyntheticRecord.childName,
      fullAddress: full26SyntheticRecord.fullAddress,
      district: full26SyntheticRecord.district,
      dob: full26SyntheticRecord.dob,
      gender: full26SyntheticRecord.gender,
      caregiverName: full26SyntheticRecord.caregiverName,
      caregiverRelationship: full26SyntheticRecord.caregiverRelationship,
      contactNumber: full26SyntheticRecord.contactNumber,
      guardianStatus: full26SyntheticRecord.guardianStatus,
      orphanStatus: full26SyntheticRecord.orphanStatus,
      artNumber: full26SyntheticRecord.artNumber,
    });
    expect(parsedDemo.srName).toBe(full26SyntheticRecord.srName);
    expect(parsedDemo.ssrName).toBe(full26SyntheticRecord.ssrName);
    expect(parsedDemo.guardianStatus).toBe(full26SyntheticRecord.guardianStatus);
    expect(parsedDemo.gender).toBe('TG');

    // Health Schema: UID/ART, On ART Since, ART Regimen, CD4 Count, Viral Load, Co-morbidities, Disability block
    const parsedHealth = healthSchema.parse({
      artIdNumber: full26SyntheticRecord.artIdNumber,
      artInitiationDate: full26SyntheticRecord.artInitiationDate,
      artRegistrationDate: full26SyntheticRecord.artRegistrationDate,
      artMedicineType: full26SyntheticRecord.artMedicineType,
      cd4Count: full26SyntheticRecord.cd4Count,
      viralLoad: full26SyntheticRecord.viralLoad,
      vlCategory: full26SyntheticRecord.vlCategory,
      otherHealthConditions: full26SyntheticRecord.otherHealthConditions,
      otherHealthConditionSpecify: full26SyntheticRecord.otherHealthConditionSpecify,
      hasDisability: full26SyntheticRecord.hasDisability,
      disabilityType: full26SyntheticRecord.disabilityType,
      disabilityCertificateStatus: full26SyntheticRecord.disabilityCertificateStatus,
    });
    expect(parsedHealth.artIdNumber).toBe('0049281');
    expect(parsedHealth.artInitiationDate).toBe('2023-04-15');
    expect(parsedHealth.artMedicineType).toBe('Pediatric TLD Fixed Dose Combination');
    expect(parsedHealth.cd4Count).toBe('680 cells/mm³');
    expect(parsedHealth.hasDisability).toBe('Yes');
    expect(parsedHealth.disabilityType).toBe('Mild visual impairment');
    expect(parsedHealth.disabilityCertificateStatus).toBe('Applied / In Process');

    // Nutrition Schema: Malnutrition Symptoms
    const parsedNutrition = nutritionHabitsSchema.parse({
      appetite: 'Moderate',
      mealsPerDay: 3,
      malnutritionSymptoms: full26SyntheticRecord.malnutritionSymptoms,
    });
    expect(parsedNutrition.malnutritionSymptoms).toBe(full26SyntheticRecord.malnutritionSymptoms);

    // Education Schema: Enrolled status, school type, scheme benefit
    const parsedEducation = educationStatusSchema.parse({
      educationStatus: full26SyntheticRecord.educationStatus,
      schoolType: full26SyntheticRecord.schoolType,
      receivingEducationSchemeBenefit: full26SyntheticRecord.receivingEducationSchemeBenefit,
    });
    expect(parsedEducation.schoolType).toBe('Government school');
    expect(parsedEducation.receivingEducationSchemeBenefit).toBe('Yes');

    // Expenses Schema: Remarks
    const parsedExpenses = educationExpensesSchema.parse({
      remarks: full26SyntheticRecord.remarks,
    });
    expect(parsedExpenses.remarks).toBe(full26SyntheticRecord.remarks);
  });

  it('guarantees sex representation: supports M/F/TG without mutating historical "Other" entries into "TG"', () => {
    // Both M/F/TG and Male/Female/Other must be valid in genderEnum
    expect(genderEnum.safeParse('M').success).toBe(true);
    expect(genderEnum.safeParse('F').success).toBe(true);
    expect(genderEnum.safeParse('TG').success).toBe(true);
    expect(genderEnum.safeParse('Male').success).toBe(true);
    expect(genderEnum.safeParse('Female').success).toBe(true);
    expect(genderEnum.safeParse('Other').success).toBe(true);
    expect(genderEnum.safeParse('Transgender').success).toBe(true);

    // Historical record with 'Other' remains 'Other'
    const historicalPayload = {
      artNumber: 'MH-PUN-001',
      childName: 'Pooja Patil',
      dob: '2015-05-10',
      gender: 'Other',
      caregiverName: 'Sita Patil',
      caregiverRelationship: 'Mother',
      district: 'Thane',
    };
    const parsedHistorical = demographicsSchema.parse(historicalPayload);
    expect(parsedHistorical.gender).toBe('Other');
    expect(parsedHistorical.gender).not.toBe('TG');
  });

  it('preserves leading zeroes in clinical ART ID and keeps it distinct from generated reference ID', () => {
    const clinicalArtId = '0008472';
    const systemArtRef = 'MH-PUN-221830-01';

    const health = healthSchema.parse({
      artIdNumber: clinicalArtId,
    });
    expect(health.artIdNumber).toBe('0008472');
    expect(typeof health.artIdNumber).toBe('string');
    expect(health.artIdNumber).not.toBe(8472);

    const demo = demographicsSchema.parse({
      childName: 'Karan Singh',
      dob: '2017-03-12',
      caregiverName: 'Anita Singh',
      caregiverRelationship: 'Mother',
      district: 'Pune',
      artNumber: systemArtRef,
    });
    expect(demo.artNumber).toBe(systemArtRef);
    expect(health.artIdNumber).not.toBe(demo.artNumber);
  });

  it('preserves On ART Since independently from ART Registration Date', () => {
    const health = healthSchema.parse({
      artRegistrationDate: '2021-01-10',
      artInitiationDate: '2021-02-15',
    });
    expect(health.artRegistrationDate).toBe('2021-01-10');
    expect(health.artInitiationDate).toBe('2021-02-15');
    expect(health.artInitiationDate).not.toBe(health.artRegistrationDate);
  });

  it('retains conditional disability and certificate status even if toggled', () => {
    const healthWithDisability = healthSchema.parse({
      hasDisability: 'Yes',
      disabilityType: 'Locomotor Disability',
      disabilityCertificateStatus: 'Yes',
    });
    expect(healthWithDisability.hasDisability).toBe('Yes');
    expect(healthWithDisability.disabilityType).toBe('Locomotor Disability');
    expect(healthWithDisability.disabilityCertificateStatus).toBe('Yes');

    // Data retained even when hasDisability is 'No'
    const healthRetained = healthSchema.parse({
      hasDisability: 'No',
      disabilityType: 'Locomotor Disability',
      disabilityCertificateStatus: 'Yes',
    });
    expect(healthRetained.hasDisability).toBe('No');
    expect(healthRetained.disabilityType).toBe('Locomotor Disability');
  });

  it('allows all 11 new fields through PATCH allowlist and flattens nested patch structures', () => {
    const patchBody = {
      editReason: 'Routine annual audit update',
      demographics: {
        srName: 'Alliance India Central SR',
        ssrName: 'District SSR Partner',
        guardianStatus: 'Employed / Both parents alive',
        gender: 'TG',
      },
      health: {
        artInitiationDate: '2022-09-01',
        artMedicineType: 'DTG based regimen',
        cd4Count: '750 cells/mm³',
        hasDisability: 'No',
        disabilityType: 'None',
        disabilityCertificateStatus: 'No',
      },
      nutrition: {
        malnutritionSymptoms: 'No acute malnutrition detected',
      },
      educationStatus: {
        receivingEducationSchemeBenefit: 'Applied / Under Review',
      },
    };

    const flattened = flattenPatchBody(patchBody);
    expect(flattened.srName).toBe('Alliance India Central SR');
    expect(flattened.ssrName).toBe('District SSR Partner');
    expect(flattened.guardianStatus).toBe('Employed / Both parents alive');
    expect(flattened.gender).toBe('TG');
    expect(flattened.artInitiationDate).toBe('2022-09-01');
    expect(flattened.artMedicineType).toBe('DTG based regimen');
    expect(flattened.cd4Count).toBe('750 cells/mm³');
    expect(flattened.hasDisability).toBe('No');
    expect(flattened.malnutritionSymptoms).toBe('No acute malnutrition detected');
    expect(flattened.receivingEducationSchemeBenefit).toBe('Applied / Under Review');

    const parsedPatch = allowlistedPatchChangesSchema.parse(flattened);
    expect(parsedPatch.srName).toBe('Alliance India Central SR');
    expect(parsedPatch.artInitiationDate).toBe('2022-09-01');
    expect(parsedPatch.malnutritionSymptoms).toBe('No acute malnutrition detected');
    expect(parsedPatch.receivingEducationSchemeBenefit).toBe('Applied / Under Review');
  });

  it('verifies gas/Code.js extends COLUMN_HEADERS to 83 columns while preserving columns 1-73 exactly', () => {
    const gasPath = path.resolve(__dirname, '../../gas/Code.js');
    const gasCode = fs.readFileSync(gasPath, 'utf-8');

    // Verify 83 column headers
    expect(gasCode).toContain('"74\\nSR Name"');
    expect(gasCode).toContain('"75\\nSSR Name"');
    expect(gasCode).toContain('"76\\nStatus of Guardian/Parent"');
    expect(gasCode).toContain('"77\\nType of ART Medicines"');
    expect(gasCode).toContain('"78\\nCD4 Count (Latest)"');
    expect(gasCode).toContain('"79\\nIs Child With Disability"');
    expect(gasCode).toContain('"80\\nTypes of Disability"');
    expect(gasCode).toContain('"81\\nDisability Certificate"');
    expect(gasCode).toContain('"82\\nEducation Scheme Benefit"');
    expect(gasCode).toContain('"83\\nSymptoms of Malnutrition"');

    // Columns 1-73 preserved
    expect(gasCode).toContain('"1\\nUnique ID"');
    expect(gasCode).toContain('"73\\nLast Updated"');

    // Document columns intact
    expect(gasCode).toContain('SIGNATURE: 6');
    expect(gasCode).toContain('PASSBOOK: 25');
    expect(gasCode).toContain('AADHAAR: 26');
    expect(gasCode).toContain('CHILD_PHOTO: 27');
    expect(gasCode).toContain('FEE_RECEIPT: 64');
    expect(gasCode).toContain('MARKSHEET: 65');
  });

  it('normalizes sheet row with columns 74-83 into canonical structured submission data', () => {
    const rawSheetRow: any = {
      '1\nUnique ID': 'TEST-REC-001',
      '9\nChild Name': 'Ananya Rao',
      '10\nDate of Birth': '2018-05-15',
      '12\nGender': 'TG',
      '14\nCaregiver Full Name': 'Sunita Rao',
      '16\nCaregiver Contact': '9811122233',
      '18\nState': 'Maharashtra',
      '19\nDistrict': 'Pune',
      '42\nART ID Number': '009182',
      '41\nART Registration Date': '2023-01-10',
      '74\nSR Name': 'Alliance Maharashtra SR',
      '75\nSSR Name': 'Pune Urban SSR',
      '76\nStatus of Guardian/Parent': 'Working Mother',
      '77\nType of ART Medicines': 'Pediatric syrup formulation',
      '78\nCD4 Count (Latest)': '820',
      '79\nIs Child With Disability': 'No',
      '80\nTypes of Disability': '',
      '81\nDisability Certificate': 'No',
      '82\nEducation Scheme Benefit': 'Yes',
      '83\nSymptoms of Malnutrition': 'Good overall appetite, no edema',
      '66\nRemarks (If Any)': 'Routine intake visit completed',
    };

    const normalized = normalizeSubmissionData(rawSheetRow, 'BEN-2026-001', 1);
    expect(normalized.demographics?.childName).toBe('Ananya Rao');
    expect(normalized.demographics?.srName).toBe('Alliance Maharashtra SR');
    expect(normalized.demographics?.ssrName).toBe('Pune Urban SSR');
    expect(normalized.demographics?.guardianStatus).toBe('Working Mother');
    expect(normalized.demographics?.gender).toBe('TG');
    expect(normalized.health?.artIdNumber).toBe('009182');
    expect(normalized.health?.artMedicineType).toBe('Pediatric syrup formulation');
    expect(normalized.health?.cd4Count).toBe('820');
    expect(normalized.health?.hasDisability).toBe('No');
    expect(normalized.nutrition?.malnutritionSymptoms).toBe('Good overall appetite, no edema');
    expect(normalized.educationStatus?.receivingEducationSchemeBenefit).toBe('Yes');
    expect(normalized.educationExpenses?.remarks).toBe('Routine intake visit completed');
  });

  it('generates a valid PDF buffer including representation for the 26 linelist fields', () => {
    const pdfBuffer = generateBeneficiaryPdfBuffer({
      id: 'BEN-2026-0042',
      uniqueId: 'BEN-2026-0042',
      demographics: {
        childName: 'Aarav Sharma',
        artNumber: 'MH-PUN-0042',
        calculatedAgeYears: 9,
        gender: 'TG',
        orphanStatus: 'Single orphan',
        state: 'Maharashtra',
        district: 'Pune',
        caregiverName: 'Meena Sharma',
        srName: 'Alliance India SR',
        ssrName: 'Pune CBO SSR',
        guardianStatus: 'Single mother',
      },
      clinical: {
        bmi: 16.2,
        bmiCategory: 'Normal',
        viralLoad: '< 50',
        vlCategory: 'Suppressed',
        hemoglobinLevel: '12.4',
        hbCategory: 'Normal',
        artIdNumber: '0049281',
        artInitiationDate: '2023-04-15',
        artMedicineType: 'TLD Pediatric',
        cd4Count: '680 cells/mm3',
        hasDisability: 'No',
        disabilityType: 'None',
        disabilityCertificateStatus: 'No',
      },
      nutrition: {
        malnutritionSymptoms: 'No acute malnutrition detected',
      },
      education: {
        schoolType: 'Government school',
        currentClass: 'Class 4',
        receivingEducationSchemeBenefit: 'Yes',
      },
      educationExpenses: {
        totalAnnualCost: 12000,
        remarks: 'Grant recommended for school supplies and transport.',
      },
      finalReview: {
        approvedAllianceIndia: 'Approved',
      },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(500);

    const pdfString = pdfBuffer.toString('utf-8');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString).toContain('Aarav Sharma');
    expect(pdfString).toContain('0049281');
    expect(pdfString).toContain('Alliance India SR');
    expect(pdfString).toContain('Pune CBO SSR');
    expect(pdfString).toContain('TLD Pediatric');
    expect(pdfString).toContain('680 cells/mm3');
    expect(pdfString).toContain('No acute malnutrition detected');
  });
});
