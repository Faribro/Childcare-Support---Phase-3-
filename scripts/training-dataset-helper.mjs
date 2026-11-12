#!/usr/bin/env node
/**
 * Training Dataset Helper (`TRAINING` labelled test records only)
 *
 * Generates safe, clearly labelled sample records with TRN- / TRAINING- prefixes
 * for staging/preview staff training sessions and prints post-session SQL cleanup queries.
 * NEVER touches production operational beneficiary records.
 */

import crypto from 'node:crypto';

const SAMPLE_TINY_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const TRAINING_SAMPLES = [
  {
    uuid: '11111111-1111-4111-8111-111111110001',
    artNumber: 'TRN-MH-001',
    childName: 'TRAINING Child Aarav',
    dob: '2016-04-12',
    gender: 'Male',
    orphanStatus: 'Single orphan (one parent deceased)',
    caregiverName: 'TRAINING Caregiver Meera',
    caregiverRelationship: 'Mother',
    contactNumber: '9876543211',
    district: 'Pune',
    state: 'Maharashtra',
    pinCode: '411001',
    villageCity: 'Pune',
    talukMandalBlock: 'Pune City',
    street: 'Training Lane 1',
    doorAndColony: 'Plot 10, Sample Nagar',
    residenceType: 'Rented',
    feeReceiptPhotoUrl: SAMPLE_TINY_PNG_BASE64,
    remarks: 'TRAINING sample receipt',
  },
  {
    uuid: '11111111-1111-4111-8111-111111110002',
    artNumber: 'TRN-MH-002',
    childName: 'TRAINING Child Diya',
    dob: '2015-08-21',
    gender: 'Female',
    orphanStatus: 'Not an orphan (both parents alive)',
    caregiverName: 'TRAINING Caregiver Sunita',
    caregiverRelationship: 'Mother',
    contactNumber: '9876543212',
    district: 'Mumbai',
    state: 'Maharashtra',
    pinCode: '400001',
    villageCity: 'Mumbai',
    talukMandalBlock: 'Mumbai',
    street: 'Training Road 2',
    doorAndColony: 'Flat 4B, Demo Colony',
    residenceType: 'Owned',
    feeReceiptPhotoUrl: '',
    remarks: 'TRAINING fee receipt pending from school office',
  },
  {
    uuid: '11111111-1111-4111-8111-111111110003',
    artNumber: 'TRN-DL-003',
    childName: 'TRAINING Child Kabir',
    dob: '2017-01-15',
    gender: 'Male',
    orphanStatus: 'Double orphan (both parents deceased)',
    caregiverName: 'TRAINING Caregiver Ramesh',
    caregiverRelationship: 'Grandparent',
    contactNumber: '',
    noPhoneAvailable: true,
    alternateContactNumber: '9876543299',
    district: 'New Delhi',
    state: 'Delhi',
    pinCode: '110001',
    villageCity: 'New Delhi',
    talukMandalBlock: 'Connaught Place',
    street: 'Practice Avenue 3',
    doorAndColony: 'House 7, Training Block',
    residenceType: 'Temporary',
    marksheetPhotoUrl: SAMPLE_TINY_PNG_BASE64,
    remarks: 'TRAINING sample marksheet',
  },
  {
    uuid: '11111111-1111-4111-8111-111111110004',
    artNumber: 'TRN-WB-004',
    childName: 'TRAINING Child Ananya',
    dob: '2014-11-05',
    gender: 'Female',
    orphanStatus: 'Single orphan (one parent deceased)',
    caregiverName: 'TRAINING Caregiver Anita',
    caregiverRelationship: 'Aunt/Uncle',
    contactNumber: '9876543214',
    district: 'Kolkata',
    state: 'West Bengal',
    pinCode: '700001',
    villageCity: 'Kolkata',
    talukMandalBlock: 'Kolkata GPO',
    street: 'Demo Street 4',
    doorAndColony: 'Room 2, Sample Quarter',
    residenceType: 'Rented',
    feeReceiptPhotoUrl: SAMPLE_TINY_PNG_BASE64,
    remarks: 'TRAINING offline queue sample',
  },
];

export function buildTrainingSubmissionPayload(sample, overrideUuid) {
  const id = overrideUuid || sample.uuid || crypto.randomUUID();
  return {
    uuid: id,
    clientSubmissionId: id,
    interviewerName: 'TRAINING Facilitator',
    demographics: {
      artNumber: sample.artNumber,
      childName: sample.childName,
      dob: sample.dob,
      gender: sample.gender,
      orphanStatus: sample.orphanStatus,
      caregiverName: sample.caregiverName,
      caregiverRelationship: sample.caregiverRelationship,
      contactNumber: sample.contactNumber,
      noPhoneAvailable: Boolean(sample.noPhoneAvailable),
      alternateContactNumber: sample.alternateContactNumber || '',
      residenceType: sample.residenceType,
      doorAndColony: sample.doorAndColony,
      street: sample.street,
      villageCity: sample.villageCity,
      talukMandalBlock: sample.talukMandalBlock,
      district: sample.district,
      state: sample.state,
      pinCode: sample.pinCode,
    },
    educationExpenses: {
      feeReceiptPhotoUrl: sample.feeReceiptPhotoUrl || undefined,
      marksheetPhotoUrl: sample.marksheetPhotoUrl || undefined,
      remarks: sample.remarks,
    },
    caregiverConsent: {
      consentProvided: true,
      dateOfConsent: new Date().toISOString().slice(0, 10),
    },
    finalReview: {
      allInfoCorrect: true,
      formSubmittedBy: 'TRAINING Facilitator',
      organizationName: 'TRAINING Sample SSR',
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('training-dataset-helper.mjs')) {
  const mode = process.argv[2] || 'summary';
  if (mode === 'json') {
    console.log(JSON.stringify(TRAINING_SAMPLES.map((s) => buildTrainingSubmissionPayload(s)), null, 2));
  } else {
    console.log(`Prepared ${TRAINING_SAMPLES.length} TRAINING sample payloads (all TRN-/TRAINING- prefixed).`);
    console.log('Run with "json" to inspect full API payloads. See docs/TRAINING_ACCOUNTS_AND_SAMPLES.md for cleanup SQL.');
  }
}
