/**
 * Document Loop Coordinator Adapter for Voice Agent
 * 
 * Reuses the canonical document verification and shared document-loop contracts:
 * - DocType & DocumentStatus from the shared document-loop contract
 * - CanonicalDocumentType & DocumentAttachmentState from @/lib/read-model/beneficiaryReadiness
 * - Prevents competing schemas or disparate document state models
 */

import {
  CanonicalDocumentType,
  DocumentAttachmentState,
} from '@/lib/read-model/beneficiaryReadiness';

// Shared Document Loop DocType (matching Thread A contract)
export type DocumentLoopDocType =
  | 'passbookPhoto'
  | 'aadhaarCardPhoto'
  | 'childPhoto'
  | 'feeReceiptPhoto'
  | 'marksheetPhoto'
  | 'caregiverSignature'
  | 'nutritionGrowthCard'; // Extended for Phase 3 nutrition surveillance

// Shared Document Status (canonical lifecycle states)
export type DocumentLoopStatus =
  | 'MISSING'
  | 'REQUESTED'
  | 'UPLOADED'
  | 'VERIFIED'
  | 'REJECTED';

export interface DocumentMetadataAdapter {
  readonly docType: DocumentLoopDocType;
  readonly canonicalLabel: CanonicalDocumentType | 'Child Nutrition & Growth Card';
  readonly status: DocumentLoopStatus;
  readonly fileUri?: string;
  readonly uploadedAt?: string;
  readonly verifiedAt?: string;
  readonly notes?: string;
}

export interface VoiceMissingDocumentEvent {
  readonly eventId: string;
  readonly submissionId: string;
  readonly childName: string;
  readonly caregiverPhoneMasked: string;
  readonly missingDocTypes: readonly DocumentLoopDocType[];
  readonly document: DocumentMetadataAdapter;
  readonly triggeredAt: string;
  readonly isSynthetic: boolean;
}

export interface OutboundHandoffDispatch {
  readonly handoffId: string;
  readonly submissionId: string;
  readonly docType: DocumentLoopDocType;
  readonly phoneMasked: string;
  readonly uploadLinkTokenMasked: string;
  readonly uploadUrl: string;
  readonly dispatchedAt: string;
  readonly status: 'SIMULATED_DISPATCHED' | 'DISPATCHED';
}

/**
 * Maps CanonicalDocumentType (from beneficiaryReadiness) to DocumentLoopDocType
 */
export function toDocumentLoopDocType(canonical: CanonicalDocumentType): DocumentLoopDocType {
  switch (canonical) {
    case 'Bank Passbook Front Page':
      return 'passbookPhoto';
    case 'Aadhaar Card':
      return 'aadhaarCardPhoto';
    case 'Passport Size Photo':
      return 'childPhoto';
    case 'School Fee Receipt':
      return 'feeReceiptPhoto';
    case 'Academic Marksheet':
      return 'marksheetPhoto';
    case 'Caregiver Signature':
      return 'caregiverSignature';
    default:
      return 'childPhoto';
  }
}

/**
 * Maps DocumentLoopDocType to human-readable canonical label
 */
export function toCanonicalLabel(docType: DocumentLoopDocType): string {
  switch (docType) {
    case 'passbookPhoto':
      return 'Bank Passbook Front Page';
    case 'aadhaarCardPhoto':
      return 'Aadhaar Card';
    case 'childPhoto':
      return 'Passport Size Photo';
    case 'feeReceiptPhoto':
      return 'School Fee Receipt';
    case 'marksheetPhoto':
      return 'Academic Marksheet';
    case 'caregiverSignature':
      return 'Caregiver Signature / Thumb Impression';
    case 'nutritionGrowthCard':
      return 'Child Nutrition & Growth Card';
    default:
      return 'Required Document';
  }
}

/**
 * Normalizes any attachment state or string to canonical DocumentLoopStatus
 */
export function normalizeToDocumentLoopStatus(
  state: DocumentAttachmentState | string | undefined
): DocumentLoopStatus {
  if (!state) return 'MISSING';
  const s = state.toUpperCase().trim();
  if (s === 'VERIFIED') return 'VERIFIED';
  if (s === 'UPLOADED' || s === 'PRESENT') return 'UPLOADED';
  if (s === 'REQUESTED' || s === 'PENDING_UPLOAD') return 'REQUESTED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'MISSING';
}

