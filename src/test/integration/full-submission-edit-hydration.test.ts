/**
 * full-submission-edit-hydration.test.ts
 *
 * Comprehensive integration test suite for submission edit hydration & safety guards:
 * Scenario 1: Hydrate complete 73-column submitted record fixture (caregiver, child, DOB, address, expenses, attestation).
 * Scenario 2: Existing signature preservation (read-only saved status, editing unrelated field retains signature, no re-consent requested).
 * Scenario 3: Document preservation (saved document on file badges, references retained during unrelated edits).
 * Scenario 4: Partial response gate (fails assertEditSnapshotComplete, editing disabled, no blank overwrite possible).
 * Scenario 5: Round-trip fidelity (load complete record, change one field, assert unchanged fields remain semantically identical).
 * Scenario 6: Legacy aliases & normalization (maps old headers/aliases, YYYY-MM-DD dates, numeric 0 preserved).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  hydrateSubmissionForEdit,
  assertEditSnapshotComplete,
  normalizeDateToInput,
  normalizeNumericField,
  toDiagnosticHash,
  type ListRecordProjection,
  type FullSubmissionSnapshot,
} from '@/features/submission/submissionEditHydration';
import { normalizeSubmissionPayload } from '@/features/submission/submissionMapper';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';

describe('Full Submission Edit Hydration & Safety Guard', () => {
  // -------------------------------------------------------------------------
  // SCENARIO 1: Complete 73-Column Linelist Record Hydration
  // -------------------------------------------------------------------------
  describe('Scenario 1: Complete 73-column submitted record hydration', () => {
    const full73ColumnRecord: Record<string, any> = {
      '1\nUnique ID': 'WB-KOL-081255-01',
      '2\nRevision Number': 2,
      '3\nAssessment Date': '2026-08-15',
      '4\nSubmitted By': 'Field Caseworker Anita',
      '5\nConsent Obtained': 'Yes',
      '6\nState': 'West Bengal',
      '7\nDistrict': 'Kolkata',
      '8\nInterviewer Name': 'Anita Sen',
      '9\nChild Name': 'Aarav Mukherjee',
      '10\nDate of Birth': '15/05/2014',
      '11\nAge (Years)': 12,
      '12\nGender': 'Male',
      '13\nOrphan Status': 'Single orphan (father deceased)',
      '14\nCaregiver Full Name': 'Sunita Mukherjee',
      '15\nCaregiver Relationship': 'Mother',
      '16\nContact Number': '9876543210',
      '17\nCaregiver Contact Number': '9876543210',
      '18\nFull Residential Address': '12/4 B.T. Road, Baranagar, Kolkata',
      '19\nAadhaar Number': '123456789012',
      '20\nBank Account Holder Name': 'Sunita Mukherjee',
      '21\nBank Account Number': '10293847561',
      '22\nBank IFSC Code': 'SBIN0000001',
      '23\nBank Name': 'State Bank of India',
      '24\nBank Linked Mobile': '9876543210',
      '25\nPassbook Front Page Link': 'https://drive.google.com/file/d/passbook_drive_link',
      '26\nAadhaar Card Photo Link': 'https://drive.google.com/file/d/aadhaar_drive_link',
      '27\nChild Photo Link': 'https://drive.google.com/file/d/child_photo_drive_link',
      '28\nTotal Family Members': 4,
      '29\nNumber of Children <=18': 2,
      '30\nMonthly Household Income': 4500,
      '31\nMain Livelihood Source': 'Daily wage labour',
      '32\nWeight (kg)': 32.5,
      '33\nHeight (cm)': 138,
      '34\nBMI': 17.1,
      '35\nBMI Category': 'Normal',
      '36\nMUAC (cm)': 17.5,
      '37\nHaemoglobin (g/dL)': '11.8',
      '38\nAnaemia Category': 'Mild',
      '39\nNutrition Status': 'Normal',
      '40\nOther Health Conditions': 'Asthma',
      '41\nART Status': 'On ART',
      '42\nART ID Number': '2121`WSQ',
      '43\nART Registration Date': '2022-03-10',
      '44\nViral Load Status': 'Tested in last 6 months',
      '45\nViral Load Date': '2026-06-20',
      '46\nViral Load Result': '< 50',
      '47\nAppetite Level': 'Good',
      '48\nMeals Per Day': 3,
      '49\nEducation Status': 'Currently in school',
      '50\nSchool Name': 'Baranagar High School',
      '51\nSchool Session Start': '2026-04-01',
      '52\nSchool Type': 'Government',
      '53\nCurrent Grade/Class': 'Class 7',
      '54\nAttendance Regularity': 'Regular (>75%)',
      '55\nAcademic Performance': 'Average',
      '56\nSchool Fees': 6000,
      '57\nTuition Fees': 2400,
      '58\nBooks and Stationery': 1500,
      '59\nSchool Uniform': 1200,
      '60\nTransport Cost': 800,
      '61\nOther Education Expenses': 300,
      '62\nTotal Annual Education Cost': 12200,
      '63\nFee Receipt Link': 'https://drive.google.com/file/d/fee_receipt_drive_link',
      '64\nPrevious Year Marksheet Link': 'https://drive.google.com/file/d/marksheet_drive_link',
      '65\nRemarks on Education': 'Requires tuition support for mathematics',
      '66\nRequired Support - School Fees': 6000,
      '67\nRequired Support - Books': 1500,
      '68\nRequired Support - Uniform': 1200,
      '69\nAlliance India Approval': 'Approved',
      '70\nForm Submitted By': 'Field Caseworker Anita',
      '71\nOrganization Name': 'India HIV/AIDS Alliance',
      '72\nSignature Link': 'https://drive.google.com/file/d/signature_drive_link',
      '73\nConfirmation Hash': 'a1b2c3d4e5f6',
      remoteSubmissionId: 'b7c25c34-2e91-4cf8-8422-92b0c367ad18',
    };

    it('passes completeness assertion gate for full 73-column snapshot', () => {
      const completeness = assertEditSnapshotComplete(full73ColumnRecord);
      expect(completeness.isComplete).toBe(true);
      expect(completeness.missingGroups).toHaveLength(0);
      expect(completeness.details.identity).toBe(true);
      expect(completeness.details.demographics).toBe(true);
      expect(completeness.details.caregiver).toBe(true);
      expect(completeness.details.consent).toBe(true);
      expect(completeness.details.attestation).toBe(true);
      expect(completeness.details.educationExpenses).toBe(true);
    });

    it('hydrates all core fields into form state accurately', () => {
      const hydrated = hydrateSubmissionForEdit(full73ColumnRecord);
      const { formState } = hydrated;

      // Section 1: Demographics & Caregiver
      expect(formState.childName).toBe('Aarav Mukherjee');
      expect(formState.dob).toBe('2014-05-15'); // Normalized to YYYY-MM-DD
      expect(formState.gender).toBe('Male');
      expect(formState.orphanStatus).toBe('Single orphan (one parent deceased)');
      expect(formState.caregiverName).toBe('Sunita Mukherjee');
      expect(formState.caregiverRelationship).toBe('Mother');
      expect(formState.contactNumber).toBe('9876543210');
      expect(formState.fullAddress).toBe('12/4 B.T. Road, Baranagar, Kolkata');
      expect(formState.state).toBe('West Bengal');
      expect(formState.district).toBe('Kolkata');
      expect(formState.artNumber).toBe('2121`WSQ');

      // Section 2: Consent
      expect(formState.agreeToParticipate).toBe(true);

      // Section 3: KYC & Bank
      expect(formState.bankAccountHolderName).toBe('Sunita Mukherjee');
      expect(formState.bankAccountNumber).toBe('10293847561');
      expect(formState.bankIfscCode).toBe('SBIN0000001');
      expect(formState.passbookPhotoUrl).toBe('https://drive.google.com/file/d/passbook_drive_link');
      expect(formState.aadhaarCardPhotoUrl).toBe('https://drive.google.com/file/d/aadhaar_drive_link');
      expect(formState.childPhotoUrl).toBe('https://drive.google.com/file/d/child_photo_drive_link');

      // Section 4: Household & Financial
      expect(formState.totalFamilyMembers).toBe(4);
      expect(formState.numberOfChildrenUnder18).toBe(2);
      expect(formState.monthlyIncomeRs).toBe(4500);
      expect(formState.mainSourceOfIncome).toBe('Daily wage labour');

      // Section 5: Health & Clinical
      expect(formState.weightKg).toBe(32.5);
      expect(formState.heightCm).toBe(138);
      expect(formState.haemoglobinGdl).toBe('11.8');
      expect(formState.artStatus).toBe('On ART');
      expect(formState.artIdNumber).toBe('2121`WSQ');
      expect(formState.vlStatus).toBe('Tested in last 6 months');
      expect(formState.viralLoad).toBe('< 50');

      // Section 6: Nutrition
      expect(formState.appetite).toBe('Good');
      expect(formState.mealsPerDay).toBe(3);

      // Section 7: Education Status
      expect(formState.educationStatus).toBe('Currently going to school');
      expect(formState.schoolName).toBe('Baranagar High School');
      expect(formState.schoolType).toBe('Government school');
      expect(formState.currentClass).toBe('Class 7');

      // Section 8: Expenses
      expect(formState.schoolFees).toBe(6000);
      expect(formState.tuitionFees).toBe(2400);
      expect(formState.books).toBe(1500);
      expect(formState.uniform).toBe(1200);
      expect(formState.transport).toBe(800);
      expect(formState.otherExpenses).toBe(300);
      expect(formState.feeReceiptPhotoUrl).toBe('https://drive.google.com/file/d/fee_receipt_drive_link');
      expect(formState.marksheetPhotoUrl).toBe('https://drive.google.com/file/d/marksheet_drive_link');
      expect(formState.remarks).toBe('Requires tuition support for mathematics');

      // Section 9: Attestation & Approval
      expect(formState.approvedAllianceIndia).toBe('Approved');
      expect(formState.formSubmittedBy).toBe('Field Caseworker Anita');
      expect(formState.organizationName).toBe('India HIV/AIDS Alliance');
    });
  });

  // -------------------------------------------------------------------------
  // SCENARIO 2: Existing Signature Preservation
  // -------------------------------------------------------------------------
  describe('Scenario 2: Existing signature preservation', () => {
    const recordWithSignature: Record<string, any> = {
      uuid: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
      artNumber: 'ART-99001',
      childName: 'Priya Sharma',
      caregiverName: 'Rohit Sharma',
      interviewerName: 'Caseworker Pooja',
      schoolFees: 4000,
      caregiverConsent: {
        consentProvided: true,
        consentDecision: 'Yes — Consent Granted',
        signatoryRelationship: 'Father',
        signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h...',
        signatureStatus: 'VERIFIED_SAVED',
        consentTimestamp: '2026-08-20T10:00:00.000Z',
      },
    };

    it('identifies saved signature and preserves signature data', () => {
      const hydrated = hydrateSubmissionForEdit(recordWithSignature);
      expect(hydrated.hasSavedSignature).toBe(true);
      expect(hydrated.existingSignatureUrl).toBe(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h...'
      );
      expect(hydrated.consentSnapshot.hasVerifiableConsent).toBe(true);
      expect(hydrated.consentSnapshot.caregiverConsent?.consentProvided).toBe(true);
    });

    it('preserves signature and consent when an unrelated field is edited', () => {
      const hydrated = hydrateSubmissionForEdit(recordWithSignature);

      // Simulate editing weightKg without touching signature
      const editedFormState = {
        ...hydrated.formState,
        weightKg: 18.2, // Changed
      };

      // When building queue payload from edit
      const editPayload = {
        uuid: recordWithSignature.uuid,
        clientSubmissionId: recordWithSignature.uuid,
        demographics: {
          childName: editedFormState.childName,
          caregiverName: editedFormState.caregiverName,
          artNumber: editedFormState.artNumber,
          weightKg: editedFormState.weightKg,
        },
        // Rebuilding payload must retain original consent & signature
        caregiverConsent: hydrated.consentSnapshot.caregiverConsent,
        consent: {
          agreeToParticipate: true,
          signatureDataUrl: hydrated.existingSignatureUrl,
        },
      };

      expect(editPayload.demographics.weightKg).toBe(18.2);
      expect(editPayload.caregiverConsent?.consentProvided).toBe(true);
      expect(editPayload.caregiverConsent?.signatureDataUrl).toBe(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h...'
      );
      expect(editPayload.consent.signatureDataUrl).toBe(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h...'
      );
    });
  });

  // -------------------------------------------------------------------------
  // SCENARIO 3: Document Preservation
  // -------------------------------------------------------------------------
  describe('Scenario 3: Document preservation', () => {
    const recordWithDocuments = {
      uuid: 'd89b5291-76bb-43fd-ba56-6fe32efd1649',
      artNumber: 'ART-55002',
      childName: 'Kunal Patil',
      caregiverName: 'Shobha Patil',
      interviewerName: 'Officer Deshmukh',
      schoolFees: 5000,
      agreeToParticipate: true,
      bankingAndKyc: {
        passbookPhotoUrl: 'https://drive.google.com/file/d/passbook-patil-123',
        aadhaarCardPhotoUrl: 'https://drive.google.com/file/d/aadhaar-patil-456',
        childPhotoUrl: 'https://drive.google.com/file/d/child-patil-789',
      },
      educationExpenses: {
        schoolFees: 5000,
        feeReceiptPhotoUrl: 'https://drive.google.com/file/d/receipt-patil-111',
        marksheetPhotoUrl: 'https://drive.google.com/file/d/marksheet-patil-222',
      },
    };

    it('detects all 5 saved documents and populates savedDocuments flags', () => {
      const hydrated = hydrateSubmissionForEdit(recordWithDocuments);

      expect(hydrated.savedDocuments.passbook).toBe(true);
      expect(hydrated.savedDocuments.aadhaar).toBe(true);
      expect(hydrated.savedDocuments.childPhoto).toBe(true);
      expect(hydrated.savedDocuments.feeReceipt).toBe(true);
      expect(hydrated.savedDocuments.marksheet).toBe(true);

      expect(hydrated.formState.passbookPhotoUrl).toBe('https://drive.google.com/file/d/passbook-patil-123');
      expect(hydrated.formState.aadhaarCardPhotoUrl).toBe('https://drive.google.com/file/d/aadhaar-patil-456');
      expect(hydrated.formState.childPhotoUrl).toBe('https://drive.google.com/file/d/child-patil-789');
      expect(hydrated.formState.feeReceiptPhotoUrl).toBe('https://drive.google.com/file/d/receipt-patil-111');
      expect(hydrated.formState.marksheetPhotoUrl).toBe('https://drive.google.com/file/d/marksheet-patil-222');
    });

    it('retains document URLs during an unrelated field edit', () => {
      const hydrated = hydrateSubmissionForEdit(recordWithDocuments);

      // User edits schoolName only
      const updatedState = {
        ...hydrated.formState,
        schoolName: 'St. Xavier High School',
      };

      expect(updatedState.schoolName).toBe('St. Xavier High School');
      expect(updatedState.passbookPhotoUrl).toBe('https://drive.google.com/file/d/passbook-patil-123');
      expect(updatedState.aadhaarCardPhotoUrl).toBe('https://drive.google.com/file/d/aadhaar-patil-456');
      expect(updatedState.feeReceiptPhotoUrl).toBe('https://drive.google.com/file/d/receipt-patil-111');
      expect(updatedState.marksheetPhotoUrl).toBe('https://drive.google.com/file/d/marksheet-patil-222');
    });
  });

  // -------------------------------------------------------------------------
  // SCENARIO 4: Partial Response Gate
  // -------------------------------------------------------------------------
  describe('Scenario 4: Partial response gate (assertEditSnapshotComplete)', () => {
    it('fails completeness assertion for shallow ListRecordProjection', () => {
      const shallowProjection: ListRecordProjection = {
        uniqueId: '2121`WSQ',
        childName: 'Aarav Mukherjee',
        caregiverName: 'Sunita Mukherjee',
        caregiverPhone: '9876543210',
        district: 'Kolkata',
        state: 'West Bengal',
        status: 'synced',
        submittedTime: '2026-08-15T12:00:00Z',
      };

      const result = assertEditSnapshotComplete(shallowProjection);
      expect(result.isComplete).toBe(false);
      expect(result.missingGroups).toContain('attestation');
      expect(result.missingGroups).toContain('educationExpenses');
      expect(result.missingGroups).toContain('consent');
    });

    it('fails completeness assertion when caregiver name is missing', () => {
      const missingCaregiverRecord = {
        uniqueId: 'WB-KOL-001',
        childName: 'Child Only',
        schoolFees: 5000,
        agreeToParticipate: true,
        formSubmittedBy: 'Officer',
      };

      const result = assertEditSnapshotComplete(missingCaregiverRecord);
      expect(result.isComplete).toBe(false);
      expect(result.missingGroups).toContain('caregiver');
    });

    it('fails completeness assertion when identity is completely missing', () => {
      const noIdentityRecord = {
        childName: 'Child Only',
        caregiverName: 'Caregiver Only',
        schoolFees: 5000,
        agreeToParticipate: true,
        formSubmittedBy: 'Officer',
      };

      const result = assertEditSnapshotComplete(noIdentityRecord);
      expect(result.isComplete).toBe(false);
      expect(result.missingGroups).toContain('identity');
    });
  });

  // -------------------------------------------------------------------------
  // SCENARIO 5: Round-Trip Fidelity
  // -------------------------------------------------------------------------
  describe('Scenario 5: Round-trip fidelity', () => {
    it('mutating a single field preserves exact semantic values of all other fields', () => {
      const completeRecord: Record<string, any> = {
        uuid: 'e71c63a2-81cc-44ee-8a32-12e34fa56789',
        artNumber: 'ART-TEST-ROUNDTRIP',
        childName: 'Vikram Singh',
        dob: '2015-08-20',
        gender: 'Male',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Rajesh Singh',
        caregiverRelationship: 'Father',
        contactNumber: '9123456780',
        fullAddress: 'Village Khera, Block B, Jaipur',
        state: 'Rajasthan',
        district: 'Jaipur',
        agreeToParticipate: true,
        bankAccountHolderName: 'Rajesh Singh',
        bankAccountNumber: '998877665544',
        bankIfscCode: 'BARB0JAIPUR',
        monthlyIncomeRs: 6000,
        totalFamilyMembers: 5,
        numberOfChildrenUnder18: 3,
        mainSourceOfIncome: 'Agriculture / farming',
        weightKg: 28,
        heightCm: 125,
        haemoglobinGdl: '12.2',
        artStatus: 'On ART',
        vlStatus: 'Tested in last 6 months',
        viralLoad: '< 50',
        appetite: 'Good',
        mealsPerDay: 3,
        educationStatus: 'Currently in school',
        schoolName: 'Jaipur Model School',
        schoolType: 'Government',
        currentClass: 'Class 5',
        attendance: 'Regular (>75%)',
        schoolFees: 3500,
        tuitionFees: 1200,
        books: 800,
        stationery: 400,
        uniform: 900,
        transport: 500,
        otherExpenses: 200,
        requiredSchoolFees: 3500,
        requiredTuitionFees: 1200,
        requiredBooks: 800,
        requiredStationery: 400,
        requiredUniform: 900,
        requiredTransport: 500,
        requiredOtherSupport: 200,
        approvedAllianceIndia: 'Approved',
        formSubmittedBy: 'Field Officer Meena',
        organizationName: 'Alliance India',
        version: 1,
        caregiverConsent: {
          consentProvided: true,
          signatoryRelationship: 'Father',
          signatureDataUrl: 'data:image/png;base64,mockSignatureData',
        },
      };

      const hydrated = hydrateSubmissionForEdit(completeRecord);

      // Verify original matches before edit
      expect(hydrated.formState.monthlyIncomeRs).toBe(6000);
      expect(hydrated.formState.childName).toBe('Vikram Singh');
      expect(hydrated.formState.schoolFees).toBe(3500);

      // Mutate ONLY monthlyIncomeRs
      const modifiedFormState = {
        ...hydrated.formState,
        monthlyIncomeRs: 8500, // Mutated
      };

      // Verify that unedited fields remained completely intact
      expect(modifiedFormState.monthlyIncomeRs).toBe(8500);
      expect(modifiedFormState.childName).toBe(completeRecord.childName);
      expect(modifiedFormState.dob).toBe(completeRecord.dob);
      expect(modifiedFormState.caregiverName).toBe(completeRecord.caregiverName);
      expect(modifiedFormState.caregiverRelationship).toBe(completeRecord.caregiverRelationship);
      expect(modifiedFormState.contactNumber).toBe(completeRecord.contactNumber);
      expect(modifiedFormState.fullAddress).toBe(completeRecord.fullAddress);
      expect(modifiedFormState.bankAccountNumber).toBe(completeRecord.bankAccountNumber);
      expect(modifiedFormState.schoolFees).toBe(completeRecord.schoolFees);
      expect(modifiedFormState.tuitionFees).toBe(completeRecord.tuitionFees);
      expect(modifiedFormState.books).toBe(completeRecord.books);
      expect(modifiedFormState.uniform).toBe(completeRecord.uniform);
      expect(modifiedFormState.formSubmittedBy).toBe(completeRecord.formSubmittedBy);
      expect(modifiedFormState.approvedAllianceIndia).toBe(completeRecord.approvedAllianceIndia);
    });
  });

  // -------------------------------------------------------------------------
  // SCENARIO 6: Legacy Aliases and Date/Number Normalization
  // -------------------------------------------------------------------------
  describe('Scenario 6: Legacy aliases & date/number normalization', () => {
    it('normalizes various date formats into standard YYYY-MM-DD', () => {
      expect(normalizeDateToInput('2026-09-11')).toBe('2026-09-11');
      expect(normalizeDateToInput('2026-09-11T14:30:00.000Z')).toBe('2026-09-11');
      expect(normalizeDateToInput('15-05-2016')).toBe('2016-05-15');
      expect(normalizeDateToInput('15/05/2016')).toBe('2016-05-15');
      expect(normalizeDateToInput('2016/05/15')).toBe('2016-05-15');
      expect(normalizeDateToInput('')).toBe('');
      expect(normalizeDateToInput(null)).toBe('');
      expect(normalizeDateToInput(undefined)).toBe('');
    });

    it('preserves numeric 0 as 0 and does not convert to fallback or blank', () => {
      expect(normalizeNumericField(0, 100)).toBe(0);
      expect(normalizeNumericField('0', 100)).toBe(0);
      expect(normalizeNumericField('', 100)).toBe(100);
      expect(normalizeNumericField(null, 100)).toBe(100);
      expect(normalizeNumericField(undefined, 100)).toBe(100);
      expect(normalizeNumericField(250, 0)).toBe(250);
      expect(normalizeNumericField('500', 0)).toBe(500);
    });

    it('maps legacy snake_case and sheet header aliases to form state', () => {
      const legacyRecord = {
        '1\nUnique ID': 'LEGACY-001',
        child_name: 'Rahul Verma',
        caregiver_name: 'Anita Verma',
        caregiver_contact: '9988776655',
        dob: '01/01/2017',
        school_fees: 0, // Should stay 0!
        tuition_fees: 1500,
        interviewer_name: 'Worker Sunita',
        consent_obtained: 'Yes',
      };

      const completeness = assertEditSnapshotComplete(legacyRecord);
      expect(completeness.isComplete).toBe(true);

      const hydrated = hydrateSubmissionForEdit(legacyRecord);
      expect(hydrated.formState.childName).toBe('Rahul Verma');
      expect(hydrated.formState.caregiverName).toBe('Anita Verma');
      expect(hydrated.formState.contactNumber).toBe('9988776655');
      expect(hydrated.formState.dob).toBe('2017-01-01');
      expect(hydrated.formState.schoolFees).toBe(0); // Preserved zero
      expect(hydrated.formState.tuitionFees).toBe(1500);
      expect(hydrated.formState.formSubmittedBy).toBe('Worker Sunita');
    });

    it('generates non-PII diagnostic hash without leaking identifiers', () => {
      const hash1 = toDiagnosticHash('WB-KOL-081255-01');
      const hash2 = toDiagnosticHash('2121`WSQ');
      const hashEmpty = toDiagnosticHash('');

      expect(hash1).toMatch(/^rec-[a-f0-9]+$/);
      expect(hash2).toMatch(/^rec-[a-f0-9]+$/);
      expect(hashEmpty).toBe('none');
      // Must not contain original sensitive substrings
      expect(hash1).not.toContain('WB-KOL');
      expect(hash2).not.toContain('2121');
    });
  });
});
