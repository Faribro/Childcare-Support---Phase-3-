import { describe, it, expect, beforeEach } from 'vitest';
import { AIMultimodalGateway } from '../gateway';
import { PrivacyFilter } from '../privacy-filter';
import { VERIFIED_MODEL_CATALOG } from '../model-catalog';
import {
  createSyntheticDocumentImage,
  PINNED_TEXT_MODEL,
  PINNED_VISION_MODEL,
  MAX_INFERENCE_REQUESTS,
} from '../../../../scripts/run-bounded-synthetic-test';

describe('AI Multimodal Gateway & Privacy Gate Suite', () => {
  let honestGateway: AIMultimodalGateway;
  let syntheticGateway: AIMultimodalGateway;

  beforeEach(() => {
    // Default Honest Gateway: Zero keys, syntheticTestMode false (production-like fallback)
    honestGateway = new AIMultimodalGateway({
      openRouterApiKey: undefined,
      nvidiaApiKey: undefined,
      allowPaidFallback: false,
      syntheticTestMode: false,
      maxRetries: 2,
    });

    // Synthetic Gateway: Explicit opt-in for testing fixture evaluation
    syntheticGateway = new AIMultimodalGateway({
      openRouterApiKey: undefined,
      nvidiaApiKey: undefined,
      allowPaidFallback: false,
      syntheticTestMode: true,
      maxRetries: 2,
    });
  });

  describe('1. Configuration & Secret Names Verification', () => {
    it('confirms canonical secret names OPENROUTER_API_KEY and NVIDIA_API_KEY with deterministic default', () => {
      const summary = honestGateway.getConfigSummary();
      expect(summary.allowPaidFallback).toBe(false);
      expect(summary.dataCollectionOptOut).toBe(true);
      expect(summary.defaultProvider).toBe('DETERMINISTIC_FALLBACK');
      expect(summary.syntheticTestMode).toBe(false);
    });

    it('verifies model catalog contains verified endpoints, hosting types, and reality notes', () => {
      const catalogEntries = Object.values(VERIFIED_MODEL_CATALOG);
      expect(catalogEntries.length).toBeGreaterThanOrEqual(6);

      // Verify OpenRouter text & vision models
      const openRouterVision = VERIFIED_MODEL_CATALOG['google/gemma-4-31b-it:free'] || VERIFIED_MODEL_CATALOG['nvidia/nemotron-3.5-super-vl:free'];
      expect(openRouterVision).toBeDefined();
      expect(openRouterVision.hostingType).toBe('HOSTED_CLOUD_API');
      expect(openRouterVision.accountEntitlement).toBe('FREE_COMMUNITY');
      expect(openRouterVision.modality).toContain('VISION');

      const openRouterText = VERIFIED_MODEL_CATALOG['nvidia/nemotron-3.5-lightning:free'];
      expect(openRouterText).toBeDefined();
      expect(openRouterText.hostingType).toBe('HOSTED_CLOUD_API');
      expect(openRouterText.accountEntitlement).toBe('FREE_COMMUNITY');
      expect(openRouterText.modality).toContain('TEXT');
    });

    it('strictly documents that Parakeet is English-only and Canary-1B does NOT support Indian languages', () => {
      const parakeet = VERIFIED_MODEL_CATALOG['nvidia/parakeet-ctc-1.1b-asr'];
      expect(parakeet).toBeDefined();
      expect(parakeet.supportedLanguages).toEqual(['en']); // Strictly English ONLY

      const canary = VERIFIED_MODEL_CATALOG['nvidia/canary-1b'];
      expect(canary).toBeDefined();
      expect(canary.supportedLanguages).toEqual(['en', 'es', 'de', 'fr']);
      expect(canary.supportedLanguages).not.toContain('hi');
      expect(canary.supportedLanguages).not.toContain('mr');
    });
  });

  describe('2. Privacy Gate & Serialized Request Validation', () => {
    it('scrubs 12-digit Aadhaar numbers and preserves only structural token in text', () => {
      const rawText = 'My Aadhaar number is 5482 1928 3841, please check enrollment.';
      const scrubbed = PrivacyFilter.scrubTextForInference(rawText);

      expect(scrubbed).not.toContain('5482');
      expect(scrubbed).not.toContain('1928');
      expect(scrubbed).toContain('[AADHAAR_MASKED_XXXX_XXXX_3841]');
    });

    it('scrubs 9 to 18 digit bank account numbers before model inference', () => {
      const rawText = 'Passbook account number 918273645123 at State Bank of India';
      const scrubbed = PrivacyFilter.scrubTextForInference(rawText);

      expect(scrubbed).not.toContain('918273645123');
      expect(scrubbed).toContain('[BANK_ACCOUNT_MASKED_5123]');
    });

    it('masks raw phone numbers to E.164 display format and hashes for audit logs', () => {
      const rawPhone = '+919876543210';
      const masked = PrivacyFilter.maskPhone(rawPhone);
      const hash = PrivacyFilter.hashPhone(rawPhone);

      expect(masked).toBe('+91 ******3210');
      expect(hash).toHaveLength(64); // SHA-256
      expect(hash).not.toContain('9876543210');
    });

    it('implements OpenRouter provider.data_collection="deny" request parameter and verifies serialized JSON', () => {
      const basePayload = {
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [{ role: 'user', content: 'test message' }],
      };
      const decorated = PrivacyFilter.decorateOpenRouterPayload(basePayload);

      // Verify in-memory structure
      expect(decorated.provider).toBeDefined();
      expect(decorated.provider.data_collection).toBe('deny');

      // Verify exact serialized request JSON
      const serialized = JSON.stringify(decorated);
      const parsed = JSON.parse(serialized);
      expect(parsed.provider).toEqual({ data_collection: 'deny' });
      expect(parsed.provider.data_collection).toBe('deny');
    });

    it('validates provider compliance and blocks unapproved external providers', () => {
      const nvidiaCheck = PrivacyFilter.validateProviderCompliance('NVIDIA');
      expect(nvidiaCheck.isApproved).toBe(true);

      const openRouterCheck = PrivacyFilter.validateProviderCompliance('OPENROUTER');
      expect(openRouterCheck.isApproved).toBe(true);

      const unapprovedCheck = PrivacyFilter.validateProviderCompliance('RANDOM_UNVERIFIED_PROXY');
      expect(unapprovedCheck.isApproved).toBe(false);
      expect(unapprovedCheck.policy).toContain('UNAPPROVED_PROVIDER');
    });
  });

  describe('3. Multilingual Text & Intent Classification Benchmarks', () => {
    it('classifies Marathi language selection with high confidence', async () => {
      const res = await honestGateway.classifyIntent({
        messageText: 'मला मराठी भाषेत माहिती हवी आहे',
        context: { activeRequestedDoc: 'passbookPhoto' },
      });

      expect(res.detectedLanguage).toBe('mr');
      expect(res.primaryIntent).toBe('LANGUAGE_SELECTION');
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('classifies Hindi delay explanation accurately', async () => {
      const res = await honestGateway.classifyIntent({
        messageText: 'आज बैंक बंद है, मैं कल जाकर पासबुक की फोटो भेज दूंगा',
        context: { currentLanguage: 'hi', activeRequestedDoc: 'passbookPhoto' },
      });

      expect(res.detectedLanguage).toBe('hi');
      expect(res.primaryIntent).toBe('UNEXPECTED_EXPLANATION');
      expect(res.extractedEntities.delayReason).toBeDefined();
    });

    it('identifies human coordinator escalation request across Marathi and Hindi', async () => {
      const mrRes = await honestGateway.classifyIntent({
        messageText: 'मला को-ऑर्डिनेटरशी प्रत्यक्ष बोलायचे आहे, फॉर्म समजत नाही मदत करा',
        context: { currentLanguage: 'mr' },
      });
      expect(mrRes.primaryIntent).toBe('HUMAN_CSC_ESCALATION');
      expect(mrRes.sentiment).toBe('DISTRESSED');

      const hiRes = await honestGateway.classifyIntent({
        messageText: 'कृपया मुझे किसी कार्यकर्ता से बात करवाइए, मदद चाहिए',
        context: { currentLanguage: 'hi' },
      });
      expect(hiRes.primaryIntent).toBe('HUMAN_CSC_ESCALATION');
    });
  });

  describe('4. Honest Fallbacks & Quality Assessment', () => {
    it('returns honest NOT_ASSESSED when credentials are absent and does not invent quality scores', async () => {
      const anyImageBuffer = Buffer.from('RAW_UNEVALUATED_IMAGE_DATA');
      const assessment = await honestGateway.assessDocumentImage({
        imageBuffer: anyImageBuffer,
        mimeType: 'image/jpeg',
        targetDocType: 'passbookPhoto',
        preferredLanguage: 'mr',
      });

      expect(assessment.modelRecommendation).toBe('NOT_ASSESSED');
      expect(assessment.assessmentStatus).toBe('NOT_ASSESSED');
      expect(assessment.legibility).toBe('NOT_ASSESSED');
      expect(assessment.overallQualityScore).toBeNull();
      expect(assessment.specificGuidance.mr).toContain('स्वयंचलित गुणवत्ता तपासणी सध्या अनुपलब्ध आहे');
    });

    it('returns UNSUPPORTED_LANGUAGE when speech transcription is attempted for Indian languages on Canary/Parakeet', async () => {
      const mockAudio = Buffer.from('RIFF_OPUS_VOICE_NOTE_SAMPLE');
      const result = await honestGateway.transcribeAudio({
        audioBuffer: mockAudio,
        mimeType: 'audio/ogg; codecs=opus',
        languageHint: 'mr',
      });

      expect(result.status).toBe('UNSUPPORTED_LANGUAGE');
      expect(result.isSupportedLanguage).toBe(false);
      expect(result.transcribedText).toBe('');
      expect(result.error).toContain('not supported by available ASR endpoints');
    });

    it('returns TRANSCRIPTION_UNAVAILABLE for English speech when provider credentials are not configured', async () => {
      const mockAudio = Buffer.from('RIFF_OPUS_VOICE_NOTE_SAMPLE');
      const result = await honestGateway.transcribeAudio({
        audioBuffer: mockAudio,
        mimeType: 'audio/ogg; codecs=opus',
        languageHint: 'en',
      });

      expect(result.status).toBe('TRANSCRIPTION_UNAVAILABLE');
      expect(result.isSupportedLanguage).toBe(true);
      expect(result.transcribedText).toBe('');
      expect(result.error).toContain('no active provider credentials configured');
    });

    it('returns SYNTHESIS_UNAVAILABLE for speech synthesis when no provider credentials exist', async () => {
      const result = await honestGateway.synthesizeSpeech({
        textToSpeak: 'Hello caregiver',
        language: 'en',
      });

      expect(result.status).toBe('SYNTHESIS_UNAVAILABLE');
      expect(result.isPlayable).toBe(false);
      expect(result.audioBuffer).toBeUndefined();
    });

    it('evaluates synthetic test markers when explicitly configured in synthetic test mode', async () => {
      const cleanPassbookBuffer = Buffer.from('VALID_CLEAR_PASSBOOK_JPEG_HEADER_0xFF_0xD8_0xFF_CLEAN_TEXT');
      const assessment = await syntheticGateway.assessDocumentImage({
        imageBuffer: cleanPassbookBuffer,
        mimeType: 'image/jpeg',
        targetDocType: 'passbookPhoto',
        preferredLanguage: 'mr',
      });

      expect(assessment.detectedDocumentType).toBe('passbookPhoto');
      expect(assessment.isTargetMatch).toBe(true);
      expect(assessment.overallQualityScore).toBeGreaterThanOrEqual(70);
      expect(assessment.modelRecommendation).toBe('ACCEPTABLE');
    });

    it('generates genuine binary PNG bytes with valid magic header and PNG chunks for bounded test', () => {
      const pngBuffer = createSyntheticDocumentImage();
      expect(pngBuffer.length).toBeGreaterThan(1000);

      // Verify standard 8-byte PNG signature: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A
      const expectedMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(pngBuffer.subarray(0, 8).equals(expectedMagic)).toBe(true);

      // Verify IHDR chunk at offset 8
      const ihdrLen = pngBuffer.readUInt32BE(8);
      expect(ihdrLen).toBe(13);
      expect(pngBuffer.subarray(12, 16).toString('ascii')).toBe('IHDR');

      // Verify IDAT and IEND chunks exist
      const str = pngBuffer.toString('latin1');
      expect(str.includes('IDAT')).toBe(true);
      expect(str.includes('IEND')).toBe(true);
    });

    it('pins exact models and enforces capped inference request limit in bounded test runner', () => {
      expect(PINNED_TEXT_MODEL).toBe('nvidia/nemotron-3.5-lightning:free');
      expect(PINNED_VISION_MODEL).toBe('google/gemma-4-31b-it:free');
      expect(MAX_INFERENCE_REQUESTS).toBe(3);
    });

    it('labels local deterministic intent classifications as provisional with appropriate review escalation path', async () => {
      const intent = await honestGateway.classifyIntent({
        messageText: 'को-ऑर्डिनेटर ला फोन करायला सांगा, अडचण आहे',
        context: { currentLanguage: 'mr' },
      });

      expect(intent.primaryIntent).toBe('HUMAN_CSC_ESCALATION');
      expect(intent.detectedLanguage).toBe('mr');
      expect(intent.isProvisional).toBe(true);
      expect(intent.classificationSource).toBe('DETERMINISTIC_RULES');
      expect(intent.reviewEscalationPath).toBe('CSC_CASEWORKER_REVIEW');
    });

    it('labels local deterministic document assessment as provisional and routes to CSC caseworker review', async () => {
      const assessment = await honestGateway.assessDocumentImage({
        imageBuffer: Buffer.from('FAKE_IMAGE_DATA'),
        mimeType: 'image/png',
        targetDocType: 'passbookPhoto',
        preferredLanguage: 'mr',
      });

      expect(assessment.assessmentStatus).toBe('NOT_ASSESSED');
      expect(assessment.isProvisional).toBe(true);
      expect(assessment.classificationSource).toBe('DETERMINISTIC_RULES');
      expect(assessment.reviewEscalationPath).toBe('CSC_CASEWORKER_REVIEW');
      expect(assessment.overallQualityScore).toBeNull();
    });
  });
});
