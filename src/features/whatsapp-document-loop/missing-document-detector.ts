import { DocType, SubmissionEntity } from './types';

/**
 * Mandatory document inspection rules:
 * - Basic Surveillance Dossier: passbookPhoto, aadhaarCardPhoto, childPhoto, caregiverSignature
 * - Conditional Education Support: feeReceiptPhoto (required when requiresFeeReceipt is true)
 */
export const CORE_MANDATORY_DOCUMENTS: readonly DocType[] = [
  'passbookPhoto',
  'aadhaarCardPhoto',
  'childPhoto',
  'caregiverSignature',
];

export class MissingDocumentDetector {
  /**
   * Detects missing documents from current submission document records.
   * Returns list of DocTypes that are not yet UPLOADED or VERIFIED.
   */
  public detectMissingDocuments(submission: SubmissionEntity): DocType[] {
    const required: DocType[] = [...CORE_MANDATORY_DOCUMENTS];

    if (submission.requiresFeeReceipt) {
      required.push('feeReceiptPhoto');
    }

    const missing: DocType[] = [];

    for (const docType of required) {
      const doc = submission.documents[docType];
      if (!doc || (doc.status !== 'VERIFIED' && doc.status !== 'UPLOADED')) {
        missing.push(docType);
      }
    }

    return missing;
  }

  /**
   * Returns human-readable document label for WhatsApp messaging.
   */
  public getDocumentLabel(docType: DocType): string {
    const labels: Record<DocType, string> = {
      passbookPhoto: 'Bank Passbook Front Page',
      aadhaarCardPhoto: 'Aadhaar Card Document',
      childPhoto: 'Child Passport Photograph',
      feeReceiptPhoto: 'School Fee Receipt',
      marksheetPhoto: 'Academic Marksheet',
      caregiverSignature: 'Caregiver Consent Signature',
    };
    return labels[docType] || docType;
  }
}
