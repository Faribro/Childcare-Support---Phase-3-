import crypto from 'crypto';
import { SenderIdentityResolver } from './sender-identity-resolver';
import { LeadershipReportingAgent } from './reporting-agent';
import { WhatsAppFormatter } from './whatsapp-formatter';
import {
  AssistantMessage,
  CallerSecurityContext,
  ReportingSession,
} from './types';

export interface InboundWhatsAppMessage {
  readonly from: string; // E.164 phone string
  readonly messageId: string; // Meta message ID (wamid)
  readonly timestamp: string;
  readonly text: string;
}

export interface OutboundWhatsAppMessage {
  readonly messaging_product: 'whatsapp';
  readonly recipient_type: 'individual';
  readonly to: string;
  readonly type: 'text';
  readonly text: {
    readonly body: string;
  };
}

export interface PipelineDiagnosticRecord {
  readonly correlationId: string;
  readonly timestamp: string;
  readonly eventType: 'REPORTING_QUERY' | 'UNAUTHORIZED_SENDER' | 'PIPELINE_ERROR';
  readonly senderHash: string;
  readonly senderMasked: string;
  readonly actorRole: string;
  readonly intent?: string;
  readonly status: 'SUCCESS' | 'DENIED' | 'ERROR';
}

export interface WhatsAppPipelineExecutionResult {
  readonly status: 'SUCCESS' | 'UNAUTHORIZED' | 'ERROR';
  readonly outboundMessage: OutboundWhatsAppMessage;
  readonly responseMessage?: AssistantMessage;
  readonly diagnosticRecord: PipelineDiagnosticRecord;
  readonly session?: ReportingSession;
}

/**
 * WhatsApp Reporting Pipeline
 * 
 * Orchestrates the full lifecycle:
 * 1. Incoming Meta WhatsApp message -> SenderIdentityResolver
 * 2. Authenticated CallerSecurityContext -> ReportingSession lookup/creation
 * 3. Message text -> LeadershipReportingAgent query processing
 * 4. Agent tool result -> WhatsAppFormatter concise message
 * 5. Outbound WhatsApp message payload preparation
 * 6. Privacy-preserving diagnostic logging (no raw message text, no unmasked phone numbers)
 */
export class WhatsAppReportingPipeline {
  private readonly senderResolver: SenderIdentityResolver;
  private readonly agent: LeadershipReportingAgent;
  private readonly formatter: WhatsAppFormatter;
  private readonly sessions: Map<string, ReportingSession>;

  constructor(
    senderResolver: SenderIdentityResolver = new SenderIdentityResolver(),
    agent: LeadershipReportingAgent = new LeadershipReportingAgent(),
    formatter: WhatsAppFormatter = new WhatsAppFormatter()
  ) {
    this.senderResolver = senderResolver;
    this.agent = agent;
    this.formatter = formatter;
    this.sessions = new Map();
  }

  public getSession(userId: string): ReportingSession | undefined {
    return this.sessions.get(userId);
  }

  public setSession(userId: string, session: ReportingSession): void {
    this.sessions.set(userId, session);
  }

  public async handleInboundMessage(
    message: InboundWhatsAppMessage
  ): Promise<WhatsAppPipelineExecutionResult> {
    const correlationId = `corr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // 1. WhatsApp Event -> Sender Identity Resolver
    const senderIdentity = this.senderResolver.resolveSender(message.from);

    if (!senderIdentity.authorized || !senderIdentity.callerScope) {
      const denialText =
        `🔒 *Unauthorized Access*\n\n` +
        `Your phone number (${senderIdentity.senderPhoneMasked}) is not authorized for Leadership Surveillance access.\n` +
        `All surveillance queries fail-closed for data protection.\n\n` +
        `If you are an authorized team member, please contact the system administrator.`;

      const diagnosticRecord: PipelineDiagnosticRecord = {
        correlationId,
        timestamp,
        eventType: 'UNAUTHORIZED_SENDER',
        senderHash: senderIdentity.rawSenderPhoneHash,
        senderMasked: senderIdentity.senderPhoneMasked,
        actorRole: 'UNAUTHORIZED',
        status: 'DENIED',
      };

      return {
        status: 'UNAUTHORIZED',
        outboundMessage: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.from,
          type: 'text',
          text: { body: denialText },
        },
        diagnosticRecord,
      };
    }

    const callerScope: CallerSecurityContext = senderIdentity.callerScope;

    try {
      // 2. Trusted Identity/Scope -> Reporting Session
      let session = this.sessions.get(callerScope.userId);
      if (!session) {
        session = this.agent.createSession(`sess_wa_${callerScope.userId}`, callerScope);
        this.sessions.set(callerScope.userId, session);
      }

      // 3. Message -> Validated Query / Clarification / Execution
      const { updatedSession, response } = this.agent.processQuery(
        session,
        message.text,
        callerScope
      );

      // Update session in storage
      this.sessions.set(callerScope.userId, updatedSession);

      // 4. Tool Result -> Concise WhatsApp Response
      let whatsappText: string;
      if (response.structuredData?.cohortMetrics) {
        whatsappText = this.formatter.formatCohortSummary(
          response.structuredData.cohortMetrics as any
        );
      } else {
        whatsappText = this.formatter.markdownToWhatsApp(response.content);
      }

      // 5. Build Outbound WhatsApp Payload
      const outboundMessage: OutboundWhatsAppMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: message.from,
        type: 'text',
        text: { body: whatsappText },
      };

      // 6. Privacy-preserving diagnostic logging
      const diagnosticRecord: PipelineDiagnosticRecord = {
        correlationId,
        timestamp,
        eventType: 'REPORTING_QUERY',
        senderHash: senderIdentity.rawSenderPhoneHash,
        senderMasked: senderIdentity.senderPhoneMasked,
        actorRole: callerScope.role,
        intent: response.intent,
        status: 'SUCCESS',
      };

      return {
        status: 'SUCCESS',
        outboundMessage,
        responseMessage: response,
        diagnosticRecord,
        session: updatedSession,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown pipeline error';
      const diagnosticRecord: PipelineDiagnosticRecord = {
        correlationId,
        timestamp,
        eventType: 'PIPELINE_ERROR',
        senderHash: senderIdentity.rawSenderPhoneHash,
        senderMasked: senderIdentity.senderPhoneMasked,
        actorRole: callerScope.role,
        status: 'ERROR',
      };

      return {
        status: 'ERROR',
        outboundMessage: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.from,
          type: 'text',
          text: {
            body: `⚠️ *Service Error*\n\nAn error occurred while evaluating your surveillance query: ${errorMessage}`,
          },
        },
        diagnosticRecord,
      };
    }
  }
}
