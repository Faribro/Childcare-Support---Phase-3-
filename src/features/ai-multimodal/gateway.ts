import {
  AIProviderConfig,
  AIProviderName,
  DocumentVisionQAInput,
  DocumentVisionQAResult,
  DocumentVisionQAResultSchema,
  MultilingualIntentInput,
  MultilingualIntentResult,
  MultilingualIntentResultSchema,
  SpeechSynthesisInput,
  SpeechSynthesisResult,
  SpeechTranscriptionInput,
  SpeechTranscriptionResult,
  SpeechTranscriptionResultSchema,
  SupportedLanguage,
} from './types';
import { PrivacyFilter } from './privacy-filter';
import { VERIFIED_MODEL_CATALOG } from './model-catalog';

export interface AIMultimodalGatewayOptions extends Partial<AIProviderConfig> {
  readonly syntheticTestMode?: boolean; // Explicit opt-in for synthetic test fixtures in unit tests
}

export class AIMultimodalGateway {
  private readonly config: AIProviderConfig & { syntheticTestMode: boolean };

  constructor(overrides?: AIMultimodalGatewayOptions) {
    // Secret names confirmed: OPENROUTER_API_KEY and NVIDIA_API_KEY
    this.config = {
      openRouterApiKey: (
        overrides?.openRouterApiKey ||
        process.env.OPENROUTER_API_KEY ||
        ''
      ).trim() || undefined,
      nvidiaApiKey: (
        overrides?.nvidiaApiKey ||
        process.env.NVIDIA_API_KEY ||
        ''
      ).trim() || undefined,
      defaultProvider: overrides?.defaultProvider || 'DETERMINISTIC_FALLBACK',
      allowPaidFallback: overrides?.allowPaidFallback ?? false, // Strictly false by default
      maxRetries: overrides?.maxRetries ?? 2,
      timeoutMs: overrides?.timeoutMs ?? 10000,
      dataCollectionOptOut: overrides?.dataCollectionOptOut ?? true,
      syntheticTestMode: overrides?.syntheticTestMode ?? false,
    };
  }

  public getConfigSummary() {
    return {
      hasOpenRouterKey: Boolean(this.config.openRouterApiKey),
      hasNvidiaKey: Boolean(this.config.nvidiaApiKey),
      defaultProvider: this.config.defaultProvider,
      allowPaidFallback: this.config.allowPaidFallback,
      dataCollectionOptOut: this.config.dataCollectionOptOut,
      syntheticTestMode: this.config.syntheticTestMode,
    };
  }

  // ==========================================================================
  // 1. Multilingual Text & Intent Classification
  // ==========================================================================

  public async classifyIntent(input: MultilingualIntentInput): Promise<MultilingualIntentResult> {
    const sanitizedText = PrivacyFilter.scrubTextForInference(input.messageText);

    // 1. If OpenRouter is explicitly chosen and configured, attempt actual provider inference
    if (this.config.openRouterApiKey && this.config.defaultProvider === 'OPENROUTER') {
      try {
        return await this.callOpenRouterIntent(sanitizedText, input.context);
      } catch (err) {
        console.warn('[AI_GATEWAY] OpenRouter intent classification failed, failing over to deterministic engine:', (err as Error).message);
      }
    }

    // 2. If NVIDIA NIM is explicitly chosen and configured, attempt actual provider inference
    if (this.config.nvidiaApiKey && this.config.defaultProvider === 'NVIDIA') {
      try {
        return await this.callNvidiaIntent(sanitizedText, input.context);
      } catch (err) {
        console.warn('[AI_GATEWAY] NVIDIA intent classification failed, failing over to deterministic engine:', (err as Error).message);
      }
    }

    // 3. Explicit Default: Deterministic In-Process Intent Classifier (regex & multilingual keywords)
    return this.deterministicIntentClassification(sanitizedText, input.context);
  }

  // ==========================================================================
  // 2. Document Vision & Quality Assessment
  // ==========================================================================

