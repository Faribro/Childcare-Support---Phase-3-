import {
  calculateCohortMetrics,
  calculateJuneCohortMetrics,
  calculateKpiSummary,
  calculateStateComparison,
  filterHighRiskCohorts,
  filterPendingApprovals,
  validateCallerAccess,
} from './metrics-calculator';
import {
  classifyQueryIntent,
  DeterministicRuleIntentClassifier,
  extractCohortFilter,
  extractStateFilter,
} from './intent-router';
import {
  SYNTHETIC_EVALUATION_DATASET,
  SYNTHETIC_JUNE_ASSESSMENT_DATASET,
} from './synthetic-dataset';
import {
  AuthorizedReportingDataAdapter,
  SyntheticAuthorizedDataAdapter,
} from './data-source-adapter';
import { WhatsAppFormatter } from './whatsapp-formatter';
import { ExportContractService } from './export-contract-service';
import {
  AssistantMessage,
  CallerSecurityContext,
  ClarificationPrompt,
  CohortFilterQuery,
  CohortSummaryResult,
  DateBasis,
  ExportDeliveryJob,
  ExportPreviewContract,
  IntentClassifierProvider,
  ReportingSession,
  SourceFreshness,
  SyntheticAssessmentRecord,
  SyntheticChildRecord,
} from './types';

/**
 * Leadership Reporting Assistant - Core Conversational Agent
 *
 * ARCHITECTURAL BOUNDARIES & PRINCIPLES:
 * 1. Read-Only Assurance: No mutation tools or functions exist in the agent.
 *    Mutation operations are architecturally unavailable, not merely blocked by words.
 * 2. Trusted Scope Authorization: Conversation filters NEVER define permissions.
 *    Every data evaluation uses the caller's cryptographically verified CallerSecurityContext.
 * 3. Interpretation Boundary: Intent classification utilizes a deterministic rule-based
 *    provider (DeterministicRuleIntentClassifier). It does not claim general natural language
 *    understanding.
 * 4. Grounded Reporting: All reported numbers, counts, and breakdowns are deterministically
 *    computed from local synthetic fixtures or authorized data sources.
 * 5. Data Freshness: Derived explicitly from data adapter metadata, never an ephemeral generated timestamp.
 */
export class LeadershipReportingAgent {
  private readonly dataAdapter: AuthorizedReportingDataAdapter;
  private readonly classifier: IntentClassifierProvider;
  private readonly formatter: WhatsAppFormatter;
  private readonly exportService: ExportContractService;

  constructor(
    dataAdapterOrNutrition?: AuthorizedReportingDataAdapter | readonly SyntheticChildRecord[],
    classifierOrAssessments?: IntentClassifierProvider | readonly SyntheticAssessmentRecord[],
    classifierProvider?: IntentClassifierProvider,
    formatter: WhatsAppFormatter = new WhatsAppFormatter(),
    exportService: ExportContractService = new ExportContractService()
  ) {
    if (Array.isArray(dataAdapterOrNutrition)) {
      // Backwards-compatible legacy signature: (nutritionRecords, assessmentRecords, classifier)
      const nutrition = dataAdapterOrNutrition;
      const assessments = Array.isArray(classifierOrAssessments)
        ? classifierOrAssessments
        : SYNTHETIC_JUNE_ASSESSMENT_DATASET;
      this.dataAdapter = new SyntheticAuthorizedDataAdapter(assessments, nutrition);
      this.classifier = classifierProvider ?? new DeterministicRuleIntentClassifier();
    } else if (dataAdapterOrNutrition && 'fetchAssessmentRecords' in dataAdapterOrNutrition) {
      this.dataAdapter = dataAdapterOrNutrition;
      this.classifier =
        (classifierOrAssessments as IntentClassifierProvider) ??
        new DeterministicRuleIntentClassifier();
    } else {
      this.dataAdapter = new SyntheticAuthorizedDataAdapter();
      this.classifier =
        (classifierOrAssessments as IntentClassifierProvider) ??
        new DeterministicRuleIntentClassifier();
    }

    this.formatter = formatter;
    this.exportService = exportService;
  }

