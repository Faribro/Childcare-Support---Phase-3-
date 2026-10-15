import { describe, expect, it } from 'vitest';
import {
  SenderIdentityResolver,
  DEFAULT_AUTHORIZED_STAFF_DIRECTORY,
} from '../sender-identity-resolver';
import { LeadershipReportingAgent } from '../reporting-agent';
import {
  SyntheticAuthorizedDataAdapter,
  AppsScriptAuthorizedDataAdapter,
} from '../data-source-adapter';
import { ExportContractService } from '../export-contract-service';
import { WhatsAppFormatter } from '../whatsapp-formatter';
import { WhatsAppReportingPipeline, InboundWhatsAppMessage } from '../whatsapp-pipeline';
import { CallerSecurityContext, SourceFreshness } from '../types';

describe('Leadership Reporting Assistant - WhatsApp Transport & Orchestration Integration', () => {
  const senderResolver = new SenderIdentityResolver(DEFAULT_AUTHORIZED_STAFF_DIRECTORY);
  const formatter = new WhatsAppFormatter();
  const exportService = new ExportContractService();

  // ==========================================================================
  // 1. SENDER IDENTITY RESOLUTION (Connection 1)
  // ==========================================================================
  describe('1. Sender Identity Resolution', () => {
    it('resolves registered national leadership phone to trusted CallerSecurityContext', () => {
      const identity = senderResolver.resolveSender('+919876543210');
      expect(identity.authorized).toBe(true);
      expect(identity.callerScope).toBeDefined();
      expect(identity.callerScope?.userId).toBe('usr_lead_national_01');
      expect(identity.callerScope?.role).toBe('LEADERSHIP');
      expect(identity.callerScope?.permittedStates).toEqual(['*']);
      expect(identity.senderPhoneMasked).toBe('+91 ******3210');
      expect(identity.rawSenderPhoneHash).toHaveLength(64); // SHA-256 hex
      expect(identity.recipientEmailMasked).toBe('d****@allianceindia.org');
    });

    it('resolves state lead with restricted geographic scope', () => {
      const identity = senderResolver.resolveSender('919876543211'); // without plus
      expect(identity.authorized).toBe(true);
      expect(identity.callerScope?.userId).toBe('usr_lead_mh_01');
      expect(identity.callerScope?.role).toBe('STATE_LEAD');
      expect(identity.callerScope?.permittedStates).toEqual(['Maharashtra']);
      expect(identity.senderPhoneMasked).toBe('+91 ******3211');
    });

    it('normalizes various phone formatting styles safely', () => {
      const id1 = senderResolver.resolveSender('+91 98765-43210');
      const id2 = senderResolver.resolveSender('9876543210'); // 10 digit assumed +91
      expect(id1.authorized).toBe(true);
      expect(id2.authorized).toBe(true);
      expect(id1.callerScope?.userId).toBe('usr_lead_national_01');
      expect(id2.callerScope?.userId).toBe('usr_lead_national_01');
    });

    it('fails closed for unauthorized or unlisted phone numbers with privacy-safe notice', () => {
      const unknown = senderResolver.resolveSender('+919999988888');
      expect(unknown.authorized).toBe(false);
      expect(unknown.callerScope).toBeUndefined();
      expect(unknown.denialReason).toContain('UNAUTHORIZED_SENDER');
      expect(unknown.senderPhoneMasked).toBe('+91 ******8888');
      expect(unknown.rawSenderPhoneHash).toHaveLength(64);
    });
  });

  // ==========================================================================
  // 2. GAP CLOSURE: MISSING YEAR / DATE BASIS CLARIFICATION
  // ==========================================================================
  describe('2. Missing Year / Date Basis Clarification Protocol', () => {
    it('prompts for clarification when session policy is unconfirmed and parameters are omitted', () => {
      const agent = new LeadershipReportingAgent();
      const caller: CallerSecurityContext = {
        userId: 'lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
      };

      // Create session with unconfirmed policy
      const session = agent.createSession('sess_unconfirmed_01', caller, {
        isConfirmedPolicy: false,
      });

      const query = 'June single-orphan children in government school';
      const result = agent.processQuery(session, query, caller);

      expect(result.response.intent).toBe('CLARIFICATION_ANSWER');
      expect(result.response.content).toContain('Surveillance Scope Clarification');
      expect(result.response.content).toContain('Calendar Year');
      expect(result.response.content).toContain('Date Accounting Basis');
      expect(result.response.content).toContain("reply 'use defaults'");
      expect(result.updatedSession.pendingClarification).toBeDefined();
      expect(result.updatedSession.pendingClarification?.missingYear).toBe(true);
      expect(result.updatedSession.pendingClarification?.missingDateBasis).toBe(true);
    });

    it('resolves clarification when user provides year and date basis in follow-up turn', () => {
      const agent = new LeadershipReportingAgent();
      const caller: CallerSecurityContext = {
        userId: 'lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
      };

      let session = agent.createSession('sess_unconfirmed_02', caller, {
        isConfirmedPolicy: false,
      });

      // Turn 1: Initial query without year/dateBasis
      const turn1 = agent.processQuery(session, 'June single-orphan children in government school', caller);
      session = turn1.updatedSession;
      expect(session.pendingClarification).not.toBeNull();

      // Turn 2: User clarifies "2026, visit date"
      const turn2 = agent.processQuery(session, '2026, visit date', caller);
      session = turn2.updatedSession;

      expect(turn2.response.intent).toBe('JUNE_ORPHAN_SCHOOL_COHORT');
      expect(turn2.response.content).toContain('Confirmed evaluation calendar');
      expect(turn2.response.content).toContain('Visit-Date Basis');
      expect(turn2.response.content).toContain('Unique Beneficiaries:** **2** children');
      expect(turn2.response.content).toContain('Total Assessments:** **3** assessment events');
      expect(session.confirmedYear).toBe(2026);
      expect(session.confirmedDateBasis).toBe('VISIT_DATE');
      expect(session.isConfirmedPolicy).toBe(true);
      expect(session.pendingClarification).toBeNull();
    });

    it('resolves clarification when user replies "use defaults"', () => {
      const agent = new LeadershipReportingAgent();
      const caller: CallerSecurityContext = {
        userId: 'lead_nat_01',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
      };

      let session = agent.createSession('sess_unconfirmed_03', caller, {
        isConfirmedPolicy: false,
      });

      // Turn 1: Initial query
      const turn1 = agent.processQuery(session, 'June single-orphan children in government school', caller);
      session = turn1.updatedSession;

      // Turn 2: User says "use defaults"
      const turn2 = agent.processQuery(session, 'use defaults', caller);
      session = turn2.updatedSession;

      expect(turn2.response.intent).toBe('JUNE_ORPHAN_SCHOOL_COHORT');
      expect(turn2.response.content).toContain('Year:** **2026**');
      expect(turn2.response.content).toContain('Visit-Date Basis');
      expect(turn2.response.content).toContain('Unique Beneficiaries:** **5** children');
      expect(session.isConfirmedPolicy).toBe(true);
      expect(session.pendingClarification).toBeNull();
    });

    it('calculates immediately if query contains year and date basis explicitly', () => {
      const agent = new LeadershipReportingAgent();
      const caller: CallerSecurityContext = {
        userId: 'lead_nat_01',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
      };

      const session = agent.createSession('sess_explicit_01', caller, {
        isConfirmedPolicy: false,
      });

      const explicitQuery =
        'June 2026 single-orphan children in government school on visit date basis';
      const result = agent.processQuery(session, explicitQuery, caller);

      expect(result.response.intent).toBe('JUNE_ORPHAN_SCHOOL_COHORT');
      expect(result.response.content).toContain('Unique Beneficiaries:** **5** children');
      expect(result.response.content).toContain('Total Assessments:** **6** assessment events');
      expect(result.updatedSession.pendingClarification).toBeNull();
    });
  });

  // ==========================================================================
  // 3. GAP CLOSURE: UNSUPPORTED PHRASING CLARIFICATION (NO SILENT KPIS)
  // ==========================================================================
  describe('3. Unsupported Phrasing Clarification', () => {
    it('returns structured clarification for unrecognized queries instead of silent generic KPIs', () => {
      const agent = new LeadershipReportingAgent();
      const session = agent.createSession('sess_unsupported_01');

      const unsupportedQueries = [
        'what is the weather today in Mumbai?',
        'tell me a funny story',
        'what are the lunch options tomorrow?',
        'unknown query string with no surveillance intent',
      ];

      for (const query of unsupportedQueries) {
        const result = agent.processQuery(session, query);
        expect(result.response.intent).toBe('UNKNOWN_OR_OUT_OF_SCOPE');
        expect(result.response.content).toContain('Unsupported Phrasing / Query Clarification');
        expect(result.response.content).toContain('Supported surveillance requests include');
        expect(result.response.content).not.toContain('National Executive Summary');
        expect(result.response.content).not.toContain('Total Enrolled Children');
      }
    });
  });

  // ==========================================================================
  // 4. GAP CLOSURE: DATA ADAPTER FRESHNESS DERIVATION
  // ==========================================================================
  describe('4. Source Freshness Derived from Data Adapter', () => {
    it('derives source freshness directly from the data adapter metadata', () => {
      const customFreshness: SourceFreshness = {
        lastSyncedAt: '2026-10-15T14:30:00.000Z',
        sourceVersion: 'custom-bridge-v2.0.1',
        recordCount: 11,
        isSynthetic: true,
      };

      const customAdapter = new SyntheticAuthorizedDataAdapter(undefined, undefined, customFreshness);
      const agent = new LeadershipReportingAgent(customAdapter);
      const session = agent.createSession('sess_freshness_01');

      const result = agent.processQuery(
        session,
        'June 2026 single-orphan children in government school on visit date basis'
      );

      expect(result.response.content).toContain(
        '_Data Freshness: Synced 2026-10-15T14:30:00.000Z (custom-bridge-v2.0.1)_'
      );
      // Confirms it did NOT use current runtime timestamp
      expect(result.response.content).not.toContain(new Date().getFullYear() + '-10-15T21');
    });
  });

  // ==========================================================================
  // 5. GAP CLOSURE: TWO-PHASE EXPORT PREVIEW & CONFIRMATION
  // ==========================================================================
  describe('5. Two-Phase Export Contract Service', () => {
    it('executes two-phase export preview, confirmation, and delivery job scheduling', () => {
      const agent = new LeadershipReportingAgent();
      const caller: CallerSecurityContext = {
        userId: 'lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
      };

      let session = agent.createSession('sess_export_01', caller);

      // 1. Establish cohort context
      const turn1 = agent.processQuery(
        session,
        'June 2026 single-orphan children in government school on visit date basis',
        caller
      );
      session = turn1.updatedSession;

      // 2. Request export
      const turn2 = agent.processQuery(session, 'Export report', caller);
      session = turn2.updatedSession;

      expect(turn2.response.intent).toBe('EXPORT_REQUEST');
      expect(turn2.response.content).toContain('SURVEILLANCE EXPORT PREVIEW');
      expect(turn2.response.content).toContain('CONFIRM EXPORT');
      expect(session.pendingExport).toBeDefined();
      expect(session.pendingExport?.reportType).toBe('COHORT_SUMMARY');
      expect(session.pendingExport?.recipientUserId).toBe('lead_mh_01');

      // 3. Confirm export
      const turn3 = agent.processQuery(session, 'CONFIRM EXPORT', caller);
      session = turn3.updatedSession;

      expect(turn3.response.intent).toBe('EXPORT_CONFIRM');
      expect(turn3.response.content).toContain('Export Job Queued');
      expect(turn3.response.content).toContain('job_');
      expect(turn3.response.content).toContain('APPS_SCRIPT_EMAIL_DISPATCHER');
      expect(session.pendingExport).toBeNull();
    });

    it('allows cancelling an export preview', () => {
      const agent = new LeadershipReportingAgent();
      const caller: CallerSecurityContext = {
        userId: 'lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
      };

      let session = agent.createSession('sess_export_cancel_01', caller);

      // Request export
      const turn1 = agent.processQuery(session, 'Export report', caller);
      session = turn1.updatedSession;
      expect(session.pendingExport).toBeDefined();

      // Cancel export
      const turn2 = agent.processQuery(session, 'CANCEL', caller);
      session = turn2.updatedSession;

      expect(turn2.response.intent).toBe('EXPORT_CANCEL');
      expect(turn2.response.content).toContain('Export Cancelled');
      expect(session.pendingExport).toBeNull();
    });

    it('rejects cross-user export confirmation attacks', () => {
      const agent = new LeadershipReportingAgent();
      const legitimateCaller: CallerSecurityContext = {
        userId: 'lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
      };
      const attackerCaller: CallerSecurityContext = {
        userId: 'attacker_user_02',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
      };

      const session = agent.createSession('sess_cross_export_01', legitimateCaller);
      const preview = exportService.createExportPreview(session, legitimateCaller);

      const attackResult = exportService.confirmExportDelivery(preview, attackerCaller, 'CONFIRM EXPORT');
      expect(attackResult.success).toBe(false);
      expect(attackResult.errorReason).toContain('Cross-user export confirmation denied');
      expect(attackResult.job).toBeUndefined();
    });
  });

  // ==========================================================================
  // 6. WHATSAPP TRANSPORT PIPELINE E2E
  // ==========================================================================
  describe('6. Full WhatsApp Pipeline Execution', () => {
    it('executes full inbound WhatsApp text to outbound formatted response', async () => {
      const pipeline = new WhatsAppReportingPipeline(senderResolver);

      const inboundMessage: InboundWhatsAppMessage = {
        from: '+919876543210', // National Director
        messageId: 'wamid.HBgLMTEyMTI3MDU0Mzk2ODU4OAUA',
        timestamp: '1729000000',
        text: 'June 2026 single-orphan children in government school on visit date basis',
      };

      const result = await pipeline.handleInboundMessage(inboundMessage);

      expect(result.status).toBe('SUCCESS');
      expect(result.outboundMessage.to).toBe('+919876543210');
      expect(result.outboundMessage.text.body).toContain('*June 2026 Single-Orphan Government School Cohort*');
      expect(result.outboundMessage.text.body).toContain('🧒 *Unique Beneficiaries:* *5* children');
      expect(result.outboundMessage.text.body).toContain('📋 *Total Assessments:* *6* events');
      expect(result.outboundMessage.text.body).toContain('Data Freshness: Synced 2026-10-15T18:00:00.000Z');

      // Privacy Guarantee: Diagnostic record must NOT contain raw message text or unmasked phone
      expect(result.diagnosticRecord.status).toBe('SUCCESS');
      expect(result.diagnosticRecord.actorRole).toBe('LEADERSHIP');
      expect(result.diagnosticRecord.senderMasked).toBe('+91 ******3210');
      expect((result.diagnosticRecord as any).rawText).toBeUndefined();
      expect((result.diagnosticRecord as any).messageBody).toBeUndefined();
    });

    it('rejects inbound messages from unauthorized senders at the pipeline boundary', async () => {
      const pipeline = new WhatsAppReportingPipeline(senderResolver);

      const inboundUnauthorized: InboundWhatsAppMessage = {
        from: '+919123456789', // Unregistered number
        messageId: 'wamid.HBgLMTEyMTI3MDU0Mzk2ODU4OAUA',
        timestamp: '1729000000',
        text: 'Show national overview',
      };

      const result = await pipeline.handleInboundMessage(inboundUnauthorized);

      expect(result.status).toBe('UNAUTHORIZED');
      expect(result.outboundMessage.to).toBe('+919123456789');
      expect(result.outboundMessage.text.body).toContain('Unauthorized Access');
      expect(result.outboundMessage.text.body).toContain('+91 ******6789');
      expect(result.diagnosticRecord.status).toBe('DENIED');
      expect(result.diagnosticRecord.actorRole).toBe('UNAUTHORIZED');
    });
  });
});
