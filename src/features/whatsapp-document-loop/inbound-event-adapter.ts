import crypto from 'crypto';
import { InboundMediaUploadEvent, SubmissionEntity } from './types';
import { IDurableDocumentLoopStore, MemoryDocumentLoopStore } from './persistence';

export interface SignatureVerificationResult {
  readonly valid: boolean;
  readonly error?: string;
}

export class InboundEventAdapter {
  private readonly appSecret: string;
  private readonly store: IDurableDocumentLoopStore;

  constructor(
    appSecret: string = process.env.META_APP_SECRET || 'test_meta_app_secret',
    store: IDurableDocumentLoopStore = new MemoryDocumentLoopStore()
  ) {
    this.appSecret = appSecret;
    this.store = store;
  }

  /**
   * Timing-safe HMAC-SHA256 signature verification matching Meta WhatsApp Cloud API.
   */
  public verifySignature(rawPayload: string | Buffer, signatureHeader?: string): SignatureVerificationResult {
    if (!signatureHeader) {
      return { valid: false, error: 'Missing X-Hub-Signature-256 header' };
    }

    if (!signatureHeader.startsWith('sha256=')) {
      return { valid: false, error: 'Malformed signature header: missing sha256= prefix' };
    }

    const signatureHex = signatureHeader.slice(7).trim();
    if (signatureHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(signatureHex)) {
      return { valid: false, error: 'Malformed signature header: invalid hex length' };
    }

    const hmac = crypto.createHmac('sha256', this.appSecret);
    hmac.update(rawPayload);
    const expectedHex = hmac.digest('hex');

    const sigBuffer = Buffer.from(signatureHex, 'hex');
    const expectedBuffer = Buffer.from(expectedHex, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, error: 'Signature mismatch: unauthorized payload origin' };
    }

    return { valid: true };
  }

  /**
   * Deduplication check backed by durable store.
   * Returns true if eventId or idempotency key has already been processed.
   */
  public isDuplicate(eventId: string, idempotencyKey?: string): boolean {
    return this.store.hasEvent(eventId, idempotencyKey);
  }

  /**
   * Marks an event as processed for deduplication.
   */
  public markProcessed(eventId: string, idempotencyKey?: string): void {
    this.store.recordEvent(eventId, idempotencyKey);
  }

  /**
   * Normalizes phone number into E.164.
   */
  public normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return `+${cleaned}`;
  }

  /**
   * Verifies that the sender phone is authorized for the given submission.
   */
  public verifySenderAuthorization(
    event: InboundMediaUploadEvent,
    submission: SubmissionEntity
  ): { authorized: boolean; reason?: string } {
    const senderNormalized = this.normalizePhone(event.fromPhone);
    const beneficiaryNormalized = this.normalizePhone(submission.beneficiaryPhone);

    if (senderNormalized !== beneficiaryNormalized) {
      return {
        authorized: false,
        reason: `Sender ${senderNormalized.slice(0, 3)} ******${senderNormalized.slice(
          -4
        )} is not authorized to upload documents for submission ${submission.remoteSubmissionId}.`,
      };
    }

    return { authorized: true };
  }
}
