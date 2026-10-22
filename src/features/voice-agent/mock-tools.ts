/**
 * Synthetic Mock Tools for Staff Calling-Agent Prototype
 * 
 * BOUNDARIES:
 * - Purely in-memory, disposable test state.
 * - Does NOT connect to Google Sheets, Supabase, Podio, or any external API.
 * - Enforces synthetic task IDs and disallows real beneficiary identifiers.
 */

import {
  SyntheticFollowupTask,
  SyntheticDocumentFollowupTask,
  SyntheticDocumentRecord,
  MissingDocumentEvent,
  MockWhatsAppHandoffRecord,
  MockCallbackRecord,
  MockOptOutRecord,
  MockStaffHandoffRecord,
  MockContactOutcomeRecord,
  ConversationState,
  DocumentType,
  DocumentStatus,
} from './types';

export const FIXED_SYNTHETIC_TASK: SyntheticFollowupTask = {
  taskId: 'SYNTH-TASK-001',
  taskDescription: 'A staff-created follow-up task needs assistance.',
  generalInstructions: [
    'A staff-created follow-up task needs assistance.',
    'Offer general instructions if requested.',
    'Record a mock callback request if requested, explicitly stating it is a test.',
    'Hand the matter to staff if requested, explicitly stating it is a test.'
  ],
  isSynthetic: true,
};

export const FIXED_DOCUMENT_FOLLOWUP_TASK: SyntheticDocumentFollowupTask = {
  taskId: 'SYNTH-DOC-002',
  taskDescription: 'Verification document (Child Nutrition & Growth Card) is missing for registered child profile.',
  generalInstructions: [
    'A required Child Nutrition & Growth Card is missing for Baby Ananya.',
    'Verify convenient and safe time to speak.',
    'Explain the missing document requirement clearly and concisely.',
    'Offer secure WhatsApp photo-upload handoff link.',
    'Strict rule: Do NOT mark document complete on verbal claim alone; completion requires stored document status.',
    'If user claims sent, verify stored status. If still pending, offer WhatsApp link.',
    'End call cleanly after WhatsApp handoff or resolution.'
  ],
  missingDocument: {
    documentId: 'DOC-SYNTH-881',
    documentType: 'NUTRITION_CARD',
    documentName: 'Child Nutrition & Growth Card',
    status: 'MISSING',
    childName: 'Baby Ananya',
    caregiverPhoneMasked: '+91 98XXX-XX123',
  },
  isSynthetic: true,
};

export function createSyntheticMissingDocumentEvent(
  task: SyntheticDocumentFollowupTask = FIXED_DOCUMENT_FOLLOWUP_TASK
): MissingDocumentEvent {
  return {
    eventId: `ev-missing-doc-${Date.now()}`,
    taskId: task.taskId,
    document: { ...task.missingDocument },
    triggeredAt: new Date().toISOString(),
    isSynthetic: true,
  };
}

import {
  VoiceDocumentCoordinatorAdapter,
  DocumentLoopStatus,
  DocumentLoopDocType,
} from './adapters/document-loop-adapter';

export class MockDisposableStateStore {
  private callbacks: MockCallbackRecord[] = [];
  private optOuts: MockOptOutRecord[] = [];
  private handoffs: MockStaffHandoffRecord[] = [];
  private outcomes: MockContactOutcomeRecord[] = [];
  private documents: Map<string, SyntheticDocumentRecord> = new Map();
  private whatsappHandoffs: MockWhatsAppHandoffRecord[] = [];
  private coordinatorAdapter: VoiceDocumentCoordinatorAdapter;

  constructor() {
    this.coordinatorAdapter = new VoiceDocumentCoordinatorAdapter();
    this.resetDocuments();
  }

