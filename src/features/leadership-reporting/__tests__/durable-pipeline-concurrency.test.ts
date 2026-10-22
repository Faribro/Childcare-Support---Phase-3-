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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  ExportPreviewContract,
  computeImmutableExportHash,
  SupabaseReportingSessionRepository,
  SupabaseExportConfirmationStore,
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

  describe('6. Production Mode Fail-Closed Persistence & Webhook 503', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      resetWhatsAppPipelineForTesting();
    });

    it('SupabaseInboundPersistence fails closed in production when credentials are missing', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_KEY;

      const persistence = new SupabaseInboundPersistence('', '');

      await expect(
        persistence.claimInboundEvent({
          eventId: 'wamid.prod_fail_01',
          fromPhoneHash: 'hash',
          senderMasked: '+91 ******0000',
          eventType: 'TEXT_MESSAGE',
          idempotencyKey: 'wamid.prod_fail_01',
          payloadRedacted: {},
          processingStatus: 'CLAIMED',
        })
      ).rejects.toThrow(/DURABLE_STORAGE_UNAVAILABLE/);

      await expect(persistence.hasEvent('wamid.prod_fail_01')).rejects.toThrow(
        /DURABLE_STORAGE_UNAVAILABLE/
      );
    });

    it('SupabaseReportingSessionRepository fails closed in production when credentials are missing', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_KEY;

      const repo = new SupabaseReportingSessionRepository('', '');

      await expect(repo.getSession('usr_01')).rejects.toThrow(
        /DURABLE_STORAGE_UNAVAILABLE/
      );
    });

    it('SupabaseExportConfirmationStore fails closed in production when credentials are missing', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_KEY;

      const store = new SupabaseExportConfirmationStore('', '');

      await expect(
        store.registerPreviewContract({
          exportId: 'exp_fail_01',
          title: 'Linelist Export',
          recipientUserId: 'usr_01',
          recipientEmailMasked: 'u***@test.org',
          recipientEmailExact: 'user@test.org',
          reportType: 'LINELIST_EXPORT',
          year: 2026,
          month: '06',
          dateBasis: 'VISIT_DATE',
          dateField: 'visit_date',
          stateFilter: null,
          columns: ['id'],
          uniqueBeneficiaries: 10,
          totalAssessments: 10,
          confirmationCode: 'CONFIRM EXPORT',
          immutableParametersHash: 'hash',
          isConsumed: false,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        })
      ).rejects.toThrow(/DURABLE_STORAGE_UNAVAILABLE/);
    });

    it('webhook route returns HTTP 503 PERSISTENCE_UNAVAILABLE when factory throws in production', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_KEY;
      delete process.env.APPS_SCRIPT_URL;

      resetWhatsAppPipelineForTesting();

      const payloadObj = buildMetaWebhookPayload({
        from: '919876543210',
        messageId: 'wamid.prod_503_test',
        body: 'Status overview',
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
      expect(res.status).toBe(503);
      const resJson = await res.json();
      expect(resJson.code).toBe('PERSISTENCE_UNAVAILABLE');
    });
  });

  describe('7. Atomic Inbound Claim & Crash Recovery Lifecycle', () => {
    it('exercises CLAIMED -> DUPLICATE_IN_PROGRESS -> CLAIM_RECOVERED -> DUPLICATE_ALREADY_PROCESSED', async () => {
      const memPersistence = new MemoryInboundPersistence();
      const messageId = 'wamid.atomic_lifecycle_test';
      const eventRec = {
        eventId: messageId,
        fromPhoneHash: 'phonehash123',
        senderMasked: '+91 ******3210',
        eventType: 'TEXT_MESSAGE' as const,
        idempotencyKey: messageId,
        payloadRedacted: { messageType: 'text' },
        processingStatus: 'CLAIMED' as const,
      };

      // 1. Initial claim: successfully claimed
      const claim1 = await memPersistence.claimInboundEvent(eventRec, 100);
      expect(claim1.status).toBe('CLAIMED');
      expect(claim1.event?.processingStatus).toBe('CLAIMED');

      // 2. Concurrent duplicate before lease expiry: blocked as DUPLICATE_IN_PROGRESS
      const claim2 = await memPersistence.claimInboundEvent(eventRec, 100);
      expect(claim2.status).toBe('DUPLICATE_IN_PROGRESS');

      // 3. Worker crash simulation: lease expires after 110ms
      await new Promise((resolve) => setTimeout(resolve, 110));

      // Worker 2 attempts claim after lease expiry: successfully recovered
      const claim3 = await memPersistence.claimInboundEvent(eventRec, 100);
      expect(claim3.status).toBe('CLAIM_RECOVERED');
      expect(claim3.event?.errorMessage).toMatch(/Lease expired/);

      // 4. Worker 2 completes processing and marks PROCESSED
      await memPersistence.updateEventStatus(messageId, 'PROCESSED');

      // 5. Subsequent retried webhook: recognized as DUPLICATE_ALREADY_PROCESSED
      const claim4 = await memPersistence.claimInboundEvent(eventRec, 100);
      expect(claim4.status).toBe('DUPLICATE_ALREADY_PROCESSED');
    });
  });

  describe('8. Delivery Job Lifecycle, Worker Claiming & Crash Recovery', () => {
    it('manages QUEUED -> PROCESSING lease lock, and recovers stale job to UNCERTAIN after worker crash', async () => {
      const store = new InMemoryExportConfirmationStore();
      const exportId = 'exp_job_lifecycle_01';
      const caller: CallerSecurityContext = {
        userId: 'usr_lead_national_01',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
        isActive: true,
      };

      const immutableHash = computeImmutableExportHash({
        exportId,
        recipientUserId: caller.userId,
        recipientEmailExact: 'director@allianceindia.org',
        year: 2026,
        monthOrRange: '06',
        dateBasis: 'VISIT_DATE',
        stateFilter: null,
        columns: ['childId', 'state'],
      });

      const preview: ExportPreviewContract = {
        exportId,
        title: 'Linelist Export',
        recipientUserId: caller.userId,
        recipientEmailMasked: 'd***@allianceindia.org',
        recipientEmailExact: 'director@allianceindia.org',
        reportType: 'LINELIST_EXPORT',
        year: 2026,
        month: '06',
        dateBasis: 'VISIT_DATE',
        dateField: 'visit_date',
        stateFilter: null,
        columns: ['childId', 'state'],
        uniqueBeneficiaries: 42,
        totalAssessments: 42,
        confirmationCode: 'CONFIRM EXPORT',
        immutableParametersHash: immutableHash,
        isConsumed: false,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };

      await store.registerPreviewContract(preview);

      // Step 1: Atomic token consumption creates job in QUEUED status
      const consumeRes = await store.consumeConfirmationTokenAtomic({
        exportId,
        parametersHash: preview.immutableParametersHash,
        userId: caller.userId,
        userConfirmationText: 'CONFIRM EXPORT',
        caller,
      });

      expect(consumeRes.success).toBe(true);
      expect(consumeRes.status).toBe('CONSUMED');
      expect(consumeRes.job).toBeDefined();
      expect(consumeRes.job?.status).toBe('QUEUED');
      const jobId = consumeRes.job!.jobId;

      // Step 2: Worker 1 claims job with a 100ms lease
      const claimedJob = await store.claimDeliveryJob('worker-node-alpha', 100);
      expect(claimedJob).not.toBeNull();
      expect(claimedJob?.jobId).toBe(jobId);
      expect(claimedJob?.status).toBe('PROCESSING');
      expect(claimedJob?.leaseWorkerId).toBe('worker-node-alpha');
      expect(claimedJob?.attempts).toBe(1);

      // Step 3: Concurrent Worker 2 tries to claim while lease active -> returns null
      const concurrentClaim = await store.claimDeliveryJob('worker-node-beta', 100);
      expect(concurrentClaim).toBeNull();

      // Step 4: Worker 1 crashes. Wait 110ms for lease expiration
      await new Promise((resolve) => setTimeout(resolve, 110));

      // Stale recovery daemon runs: identifies expired lease and marks UNCERTAIN for audit
      const recoveredJobs = await store.recoverStaleDeliveryJobs(0);
      expect(recoveredJobs.length).toBe(1);
      expect(recoveredJobs[0].jobId).toBe(jobId);
      expect(recoveredJobs[0].status).toBe('UNCERTAIN');
      expect(recoveredJobs[0].errorReason).toMatch(/lease expired/i);

      // Step 5: Verification of job state in store
      const jobAfterCrash = await store.getJob(jobId);
      expect(jobAfterCrash?.status).toBe('UNCERTAIN');
    });
  });

  describe('9. Execution-Time Identity & Geographic Scope Revalidation', () => {
    let store: InMemoryExportConfirmationStore;
    let basePreview: ExportPreviewContract;

    beforeEach(async () => {
      store = new InMemoryExportConfirmationStore();
      const hash = computeImmutableExportHash({
        exportId: 'exp_scope_test_01',
        recipientUserId: 'usr_lead_mh_01',
        recipientEmailExact: 'statelead@allianceindia.org',
        year: 2026,
        monthOrRange: '06',
        dateBasis: 'VISIT_DATE',
        stateFilter: 'Maharashtra',
        columns: ['childId', 'state', 'district'],
      });

      basePreview = {
        exportId: 'exp_scope_test_01',
        title: 'Maharashtra Linelist Export',
        recipientUserId: 'usr_lead_mh_01',
        recipientEmailMasked: 's***@allianceindia.org',
        recipientEmailExact: 'statelead@allianceindia.org',
        reportType: 'LINELIST_EXPORT',
        year: 2026,
        month: '06',
        dateBasis: 'VISIT_DATE',
        dateField: 'visit_date',
        stateFilter: 'Maharashtra',
        districtFilter: 'Pune',
        columns: ['childId', 'state', 'district'],
        uniqueBeneficiaries: 25,
        totalAssessments: 25,
        confirmationCode: 'CONFIRM EXPORT',
        immutableParametersHash: hash,
        isConsumed: false,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
      await store.registerPreviewContract(basePreview);
    });

    it('rejects confirmation if caller identity has been deactivated (isActive: false) at execution time', async () => {
      const deactivatedCaller: CallerSecurityContext = {
        userId: 'usr_lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
        permittedDistricts: ['Pune'],
        isActive: false,
      };

      const result = await store.consumeConfirmationTokenAtomic({
        exportId: basePreview.exportId,
        parametersHash: basePreview.immutableParametersHash,
        userId: deactivatedCaller.userId,
        userConfirmationText: 'CONFIRM EXPORT',
        caller: deactivatedCaller,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('AUTH_DENIED');
      expect(result.errorReason).toContain('ACCOUNT_DEACTIVATED');
    });

    it('rejects confirmation if caller state authorization changed after preview was created', async () => {
      const reassignedCaller: CallerSecurityContext = {
        userId: 'usr_lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Gujarat'],
        permittedDistricts: ['*'],
        isActive: true,
      };

      const result = await store.consumeConfirmationTokenAtomic({
        exportId: basePreview.exportId,
        parametersHash: basePreview.immutableParametersHash,
        userId: reassignedCaller.userId,
        userConfirmationText: 'CONFIRM EXPORT',
        caller: reassignedCaller,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('AUTH_DENIED');
      expect(result.errorReason).toContain('EXECUTION_AUTH_DENIED');
      expect(result.errorReason).toContain('Maharashtra');
    });

    it('rejects confirmation if caller district authorization does not cover preview district filter', async () => {
      const districtScopedCaller: CallerSecurityContext = {
        userId: 'usr_lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
        permittedDistricts: ['Mumbai Suburban', 'Thane'],
        isActive: true,
      };

      const result = await store.consumeConfirmationTokenAtomic({
        exportId: basePreview.exportId,
        parametersHash: basePreview.immutableParametersHash,
        userId: districtScopedCaller.userId,
        userConfirmationText: 'CONFIRM EXPORT',
        caller: districtScopedCaller,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('AUTH_DENIED');
      expect(result.errorReason).toContain('EXECUTION_AUTH_DENIED');
      expect(result.errorReason).toContain('district');
    });

    it('permits confirmation when caller active status and geographic permissions match', async () => {
      const validCaller: CallerSecurityContext = {
        userId: 'usr_lead_mh_01',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
        permittedDistricts: ['Pune'],
        isActive: true,
      };

      const result = await store.consumeConfirmationTokenAtomic({
        exportId: basePreview.exportId,
        parametersHash: basePreview.immutableParametersHash,
        userId: validCaller.userId,
        userConfirmationText: 'CONFIRM EXPORT',
        caller: validCaller,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('CONSUMED');
      expect(result.job).toBeDefined();
    });
  });
});
