import fs from 'fs';
import path from 'path';
import { InboundMediaUploadEvent, OutboundDocumentRequest, SubmissionEntity } from './types';

/**
 * Interface defining durable persistence for the WhatsApp Document Loop.
 * Mirrors the schema in supabase/migrations/20261015220000_whatsapp_document_loop.sql:
 * - whatsapp_inbound_events (deduplication on wamid & idempotency key)
 * - whatsapp_outbound_requests (outbound request state & idempotency)
 * - submissions (durable submission & document state)
 */
export interface IDurableDocumentLoopStore {
  hasEvent(eventId: string, idempotencyKey?: string): boolean;
  recordEvent(eventId: string, idempotencyKey?: string, metadata?: Record<string, any>): void;
  getSubmission(submissionId: string): SubmissionEntity | undefined;
  saveSubmission(submission: SubmissionEntity): void;
  saveOutboundRequest(request: OutboundDocumentRequest): void;
  getOutboundRequest(requestId: string): OutboundDocumentRequest | undefined;
}

/**
 * In-memory implementation of the durable store for transient testing.
 */
export class MemoryDocumentLoopStore implements IDurableDocumentLoopStore {
  private readonly events: Set<string> = new Set();
  private readonly idempotencyKeys: Set<string> = new Set();
  private readonly submissions: Map<string, SubmissionEntity> = new Map();
  private readonly outboundRequests: Map<string, OutboundDocumentRequest> = new Map();

  public hasEvent(eventId: string, idempotencyKey?: string): boolean {
    if (this.events.has(eventId)) return true;
    if (idempotencyKey && this.idempotencyKeys.has(idempotencyKey)) return true;
    return false;
  }

  public recordEvent(eventId: string, idempotencyKey?: string): void {
    this.events.add(eventId);
    if (idempotencyKey) {
      this.idempotencyKeys.add(idempotencyKey);
    }
  }

  public getSubmission(submissionId: string): SubmissionEntity | undefined {
    return this.submissions.get(submissionId);
  }

  public saveSubmission(submission: SubmissionEntity): void {
    this.submissions.set(submission.id, submission);
  }

  public saveOutboundRequest(request: OutboundDocumentRequest): void {
    this.outboundRequests.set(request.requestId, request);
  }

  public getOutboundRequest(requestId: string): OutboundDocumentRequest | undefined {
    return this.outboundRequests.get(requestId);
  }
}

/**
 * File-backed durable store to verify service restart/retry resilience across process teardowns.
 * Simulates disk/database persistence surviving server process crashes.
 */
export class FileBackedTestStore implements IDurableDocumentLoopStore {
  private readonly filePath: string;
  private state: {
    events: string[];
    idempotencyKeys: string[];
    submissions: Record<string, SubmissionEntity>;
    outboundRequests: Record<string, OutboundDocumentRequest>;
  };

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.loadState();
  }

  private loadState() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch {
      // Fallback to fresh state
    }
    return {
      events: [],
      idempotencyKeys: [],
      submissions: {},
      outboundRequests: {},
    };
  }

  private persistState(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      // In tests, handle write errors safely
    }
  }

  public hasEvent(eventId: string, idempotencyKey?: string): boolean {
    this.state = this.loadState();
    if (this.state.events.includes(eventId)) return true;
    if (idempotencyKey && this.state.idempotencyKeys.includes(idempotencyKey)) return true;
    return false;
  }

  public recordEvent(eventId: string, idempotencyKey?: string): void {
    this.state = this.loadState();
    if (!this.state.events.includes(eventId)) {
      this.state.events.push(eventId);
    }
    if (idempotencyKey && !this.state.idempotencyKeys.includes(idempotencyKey)) {
      this.state.idempotencyKeys.push(idempotencyKey);
    }
    this.persistState();
  }

  public getSubmission(submissionId: string): SubmissionEntity | undefined {
    this.state = this.loadState();
    return this.state.submissions[submissionId];
  }

  public saveSubmission(submission: SubmissionEntity): void {
    this.state = this.loadState();
    this.state.submissions[submission.id] = submission;
    this.persistState();
  }

  public saveOutboundRequest(request: OutboundDocumentRequest): void {
    this.state = this.loadState();
    this.state.outboundRequests[request.requestId] = request;
    this.persistState();
  }

  public getOutboundRequest(requestId: string): OutboundDocumentRequest | undefined {
    this.state = this.loadState();
    return this.state.outboundRequests[requestId];
  }

  public cleanup(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}
