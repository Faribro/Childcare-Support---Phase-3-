import { IntentClassification, QueryIntent } from './types';

/**
 * Intent router and security parser for the Leadership Reporting Assistant.
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

export function classifyQueryIntent(query: string): IntentClassification {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const stateFilter = extractStateFilter(trimmed);

  // 1. Guardrail: Mutation attempt rejection
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

  // 2. Guardrail: PII / Clinical disclosure attempt rejection
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

  // 3. Help / Capabilities
  if (/^(hi|hello|help|who are you|what can you do|capabilities)\b/i.test(lower)) {
    return {
      intent: 'HELP_AND_CAPABILITIES',
      stateFilter,
      confidence: 0.95,
      rawQuery: trimmed,
    };
  }

  // 4. State Comparison
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

  // 5. Malnutrition / SAM Focus
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

  // 6. Verification / Approval Queue
  if (/\b(verification|pending|approval|queue|unverified|flagged)\b/i.test(lower)) {
    return {
      intent: 'VERIFICATION_QUEUE',
      stateFilter,
      confidence: 0.9,
      rawQuery: trimmed,
    };
  }

  // 7. High Risk / Dropouts
  if (/\b(high risk|dropout|defaulted|absent|attendance|missed visits|irregular)\b/i.test(lower)) {
    return {
      intent: 'HIGH_RISK_DROPOUT',
      stateFilter,
      confidence: 0.9,
      rawQuery: trimmed,
    };
  }

  // 8. General KPI Overview
  if (
    /\b(overview|summary|kpi|metrics|total enrolled|how many|status|dashboard|report)\b/i.test(
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

  // Fallback
  return {
    intent: 'UNKNOWN_OR_OUT_OF_SCOPE',
    stateFilter,
    confidence: 0.5,
    rawQuery: trimmed,
  };
}
