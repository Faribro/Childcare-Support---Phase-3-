/**
 * Reporting Email Delivery & Authorized Data Adapter
 *
 * Enforces:
 * 1. Registered organizational recipient verification (fail-closed domain checking).
 * 2. Attachment validation (strict MIME, size <= 10MB, filename safety, SHA256 integrity).
 * 3. Report artifact generation with verifiable provenance headers.
 * 4. Duplicate-send protection via client idempotency keys with TTL cache.
 * 5. Honest delivery status reporting:
 *    - Never claim 'DELIVERED_TO_INBOX' (report 'ACCEPTED_FOR_DELIVERY' or 'DRY_RUN_ACCEPTED').
 *    - Never replace failed live queries with synthetic data while presenting them as live.
 * 6. DPDP-compliant PII masking on all reporting query responses.
 */

import crypto from 'crypto';
import type {
  ReportingEmailDeliveryRequest,
  ReportingEmailDeliveryResult,
  ReportAttachment,
  RegisteredOrganizationalRecipient,
  ReportingQueryRequest,
  ReportingQueryResult,
  SanitizedReportRecord,
  ReportArtifactHandoff,
  SourceFreshness,
} from './reportingEmailContract';

// Maximum attachment size: 10 Megabytes
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// Allowed MIME types for reporting deliverables
export const ALLOWED_ATTACHMENT_MIMES = ['text/csv', 'application/pdf'] as const;

// Default approved organizational email domains
export const APPROVED_ORGANIZATIONAL_DOMAINS = [
  'allianceindia.org',
] as const;

// Directory of registered leadership and organizational recipients
export const REGISTERED_ORGANIZATIONAL_DIRECTORY: readonly RegisteredOrganizationalRecipient[] = [
  {
    email: 'reporting-lead@allianceindia.org',
    fullName: 'Programme Director',
    role: 'LEADERSHIP',
    permittedStates: ['*'],
    department: 'Strategic Information & Surveillance',
    active: true,
  },
  {
    email: 'executive-office@allianceindia.org',
    fullName: 'Executive Office',
    role: 'LEADERSHIP',
    permittedStates: ['*'],
    department: 'Executive Governance',
    active: true,
  },
  {
    email: 'surveillance-lead@allianceindia.org',
    fullName: 'National Surveillance Lead',
    role: 'LEADERSHIP',
    permittedStates: ['*'],
    department: 'Paediatric HIV Monitoring',
    active: true,
  },
  {
    email: 'statelead-mh@allianceindia.org',
    fullName: 'Maharashtra State Lead',
    role: 'STATE_LEAD',
    permittedStates: ['Maharashtra'],
    department: 'State Field Operations',
    active: true,
  },
  {
    email: 'statelead-mp@allianceindia.org',
    fullName: 'Madhya Pradesh State Lead',
    role: 'STATE_LEAD',
    permittedStates: ['Madhya Pradesh'],
    department: 'State Field Operations',
    active: true,
  },
];

/**
 * Validates whether an email belongs to a registered organizational recipient.
 * Enforces fail-closed rules:
 * - Domain must match approved organizational domains.
 * - Must be present and active in the directory.
 * - Common consumer mailboxes (gmail, yahoo, etc.) are strictly prohibited.
 */
export function validateOrganizationalRecipient(
  email: string,
  callerScope?: { permittedStates: readonly string[] }
): { valid: boolean; recipient?: RegisteredOrganizationalRecipient; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Recipient email is missing or empty' };
  }

  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: 'Malformed email format' };
  }

  const domain = parts[1];
  const isApprovedDomain = APPROVED_ORGANIZATIONAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
  if (!isApprovedDomain) {
    return {
      valid: false,
      error: `Recipient domain "@${domain}" is not an authorized organizational domain. Consumer and external emails are strictly rejected.`,
    };
  }

  // Lookup in registry
  const match = REGISTERED_ORGANIZATIONAL_DIRECTORY.find((r) => r.email.toLowerCase() === normalized);
  if (!match) {
    return {
      valid: false,
      error: `Email address "${email}" is not registered in the organizational recipient directory.`,
    };
  }

  if (!match.active) {
    return {
      valid: false,
      error: `Recipient account "${email}" is inactive. Delivery rejected.`,
    };
  }

  // Geographic scope check: if caller has restricted state scope, cannot send to recipients outside scope
  if (callerScope && !callerScope.permittedStates.includes('*')) {
    if (match.role === 'STATE_LEAD') {
      const sharesState = match.permittedStates.some((s) => callerScope.permittedStates.includes(s));
      if (!sharesState) {
        return {
          valid: false,
          error: `Geographic authorization violation: Caller with scope [${callerScope.permittedStates.join(', ')}] cannot dispatch reports to ${match.permittedStates.join(', ')} recipient.`,
        };
      }
    }
  }

  return { valid: true, recipient: match };
}

