/**
 * Model Catalog & Provider Reality Registry
 *
 * Grounded in actual provider capabilities, endpoint reality, and language boundaries:
 *
 * 1. OpenRouter Free Endpoints:
 *    - `meta-llama/llama-3.3-70b-instruct:free` (Hosted Cloud API, Free Community tier)
 *    - `meta-llama/llama-3.2-11b-vision-instruct:free` (Hosted Cloud API, Free Community tier)
 *    - `google/gemini-2.0-flash-exp:free` (Hosted Cloud API, Free Community tier)
 *
 * 2. NVIDIA NIM Endpoints:
 *    - `meta/llama-3.1-70b-instruct` (Hosted Cloud API on integrate.api.nvidia.com, requires Developer Key / Credits)
 *    - `meta/llama-3.2-11b-vision-instruct` (Hosted Cloud API on integrate.api.nvidia.com, requires Developer Key / Credits)
 *    - `nvidia/parakeet-ctc-1.1b-asr` (HOSTED / DOWNLOAD CONTAINER: English ONLY. Does NOT support Indian languages).
 *    - `nvidia/canary-1b` (HOSTED / DOWNLOAD CONTAINER: English, Spanish, German, French ONLY. Does NOT support Indian languages).
 *    - `nvidia/fastpitch-hifigan` (HOSTED / DOWNLOAD CONTAINER: English text-to-speech).
 *
 * CRITICAL LANGUAGE BOUNDARY:
 * Indian languages (mr, hi, gu, bn) are NOT supported on Parakeet or original Canary-1B.
 * Speech transcription for Indian languages must be marked UNSUPPORTED_LANGUAGE until
 * dedicated multilingual ASR (e.g. Bhashini / IndicASR / Whisper multilingual) is provisioned.
 */

export type ModelHostingType =
  | 'HOSTED_CLOUD_API'
  | 'CONTAINER_DOWNLOAD_ONLY'
  | 'IN_PROCESS_RULE_ENGINE';

export type AccountEntitlement =
  | 'FREE_COMMUNITY'
  | 'DEVELOPER_CREDITS'
  | 'UNENTITLED'
  | 'LOCAL_ONLY';

export interface ModelMetadata {
  readonly modelId: string;
  readonly provider: 'OPENROUTER' | 'NVIDIA' | 'DETERMINISTIC_FALLBACK';
  readonly hostingType: ModelHostingType;
  readonly accountEntitlement: AccountEntitlement;
  readonly modality: ('TEXT' | 'VISION' | 'SPEECH_ASR' | 'SPEECH_TTS')[];
  readonly supportedLanguages: readonly string[];
  readonly contextWindowTokens: number;
  readonly supportsStructuredOutput: boolean;
  readonly isFreeTier: boolean;
  readonly privacyPolicyNotes: string;
  readonly realityNotes: string;
}

