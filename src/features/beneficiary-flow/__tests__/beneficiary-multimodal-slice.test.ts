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
    gateway = new AIMultimodalGateway({ syntheticTestMode: true });
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

  describe('Persistent Beneficiary State Safety Gates', () => {
    it('enforces mandatory affirmative consent before allowing document intake', async () => {
      const session = createInitialSession();
      session.consentProvided = false;
      session.state = 'CONSENT_PENDING';

      // Non-affirmative / random query
      const res1 = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_consent_01',
        timestamp: '1729500900',
        type: 'text',
        textBody: 'What documents do you need?',
      });

      expect(res1.updatedSession.consentProvided).toBe(false);
      expect(res1.updatedSession.state).toBe('CONSENT_PENDING');
      expect(res1.response.nextExpectedAction).toBe('AWAIT_CONSENT');
      expect(res1.response.textMessage).toMatch(/संमती आवश्यक|consent/i);

      // Caregiver gives affirmative consent ("होय, संमती आहे")
      const res2 = await stateMachine.processInbound(res1.updatedSession, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_consent_02',
        timestamp: '1729500950',
        type: 'text',
        textBody: 'होय, संमती आहे',
      });

      expect(res2.updatedSession.consentProvided).toBe(true);
      expect(res2.updatedSession.consentRecordedAt).toBeDefined();
      expect(res2.updatedSession.contactPermission).toBe(true);
    });

    it('enforces immediate opt-out on STOP keywords and ceases automated prompts', async () => {
      const session = createInitialSession();
      session.state = 'AWAITING_DOCUMENT';

      // Caregiver sends STOP
      const res = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_stop_01',
        timestamp: '1729501000',
        type: 'text',
        textBody: 'STOP',
      });

      expect(res.updatedSession.optedOut).toBe(true);
      expect(res.updatedSession.optedOutAt).toBeDefined();
      expect(res.updatedSession.state).toBe('OPTED_OUT');
      expect(res.response.nextExpectedAction).toBe('OPTED_OUT');
      expect(res.response.textMessage).toMatch(/थांबवले आहे|stopped/i);

      // Subsequent message while opted-out remains halted
      const res2 = await stateMachine.processInbound(res.updatedSession, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_stop_02',
        timestamp: '1729501050',
        type: 'text',
        textBody: 'Are you there?',
      });
      expect(res2.updatedSession.optedOut).toBe(true);
      expect(res2.response.nextExpectedAction).toBe('OPTED_OUT');
    });

    it('handles sibling / multi-child disambiguation without dropping context', async () => {
      const session = createInitialSession();
      // Caregiver has 2 registered children
      (session as any).associatedChildIds = ['CH-***-001', 'CH-***-002'];
      session.selectedChildId = undefined;
      session.state = 'AWAITING_DOCUMENT';

      // Arbitrary greeting -> Prompts for child selection
      const res1 = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_sib_01',
        timestamp: '1729501100',
        type: 'text',
        textBody: 'Hello',
      });

      expect(res1.updatedSession.state).toBe('SIBLING_SELECTION');
      expect(res1.response.nextExpectedAction).toBe('AWAIT_CHILD_SELECTION');
      expect(res1.response.textMessage).toContain('1. Child (CH-***-001)');
      expect(res1.response.textMessage).toContain('2. Child (CH-***-002)');

      // Caregiver selects child 2
      const res2 = await stateMachine.processInbound(res1.updatedSession, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_sib_02',
        timestamp: '1729501150',
        type: 'text',
        textBody: '2',
      });

      expect(res2.updatedSession.selectedChildId).toBe('CH-***-002');
      expect(res2.updatedSession.state).toBe('AWAITING_DOCUMENT');
      expect(res2.response.nextExpectedAction).toBe('AWAIT_PHOTO');
    });

    it('records received document metadata and human handoff records accurately', async () => {
      const session = createInitialSession();
      session.state = 'AWAITING_DOCUMENT';

      const cleanPhoto = Buffer.from('VALID_CLEAR_PASSBOOK_JPEG_HEADER_0xFF_0xD8_0xFF_CLEAN_TEXT');
      const res = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_upload_audit_01',
        timestamp: '1729501200',
        type: 'image',
        mediaBuffer: cleanPhoto,
        mimeType: 'image/jpeg',
      });

      expect(res.updatedSession.state).toBe('COMPLETED');
      expect(res.updatedSession.receivedDocuments).toBeDefined();
      expect(res.updatedSession.receivedDocuments!['passbookPhoto']?.status).toBe('UPLOADED');
      expect(res.updatedSession.receivedDocuments!['passbookPhoto']?.fileUri).toContain('tigris://');
    });

    it('rejects negative and ambiguous responses in CONSENT_PENDING, including "I do not agree" and "not yes"', async () => {
      const session = createInitialSession();
      session.consentProvided = false;
      session.state = 'CONSENT_PENDING';

      // 1. "I do not agree"
      const res1 = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_neg_01',
        timestamp: '1729501300',
        type: 'text',
        textBody: 'I do not agree',
      });
      expect(res1.updatedSession.consentProvided).toBe(false);
      expect(res1.updatedSession.state).toBe('CONSENT_PENDING');
      expect(res1.response.nextExpectedAction).toBe('AWAIT_CONSENT');
      expect(res1.response.textMessage).toMatch(/संमती नाकारली|declined consent/i);

      // 2. "not yes"
      const res2 = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_neg_02',
        timestamp: '1729501350',
        type: 'text',
        textBody: 'not yes',
      });
      expect(res2.updatedSession.consentProvided).toBe(false);
      expect(res2.updatedSession.state).toBe('CONSENT_PENDING');
      expect(res2.response.nextExpectedAction).toBe('AWAIT_CONSENT');

      // 3. Quoted text containing previous "YES" prompt, but user says "नाही" (no)
      const res3 = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_neg_03',
        timestamp: '1729501400',
        type: 'text',
        textBody: '> Alliance India requires your explicit consent. Reply YES or 1 to confirm.\nनाही, मला नको',
      });
      expect(res3.updatedSession.consentProvided).toBe(false);
      expect(res3.updatedSession.state).toBe('CONSENT_PENDING');
      expect(res3.response.nextExpectedAction).toBe('AWAIT_CONSENT');

      // 4. Delayed reply / photo upload while consent is still pending
      const dummyPhoto = Buffer.from('VALID_CLEAR_PASSBOOK_JPEG_HEADER_0xFF_0xD8_0xFF_CLEAN_TEXT');
      const res4 = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_neg_04',
        timestamp: '1729501450',
        type: 'image',
        mediaBuffer: dummyPhoto,
        mimeType: 'image/jpeg',
      });
      expect(res4.updatedSession.consentProvided).toBe(false);
      expect(res4.updatedSession.state).toBe('CONSENT_PENDING');
      expect(res4.response.nextExpectedAction).toBe('AWAIT_CONSENT');
      // Document must not be accepted or uploaded without consent
      expect(res4.updatedSession.receivedDocuments).toBeUndefined();
    });

    it('ensures "1" used for language or child selection does not grant consent', async () => {
      // 1. In LANGUAGE_SELECTION, sending "1" selects Marathi
      const sessionLang = createInitialSession();
      sessionLang.consentProvided = true; // Consent was already explicitly handled
      sessionLang.state = 'LANGUAGE_SELECTION';

      const resLang = await stateMachine.processInbound(sessionLang, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_lang_01',
        timestamp: '1729501500',
        type: 'text',
        textBody: '1',
      });
      expect(resLang.updatedSession.preferredLanguage).toBe('mr');
      expect(resLang.updatedSession.languageSelectionConfirmed).toBe(true);
      expect(resLang.updatedSession.state).toBe('AWAITING_DOCUMENT');
      expect(resLang.response.nextExpectedAction).toBe('AWAIT_PHOTO');

      // 2. In SIBLING_SELECTION, sending "1" selects Child 1
      const sessionSib = createInitialSession();
      sessionSib.consentProvided = true;
      (sessionSib as any).associatedChildIds = ['CH-***-001', 'CH-***-002'];
      sessionSib.selectedChildId = undefined;
      sessionSib.state = 'SIBLING_SELECTION';

      const resSib = await stateMachine.processInbound(sessionSib, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_sib_sel_01',
        timestamp: '1729501550',
        type: 'text',
        textBody: '1',
      });
      expect(resSib.updatedSession.selectedChildId).toBe('CH-***-001');
      expect(resSib.updatedSession.state).toBe('AWAITING_DOCUMENT');
      expect(resSib.response.nextExpectedAction).toBe('AWAIT_PHOTO');
    });

    it('enforces STOP and wrong-number handling with precedence across all states', async () => {
      // 1. Wrong number during CONSENT_PENDING
      const session1 = createInitialSession();
      session1.consentProvided = false;
      session1.state = 'CONSENT_PENDING';

      const res1 = await stateMachine.processInbound(session1, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_wrong_01',
        timestamp: '1729501600',
        type: 'text',
        textBody: 'wrong number, not me',
      });
      expect(res1.updatedSession.optedOut).toBe(true);
      expect(res1.updatedSession.optOutReason).toBe('WRONG_NUMBER');
      expect(res1.updatedSession.state).toBe('OPTED_OUT');
      expect(res1.response.nextExpectedAction).toBe('OPTED_OUT');

      // 2. Wrong number in Marathi during SIBLING_SELECTION
      const session2 = createInitialSession();
      session2.consentProvided = true;
      (session2 as any).associatedChildIds = ['CH-***-001', 'CH-***-002'];
      session2.state = 'SIBLING_SELECTION';

      const res2 = await stateMachine.processInbound(session2, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_wrong_02',
        timestamp: '1729501650',
        type: 'text',
        textBody: 'हा माझा नंबर नाही, चुकीचा नंबर',
      });
      expect(res2.updatedSession.optedOut).toBe(true);
      expect(res2.updatedSession.optOutReason).toBe('WRONG_NUMBER');
      expect(res2.updatedSession.state).toBe('OPTED_OUT');
      expect(res2.response.nextExpectedAction).toBe('OPTED_OUT');
    });

    it('proves persistence and handoff boundaries (in-memory store does not survive restart)', async () => {
      // 1. Persistence boundary check: InMemorySessionStore truthfully returns false
      expect(sessionStore.survivesProcessRestart()).toBe(false);

      // 2. Handoff boundary check: humanHandoff is an in-memory marker, not an external DB transaction
      const session = createInitialSession();
      session.state = 'AWAITING_DOCUMENT';

      const res = await stateMachine.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_handoff_01',
        timestamp: '1729501700',
        type: 'text',
        textBody: 'Please help, connect me to coordinator',
      });

      expect(res.updatedSession.state).toBe('ESCALATED_TO_CSC');
      expect(res.updatedSession.isEscalated).toBe(true);
      expect(res.updatedSession.humanHandoff).toBeDefined();
      expect(res.updatedSession.humanHandoff?.isEscalated).toBe(true);
      expect(res.updatedSession.humanHandoff?.caseworkerTicketId).toMatch(/^CSC-TKT-/);
      expect(res.updatedSession.durableTaskCreationPending).toBe(true);
      expect(res.response.isDispatched).toBe(false);
    });

    it('proves honest fallback when automated vision QA is unavailable (NOT_ASSESSED)', async () => {
      // Production-like gateway with zero keys and syntheticTestMode false
      const nonSyntheticGateway = new AIMultimodalGateway({ syntheticTestMode: false });
      const sm = new BeneficiaryStateMachine(nonSyntheticGateway);

      const session = createInitialSession();
      session.state = 'AWAITING_DOCUMENT';

      const unassessedImage = Buffer.from('ANY_REAL_IMAGE_WITHOUT_AI_KEYS');
      const res = await sm.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_honest_01',
        timestamp: '1729501800',
        type: 'image',
        mediaBuffer: unassessedImage,
        mimeType: 'image/jpeg',
      });

      // Does NOT increment retry count, does NOT fail or loop
      expect(res.updatedSession.retryCount).toBe(0);
      expect(res.updatedSession.qualityAssessmentPending).toBe(true);
      expect(res.updatedSession.state).toBe('COMPLETED');
      expect(res.updatedSession.receivedDocuments?.['passbookPhoto']?.status).toBe('UPLOADED');
      expect(res.updatedSession.receivedDocuments?.['passbookPhoto']?.qualityAssessmentPending).toBe(true);
      expect(res.response.isDispatched).toBe(false);
      expect(res.response.textMessage).toMatch(/स्वयंचलित तपासणी अनुपलब्ध|manual|पडताळणी/);
    });

    it('proves honest speech handling when voice note is in unsupported Indian language', async () => {
      // Default gateway (Canary/Parakeet do NOT support Marathi)
      const honestGw = new AIMultimodalGateway({ syntheticTestMode: false });
      const sm = new BeneficiaryStateMachine(honestGw);

      const session = createInitialSession();
      session.state = 'AWAITING_DOCUMENT';

      const audioBuffer = Buffer.from('REAL_MARATHI_VOICE_NOTE');
      const res = await sm.processInbound(session, {
        fromPhone: TEST_PHONE,
        messageId: 'msg_voice_unsupported_01',
        timestamp: '1729501900',
        type: 'audio',
        mediaBuffer: audioBuffer,
        mimeType: 'audio/ogg; codecs=opus',
      });

      // Does not hallucinate transcription; informs caregiver to type or ask for help
      expect(res.updatedSession.state).toBe('AWAITING_DOCUMENT');
      expect(res.response.isDispatched).toBe(false);
      expect(res.response.textMessage).toMatch(/व्हॉईस मेसेज ऐकणे सध्या शक्य नाही|मजकूर/);
    });
  });
});