  public createSession(
    sessionId: string = `sess_${Date.now()}`,
    caller: CallerSecurityContext = {
      userId: 'usr_leadership_01',
      role: 'LEADERSHIP',
      permittedStates: ['*'],
    },
    options?: {
      confirmedYear?: number;
      confirmedDateBasis?: DateBasis;
      isConfirmedPolicy?: boolean;
    }
  ): ReportingSession {
    const now = new Date().toISOString();
    const isConfirmed = options?.isConfirmedPolicy ?? true;

    return {
      sessionId,
      ownerUserId: caller.userId,
      callerScope: caller,
      activeStateFilter: null,
      activeDateBasis: options?.confirmedDateBasis ?? 'VISIT_DATE',
      confirmedYear: options?.confirmedYear ?? (isConfirmed ? 2026 : undefined),
      confirmedDateBasis: options?.confirmedDateBasis ?? (isConfirmed ? 'VISIT_DATE' : undefined),
      isConfirmedPolicy: isConfirmed,
      pendingClarification: null,
      pendingExport: null,
      lastCohortResult: null,
      messages: [
        {
          id: `msg_welcome_${Date.now()}`,
          role: 'system',
          content:
            'Leadership Reporting Assistant initialized. Operating in local synthetic evaluation mode with trusted caller authorization.',
          timestamp: now,
          isSynthetic: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
  }

  public processQuery(
    session: ReportingSession,
    userQuery: string,
    caller?: CallerSecurityContext
  ): {
    updatedSession: ReportingSession;
    response: AssistantMessage;
  } {
    const now = new Date().toISOString();
    const effectiveCaller = caller ?? session.callerScope;

    // 1. Cross-user session tampering protection
    if (caller && caller.userId !== session.ownerUserId) {
      const denialMessage: AssistantMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Authorization Violation (Cross-User Session Tampering)**\n\nCaller '${caller.userId}' is not permitted to access or execute queries in session '${session.sessionId}' owned by user '${session.ownerUserId}'.`,
        timestamp: now,
        intent: 'AUTHORIZATION_DENIED',
        isSynthetic: true,
      };
      return {
        updatedSession: session,
        response: denialMessage,
      };
    }

    // 2. Classify intent via provider interface
    const classification = this.classifier.classify(userQuery, { caller: effectiveCaller });

    // 3. Security Guardrails: Mutation & PII Rejections
    if (classification.intent === 'MUTATION_REJECTED') {
      const response: AssistantMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Action Denied (Read-Only Guardrail)**\n\n${
          classification.safetyRejectionReason ||
          'Mutation tools are unavailable in this reporting system. The assistant is architecturally read-only.'
        }`,
        timestamp: now,
        intent: 'MUTATION_REJECTED',
        isSynthetic: true,
      };
      return {
        updatedSession: this.appendMessages(session, userQuery, response, session.activeStateFilter, now),
        response,
      };
    }

    if (classification.intent === 'PII_REQUEST_REJECTED') {
      const response: AssistantMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `🔒 **Privacy Guardrail Triggered**\n\n${
          classification.safetyRejectionReason ||
          'Data protection policies strictly forbid disclosing personally identifiable information (PII) or clinical HIV records.'
        }`,
        timestamp: now,
        intent: 'PII_REQUEST_REJECTED',
        isSynthetic: true,
      };
      return {
        updatedSession: this.appendMessages(session, userQuery, response, session.activeStateFilter, now),
        response,
      };
    }

    if (classification.intent === 'AUTHORIZATION_DENIED') {
      const response: AssistantMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `⛔ **Authorization Boundary Denied**\n\n${
          classification.authorizationDenialReason ||
          'Your caller credentials do not have permission to access the requested geographic scope.'
        }`,
        timestamp: now,
        intent: 'AUTHORIZATION_DENIED',
        isSynthetic: true,
      };
      return {
        updatedSession: this.appendMessages(session, userQuery, response, session.activeStateFilter, now),
        response,
      };
    }

    // 4. State scoping resolution
    let activeState = session.activeStateFilter;
    if (classification.stateFilter) {
      const auth = validateCallerAccess(effectiveCaller, classification.stateFilter);
      if (!auth.allowed) {
        const response: AssistantMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `⛔ **Scope Widening Denied**\n\n${auth.denialReason}`,
          timestamp: now,
          intent: 'AUTHORIZATION_DENIED',
          isSynthetic: true,
        };
        return {
          updatedSession: this.appendMessages(session, userQuery, response, session.activeStateFilter, now),
          response,
        };
      }
      activeState = classification.stateFilter;
    } else if (/\b(national|all states|entire country|reset)\b/i.test(userQuery)) {
      activeState = null;
    }

