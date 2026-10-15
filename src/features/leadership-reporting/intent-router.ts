import {
  CallerSecurityContext,
  IntentClassification,
  IntentClassifierProvider,
  QueryIntent,
} from './types';

/**
 * Intent router and security parser for the Leadership Reporting Assistant.
 *
 * INTERPRETATION BOUNDARY:
 * - This classifier uses DETERMINISTIC RULES and Regular Expressions.
 * - It is NOT a live LLM model or general semantic natural-language understanding engine.
 * - It implements the `IntentClassifierProvider` interface so that an evaluation mock
 *   or live LLM provider can be swapped in without altering agent logic.
 */

const STATE_MAPPINGS: Record<string, string> = {
  mp: 'Madhya Pradesh',
  'madhya pradesh': 'Madhya Pradesh',
  up: 'Uttar Pradesh',
  'uttar pradesh': 'Uttar Pradesh',
  mh: 'Maharashtra',
  maharashtra: 'Maharashtra',
};

const MUTATION_PATTERNS = [
  /\b(delete|drop|remove|erase|truncate)\b/i,
  /\b(update|modify|edit|alter|set)\b/i,
  /\b(insert|create|add new record)\b/i,
  /\b(approve record|reject record|mutate)\b/i,
];

const INJECTION_PATTERNS = [
  /\b(ignore (all )?prior|ignore (all )?previous instructions)\b/i,
  /\b(system prompt|reveal (internal|system)|unrestricted ai|jailbreak|you are now)\b/i,
  /\b(dan mode|developer mode|disregard guidelines)\b/i,
];

const PII_PATTERNS = [
  /\b(phone|mobile|telephone|call)\b/i,
  /\b(address|location|home|village|street)\b/i,
  /\b(aadhaar|identity card|id proof|passport)\b/i,
  /\b(parent name|mother name|father name|caregiver name)\b/i,
  /\b(hiv|art number|clinical|viral load|diagnosis)\b/i,
];

export function extractStateFilter(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [key, canonical] of Object.entries(STATE_MAPPINGS)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(lower)) {
      return canonical;
    }
  }
  return null;
}

