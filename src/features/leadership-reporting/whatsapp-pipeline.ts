import crypto from 'crypto';
import { SenderIdentityResolver } from './sender-identity-resolver';
import { LeadershipReportingAgent } from './reporting-agent';
import { WhatsAppFormatter } from './whatsapp-formatter';
import {
  AssistantMessage,
  CallerSecurityContext,
  ReportingSession,
} from './types';
import {
  IReportingSessionRepository,
  InMemoryReportingSessionRepository,
} from './session-repository';

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
  private readonly sessionRepo: IReportingSessionRepository;
  private readonly sessions: Map<string, ReportingSession>;

  constructor(
    senderResolver: SenderIdentityResolver = new SenderIdentityResolver(),
    agent: LeadershipReportingAgent = new LeadershipReportingAgent(),
    formatter: WhatsAppFormatter = new WhatsAppFormatter(),
    sessionRepo?: IReportingSessionRepository
  ) {
    this.senderResolver = senderResolver;
    this.agent = agent;
    this.formatter = formatter;
    this.sessionRepo = sessionRepo || new InMemoryReportingSessionRepository();
    this.sessions = new Map();
  }

  public getSession(userId: string): ReportingSession | undefined {
    return this.sessions.get(userId);
  }

  public async getSessionAsync(userId: string): Promise<ReportingSession | null> {
    const fromRepo = await this.sessionRepo.getSession(userId);
    if (fromRepo) {
      this.sessions.set(userId, fromRepo);
      return fromRepo;
    }
    const mem = this.sessions.get(userId);
    return mem ? { ...mem } : null;
  }

  public setSession(userId: string, session: ReportingSession): void {
    this.sessions.set(userId, session);
    void this.sessionRepo.saveSession(userId, session);
  }

  public getSessionRepo(): IReportingSessionRepository {
    return this.sessionRepo;
  }

  public async handleInboundMessage(
    message: InboundWhatsAppMessage
  ): Promise<WhatsAppPipelineExecutionResult> {
    const correlationId = `corr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // Extract any email address in user text to detect and reject privilege escalation / spoofing
    const emailMatch = message.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const claimedEmail = emailMatch ? emailMatch[0] : undefined;

    // 1. WhatsApp Event -> Sender Identity Resolver (fails closed on unverified phone or email mismatch)
    const senderIdentity = this.senderResolver.resolveSender(message.from, claimedEmail);

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
      // 2. Trusted Identity/Scope -> Reporting Session (Durable repository)
      let session = await this.sessionRepo.getSession(callerScope.userId);
      if (!session) {
        session = this.sessions.get(callerScope.userId) || this.agent.createSession(`sess_wa_${callerScope.userId}`, callerScope);
        await this.sessionRepo.saveSession(callerScope.userId, session);
      }
      this.sessions.set(callerScope.userId, session);

      // 3. Message -> Validated Query / Clarification / Execution (using processQueryAsync)
      const { updatedSession, response } = await this.agent.processQueryAsync(
        session,
        message.text,
        callerScope
      );

      // Update session in durable storage
      await this.sessionRepo.saveSession(callerScope.userId, updatedSession);
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
