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
    const isLinelist = preview.reportType === 'LINELIST_EXPORT';
    const formatLabel = isLinelist
      ? 'Excel (.xlsx) with Google Drive Document Links'
      : (preview.format || 'CSV / PDF Dossier');
    const linksLine = preview.driveLinksCount ? `• *Document Links:* ~${preview.driveLinksCount} Drive hyperlinks\n` : '';
    const dateFieldLabel = preview.dateField === 'visit_date' ? 'visit_date (Field Visit Date)' : 'submission_date (Central Sync Date)';
    const scopeLabel = preview.stateFilter ? `State: ${preview.stateFilter}` : 'National (All Authorized States)';
    const columnsSummary = preview.columns && preview.columns.length > 0
      ? `• *Columns (${preview.columns.length}):* ${preview.columns.slice(0, 4).join(', ')}, ... (+${preview.columns.length - 4} columns)\n`
      : '';
    const hashShort = preview.immutableParametersHash ? `• *Contract Hash:* \`${preview.immutableParametersHash.substring(0, 12)}...\`\n` : '';

    return (
      `📄 *${isLinelist ? 'CHILDCARE LINELIST EXPORT PREVIEW' : 'SURVEILLANCE EXPORT PREVIEW'}*\n\n` +
      `• *Report:* ${preview.title}\n` +
      `• *Scope:* ${scopeLabel}\n` +
      `• *Calendar Year:* ${preview.year}\n` +
      `• *Date Field:* ${dateFieldLabel}\n` +
      `• *Beneficiaries:* ${preview.uniqueBeneficiaries} children\n` +
      `• *Assessments:* ${preview.totalAssessments} records\n` +
      linksLine +
      columnsSummary +
      hashShort +
      `• *Destination:* Registered Email (${preview.recipientEmailMasked})\n` +
      `• *Format:* ${formatLabel}\n\n` +
      `⚠️ *Confirmation Required:*\n` +
      `To dispatch this report to your registered leadership email, reply:\n` +
      `👉 *CONFIRM EXPORT*\n\n` +
      `_(Expires in 5 minutes. Reply *CANCEL* to discard)._`
    );
  }

  /**
   * Formats export job dispatch notice.
   */
  public formatExportJobQueued(job: ExportDeliveryJob): string {
    const isLinelist = job.reportType === 'LINELIST_EXPORT';
    const reportDesc = isLinelist
      ? 'Excel (.xlsx) Linelist with Drive Document Links'
      : 'Surveillance Cohort Summary';
    const artifactLine = job.artifact
      ? `• *File:* \`${job.artifact.filename}\` (${(job.artifact.byteSize / 1024).toFixed(1)} KB, ${job.artifact.rowCount} rows)\n`
      : '';
    const hashLine = job.artifact
      ? `• *File SHA-256:* \`${job.artifact.sha256.substring(0, 16)}...\`\n`
      : '';

    return (
      `✅ *Export Job ${job.status === 'SENT' ? 'Dispatched' : 'Queued'}*\n\n` +
      `• *Job ID:* \`${job.jobId}\`\n` +
      `• *Export Ref:* \`${job.exportId}\`\n` +
      `• *Artifact:* ${reportDesc}\n` +
      artifactLine +
      hashLine +
      `• *Recipient:* ${job.recipientEmailMasked}\n` +
      `• *Target:* ${job.deliveryTarget}\n` +
      `• *Status:* ${job.status === 'SENT' ? 'Dispatched via Email Attachment' : 'Scheduled for background delivery via Central Bridge'}.\n\n` +
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
