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
  private task: SyntheticFollowupTask;

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
    syntheticTask: SyntheticFollowupTask = FIXED_SYNTHETIC_TASK
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

    let greeting: string;
    if (preferredLanguage === 'hi') {
      greeting =
        'नमस्ते। मैं कम्युनिटी चाइल्ड न्यूट्रिशन सपोर्ट प्रोग्राम से एक ऑटोमेटेड असिस्टेंट बोल रहा हूँ। क्या यह आपसे बात करने के लिए सही और सुरक्षित समय है?';
    } else if (preferredLanguage === 'hinglish') {
      greeting =
        'Namaste. Main Community Child Nutrition Support Programme se ek automated assistant bol raha hoon. Kya yeh aapse baat karne ke liye convenient aur safe time hai?';
    } else {
      greeting =
        'Hello. I am an automated programme assistant calling from the Community Child Nutrition Support Programme. Is this a convenient and private time for you to speak?';
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
          en: 'Understood. We have recorded your request to stop calls. You will not receive automated calls from us. Have a good day.',
          hi: 'समझ गया। हमने कॉल रोकने का आपका अनुरोध दर्ज कर लिया है। अब आपको कॉल नहीं की जाएगी। धन्यवाद।',
          hinglish: 'Samajh gaya. Humne calls stop karne ki request record kar li hai. Aage se automated calls nahi aayengi. Dhanyawad.',
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
          en: 'I apologize for the misunderstanding. We will remove this number from our contact task. Have a good day.',
          hi: 'माफ़ कीजियेगा, गलत नंबर पर कॉल करने के लिए खेद है। हम यह नंबर हटा देंगे। धन्यवाद।',
          hinglish: 'Sorry, lagta hai galat number dial ho gaya. Hum is number ko update kar denge. Dhanyawad.',
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
          en: 'Certainly. I have requested our programme staff to follow up with you directly by phone. Thank you for letting us know.',
          hi: 'बिल्कुल। मैंने हमारे प्रोग्राम स्टाफ को आपसे सीधे बात करने का अनुरोध भेज दिया है। वे आपसे संपर्क करेंगे। धन्यवाद।',
          hinglish: 'Bilkul. Maine staff member ko aapse directly baat karne ke liye request bhej di hai. Wo aapse contact karenge. Dhanyawad.',
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
          en: 'No problem at all. We have recorded that this was not a convenient time and will follow up later. Thank you.',
          hi: 'कोई बात नहीं। हमने दर्ज कर लिया है कि अभी सही समय नहीं है। हम बाद में संपर्क करेंगे। धन्यवाद।',
          hinglish: 'Koi baat nahi. Humne note kar liya hai aur baad mein call karenge. Dhanyawad.',
        }),
        'Caregiver unavailable / Call later'
      );
    }

    // State: PRIVACY_CONSENT_PENDING
    if (this.state === 'PRIVACY_CONSENT_PENDING') {
      if (this.matchesConsentYes(input)) {
        this.state = 'TASK_EXPLANATION';
        const taskInfo = this.store.getSyntheticFollowupTask(this.task.taskId);
        const explanation = this.getLocalizedText({
          en: `Thank you. This call is regarding ${taskInfo.programmeContext}. Our records show a follow-up task to verify your nutrition ration package. Did you receive your monthly nutrition kit?`,
          hi: `धन्यवाद। यह कॉल ${taskInfo.programmeContext} के संबंध में है। हम यह जानने के लिए कॉल कर रहे हैं कि क्या आपको इस महीने का पोषण राशन किट मिल गया है?`,
          hinglish: `Shukriya. Yeh call ${taskInfo.programmeContext} ke bare mein hai. Kya aapko is month ka nutrition ration kit mil gaya hai?`,
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
            en: 'Understood. We will not take your time now. A staff member will follow up at a more convenient time. Thank you.',
            hi: 'समझ गया। हम अभी आपका समय नहीं लेंगे। स्टाफ बाद में उपयुक्त समय पर संपर्क करेगा। धन्यवाद।',
            hinglish: 'Samajh gaya. Hum baad mein convenient time par follow-up karenge. Dhanyawad.',
          }),
          'Consent declined / Inconvenient time'
        );
      }
    }

    // State: AWAITING_USER_INPUT (General inquiry & kit verification)
    if (this.state === 'AWAITING_USER_INPUT' || this.state === 'TASK_EXPLANATION') {
      if (this.matchesYes(input)) {
        this.store.recordMockContactOutcome({
          taskId: this.task.taskId,
          finalState: 'COMPLETED',
          durationSeconds: this.getSessionDuration(),
          turnsCount: this.turns.length,
          notes: 'Caregiver confirmed receipt of nutrition ration package.',
        });
        return this.terminateSession(
          'COMPLETED',
          this.getLocalizedText({
            en: 'Wonderful, thank you for confirming. Please remember that all infant weight and growth checks at your local centre are free. Have a safe and healthy week!',
            hi: 'बहुत अच्छा, पुष्टि करने के लिए धन्यवाद। कृपया ध्यान रखें कि केंद्र पर बच्चे का वजन और विकास जांच निःशुल्क है। आपका सप्ताह शुभ हो!',
            hinglish: 'Bohat badiya, confirm karne ke liye shukriya. Centre par bacche ki growth checking bilkul free hai. Have a nice day!',
          }),
          'Task confirmed and completed'
        );
      } else if (this.matchesNo(input)) {
        this.store.requestMockStaffHandoff({
          taskId: this.task.taskId,
          reason: 'Caregiver reported monthly nutrition kit NOT received. Staff follow-up needed.',
          priority: 'HIGH',
        });
        return this.terminateSession(
          'HUMAN_HANDOFF',
          this.getLocalizedText({
            en: 'I have noted that the kit has not been received yet. I am alerting our field staff to check on your delivery and assist you. Thank you for letting us know.',
            hi: 'मैंने नोट कर लिया है कि अभी तक किट नहीं मिला है। मैं हमारे फील्ड स्टाफ को सूचित कर रहा हूँ ताकि वे आपकी सहायता कर सकें। धन्यवाद।',
            hinglish: 'Maine note kar liya hai ki kit abhi nahi mila hai. Main field staff ko notify kar raha hoon taaki wo aapki help kar sakein. Dhanyawad.',
          }),
          'Kit not received - escalated to staff'
        );
      }
    }

    // General fallback response
    const fallbackResponse = this.getLocalizedText({
      en: 'I am an automated assistant. If you need any specific guidance or want to leave a message for the team, please let me know, or say "staff" to connect with a person.',
      hi: 'मैं एक ऑटोमेटेड असिस्टेंट हूँ। यदि आपको कोई विशेष जानकारी चाहिए या टीम के लिए कोई संदेश छोड़ना है, तो कृपया बताएं, या स्टाफ से बात करने के लिए "स्टाफ" कहें।',
      hinglish: 'Main ek automated assistant hoon. Agar aapko koi help chahiye ya staff se baat karni hai, toh please batayein.',
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
    return /\b(yes|yeah|sure|okay|ok|fine|haan|ha|haa|हाँ|हां|हाँजी|theek\s*hai|boliye)\b/i.test(text);
  }

  private matchesConsentNo(text: string): boolean {
    return /\b(no|nope|not\s*now|busy|later|nahi|nahin|नहीं|mat\s*karo)\b/i.test(text);
  }

  private matchesYes(text: string): boolean {
    return /\b(yes|got\s*it|received|haan|mil\s*gaya|ha|हाँ|हां|मिल\s*गया)\b/i.test(text);
  }

  private matchesNo(text: string): boolean {
    return /\b(no|didn'?t\s*get|not\s*received|nahi\s*mila|nahi|नहीं|नहीं\s*मिला)\b/i.test(text);
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