  public async assessDocumentImage(input: DocumentVisionQAInput): Promise<DocumentVisionQAResult> {
    // 1. If OpenRouter has vision capabilities
    if (this.config.openRouterApiKey && this.config.defaultProvider === 'OPENROUTER') {
      try {
        return await this.callOpenRouterVisionQA(input);
      } catch (err) {
        console.warn('[AI_GATEWAY] OpenRouter Vision QA failed, failing over to fallback engine:', (err as Error).message);
      }
    }

    // 2. If NVIDIA NIM vision is available
    if (this.config.nvidiaApiKey && this.config.defaultProvider === 'NVIDIA') {
      try {
        return await this.callNvidiaVisionQA(input);
      } catch (err) {
        console.warn('[AI_GATEWAY] NVIDIA Vision QA failed, failing over to fallback engine:', (err as Error).message);
      }
    }

    // 3. Fallback Evaluation:
    // If synthetic test mode is enabled, evaluate synthetic test markers for unit test harnesses
    if (this.config.syntheticTestMode) {
      return this.syntheticVisionAssessment(input);
    }

    // Honest Fallback: When no cloud model is available or credentials absent, DO NOT infer semantic quality from dimensions or headers!
    return {
      detectedDocumentType: input.targetDocType,
      classificationConfidence: 0.0,
      isTargetMatch: false,
      overallQualityScore: null,
      qualityFlags: {
        isBlurry: false,
        hasGlare: false,
        isCutOff: false,
        isDarkOrUnderexposed: false,
        isRotatedOrUpsideDown: false,
      },
      legibility: 'NOT_ASSESSED',
      modelRecommendation: 'NOT_ASSESSED',
      assessmentStatus: 'NOT_ASSESSED',
      isProvisional: true,
      classificationSource: 'DETERMINISTIC_RULES',
      reviewEscalationPath: 'CSC_CASEWORKER_REVIEW',
      specificGuidance: {
        en: 'Automated quality assessment is currently unavailable. The document will be reviewed manually by a caseworker.',
        hi: 'स्वचालित गुणवत्ता जांच वर्तमान में अनुपलब्ध है। कार्यकर्ता द्वारा दस्तावेज़ की मैन्युअल समीक्षा की जाएगी।',
        mr: 'स्वयंचलित गुणवत्ता तपासणी सध्या अनुपलब्ध आहे. कार्यकर्त्याद्वारे कागदपत्राची व्यक्तिशः पडताळणी केली जाईल.',
      },
    };
  }

  // ==========================================================================
  // 3. Speech Transcription (Async WhatsApp Voice Notes)
  // ==========================================================================

  public async transcribeAudio(input: SpeechTranscriptionInput): Promise<SpeechTranscriptionResult> {
    if (this.config.syntheticTestMode) {
      return this.syntheticAudioTranscription(input);
    }

    const langHint = input.languageHint || 'mr';

    // LANGUAGE BOUNDARY CHECK:
    // NVIDIA Canary-1b and Parakeet CTC 1.1b DO NOT support Indian languages (mr, hi, gu, bn).
    // Parakeet is English-only. Canary supports en, es, de, fr only.
    if (langHint !== 'en') {
      return {
        status: 'UNSUPPORTED_LANGUAGE',
        transcribedText: '',
        detectedLanguage: langHint,
        confidence: 0,
        durationSeconds: 0,
        isSupportedLanguage: false,
        error: `Language '${langHint}' is not supported by available ASR endpoints (Canary/Parakeet support English/European languages only). Indian language transcription unavailable without regional ASR provider.`,
      };
    }

    // If English audio and NVIDIA API key is available
    if (this.config.nvidiaApiKey) {
      try {
        return await this.callNvidiaASR(input);
      } catch (err) {
        console.warn('[AI_GATEWAY] NVIDIA ASR failed, falling over to fallback:', (err as Error).message);
      }
    }

    // Synthetic test mode for test fixtures
    if (this.config.syntheticTestMode) {
      return this.syntheticAudioTranscription(input);
    }

    // Honest Fallback: Do NOT guess transcription from audio duration or file size
    return {
      status: 'TRANSCRIPTION_UNAVAILABLE',
      transcribedText: '',
      detectedLanguage: langHint,
      confidence: 0,
      durationSeconds: 0,
      isSupportedLanguage: true,
      error: 'Speech transcription unavailable: no active provider credentials configured.',
    };
  }

  // ==========================================================================
  // 4. Text-to-Speech (TTS - Proposed Voice Responses)
  // ==========================================================================