export function classifyQueryIntent(
  query: string,
  caller?: CallerSecurityContext
): IntentClassification {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const stateFilter = extractStateFilter(trimmed);

  // 1. Guardrail: Mutation attempt rejection (Supplementary keyword defense)
  for (const pattern of MUTATION_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        intent: 'MUTATION_REJECTED',
        stateFilter,
        confidence: 1.0,
        rawQuery: trimmed,
        safetyRejectionReason:
          'This assistant is strictly read-only for leadership surveillance. Record edits or approvals must be conducted via the authorized supervisor workflow.',
      };
    }
  }

  // 2. Guardrail: Prompt injection and jailbreak attempt rejection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        intent: 'MUTATION_REJECTED',
        stateFilter,
        confidence: 1.0,
        rawQuery: trimmed,
        safetyRejectionReason:
          'Action Denied: Prompt injection, role hijacking, or system extraction attempts are blocked by safety guardrails.',
      };
    }
  }

  // 3. Guardrail: PII / Clinical disclosure attempt rejection
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        intent: 'PII_REQUEST_REJECTED',
        stateFilter,
        confidence: 1.0,
        rawQuery: trimmed,
        safetyRejectionReason:
          'Data protection policy strictly forbids disclosing personally identifiable information (PII) or clinical data in reporting dialogues.',
      };
    }
  }

  // 4. Authorization check: If caller scope is provided and cannot access requested state
  if (caller && stateFilter) {
    const isNational = caller.permittedStates.includes('*');
    const isPermitted = caller.permittedStates
      .map((s) => s.toLowerCase())
      .includes(stateFilter.toLowerCase());
    if (!isNational && !isPermitted) {
      return {
        intent: 'AUTHORIZATION_DENIED',
        stateFilter,
        confidence: 1.0,
        rawQuery: trimmed,
        authorizationDenialReason: `Scope Denied: Caller '${caller.userId}' (${caller.role}) is unauthorized for '${stateFilter}'. Permitted states: [${caller.permittedStates.join(', ')}].`,
      };
    }
  }

  // 5. Reset Filters
  if (/^(reset|clear|remove) (filters?|filter|scope|all)$/i.test(lower) || /^reset$/i.test(lower)) {
    return {
      intent: 'RESET_FILTERS',
      stateFilter: null,
      confidence: 1.0,
      rawQuery: trimmed,
    };
  }

  // 6. Export Confirmations & Cancellations
  if (/^(confirm export|confirm|yes export|approve export)$/i.test(lower)) {
    return {
      intent: 'EXPORT_CONFIRM',
      stateFilter,
      confidence: 1.0,
      rawQuery: trimmed,
    };
  }

  if (/^(cancel export|cancel|discard export|no export)$/i.test(lower)) {
    return {
      intent: 'EXPORT_CANCEL',
      stateFilter,
      confidence: 1.0,
      rawQuery: trimmed,
    };
  }

  // 7. Export Requests
  if (
    /\b(export report|export data|email me the report|email report|send export|download report|export)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'EXPORT_REQUEST',
      stateFilter,
      confidence: 0.95,
      rawQuery: trimmed,
    };
  }

  // 8. Clarification Answers (e.g. "2026, visit date", "use defaults", "visit date", "2026")
  if (
    /^(use defaults?|defaults?|standard)$/i.test(lower) ||
    /^(\d{4})[, ]+(visit[- ]date|submission[- ]date|visit|submission)$/i.test(lower) ||
    /^(visit[- ]date|submission[- ]date|visit basis|submission basis)$/i.test(lower) ||
    /^(\d{4})$/i.test(lower)
  ) {
    const parsedFilter = extractCohortFilter(trimmed);
    return {
      intent: 'CLARIFICATION_ANSWER',
      stateFilter,
      parsedFilter,
      confidence: 0.95,
      rawQuery: trimmed,
    };
  }

  // 9. District Breakdown
  if (/\b(district[- ]wise|by district|districts? breakdown|across districts?)\b/i.test(lower)) {
    return {
      intent: 'DISTRICT_BREAKDOWN',
      stateFilter,
      confidence: 0.95,
      rawQuery: trimmed,
    };
  }

  // 10. Cohort Surveillance: "June single-orphan children in government school" or generic cohort
  const hasOrphanPattern = /\b(single[- ]orphan|double[- ]orphan|orphan)\b/i.test(lower);
  const hasSchoolPattern = /\b(government school|gov school|private school|school)\b/i.test(lower);
  const hasMonthPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(lower);

  if (
    (hasOrphanPattern && hasSchoolPattern) ||
    (hasMonthPattern && (hasOrphanPattern || hasSchoolPattern))
  ) {
    const parsedFilter = extractCohortFilter(trimmed);
    const isJuneCohort =
      (!parsedFilter.month || parsedFilter.month.toLowerCase() === 'june') &&
      (!parsedFilter.orphanCategory || parsedFilter.orphanCategory === 'SINGLE_ORPHAN') &&
      (!parsedFilter.schoolCategory || parsedFilter.schoolCategory === 'GOVERNMENT_SCHOOL');

    return {
      intent: isJuneCohort ? 'JUNE_ORPHAN_SCHOOL_COHORT' : 'COHORT_SURVEILLANCE',
      stateFilter,
      parsedFilter,
      confidence: 0.95,
      rawQuery: trimmed,
    };
  }

  // 11. Help / Capabilities
  if (/^(hi|hello|help|who are you|what can you do|capabilities)\b/i.test(lower)) {
    return {
      intent: 'HELP_AND_CAPABILITIES',
      stateFilter,
      confidence: 0.95,
      rawQuery: trimmed,
    };
  }

  // 12. State Comparison
  if (
    /\b(compare|state breakdown|by state|cross-state|across states|which state|ranking)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'STATE_COMPARISON',
      stateFilter,
      confidence: 0.9,
      rawQuery: trimmed,
    };
  }

  // 13. Malnutrition / SAM Focus
  if (
    /\b(sam|mam|malnutrition|nutritional recovery|severe acute|recovered|recovery rate)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'MALNUTRITION_SAM_FOCUS',
      stateFilter,
      confidence: 0.9,
      rawQuery: trimmed,
    };
  }

  // 14. Verification / Approval Queue
  if (/\b(verification|pending|approval|queue|unverified|flagged)\b/i.test(lower)) {
    return {
      intent: 'VERIFICATION_QUEUE',
      stateFilter,
      confidence: 0.9,
      rawQuery: trimmed,
    };
  }

  // 15. High Risk / Dropouts
  if (/\b(high risk|dropout|defaulted|absent|attendance|missed visits|irregular)\b/i.test(lower)) {
    return {
      intent: 'HIGH_RISK_DROPOUT',
      stateFilter,
      confidence: 0.9,
      rawQuery: trimmed,
    };
  }

  // 16. State-Only Scoping Query (e.g. "Only Maharashtra", "Maharashtra", "Show UP")
  if (
    stateFilter &&
    (/^only\s+/i.test(lower) ||
      /^(show\s+)?(maharashtra|mp|up|madhya pradesh|uttar pradesh)$/i.test(lower))
  ) {
    return {
      intent: 'OVERVIEW_KPI',
      stateFilter,
      confidence: 0.9,
      rawQuery: trimmed,
    };
  }

  // 17. General KPI Overview (explicit keywords only)
  if (
    /\b(overview|summary|kpi|metrics|total enrolled|how many enrolled|status overview|dashboard)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'OVERVIEW_KPI',
      stateFilter,
      confidence: 0.85,
      rawQuery: trimmed,
    };
  }

  // Fallback: Unsupported or unrecognized phrasing MUST NOT return KPIs
  return {
    intent: 'UNKNOWN_OR_OUT_OF_SCOPE',
    stateFilter,
    confidence: 0.0,
    rawQuery: trimmed,
  };
}

