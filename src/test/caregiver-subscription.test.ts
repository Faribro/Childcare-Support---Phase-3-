import { describe, it, expect, beforeEach } from 'vitest';
import {
  CaregiverSubscriptionStateMachine,
  CaregiverOtpService,
  MemoryCaregiverSubscriptionStore,
  OTP_CONFIG,
} from '@/features/caregiver-subscription';

describe('Caregiver Verification & Subscription State Machine Suite', () => {
  let store: MemoryCaregiverSubscriptionStore;
  let otpService: CaregiverOtpService;
  let stateMachine: CaregiverSubscriptionStateMachine;

  beforeEach(() => {
    store = new MemoryCaregiverSubscriptionStore();
    otpService = new CaregiverOtpService();
    stateMachine = new CaregiverSubscriptionStateMachine(store, otpService);
  });

  describe('1. Phone Normalization and Masking', () => {
    it('normalizes 10-digit Indian phone numbers to E.164 with +91', () => {
      expect(stateMachine.normalizePhoneNumber('9876543210')).toBe('+919876543210');
      expect(stateMachine.normalizePhoneNumber('+91 98765-43210')).toBe('+919876543210');
      expect(stateMachine.normalizePhoneNumber('919876543210')).toBe('+919876543210');
    });

    it('masks phone numbers safely for display without exposing middle digits', () => {
      const masked = stateMachine.maskPhoneNumber('+919876543210');
      expect(masked).toBe('+91 98*** **210');
      expect(masked).not.toContain('76543');
    });

    it('computes deterministic SHA-256 phone hash', () => {
      const hash1 = stateMachine.hashPhoneNumber('+919876543210');
      const hash2 = stateMachine.hashPhoneNumber('+919876543210');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('2. Single-Use OTP Security & Storage Invariants', () => {
    it('generates a 6-digit numeric OTP and does NOT store plaintext in challenge', () => {
      const phoneHash = stateMachine.hashPhoneNumber('+919876543210');
      const result = otpService.createChallenge(phoneHash);

      expect('challenge' in result).toBe(true);
      if ('challenge' in result) {
        expect(result.rawOtp).toMatch(/^\d{6}$/);
        expect(result.challenge.verifierHash).toBeDefined();
        expect(result.challenge.salt).toBeDefined();
        // Critical: plaintext OTP must not exist in challenge object
        expect((result.challenge as any).otp).toBeUndefined();
        expect((result.challenge as any).rawOtp).toBeUndefined();
        expect(result.challenge.attempts).toBe(0);
        expect(result.challenge.maxAttempts).toBe(5);
      }
    });

    it('enforces 60-second cooldown between resend requests', () => {
      const phoneHash = stateMachine.hashPhoneNumber('+919876543210');
      const now = Date.now();
      const first = otpService.createChallenge(phoneHash, null, now);
      expect('challenge' in first).toBe(true);

      if ('challenge' in first) {
        // Request immediately after (10 seconds)
        const second = otpService.createChallenge(phoneHash, first.challenge, now + 10000);
        expect('error' in second).toBe(true);
        if ('error' in second) {
          expect(second.error).toBe('COOLDOWN_ACTIVE');
          expect(second.cooldownRemainingSeconds).toBe(50);
        }

        // Request after 61 seconds -> succeeds
        const third = otpService.createChallenge(phoneHash, first.challenge, now + 61000);
        expect('challenge' in third).toBe(true);
      }
    });

    it('enforces max 5 attempts and locks challenge on 5th failure', () => {
      const phoneHash = stateMachine.hashPhoneNumber('+919876543210');
      const created = otpService.createChallenge(phoneHash);
      if (!('challenge' in created)) throw new Error('Challenge creation failed');

      let current = created.challenge;
      // 4 wrong attempts
      for (let i = 1; i <= 4; i++) {
        const check = otpService.verifyCode(current, '000000');
        expect(check.result.success).toBe(false);
        expect(check.result.reason).toBe('INVALID_CODE');
        expect(check.result.remainingAttempts).toBe(5 - i);
        current = check.updatedChallenge;
      }

      // 5th wrong attempt
      const fifth = otpService.verifyCode(current, '000000');
      expect(fifth.result.success).toBe(false);
      expect(fifth.result.reason).toBe('MAX_ATTEMPTS_EXCEEDED');
      expect(fifth.result.remainingAttempts).toBe(0);

      // Even correct code on locked challenge fails
      const sixth = otpService.verifyCode(fifth.updatedChallenge, created.rawOtp);
      expect(sixth.result.success).toBe(false);
      expect(sixth.result.reason).toBe('MAX_ATTEMPTS_EXCEEDED');
    });

    it('enforces 10-minute expiry', () => {
      const phoneHash = stateMachine.hashPhoneNumber('+919876543210');
      const now = Date.now();
      const created = otpService.createChallenge(phoneHash, null, now);
      if (!('challenge' in created)) throw new Error('Challenge creation failed');

      // Attempt after 11 minutes
      const late = otpService.verifyCode(created.challenge, created.rawOtp, now + 11 * 60 * 1000);
      expect(late.result.success).toBe(false);
      expect(late.result.reason).toBe('EXPIRED');
    });

    it('enforces single-use: verified OTP cannot be reused', () => {
      const phoneHash = stateMachine.hashPhoneNumber('+919876543210');
      const created = otpService.createChallenge(phoneHash);
      if (!('challenge' in created)) throw new Error('Challenge creation failed');

      const first = otpService.verifyCode(created.challenge, created.rawOtp);
      expect(first.result.success).toBe(true);
      expect(first.updatedChallenge.verified).toBe(true);

      const second = otpService.verifyCode(first.updatedChallenge, created.rawOtp);
      expect(second.result.success).toBe(false);
      expect(second.result.reason).toBe('ALREADY_VERIFIED');
    });
  });

  describe('3. Explicit State Machine Lifecycle', () => {
    const testPhone = '+919876543210';
    const testChildId = 'CH-PUN-001';
    const testSubmissionId = 'sub-2026-test-01';

    it('starts at UNVERIFIED and transitions to OTP_PENDING on inbound message', async () => {
      await stateMachine.linkBeneficiary(testPhone, testChildId, testSubmissionId);

      const res = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_01',
        textBody: 'Hello',
      });

      expect(res.record.state).toBe('OTP_PENDING');
      expect(res.rawOtpForTransport).toBeDefined();
      expect(res.response?.nextExpectedState).toBe('OTP_PENDING');
      expect(res.response?.templateName).toBe('caregiver_auth_otp');
    });

    it('transitions from OTP_PENDING to VERIFIED on valid OTP, but DOES NOT auto-subscribe', async () => {
      await stateMachine.linkBeneficiary(testPhone, testChildId, testSubmissionId);
      const step1 = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_01',
        textBody: 'Hi',
      });

      const rawOtp = step1.rawOtpForTransport!;

      const step2 = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_02',
        textBody: `My code is ${rawOtp}`,
      });

      // CRITICAL INVARIANT: State must be VERIFIED, NOT SUBSCRIBED!
      expect(step2.record.state).toBe('VERIFIED');
      expect(step2.record.consentProvided).toBe(false);
      expect(step2.response?.nextExpectedState).toBe('VERIFIED');
      expect(step2.response?.textBody).toContain('पडताळला');
    });

    it('transitions from VERIFIED to SUBSCRIBED only upon explicit affirmative consent', async () => {
      await stateMachine.linkBeneficiary(testPhone, testChildId, testSubmissionId);
      const step1 = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_01',
        textBody: 'Hi',
      });
      await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_02',
        textBody: step1.rawOtpForTransport!,
      });

      // Send affirmative consent
      const step3 = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_03',
        textBody: 'YES',
      });

      expect(step3.record.state).toBe('SUBSCRIBED');
      expect(step3.record.consentProvided).toBe(true);
      expect(step3.record.consentRecordedAt).toBeDefined();
      expect(step3.record.consentCategories).toContain('DOCUMENTS');
      expect(step3.response?.nextExpectedState).toBe('SUBSCRIBED');
    });

    it('transitions from VERIFIED to OPTED_OUT when caregiver declines consent', async () => {
      await stateMachine.linkBeneficiary(testPhone, testChildId, testSubmissionId);
      const step1 = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_01',
        textBody: 'Hi',
      });
      await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_02',
        textBody: step1.rawOtpForTransport!,
      });

      // Send decline
      const step3 = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_03',
        textBody: 'NO',
      });

      expect(step3.record.state).toBe('OPTED_OUT');
      expect(step3.record.consentProvided).toBe(false);
      expect(step3.record.optOutReason).toBe('POLICY_REFUSAL');
      expect(await store.isOptedOut(stateMachine.hashPhoneNumber(testPhone))).toBe(true);
    });

    it('handles STOP keyword in any state and permanently opts out', async () => {
      await stateMachine.linkBeneficiary(testPhone, testChildId, testSubmissionId);

      // Stop even during OTP_PENDING
      const res = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_stop',
        textBody: 'STOP',
      });

      expect(res.record.state).toBe('OPTED_OUT');
      expect(res.record.optOutReason).toBe('STOP');
      expect(await store.isOptedOut(stateMachine.hashPhoneNumber(testPhone))).toBe(true);
    });

    it('handles WRONG NUMBER keyword and classifies reason as WRONG_NUMBER', async () => {
      await stateMachine.linkBeneficiary(testPhone, testChildId, testSubmissionId);

      const res = await stateMachine.handleInboundMessage({
        fromPhone: testPhone,
        messageId: 'msg_wrong',
        textBody: 'This is the wrong number, not my child',
      });

      expect(res.record.state).toBe('OPTED_OUT');
      expect(res.record.optOutReason).toBe('WRONG_NUMBER');
      expect(await store.isOptedOut(stateMachine.hashPhoneNumber(testPhone))).toBe(true);
    });

    it('supports PAUSE and RESUME controls for subscribed caregivers', async () => {
      // Fast forward to SUBSCRIBED
      await stateMachine.linkBeneficiary(testPhone, testChildId, testSubmissionId);
      const step1 = await stateMachine.handleInboundMessage({ fromPhone: testPhone, messageId: 'm1', textBody: 'Hi' });
      await stateMachine.handleInboundMessage({ fromPhone: testPhone, messageId: 'm2', textBody: step1.rawOtpForTransport! });
      await stateMachine.handleInboundMessage({ fromPhone: testPhone, messageId: 'm3', textBody: 'YES' });

      // Pause
      const pauseRes = await stateMachine.handleInboundMessage({ fromPhone: testPhone, messageId: 'm4', textBody: 'PAUSE' });
      expect(pauseRes.record.state).toBe('PAUSED');

      // Resume
      const resumeRes = await stateMachine.handleInboundMessage({ fromPhone: testPhone, messageId: 'm5', textBody: 'RESUME' });
      expect(resumeRes.record.state).toBe('SUBSCRIBED');
    });

    it('handles multi-beneficiary shared phone linking without data cross-contamination', async () => {
      await stateMachine.linkBeneficiary(testPhone, 'CH-PUN-001', 'sub-01');
      await stateMachine.linkBeneficiary(testPhone, 'CH-PUN-002', 'sub-02');

      const phoneHash = stateMachine.hashPhoneNumber(testPhone);
      const sub = await store.getSubscription(phoneHash);

      expect(sub?.linkedChildIdsMasked).toEqual(['CH-PUN-001', 'CH-PUN-002']);
      expect(sub?.linkedSubmissionIds).toEqual(['sub-01', 'sub-02']);
    });
  });
});
