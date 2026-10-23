/**
 * Caregiver Subscription State Machine
 *
 * Implements the explicit, privacy-preserving lifecycle:
 * UNVERIFIED -> OTP_PENDING -> VERIFIED -> SUBSCRIBED -> PAUSED / OPTED_OUT
 *
 * Enforces:
 * 1. Phone number normalization to E.164.
 * 2. Cryptographic single-use OTP generation and timing-safe verification.
 * 3. NO auto-subscription from OTP alone: VERIFIED -> SUBSCRIBED requires affirmative consent.
 * 4. Opt-Out ("STOP", "WRONG NUMBER") halts all proactive dispatches immediately.
 * 5. Multi-child / shared-phone support without leaking child clinical details.
 * 6. Non-blocking integration: PWA intake and offline drafts do not depend on this flow.
 */

import crypto from 'crypto';
import {
  CaregiverLanguage,
  CaregiverSubscriptionRecord,
  CaregiverSubscriptionState,
  InboundCaregiverMessage,
  MessagingConsentCategory,
  OutboundCaregiverResponse,
} from './types';
import { CaregiverOtpService } from './otp-service';
import { ICaregiverSubscriptionStore, MemoryCaregiverSubscriptionStore } from './subscription-store';

export class CaregiverSubscriptionStateMachine {
  private readonly store: ICaregiverSubscriptionStore;
  private readonly otpService: CaregiverOtpService;

  constructor(
    store: ICaregiverSubscriptionStore = new MemoryCaregiverSubscriptionStore(),
    otpService: CaregiverOtpService = new CaregiverOtpService()
  ) {
    this.store = store;
    this.otpService = otpService;
  }