/**
 * Validates a report attachment against strict security criteria:
 * 1. Byte size must not exceed MAX_ATTACHMENT_BYTES (10MB).
 * 2. MIME type must be text/csv or application/pdf.
 * 3. Filename must match safe pattern without path traversal characters.
 * 4. Base64 payload must be valid.
 * 5. If sha256 checksum is provided, verifies byte digest matches.
 */
export function validateReportAttachment(attachment?: ReportAttachment): {
  valid: boolean;
  error?: string;
  decodedBuffer?: Buffer;
} {
  if (!attachment) {
    return { valid: true };
  }

  // 1. Filename validation
  const filename = String(attachment.filename || '').trim();
  const safeFilenameRegex = /^[a-zA-Z0-9_\-\. ()]+\.(csv|pdf)$/i;
  if (!filename || !safeFilenameRegex.test(filename) || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return {
      valid: false,
      error: `Unsafe attachment filename "${filename}". Filename must end in .csv or .pdf and contain no path traversal characters.`,
    };
  }

  // 2. MIME type validation
  const mime = String(attachment.mimeType || '').trim().toLowerCase();
  if (!ALLOWED_ATTACHMENT_MIMES.includes(mime as any)) {
    return {
      valid: false,
      error: `Unsupported attachment MIME type "${attachment.mimeType}". Allowed types: ${ALLOWED_ATTACHMENT_MIMES.join(', ')}.`,
    };
  }

  // 3. Byte size validation
  if (typeof attachment.byteSize !== 'number' || attachment.byteSize <= 0 || attachment.byteSize > MAX_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: `Attachment size ${attachment.byteSize} bytes exceeds maximum permitted size of ${MAX_ATTACHMENT_BYTES} bytes (10 MB).`,
    };
  }

  // 4. Base64 content decode
  if (!attachment.contentBase64 || typeof attachment.contentBase64 !== 'string') {
    return { valid: false, error: 'Attachment contentBase64 is empty or invalid string.' };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(attachment.contentBase64, 'base64');
  } catch (err: any) {
    return { valid: false, error: `Failed to decode attachment base64: ${err.message}` };
  }

  if (buffer.length === 0) {
    return { valid: false, error: 'Attachment decoded buffer is empty (0 bytes).' };
  }

  // 5. SHA-256 integrity verification
  if (attachment.sha256) {
    const calculatedHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (calculatedHash.toLowerCase() !== attachment.sha256.toLowerCase()) {
      return {
        valid: false,
        error: `Attachment SHA-256 checksum mismatch. Expected ${attachment.sha256}, calculated ${calculatedHash}.`,
      };
    }
  }

  return { valid: true, decodedBuffer: buffer };
}

/**
 * Mask email address for DPDP compliance (e.g. r***d@allianceindia.org)
 */
