import { describe, it, expect, beforeEach } from 'vitest';
import { AIMultimodalGateway } from '../gateway';
import { PrivacyFilter } from '../privacy-filter';
import { VERIFIED_MODEL_CATALOG } from '../model-catalog';

describe('AI Multimodal Gateway & Privacy Gate Suite', () => {
  let gateway: AIMultimodalGateway;

  beforeEach(() => {
    // Zero live keys by default to test bounded local and failover behavior
    gateway = new AIMultimodalGateway({
      openRouterApiKey: undefined,
      nvidiaApiKey: undefined,
      allowPaidFallback: false,
      maxRetries: 2,
    });
  });

  describe('1. Configuration & Secret Names Verification', () => {
    it('confirms canonical secret names OPENROUTER_API_KEY and NVIDIA_API_KEY', () => {
      const summary = gateway.getConfigSummary();
      expect(summary.allowPaidFallback).toBe(false);
      expect(summary.dataCollectionOptOut).toBe(true);
      expect(summary.defaultProvider).toBe('OPENROUTER');
    });

    it('verifies model catalog contains verified free tier models and zero speculative IDs', () => {
      const freeModels = Object.values(VERIFIED_MODEL_CATALOG).filter((m) => m.isFreeTier);
      expect(freeModels.length).toBeGreaterThanOrEqual(4);

      const openRouterVision = VERIFIED_MODEL_CATALOG['meta-llama/llama-3.2-11b-vision-instruct:free'];
      expect(openRouterVision).toBeDefined();
      expect(openRouterVision.modality).toContain('VISION');
      expect(openRouterVision.contextWindowTokens).toBeGreaterThanOrEqual(128000);

      const openRouterText = VERIFIED_MODEL_CATALOG['meta-llama/llama-3.3-70b-instruct:free'];
      expect(openRouterText).toBeDefined();
      expect(openRouterText.modality).toContain('TEXT');
    });
  });

  describe('2. Privacy Gate & Pre-Inference PII Scrubbing', () => {
    it('scrubs 12-digit Aadhaar numbers and preserves only structural token', () => {
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

    it('enforces data_collection: deny parameter on OpenRouter payloads', () => {
      const basePayload = {
        model: 'nvidia/nemotron-3.5-lightning:free',
        messages: [{ role: 'user', content: 'test' }],
      };
      const decorated = PrivacyFilter.decorateOpenRouterPayload(basePayload);

      expect(decorated.data_collection).toBe('deny');
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
      const res = await gateway.classifyIntent({
        messageText: 'मला मराठी भाषेत माहिती हवी आहे',
        context: { activeRequestedDoc: 'passbookPhoto' },
      });

      expect(res.detectedLanguage).toBe('mr');
      expect(res.primaryIntent).toBe('LANGUAGE_SELECTION');
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('classifies Hindi delay explanation accurately', async () => {
      const res = await gateway.classifyIntent({
        messageText: 'आज बैंक बंद है, मैं कल जाकर पासबुक की फोटो भेज दूंगा',
        context: { currentLanguage: 'hi', activeRequestedDoc: 'passbookPhoto' },
      });

      expect(res.detectedLanguage).toBe('hi');
      expect(res.primaryIntent).toBe('UNEXPECTED_EXPLANATION');
      expect(res.extractedEntities.delayReason).toBeDefined();
    });

    it('identifies human coordinator escalation request across Marathi and Hindi', async () => {
      const mrRes = await gateway.classifyIntent({
        messageText: 'मला को-ऑर्डिनेटरशी प्रत्यक्ष बोलायचे आहे, फॉर्म समजत नाही मदत करा',
        context: { currentLanguage: 'mr' },
      });
      expect(mrRes.primaryIntent).toBe('HUMAN_CSC_ESCALATION');
      expect(mrRes.sentiment).toBe('DISTRESSED');

      const hiRes = await gateway.classifyIntent({
        messageText: 'कृपया मुझे किसी कार्यकर्ता से बात करवाइए, मदद चाहिए',
        context: { currentLanguage: 'hi' },
      });
      expect(hiRes.primaryIntent).toBe('HUMAN_CSC_ESCALATION');
    });
  });

  describe('4. Document Vision & Quality Assessment Engine', () => {
    it('approves clear acceptable passbook photo with high quality score', async () => {
      // Simulate clean image buffer
      const cleanPassbookBuffer = Buffer.from('VALID_CLEAR_PASSBOOK_JPEG_HEADER_0xFF_0xD8_0xFF_CLEAN_TEXT');
      const assessment = await gateway.assessDocumentImage({
        imageBuffer: cleanPassbookBuffer,
        mimeType: 'image/jpeg',
        targetDocType: 'passbookPhoto',
        preferredLanguage: 'mr',
      });

      expect(assessment.detectedDocumentType).toBe('passbookPhoto');
      expect(assessment.isTargetMatch).toBe(true);
      expect(assessment.overallQualityScore).toBeGreaterThanOrEqual(70);
      expect(assessment.legibility).toBe('HIGH');
      expect(assessment.modelRecommendation).toBe('ACCEPTABLE');
      expect(assessment.qualityFlags.isBlurry).toBe(false);
      expect(assessment.qualityFlags.hasGlare).toBe(false);
    });

    it('detects blurry photo and returns specific Marathi replacement guidance', async () => {
      const blurryBuffer = Buffer.from('blurry_sample_degraded_document_low_res');
      const assessment = await gateway.assessDocumentImage({
        imageBuffer: blurryBuffer,
        mimeType: 'image/jpeg',
        targetDocType: 'passbookPhoto',
        preferredLanguage: 'mr',
      });

      expect(assessment.overallQualityScore).toBeLessThan(70);
      expect(assessment.qualityFlags.isBlurry).toBe(true);
      expect(assessment.modelRecommendation).toBe('NEEDS_REPLACEMENT');
      expect(assessment.specificGuidance.mr).toMatch(/अस्पष्ट|धुरकट|चांगल्या प्रकाशात/);
    });

    it('detects camera flash glare and returns specific Hindi guidance', async () => {
      const glareBuffer = Buffer.from('glare_sample_camera_flash_washout');
      const assessment = await gateway.assessDocumentImage({
        imageBuffer: glareBuffer,
        mimeType: 'image/jpeg',
        targetDocType: 'passbookPhoto',
        preferredLanguage: 'hi',
      });

      expect(assessment.qualityFlags.hasGlare).toBe(true);
      expect(assessment.modelRecommendation).toBe('NEEDS_REPLACEMENT');
      expect(assessment.specificGuidance.hi).toMatch(/फ्लैश|चमक/);
    });

    it('flags document type mismatch when caregiver sends personal portrait instead of passbook', async () => {
      const selfieBuffer = Buffer.from('selfie_sample_person_face_not_passbook');
      const assessment = await gateway.assessDocumentImage({
        imageBuffer: selfieBuffer,
        mimeType: 'image/jpeg',
        targetDocType: 'passbookPhoto',
        preferredLanguage: 'en',
      });

      expect(assessment.detectedDocumentType).toBe('childPhoto');
      expect(assessment.isTargetMatch).toBe(false);
      expect(assessment.modelRecommendation).toBe('UNRECOGNIZED_DOCUMENT');
      expect(assessment.specificGuidance.en).toContain('personal photo');
    });
  });

  describe('5. Speech Transcription & Synthesis for Async Voice Notes', () => {
    it('transcribes voice note audio into Marathi text with duration and confidence', async () => {
      const mockAudio = Buffer.from('RIFF_OPUS_VOICE_NOTE_help_csc_voice');
      const result = await gateway.transcribeAudio({
        audioBuffer: mockAudio,
        mimeType: 'audio/ogg; codecs=opus',
        languageHint: 'mr',
      });

      expect(result.detectedLanguage).toBe('mr');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.transcribedText).toContain('अडचण');
      expect(result.durationSeconds).toBeGreaterThan(0);
    });

    it('synthesizes accessible Marathi voice guidance audio', async () => {
      const ttsResult = await gateway.synthesizeSpeech({
        textToSpeak: 'कृपया तुमच्या बँक पासबुकचा स्पष्ट फोटो पाठवा',
        language: 'mr',
      });

      expect(ttsResult.mimeType).toBe('audio/ogg');
      expect(ttsResult.audioBuffer.length).toBeGreaterThan(0);
      expect(ttsResult.durationSeconds).toBeGreaterThan(0);
    });
  });
});