export function extractCohortFilter(query: string): import('./types').CohortFilterQuery {
  const lower = query.toLowerCase();

  // Year: e.g. 2026, 2025
  const yearMatch = lower.match(/\b(202[0-9])\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  // Month
  let month: string | undefined = undefined;
  const monthMatch = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (monthMatch) {
    const raw = monthMatch[1].toLowerCase();
    month = raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // Date Basis
  let dateBasis: import('./types').DateBasis | undefined = undefined;
  if (/\b(visit[- ]date|visit basis|on visit date|visit)\b/i.test(lower)) {
    dateBasis = 'VISIT_DATE';
  } else if (
    /\b(submission[- ]date|submission basis|on submission date|submission|sync date)\b/i.test(lower)
  ) {
    dateBasis = 'SUBMISSION_DATE';
  }

  // Orphan category
  let orphanCategory: import('./types').OrphanCategory | 'ALL' | undefined = undefined;
  if (/\b(single[- ]orphan)\b/i.test(lower)) {
    orphanCategory = 'SINGLE_ORPHAN';
  } else if (/\b(double[- ]orphan)\b/i.test(lower)) {
    orphanCategory = 'DOUBLE_ORPHAN';
  } else if (/\b(non[- ]orphan)\b/i.test(lower)) {
    orphanCategory = 'NON_ORPHAN';
  }

  // School category
  let schoolCategory: import('./types').SchoolCategory | 'ALL' | undefined = undefined;
  if (/\b(government school|gov school)\b/i.test(lower)) {
    schoolCategory = 'GOVERNMENT_SCHOOL';
  } else if (/\b(private school)\b/i.test(lower)) {
    schoolCategory = 'PRIVATE_SCHOOL';
  }

  const stateFilter = extractStateFilter(query);

  return {
    year,
    month,
    dateBasis,
    orphanCategory,
    schoolCategory,
    stateFilter,
  };
}

export class DeterministicRuleIntentClassifier implements IntentClassifierProvider {
  readonly providerType = 'DETERMINISTIC_RULES' as const;

  classify(query: string, context?: Record<string, unknown>): IntentClassification {
    const caller = context?.caller as CallerSecurityContext | undefined;
    return classifyQueryIntent(query, caller);
  }
}

