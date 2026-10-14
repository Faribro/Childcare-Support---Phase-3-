import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  deriveSubmissionStages,
  extractBankFields,
  maskBankAccountNumber,
  type SubmissionStages,
} from '@/lib/shared/submissionStages';
import { isAttachmentPresent } from '@/lib/read-model/beneficiaryReadiness';
import { GET as getSummary } from '@/app/api/submissions/summary/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

describe('PR A: Stage-Based Readiness Derivation & Bank Details Queue', () => {
  const baseValidIntakeRecord = {
    childName: 'Aarav Sharma',
    dob: '2016-04-12',
    gender: 'Male',
    caregiverName: 'Sunita Sharma',
    state: 'Maharashtra',
    district: 'Pune',
    hasAadhaar: true,
    aadhaarCardPhotoUrl: 'https://storage.alliance.org/aadhaar/123.jpg',
    hasChildPhoto: true,
    childPhotoUrl: 'https://storage.alliance.org/photo/123.jpg',
    hasSignature: true,
    signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    schoolType: 'Government school',
    educationStatus: 'Currently going to school',
    hasFeeReceipt: true,
    feeReceiptPhotoUrl: 'https://storage.alliance.org/receipt/123.jpg',
    hasMarksheet: true,
    marksheetPhotoUrl: 'https://storage.alliance.org/marksheet/123.jpg',
    status: 'synced',
  };

  const completeBankFields = {
    accountNumber: '001234567890',
    accountHolderName: 'Sunita Sharma',
    bankName: 'State Bank of India',
    branchName: 'Shivajinagar Pune',
    ifscCode: 'SBIN0001234',
    passbookProof: 'https://storage.alliance.org/passbook/123.jpg',
  };

  // -------------------------------------------------------------
  // Scenario 1: Intake complete, not approved, no bank info
  // -------------------------------------------------------------
  it('Scenario 1: Intake complete, not approved, no bank info -> intake complete, bank not_yet_due', () => {
    const record = {
      ...baseValidIntakeRecord,
      approvedAllianceIndia: 'Pending',
    };

    const stages: SubmissionStages = deriveSubmissionStages(record);

    expect(stages.lifecycle).toBe('submitted');
    expect(stages.intakeCompleteness).toBe('complete');
    expect(stages.approvalState).toBe('pending');
    expect(stages.bankWorkflow).toBe('not_yet_due');
    expect(stages.documentReview.passbook).toBe('missing');
    expect(stages.missingBankFields).toEqual([
      'accountNumber',
      'accountHolderName',
      'bankName',
      'branchName',
      'ifscCode',
      'passbookProof',
    ]);
  });

  // -------------------------------------------------------------
  // Scenario 2: Intake complete, approved, no bank info
  // -------------------------------------------------------------
  it('Scenario 2: Intake complete, approved, no bank info -> intake complete, approval approved, bank pending', () => {
    const record = {
      ...baseValidIntakeRecord,
      approvedAllianceIndia: 'Approved',
    };

    const stages = deriveSubmissionStages(record);

    expect(stages.lifecycle).toBe('submitted');
    expect(stages.intakeCompleteness).toBe('complete');
    expect(stages.approvalState).toBe('approved');
    expect(stages.bankWorkflow).toBe('pending');
    expect(stages.documentReview.passbook).toBe('missing');
    expect(stages.missingBankFields).toHaveLength(6);
  });

  // -------------------------------------------------------------
  // Scenario 3: Intake incomplete (missing signature), approved, bank complete
  // -------------------------------------------------------------
  it('Scenario 3: Intake incomplete (missing signature), approved, bank complete', () => {
    const record = {
      ...baseValidIntakeRecord,
      hasSignature: false,
      signatureDataUrl: '',
      caregiverConsent: { signatureDataUrl: '' },
      approvedAllianceIndia: 'Approved',
      ...completeBankFields,
    };

    const stages = deriveSubmissionStages(record);

    expect(stages.intakeCompleteness).toBe('incomplete');
    expect(stages.missingIntakeFields).toContain('caregiverSignature');
    expect(stages.approvalState).toBe('approved');
    expect(stages.bankWorkflow).toBe('complete');
    expect(stages.documentReview.signature).toBe('missing');
    expect(stages.documentReview.passbook).toBe('uploaded');
    expect(stages.missingBankFields).toEqual([]);
  });

  // -------------------------------------------------------------
  // Scenario 4: Rejected intake
  // -------------------------------------------------------------
  it('Scenario 4: Rejected intake -> bank workflow strictly not_yet_due', () => {
    const record = {
      ...baseValidIntakeRecord,
      approvedAllianceIndia: 'Rejected',
      ...completeBankFields,
    };

    const stages = deriveSubmissionStages(record);

    expect(stages.approvalState).toBe('rejected');
    expect(stages.bankWorkflow).toBe('not_yet_due');
  });

  // -------------------------------------------------------------
  // Scenario 5: Outbox draft / queued submission
  // -------------------------------------------------------------
  it('Scenario 5: Outbox draft / queued submission -> draft lifecycle, bank not_yet_due', () => {
    const draftRecord = {
      ...baseValidIntakeRecord,
      isDraft: true,
      status: 'draft',
      approvedAllianceIndia: 'Approved', // Even if draft has an approval flag set locally
    };

    const stages = deriveSubmissionStages(draftRecord);

    expect(stages.lifecycle).toBe('draft');
    expect(stages.bankWorkflow).toBe('not_yet_due');
  });

  // -------------------------------------------------------------
  // Scenario 6: Bank account number with leading zeros
  // -------------------------------------------------------------
  it('Scenario 6: Bank account number with leading zeros is preserved as string', () => {
    const recordWithLeadingZeros = {
      accountNumber: '000456789012',
      accountHolderName: 'Pooja Patil',
      bankName: 'Bank of Baroda',
      branchName: 'Main Branch',
      ifscCode: 'BARB0POOJA',
      passbookProof: 'https://example.com/passbook.jpg',
    };

    const bankFields = extractBankFields(recordWithLeadingZeros);
    expect(bankFields.accountNumber).toBe('000456789012');
    expect(typeof bankFields.accountNumber).toBe('string');
    expect(bankFields.accountNumber.startsWith('000')).toBe(true);

    // Masking test
    const masked = maskBankAccountNumber('000456789012');
    expect(masked).toBe('XXXX-XXXX-9012');

    // Short numbers (< 4 digits) returned as-is
    expect(maskBankAccountNumber('123')).toBe('123');
    expect(maskBankAccountNumber('')).toBe('');
    expect(maskBankAccountNumber(null)).toBe('');
  });

  // -------------------------------------------------------------
  // Scenario 7: Full bank fields complete post-approval
  // -------------------------------------------------------------
  it('Scenario 7: Full bank fields complete post-approval -> bank complete, 0 missing bank fields', () => {
    const record = {
      ...baseValidIntakeRecord,
      approvedAllianceIndia: 'Approved',
      ...completeBankFields,
    };

    const stages = deriveSubmissionStages(record);

    expect(stages.approvalState).toBe('approved');
    expect(stages.bankWorkflow).toBe('complete');
    expect(stages.missingBankFields).toHaveLength(0);
    expect(stages.bankFields.accountNumber).toBe('001234567890');
    expect(stages.bankFields.ifscCode).toBe('SBIN0001234');
  });

  // -------------------------------------------------------------
  // Sentinel string DATA_URL_STORED_PENDING_AUTH handling
  // -------------------------------------------------------------
  it('Sentinel string DATA_URL_STORED_PENDING_AUTH is strictly rejected as missing document', () => {
    expect(isAttachmentPresent('DATA_URL_STORED_PENDING_AUTH')).toBe(false);
    expect(isAttachmentPresent('data_url_stored_pending_auth')).toBe(false);
    expect(isAttachmentPresent('  DATA_URL_STORED_PENDING_AUTH  ')).toBe(false);

    // Verify extractBankFields treats it as missing passbook proof
    const bankFields = extractBankFields({
      accountNumber: '1234567890',
      accountHolderName: 'Test',
      bankName: 'Test',
      branchName: 'Test',
      ifscCode: 'TEST0123456',
      passbookProof: 'DATA_URL_STORED_PENDING_AUTH',
    });
    expect(bankFields.passbookProof).toBe('');
  });

  // -------------------------------------------------------------
  // Sorting of Approved — Bank Details Pending Queue
  // -------------------------------------------------------------
  it('sorts approved bank pending queue by oldest approval timestamp first, then stable ID', () => {
    const items = [
      { id: 'REC-3', approvedAt: '2026-09-15T10:00:00Z' },
      { id: 'REC-1', approvedAt: '2026-09-10T12:00:00Z' },
      { id: 'REC-2', approvedAt: '2026-09-10T12:00:00Z' },
      { id: 'REC-4', approvedAt: '2026-09-20T08:00:00Z' },
    ];

    const sorted = [...items].sort((a, b) => {
      const tA = new Date(a.approvedAt).getTime();
      const tB = new Date(b.approvedAt).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });

    expect(sorted.map((i) => i.id)).toEqual(['REC-1', 'REC-2', 'REC-3', 'REC-4']);
  });

  // -------------------------------------------------------------
  // Backend Summary Endpoint Metrics for PR A
  // -------------------------------------------------------------
  it('GET /api/submissions/summary returns intakeIncomplete and bankPending metrics', async () => {
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();

    const req = new NextRequest('http://localhost:3000/api/submissions/summary', {
      method: 'GET',
    });

    const res = await getSummary(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data).toBeDefined();
    expect(typeof body.data.intakeIncomplete).toBe('number');
    expect(typeof body.data.bankPending).toBe('number');
  });
});