export const VERIFIED_MODEL_CATALOG: Record<string, ModelMetadata> = {
  // 1. In-Process Deterministic Fallback Engine (Local only, zero egress, zero external dependency)
  'deterministic-rule-engine': {
    modelId: 'deterministic-rule-engine',
    provider: 'DETERMINISTIC_FALLBACK',
    hostingType: 'IN_PROCESS_RULE_ENGINE',
    accountEntitlement: 'LOCAL_ONLY',
    modality: ['TEXT', 'VISION', 'SPEECH_ASR', 'SPEECH_TTS'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 0,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicyNotes: 'Local execution within server boundary; zero network egress, zero third-party retention.',
    realityNotes: 'Executes regex/keyword intent classification. Does NOT guess unassessed image/audio semantic quality.',
  },

  // 2. OpenRouter Hosted Free Tier Models
  'meta-llama/llama-3.3-70b-instruct:free': {
    modelId: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'OPENROUTER',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'FREE_COMMUNITY',
    modality: ['TEXT'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 131072,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicyNotes: 'OpenRouter enforces provider.data_collection=deny in request body to prevent model training.',
    realityNotes: 'Hosted cloud API at https://openrouter.ai/api/v1/chat/completions. Free tier subject to community rate limits.',
  },
  'meta-llama/llama-3.2-11b-vision-instruct:free': {
    modelId: 'meta-llama/llama-3.2-11b-vision-instruct:free',
    provider: 'OPENROUTER',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'FREE_COMMUNITY',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 131072,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicyNotes: 'OpenRouter enforces provider.data_collection=deny. Note: image pixels are transmitted to host endpoint.',
    realityNotes: 'Hosted cloud multimodal API. Free tier subject to community rate limits.',
  },
  'google/gemini-2.0-flash-exp:free': {
    modelId: 'google/gemini-2.0-flash-exp:free',
    provider: 'OPENROUTER',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'FREE_COMMUNITY',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 1048576,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicyNotes: 'OpenRouter enforces provider.data_collection=deny. Google terms apply to transient processing.',
    realityNotes: 'Experimental hosted endpoint; highly capable on Indic scripts.',
  },

  // 3. NVIDIA NIM Cloud Endpoints (Requires NVIDIA_API_KEY)
  'nvidia/meta/llama-3.1-70b-instruct': {
    modelId: 'meta/llama-3.1-70b-instruct',
    provider: 'NVIDIA',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'DEVELOPER_CREDITS',
    modality: ['TEXT'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 128000,
    supportsStructuredOutput: true,
    isFreeTier: false, // Developer credit grant (1,000 free credits on signup)
    privacyPolicyNotes: 'NVIDIA API: Customer data processed ephemerally, not used for model retraining.',
    realityNotes: 'Hosted at https://integrate.api.nvidia.com/v1/chat/completions.',
  },
  'nvidia/meta/llama-3.2-11b-vision-instruct': {
    modelId: 'meta/llama-3.2-11b-vision-instruct',
    provider: 'NVIDIA',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'DEVELOPER_CREDITS',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 128000,
    supportsStructuredOutput: true,
    isFreeTier: false, // Developer credit grant
    privacyPolicyNotes: 'NVIDIA API: Transmitted image buffers processed ephemerally for completion inference.',
    realityNotes: 'Hosted at https://integrate.api.nvidia.com/v1/chat/completions.',
  },

  // 4. NVIDIA Speech Models (REALITY: English/European only; NO Indian languages)
  'nvidia/parakeet-ctc-1.1b-asr': {
    modelId: 'nvidia/parakeet-ctc-1.1b-asr',
    provider: 'NVIDIA',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'DEVELOPER_CREDITS',
    modality: ['SPEECH_ASR'],
    supportedLanguages: ['en'], // STRICTLY ENGLISH ONLY
    contextWindowTokens: 0,
    supportsStructuredOutput: false,
    isFreeTier: false,
    privacyPolicyNotes: 'Audio processed for transcription without training retention.',
    realityNotes: 'English ONLY. Indian languages (mr, hi, gu, bn) are completely unsupported and fail closed.',
  },
  'nvidia/canary-1b': {
    modelId: 'nvidia/canary-1b',
    provider: 'NVIDIA',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'DEVELOPER_CREDITS',
    modality: ['SPEECH_ASR'],
    supportedLanguages: ['en', 'es', 'de', 'fr'], // NO INDIAN LANGUAGES
    contextWindowTokens: 0,
    supportsStructuredOutput: false,
    isFreeTier: false,
    privacyPolicyNotes: 'Audio processed for transcription without training retention.',
    realityNotes: 'English, Spanish, German, French ONLY. Does NOT support Indian languages. Must return UNSUPPORTED_LANGUAGE.',
  },
  'nvidia/fastpitch-hifigan': {
    modelId: 'nvidia/fastpitch-hifigan',
    provider: 'NVIDIA',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'DEVELOPER_CREDITS',
    modality: ['SPEECH_TTS'],
    supportedLanguages: ['en'], // Hosted NIM endpoint supports English TTS
    contextWindowTokens: 0,
    supportsStructuredOutput: false,
    isFreeTier: false,
    privacyPolicyNotes: 'Text processed ephemerally to produce PCM audio.',
    realityNotes: 'English Text-to-Speech (TTS). Indian language voice synthesis is unavailable without regional voice models.',
  },
};
