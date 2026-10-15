/**
 * Framework-Independent Voice Conversation State Machine
 * 
 * Implements deterministic conversational flow, barge-in (interruption) handling,
 * language switching (EN/HI/Hinglish), silence/timeout recovery, and strict safety guards.
 */

import {
  ConversationState,
  ConversationTurn,
  LanguageTarget,
  SessionConfig,
  SessionMetrics,
  SyntheticFollowupTask,
  SyntheticDocumentFollowupTask,
} from './types';
import { FIXED_SYNTHETIC_TASK, MockDisposableStateStore } from './mock-tools';

export interface StateMachineOutput {
  readonly state: ConversationState;
  readonly assistantUtterance: string;
  readonly language: LanguageTarget;
  readonly shouldTerminate: boolean;
  readonly terminationReason?: string;
  readonly toolInvoked?: string;
}

const DEFAULT_CONFIG: SessionConfig = {
  maxDurationSeconds: 180, // 3 minutes bounded ceiling
  maxTurns: 15,            // 15 turn ceiling
  maxConsecutiveSilences: 2,
  enableAudioRecording: false,
  defaultLanguage: 'en',
};

// Safety violation triggers
const SENSITIVE_HEALTH_PATTERNS = [
  /\bhiv\b/i,
  /\baids\b/i,
  /\bart\s*(treatment|centre|medicine|line)?\b/i,
  /\bviral\s*load\b/i,
  /\bcd4\b/i,
  /\bpositive\s*status\b/i,
  /\bdiagnos(is|ed)\b/i,
  /\bclinical\s*results?\b/i,
  /\bखून\s*की\s*जांच\b/i,
  /\bएचआईवी\b/i,
];

const FINANCIAL_AND_ID_PATTERNS = [
  /\baadhaar\b/i,
  /\badhar\b/i,
  /\botp\b/i,
  /\bbank\s*(account|details|number)\b/i,
  /\bcvv\b/i,
  /\bpin\b/i,
  /\bcredit\s*card\b/i,
  /\bdebit\s*card\b/i,
  /\bupi\b/i,
  /\bpayment\b/i,
  /\bmoney\b/i,
  /\bपैसे\b/i,
  /\bखाता\s*संख्या\b/i,
  /\bआधार\b/i,
];

export class VoiceConversationStateMachine {
  private state: ConversationState = 'IDLE';
  private config: SessionConfig;
  private store: MockDisposableStateStore;
  private task: SyntheticFollowupTask | SyntheticDocumentFollowupTask;

  private turns: ConversationTurn[] = [];
  private currentLanguage: LanguageTarget = 'en';
  private sessionStartTime: number = 0;
  private consecutiveSilences: number = 0;
  private interruptionsCount: number = 0;
  private unclearSpeechCount: number = 0;
  private isAssistantSpeaking: boolean = false;
  private isTerminated: boolean = false;
  private terminationReason?: string;

