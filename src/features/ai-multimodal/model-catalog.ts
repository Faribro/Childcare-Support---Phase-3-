/**
 * Model Catalog & Provider Reality Registry
 *
 * Grounded in actual provider capabilities, endpoint reality, and language boundaries:
 *
 * 1. OpenRouter Currently Verified Free Endpoints (Live verified from https://openrouter.ai/api/v1/models):
 *    - `nvidia/nemotron-3.5-lightning:free` (Hosted Cloud API, Free Community tier, Text)
 *    - `google/gemma-4-31b-it:free` (Hosted Cloud API, Free Community tier, Multimodal Text + Vision)
 *    - `nvidia/nemotron-3.5-super-vl:free` (Hosted Cloud API, Free Community tier, Multimodal Text + Vision)
 *    - `openrouter/free` (Hosted Free Router, routes dynamically to currently available free models)
 *
 * 2. NVIDIA NIM Cloud Endpoints:
 *    - `meta/llama-3.1-70b-instruct` (Hosted Cloud API on integrate.api.nvidia.com, requires Developer Key / Credits)
 *    - `meta/llama-3.2-11b-vision-instruct` (Hosted Cloud API on integrate.api.nvidia.com, requires Developer Key / Credits)
 *
 * 3. Speech Reality & Boundary:
 *    - NVIDIA Riva speech endpoints do not use standard OpenAI REST paths and require gRPC/Riva microservices.
 *    - Parakeet is English-only. Canary-1B supports en, es, de, fr only.
 *    - Indian languages (mr, hi, gu, bn) are completely unsupported on standard NVIDIA public speech models.
 *    - All speech calls remain UNVERIFIED and must not be called during test execution.
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

  // 2. OpenRouter Live Free Tier Models (Live confirmed via OpenRouter /api/v1/models)
  'nvidia/nemotron-3.5-lightning:free': {
    modelId: 'nvidia/nemotron-3.5-lightning:free',
    provider: 'OPENROUTER',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'FREE_COMMUNITY',
    modality: ['TEXT'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 1000000,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicyNotes: 'OpenRouter enforces provider.data_collection=deny in request body to prevent model training.',
    realityNotes: 'Hosted cloud API at https://openrouter.ai/api/v1/chat/completions. Verified active in free model list.',
  },
  'google/gemma-4-31b-it:free': {
    modelId: 'google/gemma-4-31b-it:free',
    provider: 'OPENROUTER',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'FREE_COMMUNITY',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 262144,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicyNotes: 'OpenRouter enforces provider.data_collection=deny. Verified active in free model list.',
    realityNotes: 'Multimodal vision and text model. Highly capable on Indic scripts.',
  },
  'nvidia/nemotron-3.5-super-vl:free': {
    modelId: 'nvidia/nemotron-3.5-super-vl:free',
    provider: 'OPENROUTER',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'FREE_COMMUNITY',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 1000000,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicyNotes: 'OpenRouter enforces provider.data_collection=deny. Verified active in free model list.',
    realityNotes: 'Multimodal vision and text model with 1M context length.',
  },
  'openrouter/free': {
    modelId: 'openrouter/free',
    provider: 'OPENROUTER',
    hostingType: 'HOSTED_CLOUD_API',
    accountEntitlement: 'FREE_COMMUNITY',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 200000,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicyNotes: 'OpenRouter enforces provider.data_collection=deny.',
    realityNotes: 'Meta-router automatically resolving active free models on OpenRouter.',
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

  // 4. NVIDIA Speech Models (UNVERIFIED PROTOCOL & ENGLISH/EUROPEAN ONLY)
  'nvidia/parakeet-ctc-1.1b-asr': {
    modelId: 'nvidia/parakeet-ctc-1.1b-asr',
    provider: 'NVIDIA',
    hostingType: 'CONTAINER_DOWNLOAD_ONLY',
    accountEntitlement: 'DEVELOPER_CREDITS',
    modality: ['SPEECH_ASR'],
    supportedLanguages: ['en'], // STRICTLY ENGLISH ONLY
    contextWindowTokens: 0,
    supportsStructuredOutput: false,
    isFreeTier: false,
    privacyPolicyNotes: 'Audio processed for transcription without training retention.',
    realityNotes: 'English ONLY. Unverified cloud endpoint; requires Riva gRPC deployment. Indian languages unsupported.',
  },
  'nvidia/canary-1b': {
    modelId: 'nvidia/canary-1b',
    provider: 'NVIDIA',
    hostingType: 'CONTAINER_DOWNLOAD_ONLY',
    accountEntitlement: 'DEVELOPER_CREDITS',
    modality: ['SPEECH_ASR'],
    supportedLanguages: ['en', 'es', 'de', 'fr'], // NO INDIAN LANGUAGES
    contextWindowTokens: 0,
    supportsStructuredOutput: false,
    isFreeTier: false,
    privacyPolicyNotes: 'Audio processed for transcription without training retention.',
    realityNotes: 'European languages ONLY. Unverified cloud endpoint; Indian languages completely unsupported.',
  },
  'nvidia/fastpitch-hifigan': {
    modelId: 'nvidia/fastpitch-hifigan',
    provider: 'NVIDIA',
    hostingType: 'CONTAINER_DOWNLOAD_ONLY',
    accountEntitlement: 'DEVELOPER_CREDITS',
    modality: ['SPEECH_TTS'],
    supportedLanguages: ['en'], // English only
    contextWindowTokens: 0,
    supportsStructuredOutput: false,
    isFreeTier: false,
    privacyPolicyNotes: 'Text processed ephemerally to produce PCM audio.',
    realityNotes: 'English only. Unverified cloud endpoint; requires Riva deployment. Indic TTS unavailable.',
  },
};