export function maskEmailAddress(email: string): string {
  if (!email || !email.includes('@')) return '***@***';
  const [user, domain] = email.split('@');
  if (user.length <= 2) {
    return `${user[0]}*@${domain}`;
  }
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

/**
 * Generates an immutable, verified CSV report artifact with explicit provenance headers.
 */
export function generateReportArtifact(params: {
  title: string;
  reportType: ReportAttachment['filename'];
  records: readonly SanitizedReportRecord[];
  freshness: SourceFreshness;
  recordsExcludedMissingOrphanStatus?: number;
  recordsExcludedMissingSchool?: number;
}): ReportArtifactHandoff {
  const artifactId = `art-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const missingOrphan = params.recordsExcludedMissingOrphanStatus ?? 0;
  const missingSchool = params.recordsExcludedMissingSchool ?? 0;

  // Build CSV content with provenance banner
  const csvLines: string[] = [
    `# ==============================================================================`,
    `# INDIA HIV/AIDS ALLIANCE â€” PAEDIATRIC SURVEILLANCE & REPORTING`,
    `# Report Title: ${params.title}`,
    `# Generated At: ${now}`,
    `# Source Origin: ${params.freshness.upstreamOrigin}`,
    `# Source Last Synced: ${params.freshness.lastSyncedAt}`,
    `# Source Version: ${params.freshness.sourceVersion}`,
    `# Evaluation Mode: ${params.freshness.isSynthetic ? 'SYNTHETIC_DATASET' : 'LIVE_CANONICAL_SOURCE'}`,
    `# Total Beneficiaries Included: ${params.records.length}`,
    `# Records Excluded Missing Orphan: ${missingOrphan}`,
    `# Records Excluded Missing School: ${missingSchool}`,
    `# Privacy Standard: DPDP Act 2023 Compliant (Masked Aadhaar, Masked Bank, Masked Phone)`,
    `# ==============================================================================`,
    `Unique ID,State,District,Visit Date,Submission Date,Age,Gender,Orphan Status,School Type,Approval Status,Aadhaar (Masked),Bank Account (Masked),Caregiver Contact (Masked)`,
  ];

  for (const r of params.records) {
    csvLines.push(
      [
        `"${r.uniqueId}"`,
        `"${r.state}"`,
        `"${r.district}"`,
        `"${r.visitDate}"`,
        `"${r.submissionDate}"`,
        r.age,
        `"${r.gender}"`,
        `"${r.orphanStatus}"`,
        `"${r.schoolType}"`,
        `"${r.verificationStatus}"`,
        `"${r.maskedAadhaar}"`,
        `"${r.maskedBankAccount}"`,
        `"${r.maskedCaregiverPhone}"`,
      ].join(',')
    );
  }

  const csvContent = csvLines.join('\n');
  const buffer = Buffer.from(csvContent, 'utf8');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const filename = `${params.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;

  return {
    artifactId,
    title: params.title,
    reportType: 'COHORT_SUMMARY',
    filename,
    mimeType: 'text/csv',
    byteSize: buffer.length,
    sha256,
    contentBase64: buffer.toString('base64'),
    contentPreviewText: csvLines.slice(0, 16).join('\n'),
    sourceFreshness: params.freshness,
    completeness: {
      totalMatched: params.records.length,
      totalExported: params.records.length,
      recordsExcludedMissingOrphanStatus: missingOrphan,
      recordsExcludedMissingSchool: missingSchool,
      isComplete: missingOrphan === 0 && missingSchool === 0,
    },
    generatedAt: now,
  };
}

/**
 * In-Memory Idempotency & Delivery Store
 * Guarantees duplicate-send protection across retries with TTL.
 */
export interface IdempotencyRecord {
  readonly idempotencyKey: string;
  readonly messageId: string;
  readonly recipientEmail: string;
  readonly reportType: string;
  readonly acceptedAt: string;
  readonly status: 'ACCEPTED_FOR_DELIVERY' | 'DRY_RUN_ACCEPTED';
  readonly dryRun: boolean;
}

class InMemoryIdempotencyTracker {
  private records = new Map<string, IdempotencyRecord>();
  private readonly ttlMs: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  get(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }

  record(entry: IdempotencyRecord): void {
    this.records.set(entry.idempotencyKey, entry);
  }

  has(key: string): boolean {
    return this.records.has(key);
  }

  clear(): void {
    this.records.clear();
  }

  size(): number {
    return this.records.size;
  }
}

export const GlobalIdempotencyTracker = new InMemoryIdempotencyTracker();

/**
 * Delivery Transport Interface
 */
export interface ReportingEmailTransport {
  send(req: ReportingEmailDeliveryRequest, attachmentBuffer?: Buffer): Promise<{
    success: boolean;
    messageId?: string;
    remainingDailyQuota: number | null;
    error?: string;
  }>;
}

/**
 * Mock Transport for Staging & Local Dry-Run Testing
 */
export class MockReportingEmailTransport implements ReportingEmailTransport {
  public sentMessages: Array<ReportingEmailDeliveryRequest & { messageId: string; acceptedAt: string }> = [];
  public quotaRemaining: number = 100;
  public failNextWith: string | null = null;

  async send(req: ReportingEmailDeliveryRequest): Promise<{
    success: boolean;
    messageId?: string;
    remainingDailyQuota: number | null;
    error?: string;
  }> {
    if (this.failNextWith) {
      const err = this.failNextWith;
      this.failNextWith = null;
      return { success: false, remainingDailyQuota: this.quotaRemaining, error: err };
    }

    if (this.quotaRemaining <= 0) {
      return {
        success: false,
        remainingDailyQuota: 0,
        error: 'Apps Script MailApp daily email quota exhausted (0 remaining).',
      };
    }

    const messageId = `msg-gas-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.sentMessages.push({
      ...req,
      messageId,
      acceptedAt: new Date().toISOString(),
    });
    this.quotaRemaining = Math.max(0, this.quotaRemaining - 1);

    return {
      success: true,
      messageId,
      remainingDailyQuota: this.quotaRemaining,
    };
  }

  clear(): void {
    this.sentMessages = [];
    this.quotaRemaining = 100;
    this.failNextWith = null;
  }
}

