/**
 * Caregiver Verification & Subscription Domain Types
 *
 * Implements the explicit state machine:
 * UNVERIFIED -> OTP_PENDING -> VERIFIED -> SUBSCRIBED -> PAUSED / OPTED_OUT
 *
 * Privacy & Security Guarantees:
 * - Phone numbers are normalized to E.164 and indexed via SHA-256 phoneHash.
 * - OTPs are single-use, 6-digit cryptographic tokens with per-challenge salt and SHA-256 verifier hash.
 * - Plaintext OTP is NEVER stored in database, return payloads, or diagnostic logs.
 * - Verification alone NEVER auto-subscribes. Explicit affirmative consent is mandatory to reach SUBSCRIBED.
 * - Phone control alone NEVER grants leadership access or sensitive clinical disclosure.
 */

export type CaregiverSubscriptionState =
  | 'UNVERIFIED'
  | 'OTP_PENDING'
  | 'VERIFIED'
  | 'SUBSCRIBED'
  | 'PAUSED'
  | 'OPTED_OUT';

export type MessagingConsentCategory =
  | 'DOCUMENTS'
  | 'CLINICAL_FOLLOWUP'
  | 'PROGRAMME_UPDATES';

export type CaregiverLanguage = 'mr' | 'hi' | 'en' | 'gu' | 'bn';

export interface CaregiverSubscriptionRecord {
  readonly subscriptionId: string;
  readonly phoneHash: string; // SHA-256 of normalized E.164 phone
  readonly phoneMasked: string; // Display-only: e.g. "+91 98*** **210"
  state: CaregiverSubscriptionState;
  
  // Consent & Preferences
  consentProvided: boolean;
  consentRecordedAt?: string; // ISO-8601
  consentCategories: MessagingConsentCategory[];
  preferredLanguage: CaregiverLanguage;

  // Linkage to Beneficiaries / Children
  linkedChildIdsMasked: string[]; // e.g. ["CH-***-001", "CH-***-002"]
  linkedSubmissionIds: string[];

  // Opt-out / Pause Controls
  optedOutAt?: string;
  optOutReason?: 'STOP' | 'WRONG_NUMBER' | 'USER_REQUEST' | 'POLICY_REFUSAL';
  pausedUntil?: string;

  // Audit Timestamps
  readonly createdAt: string;
  updatedAt: string;
}

export interface CaregiverOtpChallenge {
  readonly challengeId: string;
  readonly phoneHash: string;
  readonly verifierHash: string; // SHA-256(otp + salt)
  readonly salt: string;
  attempts: number;
  readonly maxAttempts: number; // Max 5 attempts
  readonly expiresAt: number; // Unix timestamp ms (10 min expiry)
  readonly lastRequestedAt: number; // Unix timestamp ms (for 60s cooldown)
  verified: boolean;
  superseded: boolean;
}

export interface OtpVerificationResult {
  readonly success: boolean;
  readonly reason?:
    | 'INVALID_CODE'
    | 'EXPIRED'
    | 'MAX_ATTEMPTS_EXCEEDED'
    | 'SUPERSEDED'
    | 'ALREADY_VERIFIED'
    | 'COOLDOWN_ACTIVE'
    | 'NO_ACTIVE_CHALLENGE';
  readonly remainingAttempts?: number;
  readonly cooldownRemainingSeconds?: number;
}

export interface InboundCaregiverMessage {
  readonly fromPhone: string;
  readonly messageId: string;
  readonly textBody?: string;
  readonly timestamp?: string;
  readonly mediaType?: 'image' | 'document' | 'audio';
  readonly mediaId?: string;
}

export interface OutboundCaregiverResponse {
  readonly toPhoneMasked: string;
  readonly textBody: string;
  readonly templateName?: string;
  readonly templateLanguage?: CaregiverLanguage;
  readonly templateParams?: Record<string, string>;
  readonly isProactive: boolean; // true if initiated outside 24h window
  readonly nextExpectedState: CaregiverSubscriptionState;
}

export const OTP_CONFIG = {
  LENGTH: 6,
  EXPIRY_MINUTES: 10,
  COOLDOWN_SECONDS: 60,
  MAX_ATTEMPTS: 5,
} as const;

export const SUPPORTED_CAREGIVER_LANGUAGES: readonly CaregiverLanguage[] = ['mr', 'hi', 'en', 'gu', 'bn'];
