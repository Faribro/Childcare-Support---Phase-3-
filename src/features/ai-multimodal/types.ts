import { z } from 'zod';
import { DocType } from '../whatsapp-document-loop/types';

export type AIProviderName = 'OPENROUTER' | 'NVIDIA' | 'DETERMINISTIC_FALLBACK';

export interface AIProviderConfig {
  readonly openRouterApiKey?: string;
  readonly nvidiaApiKey?: string;
  readonly defaultProvider: AIProviderName;
  readonly allowPaidFallback: boolean; // default false (free-first)
  readonly maxRetries: number; // default 2
  readonly timeoutMs: number; // default 10,000ms
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
  readonly latencyMs: number;
  readonly costCents: number;
  readonly isFreeTier: boolean;
  readonly tokensPrompt?: number;
  readonly tokensCompletion?: number;
}

// ============================================================================
// 1. Beneficiary Intent & Multilingual Extraction Interface
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
  explanationSummary: z.string().optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'DISTRESSED', 'FRUSTRATED']).default('NEUTRAL'),
  extractedEntities: z.object({
    mentionedChildName: z.string().optional(),
    mentionedDocType: z.string().optional(),
    delayReason: z.string().optional(),
    promisedDate: z.string().optional(),
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
// 2. Document Vision & Quality Assessment Interface
// ============================================================================

export const QualityFlagSchema = z.object({
  isBlurry: z.boolean(),
  hasGlare: z.boolean(),
  isCutOff: z.boolean(), // Corners or crucial text cropped
  isDarkOrUnderexposed: z.boolean(),
  isRotatedOrUpsideDown: z.boolean(),
});

export const DocumentLegibilityEnum = z.enum(['HIGH', 'MEDIUM', 'UNREADABLE', 'NOT_ASSESSED']);
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
  overallQualityScore: z.number().min(0).max(100).nullable(), // null when NOT_ASSESSED
  qualityFlags: QualityFlagSchema,
  legibility: DocumentLegibilityEnum,
  passbookFeatures: PassbookFeatureSchema.optional(),
  aadhaarFeatures: AadhaarFeatureSchema.optional(),
  specificGuidance: z.record(z.string(), z.string()), // Guidance keyed by language (en, hi, mr, etc.)
  modelRecommendation: z.enum(['ACCEPTABLE', 'NEEDS_REPLACEMENT', 'UNRECOGNIZED_DOCUMENT', 'NOT_ASSESSED']),
  assessmentStatus: z.enum(['EVALUATED', 'NOT_ASSESSED', 'PROVIDER_UNAVAILABLE']).default('EVALUATED'),
});

export type DocumentVisionQAResult = z.infer<typeof DocumentVisionQAResultSchema>;

export interface DocumentVisionQAInput {
  readonly imageBuffer: Buffer;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly targetDocType: DocType;
  readonly preferredLanguage: SupportedLanguage;
}

// ============================================================================
// 3. Speech Transcription Interface (Asynchronous WhatsApp Voice Notes)
// ============================================================================

export const SpeechTranscriptionResultSchema = z.object({
  status: z.enum(['SUCCESS', 'TRANSCRIPTION_UNAVAILABLE', 'UNSUPPORTED_LANGUAGE']).default('SUCCESS'),
  transcribedText: z.string(),
  detectedLanguage: z.enum(['en', 'hi', 'mr', 'gu', 'bn']),
  confidence: z.number().min(0).max(1),
  durationSeconds: z.number().min(0),
  isSupportedLanguage: z.boolean().default(true),
  error: z.string().optional(),
});

export type SpeechTranscriptionResult = z.infer<typeof SpeechTranscriptionResultSchema>;

export interface SpeechTranscriptionInput {
  readonly audioBuffer: Buffer;
  readonly mimeType: string; // e.g. 'audio/ogg; codecs=opus', 'audio/mp4', 'audio/mpeg'
  readonly languageHint?: SupportedLanguage;
}

// ============================================================================
// 4. Speech Synthesis Interface (Proposed / Optional Accessible Guidance)
// ============================================================================

export interface SpeechSynthesisInput {
  readonly textToSpeak: string;
  readonly language: SupportedLanguage;
  readonly voiceProfile?: 'FEMALE_NEUTRAL' | 'MALE_NEUTRAL';
}

export interface SpeechSynthesisResult {
  readonly status: 'SUCCESS' | 'SYNTHESIS_UNAVAILABLE' | 'UNSUPPORTED_LANGUAGE';
  readonly isPlayable: boolean;
  readonly audioBuffer?: Buffer;
  readonly mimeType?: 'audio/ogg' | 'audio/mp4' | 'audio/mpeg';
  readonly durationSeconds?: number;
  readonly error?: string;
}