    // 5. Export Flow: Confirmations, Cancellations, and Requests
    if (classification.intent === 'EXPORT_CONFIRM') {
      if (!session.pendingExport) {
        const response: AssistantMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content:
            'ℹ️ *No Pending Export Preview*\n\nThere is no active export preview awaiting confirmation. Please query a report first and ask to export it.',
          timestamp: now,
          intent: 'HELP_AND_CAPABILITIES',
          isSynthetic: true,
        };
        return {
          updatedSession: this.appendMessages(session, userQuery, response, activeState, now),
          response,
        };
      }

      const jobResult = this.exportService.confirmExportDelivery(
        session.pendingExport,
        effectiveCaller,
        userQuery
      );

      if (!jobResult.success || !jobResult.job) {
        const response: AssistantMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ *Export Failed:* ${jobResult.errorReason || 'Unable to confirm export job.'}`,
          timestamp: now,
          intent: 'AUTHORIZATION_DENIED',
          isSynthetic: true,
        };
        return {
          updatedSession: this.appendMessages(session, userQuery, response, activeState, now),
          response,
        };
      }

      const formattedJob = this.formatter.formatExportJobQueued(jobResult.job);
      const response: AssistantMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: formattedJob,
        timestamp: now,
        intent: 'EXPORT_CONFIRM',
        structuredData: { exportJob: jobResult.job },
        isSynthetic: true,
      };

      const updated = {
        ...this.appendMessages(session, userQuery, response, activeState, now),
        pendingExport: null,
      };
      return { updatedSession: updated, response };
    }

    if (classification.intent === 'EXPORT_CANCEL') {
      const response: AssistantMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: session.pendingExport
          ? '❌ *Export Cancelled*\n\nThe pending export preview has been discarded.'
          : 'ℹ️ No active export preview was found to cancel.',
        timestamp: now,
        intent: 'EXPORT_CANCEL',
        isSynthetic: true,
      };
      const updated = {
        ...this.appendMessages(session, userQuery, response, activeState, now),
        pendingExport: null,
      };
      return { updatedSession: updated, response };
    }

    if (classification.intent === 'EXPORT_REQUEST') {
      const preview = this.exportService.createExportPreview(
        session,
        effectiveCaller,
        session.lastCohortResult
      );

      const formattedPreview = this.formatter.formatExportPreview(preview);
      const response: AssistantMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: formattedPreview,
        timestamp: now,
        intent: 'EXPORT_REQUEST',
        structuredData: { exportPreview: preview },
        isSynthetic: true,
      };

      const updated = {
        ...this.appendMessages(session, userQuery, response, activeState, now),
        pendingExport: preview,
      };
      return { updatedSession: updated, response };
    }

    // 6. Clarification Flow: Responding to missing parameters
    if (session.pendingClarification && (classification.intent === 'CLARIFICATION_ANSWER' || classification.parsedFilter)) {
      let resolvedYear = session.confirmedYear;
      let resolvedDateBasis = session.confirmedDateBasis;

      const lower = userQuery.toLowerCase();
      if (/^(use defaults?|defaults?|standard)$/i.test(lower)) {
        resolvedYear = 2026;
        resolvedDateBasis = 'VISIT_DATE';
      } else {
        if (classification.parsedFilter?.year) {
          resolvedYear = classification.parsedFilter.year;
        }
        if (classification.parsedFilter?.dateBasis) {
          resolvedDateBasis = classification.parsedFilter.dateBasis;
        }
      }

      if (resolvedYear && resolvedDateBasis) {
        // Both parameters now resolved! Clear clarification and execute the pending cohort query
        const pendingQuery = session.pendingClarification.pendingFilter;
        const targetMonth = pendingQuery?.month ?? 'June';
        const targetOrphan = pendingQuery?.orphanCategory ?? 'SINGLE_ORPHAN';
        const targetSchool = pendingQuery?.schoolCategory ?? 'GOVERNMENT_SCHOOL';

        const { records, freshness } = this.dataAdapter.fetchAssessmentRecordsSync(effectiveCaller, {
          stateFilter: activeState,
        });

        const metrics = calculateCohortMetrics(
          effectiveCaller,
          records,
          {
            year: resolvedYear,
            month: targetMonth,
            dateBasis: resolvedDateBasis,
            orphanCategory: targetOrphan,
            schoolCategory: targetSchool,
            stateFilter: activeState,
          },
          freshness
        );

        const scopeTitle = activeState
          ? `in **${activeState}**`
          : effectiveCaller.permittedStates.includes('*')
          ? 'Nationally (All Authorized States)'
          : `in **${effectiveCaller.permittedStates.join(', ')}**`;

        const dateBasisLabel =
          resolvedDateBasis === 'VISIT_DATE' ? 'Visit-Date Basis' : 'Submission-Date Basis';

        const responseContent =
          `### ${targetMonth} Single-Orphan Children in Government School (${scopeTitle})\n\n` +
          `> **Evaluation Clarification & Accounting Basis:**\n` +
          `> * **Year:** **${resolvedYear}** (Confirmed evaluation calendar).\n` +
          `> * **Date Basis:** **${dateBasisLabel}**.\n` +
          `> * **Cohort Definition:** Orphan Status = \`${targetOrphan}\`. School Type = \`${targetSchool}\`.\n\n` +
          `#### Summary Metrics\n` +
          `* **Unique Beneficiaries:** **${metrics.uniqueBeneficiariesCount}** children\n` +
          `* **Total Assessments:** **${metrics.totalAssessmentsCount}** assessment events *(includes repeat assessments for active cases)*\n\n` +
          `#### Approval & Verification Status\n` +
          `* **Approved:** **${metrics.approvedAssessmentsCount}** assessments\n` +
          `* **Pending Supervisor Verification:** **${metrics.pendingAssessmentsCount}** assessments\n` +
          `* **Flagged / Audit Queries:** **${metrics.flaggedAssessmentsCount}** assessments\n` +
          `* **Rejected:** **${metrics.rejectedAssessmentsCount}** assessments\n\n` +
          `#### Data Quality & Missing-Value Treatment\n` +
          `* **Excluded due to Missing School Type:** **${metrics.recordsExcludedMissingSchool}** records\n` +
          `* **Excluded due to Missing Orphan Status:** **${metrics.recordsExcludedMissingOrphanStatus}** records\n\n` +
          `_Data Freshness: Synced ${freshness.lastSyncedAt} (${freshness.sourceVersion})_`;

        const response: AssistantMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: responseContent,
          timestamp: now,
          intent: 'JUNE_ORPHAN_SCHOOL_COHORT',
          structuredData: { cohortMetrics: metrics },
          isSynthetic: true,
        };

