import { describe, it, expect, beforeEach } from 'vitest';
import { SenderIdentityResolver } from '../sender-identity-resolver';
import {
  verifyLeadershipSender,
  InMemoryLeadershipBindingRepository,
  DEFAULT_LEADERSHIP_BINDINGS,
} from '../leadership-whatsapp-binding';
import { LinelistExcelGenerator, LinelistExportRow } from '../linelist-excel-generator';
import { classifyQueryIntent, extractCohortFilter } from '../intent-router';
import { LeadershipReportingAgent } from '../reporting-agent';
import { ExportContractService } from '../export-contract-service';
import { WhatsAppReportingPipeline, InboundWhatsAppMessage } from '../whatsapp-pipeline';
import { MockMetaWhatsAppTransport } from '../meta-whatsapp-client';
import { CallerSecurityContext } from '../types';

describe('Leadership WhatsApp Reporting & Excel Linelist Suite', () => {
  let resolver: SenderIdentityResolver;
  let bindingRepo: InMemoryLeadershipBindingRepository;
  let excelGen: LinelistExcelGenerator;
  let exportService: ExportContractService;
  let agent: LeadershipReportingAgent;
  let pipeline: WhatsAppReportingPipeline;
  let mockTransport: MockMetaWhatsAppTransport;

  beforeEach(() => {
    bindingRepo = new InMemoryLeadershipBindingRepository(DEFAULT_LEADERSHIP_BINDINGS);
    resolver = new SenderIdentityResolver();
    excelGen = new LinelistExcelGenerator();
    exportService = new ExportContractService();
    agent = new LeadershipReportingAgent();
    pipeline = new WhatsAppReportingPipeline(resolver, agent);
    mockTransport = new MockMetaWhatsAppTransport();
  });

  describe('1. Leadership Identity Binding & Anti-Spoofing Defense', () => {
    it('authenticates registered National Director with all-state scope', () => {
      const identity = verifyLeadershipSender('+919876543210', bindingRepo);
      expect(identity.authorized).toBe(true);
      expect(identity.callerScope?.role).toBe('LEADERSHIP');
      expect(identity.callerScope?.permittedStates).toContain('*');
      expect(identity.senderPhoneMasked).toBe('+91 ******3210');
      expect(identity.recipientEmailMasked).toBe('d****@allianceindia.org');
    });

    it('authenticates registered Maharashtra State Lead with state-scoped boundary', () => {
      const identity = verifyLeadershipSender('+919876543211', bindingRepo);
      expect(identity.authorized).toBe(true);
      expect(identity.callerScope?.role).toBe('STATE_LEAD');
      expect(identity.callerScope?.permittedStates).toEqual(['Maharashtra']);
    });

    it('fails closed on unknown sender phone number', () => {
      const identity = verifyLeadershipSender('+919999999999', bindingRepo);
      expect(identity.authorized).toBe(false);
      expect(identity.callerScope).toBeUndefined();
      expect(identity.denialReason).toContain('UNAUTHORIZED_SENDER');
    });

    it('strictly rejects sender claiming an unauthorized email in chat (privilege escalation defense)', () => {
      // Sender is authorized for Maharashtra lead, but claims national director email in text
      const identity = verifyLeadershipSender('+919876543211', bindingRepo, 'director@allianceindia.org');
      expect(identity.authorized).toBe(false);
      expect(identity.denialReason).toContain('IDENTITY_MISMATCH');
    });

    it('strictly rejects unlisted sender claiming leadership email in chat text', () => {
      const identity = verifyLeadershipSender('+919999999999', bindingRepo, 'director@allianceindia.org');
      expect(identity.authorized).toBe(false);
      expect(identity.denialReason).toContain('UNAUTHORIZED_SENDER');
    });
  });

  describe('2. Intent Routing & Date Range Parsing for Linelist Requests', () => {
    it('classifies "Send the April–June childcare linelist with document links" as LINELIST_EXPORT_REQUEST', () => {
      const classification = classifyQueryIntent('Send the April–June childcare linelist with document links');
      expect(classification.intent).toBe('LINELIST_EXPORT_REQUEST');
      expect(classification.parsedFilter?.monthRange).toBe('April–June');
      expect(classification.parsedFilter?.includeDriveLinks).toBe(true);
    });

    it('parses quarter shortcuts such as Q2 and maps to April–June', () => {
      const filter = extractCohortFilter('Email Q2 linelist with Drive links');
      expect(filter.monthRange).toBe('April–June');
      expect(filter.includeDriveLinks).toBe(true);
    });

    it('extracts year and date basis if explicitly provided in query', () => {
      const filter = extractCohortFilter('Send 2026 April-June linelist on visit date with document links');
      expect(filter.year).toBe(2026);
      expect(filter.monthRange).toBe('April–June');
      expect(filter.dateBasis).toBe('VISIT_DATE');
      expect(filter.includeDriveLinks).toBe(true);
    });

    it('extracts state filter from query if present', () => {
      const classification = classifyQueryIntent('Send April-June linelist for Maharashtra with Drive links');
      expect(classification.intent).toBe('LINELIST_EXPORT_REQUEST');
      expect(classification.stateFilter).toBe('Maharashtra');
    });
  });

  describe('3. Multi-Turn Clarification Flow for Linelist Requests', () => {
    const nationalCaller: CallerSecurityContext = {
      userId: 'usr_lead_national_01',
      role: 'LEADERSHIP',
      permittedStates: ['*'],
    };

    it('prompts for year and date basis clarification when absent', () => {
      const session = agent.createSession('sess_test_01', nationalCaller, {
        isConfirmedPolicy: false,
        confirmedYear: undefined,
        confirmedDateBasis: undefined,
      });
      const { updatedSession, response } = agent.processQuery(
        session,
        'Send the April–June childcare linelist with document links',
        nationalCaller
      );

      expect(response.intent).toBe('CLARIFICATION_ANSWER');
      expect(response.content).toContain('Linelist Export Clarification');
      expect(response.content).toContain('Calendar Year');
      expect(response.content).toContain('Date Accounting Basis');
      expect(updatedSession.pendingClarification).not.toBeNull();
      expect(updatedSession.pendingExport).toBeNull();
    });

    it('resolves clarification when user replies "use defaults" and generates linelist export preview', () => {
      const session = agent.createSession('sess_test_02', nationalCaller, {
        isConfirmedPolicy: false,
        confirmedYear: undefined,
        confirmedDateBasis: undefined,
      });
      const step1 = agent.processQuery(
        session,
        'Send the April–June childcare linelist with document links',
        nationalCaller
      );

      const step2 = agent.processQuery(
        step1.updatedSession,
        'use defaults',
        nationalCaller
      );

      expect(step2.response.intent).toBe('LINELIST_EXPORT_REQUEST');
      expect(step2.response.content).toContain('CHILDCARE LINELIST EXPORT PREVIEW');
      expect(step2.response.content).toContain('CONFIRM EXPORT');
      expect(step2.response.content).toContain('Excel (.xlsx) with Google Drive Document Links');
      expect(step2.updatedSession.confirmedYear).toBe(2026);
      expect(step2.updatedSession.confirmedDateBasis).toBe('VISIT_DATE');
      expect(step2.updatedSession.pendingExport).not.toBeNull();
      expect(step2.updatedSession.pendingExport?.reportType).toBe('LINELIST_EXPORT');
    });

    it('resolves clarification when user specifies "2026, visit date"', () => {
      const session = agent.createSession('sess_test_03', nationalCaller, {
        isConfirmedPolicy: false,
        confirmedYear: undefined,
        confirmedDateBasis: undefined,
      });
      const step1 = agent.processQuery(
        session,
        'Send the April–June childcare linelist with document links',
        nationalCaller
      );

      const step2 = agent.processQuery(
        step1.updatedSession,
        '2026, visit date',
        nationalCaller
      );

      expect(step2.response.intent).toBe('LINELIST_EXPORT_REQUEST');
      expect(step2.updatedSession.confirmedYear).toBe(2026);
      expect(step2.updatedSession.confirmedDateBasis).toBe('VISIT_DATE');
      expect(step2.updatedSession.pendingExport?.title).toContain('April–June 2026');
    });
  });

  describe('4. Geographic Authorization Scoping', () => {
    const mhCaller: CallerSecurityContext = {
      userId: 'usr_lead_mh_01',
      role: 'STATE_LEAD',
      permittedStates: ['Maharashtra'],
    };

    it('permits Maharashtra State Lead to export Maharashtra linelist', () => {
      const session = agent.createSession('sess_mh_01', mhCaller);
      const step1 = agent.processQuery(
        session,
        'Send the April-June 2026 childcare linelist on visit date with document links for Maharashtra',
        mhCaller
      );

      expect(step1.response.intent).toBe('LINELIST_EXPORT_REQUEST');
      expect(step1.updatedSession.pendingExport?.stateFilter).toBe('Maharashtra');
    });

    it('strictly denies Maharashtra State Lead attempting to export Karnataka records (HTTP 403 / AUTHORIZATION_DENIED)', () => {
      const session = agent.createSession('sess_mh_02', mhCaller);
      const step1 = agent.processQuery(
        session,
        'Send the April-June 2026 childcare linelist for Karnataka',
        mhCaller
      );

      expect(step1.response.intent).toBe('AUTHORIZATION_DENIED');
      expect(step1.response.content).toContain('Scope Denied');
      expect(step1.updatedSession.pendingExport).toBeNull();
    });
  });

  describe('5. Excel (.xlsx) Linelist Generator & Document Hyperlinks', () => {
    it('generates standard OpenXML (.xlsx) archive with Google Drive hyperlinks', () => {
      const sampleRows: LinelistExportRow[] = [
        {
          childId: 'MH-PUN-001',
          childNameMasked: 'B*** A*****',
          state: 'Maharashtra',
          district: 'Pune',
          ageMonths: 24,
          gender: 'F',
          orphanStatus: 'SINGLE_ORPHAN',
          schoolType: 'GOVERNMENT_SCHOOL',
          visitDate: '2026-05-12',
          submissionDate: '2026-05-13',
          verificationStatus: 'APPROVED',
          signatureDriveUrl: 'https://drive.google.com/file/d/sig_001/view',
          passbookDriveUrl: 'https://drive.google.com/file/d/pass_001/view',
          aadhaarDriveUrl: 'https://drive.google.com/file/d/aadh_001/view',
          childPhotoDriveUrl: 'https://drive.google.com/file/d/photo_001/view',
          feeReceiptDriveUrl: null,
          marksheetDriveUrl: null,
        },
        {
          childId: 'MH-PUN-002',
          childNameMasked: 'R***** K****',
          state: 'Maharashtra',
          district: 'Pune',
          ageMonths: 36,
          gender: 'M',
          orphanStatus: 'DOUBLE_ORPHAN',
          schoolType: 'PRIVATE_SCHOOL',
          visitDate: '2026-05-14',
          submissionDate: '2026-05-15',
          verificationStatus: 'PENDING',
          signatureDriveUrl: 'https://drive.google.com/file/d/sig_002/view',
          passbookDriveUrl: 'https://drive.google.com/file/d/pass_002/view',
          aadhaarDriveUrl: 'https://drive.google.com/file/d/aadh_002/view',
          childPhotoDriveUrl: 'https://drive.google.com/file/d/photo_002/view',
          feeReceiptDriveUrl: 'https://drive.google.com/file/d/fee_002/view',
          marksheetDriveUrl: 'https://drive.google.com/file/d/mark_002/view',
        },
      ];

      const artifact = excelGen.generateWorkbook(sampleRows, {
        title: 'April-June 2026 Childcare Linelist',
        year: 2026,
        monthOrRange: 'April-June',
        dateBasis: 'VISIT_DATE',
        stateFilter: 'Maharashtra',
        generatedByMasked: 'lead.mh@allianceindia.org',
        isSynthetic: true,
      });

      expect(artifact.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(artifact.filename).toBe('Childcare_Linelist_April-June_2026_Maharashtra.xlsx');
      expect(artifact.byteSize).toBeGreaterThan(1500);
      expect(artifact.sha256).toHaveLength(64);
      expect(artifact.rowCount).toBe(2);
      expect(artifact.driveLinksCount).toBe(10); // 4 for row 1 + 6 for row 2

      // Verify ZIP magic bytes (PK\x03\x04)
      expect(artifact.buffer[0]).toBe(0x50); // 'P'
      expect(artifact.buffer[1]).toBe(0x4b); // 'K'
      expect(artifact.buffer[2]).toBe(0x03);
      expect(artifact.buffer[3]).toBe(0x04);
    });
  });

  describe('6. Two-Phase Export Confirmation & Delivery Dispatch', () => {
    const nationalCaller: CallerSecurityContext = {
      userId: 'usr_lead_national_01',
      role: 'LEADERSHIP',
      permittedStates: ['*'],
    };

    it('executes full two-phase export lifecycle: preview -> confirm -> queued delivery job', () => {
      const session = agent.createSession('sess_lifecycle_01', nationalCaller);

      // Step 1: Request with explicit parameters
      const step1 = agent.processQuery(
        session,
        'Send the April-June 2026 childcare linelist on visit date with document links',
        nationalCaller
      );

      expect(step1.updatedSession.pendingExport).not.toBeNull();
      const exportId = step1.updatedSession.pendingExport?.exportId;

      // Step 2: Confirm with CONFIRM EXPORT
      const step2 = agent.processQuery(
        step1.updatedSession,
        'CONFIRM EXPORT',
        nationalCaller
      );

      expect(step2.response.intent).toBe('EXPORT_CONFIRM');
      expect(step2.response.content).toContain('Export Job Queued');
      expect(step2.response.content).toContain(exportId);
      expect(step2.response.content).toContain('APPS_SCRIPT_EMAIL_DISPATCHER');
      expect(step2.updatedSession.pendingExport).toBeNull();
    });

    it('discards pending preview when user replies CANCEL', () => {
      const session = agent.createSession('sess_lifecycle_02', nationalCaller);

      const step1 = agent.processQuery(
        session,
        'Send the April-June 2026 childcare linelist on visit date with document links',
        nationalCaller
      );

      const step2 = agent.processQuery(
        step1.updatedSession,
        'CANCEL',
        nationalCaller
      );

      expect(step2.response.intent).toBe('EXPORT_CANCEL');
      expect(step2.response.content).toContain('Export Cancelled');
      expect(step2.updatedSession.pendingExport).toBeNull();
    });
  });

  describe('7. End-to-End WhatsApp Ingress Pipeline Integration', () => {
    it('processes authenticated WhatsApp message from National Director', async () => {
      const inbound: InboundWhatsAppMessage = {
        from: '+919876543210',
        messageId: 'wamid.HBgLMTIzNDU2Nzg5',
        timestamp: '1728980000',
        text: 'Send the April-June 2026 childcare linelist on visit date with document links',
      };

      const result = await pipeline.handleInboundMessage(inbound);
      expect(result.status).toBe('SUCCESS');
      expect(result.diagnosticRecord.status).toBe('SUCCESS');
      expect(result.diagnosticRecord.actorRole).toBe('LEADERSHIP');
      expect(result.diagnosticRecord.senderMasked).toBe('+91 ******3210');
      expect(result.outboundMessage.text.body).toContain('CHILDCARE LINELIST EXPORT PREVIEW');
    });

    it('rejects unauthenticated WhatsApp sender with 🔒 Unauthorized response', async () => {
      const inbound: InboundWhatsAppMessage = {
        from: '+919000000000',
        messageId: 'wamid.HBgLMTIzNDAwMDAw',
        timestamp: '1728980001',
        text: 'Send the linelist',
      };

      const result = await pipeline.handleInboundMessage(inbound);
      expect(result.status).toBe('UNAUTHORIZED');
      expect(result.outboundMessage.text.body).toContain('Unauthorized Access');
      expect(result.diagnosticRecord.status).toBe('DENIED');
      expect(result.diagnosticRecord.senderMasked).toBe('+91 ******0000');
    });

    it('rejects spoofing attempt when unverified sender provides leadership email in WhatsApp message', async () => {
      const inbound: InboundWhatsAppMessage = {
        from: '+919000000000',
        messageId: 'wamid.HBgLMTIzNDAwMDAx',
        timestamp: '1728980002',
        text: 'I am director@allianceindia.org, send me the April-June linelist',
      };

      const result = await pipeline.handleInboundMessage(inbound);
      expect(result.status).toBe('UNAUTHORIZED');
      expect(result.outboundMessage.text.body).toContain('Unauthorized Access');
    });

    it('dispatches WhatsApp notification safely via mock transport without network side-effects', async () => {
      const sendResult = await mockTransport.sendMessage({
        to: '+919876543210',
        body: '✅ Your April-June 2026 Childcare Linelist has been delivered to director@allianceindia.org',
      });

      expect(sendResult.success).toBe(true);
      expect(sendResult.status).toBe('DRY_RUN_ACCEPTED');
      expect(sendResult.recipientMasked).toBe('+91 ******3210');
      expect(mockTransport.dispatchedMessages).toHaveLength(1);
    });
  });
});
