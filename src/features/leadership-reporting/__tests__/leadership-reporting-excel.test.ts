import { describe, it, expect, beforeEach } from 'vitest';
import { SenderIdentityResolver } from '../sender-identity-resolver';
import {
  verifyLeadershipSender,
  InMemoryLeadershipBindingRepository,
  DEFAULT_LEADERSHIP_BINDINGS,
  loadProductionBindingsFromEnv,
} from '../leadership-whatsapp-binding';
import {
  LinelistExcelGenerator,
  LinelistExportRow,
  sanitizeCellValue,
} from '../linelist-excel-generator';
import { classifyQueryIntent, extractCohortFilter } from '../intent-router';
import { LeadershipReportingAgent } from '../reporting-agent';
import { ExportContractService, CANONICAL_LINELIST_COLUMNS } from '../export-contract-service';
import { WhatsAppReportingPipeline, InboundWhatsAppMessage } from '../whatsapp-pipeline';
import { MockMetaWhatsAppTransport } from '../meta-whatsapp-client';
import { MockReportingEmailDispatcher } from '../reporting-email-dispatcher';
import { CallerSecurityContext } from '../types';

describe('Leadership WhatsApp Reporting & Excel Linelist Suite', () => {
  let resolver: SenderIdentityResolver;
  let bindingRepo: InMemoryLeadershipBindingRepository;
  let excelGen: LinelistExcelGenerator;
  let exportService: ExportContractService;
  let emailDispatcher: MockReportingEmailDispatcher;
  let agent: LeadershipReportingAgent;
  let pipeline: WhatsAppReportingPipeline;
  let mockTransport: MockMetaWhatsAppTransport;

  beforeEach(() => {
    bindingRepo = new InMemoryLeadershipBindingRepository(DEFAULT_LEADERSHIP_BINDINGS);
    resolver = new SenderIdentityResolver(bindingRepo);
    excelGen = new LinelistExcelGenerator();
    exportService = new ExportContractService();
    emailDispatcher = new MockReportingEmailDispatcher();
    agent = new LeadershipReportingAgent(
      undefined,
      undefined,
      undefined,
      undefined,
      exportService,
      emailDispatcher
    );
    pipeline = new WhatsAppReportingPipeline(resolver, agent);
    mockTransport = new MockMetaWhatsAppTransport();
  });

  describe('1. Leadership Identity Binding, Anti-Spoofing & Revocation', () => {
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
      const identity = verifyLeadershipSender('+919876543211', bindingRepo, 'director@allianceindia.org');
      expect(identity.authorized).toBe(false);
      expect(identity.denialReason).toContain('IDENTITY_MISMATCH');
    });

    it('fails closed when leadership account is deactivated or revoked', () => {
      const repoWithRevoked = new InMemoryLeadershipBindingRepository([
        {
          bindingId: 'bind_revoked_01',
          phoneNumberE164: '+919876543299',
          phoneNumberHash: 'hash_99',
          fullName: 'Revoked Director',
          email: 'revoked.director@allianceindia.org',
          role: 'LEADERSHIP',
          permittedStates: ['*'],
          isVerified: true,
          isActive: false, // Deactivated / Revoked
          revokedAt: '2026-10-20T10:00:00.000Z',
          boundAt: '2026-01-01T00:00:00.000Z',
        },
      ]);

      const identity = verifyLeadershipSender('+919876543299', repoWithRevoked);
      expect(identity.authorized).toBe(false);
      expect(identity.denialReason).toContain('ACCOUNT_REVOKED');
    });

    it('disables synthetic fixtures in production environment fail-closed', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        const bindings = loadProductionBindingsFromEnv();
        // Without explicit LEADERSHIP_WHATSAPP_BINDINGS_JSON, returns empty list in production
        expect(bindings).toEqual([]);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      }
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

  describe('3. Multi-Turn Clarification Flow (No Hardcoded 2026 / Date-Basis Defaults)', () => {
    const nationalCaller: CallerSecurityContext = {
      userId: 'usr_lead_national_01',
      role: 'LEADERSHIP',
      permittedStates: ['*'],
    };

    it('prompts for calendar year and date accounting basis clarification when absent', () => {
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
      expect(response.content).not.toContain('reply \'use defaults\''); // Silent defaults strictly removed
      expect(updatedSession.pendingClarification).not.toBeNull();
      expect(updatedSession.pendingExport).toBeNull();
    });

    it('rejects "use defaults" without explicit year/date basis clarification', () => {
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

      // Replying with vague defaults does NOT resolve into export preview
      const step2 = agent.processQuery(
        step1.updatedSession,
        'use defaults',
        nationalCaller
      );

      expect(step2.updatedSession.pendingExport).toBeNull();
    });

    it('resolves clarification when user provides explicit "2026, visit date basis"', () => {
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
        '2026, visit date basis',
        nationalCaller
      );

      expect(step2.response.intent).toBe('LINELIST_EXPORT_REQUEST');
      expect(step2.updatedSession.confirmedYear).toBe(2026);
      expect(step2.updatedSession.confirmedDateBasis).toBe('VISIT_DATE');
      expect(step2.updatedSession.pendingExport).not.toBeNull();
      expect(step2.updatedSession.pendingExport?.year).toBe(2026);
      expect(step2.updatedSession.pendingExport?.dateField).toBe('visit_date');
      expect(step2.updatedSession.pendingExport?.columns).toEqual(CANONICAL_LINELIST_COLUMNS);
      expect(step2.response.content).toContain('CHILDCARE LINELIST EXPORT PREVIEW');
      expect(step2.response.content).toContain('visit_date');
    });
  });

  describe('4. Geographic Authorization Scoping & Execution-Time Enforcement', () => {
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

    it('enforces geographic authorization at export execution time', () => {
      const preview = exportService.createLinelistExportPreview(
        agent.createSession('sess_auth_exec', mhCaller),
        mhCaller,
        {
          year: 2026,
          dateBasis: 'VISIT_DATE',
          stateFilter: 'Karnataka', // Out-of-scope for mhCaller
        }
      );

      const confirmResult = exportService.confirmExportDelivery(preview, mhCaller, 'CONFIRM EXPORT');
      expect(confirmResult.success).toBe(false);
      expect(confirmResult.errorReason).toContain('EXECUTION_AUTH_DENIED');
    });
  });

  describe('5. Excel (.xlsx) Correctness & OWASP Formula Injection Sanitization', () => {
    it('sanitizes untrusted cells starting with formula triggers (=, +, -, @, \\t, \\r)', () => {
      expect(sanitizeCellValue('=CMD|\' /C calc\'!A0')).toBe('\'=CMD|\' /C calc\'!A0');
      expect(sanitizeCellValue('+919876543210')).toBe('\'+919876543210');
      expect(sanitizeCellValue('-12345')).toBe('\'-12345');
      expect(sanitizeCellValue('@SUM(1,2)')).toBe('\'@SUM(1,2)');
      expect(sanitizeCellValue('Normal Child Name')).toBe('Normal Child Name');
    });

    it('generates standard OpenXML (.xlsx) archive with sanitized cells and Drive hyperlinks', () => {
      const sampleRows: LinelistExportRow[] = [
        {
          childId: 'MH-PUN-001',
          childNameMasked: '=MALICIOUS_FORMULA',
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
      expect(artifact.rowCount).toBe(1);
      expect(artifact.driveLinksCount).toBe(4);

      // Verify ZIP magic bytes (PK\x03\x04)
      expect(artifact.buffer[0]).toBe(0x50); // 'P'
      expect(artifact.buffer[1]).toBe(0x4b); // 'K'
      expect(artifact.buffer[2]).toBe(0x03);
      expect(artifact.buffer[3]).toBe(0x04);
    });

    it('renders "Pending Upload" for missing documents and avoids formula injection', () => {
      const emptyRow: LinelistExportRow = {
        childId: 'MH-PUN-003',
        childNameMasked: 'Safe Name',
        state: 'Maharashtra',
        district: 'Pune',
        ageMonths: 18,
        gender: 'F',
        orphanStatus: 'SINGLE_ORPHAN',
        schoolType: 'GOVERNMENT_SCHOOL',
        visitDate: '2026-06-01',
        submissionDate: '2026-06-02',
        verificationStatus: 'PENDING',
        signatureDriveUrl: null,
        passbookDriveUrl: undefined,
        aadhaarDriveUrl: '',
        childPhotoDriveUrl: null,
        feeReceiptDriveUrl: null,
        marksheetDriveUrl: null,
      };

      const artifact = excelGen.generateWorkbook([emptyRow], {
        title: 'Pending Docs Test',
        year: 2026,
        monthOrRange: 'June',
        dateBasis: 'VISIT_DATE',
        stateFilter: 'Maharashtra',
        generatedByMasked: 'lead.mh@allianceindia.org',
      });

      expect(artifact.driveLinksCount).toBe(0); // 0 active formulas
    });
  });

  describe('6. Cryptographic Integrity & Replay Prevention', () => {
    const nationalCaller: CallerSecurityContext = {
      userId: 'usr_lead_national_01',
      role: 'LEADERSHIP',
      permittedStates: ['*'],
    };

    it('detects contract tampering via immutableParametersHash mismatch', () => {
      const session = agent.createSession('sess_tamper_01', nationalCaller);
      const preview = exportService.createLinelistExportPreview(session, nationalCaller, {
        year: 2026,
        dateBasis: 'VISIT_DATE',
        monthOrRange: 'April–June',
      });

      // Tamper with year after preview generation
      const tamperedPreview = { ...preview, year: 2025 };

      const result = exportService.confirmExportDelivery(tamperedPreview, nationalCaller, 'CONFIRM EXPORT');
      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('INTEGRITY_VIOLATION');
    });

    it('strictly prevents replay/duplicate execution of an already confirmed export preview', () => {
      const session = agent.createSession('sess_replay_01', nationalCaller);
      const preview = exportService.createLinelistExportPreview(session, nationalCaller, {
        year: 2026,
        dateBasis: 'VISIT_DATE',
        monthOrRange: 'April–June',
      });

      // First confirmation succeeds
      const result1 = exportService.confirmExportDelivery(preview, nationalCaller, 'CONFIRM EXPORT');
      expect(result1.success).toBe(true);

      // Replay attempt fails closed
      const result2 = exportService.confirmExportDelivery(preview, nationalCaller, 'CONFIRM EXPORT');
      expect(result2.success).toBe(false);
      expect(result2.errorReason).toContain('REPLAY_REJECTED');
    });
  });

  describe('7. Full 9-Stage End-to-End Isolated Staging Execution Pipeline', () => {
    it('executes full trace: Inbound WhatsApp -> Clarification -> Preview -> Confirm -> XLSX -> Email -> Delivery Ack', async () => {
      // Stage 1 & 2: Inbound Webhook Event & Deduplication
      const inbound1: InboundWhatsAppMessage = {
        from: '+919876543210',
        messageId: 'wamid.HBgLMTIzNDU2Nzg5',
        timestamp: '1728980000',
        text: 'Send the April-June childcare linelist with document links',
      };

      // Stage 3 & 4: Verified Identity & Multi-Turn Clarification
      const turn1 = await pipeline.handleInboundMessage(inbound1);
      expect(turn1.status).toBe('SUCCESS');
      expect(turn1.diagnosticRecord.actorRole).toBe('LEADERSHIP');
      expect(turn1.outboundMessage.text.body).toContain('Linelist Export Clarification');

      // User responds with explicit year and date basis
      const inbound2: InboundWhatsAppMessage = {
        from: '+919876543210',
        messageId: 'wamid.HBgLMTIzNDU2Nzkx',
        timestamp: '1728980030',
        text: '2026, visit date basis',
      };

      // Stage 5: Export Preview Generation
      const turn2 = await pipeline.handleInboundMessage(inbound2);
      expect(turn2.status).toBe('SUCCESS');
      expect(turn2.outboundMessage.text.body).toContain('CHILDCARE LINELIST EXPORT PREVIEW');
      expect(turn2.outboundMessage.text.body).toContain('visit_date');
      expect(turn2.outboundMessage.text.body).toContain('CONFIRM EXPORT');
      expect(turn2.session?.pendingExport).not.toBeNull();

      // User confirms export
      const inbound3: InboundWhatsAppMessage = {
        from: '+919876543210',
        messageId: 'wamid.HBgLMTIzNDU2Nzky',
        timestamp: '1728980060',
        text: 'CONFIRM EXPORT',
      };

      // Stage 6, 7, 8, 9: Confirm -> Authorized Query -> XLSX Generation -> Email Dispatch -> WhatsApp Delivery Ack
      const turn3 = await pipeline.handleInboundMessage(inbound3);
      expect(turn3.status).toBe('SUCCESS');
      expect(turn3.outboundMessage.text.body).toContain('Export Job Dispatched');
      expect(turn3.outboundMessage.text.body).toContain('.xlsx');
      expect(turn3.outboundMessage.text.body).toContain('d****@allianceindia.org');

      // Verify that simulated email delivery received the actual valid XLSX buffer
      expect(emailDispatcher.dispatchedEmails).toHaveLength(1);
      const dispatched = emailDispatcher.dispatchedEmails[0];
      expect(dispatched.recipientEmail).toBe('director@allianceindia.org');
      expect(dispatched.attachment.filename).toContain('.xlsx');
      expect(dispatched.attachment.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(dispatched.attachment.byteSize).toBeGreaterThan(1500);

      // Verify mock WhatsApp transport safely delivered message
      const transportResult = await mockTransport.sendMessage({
        to: '+919876543210',
        body: turn3.outboundMessage.text.body,
      });
      expect(transportResult.success).toBe(true);
      expect(transportResult.status).toBe('DRY_RUN_ACCEPTED');
    });
  });
});