  constructor(
    store: MockDisposableStateStore,
    config: Partial<SessionConfig> = {},
    syntheticTask: SyntheticFollowupTask | SyntheticDocumentFollowupTask = FIXED_SYNTHETIC_TASK
  ) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.task = syntheticTask;
    this.currentLanguage = this.config.defaultLanguage;
  }

  public getState(): ConversationState {
    return this.state;
  }

  public getTurns(): readonly ConversationTurn[] {
    return [...this.turns];
  }

  public isSpeaking(): boolean {
    return this.isAssistantSpeaking;
  }

  public getSessionDuration(): number {
    if (this.sessionStartTime === 0) return 0;
    return Math.floor((Date.now() - this.sessionStartTime) / 1000);
  }

  /**
   * Initializes session: identifies as automated assistant and asks about convenience/privacy.
   */
  public startSession(preferredLanguage: LanguageTarget = 'en'): StateMachineOutput {
    this.sessionStartTime = Date.now();
    this.currentLanguage = preferredLanguage;
    this.state = 'IDENTITY_ANNOUNCED';

    const isDocTask = 'missingDocument' in this.task;
    let greeting: string;
    if (preferredLanguage === 'hi') {
      greeting = isDocTask
        ? 'नमस्ते। मैं बाल पोषण सहायता के लिए आवश्यक दस्तावेज़ के संबंध में बात करने वाला एक ऑटोमेटेड प्रोग्राम असिस्टेंट बोल रहा हूँ। क्या यह बात करने के लिए सही और सुरक्षित समय है?'
        : 'नमस्ते। मैं एक ऑटोमेटेड प्रोग्राम असिस्टेंट बोल रहा हूँ। क्या यह आपसे बात करने के लिए सही और सुरक्षित समय है?';
    } else if (preferredLanguage === 'hinglish') {
      greeting = isDocTask
        ? 'Namaste. Main child nutrition support ke missing document ke regarding call kar raha hoon. Kya yeh baat karne ke liye convenient aur safe time hai?'
        : 'Namaste. Main ek automated programme assistant bol raha hoon. Kya yeh aapse baat karne ke liye convenient aur safe time hai?';
    } else {
      greeting = isDocTask
        ? 'Hello. I am an automated programme assistant calling regarding a missing document for child nutrition support. Is this a convenient and private time to speak?'
        : 'Hello. I am an automated programme assistant. Is this a convenient and private time to speak?';
    }

    this.isAssistantSpeaking = true;
    this.state = 'PRIVACY_CONSENT_PENDING';

    this.recordTurn('assistant', greeting, preferredLanguage);

    return {
      state: this.state,
      assistantUtterance: greeting,
      language: this.currentLanguage,
      shouldTerminate: false,
    };
  }

  /**
   * Handles user barge-in / interruption while assistant is speaking.
   * Cancels speaking state immediately and transitions back to listening.
   */
  public handleInterruption(): { interrupted: boolean; message: string } {
    if (!this.isAssistantSpeaking) {
      return { interrupted: false, message: 'Assistant was not speaking; no barge-in triggered.' };
    }

    this.isAssistantSpeaking = false;
    this.interruptionsCount++;
    const lastTurn = this.turns[this.turns.length - 1];
    if (lastTurn && lastTurn.speaker === 'assistant') {
      // Mark turn as interrupted
      this.turns[this.turns.length - 1] = {
        ...lastTurn,
        interrupted: true,
      };
    }

    return {
      interrupted: true,
      message: 'Barge-in handled: Assistant audio playback aborted and conversation listening resumed.',
    };
  }

  /**
   * Simulates assistant finishing speech normally.
   */
  public finishAssistantSpeech(): void {
    this.isAssistantSpeaking = false;
  }

  /**
   * Handles user silence or voice timeout.
   */
  public handleSilence(): StateMachineOutput {
    if (this.isTerminated) {
      return this.generateTerminatedOutput('Session already terminated');
    }

    this.consecutiveSilences++;
    this.recordTurn('user', '[Silence / No speech detected]', this.currentLanguage);

    if (this.consecutiveSilences > this.config.maxConsecutiveSilences) {
      return this.terminateSession(
        'TERMINATED_BOUNDED_DURATION',
        this.currentLanguage === 'hi'
          ? 'शायद आप अभी व्यस्त हैं। हम बाद में संपर्क करेंगे। धन्यवाद।'
          : this.currentLanguage === 'hinglish'
          ? 'Aap shayad abhi busy hain. Hum baad mein follow-up karenge. Dhanyawad.'
          : 'It seems you may be busy right now. We will follow up later. Thank you for your time.',
        'Exceeded maximum consecutive silences'
      );
    }

    const promptText =
      this.currentLanguage === 'hi'
        ? 'माफ़ कीजियेगा, क्या आप अभी भी लाइन पर हैं? क्या आप मुझे सुन पा रहे हैं?'
        : this.currentLanguage === 'hinglish'
        ? 'Sorry, kya aap line par hain? Kya aap mujhe sun pa rahe hain?'
        : 'I apologize, are you still there? Can you hear me clearly?';

    this.isAssistantSpeaking = true;
    this.recordTurn('assistant', promptText, this.currentLanguage);

    return {
      state: this.state,
      assistantUtterance: promptText,
      language: this.currentLanguage,
      shouldTerminate: false,
    };
  }

  /**
   * Handles unclear speech or low ASR confidence.
   */
  public handleUnclearSpeech(): StateMachineOutput {
    if (this.isTerminated) {
      return this.generateTerminatedOutput('Session already terminated');
    }

    this.unclearSpeechCount++;
    this.recordTurn('user', '[Unclear audio / Unrecognized utterance]', this.currentLanguage);

    const clarifyText =
      this.currentLanguage === 'hi'
        ? 'माफ़ कीजियेगा, मैं आपकी आवाज़ ठीक से नहीं समझ पाया। क्या आप दोहरा सकते हैं, या आप किसी स्टाफ सदस्य से बात करना चाहेंगे?'
        : this.currentLanguage === 'hinglish'
        ? 'Sorry, main theek se sun nahi paya. Kya aap repeat kar sakte hain, ya aap staff member se baat karna chahenge?'
        : 'I am sorry, I did not catch that clearly. Could you please repeat, or would you prefer to speak with a staff member?';

    this.isAssistantSpeaking = true;
    this.recordTurn('assistant', clarifyText, this.currentLanguage);

    return {
      state: this.state,
      assistantUtterance: clarifyText,
      language: this.currentLanguage,
      shouldTerminate: false,
    };
  }

  /**
   * Main conversational turn processing.
   */
  public processUserInput(rawInput: string, latencyMs: number = 0): StateMachineOutput {
    if (this.isTerminated) {
      return this.generateTerminatedOutput('Session already terminated');
    }

    // Reset silence counter on speech
    this.consecutiveSilences = 0;
    const input = rawInput.trim();

    // Language detection heuristics
    const detectedLang = this.detectLanguage(input);
    if (detectedLang !== this.currentLanguage) {
      this.currentLanguage = detectedLang;
    }

    this.recordTurn('user', input, this.currentLanguage, latencyMs);

    // Enforce Turn and Duration Ceilings
    if (this.turns.length >= this.config.maxTurns) {
      return this.terminateSession(
        'TERMINATED_USAGE_LIMIT',
        this.getLocalizedText({
          en: 'We have reached our scheduled time limit for this call. A staff member can follow up with any remaining questions. Thank you.',
          hi: 'इस कॉल की निर्धारित समय सीमा समाप्त हो गई है। हमारी टीम आवश्यकता पड़ने पर संपर्क करेगी। धन्यवाद।',
          hinglish: 'Is call ki time limit poori ho gayi hai. Humari team aage follow up karegi. Dhanyawad.',
        }),
        'Max turns reached'
      );
    }

    if (this.getSessionDuration() >= this.config.maxDurationSeconds) {
      return this.terminateSession(
        'TERMINATED_BOUNDED_DURATION',
        this.getLocalizedText({
          en: 'Our bounded call duration has ended. Thank you for your time.',
          hi: 'हमारी बातचीत का समय पूरा हो गया है। समय देने के लिए धन्यवाद।',
          hinglish: 'Hamari call ka samay poora ho gaya hai. Dhanyawad.',
        }),
        'Max duration reached'
      );
    }

    // 1. Safety Filter - Prohibited Health / Clinical Queries
    if (this.containsSensitiveHealthData(input)) {
      const refusalMsg = this.getLocalizedText({
        en: 'For your privacy and safety, I cannot discuss medical records or clinical health details. Please consult your local health worker or designated centre for clinical inquiries.',
        hi: 'आपकी गोपनीयता और सुरक्षा के लिए, मैं मेडिकल रिकॉर्ड या स्वास्थ्य जांच के विवरण पर चर्चा नहीं कर सकता। कृपया अपने स्थानीय स्वास्थ्य कार्यकर्ता या केंद्र से संपर्क करें।',
        hinglish: 'Aapki privacy ke liye main medical ya clinical details discuss nahi kar sakta. Kripya apne health centre se contact karein.',
      });
      this.isAssistantSpeaking = true;
      this.recordTurn('assistant', refusalMsg, this.currentLanguage);
      return {
        state: this.state,
        assistantUtterance: refusalMsg,
        language: this.currentLanguage,
        shouldTerminate: false,
      };
    }

    // 2. Safety Filter - Prohibited Financial Credentials / Gov ID Queries
    if (this.containsFinancialOrIdRequests(input)) {
      const financialRefusal = this.getLocalizedText({
        en: 'Our programme never asks for Aadhaar numbers, bank account details, OTPs, or payments. All child nutrition support services are completely free. Please never share financial details.',
        hi: 'हमारा कार्यक्रम कभी भी आधार नंबर, बैंक खाता, ओटीपी या पैसे नहीं मांगता। सभी पोषण सहायता सेवाएं पूरी तरह से निःशुल्क हैं। कृपया वित्तीय जानकारी साझा न करें।',
        hinglish: 'Humara programme kabhi bhi Aadhaar, bank details, OTP ya paise nahi maangta. Sabhi services bilkul free hain. Kripya banking details share na karein.',
      });
      this.isAssistantSpeaking = true;
      this.recordTurn('assistant', financialRefusal, this.currentLanguage);
      return {
        state: this.state,
        assistantUtterance: financialRefusal,
        language: this.currentLanguage,
        shouldTerminate: false,
      };
    }

    // 3. User requests STOP / Opt-Out
    if (this.matchesOptOut(input)) {
      this.store.recordMockOptOut({
        reason: `User explicitly said: "${input}"`,
        optOutType: 'CALLS',
      });
      return this.terminateSession(
        'OPT_OUT_PROCESSED',
        this.getLocalizedText({
          en: 'This is a test; your preference has been recorded for this test session only. Have a good day.',
          hi: 'यह एक परीक्षण है; आपकी प्राथमिकता केवल इस परीक्षण सत्र के लिए दर्ज की गई है। धन्यवाद।',
          hinglish: 'Yeh ek test hai; aapki preference sirf is test session ke liye record ki gayi hai. Dhanyawad.',
        }),
        'User opted out'
      );
    }

    // 4. User indicates WRONG NUMBER
    if (this.matchesWrongNumber(input)) {
      this.store.recordMockContactOutcome({
        taskId: this.task.taskId,
        finalState: 'WRONG_NUMBER_TERMINATED',
        durationSeconds: this.getSessionDuration(),
        turnsCount: this.turns.length,
        notes: `Recipient stated wrong number: "${input}"`,
      });
      return this.terminateSession(
        'WRONG_NUMBER_TERMINATED',
        this.getLocalizedText({
          en: 'This is a test; no records were changed. Have a good day.',
          hi: 'यह एक परीक्षण है; कोई रिकॉर्ड नहीं बदला गया है। धन्यवाद।',
          hinglish: 'Yeh ek test hai; koi records change nahi kiye gaye hain. Dhanyawad.',
        }),
        'Wrong number reported'
      );
    }

    // 5. User requests HUMAN STAFF MEMBER / Clinician
    if (this.matchesHumanRequest(input)) {
      this.store.requestMockStaffHandoff({
        taskId: this.task.taskId,
        reason: `Caregiver requested human assistance: "${input}"`,
        priority: 'NORMAL',
      });
      return this.terminateSession(
        'HUMAN_HANDOFF',
        this.getLocalizedText({
          en: 'This is a test; no real callback or staff notification was created. Thank you.',
          hi: 'यह एक परीक्षण है; कोई वास्तविक कॉलबैक या स्टाफ सूचना नहीं बनाई गई है। धन्यवाद।',
          hinglish: 'Yeh ek test hai; koi real callback ya staff notification create nahi hua hai. Dhanyawad.',
        }),
        'Human handoff requested'
      );
    }

    // 6. User says CALL LATER / BUSY / UNAVAILABLE
    if (this.matchesCallLater(input)) {
      this.store.recordMockCallbackRequest({
        taskId: this.task.taskId,
        requestedWindow: 'Caregiver requested later callback',
        notes: `User stated: "${input}"`,
      });
      return this.terminateSession(
        'CARE_UNAVAILABLE_TERMINATED',
        this.getLocalizedText({
          en: 'This is a test; no real callback or staff notification was created. Thank you for your time.',
          hi: 'यह एक परीक्षण है; कोई वास्तविक कॉलबैक या स्टाफ सूचना नहीं बनाई गई है। आपके समय के लिए धन्यवाद।',
          hinglish: 'Yeh ek test hai; koi real callback ya staff notification create nahi hua hai. Aapke samay ke liye shukriya.',
        }),
        'Caregiver unavailable / Call later'
      );
    }

    // State: PRIVACY_CONSENT_PENDING
    if (this.state === 'PRIVACY_CONSENT_PENDING') {
      if (this.matchesConsentYes(input)) {
        const isDocTask = 'missingDocument' in this.task;
        if (isDocTask) {
          this.state = 'WHATSAPP_HANDOFF_OFFERED';
          const docTask = this.task as SyntheticDocumentFollowupTask;
          const currentDoc = this.store.getDocument(this.task.taskId) || docTask.missingDocument;
          const explanation = this.getLocalizedText({
            en: `Thank you. Our records show that the ${currentDoc.documentName} for ${currentDoc.childName} is missing. You can take a photo and upload it via WhatsApp. Would you like me to send a secure upload link to this WhatsApp number?`,
            hi: `धन्यवाद। हमारे रिकॉर्ड के अनुसार ${currentDoc.childName} का ${currentDoc.documentName} अभी जमा नहीं हुआ है। आप व्हाट्सएप पर फोटो अपलोड कर सकते हैं। क्या मैं इस नंबर पर सुरक्षित व्हाट्सएप लिंक भेज दूँ?`,
            hinglish: `Shukriya. Records ke mutabiq ${currentDoc.childName} ka ${currentDoc.documentName} missing hai. Aap photo WhatsApp par upload kar sakte hain. Kya main is number par secure WhatsApp link bhej doon?`,
          });
          this.isAssistantSpeaking = true;
          this.recordTurn('assistant', explanation, this.currentLanguage);
          return {
            state: this.state,
            assistantUtterance: explanation,
            language: this.currentLanguage,
            shouldTerminate: false,
            toolInvoked: 'get_synthetic_followup_task()',
          };
        }

        this.state = 'TASK_EXPLANATION';
        const taskInfo = this.store.getSyntheticFollowupTask(this.task.taskId);
        const explanation = this.getLocalizedText({
          en: `Thank you. ${taskInfo.taskDescription} Would you like general instructions, or would you like to request a callback?`,
          hi: `धन्यवाद। ${taskInfo.taskDescription} क्या आप सामान्य निर्देश सुनना चाहते हैं, या कॉलबैक का अनुरोध करना चाहते हैं?`,
          hinglish: `Shukriya. ${taskInfo.taskDescription} Kya aap general instructions sunna chahte hain, ya callback request karna chahte hain?`,
        });
        this.isAssistantSpeaking = true;
        this.state = 'AWAITING_USER_INPUT';
        this.recordTurn('assistant', explanation, this.currentLanguage);
        return {
          state: this.state,
          assistantUtterance: explanation,
          language: this.currentLanguage,
          shouldTerminate: false,
          toolInvoked: 'get_synthetic_followup_task()',
        };
      } else if (this.matchesConsentNo(input)) {
        this.store.recordMockCallbackRequest({
          taskId: this.task.taskId,
          requestedWindow: 'Private time callback needed',
          notes: 'Caregiver reported not a convenient/private time.',
        });
        return this.terminateSession(
          'CARE_UNAVAILABLE_TERMINATED',
          this.getLocalizedText({
            en: 'This is a test; no real callback or staff notification was created. Thank you for your time.',
            hi: 'यह एक परीक्षण है; कोई वास्तविक कॉलबैक या स्टाफ सूचना नहीं बनाई गई है। आपके समय के लिए धन्यवाद।',
            hinglish: 'Yeh ek test hai; koi real callback ya staff notification create nahi hua hai. Aapke samay ke liye shukriya.',
          }),
          'Consent declined / Inconvenient time'
        );
      }
    }

    // State: WHATSAPP_HANDOFF_OFFERED or DOCUMENT_STATUS_CHECKED
    if (this.state === 'WHATSAPP_HANDOFF_OFFERED' || this.state === 'DOCUMENT_STATUS_CHECKED') {
      // 1. Strict Stored Document Status Enforcement:
      // Verbal claim alone CANNOT mark completion. We inspect stored record status.
      if (this.matchesClaimedSent(input)) {
        const currentDoc = this.store.getDocument(this.task.taskId);
        const status = currentDoc?.status || 'MISSING';

        if (status === 'VERIFIED' || status === 'UPLOADED') {
          this.store.recordMockContactOutcome({
            taskId: this.task.taskId,
            finalState: 'COMPLETED',
            durationSeconds: this.getSessionDuration(),
            turnsCount: this.turns.length,
            notes: `Caregiver stated document sent; confirmed by stored ${status} status.`,
          });
          return this.terminateSession(
            'COMPLETED',
            this.getLocalizedText({
              en: 'I checked our system, and the document is confirmed received and verified. Your follow-up task is complete. Thank you!',
              hi: 'मैंने सिस्टम में जांच की है, और आपका दस्तावेज़ प्राप्त और सत्यापित हो गया है। आपका कार्य पूर्ण हो चुका है। धन्यवाद!',
              hinglish: 'Maine system check kiya, aur document verify ho chuka hai. Aapka task complete hai. Dhanyawad!',
            }),
            'Document verified via stored status check'
          );
        } else {
          // Status is MISSING or PENDING_UPLOAD - Reject verbal completion claim
          this.state = 'DOCUMENT_STATUS_CHECKED';
          const pendingNotice = this.getLocalizedText({
            en: 'I checked our system, but the document has not yet been received in our records. It is still marked as pending. Would you like me to send a WhatsApp upload link so you can submit the photo?',
            hi: 'मैंने सिस्टम में जांच की है, लेकिन दस्तावेज़ अभी तक हमारे रिकॉर्ड में प्राप्त नहीं हुआ है। यह अभी भी लंबित है। क्या मैं व्हाट्सएप अपलोड लिंक भेज दूँ?',
            hinglish: 'Maine system check kiya, par document abhi tak record mein receive nahi hua hai. Yeh abhi bhi pending hai. Kya main WhatsApp upload link bhej doon?',
          });
          this.isAssistantSpeaking = true;
          this.recordTurn('assistant', pendingNotice, this.currentLanguage);
          return {
            state: this.state,
            assistantUtterance: pendingNotice,
            language: this.currentLanguage,
            shouldTerminate: false,
            toolInvoked: 'check_stored_document_status()',
          };
        }
      }

      // 2. User declines WhatsApp upload (Prioritize refusal over agreement)
      if (
        this.matchesNo(input) ||
        /\b(don'?t\s*use|no\s*whatsapp|not\s*on\s*whatsapp|nahi\s*chahiye)\b/i.test(input)
      ) {
        this.store.requestMockStaffHandoff({
          taskId: this.task.taskId,
          reason: 'Caregiver declined WhatsApp photo-upload handoff; physical verification assistance requested.',
          priority: 'NORMAL',
        });
        return this.terminateSession(
          'HUMAN_HANDOFF',
          this.getLocalizedText({
            en: 'This is a test; no real callback or staff notification was created. A staff member can follow up with physical submission details. Thank you.',
            hi: 'यह एक परीक्षण है; कोई वास्तविक कॉलबैक या स्टाफ सूचना नहीं बनाई गई है। हमारी टीम आपसे व्यक्तिगत सहायता के लिए संपर्क करेगी। धन्यवाद।',
            hinglish: 'Yeh ek test hai; koi real callback create nahi hua hai. Humari team physically verification ke liye follow-up karegi. Dhanyawad.',
          }),
          'Caregiver declined WhatsApp handoff; routed to human staff'
        );
      }

      // 3. User agrees to WhatsApp photo upload handoff
      if (this.matchesWhatsAppAgreement(input) || this.matchesYes(input)) {
        const handoff = this.store.recordMockWhatsAppHandoff({
          taskId: this.task.taskId,
        });
        this.store.recordMockContactOutcome({
          taskId: this.task.taskId,
          finalState: 'COMPLETED',
          durationSeconds: this.getSessionDuration(),
          turnsCount: this.turns.length,
          notes: `WhatsApp photo upload link dispatched to ${handoff.phoneMasked} (Token: ${handoff.uploadLinkToken})`,
        });
        return this.terminateSession(
          'WHATSAPP_HANDOFF_DISPATCHED',
          this.getLocalizedText({
            en: 'This is a test; a mock WhatsApp upload link has been sent to your registered number ending in 123. Please upload the photo when ready. Our team will review it. Thank you and have a good day.',
            hi: 'यह एक परीक्षण है; आपके पंजीकृत नंबर पर एक व्हाट्सएप अपलोड लिंक भेज दिया गया है। फोटो अपलोड करने के बाद हमारी टीम जांच करेगी। धन्यवाद।',
            hinglish: 'Yeh ek test hai; aapke registered number par WhatsApp upload link bhej diya gaya hai. Photo upload ke baad team verify karegi. Dhanyawad.',
          }),
          'WhatsApp upload handoff link dispatched'
        );
      }
    }

    // State: AWAITING_USER_INPUT (General inquiry & neutral task completion)
    if (this.state === 'AWAITING_USER_INPUT' || this.state === 'TASK_EXPLANATION') {
      if (this.matchesInstructionsRequest(input)) {
        const instructions = this.getLocalizedText({
          en: 'General instructions: Keep your verification forms handy and contact your field office during regular working hours for any queries. Would you like a callback, or can I close this call?',
          hi: 'सामान्य निर्देश: कृपया अपने सत्यापन प्रपत्र तैयार रखें और किसी भी प्रश्न के लिए नियमित कार्य समय के दौरान अपने फील्ड कार्यालय से संपर्क करें। क्या आप कॉलबैक चाहते हैं, या कॉल समाप्त करें?',
          hinglish: 'General instructions: Apne verification forms ready rakhein aur working hours mein office se contact karein. Kya aap callback chahte hain ya call end karein?',
        });
        this.isAssistantSpeaking = true;
        this.recordTurn('assistant', instructions, this.currentLanguage);
        return {
          state: this.state,
          assistantUtterance: instructions,
          language: this.currentLanguage,
          shouldTerminate: false,
        };
      }

      if (this.matchesYes(input) || this.matchesCloseCall(input)) {
        this.store.recordMockContactOutcome({
          taskId: this.task.taskId,
          finalState: 'COMPLETED',
          durationSeconds: this.getSessionDuration(),
          turnsCount: this.turns.length,
          notes: 'Caregiver acknowledged follow-up task assistance.',
        });
        return this.terminateSession(
          'COMPLETED',
          this.getLocalizedText({
            en: 'This is a test; the mock follow-up task has been marked complete in this local test session. Thank you.',
            hi: 'यह एक परीक्षण है; इस स्थानीय परीक्षण सत्र में कार्य पूर्ण चिह्नित कर दिया गया है। धन्यवाद।',
            hinglish: 'Yeh ek test hai; is local test session mein task complete mark ho gaya hai. Dhanyawad.',
          }),
          'Task confirmed and completed'
        );
      } else if (this.matchesNo(input)) {
        this.store.requestMockStaffHandoff({
          taskId: this.task.taskId,
          reason: 'Caregiver requested additional follow-up assistance.',
          priority: 'NORMAL',
        });
        return this.terminateSession(
          'HUMAN_HANDOFF',
          this.getLocalizedText({
            en: 'This is a test; no real callback or staff notification was created. Thank you.',
            hi: 'यह एक परीक्षण है; कोई वास्तविक कॉलबैक या स्टाफ सूचना नहीं बनाई गई है। धन्यवाद।',
            hinglish: 'Yeh ek test hai; koi real callback ya staff notification create nahi hua hai. Dhanyawad.',
          }),
          'Follow-up assistance escalated to mock handoff'
        );
      }
    }

    // General fallback response
    const fallbackResponse = this.getLocalizedText({
      en: 'I am an automated assistant. A staff-created follow-up task needs assistance. Say "instructions" for general guidance, "callback" for a callback request, or "staff" to request a person.',
      hi: 'मैं एक ऑटोमेटेड असिस्टेंट हूँ। एक स्टाफ-द्वारा बनाए गए फॉलो-अप कार्य में सहायता की आवश्यकता है। निर्देशों के लिए "निर्देश", कॉलबैक के लिए "कॉलबैक", या व्यक्ति के लिए "स्टाफ" कहें।',
      hinglish: 'Main ek automated assistant hoon. Follow-up task ke liye "instructions" bolein, callback ke liye "callback", ya person ke liye "staff" bolein.',
    });
    this.isAssistantSpeaking = true;
    this.recordTurn('assistant', fallbackResponse, this.currentLanguage);
    return {
      state: this.state,
      assistantUtterance: fallbackResponse,
      language: this.currentLanguage,
      shouldTerminate: false,
    };
  }

  public terminateSession(
    finalState: ConversationState,
    closingUtterance: string,
    reason: string
  ): StateMachineOutput {
    this.state = finalState;
    this.isTerminated = true;
    this.isAssistantSpeaking = true;
    this.terminationReason = reason;

    this.recordTurn('assistant', closingUtterance, this.currentLanguage);

    return {
      state: this.state,
      assistantUtterance: closingUtterance,
      language: this.currentLanguage,
      shouldTerminate: true,
      terminationReason: reason,
    };
  }

  public getMetrics(): SessionMetrics {
    const latencies = this.turns
      .filter((t) => t.speaker === 'user' && typeof t.latencyMs === 'number' && t.latencyMs > 0)
      .map((t) => t.latencyMs as number);

    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    const languagesUsed = Array.from(
      new Set(this.turns.map((t) => t.language).filter(Boolean))
    ) as LanguageTarget[];

    return {
      durationSeconds: this.getSessionDuration(),
      totalTurns: this.turns.length,
      interruptionsCount: this.interruptionsCount,
      silenceTimeoutsCount: this.consecutiveSilences,
      unclearSpeechCount: this.unclearSpeechCount,
      detectedLanguages: languagesUsed,
      averageTurnLatencyMs: avgLatency,
      endReason: this.terminationReason || 'Normal conclusion',
    };
  }

  // --- Helper Validation & Matching Methods ---

  private recordTurn(
    speaker: 'assistant' | 'user' | 'system',
    text: string,
    language?: LanguageTarget,
    latencyMs?: number
  ): void {
    this.turns.push({
      id: `turn-${this.turns.length + 1}-${Date.now()}`,
      speaker,
      text,
      timestamp: Date.now(),
      language,
      latencyMs,
    });
  }

  private detectLanguage(text: string): LanguageTarget {
    const devanagariRegex = /[\u0900-\u097F]/;
    if (devanagariRegex.test(text)) {
      return 'hi';
    }

    const hinglishMarkers = [
      /\bnamaste\b/i,
      /\bhaan\b/i,
      /\bnahi\b/i,
      /\bkaise\b/i,
      /\bkripya\b/i,
      /\bshukriya\b/i,
      /\bdhanyawad\b/i,
      /\bbaad\s*mein\b/i,
      /\bbaat\b/i,
      /\bkya\b/i,
      /\bhain\b/i,
      /\bhoon\b/i,
      /\bgulat\b/i,
      /\bgalat\b/i,
    ];
    if (hinglishMarkers.some((r) => r.test(text))) {
      return 'hinglish';
    }

    return this.currentLanguage || 'en';
  }

  private containsSensitiveHealthData(text: string): boolean {
    return SENSITIVE_HEALTH_PATTERNS.some((pattern) => pattern.test(text));
  }

  private containsFinancialOrIdRequests(text: string): boolean {
    return FINANCIAL_AND_ID_PATTERNS.some((pattern) => pattern.test(text));
  }

  private matchesOptOut(text: string): boolean {
    return /\b(stop|opt\s*out|unsubscribe|don'?t\s*call|never\s*call|बंद\s*करो|कॉल\s*मत\s*करो|call\s*mat\s*karo)\b/i.test(
      text
    );
  }

  private matchesWrongNumber(text: string): boolean {
    return /\b(wrong\s*number|galat\s*number|गलत\s*नंबर|who\s*is\s*this|not\s*my\s*name)\b/i.test(text);
  }

  private matchesHumanRequest(text: string): boolean {
    return /\b(human|person|agent|staff|officer|supervisor|insaan|madam|sir|इंसान|स्टाफ)\b/i.test(text);
  }

  private matchesCallLater(text: string): boolean {
    return /\b(call\s*later|busy|later|afterwards|baad\s*me|bad\s*me|abhi\s*busy|व्यस्त|बाद\s*में)\b/i.test(text);
  }

  private matchesConsentYes(text: string): boolean {
    const ascii = /\b(yes|yeah|sure|okay|ok|fine|haan|ha|haa|theek\s*hai|boliye)\b/i.test(text);
    const unicode = /(?:^|[^\p{L}\p{N}])(हाँ|हां|हाँजी|बोलिये|ठीक\s*है)(?:$|[^\p{L}\p{N}])/u.test(text);
    return ascii || unicode;
  }

  private matchesConsentNo(text: string): boolean {
    const ascii = /\b(no|nope|not\s*now|busy|later|nahi|nahin|mat\s*karo)\b/i.test(text);
    const unicode = /(?:^|[^\p{L}\p{N}])(नहीं|मत\s*करो|व्यस्त)(?:$|[^\p{L}\p{N}])/u.test(text);
    return ascii || unicode;
  }

  private matchesYes(text: string): boolean {
    const ascii = /\b(yes|got\s*it|received|haan|mil\s*gaya|ha)\b/i.test(text);
    const unicode = /(?:^|[^\p{L}\p{N}])(हाँ|हां|मिल\s*गया|प्राप्त)(?:$|[^\p{L}\p{N}])/u.test(text);
    return ascii || unicode;
  }

  private matchesNo(text: string): boolean {
    const ascii = /\b(no|didn'?t\s*get|not\s*received|nahi\s*mila|nahi)\b/i.test(text);
    const unicode = /(?:^|[^\p{L}\p{N}])(नहीं|नहीं\s*मिला)(?:$|[^\p{L}\p{N}])/u.test(text);
    return ascii || unicode;
  }

  private matchesClaimedSent(text: string): boolean {
    const ascii = /\b(already\s*(sent|submitted|uploaded)|i\s*sent\s*it|sent\s*it|maine\s*(bhej\s*diya|upload\s*kar\s*diya)|bhej\s*diya|de\s*diya|pehle\s*hi)\b/i.test(
      text
    );
    const unicode = /(?:^|[^\p{L}\p{N}])(जमा\s*कर\s*दिया|भेज\s*दिया|अपलोड\s*कर\s*दिया)(?:$|[^\p{L}\p{N}])/u.test(text);
    return ascii || unicode;
  }

  private matchesWhatsAppAgreement(text: string): boolean {
    const ascii = /\b(whatsapp|send\s*(it|link)?|upload|bhej\s*do|link\s*bhejo|link|haan\s*bhej|yes|sure|okay|ok|haan|theek\s*hai)\b/i.test(
      text
    );
    const unicode = /(?:^|[^\p{L}\p{N}])(हाँ|हां|व्हाट्सएप|लिंक|भेज\s*दीजिये|भेज\s*दो)(?:$|[^\p{L}\p{N}])/u.test(text);
    return ascii || unicode;
  }

  private matchesInstructionsRequest(text: string): boolean {
    const ascii = /\b(instruction|instructions|guidance|help|details)\b/i.test(text);
    const unicode = /(?:^|[^\p{L}\p{N}])(निर्देश|जानकारी|मदद)(?:$|[^\p{L}\p{N}])/u.test(text);
    return ascii || unicode;
  }

  private matchesCloseCall(text: string): boolean {
    const ascii = /\b(close|end|finish|done|all\s*good|theek\s*hai)\b/i.test(text);
    const unicode = /(?:^|[^\p{L}\p{N}])(बस|समाप्त|बंद\s*करो)(?:$|[^\p{L}\p{N}])/u.test(text);
    return ascii || unicode;
  }

  private getLocalizedText(options: { en: string; hi: string; hinglish: string }): string {
    if (this.currentLanguage === 'hi') return options.hi;
    if (this.currentLanguage === 'hinglish') return options.hinglish;
    return options.en;
  }

  private generateTerminatedOutput(reason: string): StateMachineOutput {
    return {
      state: this.state,
      assistantUtterance: 'Session is terminated.',
      language: this.currentLanguage,
      shouldTerminate: true,
      terminationReason: reason,
    };
  }
}