/**
 * Voice Document Coordinator Interface
 * 
 * Provides unified integration for triggering missing-document voice follow-ups,
 * querying canonical document statuses, and dispatching WhatsApp upload handoffs.
 */
export class VoiceDocumentCoordinatorAdapter {
  private documentsMap = new Map<string, DocumentMetadataAdapter>();
  private handoffsList: OutboundHandoffDispatch[] = [];

  constructor(initialDocuments?: Record<string, DocumentMetadataAdapter>) {
    if (initialDocuments) {
      for (const [key, val] of Object.entries(initialDocuments)) {
        this.documentsMap.set(key, val);
      }
    }
  }

  public registerDocument(submissionId: string, doc: DocumentMetadataAdapter): void {
    this.documentsMap.set(submissionId, doc);
  }

  public getDocumentStatus(submissionId: string): DocumentMetadataAdapter | undefined {
    return this.documentsMap.get(submissionId);
  }

  public updateDocumentStatus(
    submissionId: string,
    status: DocumentLoopStatus,
    extra?: { uploadedAt?: string; verifiedAt?: string; notes?: string }
  ): DocumentMetadataAdapter {
    const existing = this.documentsMap.get(submissionId) || {
      docType: 'nutritionGrowthCard',
      canonicalLabel: 'Child Nutrition & Growth Card',
      status: 'MISSING',
    };

    const updated: DocumentMetadataAdapter = {
      ...existing,
      status,
      uploadedAt: status === 'UPLOADED' ? extra?.uploadedAt || new Date().toISOString() : existing.uploadedAt,
      verifiedAt: status === 'VERIFIED' ? extra?.verifiedAt || new Date().toISOString() : existing.verifiedAt,
      notes: extra?.notes || existing.notes,
    };

    this.documentsMap.set(submissionId, updated);
    return updated;
  }

  public createMissingDocumentEvent(params: {
    submissionId: string;
    childName: string;
    caregiverPhoneMasked: string;
    docType?: DocumentLoopDocType;
  }): VoiceMissingDocumentEvent {
    const docType = params.docType || 'nutritionGrowthCard';
    const existingDoc = this.documentsMap.get(params.submissionId) || {
      docType,
      canonicalLabel: toCanonicalLabel(docType) as any,
      status: 'MISSING' as DocumentLoopStatus,
    };

    this.documentsMap.set(params.submissionId, existingDoc);

    return {
      eventId: `ev-missing-doc-${Date.now()}`,
      submissionId: params.submissionId,
      childName: params.childName,
      caregiverPhoneMasked: params.caregiverPhoneMasked,
      missingDocTypes: [docType],
      document: existingDoc,
      triggeredAt: new Date().toISOString(),
      isSynthetic: true,
    };
  }

  public dispatchWhatsAppUploadHandoff(params: {
    submissionId: string;
    docType?: DocumentLoopDocType;
    phoneMasked?: string;
  }): OutboundHandoffDispatch {
    const docType = params.docType || 'nutritionGrowthCard';
    const rawToken = `tok-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const maskedToken = `${rawToken.substring(0, 6)}***`;

    const dispatch: OutboundHandoffDispatch = {
      handoffId: `wa-handoff-${Date.now()}`,
      submissionId: params.submissionId,
      docType,
      phoneMasked: params.phoneMasked || '+91 98XXX-XX123',
      uploadLinkTokenMasked: maskedToken,
      uploadUrl: `https://wa.me/mock-bot?text=UPLOAD_${maskedToken}`,
      dispatchedAt: new Date().toISOString(),
      status: 'SIMULATED_DISPATCHED',
    };

    this.handoffsList.push(dispatch);

    // Transition status to REQUESTED
    const current = this.documentsMap.get(params.submissionId);
    if (current && current.status === 'MISSING') {
      this.updateDocumentStatus(params.submissionId, 'REQUESTED', {
        notes: `WhatsApp handoff dispatched with token ${maskedToken}`,
      });
    }

    return dispatch;
  }

  public getDispatchedHandoffs(): readonly OutboundHandoffDispatch[] {
    return [...this.handoffsList];
  }

  public clear(): void {
    this.documentsMap.clear();
    this.handoffsList = [];
  }
}
