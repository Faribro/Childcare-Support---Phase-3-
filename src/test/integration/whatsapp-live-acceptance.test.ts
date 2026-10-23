import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  CaregiverSubscriptionStateMachine,
  MemoryCaregiverSubscriptionStore,
  CaregiverOtpService,
} from '@/features/caregiver-subscription';
import {
  WhatsAppDocumentLoopService,
  DocumentReminderScheduler,
  MemoryDocumentLoopStore,
  SubmissionEntity,
} from '@/features/whatsapp-document-loop';
import {
  WhatsAppReportingPipeline,
  LeadershipReportingAgent,
  SenderIdentityResolver,
  WhatsAppFormatter,
  SyntheticAuthorizedDataAdapter,
  InMemoryReportingSessionRepository,
} from '@/features/leadership-reporting';

describe('WhatsApp End-to-End State Machine Integration Trace (Synthetic Mocks)', () => {
  // Synthetic Test Constants (Zero real beneficiary PII, Zero real phone numbers)
  const SYNTHETIC_CAREGIVER_PHONE = '+919988776655';
  const SYNTHETIC_CHILD_ID = 'CH-SYN-999';
  const SYNTHETIC_SUBMISSION_ID = 'sub-synthetic-live-acceptance-01';

  let caregiverStore: MemoryCaregiverSubscriptionStore;
  let otpService: CaregiverOtpService;
  let caregiverStateMachine: CaregiverSubscriptionStateMachine;

  let docLoopStore: MemoryDocumentLoopStore;
  let reminderScheduler: DocumentReminderScheduler;
  let docLoopService: WhatsAppDocumentLoopService;

  let leadershipPipeline: WhatsAppReportingPipeline;

  beforeEach(() => {
    // 1. Initialize Caregiver subsystem
    caregiverStore = new MemoryCaregiverSubscriptionStore();
    otpService = new CaregiverOtpService();
    caregiverStateMachine = new CaregiverSubscriptionStateMachine(caregiverStore, otpService);

    // 2. Initialize Document Loop and Scheduler
    docLoopStore = new MemoryDocumentLoopStore();
    reminderScheduler = new DocumentReminderScheduler();
    docLoopService = new WhatsAppDocumentLoopService(
      docLoopStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      reminderScheduler
    );

    // 3. Initialize Leadership Reporting Pipeline
    const dataAdapter = new SyntheticAuthorizedDataAdapter();
    const agent = new LeadershipReportingAgent(dataAdapter);
    leadershipPipeline = new WhatsAppReportingPipeline(
      new SenderIdentityResolver(),
      agent,
      new WhatsAppFormatter(),
      new InMemoryReportingSessionRepository()
    );
  });

  it('executes full Section 8 lifecycle trace from OTP through auto-cancellation, opt-out, and role isolation', async () => {
    // -------------------------------------------------------------------------
    // STEP 1: Link Caregiver to Beneficiary Submission (Asynchronous / Non-blocking)
    // -------------------------------------------------------------------------
    const initialRecord = await caregiverStateMachine.linkBeneficiary(
      SYNTHETIC_CAREGIVER_PHONE,
      SYNTHETIC_CHILD_ID,
      SYNTHETIC_SUBMISSION_ID
    );
    expect(initialRecord.state).toBe('UNVERIFIED');
    expect(initialRecord.linkedChildIdsMasked).toContain(SYNTHETIC_CHILD_ID);

    // -------------------------------------------------------------------------
    // STEP 2: Inbound Greeting -> OTP Challenge Initiated
    // -------------------------------------------------------------------------
    const otpReq = await caregiverStateMachine.handleInboundMessage({
      fromPhone: SYNTHETIC_CAREGIVER_PHONE,
      messageId: 'msg_trace_01',
      textBody: 'Namaste',
    });

    expect(otpReq.record.state).toBe('OTP_PENDING');
    expect(otpReq.rawOtpForTransport).toMatch(/^\d{6}$/);
    expect(otpReq.response?.templateName).toBe('caregiver_auth_otp');
    expect(otpReq.response?.toPhoneMasked).toBe('+91 99*** **655');

    const rawOtp = otpReq.rawOtpForTransport!;

    // -------------------------------------------------------------------------
    // STEP 3: OTP Verification -> Transitions to VERIFIED (NOT SUBSCRIBED!)
    // -------------------------------------------------------------------------
    const otpVerify = await caregiverStateMachine.handleInboundMessage({
      fromPhone: SYNTHETIC_CAREGIVER_PHONE,
      messageId: 'msg_trace_02',
      textBody: `Here is my code ${rawOtp}`,
    });

    // CRITICAL: Proof of phone possession DOES NOT equal consent!
    expect(otpVerify.record.state).toBe('VERIFIED');
    expect(otpVerify.record.consentProvided).toBe(false);
    expect(otpVerify.response?.nextExpectedState).toBe('VERIFIED');
    expect(otpVerify.response?.textBody).toContain('पडताळला'); // Prompting for consent

    // -------------------------------------------------------------------------
    // STEP 4: Affirmative Consent Recorded -> Transitions to SUBSCRIBED
    // -------------------------------------------------------------------------
    const consentRes = await caregiverStateMachine.handleInboundMessage({
      fromPhone: SYNTHETIC_CAREGIVER_PHONE,
      messageId: 'msg_trace_03',
      textBody: 'YES',
    });

    expect(consentRes.record.state).toBe('SUBSCRIBED');
    expect(consentRes.record.consentProvided).toBe(true);
    expect(consentRes.record.consentRecordedAt).toBeDefined();
    expect(consentRes.record.consentCategories).toContain('DOCUMENTS');
    expect(consentRes.response?.nextExpectedState).toBe('SUBSCRIBED');

    // -------------------------------------------------------------------------
    // STEP 5: Authoritative Record Check & Document Reminder Dispatch
    // -------------------------------------------------------------------------
    const syntheticSubmission: SubmissionEntity = {
      id: SYNTHETIC_SUBMISSION_ID,
      remoteSubmissionId: 'REMOTE-SYN-001',
      state: 'Maharashtra',
      district: 'Pune',
      beneficiaryPhone: SYNTHETIC_CAREGIVER_PHONE,
      beneficiaryPhoneHash: caregiverStateMachine.hashPhoneNumber(SYNTHETIC_CAREGIVER_PHONE),
      caseworkerUserId: 'cw_synth',
      submissionStatus: 'PENDING_DOCUMENTS',
      requiresFeeReceipt: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      documents: {
        passbookPhoto: { docType: 'passbookPhoto', status: 'MISSING', isVerified: false },
        aadhaarCardPhoto: { docType: 'aadhaarCardPhoto', status: 'VERIFIED', isVerified: true },
        childPhoto: { docType: 'childPhoto', status: 'VERIFIED', isVerified: true },
        feeReceiptPhoto: { docType: 'feeReceiptPhoto', status: 'VERIFIED', isVerified: true },
        marksheetPhoto: { docType: 'marksheetPhoto', status: 'VERIFIED', isVerified: true },
        caregiverSignature: { docType: 'caregiverSignature', status: 'VERIFIED', isVerified: true },
      },
    };
    docLoopService.registerSubmission(syntheticSubmission);

    // Evaluate reminder at 14:00 IST (08:30 UTC - daytime)
    const daytime = new Date('2026-10-23T08:30:00.000Z');
    const reminderEval = reminderScheduler.evaluateReminder(
      syntheticSubmission,
      consentRes.record,
      daytime
    );

    expect(reminderEval.eligible).toBe(true);
    expect(reminderEval.outboundPayload?.templateName).toBe('childcare_doc_reminder_neutral');
    // Ensure neutral text contains NO sensitive clinical data
    expect(reminderEval.outboundPayload?.messageText).not.toContain('HIV');
    expect(reminderEval.outboundPayload?.messageText).not.toContain('Viral');
    expect(reminderEval.outboundPayload?.messageText).not.toContain('Aadhaar');

    // Simulate dispatch
    reminderScheduler.recordDispatch(reminderEval.reminderRecord!.reminderId, daytime.toISOString());
    const scheduledReminder = reminderScheduler.getReminder(SYNTHETIC_SUBMISSION_ID);
    expect(scheduledReminder?.remindersSentCount).toBe(1);

    // -------------------------------------------------------------------------
    // STEP 6: Inbound Missing Document Upload -> Verified Magic Bytes & Auto-Cancellation
    // -------------------------------------------------------------------------
    const validJpegBytes = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(200, 0x42),
    ]);
    const validChecksum = crypto.createHash('sha256').update(validJpegBytes).digest('hex');

    const uploadReceipt = await docLoopService.handleInboundDocumentUpload({
      eventId: 'evt_synth_upload_001',
      fromPhone: SYNTHETIC_CAREGIVER_PHONE,
      submissionId: SYNTHETIC_SUBMISSION_ID,
      docType: 'passbookPhoto',
      mediaId: 'media_synth_passbook_01',
      mimeType: 'image/jpeg',
      byteSize: validJpegBytes.length,
      sha256Checksum: validChecksum,
      rawBytes: validJpegBytes,
      timestamp: new Date().toISOString(),
    });

    expect(uploadReceipt.success).toBe(true);
    expect(uploadReceipt.isUploaded).toBe(true);
    expect(uploadReceipt.status).toBe('PROCESSED');
    // Storage != Verification: Stored status is UPLOADED, not VERIFIED
    expect(uploadReceipt.allDocumentsVerified).toBe(false);

    // Verify reminder was AUTO-CANCELLED upon upload receipt
    const cancelledReminder = reminderScheduler.getReminder(SYNTHETIC_SUBMISSION_ID);
    expect(cancelledReminder?.status).toBe('CANCELLED_DOCUMENT_RECEIVED');
    expect(cancelledReminder?.cancelledAt).toBeDefined();

    // -------------------------------------------------------------------------
    // STEP 7: Opt-Out ("STOP") -> Immediate Halt of Proactive Communications
    // -------------------------------------------------------------------------
    const stopRes = await caregiverStateMachine.handleInboundMessage({
      fromPhone: SYNTHETIC_CAREGIVER_PHONE,
      messageId: 'msg_trace_stop',
      textBody: 'STOP',
    });

    expect(stopRes.record.state).toBe('OPTED_OUT');
    expect(stopRes.record.optOutReason).toBe('STOP');
    expect(await caregiverStore.isOptedOut(caregiverStateMachine.hashPhoneNumber(SYNTHETIC_CAREGIVER_PHONE))).toBe(true);

    // Verify subsequent reminder evaluation is immediately rejected
    const blockedEval = reminderScheduler.evaluateReminder(
      syntheticSubmission,
      stopRes.record,
      daytime
    );
    expect(blockedEval.eligible).toBe(false);
    expect(blockedEval.reason).toBe('CAREGIVER_OPTED_OUT');

    // -------------------------------------------------------------------------
    // STEP 8: Role Isolation Check: Caregiver cannot access Leadership Surveillance
    // -------------------------------------------------------------------------
    const unauthorizedQuery = await leadershipPipeline.handleInboundMessage({
      from: SYNTHETIC_CAREGIVER_PHONE,
      messageId: 'msg_lead_hack_attempt',
      timestamp: String(Date.now()),
      text: 'Show national overview and high-risk linelist',
    });

    expect(unauthorizedQuery.status).toBe('UNAUTHORIZED');
    expect(unauthorizedQuery.outboundMessage.text.body).toContain('Unauthorized Access');
    expect(unauthorizedQuery.diagnosticRecord.status).toBe('DENIED');

    // Authorized Leadership Query succeeds
    const authorizedQuery = await leadershipPipeline.handleInboundMessage({
      from: '+919876543210', // Registered National Programme Director
      messageId: 'msg_lead_auth_query',
      timestamp: String(Date.now()),
      text: 'Show national overview',
    });

    expect(authorizedQuery.status).toBe('SUCCESS');
    expect(authorizedQuery.outboundMessage.text.body).toContain('National Executive Summary');
  });
});
