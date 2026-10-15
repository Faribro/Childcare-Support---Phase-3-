import crypto from 'crypto';
import { DocType, OutboundDocumentRequest, SubmissionEntity } from './types';
import { MissingDocumentDetector } from './missing-document-detector';

export class WhatsAppRequestBuilder {
  private readonly detector: MissingDocumentDetector;

  constructor(detector: MissingDocumentDetector = new MissingDocumentDetector()) {
    this.detector = detector;
  }

  /**
   * Masks phone number preserving country prefix and last 4 digits: +91 ******3210
   */
  public maskPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.length < 7) return '******';
    const prefix = cleaned.slice(0, 3);
    const suffix = cleaned.slice(-4);
    return `${prefix} ******${suffix}`;
  }

  /**
   * Generates a deterministic idempotency key for this submission and specific missing set.
   */
  public generateIdempotencyKey(submissionId: string, missingDocTypes: readonly DocType[]): string {
    const sorted = [...missingDocTypes].sort().join(',');
    const hash = crypto.createHash('sha256').update(`${submissionId}:${sorted}`).digest('hex').substring(0, 16);
    return `req_doc_${submissionId.substring(0, 8)}_${hash}`;
  }

  /**
   * Prepares the outbound WhatsApp request with idempotency key and safe formatting.
   * DOES NOT SEND LIVE — sets status to 'PREPARED'.
   */
  public buildDocumentRequest(
    submission: SubmissionEntity,
    missingDocTypes: readonly DocType[]
  ): OutboundDocumentRequest {
    const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const idempotencyKey = this.generateIdempotencyKey(submission.id, missingDocTypes);
    const maskedPhone = this.maskPhoneNumber(submission.beneficiaryPhone);
    const recipientPhoneRef =
      submission.beneficiaryPhoneHash ||
      crypto.createHash('sha256').update(submission.beneficiaryPhone).digest('hex');

    const docBulletList = missingDocTypes
      .map((d, idx) => `  ${idx + 1}. *${this.detector.getDocumentLabel(d)}*`)
      .join('\n');

    const messageBody =
      `📋 *Alliance Child Support: Document Verification*\n\n` +
      `Assessment Reference: \`${submission.remoteSubmissionId}\`\n\n` +
      `To finalize supervisor verification for this case, please submit the following document(s):\n\n` +
      `${docBulletList}\n\n` +
      `👉 *How to submit:* Send a clear photo (JPEG/PNG) or PDF document directly in this chat.\n\n` +
      `_Secure institutional verification loop. Zero confidential clinical data is exposed._`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

    return {
      requestId,
      idempotencyKey,
      submissionId: submission.id,
      recipientPhoneRef,
      recipientPhoneMasked: maskedPhone,
      missingDocTypes: [...missingDocTypes],
      messageBody,
      status: 'PREPARED',
      expiresAt,
      createdAt: now.toISOString(),
    };
  }
}
