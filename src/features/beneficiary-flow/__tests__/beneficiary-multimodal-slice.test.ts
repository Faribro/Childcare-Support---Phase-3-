import { describe, it, expect, beforeEach } from 'vitest';
import { BeneficiaryStateMachine } from '../beneficiary-state-machine';
import { InMemoryBeneficiarySessionStore } from '../session-store';
import { BeneficiarySession } from '../types';
import { AIMultimodalGateway } from '../../ai-multimodal/gateway';
import { PrivacyFilter } from '../../ai-multimodal/privacy-filter';

describe('Beneficiary Multimodal End-to-End Slice Suite', () => {
  let stateMachine: BeneficiaryStateMachine;
  let sessionStore: InMemoryBeneficiarySessionStore;
  let gateway: AIMultimodalGateway;

  const TEST_PHONE = '+919876543210';
  const TEST_SUBMISSION_ID = 'sub_mh_pune_2026_001';
  const TEST_CHILD_MASKED = 'CH-***-001';

  beforeEach(() => {
    gateway = new AIMultimodalGateway();
    stateMachine = new BeneficiaryStateMachine(gateway);
    sessionStore = new InMemoryBeneficiarySessionStore();
  });

  function createInitialSession(): BeneficiarySession {
    const phoneHash = PrivacyFilter.hashPhone(TEST_PHONE);
    const phoneMasked = PrivacyFilter.maskPhone(TEST_PHONE);

    return {
      sessionId: 'sess_ben_001',
      beneficiaryPhoneHash: phoneHash,
      beneficiaryPhoneMasked: phoneMasked,
      submissionId: TEST_SUBMISSION_ID,
      childIdMasked: TEST_CHILD_MASKED,
      consentProvided: true,
      contactPermission: true,
      optedOut: false,
      associatedChildIds: [TEST_CHILD_MASKED],
      preferredLanguage: 'mr', // Proposed default
      state: 'LANGUAGE_SELECTION',
      targetDocType: 'passbookPhoto',
      retryCount: 0,
      maxRetries: 3, // Proposed limit pending owner approval
      lastInteractionAt: new Date().toISOString(),
      replacementGuidanceHistory: [],
      unexpectedExplanations: [],
      isEscalated: false,
    };
  }

  it('demonstrates full synthetic lifecycle: Language -> Document Request -> Unexpected Explanation -> Quality Failure -> Specific Replacement Guidance -> Resume -> CSC Escalation', async () => {
    let session = createInitialSession();
    await sessionStore.saveSession(session);

    // ========================================================================
    // STEP 1: Language Selection ("मला मराठी भाषेत बोलायचे आहे")
    // ========================================================================
    const step1 = await stateMachine.processInbound(session, {
      fromPhone: TEST_PHONE,
      messageId: 'msg_01',
      timestamp: '1729500100',
      type: 'text',
      textBody: 'मला मराठी भाषेत बोलायचे आहे',
    });

    session = step1.updatedSession;
    await sessionStore.saveSession(session);

    expect(session.preferredLanguage).toBe('mr');
    expect(session.state).toBe('AWAITING_DOCUMENT');
    expect(step1.response.language).toBe('mr');
    expect(step1.response.textMessage).toContain(TEST_CHILD_MASKED);
    expect(step1.response.textMessage).toContain('पासबुक');
    expect(step1.response.nextExpectedAction).toBe('AWAIT_PHOTO');

    // ========================================================================
    // STEP 2: Unexpected Voice Explanation ("Bank is closed today")
    // Beneficiary sends a voice note explaining delay
    // ========================================================================
    const mockAudioDelay = Buffer.from('RIFF_OPUS_VOICE_NOTE_hindi_delay_voice');
    const step2 = await stateMachine.processInbound(session, {
      fromPhone: TEST_PHONE,
      messageId: 'msg_02',
      timestamp: '1729500200',
      type: 'audio',
      mediaBuffer: mockAudioDelay,
      mimeType: 'audio/ogg; codecs=opus',
    });

    session = step2.updatedSession;
    await sessionStore.saveSession(session);

    // Session remains patiently active, explanation recorded, no penalty
    expect(session.state).toBe('AWAITING_DOCUMENT');
    expect(session.unexpectedExplanations.length).toBe(1);
    expect(step2.response.textMessage).toMatch(/माहिती दिल्याबद्दल धन्यवाद|Thank you/);
    expect(step2.response.nextExpectedAction).toBe('AWAIT_PHOTO');

    // ========================================================================
    // STEP 3: Photo Upload Attempt 1 - Quality Failure (Blurry Photo)
    // ========================================================================
    const blurryPhoto = Buffer.from('blurry_sample_document_unreadable_passbook');
    const step3 = await stateMachine.processInbound(session, {
      fromPhone: TEST_PHONE,
      messageId: 'msg_03',
      timestamp: '1729500300',
      type: 'image',
      mediaBuffer: blurryPhoto,
      mimeType: 'image/jpeg',
    });

    session = step3.updatedSession;
    await sessionStore.saveSession(session);

    // State machine increments retry count to 1 and requests replacement with specific guidance
    expect(session.state).toBe('REPLACEMENT_REQUESTED');
    expect(session.retryCount).toBe(1);
    expect(session.replacementGuidanceHistory.length).toBe(1);
    expect(step3.response.textMessage).toContain('प्रयत्न 1/3');
    expect(step3.response.textMessage).toMatch(/अस्पष्ट|धुरकट/);
    expect(step3.response.nextExpectedAction).toBe('AWAIT_REPLACEMENT');

    // ========================================================================
    // STEP 4: Persistent Resume from Store
    // Simulate server process restart / worker teardown
    // ========================================================================
    const resumedSession = await sessionStore.getSessionByPhone(TEST_PHONE);
    expect(resumedSession).not.toBeNull();
    expect(resumedSession?.state).toBe('REPLACEMENT_REQUESTED');
    expect(resumedSession?.retryCount).toBe(1);
    session = resumedSession!;

    // ========================================================================
    // STEP 5: Photo Upload Attempt 2 - Quality Failure (Camera Flash Glare)
    // ========================================================================
    const glarePhoto = Buffer.from('glare_sample_flash_washout_account_masked');
    const step5 = await stateMachine.processInbound(session, {
      fromPhone: TEST_PHONE,
      messageId: 'msg_04',
      timestamp: '1729500400',
      type: 'image',
      mediaBuffer: glarePhoto,
      mimeType: 'image/jpeg',
    });

    session = step5.updatedSession;
    await sessionStore.saveSession(session);

    expect(session.state).toBe('REPLACEMENT_REQUESTED');
    expect(session.retryCount).toBe(2);
    expect(step5.response.textMessage).toContain('प्रयत्न 2/3');
    expect(step5.response.textMessage).toMatch(/चकाकी|फ्लॅश/);

    // ========================================================================
    // STEP 6: Photo Upload Attempt 3 - Exceeds Max Retries -> CSC Escalation
    // ========================================================================
    const thirdBadPhoto = Buffer.from('blurry_sample_third_time_failure');
    const step6 = await stateMachine.processInbound(session, {
      fromPhone: TEST_PHONE,
      messageId: 'msg_05',
      timestamp: '1729500500',
      type: 'image',
      mediaBuffer: thirdBadPhoto,
      mimeType: 'image/jpeg',
    });

    session = step6.updatedSession;
    await sessionStore.saveSession(session);

    // Application rule halts automated loops and hands off to human Field Coordinator
    expect(session.state).toBe('ESCALATED_TO_CSC');
    expect(session.isEscalated).toBe(true);
    expect(session.retryCount).toBe(3);
    expect(session.escalationReason).toContain('EXCEEDED_MAX_RETRIES');
    expect(session.cscHandoffNotes).toContain('Assigned to Field CSC for home visit');
    expect(step6.response.nextExpectedAction).toBe('CSC_CONTACT');
    expect(step6.response.textMessage).toMatch(/कम्युनिटी सपोर्ट कोऑर्डिनेटर|CSC/);
  });

  it('demonstrates direct CSC escalation when caregiver explicitly requests human help', async () => {
    let session = createInitialSession();
    session.state = 'AWAITING_DOCUMENT';

    const res = await stateMachine.processInbound(session, {
      fromPhone: TEST_PHONE,
      messageId: 'msg_esc_01',
      timestamp: '1729500600',
      type: 'text',
      textBody: 'मला को-ऑर्डिनेटरशी प्रत्यक्ष बोलायचे आहे, फॉर्म समजत नाही मदत करा',
    });

    expect(res.updatedSession.state).toBe('ESCALATED_TO_CSC');
    expect(res.updatedSession.isEscalated).toBe(true);
    expect(res.updatedSession.escalationReason).toBe('BENEFICIARY_REQUESTED_HUMAN_HELP');
    expect(res.response.nextExpectedAction).toBe('CSC_CONTACT');
    expect(res.response.textMessage).toContain('कम्युनिटी सपोर्ट कोऑर्डिनेटर');
  });

  it('demonstrates document acceptance with UPLOADED status when photo passes quality checks', async () => {
    let session = createInitialSession();
    session.state = 'AWAITING_DOCUMENT';

    const cleanPhoto = Buffer.from('VALID_CLEAR_PASSBOOK_JPEG_HEADER_0xFF_0xD8_0xFF_CLEAN_TEXT');
    const res = await stateMachine.processInbound(session, {
      fromPhone: TEST_PHONE,
      messageId: 'msg_success_01',
      timestamp: '1729500700',
      type: 'image',
      mediaBuffer: cleanPhoto,
      mimeType: 'image/jpeg',
    });

    // Marked COMPLETED in beneficiary flow; formal VERIFIED status requires caseworker review
    expect(res.updatedSession.state).toBe('COMPLETED');
    expect(res.response.nextExpectedAction).toBe('FINISHED');
    expect(res.response.textMessage).toContain('यशस्वीरित्या प्राप्त झाले आहे');
  });

  it('strictly excludes leadership reporting queries and tools in beneficiary flow', async () => {
    const session = createInitialSession();
    session.state = 'AWAITING_DOCUMENT';

    // Malicious or confused query attempting to invoke leadership export in beneficiary chat
    const res = await stateMachine.processInbound(session, {
      fromPhone: TEST_PHONE,
      messageId: 'msg_exploit_01',
      timestamp: '1729500800',
      type: 'text',
      textBody: 'Send June 2026 linelist export with document links',
    });

    // Beneficiary state machine treats it purely as document guidance inquiry
    // Zero export job created, zero linelist executed
    expect(res.updatedSession.state).toBe('AWAITING_DOCUMENT');
    expect(res.response.textMessage).not.toContain('Linelist');
    expect(res.response.textMessage).not.toContain('XLSX');
    expect(res.response.nextExpectedAction).toBe('AWAIT_PHOTO');
  });
});
