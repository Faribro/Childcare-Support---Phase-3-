import {
  CohortSummaryResult,
  ExportDeliveryJob,
  ExportPreviewContract,
  SourceFreshness,
} from './types';

export class WhatsAppFormatter {
  /**
   * Formats a CohortSummaryResult into a concise, readable WhatsApp message.
   */
  public formatCohortSummary(
    result: CohortSummaryResult,
    options?: {
      titlePrefix?: string;
      showDistricts?: boolean;
    }
  ): string {
    const scopeLabel = result.stateFilter
      ? `in *${result.stateFilter}*`
      : 'Nationally (All Permitted States)';

    const dateBasisLabel =
      result.dateBasis === 'VISIT_DATE' ? 'Visit-Date Basis' : 'Submission-Date Basis';

    let districtSection = '';
    if (options?.showDistricts || result.stateFilter) {
      if (result.districtBreakdown.length > 0) {
        const districtLines = result.districtBreakdown.map(
          (d) =>
            `  📍 *${d.district}*: ${d.uniqueBeneficiaries} child (${d.totalAssessments} ${
              d.totalAssessments === 1 ? 'assessment' : 'assessments'
            }) • ${d.approvedAssessments} Approved${
              d.pendingAssessments > 0 ? `, ${d.pendingAssessments} Pending` : ''
            }${d.flaggedAssessments > 0 ? `, ${d.flaggedAssessments} Flagged` : ''}`
        );
        districtSection = `\n\n*District Breakdown:*\n${districtLines.join('\n')}`;
      } else {
        districtSection = '\n\n_No district records matching active filters._';
      }
    }

    const freshnessFooter = this.formatFreshnessFooter(result.sourceFreshness);

    return (
      `📊 *${result.month} ${result.year} Single-Orphan Government School Cohort*\n` +
      `Scope: ${scopeLabel}\n` +
      `Accounting: *${dateBasisLabel}*\n\n` +
      `🧒 *Unique Beneficiaries:* *${result.uniqueBeneficiariesCount}* children\n` +
      `📋 *Total Assessments:* *${result.totalAssessmentsCount}* events\n\n` +
      `*Verification Breakdown:*\n` +
      `  ✅ Approved: *${result.approvedAssessmentsCount}*\n` +
      `  ⏳ Pending Verification: *${result.pendingAssessmentsCount}*\n` +
      `  ⚠️ Flagged / Audit Concern: *${result.flaggedAssessmentsCount}*\n` +
      `  ❌ Rejected: *${result.rejectedAssessmentsCount}*\n\n` +
      `*Data Quality Exclusions:*\n` +
      `  • Missing School Type: *${result.recordsExcludedMissingSchool}* records\n` +
      `  • Missing Orphan Status: *${result.recordsExcludedMissingOrphanStatus}* records` +
      districtSection +
      `\n\n${freshnessFooter}`
    );
  }

  /**
   * Formats a two-phase export preview into a concise WhatsApp confirmation prompt.
   */
  public formatExportPreview(preview: ExportPreviewContract): string {
    return (
      `📄 *SURVEILLANCE EXPORT PREVIEW*\n\n` +
      `• *Report:* ${preview.title}\n` +
      `• *Unique Children:* ${preview.uniqueBeneficiaries}\n` +
      `• *Total Assessments:* ${preview.totalAssessments}\n` +
      `• *Destination:* Registered Email (${preview.recipientEmailMasked})\n` +
      `• *Format:* CSV / PDF Dossier\n\n` +
      `⚠️ *Confirmation Required:*\n` +
      `To dispatch this report, reply:\n` +
      `👉 *CONFIRM EXPORT*\n\n` +
      `_(Expires in 5 minutes. Reply *CANCEL* to discard)._`
    );
  }

  /**
   * Formats export job dispatch notice.
   */
  public formatExportJobQueued(job: ExportDeliveryJob): string {
    return (
      `✅ *Export Job Queued*\n\n` +
      `• *Job ID:* \`${job.jobId}\`\n` +
      `• *Recipient:* ${job.recipientEmailMasked}\n` +
      `• *Target:* ${job.deliveryTarget}\n` +
      `• *Status:* Scheduled for background delivery via Central Bridge.\n\n` +
      `_No confidential beneficiary PII was exposed or sent over WhatsApp._`
    );
  }

  /**
   * Formats clarification prompts.
   */
  public formatClarificationPrompt(promptText: string): string {
    return `❓ *Clarification Needed*\n\n${promptText}`;
  }

  /**
   * Formats standard freshness footer derived from data adapter metadata.
   */
  public formatFreshnessFooter(freshness: SourceFreshness): string {
    return `_Data Freshness: Synced ${freshness.lastSyncedAt} (${freshness.sourceVersion})_`;
  }

  /**
   * Converts generic markdown text into clean WhatsApp formatting.
   */
  public markdownToWhatsApp(text: string): string {
    let formatted = text
      // Headers ### to *bold*
      .replace(/^###\s+(.+)$/gm, '*$1*')
      .replace(/^##\s+(.+)$/gm, '*$1*')
      .replace(/^#\s+(.+)$/gm, '*$1*')
      // Markdown bold **text** to *text*
      .replace(/\*\*([^*]+)\*\*/g, '*$1*');

    // WhatsApp hard length bound
    if (formatted.length > 3500) {
      formatted = formatted.substring(0, 3400) + '\n\n_...[Output truncated for WhatsApp display limits]_';
    }

    return formatted;
  }
}
