/**
 * Shared Reporting & Email Delivery Contract
 *
 * Formal contract between:
 * 1. WhatsApp Leadership Reporting Thread (Query generator, intent router, conversational UI)
 * 2. Apps Script / Data / Email Integration Thread (Authorized data adapter, MailApp delivery, deduplication)
 *
 * Safety & Honesty Invariants:
 * - Read-only reporting access (mutations prohibited).
 * - Honest source provenance: Never replace failed live queries with synthetic data.
 * - Honest delivery reporting: Report upstream transport acceptance only, never claim inbox receipt.
 * - Registered organizational recipients only (fail-closed domain verification).
 * - Duplicate-send protection via client-provided idempotency keys.
 * - Dry-run execution safety: Dry-run by default without live email transmission.
 */

export type CallerRole = 'LEADERSHIP' | 'STATE_LEAD' | 'SUPERVISOR';
export type DateBasis = 'VISIT_DATE' | 'SUBMISSION_DATE';
export type OrphanCategory = 'SINGLE_ORPHAN' | 'DOUBLE_ORPHAN' | 'NON_ORPHAN';
export type SchoolCategory = 'GOVERNMENT_SCHOOL' | 'PRIVATE_SCHOOL' | 'NON_FORMAL' | 'OUT_OF_SCHOOL';
export type VerificationStatus = 'APPROVED' | 'PENDING' | 'FLAGGED' | 'REJECTED';

export type ReportType =
  | 'JUNE_ORPHAN_GOV_SCHOOL_SURVEILLANCE'
  | 'NATIONAL_KPI_SUMMARY'
  | 'STATE_COMPARISON'
  | 'HIGH_RISK_DROPOUT_DIGEST'
  | 'VERIFICATION_QUEUE_AUDIT'
  | 'COHORT_SUMMARY';

export interface CallerSecurityContext {
  readonly userId: string;
  readonly role: CallerRole;
  /**
   * Permitted states: ['*'] for national scope (LEADERSHIP),
   * or explicit state list (e.g. ['Maharashtra'] for STATE_LEAD).
   */
  readonly permittedStates: readonly string[];
}

export interface SourceFreshness {
  readonly lastSyncedAt: string; // ISO 8601 UTC timestamp
  readonly sourceVersion: string; // e.g. "apps-script-linelist-v3.0.0" or "synthetic-fixtures-v1.3.0"
  readonly recordCount: number;
  readonly isSynthetic: boolean;
  readonly upstreamOrigin: 'GOOGLE_SHEETS_APPS_SCRIPT' | 'LOCAL_SYNTHETIC_FIXTURES';
}

// -------------------------------------------------------------
// 1. Reporting Data Query Contract
// -------------------------------------------------------------

export interface ReportingQueryFilters {
  readonly state?: string | null;
  readonly district?: string | null;
  readonly dateBasis: DateBasis;
  readonly year?: number; // e.g. 2026
  readonly month?: string; // e.g. "June"
  readonly startDate?: string; // YYYY-MM-DD
  readonly endDate?: string; // YYYY-MM-DD
  readonly orphanStatus?: OrphanCategory | 'ALL' | null;
  readonly schoolType?: SchoolCategory | 'ALL' | null;
  readonly verificationStatus?: VerificationStatus | null;
}

export interface ReportingQueryRequest {
  readonly securityContext: CallerSecurityContext;
  readonly filters: ReportingQueryFilters;
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly liveOnly?: boolean; // If true, strictly disallow falling back to synthetic data
}

export interface SanitizedReportRecord {
  readonly uniqueId: string;
  readonly state: string;
  readonly district: string;
  readonly visitDate: string;
  readonly submissionDate: string;
  readonly age: number;
  readonly gender: string;
  readonly orphanStatus: string;
  readonly schoolType: string;
  readonly verificationStatus: string;
  readonly maskedAadhaar: string;
  readonly maskedBankAccount: string;
  readonly maskedCaregiverPhone: string;
  readonly isSynthetic: boolean;
}

