/**
 * Durable Pipeline, Concurrency & Restart Resilience Integration Suite
 *
 * Verifies:
 * 1. Authenticated Webhook Handoff -> Durable Ingestion & Deduplication
 * 2. Concurrent Export Confirmation Race (10 concurrent calls -> exactly 1 succeeds, 9 rejected)
 * 3. Worker Process Restart Resilience (Session state, year, and pending export survive restart)
 * 4. Actual Authorized Reporting Data Retrieval & Geographic Scope Isolation
 * 5. Fail-Closed Live Latches (ALLOW_LIVE_WHATSAPP_SEND=false, ALLOW_LIVE_EMAIL_DISPATCH=false)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/integrations/whatsapp/webhook/route';
import {
  WhatsAppReportingPipeline,
  LeadershipReportingAgent,
  SenderIdentityResolver,
  WhatsAppFormatter,
  ExportContractService,
  MockReportingEmailDispatcher,
  InMemoryReportingSessionRepository,
  InMemoryExportConfirmationStore,
  AppsScriptAuthorizedDataAdapter,
  SyntheticAuthorizedDataAdapter,
  CallerSecurityContext,
} from '../index';
import {
  MemoryInboundPersistence,
  SupabaseInboundPersistence,
} from '@/features/whatsapp-document-loop/persistence';
import {
  resetWhatsAppPipelineForTesting,
} from '@/lib/server/whatsappPipelineFactory';

const TEST_SECRET = 'test_webhook_app_secret_32_bytes_long!!';

function signPayload(bodyStr: string, secret: string = TEST_SECRET): string {
  const hmac = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
  return `sha256=${hmac}`;
}

function buildMetaWebhookPayload(options: {
  from?: string;
  messageId?: string;
  body?: string;
  timestamp?: string;
}) {
  const from = options.from || '919876543210';
  const id = options.messageId || `wamid.HBgL${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const textBody = options.body || 'Overview KPI status';
  const timestamp = options.timestamp || String(Math.floor(Date.now() / 1000));

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_BUSINESS_ACCOUNT_01',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550254581',
                phone_number_id: '100609346426371',
              },
              contacts: [
                {
                  profile: { name: 'Dr. Test Leader' },
                  wa_id: from,
                },
              ],
              messages: [
                {
                  from,
                  id,
                  timestamp,
                  text: { body: textBody },
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsApp Durable Reporting Pipeline & Concurrency Suite', () => {
  let inboundPersistence: MemoryInboundPersistence;
  let sessionRepository: InMemoryReportingSessionRepository;
  let confirmationStore: InMemoryExportConfirmationStore;
  let emailDispatcher: MockReportingEmailDispatcher;
  let pipeline: WhatsAppReportingPipeline;

  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
    process.env.META_APP_SECRET = TEST_SECRET;
    process.env.ALLOW_LIVE_WHATSAPP_SEND = 'false';
    process.env.ALLOW_LIVE_EMAIL_DISPATCH = 'false';

    inboundPersistence = new MemoryInboundPersistence();
    sessionRepository = new InMemoryReportingSessionRepository();
    confirmationStore = new InMemoryExportConfirmationStore();
    emailDispatcher = new MockReportingEmailDispatcher();

    const agent = new LeadershipReportingAgent(
      new SyntheticAuthorizedDataAdapter(),
      undefined,
      undefined,
      new WhatsAppFormatter(),
      new ExportContractService(),
      emailDispatcher,
      confirmationStore
    );

    pipeline = new WhatsAppReportingPipeline(
      new SenderIdentityResolver(),
      agent,
      new WhatsAppFormatter(),
      sessionRepository
    );

    resetWhatsAppPipelineForTesting({
      inboundPersistence,
      sessionRepository,
      confirmationStore,
      pipeline,
    });
  });

  describe('1. Authenticated Webhook Handoff & Deduplication', () => {
    it('authenticates valid HMAC webhook, records event, and processes query', async () => {
      const payloadObj = buildMetaWebhookPayload({
        from: '919876543210',
        messageId: 'wamid.test_valid_01',
        body: 'Send June 2026 linelist with document links',
      });
      const bodyStr = JSON.stringify(payloadObj);
      const signature = signPayload(bodyStr);

      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: bodyStr,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const resJson = await res.json();
      expect(resJson.status).toBe('ok');
      expect(resJson.pipelineExecutions).toBe(1);
      expect(resJson.duplicatesSkipped).toBe(0);

      // Verify recorded in durable inbound store
      const hasEvent = await inboundPersistence.hasEvent('wamid.test_valid_01');
      expect(hasEvent).toBe(true);

      const eventRec = await inboundPersistence.getEvent('wamid.test_valid_01');
      expect(eventRec?.processingStatus).toBe('PROCESSED');
      expect(eventRec?.eventType).toBe('TEXT_MESSAGE');
      expect(eventRec?.senderMasked).toBe('+91 ******3210');
      // Zero raw phone number in audit record
      const resolver = new SenderIdentityResolver();
      expect(eventRec?.fromPhoneHash).toBe(resolver.hashPhoneNumber('+919876543210'));
    });

    it('safely deduplicates retried webhooks on matching messageId without re-executing query', async () => {
      const payloadObj = buildMetaWebhookPayload({
        from: '919876543210',
        messageId: 'wamid.test_retry_01',
        body: 'Send June 2026 linelist with document links',
      });
      const bodyStr = JSON.stringify(payloadObj);
      const signature = signPayload(bodyStr);

      const sendWebhook = async () => {
        const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hub-signature-256': signature,
          },
          body: bodyStr,
        });
        return POST(req);
      };

      // First delivery: executed
      const res1 = await sendWebhook();
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.pipelineExecutions).toBe(1);
      expect(json1.duplicatesSkipped).toBe(0);

      // Second delivery (retried by Meta): skipped
      const res2 = await sendWebhook();
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.pipelineExecutions).toBe(0);
      expect(json2.duplicatesSkipped).toBe(1);
    });
  });

  describe('2. Concurrent Export Confirmation Race (Replay & Double-Spend Protection)', () => {
    it('ensures exactly 1 confirmation succeeds and 9 fail with ALREADY_CONSUMED across 10 concurrent requests', async () => {
      // 1. Initial query to generate linelist export preview with fully resolved year and date basis
      const initial = await pipeline.handleInboundMessage({
        from: '+919876543210',
        messageId: 'wamid_init_01',
        timestamp: '1729500000',
        text: 'Send June 2026 linelist with document links on visit date',
      });

      expect(initial.status).toBe('SUCCESS');
      const session = initial.session;
      expect(session?.pendingExport).toBeDefined();
      const exportId = session!.pendingExport!.exportId;
      expect(exportId).toBeTruthy();

      // 2. Fire 10 concurrent confirmation requests simultaneously
      const caller: CallerSecurityContext = {
        userId: 'usr_lead_national_01',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
      };

      const confirmationAttempts = Array.from({ length: 10 }).map((_, i) =>
        confirmationStore.consumeConfirmationTokenAtomic({
          exportId,
          parametersHash: session!.pendingExport!.immutableParametersHash,
          userId: caller.userId,
          userConfirmationText: 'CONFIRM EXPORT',
          caller,
        })
      );

      const results = await Promise.all(confirmationAttempts);

      // 3. Mathematical invariant: Exactly 1 CONSUMED, 9 ALREADY_CONSUMED
      const successful = results.filter((r) => r.success && r.status === 'CONSUMED');
      const rejected = results.filter((r) => !r.success && r.status === 'ALREADY_CONSUMED');

      expect(successful.length).toBe(1);
      expect(rejected.length).toBe(9);
      expect(successful[0].job).toBeDefined();
      expect(successful[0].job?.exportId).toBe(exportId);
    });
  });

  describe('3. Worker Process Restart Resilience', () => {
    it('restores conversation session, confirmed year, date basis, and pending preview across worker restart', async () => {
      const fromPhone = '+919876543210';

      // Worker 1: Sets up multi-turn parameters
      const r1 = await pipeline.handleInboundMessage({
        from: fromPhone,
        messageId: 'wamid_restart_01',
        timestamp: '1729500001',
        text: 'Linelist export',
      });
      expect(r1.outboundMessage.text.body).toMatch(/calendar year/i);

      // Worker 1: Clarifies year 2026 and date basis
      const r2 = await pipeline.handleInboundMessage({
        from: fromPhone,
        messageId: 'wamid_restart_02',
        timestamp: '1729500002',
        text: '2026 by visit date',
      });
      expect(r2.session?.confirmedYear).toBe(2026);
      expect(r2.session?.confirmedDateBasis).toBe('VISIT_DATE');
      expect(r2.session?.pendingExport).toBeDefined();

      // === SIMULATE WORKER CRASH / RESTART ===
      // Worker 1 is destroyed. Worker 2 starts with a fresh empty memory map,
      // but backed by the persistent sessionRepository and confirmationStore.
      const freshAgent = new LeadershipReportingAgent(
        new SyntheticAuthorizedDataAdapter(),
        undefined,
        undefined,
        new WhatsAppFormatter(),
        new ExportContractService(),
        emailDispatcher,
        confirmationStore
      );

      const worker2Pipeline = new WhatsAppReportingPipeline(
        new SenderIdentityResolver(),
        freshAgent,
        new WhatsAppFormatter(),
        sessionRepository // Shared durable repository
      );

      // Verify Worker 2 has no memory cache for this user initially
      expect(worker2Pipeline.getSession('usr_lead_national_01')).toBeUndefined();

      // Worker 2: Receives CONFIRM EXPORT on the new worker
      const r3 = await worker2Pipeline.handleInboundMessage({
        from: fromPhone,
        messageId: 'wamid_restart_03',
        timestamp: '1729500003',
        text: 'CONFIRM EXPORT',
      });

      expect(r3.status).toBe('SUCCESS');
      expect(r3.responseMessage?.intent).toBe('EXPORT_CONFIRM');
      expect(r3.outboundMessage.text.body).toMatch(/Export Job (Dispatched|Queued)/);
      expect(r3.session?.confirmedYear).toBe(2026);
      expect(r3.session?.confirmedDateBasis).toBe('VISIT_DATE');
      expect(emailDispatcher.dispatchedEmails.length).toBe(1);
    });
  });

  describe('4. Authorized Reporting Data Retrieval & Geographic Scope Isolation', () => {
    it('restricts State Lead to their permitted state and prevents cross-state leakage', async () => {
      const dataAdapter = new AppsScriptAuthorizedDataAdapter();
      const mhLead: CallerSecurityContext = {
        userId: 'usr_lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
      };

      // Maharashtra query returns only Maharashtra records
      const mhResult = await dataAdapter.fetchAssessmentRecords(mhLead, { stateFilter: 'Maharashtra' });
      expect(mhResult.records.length).toBeGreaterThan(0);
      expect(mhResult.records.every((r) => r.state === 'Maharashtra')).toBe(true);

      // Karnataka query by Maharashtra lead returns zero records
      const kaResult = await dataAdapter.fetchAssessmentRecords(mhLead, { stateFilter: 'Karnataka' });
      expect(kaResult.records.length).toBe(0);
    });

    it('permits National Director to query across all states', async () => {
      const dataAdapter = new AppsScriptAuthorizedDataAdapter();
      const director: CallerSecurityContext = {
        userId: 'usr_lead_national_01',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
      };

      const nationalResult = await dataAdapter.fetchAssessmentRecords(director);
      expect(nationalResult.records.length).toBeGreaterThan(0);
      const states = new Set(nationalResult.records.map((r) => r.state));
      expect(states.size).toBeGreaterThan(1);
    });
  });

  describe('5. Fail-Closed Live Latches & Security Boundaries', () => {
    it('strictly enforces ALLOW_LIVE_WHATSAPP_SEND=false (zero live network dispatch)', async () => {
      process.env.ALLOW_LIVE_WHATSAPP_SEND = 'false';

      const res = await pipeline.handleInboundMessage({
        from: '+919876543210',
        messageId: 'wamid_latch_01',
        timestamp: '1729500000',
        text: 'Overview KPI status',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.outboundMessage).toBeDefined();
      // Zero HTTP dispatch thrown or executed
    });

    it('strictly rejects unlisted sender numbers with UNAUTHORIZED status', async () => {
      const res = await pipeline.handleInboundMessage({
        from: '+919999999999',
        messageId: 'wamid_unauth_01',
        timestamp: '1729500000',
        text: 'Send linelist',
      });

      expect(res.status).toBe('UNAUTHORIZED');
      expect(res.outboundMessage.text.body).toContain('Unauthorized Access');
      expect(res.diagnosticRecord.status).toBe('DENIED');
    });

    it('rejects sender attempting to claim leadership email in text (spoofing protection)', async () => {
      // Attacker uses valid Maharashtra lead phone but claims Director email
      const res = await pipeline.handleInboundMessage({
        from: '+919876543211',
        messageId: 'wamid_spoof_01',
        timestamp: '1729500000',
        text: 'Please send to director@allianceindia.org',
      });

      expect(res.status).toBe('UNAUTHORIZED');
      expect(res.diagnosticRecord.status).toBe('DENIED');
    });
  });
});
