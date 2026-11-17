import { describe, it, expect, vi } from 'vitest';
import { canonicalizeStateName, getStateQueryVariants } from '@/lib/constants/stateNormalization';
import { deriveSubmissionStages } from '@/lib/shared/submissionStages';
import { parseBeneficiaryRecord } from '@/lib/read-model/supervisorReadModel';

describe('State Name Canonicalization & Query Variants', () => {
  it('canonicalizes UPPERCASE and abbreviations to canonical Title Case', () => {
    expect(canonicalizeStateName('MAHARASHTRA')).toBe('Maharashtra');
    expect(canonicalizeStateName('maharashtra')).toBe('Maharashtra');
    expect(canonicalizeStateName('Maharashtra')).toBe('Maharashtra');
    expect(canonicalizeStateName('STATE-MH')).toBe('Maharashtra');
    expect(canonicalizeStateName('MH')).toBe('Maharashtra');
    expect(canonicalizeStateName('DELHI')).toBe('Delhi');
    expect(canonicalizeStateName('STATE-DL')).toBe('Delhi');
    expect(canonicalizeStateName('WEST BENGAL')).toBe('West Bengal');
  });

  it('generates Firestore query variants covering multiple case formats', () => {
    const variants = getStateQueryVariants('MAHARASHTRA');
    expect(variants).toContain('Maharashtra');
    expect(variants).toContain('MAHARASHTRA');
    expect(variants).toContain('maharashtra');
  });
});

describe('Post-Approval & Bank Workflow Stage Derivation', () => {
  it('identifies record as Approved — Bank Documents Pending when approved without bank proof', () => {
    const mockRecord = {
      id: 'sub-123',
      childName: 'Aarav Pawar',
      artNumber: 'SYN-12345',
      state: 'Maharashtra',
      district: 'Pune',
      approval: 'APPROVED',
      approvedAllianceIndia: true,
      hasPassbook: false,
      passbookPhotoUrl: '',
      bankAccountNumber: '',
      hasAadhaar: true,
      hasChildPhoto: true,
    };

    const stages = deriveSubmissionStages(mockRecord);
    expect(stages.approvalState).toBe('approved');
    expect(stages.bankWorkflow).toBe('pending');
    expect(stages.missingBankFields).toContain('passbookProof');
  });

  it('identifies record as Approved — Bank Details Complete when passbook proof and account are present', () => {
    const mockRecord = {
      id: 'sub-456',
      childName: 'Priya Shinde',
      artNumber: 'SYN-67890',
      state: 'Maharashtra',
      district: 'Thane',
      approval: 'APPROVED',
      approvedAllianceIndia: true,
      hasPassbook: true,
      passbookPhotoUrl: 'https://storage.googleapis.com/test-bucket/passbook.jpg',
      bankAccountNumber: '123456789012',
      accountHolderName: 'Priya Shinde',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
      branchName: 'Thane Central',
    };

    const stages = deriveSubmissionStages(mockRecord);
    expect(stages.approvalState).toBe('approved');
    expect(stages.bankWorkflow).toBe('complete');
  });

  it('populates submittedBy and stages accurately in supervisorReadModel', () => {
    const rawSubmission = {
      id: 'sub-789',
      _uuid: 'sub-789',
      '1\nUnique Identifier': 'MH-PUN-01',
      '32\nART Number': 'SYN-99999',
      '9\nChild Name': 'Rohit Patil',
      childName: 'Rohit Patil',
      '18\nState': 'Maharashtra',
      '19\nDistrict': 'Pune',
      '70\nForm Submitted By': 'Farid Sayyed',
      '5\nInterviewer Name': 'Farid Sayyed',
      '75\nSR Name': 'CSC Sagar',
      '76\nSSR Name': 'Pune Care Center',
      '71\nAlliance India Approval': 'Approved',
      '25\nPassbook Front Page Link': '',
      '26\nAadhaar Card Link': 'https://drive.google.com/test-aadhaar',
      '27\nPassport Size Photo Link': 'https://drive.google.com/test-photo',
    };

    const parsed = parseBeneficiaryRecord(rawSubmission);
    expect(parsed.childName).toBe('Rohit Patil');
    expect(parsed.submittedBy).toBe('Farid Sayyed');
    expect(parsed.interviewerName).toBe('Farid Sayyed');
    expect(parsed.srName).toBe('CSC Sagar');
    expect(parsed.ssrName).toBe('Pune Care Center');
    expect(parsed.isApproved).toBe(true);
    expect(parsed.stages?.approvalState).toBe('approved');
    expect(parsed.stages?.bankWorkflow).toBe('pending');
  });

  it('correctly maps all 5 workflow stages for state-wide submitted surveys', () => {
    // 1. Under review / pending approval
    const pendingRecord = {
      id: 'sub-p1',
      childName: 'Child One',
      artNumber: 'ART-001',
      status: 'SUBMITTED',
      isApproved: false,
    };
    const s1 = deriveSubmissionStages(pendingRecord);
    expect(s1.lifecycle).toBe('submitted');
    expect(s1.approvalState).toBe('pending');
    expect(s1.bankWorkflow).toBe('not_yet_due');

    // 2. Approved — Bank Documents Pending
    const approvedBankPending = {
      id: 'sub-p2',
      childName: 'Child Two',
      artNumber: 'ART-002',
      status: 'SUBMITTED',
      approval: 'APPROVED',
      isApproved: true,
      hasPassbook: false,
    };
    const s2 = deriveSubmissionStages(approvedBankPending);
    expect(s2.approvalState).toBe('approved');
    expect(s2.bankWorkflow).toBe('pending');

    // 3. Approved — Bank Details Complete
    const approvedBankComplete = {
      id: 'sub-p3',
      childName: 'Child Three',
      artNumber: 'ART-003',
      status: 'SUBMITTED',
      approval: 'APPROVED',
      isApproved: true,
      hasPassbook: true,
      passbookProof: 'https://storage.googleapis.com/passbook.jpg',
      accountNumber: '987654321',
      accountHolderName: 'Parent Three',
      bankName: 'HDFC',
      branchName: 'Mumbai',
      ifscCode: 'HDFC0001234',
    };
    const s3 = deriveSubmissionStages(approvedBankComplete);
    expect(s3.approvalState).toBe('approved');
    expect(s3.bankWorkflow).toBe('complete');
  });
});