  /**
   * Normalizes any incoming phone string into canonical E.164 format.
   * Strips spaces, hyphens, and leading zeros. Defaults 10-digit Indian numbers to +91.
   */
  public normalizePhoneNumber(phone: string): string {
    const cleaned = (phone || '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 10) return `+91${cleaned}`;
    if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
    return `+${cleaned}`;
  }

  /**
   * Computes SHA-256 hash of normalized phone number for safe indexing.
   */
  public hashPhoneNumber(phoneE164: string): string {
    return crypto.createHash('sha256').update(phoneE164).digest('hex');
  }

  /**
   * Generates display-masked phone number (e.g. "+91 98*** **210").
   */
  public maskPhoneNumber(phoneE164: string): string {
    if (!phoneE164 || phoneE164.length < 8) return '+** ****';
    const country = phoneE164.slice(0, 3);
    const start = phoneE164.slice(3, 5);
    const end = phoneE164.slice(-3);
    return `${country} ${start}*** **${end}`;
  }

  /**
   * Links a beneficiary child record to a caregiver's phone.
   * Non-blocking: Can be called asynchronously when a PWA intake is submitted.
   */
  public async linkBeneficiary(
    phone: string,
    childIdMasked: string,
    submissionId: string
  ): Promise<CaregiverSubscriptionRecord> {
    const normalized = this.normalizePhoneNumber(phone);
    const phoneHash = this.hashPhoneNumber(normalized);
    let record = await this.store.getSubscription(phoneHash);

    const now = new Date().toISOString();
    if (!record) {
      record = {
        subscriptionId: `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        phoneHash,
        phoneMasked: this.maskPhoneNumber(normalized),
        state: 'UNVERIFIED',
        consentProvided: false,
        consentCategories: ['DOCUMENTS'],
        preferredLanguage: 'mr',
        linkedChildIdsMasked: [childIdMasked],
        linkedSubmissionIds: [submissionId],
        createdAt: now,
        updatedAt: now,
      };
    } else {
      if (!record.linkedChildIdsMasked.includes(childIdMasked)) {
        record.linkedChildIdsMasked.push(childIdMasked);
      }
      if (!record.linkedSubmissionIds.includes(submissionId)) {
        record.linkedSubmissionIds.push(submissionId);
      }
      record.updatedAt = now;
    }

    await this.store.saveSubscription(record);
    return record;
  }

  /**
   * Core Inbound Message Processor.
   * Routes inbound message according to current state and user intent.
   */
  public async handleInboundMessage(
    message: InboundCaregiverMessage
  ): Promise<{
    record: CaregiverSubscriptionRecord;
    response?: OutboundCaregiverResponse;
    rawOtpForTransport?: string; // Provided ONLY if an OTP was newly generated for dispatch
  }> {
    const normalizedPhone = this.normalizePhoneNumber(message.fromPhone);
    const phoneHash = this.hashPhoneNumber(normalizedPhone);
    const phoneMasked = this.maskPhoneNumber(normalizedPhone);

    let record = await this.store.getSubscription(phoneHash);
    const now = new Date().toISOString();

    if (!record) {
      record = {
        subscriptionId: `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        phoneHash,
        phoneMasked,
        state: 'UNVERIFIED',
        consentProvided: false,
        consentCategories: ['DOCUMENTS'],
        preferredLanguage: 'mr',
        linkedChildIdsMasked: [],
        linkedSubmissionIds: [],
        createdAt: now,
        updatedAt: now,
      };
    }

    const textRaw = (message.textBody || '').trim();
    const textUpper = textRaw.toUpperCase();

    // =========================================================================
    // 0. GLOBAL OPT-OUT & PAUSE HANDLERS (Applicable in ANY state)
    // =========================================================================
    const isStopWord = [
      'STOP', 'STOP ALL', 'UNSUBSCRIBE', 'QUIT', 'WRONG NUMBER', 'WRONG NO',
      'NOT ME', 'NOT MY CHILD', 'BAND KARA', 'THAMBWA', 'NAKO', 'BAS', 'RUK JAO'
    ].some((k) => textUpper === k || textUpper.startsWith(k) || textUpper.includes(k));

    if (isStopWord) {
      record.state = 'OPTED_OUT';
      record.optedOutAt = now;
      record.optOutReason = textUpper.includes('WRONG') ? 'WRONG_NUMBER' : 'STOP';
      record.consentProvided = false;
      record.updatedAt = now;
      await this.store.saveSubscription(record);
      await this.store.recordOptOut(phoneHash, record.optOutReason);

      return {
        record,
        response: {
          toPhoneMasked: phoneMasked,
          textBody: this.getLocalizedText(record.preferredLanguage, 'OPT_OUT_CONFIRMED'),
          isProactive: false,
          nextExpectedState: 'OPTED_OUT',
        },
      };
    }

    const isPauseWord = ['PAUSE', 'ROKO', 'WAIT'].some((k) => textUpper === k);
    if (isPauseWord && record.state === 'SUBSCRIBED') {
      record.state = 'PAUSED';
      record.updatedAt = now;
      await this.store.saveSubscription(record);

      return {
        record,
        response: {
          toPhoneMasked: phoneMasked,
          textBody: this.getLocalizedText(record.preferredLanguage, 'PAUSED_CONFIRMED'),
          isProactive: false,
          nextExpectedState: 'PAUSED',
        },
      };
    }

    const isResumeWord = ['RESUME', 'START', 'CHALU', 'SHURU', 'UNPAUSE'].some((k) => textUpper === k);
    if (isResumeWord) {
      if (record.state === 'PAUSED') {
        record.state = 'SUBSCRIBED';
        record.updatedAt = now;
        await this.store.saveSubscription(record);

        return {
          record,
          response: {
            toPhoneMasked: phoneMasked,
            textBody: this.getLocalizedText(record.preferredLanguage, 'RESUMED_CONFIRMED'),
            isProactive: false,
            nextExpectedState: 'SUBSCRIBED',
          },
        };
      } else if (record.state === 'OPTED_OUT') {
        // Opted out caregivers must re-verify before resubscribing
        await this.store.clearOptOut(phoneHash);
        record.state = 'UNVERIFIED';
        record.optedOutAt = undefined;
        record.optOutReason = undefined;
        record.updatedAt = now;
        await this.store.saveSubscription(record);

        // Initiate OTP verification
        return await this.initiateOtpVerification(record, normalizedPhone);
      }
    }

    // =========================================================================
    // 1. STATE-SPECIFIC TRANSITIONS
    // =========================================================================
    switch (record.state) {
      case 'UNVERIFIED': {
        // Any inbound greeting or request initiates OTP verification
        return await this.initiateOtpVerification(record, normalizedPhone);
      }

      case 'OTP_PENDING': {
        // Check if user is asking for OTP resend
        const isResend = ['RESEND', 'RESEND OTP', 'CODE AGAIN', 'PUNHA PATHVA', 'OTP WAPAS'].some(
          (k) => textUpper === k
        );
        if (isResend) {
          return await this.resendOtpVerification(record, normalizedPhone);
        }

        // Check if text is a 6-digit OTP code
        const codeMatch = textRaw.match(/\b\d{6}\b/);
        if (!codeMatch) {
          return {
            record,
            response: {
              toPhoneMasked: phoneMasked,
              textBody: this.getLocalizedText(record.preferredLanguage, 'OTP_PROMPT_REMINDER'),
              isProactive: false,
              nextExpectedState: 'OTP_PENDING',
            },
          };
        }

        const candidateCode = codeMatch[0];
        const latestChallenge = await this.store.getLatestOtpChallenge(phoneHash);

        if (!latestChallenge) {
          return await this.initiateOtpVerification(record, normalizedPhone);
        }

        const verification = await this.otpService.verifyCodeAtomic(
          latestChallenge.challengeId,
          async () => await this.store.getLatestOtpChallenge(phoneHash),
          candidateCode,
          async (ch) => {
            await this.store.saveOtpChallenge(ch);
          }
        );

        if (!verification.result.success) {
          let errorKey: string = 'OTP_INVALID';
          if (verification.result.reason === 'MAX_ATTEMPTS_EXCEEDED') {
            errorKey = 'OTP_MAX_ATTEMPTS';
          } else if (verification.result.reason === 'EXPIRED') {
            errorKey = 'OTP_EXPIRED';
          }

          return {
            record,
            response: {
              toPhoneMasked: phoneMasked,
              textBody: this.getLocalizedText(record.preferredLanguage, errorKey, {
                remaining: String(verification.result.remainingAttempts ?? 0),
              }),
              isProactive: false,
              nextExpectedState: 'OTP_PENDING',
            },
          };
        }

        // VERIFICATION SUCCESS: Transition to VERIFIED
        // INVARIANT: Do NOT auto-subscribe! Prompt for affirmative consent.
        record.state = 'VERIFIED';
        record.updatedAt = now;
        await this.store.saveSubscription(record);

        const childSummary = record.linkedChildIdsMasked.length > 0
          ? record.linkedChildIdsMasked.join(', ')
          : 'your registered child';

        return {
          record,
          response: {
            toPhoneMasked: phoneMasked,
            textBody: this.getLocalizedText(record.preferredLanguage, 'CONSENT_PROMPT', {
              childId: childSummary,
            }),
            isProactive: false,
            nextExpectedState: 'VERIFIED',
          },
        };
      }

      case 'VERIFIED': {
        // Caregiver is verified; waiting for affirmative consent
        const isConsentAffirmative = [
          'YES', 'HAAN', 'HO', 'HA', 'CONSENT', 'AGREE', 'MANJUR', '1', 'OK'
        ].some((k) => textUpper === k || textUpper.startsWith(k));

        if (isConsentAffirmative) {
          // Transition to SUBSCRIBED
          record.state = 'SUBSCRIBED';
          record.consentProvided = true;
          record.consentRecordedAt = now;
          record.consentCategories = ['DOCUMENTS', 'CLINICAL_FOLLOWUP', 'PROGRAMME_UPDATES'];
          record.updatedAt = now;
          await this.store.saveSubscription(record);

          const childSummary = record.linkedChildIdsMasked.length > 0
            ? record.linkedChildIdsMasked.join(', ')
            : 'your child';

          return {
            record,
            response: {
              toPhoneMasked: phoneMasked,
              textBody: this.getLocalizedText(record.preferredLanguage, 'SUBSCRIPTION_ACTIVE', {
                childId: childSummary,
              }),
              isProactive: false,
              nextExpectedState: 'SUBSCRIBED',
            },
          };
        }

        const isConsentDecline = ['NO', 'NAHI', 'NAKO', 'DECLINE', '2'].some(
          (k) => textUpper === k || textUpper.startsWith(k)
        );
        if (isConsentDecline) {
          record.state = 'OPTED_OUT';
          record.consentProvided = false;
          record.optedOutAt = now;
          record.optOutReason = 'POLICY_REFUSAL';
          record.updatedAt = now;
          await this.store.saveSubscription(record);
          await this.store.recordOptOut(phoneHash, 'POLICY_REFUSAL');

          return {
            record,
            response: {
              toPhoneMasked: phoneMasked,
              textBody: this.getLocalizedText(record.preferredLanguage, 'CONSENT_DECLINED'),
              isProactive: false,
              nextExpectedState: 'OPTED_OUT',
            },
          };
        }

        // Language selection check (e.g. "MR", "HI", "EN")
        if (['MR', 'MARATHI'].includes(textUpper)) record.preferredLanguage = 'mr';
        if (['HI', 'HINDI'].includes(textUpper)) record.preferredLanguage = 'hi';
        if (['EN', 'ENGLISH'].includes(textUpper)) record.preferredLanguage = 'en';
        record.updatedAt = now;
        await this.store.saveSubscription(record);

        return {
          record,
          response: {
            toPhoneMasked: phoneMasked,
            textBody: this.getLocalizedText(record.preferredLanguage, 'CONSENT_PROMPT_AGAIN'),
            isProactive: false,
            nextExpectedState: 'VERIFIED',
          },
        };
      }

      case 'SUBSCRIBED': {
        // Conversational handling / status query for subscribed caregiver
        // Check language change
        if (['LANG MR', 'MARATHI'].includes(textUpper)) {
          record.preferredLanguage = 'mr';
          record.updatedAt = now;
          await this.store.saveSubscription(record);
          return {
            record,
            response: {
              toPhoneMasked: phoneMasked,
              textBody: 'भाषा मराठी म्हणून सेट केली आहे. (Language set to Marathi)',
              isProactive: false,
              nextExpectedState: 'SUBSCRIBED',
            },
          };
        }

        if (['LANG HI', 'HINDI'].includes(textUpper)) {
          record.preferredLanguage = 'hi';
          record.updatedAt = now;
          await this.store.saveSubscription(record);
          return {
            record,
            response: {
              toPhoneMasked: phoneMasked,
              textBody: 'भाषा हिंदी के रूप में सेट की गई है। (Language set to Hindi)',
              isProactive: false,
              nextExpectedState: 'SUBSCRIBED',
            },
          };
        }

        // Default automated response identifying automated programme assistant
        const childSummary = record.linkedChildIdsMasked.length > 0
          ? record.linkedChildIdsMasked.join(', ')
          : 'your registered child';

        return {
          record,
          response: {
            toPhoneMasked: phoneMasked,
            textBody: this.getLocalizedText(record.preferredLanguage, 'SUBSCRIBED_HELP', {
              childId: childSummary,
            }),
            isProactive: false,
            nextExpectedState: 'SUBSCRIBED',
          },
        };
      }

      case 'PAUSED': {
        return {
          record,
          response: {
            toPhoneMasked: phoneMasked,
            textBody: this.getLocalizedText(record.preferredLanguage, 'PAUSED_REMINDER'),
            isProactive: false,
            nextExpectedState: 'PAUSED',
          },
        };
      }

      case 'OPTED_OUT': {
        // Zero proactive messages; provide brief help if user messaged us
        return {
          record,
          response: {
            toPhoneMasked: phoneMasked,
            textBody: this.getLocalizedText(record.preferredLanguage, 'OPTED_OUT_HELP'),
            isProactive: false,
            nextExpectedState: 'OPTED_OUT',
          },
        };
      }
    }
  }

  /**
   * Helper to initiate OTP verification challenge.
   */
  private async initiateOtpVerification(
    record: CaregiverSubscriptionRecord,
    phoneE164: string
  ): Promise<{
    record: CaregiverSubscriptionRecord;
    response: OutboundCaregiverResponse;
    rawOtpForTransport?: string;
  }> {
    const prior = await this.store.getLatestOtpChallenge(record.phoneHash);
    const challengeResult = this.otpService.createChallenge(record.phoneHash, prior);

    if ('error' in challengeResult) {
      return {
        record,
        response: {
          toPhoneMasked: record.phoneMasked,
          textBody: this.getLocalizedText(record.preferredLanguage, 'COOLDOWN_ACTIVE', {
            seconds: String(challengeResult.cooldownRemainingSeconds),
          }),
          isProactive: false,
          nextExpectedState: 'OTP_PENDING',
        },
      };
    }

    await this.store.saveOtpChallenge(challengeResult.challenge);
    record.state = 'OTP_PENDING';
    record.updatedAt = new Date().toISOString();
    await this.store.saveSubscription(record);

    return {
      record,
      response: {
        toPhoneMasked: record.phoneMasked,
        textBody: this.getLocalizedText(record.preferredLanguage, 'OTP_SENT'),
        templateName: 'caregiver_auth_otp',
        templateLanguage: record.preferredLanguage,
        isProactive: true,
        nextExpectedState: 'OTP_PENDING',
      },
      rawOtpForTransport: challengeResult.rawOtp,
    };
  }

  /**
   * Helper to resend OTP verification code.
   */
  private async resendOtpVerification(
    record: CaregiverSubscriptionRecord,
    phoneE164: string
  ): Promise<{
    record: CaregiverSubscriptionRecord;
    response: OutboundCaregiverResponse;
    rawOtpForTransport?: string;
  }> {
    return await this.initiateOtpVerification(record, phoneE164);
  }

  /**
   * Privacy-Preserving Localized Message Templates
   * NEVER includes clinical diagnoses, HIV status, VL test values, Aadhaar, or bank details.
   */
  private getLocalizedText(
    lang: CaregiverLanguage,
    key: string,
    params: Record<string, string> = {}
  ): string {
    const templates: Record<CaregiverLanguage, Record<string, string>> = {
      mr: {
        OTP_SENT: `नमस्ते. अलायन्स बाल संगोपन सहाय्य कार्यक्रमातून हा संदेश आहे. आपला 6-अंकी पडताळणी कोड आपल्या व्हॉट्सॲपवर पाठवला आहे. कृपया तो कोड येथे पाठवा.`,
        OTP_PROMPT_REMINDER: `कृपया आपला 6-अंकी पडताळणी कोड पाठवा. कोड पुन्हा मागवण्यासाठी 'RESEND' पाठवा.`,
        OTP_INVALID: `पडताळणी कोड चुकीचा आहे. शिल्लक प्रयत्न: {remaining}. कृपया पुन्हा प्रयत्न करा.`,
        OTP_MAX_ATTEMPTS: `कमाल प्रयत्न मर्यादा ओलांडली आहे. सुरक्षेसाठी कृपया 10 मिनिटांनंतर पुन्हा प्रयत्न करा.`,
        OTP_EXPIRED: `हा कोड कालबाह्य झाला आहे. नवीन कोड मागवण्यासाठी 'RESEND' पाठवा.`,
        COOLDOWN_ACTIVE: `कृपया नवीन कोड मागवण्यापूर्वी {seconds} सेकंद थांबा.`,
        CONSENT_PROMPT: `आपला फोन क्रमांक यशस्वीरीत्या पडताळला गेला आहे.\n\nबालक {childId} च्या पोषण सहाय्य कार्यक्रमाचे नियमित संदेश आणि आवश्यक कागदपत्रांची स्मरणपत्रे मिळवण्यासाठी कृपया 'YES' (किंवा 'होय') पाठवून संमती द्या.\nनको असल्यास 'STOP' पाठवा.`,
        CONSENT_PROMPT_AGAIN: `कृपया संमती देण्यासाठी 'YES' किंवा नकार देण्यासाठी 'STOP' पाठवा.`,
        CONSENT_DECLINED: `आपली संमती नाकारण्यात आली आहे. आपल्याला कोणतेही संदेश पाठवले जाणार नाहीत. पुन्हा सुरू करण्यासाठी 'START' पाठवा.`,
        SUBSCRIPTION_ACTIVE: `धन्यवाद. बालक {childId} च्या कागदपत्रांची स्मरणपत्रे आणि कार्यक्रम माहितीसाठी आपली नोंदणी पूर्ण झाली आहे.\nकधीही थांबवण्यासाठी 'STOP' किंवा तात्पुरते थांबवण्यासाठी 'PAUSE' पाठवू शकता.`,
        SUBSCRIBED_HELP: `नमस्ते. मी अलायन्स बाल संगोपन सहाय्य स्वयंचलित कार्यक्रम सहाय्यक आहे.\nआपण बालक {childId} च्या पोषण सहाय्यासाठी नोंदणीकृत आहात.\nकागदपत्र पाठवण्यासाठी त्याचा फोटो येथे पाठवा. थांबवण्यासाठी 'STOP' पाठवा.`,
        PAUSED_CONFIRMED: `आपले संदेश तात्पुरते थांबवले आहेत. पुन्हा सुरू करण्यासाठी 'RESUME' पाठवा.`,
        PAUSED_REMINDER: `आपली स्मरणपत्रे सध्या थांबवली आहेत. पुन्हा सुरू करण्यासाठी 'RESUME' पाठवा.`,
        RESUMED_CONFIRMED: `आपले संदेश पुन्हा सुरू झाले आहेत.`,
        OPT_OUT_CONFIRMED: `आपली विनंती स्वीकारली आहे. आपल्याला यापुढे कोणतेही संदेश पाठवले जाणार नाहीत. पुन्हा सुरू करण्यासाठी 'START' पाठवा.`,
        OPTED_OUT_HELP: `आपण या सेवेतून बाहेर पडला आहात. पुन्हा सुरू करण्यासाठी 'START' पाठवा.`,
      },
      hi: {
        OTP_SENT: `नमस्ते। एलायंस बाल पोषण सहायता कार्यक्रम से यह संदेश है। आपका 6-अंकीय सत्यापन कोड भेजा गया है। कृपया कोड यहाँ दर्ज करें।`,
        OTP_PROMPT_REMINDER: `कृपया अपना 6-अंकीय सत्यापन कोड भेजें। नया कोड पाने के लिए 'RESEND' लिखें।`,
        OTP_INVALID: `सत्यापन कोड अमान्य है। शेष प्रयास: {remaining}। कृपया पुनः प्रयास करें।`,
        OTP_MAX_ATTEMPTS: `अधिकतम प्रयास सीमा समाप्त हो गई है। कृपया 10 मिनट बाद पुनः प्रयास करें।`,
        OTP_EXPIRED: `यह कोड समाप्त हो चुका है। नया कोड पाने के लिए 'RESEND' लिखें।`,
        COOLDOWN_ACTIVE: `कृपया नया कोड मांगने से पहले {seconds} सेकंड प्रतीक्षा करें।`,
        CONSENT_PROMPT: `आपका फोन नंबर सत्यापित हो गया है।\n\nबच्चे {childId} के पोषण सहायता कार्यक्रम के संदेश और दस्तावेज़ रिमाइंडर प्राप्त करने के लिए कृपया 'YES' (या 'हाँ') लिखकर सहमति दें।\nयदि नहीं चाहते तो 'STOP' लिखें।`,
        CONSENT_PROMPT_AGAIN: `कृपया सहमति देने के लिए 'YES' अथवा मना करने के लिए 'STOP' लिखें।`,
        CONSENT_DECLINED: `आपकी असहमति दर्ज कर ली गई है। आपको कोई संदेश नहीं भेजा जाएगा।`,
        SUBSCRIPTION_ACTIVE: `धन्यवाद। बच्चे {childId} के दस्तावेज़ रिमाइंडर और कार्यक्रम सूचनाओं के लिए आपकी सहमति दर्ज हो गई है।\nरोकने के लिए कभी भी 'STOP' अथवा 'PAUSE' लिख सकते हैं।`,
        SUBSCRIBED_HELP: `नमस्ते। मैं एलायंस बाल पोषण सहायता स्वचालित कार्यक्रम सहायक हूँ।\nदस्तावेज़ जमा करने के लिए फोटो भेजें। रोकने के लिए 'STOP' लिखें।`,
        PAUSED_CONFIRMED: `आपके संदेश अस्थायी रूप से रोक दिए गए हैं। पुनः शुरू करने के लिए 'RESUME' लिखें।`,
        PAUSED_REMINDER: `आपके संदेश वर्तमान में रोके गए हैं। पुनः शुरू करने के लिए 'RESUME' लिखें।`,
        RESUMED_CONFIRMED: `आपके संदेश पुनः शुरू कर दिए गए हैं।`,
        OPT_OUT_CONFIRMED: `आपका अनुरोध स्वीकार कर लिया गया है। अब आपको कोई संदेश नहीं भेजा जाएगा।`,
        OPTED_OUT_HELP: `आप इस सेवा से हट चुके हैं। पुनः जुड़ने के लिए 'START' लिखें।`,
      },
      en: {
        OTP_SENT: `Hello. Alliance Child Nutrition Programme notification. Your 6-digit verification code has been generated. Please reply with this code.`,
        OTP_PROMPT_REMINDER: `Please reply with your 6-digit verification code. Send 'RESEND' for a new code.`,
        OTP_INVALID: `Invalid code. Remaining attempts: {remaining}. Please try again.`,
        OTP_MAX_ATTEMPTS: `Maximum attempts exceeded. For security, please try again in 10 minutes.`,
        OTP_EXPIRED: `Code expired. Send 'RESEND' to request a new code.`,
        COOLDOWN_ACTIVE: `Please wait {seconds} seconds before requesting a new code.`,
        CONSENT_PROMPT: `Your phone number is verified.\n\nTo receive programme updates and document submission reminders for child {childId}, reply 'YES' to consent.\nReply 'STOP' to decline.`,
        CONSENT_PROMPT_AGAIN: `Please reply 'YES' to consent to programme notifications, or 'STOP' to decline.`,
        CONSENT_DECLINED: `Consent declined. You will not receive notifications. Send 'START' to subscribe in the future.`,
        SUBSCRIPTION_ACTIVE: `Thank you. Subscribed to document reminders for child {childId}. Reply 'STOP' anytime to unsubscribe, or 'PAUSE' to temporarily pause.`,
        SUBSCRIBED_HELP: `Hello. I am the automated Alliance Childcare Programme assistant. You are subscribed for child {childId}. To upload a document, send a photo. Reply 'STOP' to unsubscribe.`,
        PAUSED_CONFIRMED: `Notifications paused. Send 'RESUME' to resume notifications.`,
        PAUSED_REMINDER: `Notifications are currently paused. Send 'RESUME' to resume.`,
        RESUMED_CONFIRMED: `Notifications resumed.`,
        OPT_OUT_CONFIRMED: `Unsubscribe confirmed. You will not receive further messages. Send 'START' to resubscribe.`,
        OPTED_OUT_HELP: `You are currently unsubscribed. Send 'START' to subscribe.`,
      },
      gu: {
        OTP_SENT: `નમસ્તે. એલાયન્સ ચાઇલ્ડ ન્યુટ્રિશન પ્રોગ્રામ તરફથી સંદેશ. તમારો 6-અંકનો વેરિફિકેશન કોડ મોકલવામાં આવ્યો છે. કૃપા કરીને તે કોડ મોકલો.`,
        OTP_PROMPT_REMINDER: `કૃપા કરીને તમારો 6-અંકનો વેરિફિકેશન કોડ મોકલો. ફરીથી કોડ મેળવવા 'RESEND' મોકલો.`,
        OTP_INVALID: `ખોટો કોડ. બાકી પ્રયાસો: {remaining}. કૃપા કરીને ફરી પ્રયાસ કરો.`,
        OTP_MAX_ATTEMPTS: `મહત્તમ પ્રયાસ મર્યાદા પૂરી થઈ. કૃપા કરીને 10 મિનિટ પછી ફરી પ્રયાસ કરો.`,
        OTP_EXPIRED: `આ કોડ સમાપ્ત થઈ ગયો છે. નવો કોડ મેળવવા 'RESEND' મોકલો.`,
        COOLDOWN_ACTIVE: `નવા કોડ માટે કૃપા કરીને {seconds} સેકન્ડ રાહ જુઓ.`,
        CONSENT_PROMPT: `તમારો ફોન નંબર વેરિફાય થઈ ગયો છે. બાળ {childId} માટે રિમાઇન્ડર મેળવવા 'YES' મોકલો. રોકવા 'STOP' મોકલો.`,
        CONSENT_PROMPT_AGAIN: `કૃપા કરીને સંમતિ આપવા 'YES' અથવા ના પાડવા 'STOP' મોકલો.`,
        CONSENT_DECLINED: `સંમતિ નકારી છે. તમને સંદેશા મોકલવામાં આવશે નહીં.`,
        SUBSCRIPTION_ACTIVE: `આભાર. બાળ {childId} માટે સબ્સ્ક્રિપ્શન સક્રિય છે. રોકવા 'STOP' મોકલો.`,
        SUBSCRIBED_HELP: `નમસ્તે. હું એલાયન્સ પ્રોગ્રામ આસિસ્ટન્ટ છું. ડોક્યુમેન્ટ અપલોડ કરવા ફોટો મોકલો.`,
        PAUSED_CONFIRMED: `સંદેશાઓ થોભાવવામાં આવ્યા છે. ફરી શરૂ કરવા 'RESUME' મોકલો.`,
        PAUSED_REMINDER: `સંદેશાઓ હાલમાં થોભાયેલ છે. ફરી શરૂ કરવા 'RESUME' મોકલો.`,
        RESUMED_CONFIRMED: `સંદેશાઓ ફરી શરૂ થયા છે.`,
        OPT_OUT_CONFIRMED: `તમારી વિનંતી સ્વીકારવામાં આવી છે. સંદેશાઓ બંધ કરવામાં આવ્યા છે.`,
        OPTED_OUT_HELP: `તમે અનસબ્સ્ક્રાઇબ છો. ફરી શરૂ કરવા 'START' મોકલો.`,
      },
      bn: {
        OTP_SENT: `নমস্কার। অ্যালায়েন্স চাইল্ড নিউট্রিশন প্রোগ্রাম থেকে বার্তা। আপনার ৬-সংখ্যার যাচাইকরণ কোড পাঠানো হয়েছে। দয়া করে কোডটি পাঠান।`,
        OTP_PROMPT_REMINDER: `দয়া করে আপনার ৬-সংখ্যার যাচাইকরণ কোড পাঠান। পুনরায় কোড পেতে 'RESEND' পাঠান।`,
        OTP_INVALID: `ভুল কোড। বাকি প্রচেষ্টা: {remaining}। আবার চেষ্টা করুন।`,
        OTP_MAX_ATTEMPTS: `সর্বোচ্চ প্রচেষ্টা শেষ। দয়া করে ১০ মিনিট পরে চেষ্টা করুন।`,
        OTP_EXPIRED: `কোডের মেয়াদ শেষ। নতুন কোডের জন্য 'RESEND' পাঠান।`,
        COOLDOWN_ACTIVE: `নতুন কোডের জন্য দয়া করে {seconds} সেকেন্ড অপেক্ষা করুন।`,
        CONSENT_PROMPT: `আপনার ফোন নম্বর যাচাই করা হয়েছে। শিশু {childId}-এর নথিপত্রের রিমাইন্ডার পেতে 'YES' লিখে সম্মতি দিন। বন্ধ করতে 'STOP' লিখুন।`,
        CONSENT_PROMPT_AGAIN: `সম্মতি দিতে 'YES' অথবা বন্ধ করতে 'STOP' পাঠান।`,
        CONSENT_DECLINED: `সম্মতি অস্বীকৃত হয়েছে। কোনো বার্তা পাঠানো হবে না।`,
        SUBSCRIPTION_ACTIVE: `ধন্যবাদ। শিশু {childId}-এর জন্য সাবস্ক্রিপশন সফল হয়েছে। বন্ধ করতে 'STOP' পাঠান।`,
        SUBSCRIBED_HELP: `নমস্কার। আমি অ্যালায়েন্স প্রোগ্রাম সহকারী। নথি জমা দিতে ছবি পাঠান।`,
        PAUSED_CONFIRMED: `বার্তাগুলি সাময়িকভাবে স্থগিত করা হয়েছে। পুনরায় চালু করতে 'RESUME' পাঠান।`,
        PAUSED_REMINDER: `বার্তাগুলি স্থগিত রয়েছে। চালু করতে 'RESUME' পাঠান।`,
        RESUMED_CONFIRMED: `বার্তাগুলি পুনরায় চালু হয়েছে।`,
        OPT_OUT_CONFIRMED: `আপনার অনুরোধ গৃহীত হয়েছে। বার্তা পাঠানো বন্ধ করা হলো।`,
        OPTED_OUT_HELP: `আপনি আনসাবস্ক্রাইব করেছেন। আবার চালু করতে 'START' পাঠান।`,
      },
    };

    const langTemplates = templates[lang] || templates.mr;
    let text = langTemplates[key] || templates.mr[key] || '';

    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return text;
  }
}
