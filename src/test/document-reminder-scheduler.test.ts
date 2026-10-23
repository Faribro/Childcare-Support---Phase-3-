import crypto from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DocumentReminderScheduler,
  REMINDER_CONFIG,
  WhatsAppDocumentLoopService,
  MemoryDocumentLoopStore,
  SubmissionEntity,
  DocType,
} from '@/features/whatsapp-document-loop';
import { CaregiverSubscriptionRecord } from '@/features/caregiver-subscription';

describe('Document Reminder Scheduler & Auto-Cancellation Suite', () => {
  let scheduler: DocumentReminderScheduler;
  let docService: WhatsAppDocumentLoopService;
  let store: MemoryDocumentLoopStore;

  const mockSubscription: CaregiverSubscriptionRecord = {
    subscriptionId: 'sub_test_01',
    phoneHash: 'hash_test_phone_9876543210',
    phoneMasked: '+91 98*** **210',
    state: 'SUBSCRIBED',
    consentProvided: true,
    consentRecordedAt: new Date().toISOString(),
    consentCategories: ['DOCUMENTS', 'CLINICAL_FOLLOWUP'],
    preferredLanguage: 'mr',
    linkedChildIdsMasked: ['CH-***-001'],
    linkedSubmissionIds: ['sub-test-001'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createSubmission = (overrides?: Partial<SubmissionEntity>): SubmissionEntity => ({
    id: 'sub-test-001',
    remoteSubmissionId: 'REMOTE-PUN-001',
    state: 'Maharashtra',
    district: 'Pune',
    beneficiaryPhone: '+919876543210',
    beneficiaryPhoneHash: 'hash_test_phone_9876543210',
    caseworkerUserId: 'cw_01',
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
    ...overrides,
  });

  beforeEach(() => {
    scheduler = new DocumentReminderScheduler();
    store = new MemoryDocumentLoopStore();
    docService = new WhatsAppDocumentLoopService(store, undefined, undefined, undefined, undefined, undefined, scheduler);
  });

  describe('1. Quiet Hours Enforcement (Indian Standard Time)', () => {
    it('allows dispatches during daytime (14:00 IST)', () => {
      // 14:00 IST is 08:30 UTC
      const daytimeDate = new Date('2026-10-23T08:30:00.000Z');
      const { isQuietHours, istHour } = scheduler.isQuietHours(daytimeDate);
      expect(istHour).toBe(14);
      expect(isQuietHours).toBe(false);
    });

    it('suppresses dispatches during night quiet hours (22:00 IST)', () => {
      // 22:00 IST is 16:30 UTC
      const nightDate = new Date('2026-10-23T16:30:00.000Z');
      const { isQuietHours, istHour } = scheduler.isQuietHours(nightDate);
      expect(istHour).toBe(22);
      expect(isQuietHours).toBe(true);
    });

    it('suppresses dispatches in early morning before 8 AM IST (06:00 IST)', () => {
      // 06:00 IST is 00:30 UTC
      const earlyDate = new Date('2026-10-23T00:30:00.000Z');
      const { isQuietHours, istHour } = scheduler.isQuietHours(earlyDate);
      expect(istHour).toBe(6);
      expect(isQuietHours).toBe(true);
    });
  });

  describe('2. Consent and Subscription Gates', () => {
    const daytime = new Date('2026-10-23T08:30:00.000Z'); // 14:00 IST

    it('rejects reminder if caregiver is unverified or has no subscription', () => {
      const sub = createSubmission();
      const evalNull = scheduler.evaluateReminder(sub, null, daytime);
      expect(evalNull.eligible).toBe(false);
      expect(evalNull.reason).toBe('NO_CAREGIVER_SUBSCRIPTION');
    });

    it('rejects reminder if caregiver is opted out', () => {
      const sub = createSubmission();
      const optedOutSub: CaregiverSubscriptionRecord = {
        ...mockSubscription,
        state: 'OPTED_OUT',
        consentProvided: false,
      };
      const evalRes = scheduler.evaluateReminder(sub, optedOutSub, daytime);
      expect(evalRes.eligible).toBe(false);
      expect(evalRes.reason).toBe('CAREGIVER_OPTED_OUT');
    });

    it('rejects reminder if caregiver subscription is paused', () => {
      const sub = createSubmission();
      const pausedSub: CaregiverSubscriptionRecord = {
        ...mockSubscription,
        state: 'PAUSED',
      };
      const evalRes = scheduler.evaluateReminder(sub, pausedSub, daytime);
      expect(evalRes.eligible).toBe(false);
      expect(evalRes.reason).toBe('CAREGIVER_SUBSCRIPTION_PAUSED');
    });

    it('rejects reminder if caregiver consent does not include DOCUMENTS category', () => {
      const sub = createSubmission();
      const noDocsSub: CaregiverSubscriptionRecord = {
        ...mockSubscription,
        consentCategories: ['CLINICAL_FOLLOWUP'],
      };
      const evalRes = scheduler.evaluateReminder(sub, noDocsSub, daytime);
      expect(evalRes.eligible).toBe(false);
      expect(evalRes.reason).toBe('DOCUMENT_CATEGORY_CONSENT_MISSING');
    });
  });

  describe('3. Cadence and Frequency Limits', () => {
    const day1 = new Date('2026-10-23T08:30:00.000Z'); // 14:00 IST Day 1
    const day1Plus5Hours = new Date('2026-10-23T13:30:00.000Z'); // 19:00 IST Day 1
    const day2 = new Date('2026-10-24T09:00:00.000Z'); // 14:30 IST Day 2
    const day3 = new Date('2026-10-25T09:00:00.000Z'); // 14:30 IST Day 3

    it('allows 1st reminder, blocks immediate 2nd reminder within 24h, allows 2nd after 24h, and caps at max 2', () => {
      const sub = createSubmission();

      // 1. First evaluation: eligible
      const firstEval = scheduler.evaluateReminder(sub, mockSubscription, day1);
      expect(firstEval.eligible).toBe(true);
      expect(firstEval.outboundPayload?.templateName).toBe('childcare_doc_reminder_neutral');
      expect(firstEval.reminderRecord?.reminderId).toBeDefined();

      // Simulate dispatch
      scheduler.recordDispatch(firstEval.reminderRecord!.reminderId, day1.toISOString());

      // 2. Evaluation 5 hours later -> blocked by 24h cadence
      const tooSoon = scheduler.evaluateReminder(sub, mockSubscription, day1Plus5Hours);
      expect(tooSoon.eligible).toBe(false);
      expect(tooSoon.reason).toContain('CADENCE_COOLDOWN_ACTIVE');

      // 3. Evaluation on Day 2 (after 24 hours) -> eligible for 2nd reminder
      const secondEval = scheduler.evaluateReminder(sub, mockSubscription, day2);
      expect(secondEval.eligible).toBe(true);

      // Simulate 2nd dispatch
      scheduler.recordDispatch(secondEval.reminderRecord!.reminderId, day2.toISOString());

      // 4. Evaluation on Day 3 -> capped at max 2 reminders
      const thirdEval = scheduler.evaluateReminder(sub, mockSubscription, day3);
      expect(thirdEval.eligible).toBe(false);
      expect(thirdEval.reason).toBe('MAX_REMINDER_COUNT_REACHED');
    });
  });

  describe('4. Privacy-Preserving Notification Content', () => {
    it('ensures notification text NEVER contains clinical/sensitive data', () => {
      const mrText = scheduler.buildNeutralReminderText('mr');
      const hiText = scheduler.buildNeutralReminderText('hi');
      const enText = scheduler.buildNeutralReminderText('en');

      for (const text of [mrText, hiText, enText]) {
        // Must NOT contain sensitive clinical or identification terms
        expect(text).not.toContain('HIV');
        expect(text).not.toContain('Viral');
        expect(text).not.toContain('Aadhaar');
        expect(text).not.toContain('Bank');
        expect(text).not.toContain('Account');
        expect(text).not.toContain('CH-');
        // Must contain clear instructions and opt-out
        expect(text).toContain('STOP');
      }
    });
  });

  describe('5. Auto-Cancellation on Document Receipt', () => {
    const daytime = new Date('2026-10-23T08:30:00.000Z');

    it('automatically cancels scheduled reminders when missing document is received and stored', async () => {
      const sub = createSubmission();
      docService.registerSubmission(sub);

      // 1. Evaluate and schedule reminder
      const evalRes = scheduler.evaluateReminder(sub, mockSubscription, daytime);
      expect(evalRes.eligible).toBe(true);

      const reminderBefore = scheduler.getReminder(sub.id);
      expect(reminderBefore?.status).toBe('SCHEDULED');

      // 2. Inbound document upload of the missing passbookPhoto
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const jpegBody = Buffer.alloc(100, 0x12);
      const fakeJpegBytes = Buffer.concat([jpegHeader, jpegBody]);
      const actualChecksum = crypto.createHash('sha256').update(fakeJpegBytes).digest('hex');

      const uploadResult = await docService.handleInboundDocumentUpload({
        eventId: 'evt_upload_999',
        fromPhone: '+919876543210',
        submissionId: sub.id,
        docType: 'passbookPhoto',
        mediaId: 'media_passbook_01',
        mimeType: 'image/jpeg',
        byteSize: fakeJpegBytes.length,
        sha256Checksum: actualChecksum,
        rawBytes: fakeJpegBytes,
        timestamp: new Date().toISOString(),
      });

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.isUploaded).toBe(true);

      // 3. Verify that the scheduled reminder was AUTO-CANCELLED
      const reminderAfter = scheduler.getReminder(sub.id);
      expect(reminderAfter?.status).toBe('CANCELLED_DOCUMENT_RECEIVED');
      expect(reminderAfter?.cancelledAt).toBeDefined();
      expect(reminderAfter?.cancelReason).toContain('passbookPhoto');

      // 4. Subsequent evaluation reports NO_DOCUMENTS_MISSING
      const updatedSub = docService.getSubmission(sub.id)!;
      const subsequentEval = scheduler.evaluateReminder(updatedSub, mockSubscription, daytime);
      expect(subsequentEval.eligible).toBe(false);
      expect(subsequentEval.reason).toBe('NO_DOCUMENTS_MISSING');
    });
  });
});