        const updated: ReportingSession = {
          ...this.appendMessages(session, userQuery, response, activeState, now),
          confirmedYear: resolvedYear,
          confirmedDateBasis: resolvedDateBasis,
          isConfirmedPolicy: true,
          pendingClarification: null,
          lastCohortResult: metrics,
        };
        return { updatedSession: updated, response };
      }
    }

    // 7. Detect if previous turns established an active cohort scenario
    const isScenarioQuery =
      classification.intent === 'JUNE_ORPHAN_SCHOOL_COHORT' ||
      classification.intent === 'COHORT_SURVEILLANCE' ||
      classification.intent === 'DISTRICT_BREAKDOWN' ||
      (classification.stateFilter !== null && this.wasInScenarioContext(session));

    let responseContent: string;
    let structuredData: Record<string, unknown> | undefined;
    let finalIntent: typeof classification.intent = classification.intent;

    // 8. Handle Intent Dispatches
    if (classification.intent === 'RESET_FILTERS') {
      activeState = null;
      const permittedScopeStr = effectiveCaller.permittedStates.includes('*')
        ? 'National Scope (All States)'
        : `Permitted States: [${effectiveCaller.permittedStates.join(', ')}]`;

      responseContent = `🔄 **Filters Reset**\n\nActive conversation filters have been cleared.\nAccess scope has been restored to your authorized caller boundary: **${permittedScopeStr}**.\n\n*(Note: Reset restores your permitted scope, not national scope automatically).*`;
      structuredData = { reset: true, restoredScope: effectiveCaller.permittedStates };
    } else if (isScenarioQuery) {
      finalIntent =
        classification.intent === 'DISTRICT_BREAKDOWN'
          ? 'DISTRICT_BREAKDOWN'
          : 'JUNE_ORPHAN_SCHOOL_COHORT';

      // Gap Check: If session policy is unconfirmed AND query didn't provide year/dateBasis, ASK for clarification!
      const queryYear = classification.parsedFilter?.year;
      const queryDateBasis = classification.parsedFilter?.dateBasis;

      const hasResolvedYear = queryYear !== undefined || (session.isConfirmedPolicy && session.confirmedYear !== undefined);
      const hasResolvedDateBasis = queryDateBasis !== undefined || (session.isConfirmedPolicy && session.confirmedDateBasis !== undefined);

      if (!hasResolvedYear || !hasResolvedDateBasis) {
        const promptText =
          `Before calculating the single-orphan government school cohort, please clarify:\n` +
          `1. **Calendar Year**: Which year would you like to evaluate (e.g., 2026 or 2025)?\n` +
          `2. **Date Accounting Basis**: Should we filter by **Visit Date** (in-person assessment date) or **Submission Date** (when the record was synced to central systems)?\n\n` +
          `*(Alternatively, reply 'use defaults' to proceed with Calendar Year 2026 on Visit-Date basis)*.`;

        const clarificationPrompt: ClarificationPrompt = {
          queryType: 'COHORT_SURVEILLANCE',
          missingYear: !hasResolvedYear,
          missingDateBasis: !hasResolvedDateBasis,
          promptText,
          pendingFilter: classification.parsedFilter,
        };

        const response: AssistantMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `❓ **Surveillance Scope Clarification**\n\n${promptText}`,
          timestamp: now,
          intent: 'CLARIFICATION_ANSWER',
          structuredData: { clarification: clarificationPrompt },
          isSynthetic: true,
        };

        const updated: ReportingSession = {
          ...this.appendMessages(session, userQuery, response, activeState, now),
          pendingClarification: clarificationPrompt,
        };
        return { updatedSession: updated, response };
      }

      const effectiveYear = queryYear ?? session.confirmedYear ?? 2026;
      const effectiveDateBasis = queryDateBasis ?? session.confirmedDateBasis ?? session.activeDateBasis;
      const effectiveMonth = classification.parsedFilter?.month ?? 'June';
      const effectiveOrphan = classification.parsedFilter?.orphanCategory ?? 'SINGLE_ORPHAN';
      const effectiveSchool = classification.parsedFilter?.schoolCategory ?? 'GOVERNMENT_SCHOOL';

      const { records, freshness } = this.dataAdapter.fetchAssessmentRecordsSync(effectiveCaller, {
        stateFilter: activeState,
      });

      const metrics = calculateCohortMetrics(
        effectiveCaller,
        records,
        {
          year: effectiveYear,
          month: effectiveMonth,
          dateBasis: effectiveDateBasis,
          orphanCategory: effectiveOrphan,
          schoolCategory: effectiveSchool,
          stateFilter: activeState,
        },
        freshness
      );

      structuredData = { cohortMetrics: metrics };
      const scopeTitle = activeState
        ? `in **${activeState}**`
        : effectiveCaller.permittedStates.includes('*')
        ? 'Nationally (All Authorized States)'
        : `in **${effectiveCaller.permittedStates.join(', ')}**`;

      let districtSection = '';
      if (classification.intent === 'DISTRICT_BREAKDOWN' || activeState) {
        if (metrics.districtBreakdown.length > 0) {
          const rows = metrics.districtBreakdown
            .map(
              (d) =>
                `| ${d.district} | ${d.uniqueBeneficiaries} | ${d.totalAssessments} | ${d.approvedAssessments} | ${d.pendingAssessments} | ${d.flaggedAssessments} |`
            )
            .join('\n');
          districtSection = `\n\n#### District Breakdown\n| District | Unique Children | Total Assessments | Approved | Pending | Flagged |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n${rows}`;
        } else {
          districtSection = `\n\n*No matching records in the selected geographic scope.*`;
        }
      }

      const dateBasisLabel =
        effectiveDateBasis === 'VISIT_DATE' ? 'Visit-Date Basis' : 'Submission-Date Basis';

      responseContent = `### ${effectiveMonth} Single-Orphan Children in Government School (${scopeTitle})

> **Evaluation Clarification & Accounting Basis:**
> * **Year:** **${effectiveYear}** (Synthetic evaluation calendar).
> * **Date Basis:** **${dateBasisLabel}** (tracks in-person assessment visits conducted in ${effectiveMonth} ${effectiveYear}). *Records synced in ${effectiveMonth} for May visits are excluded under this basis.*
> * **Cohort Definition:** Orphan Status = \`${effectiveOrphan}\` (maternal/paternal single-orphan; excluding double-orphan & non-orphan). School Type = \`${effectiveSchool}\` (excluding private, non-formal, and out-of-school).

#### Summary Metrics
* **Unique Beneficiaries:** **${metrics.uniqueBeneficiariesCount}** children
* **Total Assessments:** **${metrics.totalAssessmentsCount}** assessment events *(includes repeat assessments for active cases, e.g. CH-MH-01)*

#### Approval & Verification Status
* **Approved:** **${metrics.approvedAssessmentsCount}** assessments
* **Pending Supervisor Verification:** **${metrics.pendingAssessmentsCount}** assessments
* **Flagged / Audit Queries:** **${metrics.flaggedAssessmentsCount}** assessments
* **Rejected:** **${metrics.rejectedAssessmentsCount}** assessments

#### Data Quality & Missing-Value Treatment
* **Excluded due to Missing School Type:** **${metrics.recordsExcludedMissingSchool}** records *(flagged as incomplete for field revisits)*
* **Excluded due to Missing Orphan Status:** **${metrics.recordsExcludedMissingOrphanStatus}** records *(flagged as incomplete for field revisits)*${districtSection}

_Data Freshness: Synced ${freshness.lastSyncedAt} (${freshness.sourceVersion})_`;
    } else {
      switch (classification.intent) {
        case 'HELP_AND_CAPABILITIES': {
          responseContent = `### Leadership Reporting Assistant Capabilities\n\nI provide deterministic surveillance insights for programme leadership:\n\n* **Orphan & School Cohorts:** Query *"June single-orphan children in government school"* with drilldowns like *"Only Maharashtra"*, *"district-wise"*, and *"reset filters"*.\n* **Programme Overview:** Ask *"Show national overview"* or *"Madhya Pradesh KPIs"*.\n* **State Comparisons:** Ask *"Compare states"* for cross-state benchmarks.\n* **High-Risk Cohorts:** Ask *"List high-risk children"*.\n* **Data Exports:** Say *"Export report"* for two-phase delivery to your registered email.\n\n*Note: All operations are strictly read-only.*`;
          break;
        }

        case 'STATE_COMPARISON': {
          const { records } = this.dataAdapter.fetchNutritionRecordsSync(effectiveCaller);
          const comparisons = calculateStateComparison(records);
          structuredData = { comparisons };
          const rows = comparisons
            .map(
              (c) =>
                `| ${c.state} | ${c.enrolled} | ${c.recoveryRate}% | ${c.attendanceRate}% | ${c.samCount} | ${c.pendingApprovals} |`
            )
            .join('\n');

          responseContent = `### Cross-State Performance Comparison\n\n| State | Enrolled | Attendance Rate | Current SAM | Pending Approvals |\n| :--- | :--- | :--- | :--- | :--- |\n${rows}\n\n*Surveillance note: Longitudinal recovery tracking is scoped to established historical cohorts.*`;
          break;
        }

        case 'MALNUTRITION_SAM_FOCUS': {
          const { records } = this.dataAdapter.fetchNutritionRecordsSync(effectiveCaller, activeState);
          const kpi = calculateKpiSummary(records, activeState);
          structuredData = { kpi };
          const scope = activeState ? `in **${activeState}**` : 'Nationally';

          responseContent = `### Malnutrition Point-in-Time Surveillance (${scope})\n\n* **Severe Acute Malnutrition (SAM):** **${kpi.samCount}** (${kpi.samPercentage}% of enrolled)\n* **Moderate Acute Malnutrition (MAM):** **${kpi.mamCount}**\n* **Normal Nutrition:** **${kpi.normalCount}**\n* **Pending Verifications:** **${kpi.pendingVerifications}**\n\n*(Note: Longitudinal recovery rate is marked out-of-scope pending verified longitudinal multi-month fixture data).*`;
          break;
        }

        case 'VERIFICATION_QUEUE': {
          const { records } = this.dataAdapter.fetchNutritionRecordsSync(effectiveCaller, activeState);
          const pending = filterPendingApprovals(records, activeState);
          structuredData = { pendingCount: pending.length, records: pending };
          const scope = activeState ? `in **${activeState}**` : 'Across All States';

          if (pending.length === 0) {
            responseContent = `### Verification Queue (${scope})\n\nZero pending approvals. All submitted assessments have been audited.`;
          } else {
            const list = pending
              .map(
                (p) =>
                  `- **${p.childId}** (${p.state} - ${p.district}): Current grade **${p.nutritionCurrent}**, in programme ${p.daysInProgram} days`
              )
              .join('\n');
            responseContent = `### Pending Verification Queue (${scope})\n\nThere are **${pending.length}** records currently awaiting supervisor verification:\n\n${list}`;
          }
          break;
        }

        case 'HIGH_RISK_DROPOUT': {
          const { records } = this.dataAdapter.fetchNutritionRecordsSync(effectiveCaller, activeState);
          const highRisk = filterHighRiskCohorts(records, activeState);
          structuredData = { highRiskCount: highRisk.length, records: highRisk };
          const scope = activeState ? `in **${activeState}**` : 'Nationally';

          const list = highRisk
            .map(
              (r) =>
                `- **${r.childId}** (${r.state} - ${r.district}): Nutrition **${r.nutritionCurrent}**, Attendance **${r.attendance}**, Last visit: **${r.lastVisitDaysAgo} days ago**`
            )
            .join('\n');

          responseContent = `### High-Risk & Defaulted Cohort Report (${scope})\n\nIdentified **${highRisk.length}** children requiring immediate outreach:\n\n${list}`;
          break;
        }

        case 'OVERVIEW_KPI': {
          const { records, freshness } = this.dataAdapter.fetchNutritionRecordsSync(effectiveCaller, activeState);
          const kpi = calculateKpiSummary(records, activeState);
          structuredData = { kpi };
          const scope = activeState ? `for **${activeState}**` : 'National Executive Summary';

          responseContent = `### ${scope}\n\n* **Total Enrolled Children:** **${kpi.totalEnrolled}**\n* **Active Attendance Rate:** **${kpi.activeAttendanceRate}%** (${kpi.activeAttendanceCount} regular attendees)\n* **Active SAM Cases:** **${kpi.samCount}** (${kpi.samPercentage}%)\n* **Pending Supervisor Approvals:** **${kpi.pendingVerifications}**\n* **Flagged / Audit Concerns:** **${kpi.flaggedVerifications}**\n\n_Data Freshness: Synced ${freshness.lastSyncedAt} (${freshness.sourceVersion})_`;
          break;
        }

        case 'UNKNOWN_OR_OUT_OF_SCOPE':
        default: {
          // Strict Gap Closure: Unsupported phrasing must clarify, NOT silently return generic KPIs!
          finalIntent = 'UNKNOWN_OR_OUT_OF_SCOPE';
          responseContent =
            `❓ **Unsupported Phrasing / Query Clarification**\n\n` +
            `I could not match your request to an available surveillance report.\n\n` +
            `Supported surveillance requests include:\n` +
            `• **Cohort Surveillance:** *"June 2026 single-orphan children in government school on visit date basis"*\n` +
            `• **Geographic Filters:** *"Only Maharashtra"*, *"Show UP"*, *"district-wise"*\n` +
            `• **Executive Overview:** *"Show national overview"* or *"Madhya Pradesh KPIs"*\n` +
            `• **Cross-State Benchmarks:** *"Compare states"*\n` +
            `• **Data Export:** *"Export report"*\n\n` +
            `Could you please rephrase or specify the report you need?`;
          break;
        }
      }
    }

    const assistantMessage: AssistantMessage = {
      id: `msg_asst_${Date.now()}`,
      role: 'assistant',
      content: responseContent,
      timestamp: now,
      intent: finalIntent,
      structuredData,
      isSynthetic: true,
    };

    const updatedSession = this.appendMessages(session, userQuery, assistantMessage, activeState, now);

    return {
      updatedSession,
      response: assistantMessage,
    };
  }

  private wasInScenarioContext(session: ReportingSession): boolean {
    const recentAssistantMsgs = session.messages
      .filter((m) => m.role === 'assistant')
      .slice(-2);
    return recentAssistantMsgs.some(
      (m) =>
        m.intent === 'JUNE_ORPHAN_SCHOOL_COHORT' ||
        m.intent === 'COHORT_SURVEILLANCE' ||
        m.intent === 'DISTRICT_BREAKDOWN'
    );
  }

  private appendMessages(
    session: ReportingSession,
    userQuery: string,
    assistantMessage: AssistantMessage,
    activeState: string | null,
    timestamp: string
  ): ReportingSession {
    const userMessage: AssistantMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: userQuery,
      timestamp,
      isSynthetic: true,
    };

    return {
      ...session,
      activeStateFilter: activeState,
      messages: [...session.messages, userMessage, assistantMessage],
      updatedAt: timestamp,
    };
  }
}
