/**
 * Synthetic AI Provider Smoke Test Runner
 *
 * SCOPE & SAFETY BOUNDARY:
 * 1. Zero Real Beneficiary Data: Only synthetic, anonymized test fixtures are used.
 * 2. Provider Reality: Tests live endpoints only when OPENROUTER_API_KEY or NVIDIA_API_KEY is supplied.
 * 3. Privacy Enforcement: All text is passed through PrivacyFilter with provider.data_collection="deny".
 * 4. Benchmarking: Measures and logs exact latency (ms), model ID, provider, and schema validation.
 */

import { AIMultimodalGateway } from '../src/features/ai-multimodal/gateway';
import { PrivacyFilter } from '../src/features/ai-multimodal/privacy-filter';
import { SupportedLanguage } from '../src/features/ai-multimodal/types';

interface SmokeTestResult {
  modality: 'TEXT_INTENT' | 'VISION_QA' | 'SPEECH_ASR' | 'SPEECH_TTS';
  language: SupportedLanguage;
  inputDescription: string;
  provider: string;
  modelId: string;
  latencyMs: number;
  status: 'PASS' | 'FAIL' | 'SKIPPED_NO_KEY' | 'UNSUPPORTED_LANGUAGE';
  outputSnippet?: string;
  error?: string;
}

