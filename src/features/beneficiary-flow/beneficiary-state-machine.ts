import {
  BeneficiarySession,
  InboundBeneficiaryMessage,
  OutboundBeneficiaryResponse,
  PROPOSED_POLICY_SPEC,
} from './types';
import { AIMultimodalGateway } from '../ai-multimodal/gateway';
import { PrivacyFilter } from '../ai-multimodal/privacy-filter';
import { SupportedLanguage } from '../ai-multimodal/types';

/**
 * Beneficiary Conversation & Document Flow State Machine
 *
 * Implements strict application authority:
 * - Model returns schema-validated interpretations.
 * - Application rules control document attribution, receipt state, retries, and escalation.
 * - NO model eligibility/authenticity/approval decisions (status strictly 'UPLOADED', never 'VERIFIED').
 * - Strictly isolated from leadership reporting endpoints.
 * - All responses are marked `isDispatched: false` (drafted intent, not sent network payload).
 * - Distinguishes returning in-memory escalation notes from creating a durable CSC task.
 */
export class BeneficiaryStateMachine {
  private readonly gateway: AIMultimodalGateway;

  constructor(gateway?: AIMultimodalGateway) {
    this.gateway = gateway || new AIMultimodalGateway();
  }

  public async processInbound(
    session: BeneficiarySession,
    message: InboundBeneficiaryMessage
  ): Promise<{
    updatedSession: BeneficiarySession;
    response: OutboundBeneficiaryResponse;
  }> {
    const maskedPhone = PrivacyFilter.maskPhone(message.fromPhone);
    session.lastInteractionAt = new Date().toISOString();

    // 0. Handle Opt-Out State
    if (session.optedOut) {
      return {
        updatedSession: session,
        response: {
          recipientPhoneMasked: maskedPhone,
          language: session.preferredLanguage,
          textMessage: this.getOptedOutMessage(session.preferredLanguage),
          isDispatched: false,
          nextExpectedAction: 'OPTED_OUT',
        },
      };
    }

    // 1. Handle Voice Note Audio -> Transcribe to text first
    let processedText = message.textBody || '';
    if (message.type === 'audio' && message.mediaBuffer) {
      const transcription = await this.gateway.transcribeAudio({
        audioBuffer: message.mediaBuffer,
        mimeType: message.mimeType || 'audio/ogg',
        languageHint: session.preferredLanguage,
      });

      // Honest speech handling: If language is unsupported or transcription unavailable,
      // do not guess text. Return clear guidance to type or ask for human help.
      if (
        transcription.status === 'UNSUPPORTED_LANGUAGE' ||
        transcription.status === 'TRANSCRIPTION_UNAVAILABLE' ||
        !transcription.transcribedText.trim()
      ) {
        const errorMsg = this.getVoiceUnsupportedMessage(session.preferredLanguage);
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: errorMsg,
            isDispatched: false,
            nextExpectedAction: session.state === 'REPLACEMENT_REQUESTED' ? 'AWAIT_REPLACEMENT' : 'AWAIT_PHOTO',
          },
        };
      }
      processedText = transcription.transcribedText;
    }

    // 2. Strip WhatsApp quoted text (lines starting with '>')
    const cleanUnquotedText = processedText
      .split('\n')
      .filter((line) => !line.trim().startsWith('>'))
      .join(' ')
      .trim();
    const lowerText = cleanUnquotedText.toLowerCase().trim();

    // 3. STOP & WRONG-NUMBER HANDLING TAKES PRECEDENCE IN EVERY STATE
    const isStopWord = [
      'stop', 'stop all', 'unsubscribe', 'bas', 'bas karo', 'ruk jao',
      'रोको', 'बंद करा', 'थांबवा', 'नको', 'நிறுத்து', 'ఆపు'
    ].some((k) => lowerText === k || lowerText.startsWith(k));

    const isWrongNumber = [
      'wrong number', 'wrong no', 'chuki cha number', 'chukicha number',
      'galat number', 'not me', 'not my child', 'wrong person',
      'चूकीचा नंबर', 'गलत नंबर', 'माझा नंबर नाही', 'मेरा नंबर नहीं'
    ].some((k) => lowerText === k || lowerText.includes(k));

    if (isStopWord || isWrongNumber) {
      session.optedOut = true;
      session.optedOutAt = new Date().toISOString();
      session.state = 'OPTED_OUT';
      session.optOutReason = isWrongNumber ? 'WRONG_NUMBER' : 'STOP';
      return {
        updatedSession: session,
        response: {
          recipientPhoneMasked: maskedPhone,
          language: session.preferredLanguage,
          textMessage: this.getOptedOutMessage(session.preferredLanguage),
          isDispatched: false,
          nextExpectedAction: 'OPTED_OUT',
        },
      };
    }

    // 4. CONSENT MUST BE STATE-SPECIFIC (ONLY HANDLED WHEN IN CONSENT_PENDING)
    if (session.consentProvided === false) {
      session.state = 'CONSENT_PENDING';

      // If media is uploaded before granting consent, reject with consent prompt
      if (message.type === 'image' || (message.type === 'audio' && !processedText)) {
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: this.getConsentRequestPrompt(session.preferredLanguage),
            isDispatched: false,
            nextExpectedAction: 'AWAIT_CONSENT',
          },
        };
      }

      // Negative / dissent expressions checked FIRST (prevents accidental affirmative match)
      const negativeRegex = /\b(no|not|not yes|do not|don't|disagree|refuse|reject|nahi|na|nako|galat)\b/i;
      const devanagariNegative = ['नाही', 'मंजूर नाही', 'नको', 'अस्वीकार', 'गलत', 'नहीं', 'मंजूर नहीं', 'इல்லை', 'వద్దు'];
      const isNegative =
        negativeRegex.test(lowerText) ||
        devanagariNegative.some((k) => lowerText.includes(k));

      if (isNegative) {
        session.consentProvided = false;
        session.state = 'CONSENT_PENDING';
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: this.getConsentDeclinedMessage(session.preferredLanguage),
            isDispatched: false,
            nextExpectedAction: 'AWAIT_CONSENT',
          },
        };
      }

      // Explicit affirmative consent check
      const affirmativeRegex = /\b(yes|agree|accept|haan|hoy)\b/i;
      const devanagariConsent = ['हाँ', 'मंजूर', 'होय', 'स्वीकार', 'சரி', 'అవును', 'হ্যাঁ'];
      const isExplicitOne = lowerText === '1';
      const isAffirmative =
        (affirmativeRegex.test(lowerText) || isExplicitOne || devanagariConsent.some((k) => lowerText.includes(k))) &&
        !isNegative;

      if (!isAffirmative) {
        // Ambiguous text or question while consent is pending -> re-prompt
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: this.getConsentRequestPrompt(session.preferredLanguage),
            isDispatched: false,
            nextExpectedAction: 'AWAIT_CONSENT',
          },
        };
      }

      // Explicit affirmative consent recorded
      session.consentProvided = true;
      session.consentRecordedAt = new Date().toISOString();
      session.contactPermission = true;
      session.state = 'LANGUAGE_SELECTION';
      return {
        updatedSession: session,
        response: {
          recipientPhoneMasked: maskedPhone,
          language: session.preferredLanguage,
          textMessage: `✅ संमती नोंदवली गेली आहे / Consent recorded.\n\nकृपया भाषा निवडा / Please select language:\n1. मराठी (Marathi)\n2. हिंदी (Hindi)\n3. English`,
          isDispatched: false,
          nextExpectedAction: 'AWAIT_LANGUAGE',
        },
      };
    }

    // 5. Check Sibling / Multi-Child Disambiguation
    if (
      session.associatedChildIds &&
      session.associatedChildIds.length > 1 &&
      !session.selectedChildId
    ) {
      session.state = 'SIBLING_SELECTION';
      const matchIndex = session.associatedChildIds.findIndex(
        (cid, idx) => lowerText === String(idx + 1) || lowerText.includes(cid.toLowerCase())
      );
      if (matchIndex >= 0) {
        session.selectedChildId = session.associatedChildIds[matchIndex];
        session.state = 'AWAITING_DOCUMENT';
        const prompt = this.getDocumentRequestPrompt(
          session.preferredLanguage,
          session.targetDocType,
          session.selectedChildId
        );
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: prompt,
            isDispatched: false,
            nextExpectedAction: 'AWAIT_PHOTO',
          },
        };
      } else {
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: this.getSiblingSelectionPrompt(
              session.preferredLanguage,
              session.associatedChildIds
            ),
            isDispatched: false,
            nextExpectedAction: 'AWAIT_CHILD_SELECTION',
          },
        };
      }
    }

    // 6. Handle Text or Transcribed Voice
    if (message.type === 'text' || message.type === 'audio') {
      const intentResult = await this.gateway.classifyIntent({
        messageText: processedText,
        context: {
          currentLanguage: session.preferredLanguage,
          activeRequestedDoc: session.targetDocType,
          childIdMasked: session.childIdMasked,
          previousState: session.state,
        },
      });

      // A. State: LANGUAGE_SELECTION
      if (session.state === 'LANGUAGE_SELECTION') {
        let selectedLang: SupportedLanguage = session.preferredLanguage;
        if (lowerText === '1' || lowerText.includes('मराठी') || lowerText.includes('marathi')) {
          selectedLang = 'mr';
        } else if (lowerText === '2' || lowerText.includes('हिंदी') || lowerText.includes('hindi')) {
          selectedLang = 'hi';
        } else if (lowerText === '3' || lowerText.includes('english')) {
          selectedLang = 'en';
        } else if (intentResult.primaryIntent === 'LANGUAGE_SELECTION') {
          selectedLang = intentResult.detectedLanguage;
        } else {
          selectedLang = intentResult.detectedLanguage;
        }

        session.preferredLanguage = selectedLang;
        session.languageSelectionConfirmed = true;
        session.state = 'AWAITING_DOCUMENT';

        const prompt = this.getDocumentRequestPrompt(
          session.preferredLanguage,
          session.targetDocType,
          session.selectedChildId || session.childIdMasked
        );
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: prompt,
            isDispatched: false,
            nextExpectedAction: 'AWAIT_PHOTO',
          },
        };
      }

      // B. Human Escalation Request at any stage
      if (intentResult.primaryIntent === 'HUMAN_CSC_ESCALATION') {
        session.state = 'ESCALATED_TO_CSC';
        session.isEscalated = true;
        session.escalationReason = 'BENEFICIARY_REQUESTED_HUMAN_HELP';
        session.cscHandoffNotes = `Beneficiary asked for coordinator assistance: "${PrivacyFilter.scrubTextForInference(processedText)}"`;
        session.durableTaskCreationPending = true; // Signals that persistent worker must insert into csc_caseworker_tasks
        session.humanHandoff = {
          isEscalated: true,
          escalatedAt: new Date().toISOString(),
          reason: 'BENEFICIARY_REQUESTED_HUMAN_HELP',
          caseworkerTicketId: `CSC-TKT-${Date.now().toString(36).toUpperCase()}`,
          durableTaskCreated: false,
        };

        const reply = this.getEscalationResponse(session.preferredLanguage);
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: reply,
            isDispatched: false,
            nextExpectedAction: 'CSC_CONTACT',
          },
        };
      }

      // C. Unexpected Explanation / Delay Reason (e.g., Bank closed, out of town)
      if (intentResult.primaryIntent === 'UNEXPECTED_EXPLANATION') {
        session.unexpectedExplanations.push(PrivacyFilter.scrubTextForInference(processedText));
        const acknowledgment = this.getDelayAcknowledgment(session.preferredLanguage, processedText);
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: acknowledgment,
            isDispatched: false,
            nextExpectedAction: session.state === 'REPLACEMENT_REQUESTED' ? 'AWAIT_REPLACEMENT' : 'AWAIT_PHOTO',
          },
        };
      }

      // D. General queries / Help
      const helpMsg = this.getGuidanceHelpMessage(session.preferredLanguage, session.targetDocType);
      return {
        updatedSession: session,
        response: {
          recipientPhoneMasked: maskedPhone,
          language: session.preferredLanguage,
          textMessage: helpMsg,
          isDispatched: false,
          nextExpectedAction: session.state === 'REPLACEMENT_REQUESTED' ? 'AWAIT_REPLACEMENT' : 'AWAIT_PHOTO',
        },
      };
    }

    // 7. Handle Media (Photo Upload)
    if (message.type === 'image' && message.mediaBuffer) {
      session.state = 'DOCUMENT_EVALUATING';

      const assessment = await this.gateway.assessDocumentImage({
        imageBuffer: message.mediaBuffer,
        mimeType: (message.mimeType as any) || 'image/jpeg',
        targetDocType: session.targetDocType,
        preferredLanguage: session.preferredLanguage,
      });

      // HONEST FALLBACK: When model is unassessed or unavailable, do NOT guess or penalize retries
      if (
        assessment.modelRecommendation === 'NOT_ASSESSED' ||
        assessment.assessmentStatus === 'NOT_ASSESSED'
      ) {
        session.state = 'COMPLETED';
        session.qualityAssessmentPending = true;
        session.receivedDocuments = session.receivedDocuments || {};
        session.receivedDocuments[session.targetDocType] = {
          status: 'UPLOADED',
          uploadedAt: new Date().toISOString(),
          mimeType: (message.mimeType as any) || 'image/jpeg',
          fileUri: `tigris://childcare-docs/${session.submissionId}/${session.targetDocType}.jpg`,
          qualityAssessmentPending: true,
        };

        const manualMsg = this.getManualReviewPendingMessage(session.preferredLanguage, session.targetDocType);
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: manualMsg,
            isDispatched: false,
            nextExpectedAction: 'FINISHED',
          },
        };
      }

      // Application Rule: Evaluate model classification against quality policy
      const isAcceptable =
        assessment.modelRecommendation === 'ACCEPTABLE' &&
        assessment.overallQualityScore >= PROPOSED_POLICY_SPEC.qualityAcceptanceThreshold &&
        assessment.isTargetMatch;

      if (isAcceptable) {
        // Document Accepted -> Mark UPLOADED (Verification requires separate human reviewer)
        session.state = 'COMPLETED';
        session.qualityAssessmentPending = false;
        session.receivedDocuments = session.receivedDocuments || {};
        session.receivedDocuments[session.targetDocType] = {
          status: 'UPLOADED',
          uploadedAt: new Date().toISOString(),
          mimeType: (message.mimeType as any) || 'image/jpeg',
          fileUri: `tigris://childcare-docs/${session.submissionId}/${session.targetDocType}.jpg`,
          qualityAssessmentPending: false,
        };
        const successMsg = this.getUploadSuccessMessage(session.preferredLanguage, session.targetDocType);
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: successMsg,
            isDispatched: false,
            nextExpectedAction: 'FINISHED',
          },
        };
      }

      // Quality failure or document mismatch -> Trigger Replacement Guidance or Escalate
      session.retryCount += 1;
      session.attemptsPerDoc = session.attemptsPerDoc || {};
      session.attemptsPerDoc[session.targetDocType] = (session.attemptsPerDoc[session.targetDocType] || 0) + 1;
      session.totalAttempts = (session.totalAttempts || 0) + 1;

      const guidanceText =
        assessment.specificGuidance[session.preferredLanguage] ||
        assessment.specificGuidance['en'] ||
        'Please upload a clearer picture.';

      session.replacementGuidanceHistory.push(guidanceText);

      // Check max retry limit
      if (session.retryCount >= session.maxRetries) {
        session.state = 'ESCALATED_TO_CSC';
        session.isEscalated = true;
        session.escalationReason = `EXCEEDED_MAX_RETRIES (${session.retryCount}/${session.maxRetries})`;
        session.cscHandoffNotes = `Caregiver submitted ${session.retryCount} unreadable photos for ${session.targetDocType}. Quality flags: ${JSON.stringify(assessment.qualityFlags)}. Assigned to Field CSC for home visit.`;
        session.durableTaskCreationPending = true;
        session.humanHandoff = {
          isEscalated: true,
          escalatedAt: new Date().toISOString(),
          reason: `EXCEEDED_MAX_RETRIES (${session.retryCount}/${session.maxRetries})`,
          caseworkerTicketId: `CSC-TKT-${Date.now().toString(36).toUpperCase()}`,
          durableTaskCreated: false,
        };

        const escalationMsg = this.getRetryExceededEscalationMessage(session.preferredLanguage, session.targetDocType);
        return {
          updatedSession: session,
          response: {
            recipientPhoneMasked: maskedPhone,
            language: session.preferredLanguage,
            textMessage: escalationMsg,
            isDispatched: false,
            nextExpectedAction: 'CSC_CONTACT',
          },
        };
      }

      // Transition to REPLACEMENT_REQUESTED
      session.state = 'REPLACEMENT_REQUESTED';
      const replacementPrompt = this.formatReplacementRequest(
        session.preferredLanguage,
        session.targetDocType,
        guidanceText,
        session.retryCount,
        session.maxRetries
      );

      return {
        updatedSession: session,
        response: {
          recipientPhoneMasked: maskedPhone,
          language: session.preferredLanguage,
          textMessage: replacementPrompt,
          isDispatched: false,
          nextExpectedAction: 'AWAIT_REPLACEMENT',
        },
      };
    }

    // Default response for unhandled input
    session.unresolvedMessages = session.unresolvedMessages || [];
    session.unresolvedMessages.push({
      messageId: message.messageId,
      type: message.type,
      receivedAt: new Date().toISOString(),
      textBody: processedText ? PrivacyFilter.scrubTextForInference(processedText) : undefined,
      note: 'Unhandled input from caregiver',
    });

    return {
      updatedSession: session,
      response: {
        recipientPhoneMasked: maskedPhone,
        language: session.preferredLanguage,
        textMessage: 'Please send a text message or photo of your requested document.',
        isDispatched: false,
        nextExpectedAction: 'AWAIT_PHOTO',
      },
    };
  }

  // ==========================================================================
  // Multilingual Prompt & Response Templates
  // ==========================================================================

  private getDocumentRequestPrompt(lang: SupportedLanguage, docType: string, childIdMasked: string): string {
    const docNames: Record<string, Record<SupportedLanguage, string>> = {
      passbookPhoto: {
        mr: 'बँक पासबुकच्या पहिल्या पानाचा फोटो',
        hi: 'बैंक पासबुक के पहले पन्ने की फोटो',
        en: 'photo of the bank passbook first page',
        gu: 'બેંક પાસબુકના પ્રથમ પાનાનો ફોટો',
        bn: 'ব্যাঙ্ক পাসবইয়ের প্রথম পাতার ছবি',
      },
    };

    const docName = docNames[docType]?.[lang] || docNames.passbookPhoto[lang];

    switch (lang) {
      case 'mr':
        return `नमस्ते. बालक (${childIdMasked}) च्या सहाय्यासाठी कृपया तुमच्या ${docName} पाठवा. फोटो काढताना प्रकाश चांगला असावा आणि सर्व माहिती स्पष्ट दिसावी.`;
      case 'hi':
        return `नमस्ते। बच्चे (${childIdMasked}) की सहायता के लिए कृपया अपनी ${docName} भेजें। फोटो लेते समय रोशनी अच्छी होनी चाहिए ताकि सभी जानकारी साफ दिखे।`;
      default:
        return `Hello. For child (${childIdMasked}) support enrollment, please share a clear ${docName}. Ensure good lighting and readable text.`;
    }
  }

  private getDelayAcknowledgment(lang: SupportedLanguage, reason: string): string {
    switch (lang) {
      case 'mr':
        return `माहिती दिल्याबद्दल धन्यवाद. आम्ही तुमची नोंद ठेवली आहे. काम पूर्ण झाल्यावर किंवा अडचण सुटल्यावर कृपया फोटो पाठवा. मदतीसाठी 'मदत' टाईप करा.`;
      case 'hi':
        return `जानकारी देने के लिए धन्यवाद। हमने आपका विवरण दर्ज कर लिया है। काम पूरा होने पर कृपया फोटो भेजें। सहायता के लिए 'मदद' लिखें।`;
      default:
        return `Thank you for updating us. We have noted this in your record. Please send the document once ready. Reply 'help' if you need assistance.`;
    }
  }

  private formatReplacementRequest(
    lang: SupportedLanguage,
    docType: string,
    guidance: string,
    attempt: number,
    maxRetries: number
  ): string {
    switch (lang) {
      case 'mr':
        return `⚠️ कागदपत्र तपासणी सूचना (प्रयत्न ${attempt}/${maxRetries}):\n${guidance}\n\nकृपया वरील सूचनांनुसार पुन्हा स्पष्ट फोटो काढून पाठवा.`;
      case 'hi':
        return `⚠️ दस्तावेज़ जांच सूचना (प्रयास ${attempt}/${maxRetries}):\n${guidance}\n\nकृपया ऊपर दिए गए सुझावों के अनुसार दोबारा साफ फोटो भेजें।`;
      default:
        return `⚠️ Document Quality Feedback (Attempt ${attempt}/${maxRetries}):\n${guidance}\n\nPlease take a new clear photo following these instructions and resend.`;
    }
  }

  private getUploadSuccessMessage(lang: SupportedLanguage, docType: string): string {
    switch (lang) {
      case 'mr':
        return `✅ धन्यवाद! तुमचे कागदपत्र यशस्वीरित्या प्राप्त झाले आहे. आमचे अधिकारी तपासणी करून पुढील प्रक्रियेसाठी संपर्क करतील.`;
      case 'hi':
        return `✅ धन्यवाद! आपका दस्तावेज़ सफलतापूर्वक प्राप्त हो गया है। हमारे अधिकारी जांच कर अगली प्रक्रिया पूरी करेंगे।`;
      default:
        return `✅ Thank you! Your document has been received. Our team will review it and follow up on the next steps.`;
    }
  }

  private getManualReviewPendingMessage(lang: SupportedLanguage, docType: string): string {
    switch (lang) {
      case 'mr':
        return `✅ तुमचे कागदपत्र प्राप्त झाले आहे. स्वयंचलित तपासणी अनुपलब्ध असल्याने आमचे को-ऑर्डिनेटर व्यक्तिशः याची पडताळणी करतील.`;
      case 'hi':
        return `✅ आपका दस्तावेज़ प्राप्त हो गया है। स्वचालित जांच अनुपलब्ध होने के कारण हमारे को-ऑर्डिनेटर इसकी समीक्षा करेंगे।`;
      default:
        return `✅ Your document has been received. Automated quality check is currently unavailable; a caseworker will review it manually.`;
    }
  }

  private getVoiceUnsupportedMessage(lang: SupportedLanguage): string {
    switch (lang) {
      case 'mr':
        return `व्हॉईस मेसेज ऐकणे सध्या शक्य नाही. कृपया तुमचा संदेश मजकूर (टेक्स्ट) स्वरूपात पाठवा किंवा समन्वयक संपर्कासाठी 'मदत' टाईप करा.`;
      case 'hi':
        return `वॉयस संदेश सुनना अभी संभव नहीं है। कृपया अपना संदेश लिखकर (टेक्स्ट में) भेजें या सहायता के लिए 'मदद' लिखें।`;
      default:
        return `Voice messages cannot be transcribed automatically at this time. Please send a typed message or reply 'help' to connect with a coordinator.`;
    }
  }

  private getRetryExceededEscalationMessage(lang: SupportedLanguage, docType: string): string {
    switch (lang) {
      case 'mr':
        return `काळजी करू नका. फोटो स्पष्ट येण्यात अडचण येत असल्याने आम्ही तुमची केस आमच्या स्थानिक कम्युनिटी सपोर्ट कोऑर्डिनेटर (CSC) कडे सोपवली आहे. ते लवकरच तुम्हाला प्रत्यक्ष भेटून मदत करतील.`;
      case 'hi':
        return `चिंता न करें। फोटो साफ आने में परेशानी के कारण हमने आपका मामला हमारे स्थानीय कम्युनिटी सपोर्ट कोऑर्डिनेटर (CSC) को भेज दिया है। वे जल्द ही आपसे संपर्क कर मदद करेंगे।`;
      default:
        return `No worries. Since there is difficulty capturing a clear photo, we have forwarded your file to our local Community Support Coordinator (CSC), who will assist you in person.`;
    }
  }

  private getEscalationResponse(lang: SupportedLanguage): string {
    switch (lang) {
      case 'mr':
        return `आम्ही तुमची विनंती स्वीकारली आहे. आमचे कम्युनिटी सपोर्ट कोऑर्डिनेटर (CSC) लवकरच तुमच्याशी फोन किंवा प्रत्यक्ष भेटीद्वारे संपर्क साधतील.`;
      case 'hi':
        return `हमने आपका अनुरोध स्वीकार कर लिया है। हमारे कम्युनिटी सपोर्ट कोऑर्डिनेटर (CSC) जल्द ही आपसे संपर्क करेंगे।`;
      default:
        return `We have received your request. A Community Support Coordinator (CSC) will contact you shortly to assist you.`;
    }
  }

  private getGuidanceHelpMessage(lang: SupportedLanguage, docType: string): string {
    switch (lang) {
      case 'mr':
        return `कृपया आवश्यक कागदपत्राचा स्पष्ट फोटो पाठवा. जर तुम्हाला समस्या येत असेल तर 'मदत' टाईप करा, आमचे प्रतिनिधी मदत करतील.`;
      case 'hi':
        return `कृपया आवश्यक दस्तावेज़ की स्पष्ट फोटो भेजें। यदि कोई समस्या है तो 'मदद' लिखें, हमारे प्रतिनिधि संपर्क करेंगे।`;
      default:
        return `Please send a clear photo of the requested document. If you need assistance, reply 'help' to connect with a coordinator.`;
    }
  }

  private getOptedOutMessage(lang: SupportedLanguage): string {
    switch (lang) {
      case 'mr':
        return `या क्रमांकासाठी संदेश पाठवणे थांबवले आहे. मदतीसाठी आमचे सीएससी कार्यकर्ते तुमच्याशी संपर्क साधतील.`;
      case 'hi':
        return `इस नंबर के लिए संदेश रोक दिए गए हैं। सहायता के लिए हमारे सीएससी कार्यकर्ता आपसे संपर्क करेंगे।`;
      default:
        return `Communications have been stopped for this number. If you need any assistance, our CSC staff will contact you directly.`;
    }
  }

  private getConsentRequestPrompt(lang: SupportedLanguage): string {
    switch (lang) {
      case 'mr':
        return `नमस्ते. बालकाच्या पोषण सहाय्यासाठी कागदपत्रे गोळा करण्यास आपली संमती आवश्यक आहे. पुढे जाण्यासाठी कृपया 'होय' किंवा '1' पाठवा.`;
      case 'hi':
        return `नमस्ते। बच्चे के पोषण सहायता के लिए दस्तावेज़ प्राप्त करने हेतु आपकी सहमति आवश्यक है। आगे बढ़ने के लिए कृपया 'हाँ' या '1' भेजें।`;
      default:
        return `Hello. Alliance India requires your explicit consent to collect required childcare sponsorship documents via WhatsApp. Reply 'YES' or '1' to confirm.`;
    }
  }

  private getConsentDeclinedMessage(lang: SupportedLanguage): string {
    switch (lang) {
      case 'mr':
        return `तुम्ही संमती नाकारली आहे. व्हॉट्सॲपद्वारे कोणतीही कागदपत्रे गोळा केली जाणार नाहीत. आमचे सीएससी कार्यकर्ते तुमच्याशी प्रत्यक्ष संपर्क साधतील.`;
      case 'hi':
        return `आपने सहमति अस्वीकार कर दी है। व्हाट्सएप के माध्यम से कोई दस्तावेज़ नहीं लिए जाएंगे। हमारे सीएससी कार्यकर्ता आपसे सीधे संपर्क करेंगे।`;
      default:
        return `You have declined consent. No documents will be requested or collected via WhatsApp. Our local CSC caseworker will assist you directly in person.`;
    }
  }

  private getSiblingSelectionPrompt(lang: SupportedLanguage, childIds: readonly string[]): string {
    const list = childIds.map((id, idx) => `${idx + 1}. Child (${id})`).join('\n');
    switch (lang) {
      case 'mr':
        return `कृपया निवडा की तुम्ही कोणत्या बालकासाठी कागदपत्र पाठवत आहात (क्रमांक पाठवा):\n${list}`;
      case 'hi':
        return `कृपया चुनें कि आप किस बच्चे के लिए दस्तावेज़ भेज रहे हैं (नंबर भेजें):\n${list}`;
      default:
        return `Please select which child you are uploading documents for (reply with the number):\n${list}`;
    }
  }
}
