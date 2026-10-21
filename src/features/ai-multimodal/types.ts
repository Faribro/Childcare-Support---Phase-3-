import { z } from 'zod';
import { DocType } from '../whatsapp-document-loop/types';

// ============================================================================
// 1. Core Provider Types & Configuration
// ============================================================================

export type AIProviderName = 'OPENROUTER' | 'NVIDIA' | 'DETERMINISTIC_FALLBACK';

export interface AIProviderConfig {
  readonly openRouterApiKey?: string;
  readonly nvidiaApiKey?: string;
  readonly defaultProvider: AIProviderName;
  readonly allowPaidFallback: boolean; // default false per cost constraints
  readonly maxRetries: number; // default 2
  readonly timeoutMs: number; // default 10000ms
  readonly dataCollectionOptOut: boolean; // default true (deny retention)
}

export type SupportedLanguage = 'en' | 'hi' | 'mr' | 'gu' | 'bn';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'en', // English
  'hi', // Hindi
  'mr', // Marathi
  'gu', // Gujarati
  'bn', // Bengali
] as const;

export interface ProviderTelemetry {
  readonly provider: AIProviderName;
  readonly modelId: string;
  readonly task: 'INTENT' | 'VISION_QA' | 'TRANSCRIPTION' | 'SYNTHESIS';
  readonly latencyMs: number;
  readonly tokensPrompt?: number;
  readonly tokensCompletion?: number;
  readonly estimatedCostUsd: number; // Strictly 0.00 for verified free tier
  readonly privacyCompliant: boolean; // Verifies data retention was denied
}

// ============================================================================
// 2. Multilingual Text & Intent Interface
// ============================================================================

export const BeneficiaryIntentEnum = z.enum([
  'LANGUAGE_SELECTION',
  'DOCUMENT_QUERY',
  'UNEXPECTED_EXPLANATION',
  'REPLACEMENT_GUIDANCE_QUERY',
  'REPLACEMENT_SUBMISSION',
  'HUMAN_CSC_ESCALATION',
  'GREETING',
  'UNKNOWN_OUT_OF_SCOPE',
]);

export type BeneficiaryIntent = z.infer<typeof BeneficiaryIntentEnum>;

export const MultilingualIntentResultSchema = z.object({
  detectedLanguage: z.enum(['en', 'hi', 'mr', 'gu', 'bn']),
  confidence: z.number().min(0).max(1),
  primaryIntent: BeneficiaryIntentEnum,
  secondaryIntents: z.array(BeneficiaryIntentEnum).default([]),
  explanationSummary: z.string().optional(), // Redacted summary of why beneficiary is replying
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'DISTRESSED', 'FRUSTRATED']).default('NEUTRAL'),
  extractedEntities: z.object({
    mentionedChildName: z.string().optional(),
    mentionedDocType: z.string().optional(),
    delayReason: z.string().optional(),
  }).default({}),
  clarificationNeeded: z.boolean().default(false),
});

export type MultilingualIntentResult = z.infer<typeof MultilingualIntentResultSchema>;

export interface MultilingualIntentInput {
  readonly messageText: string;
  readonly context: {
    readonly currentLanguage?: SupportedLanguage;
    readonly activeRequestedDoc?: DocType;
    readonly childIdMasked?: string;
    readonly previousState?: string;
  };
}

// ============================================================================
// 3. Document Vision & Quality Assessment Interface
// ============================================================================

export const QualityFlagSchema = z.object({
  isBlurry: z.boolean(),
  hasGlare: z.boolean(),
  isCutOff: z.boolean(), // Corners or crucial text cropped
  isDarkOrUnderexposed: z.boolean(),
  isRotatedOrUpsideDown: z.boolean(),
});

export const DocumentLegibilityEnum = z.enum(['HIGH', 'MEDIUM', 'UNREADABLE']);
export type DocumentLegibility = z.infer<typeof DocumentLegibilityEnum>;

export const PassbookFeatureSchema = z.object({
  hasAccountNumber: z.boolean(),
  hasIfscCode: z.boolean(),
  hasBankSealOrSignature: z.boolean(),
  hasAccountHolderName: z.boolean(),
});

export const AadhaarFeatureSchema = z.object({
  hasPhoto: z.boolean(),
  hasName: z.boolean(),
  hasMaskedNumber: z.boolean(), // Verifies first 8 digits masked if applicable
});

export const DocumentVisionQAResultSchema = z.object({
  detectedDocumentType: z.enum([
    'passbookPhoto',
    'aadhaarCardPhoto',
    'childPhoto',
    'feeReceiptPhoto',
    'marksheetPhoto',
    'caregiverSignature',
    'UNKNOWN_OR_OTHER',
  ]),
  classificationConfidence: z.number().min(0).max(1),
  isTargetMatch: z.boolean(),
  overallQualityScore: z.number().min(0).max(100),
  qualityFlags: QualityFlagSchema,
  legibility: DocumentLegibilityEnum,
  passbookFeatures: PassbookFeatureSchema.optional(),
  aadhaarFeatures: AadhaarFeatureSchema.optional(),
  specificGuidance: z.record(z.string(), z.string()), // Guidance keyed by language (en, hi, mr, etc.)
  modelRecommendation: z.enum(['ACCEPTABLE', 'NEEDS_REPLACEMENT', 'UNRECOGNIZED_DOCUMENT']),
});

export type DocumentVisionQAResult = z.infer<typeof DocumentVisionQAResultSchema>;

export interface DocumentVisionQAInput {
  readonly imageBuffer: Buffer;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly targetDocType: DocType;
  readonly preferredLanguage: SupportedLanguage;
}

// ============================================================================
// 4. Speech Transcription Interface (Asynchronous WhatsApp Voice Notes)
// ============================================================================

export const SpeechTranscriptionResultSchema = z.object({
  transcribedText: z.string(),
  detectedLanguage: z.enum(['en', 'hi', 'mr', 'gu', 'bn']),
  confidence: z.number().min(0).max(1),
  durationSeconds: z.number().min(0),
});

export type SpeechTranscriptionResult = z.infer<typeof SpeechTranscriptionResultSchema>;

export interface SpeechTranscriptionInput {
  readonly audioBuffer: Buffer;
  readonly mimeType: string; // e.g. 'audio/ogg; codecs=opus', 'audio/mp4', 'audio/mpeg'
  readonly languageHint?: SupportedLanguage;
}

// ============================================================================
// 5. Speech Synthesis Interface (Proposed / Optional Accessible Guidance)
// ============================================================================

export interface SpeechSynthesisInput {
  readonly textToSpeak: string;
  readonly language: SupportedLanguage;
  readonly voiceProfile?: 'FEMALE_NEUTRAL' | 'MALE_NEUTRAL';
}

export interface SpeechSynthesisResult {
  readonly audioBuffer: Buffer;
  readonly mimeType: 'audio/ogg' | 'audio/mp4' | 'audio/mpeg';
  readonly durationSeconds: number;
}
