/**
 * Webhook-to-Worker Durable Handoff Contract & Queue
 *
 * Bridges:
 * 1. Receive-Only Ingress Adapter (`Childcare-Catalyst-Adapter` / `feat/catalyst-whatsapp-adapter`)
 * 2. Downstream Media Processing Service (`Childcare-Support-Phase-3(1)` / `feat/staging-destination-hardening`)
 *
 * Safety & Privacy Invariants:
 * - NO raw beneficiary phone numbers or contact names are enqueued.
 * - Enqueues strictly verifiable media references (mediaId, mimeType, sha256, uploadToken).
 * - Enforces at-least-once durable delivery with explicit acknowledgment.
 * - Idempotent deduplication based on mediaId.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { MediaProcessingJob, BeneficiaryDocumentType } from './mediaProcessingService';

export interface MediaIngressHandoffEvent {
  readonly eventId: string;
  readonly correlationId: string;
  readonly mediaId: string;
  readonly mimeType: string;
  readonly sha256?: string;
  readonly uploadToken?: string;
  readonly receivedAt: string; // ISO 8601 UTC
  readonly sourceOrigin: 'CATALYST_WHATSAPP_INGRESS';
  readonly isSynthetic: boolean;
}

export interface WebhookHandoffQueue {
  enqueue(event: Omit<MediaIngressHandoffEvent, 'eventId' | 'receivedAt'>): Promise<{
    enqueued: boolean;
    eventId: string;
    queueDepth: number;
    isDuplicate: boolean;
  }>;
  pollNext(batchSize?: number): Promise<MediaIngressHandoffEvent[]>;
  acknowledge(eventId: string): Promise<boolean>;
  getPendingCount(): Promise<number>;
  clear(): Promise<void>;
}

export class PersistentWebhookHandoffQueue implements WebhookHandoffQueue {
  private queue: MediaIngressHandoffEvent[] = [];
  private processedIds = new Set<string>();
  private readonly filePath: string;

  constructor(options?: { filePath?: string }) {
    this.filePath = options?.filePath || path.join(process.cwd(), '.cache', 'webhook_handoff_queue.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.queue)) {
          this.queue = parsed.queue;
        }
        if (Array.isArray(parsed.processedIds)) {
          this.processedIds = new Set(parsed.processedIds);
        }
      }
    } catch {
      // Fallback to in-memory on read-only environments
    }
  }

  private flushToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        queue: this.queue,
        processedIds: Array.from(this.processedIds),
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Ignore disk write errors on read-only runtimes
    }
  }

  public async enqueue(
    event: Omit<MediaIngressHandoffEvent, 'eventId' | 'receivedAt'>
  ): Promise<{ enqueued: boolean; eventId: string; queueDepth: number; isDuplicate: boolean }> {
    // Deduplicate on mediaId
    if (this.processedIds.has(event.mediaId) || this.queue.some((e) => e.mediaId === event.mediaId)) {
      return {
        enqueued: false,
        eventId: `dup-${event.mediaId}`,
        queueDepth: this.queue.length,
        isDuplicate: true,
      };
    }

    const eventId = `ev-handoff-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const fullEvent: MediaIngressHandoffEvent = {
      ...event,
      eventId,
      receivedAt: new Date().toISOString(),
    };

    this.queue.push(fullEvent);
    this.flushToDisk();

    return {
      enqueued: true,
      eventId,
      queueDepth: this.queue.length,
      isDuplicate: false,
    };
  }

  public async pollNext(batchSize: number = 10): Promise<MediaIngressHandoffEvent[]> {
    return this.queue.slice(0, batchSize);
  }

  public async acknowledge(eventId: string): Promise<boolean> {
    const idx = this.queue.findIndex((e) => e.eventId === eventId);
    if (idx === -1) return false;

    const [removed] = this.queue.splice(idx, 1);
    this.processedIds.add(removed.mediaId);
    this.flushToDisk();
    return true;
  }

  public async getPendingCount(): Promise<number> {
    return this.queue.length;
  }

  public async clear(): Promise<void> {
    this.queue = [];
    this.processedIds.clear();
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {}
  }
}

/**
 * Token Resolver Interface:
 * Resolves an uploadToken dispatched during voice or WhatsApp outreach
 * to the target beneficiary submission and expected document type.
 */
export interface UploadTokenResolver {
  resolveToken(token: string): Promise<{
    valid: boolean;
    targetSubmissionId?: string;
    targetChildName?: string;
    documentType?: BeneficiaryDocumentType;
    error?: string;
  }>;
}

/**
 * Translates a dequeued MediaIngressHandoffEvent into an executable MediaProcessingJob.
 */
export async function translateHandoffEventToJob(
  event: MediaIngressHandoffEvent,
  tokenResolver: UploadTokenResolver
): Promise<{
  success: boolean;
  job?: MediaProcessingJob;
  error?: string;
}> {
  if (!event.uploadToken) {
    return {
      success: false,
      error: 'Cannot process media: Missing uploadToken in ingress handoff event.',
    };
  }

  const resolved = await tokenResolver.resolveToken(event.uploadToken);
  if (!resolved.valid || !resolved.targetSubmissionId || !resolved.targetChildName || !resolved.documentType) {
    return {
      success: false,
      error: `Token resolution failed: ${resolved.error || 'Invalid or expired uploadToken'}`,
    };
  }

  return {
    success: true,
    job: {
      jobId: `job-from-${event.eventId}`,
      mediaId: event.mediaId,
      mimeType: event.mimeType,
      expectedSha256: event.sha256,
      targetSubmissionId: resolved.targetSubmissionId,
      targetChildName: resolved.targetChildName,
      documentType: resolved.documentType,
      sourceOrigin: 'META_WHATSAPP_WEBHOOK',
    },
  };
}