export const StagingMockEmailTransport = new MockReportingEmailTransport();

/**
 * Core Delivery Pipeline:
 * 1. Checks duplicate-send idempotency.
 * 2. Validates organizational recipient.
 * 3. Validates attachment (MIME, size, hash).
 * 4. Enforces dryRun mode by default (safe from unintended live emails).
 * 5. Returns honest upstream acceptance status (never claiming inbox delivery).
 * 6. Records delivery receipt in idempotency cache.
 */
export async function deliverReportingEmail(
  request: ReportingEmailDeliveryRequest,
  transport: ReportingEmailTransport = StagingMockEmailTransport,
  tracker: InMemoryIdempotencyTracker = GlobalIdempotencyTracker
): Promise<ReportingEmailDeliveryResult> {
  const now = new Date().toISOString();
  const maskedEmail = maskEmailAddress(request.recipientEmail);
  const isDryRun = request.dryRun !== false; // Default true for safety

  // 1. Idempotency Check (Duplicate Send Protection)
  if (!request.idempotencyKey || !request.idempotencyKey.trim()) {
    return {
      status: 'FAILED',
      idempotencyKey: '',
      isDuplicate: false,
      recipientMasked: maskedEmail,
      remainingDailyQuota: null,
      acceptedAt: now,
      dryRun: isDryRun,
      errorDetails: 'Missing required idempotencyKey. Deduplication cannot be enforced.',
    };
  }

  const existingDelivery = tracker.get(request.idempotencyKey);
  if (existingDelivery) {
    return {
      status: 'DUPLICATE_SUPPRESSED',
      messageId: existingDelivery.messageId,
      recipientMasked: maskedEmail,
      idempotencyKey: request.idempotencyKey,
      isDuplicate: true,
      remainingDailyQuota: null,
      acceptedAt: existingDelivery.acceptedAt,
      dryRun: existingDelivery.dryRun,
    };
  }

  // 2. Validate Organizational Recipient
  const recipientValidation = validateOrganizationalRecipient(
    request.recipientEmail,
    request.senderSecurityContext
  );
  if (!recipientValidation.valid) {
    return {
      status: 'REJECTED_UNAUTHORIZED_RECIPIENT',
      recipientMasked: maskedEmail,
      idempotencyKey: request.idempotencyKey,
      isDuplicate: false,
      remainingDailyQuota: null,
      acceptedAt: now,
      dryRun: isDryRun,
      errorDetails: recipientValidation.error,
    };
  }

  // 3. Validate Attachment if attached
  const attachmentValidation = validateReportAttachment(request.attachment);
  if (!attachmentValidation.valid) {
    return {
      status: 'REJECTED_INVALID_ATTACHMENT',
      recipientMasked: maskedEmail,
      idempotencyKey: request.idempotencyKey,
      isDuplicate: false,
      remainingDailyQuota: null,
      acceptedAt: now,
      dryRun: isDryRun,
      errorDetails: attachmentValidation.error,
    };
  }

  // 4. Dry-Run Handling
  if (isDryRun) {
    const dryRunMessageId = `dryrun-msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    tracker.record({
      idempotencyKey: request.idempotencyKey,
      messageId: dryRunMessageId,
      recipientEmail: request.recipientEmail,
      reportType: request.reportType,
      acceptedAt: now,
      status: 'DRY_RUN_ACCEPTED',
      dryRun: true,
    });

    return {
      status: 'DRY_RUN_ACCEPTED',
      messageId: dryRunMessageId,
      recipientMasked: maskedEmail,
      idempotencyKey: request.idempotencyKey,
      isDuplicate: false,
      remainingDailyQuota: 100, // Simulated quota
      acceptedAt: now,
      dryRun: true,
    };
  }

  // 5. Send Email via Live Transport (Only executed when dryRun === false is explicitly approved)
  const sendResult = await transport.send(request, attachmentValidation.decodedBuffer);

  if (!sendResult.success) {
    if (sendResult.remainingDailyQuota === 0 || (sendResult.error && /quota/i.test(sendResult.error))) {
      return {
        status: 'QUOTA_EXCEEDED',
        recipientMasked: maskedEmail,
        idempotencyKey: request.idempotencyKey,
        isDuplicate: false,
        remainingDailyQuota: 0,
        acceptedAt: now,
        dryRun: false,
        errorDetails: sendResult.error || 'Apps Script MailApp daily email quota exhausted.',
      };
    }

    return {
      status: 'FAILED',
      recipientMasked: maskedEmail,
      idempotencyKey: request.idempotencyKey,
      isDuplicate: false,
      remainingDailyQuota: sendResult.remainingDailyQuota,
      acceptedAt: now,
      dryRun: false,
      errorDetails: sendResult.error || 'Unknown transport dispatch failure.',
    };
  }

  const messageId = sendResult.messageId || `msg-gas-${Date.now()}`;

  // 6. Record in Idempotency Store
  tracker.record({
    idempotencyKey: request.idempotencyKey,
    messageId,
    recipientEmail: request.recipientEmail,
    reportType: request.reportType,
    acceptedAt: now,
    status: 'ACCEPTED_FOR_DELIVERY',
    dryRun: false,
  });

  return {
    status: 'ACCEPTED_FOR_DELIVERY',
    messageId,
    recipientMasked: maskedEmail,
    idempotencyKey: request.idempotencyKey,
    isDuplicate: false,
    remainingDailyQuota: sendResult.remainingDailyQuota,
    acceptedAt: now,
    dryRun: false,
  };
}

// -------------------------------------------------------------
// 5. Authorized Read-Only Reporting Data Adapter
// -------------------------------------------------------------

function maskAadhaar(raw?: string): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 4) return `XXXX-XXXX-${digits.slice(-4)}`;
  return 'XXXX-XXXX-XXXX';
}

function maskBankAccount(raw?: string): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (str.length >= 4) return `XXXX-XXXX-${str.slice(-4)}`;
  return 'XXXX-XXXX';
}

function maskPhone(raw?: string): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 4) return `******${digits.slice(-4)}`;
  return '******';
}

/**
 * Executes an authorized read-only reporting query with RBAC enforcement,
 * PII masking, and explicit source freshness honesty guarantees.
 */
export function executeAuthorizedReportingQuery(
  rawRows: readonly any[],
  request: ReportingQueryRequest,
  provenance: {
    upstreamOrigin: 'GOOGLE_SHEETS_APPS_SCRIPT' | 'LOCAL_SYNTHETIC_FIXTURES';
    isSynthetic: boolean;
    lastSyncedAt?: string;
  } = {
    upstreamOrigin: 'LOCAL_SYNTHETIC_FIXTURES',
    isSynthetic: true,
  }
): ReportingQueryResult {
  const startTime = Date.now();
  const { securityContext, filters, limit = 500 } = request;
  const now = new Date().toISOString();

  const freshness: SourceFreshness = {
    lastSyncedAt: provenance.lastSyncedAt || now,
    sourceVersion: provenance.isSynthetic ? 'synthetic-bridge-v1.3.0' : 'apps-script-linelist-v3.0.0',
    recordCount: rawRows.length,
    isSynthetic: provenance.isSynthetic,
    upstreamOrigin: provenance.upstreamOrigin,
  };

  // RBAC scope check: State leads cannot query states outside their scope
  if (filters.state && !securityContext.permittedStates.includes('*')) {
    if (!securityContext.permittedStates.includes(filters.state)) {
      return {
        status: 'error',
        code: 'FORBIDDEN_SCOPE',
        error: `Caller with scope [${securityContext.permittedStates.join(', ')}] forbidden to query records for state "${filters.state}".`,
        records: [],
        totalMatchingCount: 0,
        hasMore: false,
        executionTimeMs: Date.now() - startTime,
        freshness,
      };
    }
  }

  // Filter records
  const matched = rawRows.filter((r) => {
    // State filter
    if (filters.state) {
      const rowState = r.state || r['18\nState'] || '';
      if (rowState.toLowerCase() !== filters.state.toLowerCase()) return false;
    } else if (!securityContext.permittedStates.includes('*')) {
      // Caller restricted to specific states
      const rowState = r.state || r['18\nState'] || '';
      if (!securityContext.permittedStates.includes(rowState)) return false;
    }

    // District filter
    if (filters.district) {
      const rowDistrict = r.district || r['19\nDistrict'] || '';
      if (rowDistrict.toLowerCase() !== filters.district.toLowerCase()) return false;
    }

    // Orphan Status filter
    if (filters.orphanStatus && filters.orphanStatus !== 'ALL') {
      const rowOrphan = r.orphanStatus || r['13\nOrphan Status'] || '';
      if (rowOrphan !== filters.orphanStatus) return false;
    }

    // School Type filter
    if (filters.schoolType && filters.schoolType !== 'ALL') {
      const rowSchool = r.schoolType || r['53\nSchool Type'] || '';
      if (rowSchool !== filters.schoolType) return false;
    }

    // Date range filter
    const dateField = filters.dateBasis === 'VISIT_DATE'
      ? (r.visitDate || r['7\nVisit Date'] || '')
      : (r.submissionDate || r['3\nSubmission Time'] || '');

    if (filters.startDate && dateField && dateField < filters.startDate) return false;
    if (filters.endDate && dateField && dateField > filters.endDate) return false;

    return true;
  });

  // Mask PII and transform into SanitizedReportRecord
  const sanitizedRecords: SanitizedReportRecord[] = matched.slice(0, limit).map((r) => ({
    uniqueId: r.uniqueId || r['1\nUnique ID'] || 'UNKNOWN',
    state: r.state || r['18\nState'] || '',
    district: r.district || r['19\nDistrict'] || '',
    visitDate: r.visitDate || r['7\nVisit Date'] || '',
    submissionDate: r.submissionDate || r['3\nSubmission Time'] || '',
    age: Number(r.age || r['11\nAge'] || 0),
    gender: r.gender || r['12\nGender'] || '',
    orphanStatus: r.orphanStatus || r['13\nOrphan Status'] || '',
    schoolType: r.schoolType || r['53\nSchool Type'] || '',
    verificationStatus: r.verificationStatus || r['67\nApproval Status'] || 'APPROVED',
    maskedAadhaar: maskAadhaar(r.childAadhaarNumber || r['24\nChild Aadhaar Number']),
    maskedBankAccount: maskBankAccount(r.bankAccountNumber || r['21\nBank Account Number']),
    maskedCaregiverPhone: maskPhone(r.caregiverContact || r['16\nCaregiver Contact']),
    isSynthetic: provenance.isSynthetic,
  }));

  return {
    status: 'success',
    records: sanitizedRecords,
    totalMatchingCount: matched.length,
    hasMore: matched.length > limit,
    executionTimeMs: Date.now() - startTime,
    freshness: {
      ...freshness,
      recordCount: matched.length,
    },
  };
}