export interface ReportingQueryResult {
  readonly status: 'success' | 'error';
  readonly records: readonly SanitizedReportRecord[];
  readonly totalMatchingCount: number;
  readonly cursor?: string | null;
  readonly hasMore: boolean;
  readonly executionTimeMs: number;
  readonly freshness: SourceFreshness;
  readonly error?: string;
  readonly code?: string;
}

// -------------------------------------------------------------
// 2. Report Attachment & Artifact Handoff Specification
// -------------------------------------------------------------

export type ReportAttachmentMimeType = 'text/csv' | 'application/pdf';

export interface ReportAttachment {
  readonly filename: string;
  readonly mimeType: ReportAttachmentMimeType;
  readonly contentBase64: string;
  readonly byteSize: number;
  readonly sha256?: string;
}

export interface ReportArtifactCompleteness {
  readonly totalMatched: number;
  readonly totalExported: number;
  readonly recordsExcludedMissingOrphanStatus: number;
  readonly recordsExcludedMissingSchool: number;
  readonly isComplete: boolean;
}

export interface ReportArtifactHandoff {
  readonly artifactId: string;
  readonly title: string;
  readonly reportType: ReportType;
  readonly filename: string;
  readonly mimeType: ReportAttachmentMimeType;
  readonly byteSize: number;
  readonly sha256: string;
  readonly contentBase64: string;
  readonly contentPreviewText: string;
  readonly sourceFreshness: SourceFreshness;
  readonly completeness: ReportArtifactCompleteness;
  readonly generatedAt: string;
}

// -------------------------------------------------------------
// 3. Reporting Email Delivery Contract
// -------------------------------------------------------------

export interface ReportingEmailDeliveryRequest {
  /**
   * Unique client-generated idempotency key (e.g. hash of recipient, reportType, dateBasis, and query timestamp)
   * Enforces duplicate-send protection across network retries.
   */
  readonly idempotencyKey: string;
  readonly senderSecurityContext: CallerSecurityContext;
  readonly recipientEmail: string;
  readonly recipientName: string;
  readonly reportType: ReportType;
  readonly subject: string;
  readonly summaryHtml: string;
  readonly summaryText: string;
  readonly attachment?: ReportAttachment;
  /**
   * If true (default in staging/dev), performs dry-run delivery validation
   * without calling live external mail transport.
   */
  readonly dryRun?: boolean;
}

/**
 * Honest delivery status:
 * We never claim 'DELIVERED_TO_INBOX' because Apps Script/SMTP can only
 * report upstream transmission acceptance, not mailbox receipt.
 */
export type DeliveryStatusCode =
  | 'ACCEPTED_FOR_DELIVERY'
  | 'DRY_RUN_ACCEPTED'
  | 'DUPLICATE_SUPPRESSED'
  | 'REJECTED_UNAUTHORIZED_RECIPIENT'
  | 'REJECTED_INVALID_ATTACHMENT'
  | 'REJECTED_UNAUTHORIZED_SCOPE'
  | 'QUOTA_EXCEEDED'
  | 'DATA_RETRIEVAL_FAILED'
  | 'FAILED';

export interface ReportingEmailDeliveryResult {
  readonly status: DeliveryStatusCode;
  readonly messageId?: string;
  readonly recipientMasked: string;
  readonly idempotencyKey: string;
  readonly isDuplicate: boolean;
  readonly remainingDailyQuota: number | null;
  readonly acceptedAt: string; // ISO 8601 UTC timestamp of upstream acceptance
  readonly dryRun: boolean;
  readonly sourceFreshness?: SourceFreshness;
  readonly errorDetails?: string;
}

// -------------------------------------------------------------
// 4. Registered Organizational Recipient Directory
// -------------------------------------------------------------

export interface RegisteredOrganizationalRecipient {
  readonly email: string;
  readonly fullName: string;
  readonly role: CallerRole;
  readonly permittedStates: readonly string[];
  readonly department: string;
  readonly active: boolean;
}
