/**
 * Beneficiary Workflow Coordinator
 *
 * Orchestrates:
 * 1. Durable Beneficiary Session persistence across process restarts
 * 2. Strict Pre-Dispatch Caregiver Opt-Out Enforcement
 * 3. Durable CSC Caseworker Task Enqueuing & Deduplication on Escalation
 * 4. Inbound Event Replay Prevention & Idempotency
 */

import crypto from 'crypto';
import { BeneficiaryStateMachine } from './beneficiary-state-machine';
import { PrivacyFilter } from '../ai-multimodal/privacy-filter';
import type { BeneficiarySession, CscDurableTask, InboundBeneficiaryMessage } from './types';
import type { SupportedLanguage } from '../ai-multimodal/types';
import type { IDurableBeneficiaryStore } from './durable-session-store';

export interface InboundWorkflowInput {
  eventId: string;
  fromPhone: string;
  textBody?: string;
  mediaBuffer?: Buffer;
  mimeType?: string;
  submissionId: string;
  childIdMasked: string;
  associatedChildIds?: string[];
  preferredLanguage?: SupportedLanguage;
}

export interface InboundWorkflowResult {
  eventId: string;
  status: 'PROCESSED' | 'OPTED_OUT_IGNORED' | 'DUPLICATE_IGNORED' | 'ESCALATED' | 'COMPLETED';
  session: BeneficiarySession;
  responseMessage?: string;
  cscTask?: CscDurableTask;
  isOutboundAllowed: boolean;
}

export class BeneficiaryWorkflowCoordinator {
  private store: IDurableBeneficiaryStore;
  private stateMachine: BeneficiaryStateMachine;
  private processedEvents = new Set<string>();

  constructor(store: IDurableBeneficiaryStore, stateMachine?: BeneficiaryStateMachine) {
    this.store = store;
    this.stateMachine = stateMachine || new BeneficiaryStateMachine();
  }

  /**
   * Processes an inbound beneficiary message with strict opt-out, idempotency,
   * durable session recovery, and durable CSC task generation.
   */
  public async handleInboundEvent(input: InboundWorkflowInput): Promise<InboundWorkflowResult> {
    const { eventId, fromPhone, textBody } = input;

    // 1. Inbound Event Idempotency Check
    if (this.processedEvents.has(eventId)) {
      const existingSession = await this.store.getSessionByPhone(fromPhone);
      return {
        eventId,
        status: 'DUPLICATE_IGNORED',
        session: existingSession || this.createInitialSession(input),
        isOutboundAllowed: false,
      };
    }

    const phoneHash = PrivacyFilter.hashPhone(fromPhone);

    // 2. Strict Opt-Out Check
    const hasOptedOut = await this.store.isOptedOut(fromPhone);
    const textClean = (textBody || '').trim().toUpperCase();

    // If opted out and not explicitly requesting resubscription ("START")
    if (hasOptedOut && textClean !== 'START') {
      let existingSession = await this.store.getSessionByPhone(fromPhone);
      if (!existingSession) {
        existingSession = this.createInitialSession(input);
        existingSession.optedOut = true;
        existingSession.state = 'OPTED_OUT';
      }
      this.processedEvents.add(eventId);
      return {
        eventId,
        status: 'OPTED_OUT_IGNORED',
        session: existingSession,
        responseMessage: undefined, // Zero outbound message allowed
        isOutboundAllowed: false,
      };
    }

    // 3. Restore or Initialize Durable Session
    let session = await this.store.getSessionByPhone(fromPhone);
    if (!session) {
      session = this.createInitialSession(input);
    }

    // 4. Construct Inbound Message
    const inboundMessage: InboundBeneficiaryMessage = {
      fromPhone,
      messageId: eventId,
      timestamp: new Date().toISOString(),
      type: input.mediaBuffer ? 'image' : 'text',
      textBody: input.textBody,
      mediaBuffer: input.mediaBuffer,
      mimeType: input.mimeType,
    };

    // 5. State Machine Transition
    const transitionResult = await this.stateMachine.processInbound(session, inboundMessage);
    const updatedSession = transitionResult.updatedSession;

    // 6. Opt-Out State Handling
    if (updatedSession.optedOut || updatedSession.state === 'OPTED_OUT') {
      await this.store.recordOptOut(fromPhone, updatedSession.optOutReason || 'USER_REQUEST', eventId);
    }

    // 7. Durable CSC Caseworker Task Enqueuing
    let createdCscTask: CscDurableTask | undefined;
    const isEscalated =
      updatedSession.state === 'ESCALATED_TO_CSC' ||
      updatedSession.humanHandoff?.isEscalated === true;

    if (isEscalated && !updatedSession.humanHandoff?.durableTaskCreated) {
      const ticketId = updatedSession.humanHandoff?.caseworkerTicketId || `CSC-TKT-${crypto.randomUUID().slice(0, 8)}`;
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${ticketId}:${phoneHash}:${eventId}`)
        .digest('hex');

      createdCscTask = await this.store.enqueueTask({
        ticketId,
        beneficiaryPhoneHash: phoneHash,
        childIdMasked: updatedSession.childIdMasked,
        submissionId: updatedSession.submissionId,
        reason: updatedSession.humanHandoff?.reason || 'AUTOMATED_ESCALATION',
        notes: (updatedSession as any).cscHandoffNotes || 'Beneficiary requested human assistance or document failed review',
        priority: 'HIGH',
        status: 'PENDING_ASSIGNMENT',
        idempotencyKey,
      });

      if (!updatedSession.humanHandoff) {
        updatedSession.humanHandoff = { isEscalated: true };
      }
      updatedSession.humanHandoff.durableTaskCreated = true;
    }

    // 8. Persist Updated Session
    await this.store.saveSession(updatedSession);
    this.processedEvents.add(eventId);

    const isOutboundAllowed = !updatedSession.optedOut && !(await this.store.isOptedOut(fromPhone));

    return {
      eventId,
      status: isEscalated ? 'ESCALATED' : updatedSession.state === 'COMPLETED' ? 'COMPLETED' : 'PROCESSED',
      session: updatedSession,
      responseMessage: isOutboundAllowed ? transitionResult.response?.textMessage : undefined,
      cscTask: createdCscTask,
      isOutboundAllowed,
    };
  }

  private createInitialSession(input: InboundWorkflowInput): BeneficiarySession {
    const phoneHash = PrivacyFilter.hashPhone(input.fromPhone);
    const phoneMasked = PrivacyFilter.maskPhone(input.fromPhone);
    return {
      sessionId: `BEN-SESS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      beneficiaryPhoneHash: phoneHash,
      beneficiaryPhoneMasked: phoneMasked,
      submissionId: input.submissionId,
      childIdMasked: input.childIdMasked,
      state: 'CONSENT_PENDING',
      targetDocType: 'passbookPhoto',
      consentProvided: false,
      contactPermission: false,
      optedOut: false,
      preferredLanguage: input.preferredLanguage || 'mr',
      associatedChildIds: input.associatedChildIds || [input.childIdMasked],
      retryCount: 0,
      maxRetries: 3,
      lastInteractionAt: new Date().toISOString(),
      replacementGuidanceHistory: [],
      unexpectedExplanations: [],
      isEscalated: false,
      humanHandoff: { isEscalated: false, durableTaskCreated: false },
      receivedDocuments: {},
      unresolvedMessages: [],
      reminderState: { remindersSentCount: 0, maxRemindersAllowed: 2 },
    };
  }
}