  private resetDocuments(): void {
    this.documents.clear();
    this.documents.set(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId, {
      ...FIXED_DOCUMENT_FOLLOWUP_TASK.missingDocument,
    });
    this.coordinatorAdapter.clear();
    this.coordinatorAdapter.registerDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId, {
      docType: 'nutritionGrowthCard',
      canonicalLabel: 'Child Nutrition & Growth Card',
      status: 'MISSING',
    });
  }

  public getCoordinatorAdapter(): VoiceDocumentCoordinatorAdapter {
    return this.coordinatorAdapter;
  }

  public clear(): void {
    this.callbacks = [];
    this.optOuts = [];
    this.handoffs = [];
    this.outcomes = [];
    this.whatsappHandoffs = [];
    this.resetDocuments();
  }

  private isValidSyntheticTaskId(taskId?: string): boolean {
    return taskId === FIXED_SYNTHETIC_TASK.taskId || taskId === FIXED_DOCUMENT_FOLLOWUP_TASK.taskId;
  }

  public getSyntheticFollowupTask(taskId?: string): SyntheticFollowupTask | SyntheticDocumentFollowupTask {
    if (taskId === FIXED_DOCUMENT_FOLLOWUP_TASK.taskId) {
      return {
        ...FIXED_DOCUMENT_FOLLOWUP_TASK,
        missingDocument: this.documents.get(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId) || FIXED_DOCUMENT_FOLLOWUP_TASK.missingDocument,
      };
    }
    if (taskId && taskId !== FIXED_SYNTHETIC_TASK.taskId) {
      throw new Error(`Invalid synthetic task ID: "${taskId}". Only fixed synthetic tasks are permitted in this prototype.`);
    }
    return FIXED_SYNTHETIC_TASK;
  }

  public getDocument(taskId: string): SyntheticDocumentRecord | undefined {
    return this.documents.get(taskId);
  }

  public setDocumentStatus(taskId: string, status: DocumentStatus): void {
    const doc = this.documents.get(taskId);
    if (doc) {
      const normalizedStatus: DocumentLoopStatus = status === 'PENDING_UPLOAD' ? 'REQUESTED' : (status as DocumentLoopStatus);
      this.documents.set(taskId, {
        ...doc,
        status,
        ...(status === 'UPLOADED' ? { uploadedAt: new Date().toISOString() } : {}),
        ...(status === 'VERIFIED' ? { verifiedAt: new Date().toISOString() } : {}),
      });
      this.coordinatorAdapter.updateDocumentStatus(taskId, normalizedStatus);
    }
  }

  public recordMockWhatsAppHandoff(args: {
    taskId: string;
    documentType?: DocumentType;
    phoneMasked?: string;
  }): MockWhatsAppHandoffRecord {
    if (!this.isValidSyntheticTaskId(args.taskId)) {
      throw new Error('WhatsApp handoff rejected: Must reference valid synthetic taskId.');
    }
    const doc = this.documents.get(args.taskId) || FIXED_DOCUMENT_FOLLOWUP_TASK.missingDocument;
    const token = `upload-synth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: MockWhatsAppHandoffRecord = {
      id: `mock-wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: args.taskId,
      documentType: args.documentType || doc.documentType,
      phoneMasked: args.phoneMasked || doc.caregiverPhoneMasked,
      uploadLinkToken: token,
      uploadUrl: `https://wa.me/mock-bot?text=UPLOAD_${token}`,
      requestedAt: new Date().toISOString(),
      deliveryStatus: 'SIMULATED_DISPATCHED',
      isSynthetic: true,
    };
    this.whatsappHandoffs.push(record);
    this.coordinatorAdapter.dispatchWhatsAppUploadHandoff({
      submissionId: args.taskId,
      phoneMasked: record.phoneMasked,
    });

    // When link is dispatched, transition status from MISSING to PENDING_UPLOAD
    if (doc.status === 'MISSING') {
      this.setDocumentStatus(args.taskId, 'PENDING_UPLOAD');
    }

    return record;
  }

  public recordMockCallbackRequest(args: {
    taskId: string;
    requestedWindow: string;
    notes?: string;
  }): MockCallbackRecord {
    if (!args.taskId || !this.isValidSyntheticTaskId(args.taskId)) {
      throw new Error('Callback request rejected: Must reference valid synthetic taskId.');
    }
    if (!args.requestedWindow || args.requestedWindow.trim().length === 0) {
      throw new Error('Callback request rejected: requestedWindow is required.');
    }

    const record: MockCallbackRecord = {
      id: `mock-cb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: args.taskId,
      requestedWindow: args.requestedWindow.trim(),
      notes: args.notes?.trim(),
      recordedAt: new Date().toISOString(),
      isSynthetic: true,
    };
    this.callbacks.push(record);
    return record;
  }

  public recordMockOptOut(args: {
    reason?: string;
    optOutType?: 'CALLS' | 'ALL_COMMUNICATIONS';
  }): MockOptOutRecord {
    const record: MockOptOutRecord = {
      id: `mock-optout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reason: args.reason?.trim() || 'Beneficiary requested stop / opt-out',
      optOutType: args.optOutType || 'CALLS',
      recordedAt: new Date().toISOString(),
      isSynthetic: true,
    };
    this.optOuts.push(record);
    return record;
  }

  public requestMockStaffHandoff(args: {
    taskId: string;
    reason: string;
    priority?: 'NORMAL' | 'HIGH';
  }): MockStaffHandoffRecord {
    if (!args.taskId || !this.isValidSyntheticTaskId(args.taskId)) {
      throw new Error('Handoff rejected: Must reference valid synthetic taskId.');
    }
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error('Handoff rejected: Reason for staff escalation is required.');
    }

    const record: MockStaffHandoffRecord = {
      id: `mock-handoff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: args.taskId,
      reason: args.reason.trim(),
      priority: args.priority || 'NORMAL',
      requestedAt: new Date().toISOString(),
      isSynthetic: true,
    };
    this.handoffs.push(record);
    return record;
  }

  public recordMockContactOutcome(args: {
    taskId: string;
    finalState: ConversationState;
    durationSeconds: number;
    turnsCount: number;
    notes: string;
  }): MockContactOutcomeRecord {
    if (!args.taskId || !this.isValidSyntheticTaskId(args.taskId)) {
      throw new Error('Outcome record rejected: Must reference valid synthetic taskId.');
    }

    const record: MockContactOutcomeRecord = {
      id: `mock-outcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: args.taskId,
      finalState: args.finalState,
      durationSeconds: args.durationSeconds,
      turnsCount: args.turnsCount,
      notes: args.notes.trim(),
      recordedAt: new Date().toISOString(),
      isSynthetic: true,
    };
    this.outcomes.push(record);
    return record;
  }

  // Inspection accessors for testing & staff review
  public getCallbacks(): readonly MockCallbackRecord[] {
    return [...this.callbacks];
  }
  public getOptOuts(): readonly MockOptOutRecord[] {
    return [...this.optOuts];
  }
  public getHandoffs(): readonly MockStaffHandoffRecord[] {
    return [...this.handoffs];
  }
  public getOutcomes(): readonly MockContactOutcomeRecord[] {
    return [...this.outcomes];
  }
  public getWhatsAppHandoffs(): readonly MockWhatsAppHandoffRecord[] {
    return [...this.whatsappHandoffs];
  }
}