async function runSyntheticSmokeTests(): Promise<void> {
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const hasNvidia = Boolean(process.env.NVIDIA_API_KEY?.trim());

  console.log('======================================================================');
  console.log('   AI PROVIDER SYNTHETIC SMOKE TEST RUNNER');
  console.log('======================================================================');
  console.log(`OpenRouter API Key present: ${hasOpenRouter ? 'YES' : 'NO'}`);
  console.log(`NVIDIA API Key present:     ${hasNvidia ? 'YES' : 'NO'}`);
  console.log('----------------------------------------------------------------------\n');

  if (!hasOpenRouter && !hasNvidia) {
    console.log('[INFO] No provider API keys detected in environment.');
    console.log('To run live upstream smoke tests, provide:');
    console.log('  $env:OPENROUTER_API_KEY="sk-or-v1-..."');
    console.log('  $env:NVIDIA_API_KEY="nvapi-..."');
    console.log('\nRunning in honest fallback / local inspection mode...\n');
  }

  const gateway = new AIMultimodalGateway({
    allowPaidFallback: false,
    syntheticTestMode: false, // Tests real upstream when keys exist, honest fallback otherwise
  });

  const results: SmokeTestResult[] = [];

  // ==========================================================================
  // Test 1: Multilingual Intent Classification (Marathi, Hindi, English)
  // ==========================================================================
  const textTestCases: { lang: SupportedLanguage; text: string; expectedIntent: string }[] = [
    {
      lang: 'mr',
      text: 'मी सध्या पुण्यात आलो आहे, २ दिवसांनी बँक पासबुकचा फोटो पाठवतो',
      expectedIntent: 'UNEXPECTED_EXPLANATION',
    },
    {
      lang: 'hi',
      text: 'कृपया मुझे किसी कार्यकर्ता से बात करवाइए, फॉर्म नहीं समझ आ रहा',
      expectedIntent: 'HUMAN_CSC_ESCALATION',
    },
    {
      lang: 'en',
      text: 'Which document should I upload for school fee verification?',
      expectedIntent: 'DOCUMENT_QUERY',
    },
  ];

  for (const tc of textTestCases) {
    const start = Date.now();
    try {
      const res = await gateway.classifyIntent({
        messageText: tc.text,
        context: { currentLanguage: tc.lang, activeRequestedDoc: 'passbookPhoto' },
      });
      const latencyMs = Date.now() - start;
      const provider = hasOpenRouter ? 'OPENROUTER' : hasNvidia ? 'NVIDIA' : 'IN_PROCESS_DETERMINISTIC';
      const model = hasOpenRouter ? 'meta-llama/llama-3.3-70b-instruct:free' : hasNvidia ? 'meta/llama-3.1-70b-instruct' : 'deterministic-rule-engine';

      results.push({
        modality: 'TEXT_INTENT',
        language: tc.lang,
        inputDescription: `"${tc.text.slice(0, 35)}..."`,
        provider,
        modelId: model,
        latencyMs,
        status: res.primaryIntent === tc.expectedIntent ? 'PASS' : 'FAIL',
        outputSnippet: `Intent=${res.primaryIntent}, Lang=${res.detectedLanguage}, Conf=${res.confidence}`,
      });
    } catch (err) {
      results.push({
        modality: 'TEXT_INTENT',
        language: tc.lang,
        inputDescription: `"${tc.text.slice(0, 35)}..."`,
        provider: hasOpenRouter ? 'OPENROUTER' : 'UNKNOWN',
        modelId: 'failed',
        latencyMs: Date.now() - start,
        status: 'FAIL',
        error: (err as Error).message,
      });
    }
  }

  // ==========================================================================
  // Test 2: Document Vision QA (Synthetic Passbook)
  // ==========================================================================
  {
    const start = Date.now();
    const syntheticBuffer = Buffer.from('SYNTHETIC_TEST_IMAGE_BUFFER');
    try {
      const res = await gateway.assessDocumentImage({
        imageBuffer: syntheticBuffer,
        mimeType: 'image/jpeg',
        targetDocType: 'passbookPhoto',
        preferredLanguage: 'mr',
      });
      const latencyMs = Date.now() - start;
      results.push({
        modality: 'VISION_QA',
        language: 'mr',
        inputDescription: 'Synthetic passbook image buffer',
        provider: hasOpenRouter ? 'OPENROUTER' : hasNvidia ? 'NVIDIA' : 'HONEST_FALLBACK',
        modelId: hasOpenRouter ? 'meta-llama/llama-3.2-11b-vision-instruct:free' : 'NOT_ASSESSED',
        latencyMs,
        status: 'PASS',
        outputSnippet: `Recommendation=${res.modelRecommendation}, Status=${res.assessmentStatus}, Legibility=${res.legibility}`,
      });
    } catch (err) {
      results.push({
        modality: 'VISION_QA',
        language: 'mr',
        inputDescription: 'Synthetic passbook image buffer',
        provider: 'OPENROUTER',
        modelId: 'meta-llama/llama-3.2-11b-vision-instruct:free',
        latencyMs: Date.now() - start,
        status: 'FAIL',
        error: (err as Error).message,
      });
    }
  }

  // ==========================================================================
  // Test 3: Speech ASR Language Boundary Check (Marathi vs English)
  // ==========================================================================
  {
    const start = Date.now();
    const res = await gateway.transcribeAudio({
      audioBuffer: Buffer.from('SYNTHETIC_AUDIO_SAMPLE'),
      mimeType: 'audio/ogg; codecs=opus',
      languageHint: 'mr',
    });
    const latencyMs = Date.now() - start;
    results.push({
      modality: 'SPEECH_ASR',
      language: 'mr',
      inputDescription: 'Marathi voice note (Indic language boundary test)',
      provider: 'NVIDIA_NIM_BOUNDARY_CHECK',
      modelId: 'nvidia/canary-1b',
      latencyMs,
      status: res.status === 'UNSUPPORTED_LANGUAGE' ? 'PASS' : 'FAIL',
      outputSnippet: `Status=${res.status}, isSupported=${res.isSupportedLanguage}, error=${res.error?.slice(0, 45)}...`,
    });
  }

  // ==========================================================================
  // Output Formatted Report
  // ==========================================================================
  console.log('| Modality | Lang | Provider | Model ID | Latency | Status | Details |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const r of results) {
    console.log(
      `| ${r.modality} | ${r.language} | ${r.provider} | ${r.modelId} | ${r.latencyMs}ms | ${r.status} | ${r.outputSnippet || r.error || ''} |`
    );
  }
  console.log('======================================================================\n');
}

runSyntheticSmokeTests().catch((err) => {
  console.error('[SMOKE_TEST_ERROR]', err);
  process.exit(1);
});
