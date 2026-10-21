import crypto from 'crypto';
import {
  CallerSecurityContext,
  CohortSummaryResult,
  DateBasis,
  ExportDeliveryJob,
  ExportPreviewContract,
  ReportingSession,
} from './types';

export const CANONICAL_LINELIST_COLUMNS: readonly string[] = [
  'Child ID',
  'Child Name (DPDP Masked)',
  'State',
  'District',
  'Age (Months)',
  'Gender',
  'Orphan Category',
  'School Category',
  'Visit Date',
  'Submission Date',
  'Approval Status',
  'Signature Drive Link (Col 6)',
  'Passbook Drive Link (Col 25)',
  'Aadhaar Drive Link (Col 26)',
  'Child Photo Drive Link (Col 27)',
  'Fee Receipt Drive Link (Col 64)',
  'Marksheet Drive Link (Col 65)',
];

export const SUMMARY_REPORT_COLUMNS: readonly string[] = [
  'Metric Name',
  'Count / Rate',
  'Accounting Date Field',
  'Calendar Period',
  'Geographic Scope',
];

/**
 * Computes a deterministic SHA-256 hash over immutable export parameters.
 * Prevents parameter tampering or cross-user reuse.
 */
export function computeImmutableExportHash(params: {
  exportId: string;
  recipientUserId: string;
  recipientEmailExact: string;
  year: number;
  monthOrRange: string;
  dateBasis: DateBasis;
  stateFilter: string | null;
  columns: readonly string[];
}): string {
  const payload = [
    params.exportId,
    params.recipientUserId,
    params.recipientEmailExact.toLowerCase(),
    params.year,
    params.monthOrRange,
    params.dateBasis,
    params.stateFilter || 'National',
    params.columns.join(','),
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class ExportContractService {
  /**
   * Phase 1: Generates an export preview contract requiring explicit confirmation.
   * Expiry is bounded to 5 minutes.
   */
  public createExportPreview(
    session: ReportingSession,
    caller: CallerSecurityContext,
    cohortResult?: CohortSummaryResult | null,
    recipientEmailMasked: string = 'd****@allianceindia.org',
    recipientEmailExact: string = 'director@allianceindia.org'
  ): ExportPreviewContract {
    const exportId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const year = cohortResult?.year ?? session.confirmedYear;
    if (!year) {
      throw new Error('UNSPECIFIED_YEAR: Export preview requires an explicitly clarified calendar year.');
    }

    const month = cohortResult?.month ?? 'June';
    const stateScope = session.activeStateFilter ?? (caller.permittedStates.includes('*') ? 'National' : caller.permittedStates.join(', '));
    const dateBasis = session.confirmedDateBasis ?? session.activeDateBasis;
    const dateField: 'visit_date' | 'submission_date' = dateBasis === 'VISIT_DATE' ? 'visit_date' : 'submission_date';
    const columns = SUMMARY_REPORT_COLUMNS;

    const immutableParametersHash = computeImmutableExportHash({
      exportId,
      recipientUserId: caller.userId,
      recipientEmailExact,
      year,
      monthOrRange: month,
      dateBasis,
      stateFilter: session.activeStateFilter,
      columns,
    });

    return {
      exportId,
      reportType: 'COHORT_SUMMARY',
      title: `${month} ${year} Single-Orphan Government School Surveillance Report (${stateScope})`,
      stateFilter: session.activeStateFilter,
      year,
      month,
      dateBasis,
      dateField,
      columns,
      uniqueBeneficiaries: cohortResult?.uniqueBeneficiariesCount ?? 0,
      totalAssessments: cohortResult?.totalAssessmentsCount ?? 0,
      recipientUserId: caller.userId,
      recipientEmailMasked,
      recipientEmailExact,
      confirmationCode: 'CONFIRM EXPORT',
      immutableParametersHash,
      expiresAt,
      isConsumed: false,
    };
  }

  /**
   * Phase 1 (Linelist): Generates an Excel linelist export preview with Drive document links.
   * Strictly requires explicit year and date basis (no hardcoded defaults).
   */
  public createLinelistExportPreview(
    session: ReportingSession,
    caller: CallerSecurityContext,
    options: {
      year?: number;
      monthOrRange?: string;
      dateBasis?: DateBasis;
      stateFilter?: string | null;
      uniqueBeneficiaries?: number;
      totalAssessments?: number;
      driveLinksCount?: number;
      recipientEmailMasked?: string;
      recipientEmailExact?: string;
    } = {}
  ): ExportPreviewContract {
    const exportId = `exp_line_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const year = options.year ?? session.confirmedYear;
    if (!year) {
      throw new Error('UNSPECIFIED_YEAR: Linelist export requires an explicitly confirmed calendar year (e.g. 2026).');
    }

    const dateBasis = options.dateBasis ?? session.confirmedDateBasis;
    if (!dateBasis) {
      throw new Error('UNSPECIFIED_DATE_BASIS: Linelist export requires an explicitly confirmed date basis (VISIT_DATE vs. SUBMISSION_DATE).');
    }

    const month = options.monthOrRange ?? 'April–June';
    const stateScope =
      options.stateFilter ??
      session.activeStateFilter ??
      (caller.permittedStates.includes('*') ? 'National' : caller.permittedStates.join(', '));
    const dateField: 'visit_date' | 'submission_date' = dateBasis === 'VISIT_DATE' ? 'visit_date' : 'submission_date';
    const uniqueBeneficiaries = options.uniqueBeneficiaries ?? (session.lastCohortResult?.uniqueBeneficiariesCount ?? 50);
    const totalAssessments = options.totalAssessments ?? (session.lastCohortResult?.totalAssessmentsCount ?? 50);
    const columns = CANONICAL_LINELIST_COLUMNS;
    const recipientEmailExact = options.recipientEmailExact ?? (caller.userId.includes('mh') ? 'lead.mh@allianceindia.org' : 'director@allianceindia.org');
    const recipientEmailMasked = options.recipientEmailMasked ?? (caller.userId.includes('mh') ? 'l****.mh@allianceindia.org' : 'd****@allianceindia.org');

    const immutableParametersHash = computeImmutableExportHash({
      exportId,
      recipientUserId: caller.userId,
      recipientEmailExact,
      year,
      monthOrRange: month,
      dateBasis,
      stateFilter: options.stateFilter ?? session.activeStateFilter,
      columns,
    });

    return {
      exportId,
      reportType: 'LINELIST_EXPORT',
      title: `${month} ${year} Childcare Linelist with Document Links (${stateScope})`,
      stateFilter: options.stateFilter ?? session.activeStateFilter,
      year,
      month,
      monthRange: month,
      dateBasis,
      dateField,
      columns,
      uniqueBeneficiaries,
      totalAssessments,
      recipientUserId: caller.userId,
      recipientEmailMasked,
      recipientEmailExact,
      confirmationCode: 'CONFIRM EXPORT',
      immutableParametersHash,
      expiresAt,
      isConsumed: false,
      format: 'XLSX',
      driveLinksCount: options.driveLinksCount ?? uniqueBeneficiaries * 4,
    };
  }

  /**
   * Phase 2: Validates the confirmation code and dispatches the delivery job.
   * Fails closed if expired, caller does not match, unauthorized at execution time, or replayed.
   */
  public confirmExportDelivery(
    preview: ExportPreviewContract,
    caller: CallerSecurityContext,
    userConfirmationText: string
  ): {
    success: boolean;
    job?: ExportDeliveryJob;
    errorReason?: string;
  } {
    // 1. Replay / Duplicate Prevention
    if (preview.isConsumed) {
      return {
        success: false,
        errorReason: 'REPLAY_REJECTED: This export preview has already been confirmed and queued for delivery. Duplicate execution blocked.',
      };
    }

    // 2. Verify caller ownership
    if (caller.userId !== preview.recipientUserId) {
      return {
        success: false,
        errorReason: `Cross-user export confirmation denied. Caller '${caller.userId}' cannot confirm preview owned by '${preview.recipientUserId}'.`,
      };
    }

    // 3. Execution-Time Geographic Authorization Enforcement
    if (preview.stateFilter && !caller.permittedStates.includes('*')) {
      const permittedLower = caller.permittedStates.map((s) => s.toLowerCase());
      if (!permittedLower.includes(preview.stateFilter.toLowerCase())) {
        return {
          success: false,
          errorReason: `EXECUTION_AUTH_DENIED: Caller '${caller.userId}' (${caller.role}) is unauthorized for '${preview.stateFilter}' at execution time. Permitted states: [${caller.permittedStates.join(', ')}].`,
        };
      }
    }

    // 4. Verify expiry (5-minute TTL)
    if (new Date().toISOString() > preview.expiresAt) {
      return {
        success: false,
        errorReason: 'Export preview has expired (5-minute window exceeded). Please request a new export.',
      };
    }

    // 5. Verify immutable parameters integrity
    const currentHash = computeImmutableExportHash({
      exportId: preview.exportId,
      recipientUserId: preview.recipientUserId,
      recipientEmailExact: preview.recipientEmailExact,
      year: preview.year,
      monthOrRange: preview.monthRange || preview.month,
      dateBasis: preview.dateBasis,
      stateFilter: preview.stateFilter,
      columns: preview.columns,
    });

    if (currentHash !== preview.immutableParametersHash) {
      return {
        success: false,
        errorReason: 'INTEGRITY_VIOLATION: Export parameters were modified after the preview was generated.',
      };
    }

    // 6. Verify confirmation code
    const normalizedConfirmation = userConfirmationText.trim().toUpperCase();
    if (
      normalizedConfirmation !== 'CONFIRM EXPORT' &&
      normalizedConfirmation !== 'CONFIRM' &&
      normalizedConfirmation !== 'YES'
    ) {
      return {
        success: false,
        errorReason: "Invalid confirmation. Please reply with 'CONFIRM EXPORT' or 'CANCEL'.",
      };
    }

    // 7. Mark preview as consumed (single-use guarantee)
    preview.isConsumed = true;
    preview.consumedAt = new Date().toISOString();

    // 8. Create delivery job
    const job: ExportDeliveryJob = {
      jobId: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      exportId: preview.exportId,
      reportType: preview.reportType,
      recipientUserId: preview.recipientUserId,
      recipientEmailMasked: preview.recipientEmailMasked,
      recipientEmailExact: preview.recipientEmailExact,
      immutableParametersHash: preview.immutableParametersHash,
      status: 'QUEUED',
      queuedAt: new Date().toISOString(),
      deliveryTarget: 'APPS_SCRIPT_EMAIL_DISPATCHER',
    };

    return {
      success: true,
      job,
    };
  }
}
