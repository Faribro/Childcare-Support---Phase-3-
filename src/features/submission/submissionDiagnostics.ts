/**
 * submissionDiagnostics.ts — Non-PII Structured Diagnostics
 *
 * Safe diagnostics for development and staging ONLY.
 * NEVER records: child name, caregiver name, date of birth, ART/reference ID,
 * address, phone, Aadhaar, health information, signature, document URL,
 * raw submission payload, Sheet row data, authorization tokens,
 * Apps Script URL, or environment variable values.
 */

export interface DiagnosticRecord {
  timestamp: string;
  operation: 'CREATE' | 'UPDATE';
  clientSubmissionId: string;
  correlationId: string;
  remoteSubmissionId?: string; // Only logged if not privacy-sensitive under project policy
  stateBefore: string;
  stateAfter: string;
  apiRoute?: string;
  statusCode?: number;
  errorCategory?: string;
  adapterAction?: string;
  retryCount: number;
  elapsedMs: number;
}

const isDevelopment = process.env.NODE_ENV === 'development';
const isStaging = process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging';

/**
 * Log a structured diagnostic record (development/staging only).
 * In production, this is a no-op.
 */
export function logDiagnostic(record: DiagnosticRecord): void {
  if (!isDevelopment && !isStaging) return;

  // Omit remoteSubmissionId unless in development
  const safeRecord: Partial<DiagnosticRecord> & {
    timestamp: string;
    operation: string;
    clientSubmissionId: string;
    correlationId: string;
  } = {
    timestamp: record.timestamp,
    operation: record.operation,
    clientSubmissionId: record.clientSubmissionId,
    correlationId: record.correlationId,
    stateBefore: record.stateBefore,
    stateAfter: record.stateAfter,
    apiRoute: record.apiRoute,
    statusCode: record.statusCode,
    errorCategory: record.errorCategory,
    adapterAction: record.adapterAction,
    retryCount: record.retryCount,
    elapsedMs: record.elapsedMs,
  };

  if (isDevelopment && record.remoteSubmissionId) {
    safeRecord.remoteSubmissionId = record.remoteSubmissionId;
  }

  console.debug('[SubmissionDiagnostics]', JSON.stringify(safeRecord));
}

/**
 * Generate a short opaque correlation ID for tracing a request chain.
 * Not globally unique across systems — for single-session tracing only.
 */
export function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `corr-${ts}-${rand}`;
}