  public async synthesizeSpeech(input: SpeechSynthesisInput): Promise<SpeechSynthesisResult> {
    // LANGUAGE BOUNDARY: Hosted NIM FastPitch HiFi-GAN supports English only
    if (input.language !== 'en') {
      return {
        status: 'UNSUPPORTED_LANGUAGE',
        isPlayable: false,
        error: `Text-to-speech currently unsupported for language '${input.language}' on hosted NIM API. Voice synthesis requires regional Indic TTS provider.`,
      };
    }

    if (this.config.nvidiaApiKey) {
      try {
        return await this.callNvidiaTTS(input);
      } catch (err) {
        console.warn('[AI_GATEWAY] NVIDIA TTS failed, failing over:', (err as Error).message);
      }
    }

    // Honest Fallback: Return only validated playable recordings, otherwise synthesis unavailable
    return {
      status: 'SYNTHESIS_UNAVAILABLE',
      isPlayable: false,
      error: 'Speech synthesis unavailable without active provider credentials. Fallback to text messaging.',
    };
  }

  // ==========================================================================
  // Upstream Provider Implementations (OpenRouter & NVIDIA)
  // ==========================================================================

  private async callOpenRouterIntent(
    scrubbedText: string,
    context: MultilingualIntentInput['context']
  ): Promise<MultilingualIntentResult> {
    const model = VERIFIED_MODEL_CATALOG['nvidia/nemotron-3.5-lightning:free'].modelId;
    const systemPrompt = `You are an automated childcare support triage assistant for an NGO in India.
Classify the beneficiary message into JSON adhering strictly to this schema:
{
  "detectedLanguage": "en" | "hi" | "mr" | "gu" | "bn",
  "confidence": number between 0.0 and 1.0,
  "primaryIntent": "LANGUAGE_SELECTION" | "DOCUMENT_QUERY" | "UNEXPECTED_EXPLANATION" | "REPLACEMENT_GUIDANCE_QUERY" | "REPLACEMENT_SUBMISSION" | "HUMAN_CSC_ESCALATION" | "GREETING" | "UNKNOWN_OUT_OF_SCOPE",
  "secondaryIntents": string[],
  "explanationSummary": string,
  "sentiment": "POSITIVE" | "NEUTRAL" | "DISTRESSED" | "FRUSTRATED",
  "extractedEntities": { "mentionedChildName"?: string, "mentionedDocType"?: string, "delayReason"?: string },
  "clarificationNeeded": boolean
}
Return ONLY valid JSON. No conversational preamble.`;

    // OpenRouter request parameter: provider.data_collection = "deny"
    const payload = PrivacyFilter.decorateOpenRouterPayload({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context: ActiveRequestedDoc=${context.activeRequestedDoc || 'none'}. Message: "${scrubbedText}"` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 300,
    });

    const res = await this.executeFetchWithRetry(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://allianceindia.org/childcare',
          'X-Title': 'Childcare Support Multimodal Gateway',
        },
        body: JSON.stringify(payload),
      }
    );

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return MultilingualIntentResultSchema.parse(parsed);
  }

  private async callNvidiaIntent(
    scrubbedText: string,
    context: MultilingualIntentInput['context']
  ): Promise<MultilingualIntentResult> {
    const model = VERIFIED_MODEL_CATALOG['nvidia/meta/llama-3.1-70b-instruct'].modelId;
    const systemPrompt = `Classify the beneficiary message into JSON adhering strictly to:
{
  "detectedLanguage": "en" | "hi" | "mr" | "gu" | "bn",
  "confidence": number,
  "primaryIntent": "LANGUAGE_SELECTION" | "DOCUMENT_QUERY" | "UNEXPECTED_EXPLANATION" | "REPLACEMENT_GUIDANCE_QUERY" | "REPLACEMENT_SUBMISSION" | "HUMAN_CSC_ESCALATION" | "GREETING" | "UNKNOWN_OUT_OF_SCOPE",
  "secondaryIntents": string[],
  "sentiment": "POSITIVE" | "NEUTRAL" | "DISTRESSED" | "FRUSTRATED",
  "extractedEntities": {},
  "clarificationNeeded": boolean
}`;

    const res = await this.executeFetchWithRetry(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.nvidiaApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: scrubbedText },
          ],
          temperature: 0.1,
        }),
      }
    );

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return MultilingualIntentResultSchema.parse(parsed);
  }

  private async callOpenRouterVisionQA(input: DocumentVisionQAInput): Promise<DocumentVisionQAResult> {
    const model = VERIFIED_MODEL_CATALOG['google/gemma-4-31b-it:free'].modelId;
    const base64Image = input.imageBuffer.toString('base64');
    const dataUri = `data:${input.mimeType};base64,${base64Image}`;

    const prompt = `Analyze this uploaded document image for childcare verification.
Expected document: ${input.targetDocType}.
Preferred guidance language: ${input.preferredLanguage}.
Return strictly JSON adhering to DocumentVisionQAResult schema:
{
  "detectedDocumentType": "${input.targetDocType}" | "passbookPhoto" | "aadhaarCardPhoto" | "childPhoto" | "feeReceiptPhoto" | "marksheetPhoto" | "caregiverSignature" | "UNKNOWN_OR_OTHER",
  "classificationConfidence": number,
  "isTargetMatch": boolean,
  "overallQualityScore": number (0-100),
  "qualityFlags": { "isBlurry": boolean, "hasGlare": boolean, "isCutOff": boolean, "isDarkOrUnderexposed": boolean, "isRotatedOrUpsideDown": boolean },
  "legibility": "HIGH" | "MEDIUM" | "UNREADABLE",
  "specificGuidance": { "en": string, "hi": string, "mr": string },
  "modelRecommendation": "ACCEPTABLE" | "NEEDS_REPLACEMENT" | "UNRECOGNIZED_DOCUMENT"
}`;

    // OpenRouter request parameter: provider.data_collection = "deny"
    const payload = PrivacyFilter.decorateOpenRouterPayload({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 300,
    });

    const res = await this.executeFetchWithRetry(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://allianceindia.org/childcare',
          'X-Title': 'Childcare Support Multimodal Gateway',
        },
        body: JSON.stringify(payload),
      }
    );

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return DocumentVisionQAResultSchema.parse({
      ...parsed,
      assessmentStatus: 'EVALUATED',
    });
  }

  private async callNvidiaVisionQA(input: DocumentVisionQAInput): Promise<DocumentVisionQAResult> {
    const model = VERIFIED_MODEL_CATALOG['nvidia/meta/llama-3.2-11b-vision-instruct'].modelId;
    const base64Image = input.imageBuffer.toString('base64');
    const dataUri = `data:${input.mimeType};base64,${base64Image}`;

    const res = await this.executeFetchWithRetry(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.nvidiaApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `Assess this document for childcare program. Target=${input.targetDocType}. Return valid JSON.` },
                { type: 'image_url', image_url: { url: dataUri } },
              ],
            },
          ],
        }),
      }
    );

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return DocumentVisionQAResultSchema.parse({
      ...parsed,
      assessmentStatus: 'EVALUATED',
    });
  }

  private async callNvidiaASR(input: SpeechTranscriptionInput): Promise<SpeechTranscriptionResult> {
    const res = await this.executeFetchWithRetry(
      'https://integrate.api.nvidia.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.nvidiaApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nvidia/canary-1b',
          audio: input.audioBuffer.toString('base64'),
          language: input.languageHint || 'en',
        }),
      }
    );

    const json = await res.json();
    return SpeechTranscriptionResultSchema.parse({
      status: 'SUCCESS',
      transcribedText: json.text || '',
      detectedLanguage: json.language || input.languageHint || 'en',
      confidence: json.confidence || 0.95,
      durationSeconds: json.duration || 5.0,
      isSupportedLanguage: true,
    });
  }

  private async callNvidiaTTS(input: SpeechSynthesisInput): Promise<SpeechSynthesisResult> {
    const res = await this.executeFetchWithRetry(
      'https://integrate.api.nvidia.com/v1/audio/synthesize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.nvidiaApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nvidia/fastpitch-hifigan',
          text: input.textToSpeak,
          language: input.language,
        }),
      }
    );

    const json = await res.json();
    const audioBuffer = Buffer.from(json.audio || '', 'base64');
    return {
      status: 'SUCCESS',
      isPlayable: audioBuffer.length > 0,
      audioBuffer,
      mimeType: 'audio/ogg',
      durationSeconds: json.duration || 3.0,
    };
  }

  // ==========================================================================
  // Deterministic In-Process Intent Classifier
  // ==========================================================================

  public deterministicIntentClassification(
    text: string,
    context: MultilingualIntentInput['context']
  ): MultilingualIntentResult {
    const lower = text.toLowerCase().trim();

    // 1. Language Selection Intent
    if (
      lower.includes('मराठी') ||
      lower.includes('marathi') ||
      lower.includes('हिंदी') ||
      lower.includes('hindi') ||
      lower.includes('english') ||
      lower.includes('select language') ||
      lower.includes('bhasha') ||
      lower.includes('भाषेत')
    ) {
      let lang: SupportedLanguage = 'en';
      if (lower.includes('मराठी') || lower.includes('marathi') || lower.includes('भाषेत')) lang = 'mr';
      else if (lower.includes('हिंदी') || lower.includes('hindi')) lang = 'hi';
      else if (lower.includes('ગુજરાતી') || lower.includes('gujarati')) lang = 'gu';
      else if (lower.includes('বাংলা') || lower.includes('bengali')) lang = 'bn';

      return {
        detectedLanguage: lang,
        confidence: 0.98,
        primaryIntent: 'LANGUAGE_SELECTION',
        secondaryIntents: [],
        sentiment: 'NEUTRAL',
        extractedEntities: {},
        clarificationNeeded: false,
        isProvisional: true,
        classificationSource: 'DETERMINISTIC_RULES',
        reviewEscalationPath: 'NONE',
      };
    }

    // Detect language from script/keywords
    const detectedLanguage = this.detectLanguageFromText(text, context.currentLanguage);

    // 2. Human Escalation Intent (Marathi, Hindi, English)
    const escalationKeywords = [
      'मदत', 'मदद', 'मदत करा', 'मदद चाहिए', 'मदद करो', 'को-ऑर्डिनेटर', 'कार्यकर्ता',
      'फोन करा', 'कॉल करा', 'फोन करो', 'कॉल करो', 'बोलना है', 'बोलायचे आहे',
      'समजत नाही', 'समजलं नाही', 'समझ नहीं', 'कठीण आहे', 'adchan', 'madat', 'madad',
      'help', 'coordinator', 'caseworker', 'call me', 'phone me', 'human'
    ];
    if (escalationKeywords.some((k) => lower.includes(k))) {
      return {
        detectedLanguage,
        confidence: 0.95,
        primaryIntent: 'HUMAN_CSC_ESCALATION',
        secondaryIntents: [],
        explanationSummary: 'Beneficiary requested human assistance or coordinator contact.',
        sentiment: 'DISTRESSED',
        extractedEntities: { delayReason: 'Requested human assistance' },
        clarificationNeeded: false,
        isProvisional: true,
        classificationSource: 'DETERMINISTIC_RULES',
        reviewEscalationPath: 'CSC_CASEWORKER_REVIEW',
      };
    }

    // 3. Unexpected Explanation / Delay Notice (Marathi, Hindi, English)
    const delayKeywords = [
      'बंद', 'गावी', 'गावात', 'गांव', 'गाँव', 'उद्या', 'नंतर', 'कल', 'परसों', 'परवा',
      'आजारी', 'बीमार', 'दवाखाना', 'हॉस्पिटल', 'शाळा', 'शाळेत', 'स्कूल',
      'bank bandh', 'bank closed', 'gaav', 'out of town', 'kal bhejenge', 'tomorrow',
      'sick', 'hospital', 'later', 'receipt nahi', 'भेज दूंगा', 'पाठवतो'
    ];
    if (delayKeywords.some((k) => lower.includes(k))) {
      return {
        detectedLanguage,
        confidence: 0.92,
        primaryIntent: 'UNEXPECTED_EXPLANATION',
        secondaryIntents: [],
        explanationSummary: 'Beneficiary explained reason for document delay.',
        sentiment: 'NEUTRAL',
        extractedEntities: { delayReason: text.slice(0, 80) },
        clarificationNeeded: false,
        isProvisional: true,
        classificationSource: 'DETERMINISTIC_RULES',
        reviewEscalationPath: 'CSC_CASEWORKER_REVIEW',
      };
    }

    // 4. Greetings
    if (
      lower.includes('namaste') ||
      lower.includes('namaskar') ||
      lower.includes('नमस्ते') ||
      lower.includes('नमस्कार') ||
      /\b(hello|hi|hey)\b/i.test(lower)
    ) {
      return {
        detectedLanguage,
        confidence: 0.95,
        primaryIntent: 'GREETING',
        secondaryIntents: [],
        sentiment: 'POSITIVE',
        extractedEntities: {},
        clarificationNeeded: false,
        isProvisional: true,
        classificationSource: 'DETERMINISTIC_RULES',
        reviewEscalationPath: 'NONE',
      };
    }

    // Default
    return {
      detectedLanguage,
      confidence: 0.85,
      primaryIntent: 'DOCUMENT_QUERY',
      secondaryIntents: [],
      sentiment: 'NEUTRAL',
      extractedEntities: {},
      clarificationNeeded: false,
      isProvisional: true,
      classificationSource: 'DETERMINISTIC_RULES',
      reviewEscalationPath: 'NONE',
    };
  }

  // ==========================================================================
  // Synthetic Test Fixtures (Unit / Integration Test Suite Only)
  // ==========================================================================

  public syntheticVisionAssessment(input: DocumentVisionQAInput): DocumentVisionQAResult {
    const isMockClean = input.imageBuffer.includes(Buffer.from('VALID_CLEAR_PASSBOOK'));
    const isMockBlurry = input.imageBuffer.includes(Buffer.from('blurry_sample'));
    const isMockGlare = input.imageBuffer.includes(Buffer.from('glare_sample'));
    const isWrongDoc = input.imageBuffer.includes(Buffer.from('selfie_sample'));

    if (isWrongDoc) {
      return {
        detectedDocumentType: 'childPhoto',
        classificationConfidence: 0.88,
        isTargetMatch: input.targetDocType === 'childPhoto',
        overallQualityScore: 35,
        qualityFlags: {
          isBlurry: false,
          hasGlare: false,
          isCutOff: false,
          isDarkOrUnderexposed: false,
          isRotatedOrUpsideDown: false,
        },
        legibility: 'HIGH',
        specificGuidance: {
          en: `You uploaded a personal photo instead of your ${input.targetDocType}. Please upload a clear photo of your ${input.targetDocType}.`,
          hi: `आपने दस्तावेज़ के बजाय व्यक्तिगत फोटो अपलोड की है। कृपया अपनी ${input.targetDocType} की स्पष्ट फोटो भेजें।`,
          mr: `तुम्ही कागदपत्राऐवजी वैयक्तिक फोटो पाठवला आहे. कृपया तुमच्या ${input.targetDocType} चा स्पष्ट फोटो पाठवा.`,
        },
        modelRecommendation: 'UNRECOGNIZED_DOCUMENT',
        assessmentStatus: 'EVALUATED',
        isProvisional: true,
        classificationSource: 'DETERMINISTIC_RULES',
        reviewEscalationPath: 'CSC_CASEWORKER_REVIEW',
      };
    }

    if (isMockBlurry || isMockGlare) {
      return {
        detectedDocumentType: input.targetDocType,
        classificationConfidence: 0.91,
        isTargetMatch: true,
        overallQualityScore: 40,
        qualityFlags: {
          isBlurry: isMockBlurry,
          hasGlare: isMockGlare,
          isCutOff: false,
          isDarkOrUnderexposed: false,
          isRotatedOrUpsideDown: false,
        },
        legibility: 'UNREADABLE',
        passbookFeatures: input.targetDocType === 'passbookPhoto'
          ? { hasAccountNumber: false, hasIfscCode: false, hasBankSealOrSignature: true, hasAccountHolderName: false }
          : undefined,
        specificGuidance: {
          en: isMockBlurry
            ? 'The photo is blurry and text cannot be read. Please hold the phone steady in good light and retake.'
            : 'Camera flash glare is hiding the account details. Please turn off flash and retake the photo.',
          hi: isMockBlurry
            ? 'फोटो धुंधली है और विवरण पढ़ा नहीं जा रहा है। कृपया फोन को स्थिर रखकर अच्छी रोशनी में दोबारा फोटो लें।'
            : 'कैमरे की फ्लैश चमक से विवरण छिप गया है। कृपया फ्लैश बंद करके सामान्य रोशनी में फोटो लें।',
          mr: isMockBlurry
            ? 'फोटो अस्पष्ट (धुरकट) आहे आणि मजकूर वाचता येत नाही. कृपया चांगल्या प्रकाशात फोन स्थिर धरून पुन्हा फोटो काढा.'
            : 'कॅमेऱ्याच्या फ्लॅशच्या चकाकीमुळे माहिती दिसत नाही. कृपया फ्लॅश बंद करून सामान्य प्रकाशात फोटो काढा.',
        },
        modelRecommendation: 'NEEDS_REPLACEMENT',
        assessmentStatus: 'EVALUATED',
        isProvisional: true,
        classificationSource: 'DETERMINISTIC_RULES',
        reviewEscalationPath: 'CSC_CASEWORKER_REVIEW',
      };
    }

    // High quality acceptable document
    return {
      detectedDocumentType: input.targetDocType,
      classificationConfidence: 0.96,
      isTargetMatch: true,
      overallQualityScore: 92,
      qualityFlags: {
        isBlurry: false,
        hasGlare: false,
        isCutOff: false,
        isDarkOrUnderexposed: false,
        isRotatedOrUpsideDown: false,
      },
      legibility: 'HIGH',
      passbookFeatures: input.targetDocType === 'passbookPhoto'
        ? { hasAccountNumber: true, hasIfscCode: true, hasBankSealOrSignature: true, hasAccountHolderName: true }
        : undefined,
      aadhaarFeatures: input.targetDocType === 'aadhaarCardPhoto'
        ? { hasPhoto: true, hasName: true, hasMaskedNumber: true }
        : undefined,
      specificGuidance: {
        en: 'Document photo is clear, readable, and properly aligned.',
        hi: 'दस्तावेज़ की फोटो स्पष्ट और पढ़ने योग्य है।',
        mr: 'कागदपत्राचा फोटो स्पष्ट आणि वाचता येण्याजोगा आहे.',
      },
      modelRecommendation: 'ACCEPTABLE',
      assessmentStatus: 'EVALUATED',
      isProvisional: true,
      classificationSource: 'DETERMINISTIC_RULES',
      reviewEscalationPath: 'NONE',
    };
  }

  public syntheticAudioTranscription(input: SpeechTranscriptionInput): SpeechTranscriptionResult {
    const bufStr = input.audioBuffer.toString('utf8');
    let text = 'मी उद्या बँकेत जाऊन पासबुक अपडेट करून फोटो पाठवतो';
    let lang: SupportedLanguage = input.languageHint || 'mr';

    if (bufStr.includes('help_csc_voice')) {
      text = 'मला फॉर्म भरताना अडचण येत आहे, कृपया मला को-ऑर्डिनेटरशी बोलायचे आहे मदत करा';
      lang = 'mr';
    } else if (bufStr.includes('hindi_delay_voice')) {
      text = 'नमस्ते, मैं अभी गांव में हूं, परसों आकर पासबुक की फोटो भेज दूंगा';
      lang = 'hi';
    }

    return {
      status: 'SUCCESS',
      transcribedText: text,
      detectedLanguage: lang,
      confidence: 0.94,
      durationSeconds: 4.5,
      isSupportedLanguage: true,
    };
  }

  // ==========================================================================
  // Resilient Fetch with Bounded Retries & Backoff
  // ==========================================================================

  private async executeFetchWithRetry(
    url: string,
    options: RequestInit,
    retriesLeft: number = this.config.maxRetries
  ): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status === 429 && retriesLeft > 0) {
          // Exponential backoff with jitter (200ms -> 800ms)
          const delay = Math.min(800, 200 * Math.pow(2, this.config.maxRetries - retriesLeft)) + Math.random() * 50;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.executeFetchWithRetry(url, options, retriesLeft - 1);
        }
        throw new Error(`Upstream AI provider returned HTTP ${res.status}: ${res.statusText}`);
      }
      return res;
    } catch (err) {
      if (retriesLeft > 0) {
        const delay = 250;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeFetchWithRetry(url, options, retriesLeft - 1);
      }
      throw err;
    }
  }

  private detectLanguageFromText(text: string, fallbackLang: SupportedLanguage = 'en'): SupportedLanguage {
    // Devanagari script ranges (\u0900-\u097F)
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    if (hasDevanagari) {
      // Differentiate Marathi from Hindi using characteristic Marathi morphemes
      const marathiMarkers = ['आहे', 'नाही', 'गेलो', 'गेली', 'पाठवतो', 'करा', 'होते', 'झाले', 'द्या', 'माझे', 'मदत', 'बोलायचे'];
      if (marathiMarkers.some((m) => text.includes(m))) {
        return 'mr';
      }
      return 'hi';
    }

    // Gujarati script (\u0A80-\u0AFF)
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';

    // Bengali script (\u0980-\u09FF)
    if (/[\u0980-\u09FF]/.test(text)) return 'bn';

    return fallbackLang;
  }
}
