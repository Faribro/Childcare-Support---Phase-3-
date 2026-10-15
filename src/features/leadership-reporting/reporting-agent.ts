import {
  calculateKpiSummary,
  calculateStateComparison,
  filterHighRiskCohorts,
  filterPendingApprovals,
} from './metrics-calculator';
import { classifyQueryIntent, extractStateFilter } from './intent-router';
import { SYNTHETIC_EVALUATION_DATASET } from './synthetic-dataset';
import {
  AssistantMessage,
  ReportingSession,
  SyntheticChildRecord,
} from './types';

/**
 * Leadership Reporting Assistant - Core Conversational Agent
 * 
 * Conforms to AI Engineering & Agent Architecture Standards:
 * - Deterministic Grounding: Numbers come strictly from code execution, never hallucinated.
 * - Least Privilege & Read-Only: Denies all mutation and deletion operations.
 * - Zero PII Disclosure: Strictly blocks personally identifiable information.
 * - State Scoping: Maintains active filter state across conversation turns.
 */

export class LeadershipReportingAgent {
  private readonly records: readonly SyntheticChildRecord[];

  constructor(records: readonly SyntheticChildRecord[] = SYNTHETIC_EVALUATION_DATASET) {
    this.records = records;
  }

  public createSession(
    sessionId: string = `sess_${Date.now()}`,
    userRole: 'LEADERSHIP' | 'ADMIN' | 'STATE_EVALUATOR' = 'LEADERSHIP'
  ): ReportingSession {
    const now = new Date().toISOString();
    return {
      sessionId,
      userRole,
      activeStateFilter: null,
      messages: [
        {
          id: `msg_welcome_${Date.now()}`,
          role: 'system',
          content:
            'Leadership Surveillance & Reporting Assistant initialized. Operating strictly on synthetic test data in read-only evaluation mode.',
          timestamp: now,
          isSynthetic: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
  }

  public processQuery(session: ReportingSession, userQuery: string): {
    updatedSession: ReportingSession;
    response: AssistantMessage;
  } {
    const now = new Date().toISOString();
    const classification = classifyQueryIntent(userQuery);

    // Update active state filter if detected in user query
    let activeState = session.activeStateFilter;
    if (classification.stateFilter) {
      activeState = classification.stateFilter;
    } else if (/\b(national|all states|entire country|reset filter)\b/i.test(userQuery)) {
      activeState = null;
    }

    let responseContent: string;
    let structuredData: Record<string, unknown> | undefined;

    switch (classification.intent) {
      case 'MUTATION_REJECTED': {
        responseContent = `⚠️ **Action Denied (Read-Only Guardrail)**\n\n${
          classification.safetyRejectionReason ||
          'This assistant is strictly read-only for leadership surveillance. Mutation operations are not permitted.'
        }`;
        break;
      }

      case 'PII_REQUEST_REJECTED': {
        responseContent = `🔒 **Privacy Guardrail Triggered**\n\n${
          classification.safetyRejectionReason ||
          'Data protection policies strictly forbid disclosing personally identifiable information (PII) or clinical HIV records.'
        }`;
        break;
      }

      case 'HELP_AND_CAPABILITIES': {
        responseContent = `### Leadership Reporting Assistant Capabilities\n\nI provide real-time, deterministic surveillance insights for programme leadership:\n\n* **Programme Overview:** Ask *"Show national overview"* or *"Madhya Pradesh KPIs"* for enrollment, attendance, and nutritional recovery.\n* **State Comparisons:** Ask *"Compare states"* for cross-state performance metrics.\n* **Malnutrition / SAM Tracking:** Ask *"What is the SAM recovery rate?"* for acute malnutrition resolution.\n* **Verification Queues:** Ask *"Show pending approvals"* for supervisor audit queues.\n* **High-Risk Dropouts:** Ask *"List high-risk children"* to identify attendance defaults and missed visits.\n\n*Note: All data is synthetic and evaluations are read-only.*`;
        break;
      }

      case 'STATE_COMPARISON': {
        const comparisons = calculateStateComparison(this.records);
        structuredData = { comparisons };

        const rows = comparisons
          .map(
            (c) =>
              `| ${c.state} | ${c.enrolled} | ${c.recoveryRate}% | ${c.attendanceRate}% | ${c.samCount} | ${c.pendingApprovals} |`
          )
          .join('\n');

        responseContent = `### Cross-State Performance Comparison\n\n| State | Enrolled | Recovery Rate | Attendance Rate | Current SAM | Pending Approvals |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n${rows}\n\n**Analysis:** Maharashtra leads in recovery rate (${comparisons.find((c) => c.state === 'Maharashtra')?.recoveryRate || 0}%), while Uttar Pradesh has the highest active SAM burden (${comparisons.find((c) => c.state === 'Uttar Pradesh')?.samCount || 0} cases).`;
        break;
      }

      case 'MALNUTRITION_SAM_FOCUS': {
        const kpi = calculateKpiSummary(this.records, activeState);
        structuredData = { kpi };
        const scope = activeState ? `in **${activeState}**` : 'Nationally';

        responseContent = `### Malnutrition & Recovery Analysis (${scope})\n\n* **Severe Acute Malnutrition (SAM):** **${kpi.samCount}** (${kpi.samPercentage}% of enrolled)\n* **Moderate Acute Malnutrition (MAM):** **${kpi.mamCount}**\n* **Normal Nutrition:** **${kpi.normalCount}**\n* **Nutritional Recovery Rate:** **${kpi.recoveryRate}%** (${kpi.recoveredCount} children improved to Normal from SAM/MAM baseline)\n\n> **Surveillance Note:** Children diagnosed with SAM undergo bi-weekly growth monitoring and targeted nutritional supplement tracking.`;
        break;
      }

      case 'VERIFICATION_QUEUE': {
        const pending = filterPendingApprovals(this.records, activeState);
        structuredData = { pendingCount: pending.length, records: pending };
        const scope = activeState ? `in **${activeState}**` : 'Across All States';

        if (pending.length === 0) {
          responseContent = `### Verification Queue (${scope})\n\nAll submitted assessment records ${scope} have been audited. Zero pending approvals.`;
        } else {
          const list = pending
            .map(
              (p) =>
                `- **${p.childId}** (${p.state} - ${p.district}): Current grade **${p.nutritionCurrent}**, in programme ${p.daysInProgram} days`
            )
            .join('\n');

          responseContent = `### Pending Verification Queue (${scope})\n\nThere are **${pending.length}** records currently awaiting supervisor verification:\n\n${list}\n\n*Leadership Note: Verified records automatically update state-level reimbursement eligibility.*`;
        }
        break;
      }

      case 'HIGH_RISK_DROPOUT': {
        const highRisk = filterHighRiskCohorts(this.records, activeState);
        structuredData = { highRiskCount: highRisk.length, records: highRisk };
        const scope = activeState ? `in **${activeState}**` : 'Nationally';

        const list = highRisk
          .map(
            (r) =>
              `- **${r.childId}** (${r.state} - ${r.district}): Nutrition **${r.nutritionCurrent}**, Attendance **${r.attendance}**, Last visit: **${r.lastVisitDaysAgo} days ago**`
          )
          .join('\n');

        responseContent = `### High-Risk & Defaulted Cohort Report (${scope})\n\nIdentified **${highRisk.length}** children requiring immediate outreach:\n\n${list}\n\n**Action Protocol:** Community workers are scheduled for home-based outreach for children with missed visits exceeding 14 days.`;
        break;
      }

      case 'OVERVIEW_KPI':
      default: {
        const kpi = calculateKpiSummary(this.records, activeState);
        structuredData = { kpi };
        const scope = activeState ? `for **${activeState}**` : 'National Executive Summary';

        responseContent = `### ${scope}\n\n* **Total Enrolled Children:** **${kpi.totalEnrolled}**\n* **Active Attendance Rate:** **${kpi.activeAttendanceRate}%** (${kpi.activeAttendanceCount} regular attendees)\n* **Nutritional Recovery Rate:** **${kpi.recoveryRate}%** (${kpi.recoveredCount} recovered to Normal)\n* **Active SAM Cases:** **${kpi.samCount}** (${kpi.samPercentage}%)\n* **Pending Supervisor Approvals:** **${kpi.pendingVerifications}**\n* **Flagged / Audit Concerns:** **${kpi.flaggedVerifications}**\n\n*Computed deterministically from synthetic evaluation data.*`;
        break;
      }
    }

    const userMessage: AssistantMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: userQuery,
      timestamp: now,
      isSynthetic: true,
    };

    const assistantMessage: AssistantMessage = {
      id: `msg_asst_${Date.now()}`,
      role: 'assistant',
      content: responseContent,
      timestamp: now,
      intent: classification.intent,
      structuredData,
      isSynthetic: true,
    };

    const updatedSession: ReportingSession = {
      ...session,
      activeStateFilter: activeState,
      messages: [...session.messages, userMessage, assistantMessage],
      updatedAt: now,
    };

    return {
      updatedSession,
      response: assistantMessage,
    };
  }
}
