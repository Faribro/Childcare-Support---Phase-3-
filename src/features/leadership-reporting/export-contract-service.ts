import {
  CallerSecurityContext,
  CohortSummaryResult,
  ExportDeliveryJob,
  ExportPreviewContract,
  ReportingSession,
} from './types';

export class ExportContractService {
  /**
   * Phase 1: Generates an export preview contract requiring explicit confirmation.
   * Expiry is bounded to 5 minutes.
   */
  public createExportPreview(
    session: ReportingSession,
    caller: CallerSecurityContext,
    cohortResult?: CohortSummaryResult | null,
    recipientEmailMasked: string = 'd****@allianceindia.org'
  ): ExportPreviewContract {
    const exportId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const year = cohortResult?.year ?? session.confirmedYear ?? 2026;
    const month = cohortResult?.month ?? 'June';
    const stateScope = session.activeStateFilter ?? (caller.permittedStates.includes('*') ? 'National' : caller.permittedStates.join(', '));

    return {
      exportId,
      reportType: 'COHORT_SUMMARY',
      title: `${month} ${year} Single-Orphan Government School Surveillance Report (${stateScope})`,
      stateFilter: session.activeStateFilter,
      year,
      month,
      dateBasis: session.activeDateBasis,
      uniqueBeneficiaries: cohortResult?.uniqueBeneficiariesCount ?? 0,
      totalAssessments: cohortResult?.totalAssessmentsCount ?? 0,
      recipientUserId: caller.userId,
      recipientEmailMasked,
      confirmationCode: 'CONFIRM EXPORT',
      expiresAt,
    };
  }

  /**
   * Phase 2: Validates the confirmation code and dispatches the delivery job.
   * Fails closed if expired or caller does not match.
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
    // 1. Verify caller ownership
    if (caller.userId !== preview.recipientUserId) {
      return {
        success: false,
        errorReason: `Cross-user export confirmation denied. Caller '${caller.userId}' cannot confirm preview owned by '${preview.recipientUserId}'.`,
      };
    }

    // 2. Verify expiry
    if (new Date().toISOString() > preview.expiresAt) {
      return {
        success: false,
        errorReason: 'Export preview has expired (5-minute window exceeded). Please request a new export.',
      };
    }

    // 3. Verify confirmation code
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

    // 4. Create delivery job
    const job: ExportDeliveryJob = {
      jobId: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      exportId: preview.exportId,
      reportType: preview.reportType,
      recipientUserId: preview.recipientUserId,
      recipientEmailMasked: preview.recipientEmailMasked,
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
