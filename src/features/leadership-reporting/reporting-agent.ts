import {
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
  extractStateFilter,
} from './intent-router';
import {
  SYNTHETIC_EVALUATION_DATASET,
  SYNTHETIC_JUNE_ASSESSMENT_DATASET,
} from './synthetic-dataset';
import {
  AssistantMessage,
  CallerSecurityContext,
  DateBasis,
  IntentClassifierProvider,
  ReportingSession,
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
 *    computed from local synthetic fixtures.
 */

export class LeadershipReportingAgent {
  private readonly nutritionRecords: readonly SyntheticChildRecord[];
  private readonly assessmentRecords: readonly SyntheticAssessmentRecord[];
  private readonly classifier: IntentClassifierProvider;

  constructor(
    nutritionRecords: readonly SyntheticChildRecord[] = SYNTHETIC_EVALUATION_DATASET,
    assessmentRecords: readonly SyntheticAssessmentRecord[] = SYNTHETIC_JUNE_ASSESSMENT_DATASET,
    classifier: IntentClassifierProvider = new DeterministicRuleIntentClassifier()
  ) {
    this.nutritionRecords = nutritionRecords;
    this.assessmentRecords = assessmentRecords;
    this.classifier = classifier;
  }

  public createSession(
    sessionId: string = `sess_${Date.now()}`,
    caller: CallerSecurityContext = {
      userId: 'usr_leadership_01',
      role: 'LEADERSHIP',
      permittedStates: ['*'],
    }
  ): ReportingSession {
    const now = new Date().toISOString();
    return {
      sessionId,
      ownerUserId: caller.userId,
      callerScope: caller,
      activeStateFilter: null,
      activeDateBasis: 'VISIT_DATE',
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
      // Validate caller permission for this state
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

    // 5. Detect if previous turns established an active cohort scenario
    const isScenarioQuery =
      classification.intent === 'JUNE_ORPHAN_SCHOOL_COHORT' ||
      classification.intent === 'DISTRICT_BREAKDOWN' ||
      (classification.stateFilter !== null && this.wasInScenarioContext(session));

    let responseContent: string;
    let structuredData: Record<string, unknown> | undefined;
    let finalIntent: typeof classification.intent = classification.intent;

    // 6. Handle Intent Dispatches
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

      const metrics = calculateJuneCohortMetrics(effectiveCaller, this.assessmentRecords, {
        stateFilter: activeState,
        dateBasis: session.activeDateBasis,
        year: 2026,
      });

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

      responseContent = `### June Single-Orphan Children in Government School (${scopeTitle})

> **Evaluation Clarification & Accounting Basis:**
> * **Year:** **2026** (Synthetic evaluation calendar).
> * **Date Basis:** **Visit-Date Basis** (tracks in-person assessment visits conducted in June 2026). *Records synced in June for May visits are excluded under this basis.*
> * **Cohort Definition:** Orphan Status = \`SINGLE_ORPHAN\` (maternal/paternal single-orphan; excluding double-orphan & non-orphan). School Type = \`GOVERNMENT_SCHOOL\` (excluding private, non-formal, and out-of-school).

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

*Deterministic calculation from synthetic local evaluation fixtures.*`;
    } else {
      switch (classification.intent) {
        case 'HELP_AND_CAPABILITIES': {
          responseContent = `### Leadership Reporting Assistant Capabilities\n\nI provide deterministic surveillance insights for programme leadership:\n\n* **Orphan & School Cohorts:** Query *"June single-orphan children in government school"* with drilldowns like *"Only Maharashtra"*, *"district-wise"*, and *"reset filters"*.\n* **Programme Overview:** Ask *"Show national overview"* or *"Madhya Pradesh KPIs"*.\n* **State Comparisons:** Ask *"Compare states"* for cross-state benchmarks.\n* **High-Risk Cohorts:** Ask *"List high-risk children"*.\n\n*Note: All data is synthetic and operations are strictly read-only.*`;
          break;
        }

        case 'STATE_COMPARISON': {
          const comparisons = calculateStateComparison(this.nutritionRecords);
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
          const kpi = calculateKpiSummary(this.nutritionRecords, activeState);
          structuredData = { kpi };
          const scope = activeState ? `in **${activeState}**` : 'Nationally';

          responseContent = `### Malnutrition Point-in-Time Surveillance (${scope})\n\n* **Severe Acute Malnutrition (SAM):** **${kpi.samCount}** (${kpi.samPercentage}% of enrolled)\n* **Moderate Acute Malnutrition (MAM):** **${kpi.mamCount}**\n* **Normal Nutrition:** **${kpi.normalCount}**\n* **Pending Verifications:** **${kpi.pendingVerifications}**\n\n*(Note: Longitudinal recovery rate is marked out-of-scope pending verified longitudinal multi-month fixture data).*`;
          break;
        }

        case 'VERIFICATION_QUEUE': {
          const pending = filterPendingApprovals(this.nutritionRecords, activeState);
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
          const highRisk = filterHighRiskCohorts(this.nutritionRecords, activeState);
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

        case 'OVERVIEW_KPI':
        default: {
          const kpi = calculateKpiSummary(this.nutritionRecords, activeState);
          structuredData = { kpi };
          const scope = activeState ? `for **${activeState}**` : 'National Executive Summary';

          responseContent = `### ${scope}\n\n* **Total Enrolled Children:** **${kpi.totalEnrolled}**\n* **Active Attendance Rate:** **${kpi.activeAttendanceRate}%** (${kpi.activeAttendanceCount} regular attendees)\n* **Active SAM Cases:** **${kpi.samCount}** (${kpi.samPercentage}%)\n* **Pending Supervisor Approvals:** **${kpi.pendingVerifications}**\n* **Flagged / Audit Concerns:** **${kpi.flaggedVerifications}**\n\n*Deterministic calculation from synthetic local evaluation fixtures.*`;
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
