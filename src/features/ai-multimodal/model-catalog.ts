/**
 * Model Catalog & Entitlement Registry
 *
 * Grounded in verified models available under free / entitlement tiers:
 * - OpenRouter verified free models (zero cost per token)
 * - NVIDIA NIM API models
 *
 * Rejects speculative model IDs.
 */

export interface ModelMetadata {
  readonly modelId: string;
  readonly provider: 'OPENROUTER' | 'NVIDIA';
  readonly modality: ('TEXT' | 'VISION' | 'SPEECH_ASR' | 'SPEECH_TTS')[];
  readonly supportedLanguages: readonly string[];
  readonly contextWindowTokens: number;
  readonly supportsStructuredOutput: boolean;
  readonly isFreeTier: boolean;
  readonly privacyPolicy: string;
}

export const VERIFIED_MODEL_CATALOG: Record<string, ModelMetadata> = {
  // Deterministic In-Process Engine (Default, Zero Cost, Zero Egress)
  'deterministic-rule-engine': {
    modelId: 'deterministic-rule-engine',
    provider: 'DETERMINISTIC_FALLBACK' as any,
    modality: ['TEXT', 'VISION', 'SPEECH_ASR', 'SPEECH_TTS'],
    supportedLanguages: ['en', 'hi', 'mr', 'te', 'ta', 'bn', 'gu'],
    contextWindowTokens: 0,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicy: 'Local in-process evaluation; zero network egress, zero retention',
  },

  // OpenRouter Verified Free Models
  'openrouter/free': {
    modelId: 'openrouter/free',
    provider: 'OPENROUTER',
    modality: ['TEXT'],
    supportedLanguages: ['en', 'hi', 'mr', 'te', 'ta', 'bn', 'gu'],
    contextWindowTokens: 200000,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicy: 'Zero data retention enforced with data_collection=deny',
  },
  'meta-llama/llama-3.3-70b-instruct:free': {
    modelId: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'OPENROUTER',
    modality: ['TEXT'],
    supportedLanguages: ['en', 'hi', 'mr', 'te', 'ta', 'bn', 'gu'],
    contextWindowTokens: 131072,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicy: 'Zero data retention enforced with data_collection=deny',
  },
  'meta-llama/llama-3.2-11b-vision-instruct:free': {
    modelId: 'meta-llama/llama-3.2-11b-vision-instruct:free',
    provider: 'OPENROUTER',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'te', 'ta', 'bn', 'gu'],
    contextWindowTokens: 131072,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicy: 'Zero data retention enforced with data_collection=deny',
  },
  'google/gemini-2.0-flash-exp:free': {
    modelId: 'google/gemini-2.0-flash-exp:free',
    provider: 'OPENROUTER',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'te', 'ta', 'bn', 'gu'],
    contextWindowTokens: 1048576,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicy: 'Zero data retention enforced with data_collection=deny',
  },

  // NVIDIA NIM Direct Endpoints
  'nvidia/meta/llama-3.2-11b-vision-instruct': {
    modelId: 'meta/llama-3.2-11b-vision-instruct',
    provider: 'NVIDIA',
    modality: ['TEXT', 'VISION'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 128000,
    supportsStructuredOutput: true,
    isFreeTier: true, // Included in developer account entitlement credits
    privacyPolicy: 'NVIDIA API: Zero retention, no training on API payloads',
  },
  'nvidia/meta/llama-3.1-70b-instruct': {
    modelId: 'meta/llama-3.1-70b-instruct',
    provider: 'NVIDIA',
    modality: ['TEXT'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 128000,
    supportsStructuredOutput: true,
    isFreeTier: true,
    privacyPolicy: 'NVIDIA API: Zero retention, no training on API payloads',
  },
  'nvidia/parakeet-ctc-1.1b-asr': {
    modelId: 'nvidia/parakeet-ctc-1.1b-asr',
    provider: 'NVIDIA',
    modality: ['SPEECH_ASR'],
    supportedLanguages: ['en', 'hi', 'mr', 'gu', 'bn'],
    contextWindowTokens: 0,
    supportsStructuredOutput: false,
    isFreeTier: true,
    privacyPolicy: 'NVIDIA API: Zero retention, no training on API payloads',
  },
  'nvidia/fastpitch-hifigan': {
    modelId: 'nvidia/fastpitch-hifigan',
    provider: 'NVIDIA',
    modality: ['SPEECH_TTS'],
    supportedLanguages: ['en', 'hi'],
    contextWindowTokens: 0,
    supportsStructuredOutput: false,
    isFreeTier: true,
    privacyPolicy: 'NVIDIA API: Zero retention, no training on API payloads',
  },
};
