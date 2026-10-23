/**
 * Shared HIV Viral Load Result and Suppression Policy
 *
 * Implements NACO and WHO viral load reporting and suppression derivation rules.
 * Evaluated symmetrically in client-side forms and server-side ingestion adapters.
 *
 * Reused Domain Fields:
 * - vlStatus: Availability & timing of test ('Tested in last 6 months' | 'Tested > 6 months ago' | 'Awaiting results' | 'Not tested')
 * - vlDate: Date of specimen collection / lab reporting
 * - viralLoad: Verbatim laboratory report string (numeric, qualified, or textual)
 * - vlCategory: Derived suppression classification
 *
 * Key Clinical Principles:
 * - Separation of Test Status, Reported Lab Value, and Derived Classification.
 * - Missing or unknown laboratory values must NEVER become zero.
 * - Genuine reported zero (0 copies/mL) is distinct from missing/unknown.
 * - Qualified inputs (<20, <50, <1000) are evaluated by bound, NEVER coerced via parseFloat.
 * - Preservation of verbatim laboratory assay text.
 */

import { VLCategory, VLStatus } from '../../types/domain';

export type PolicyVersion = 'NACO_2021' | 'WHO_2021';
export type ThresholdBoundaryMode = 'NACO_STRICT_LESS_THAN' | 'WHO_LESS_OR_EQUAL';

export interface ViralLoadPolicyInput {
  viralLoad?: string | number | null;
  vlStatus?: VLStatus | string | null;
  policyVersion?: PolicyVersion;
  thresholdBoundary?: ThresholdBoundaryMode;
}

export type ClassificationConfidence = 'DEFINITIVE' | 'INDETERMINATE' | 'NOT_APPLICABLE';

export interface VLCategoryPolicyResult {
  vlCategory: VLCategory;
  displayBadge: string;
  isSuppressed: boolean;
  isUnsuppressed: boolean;
  isUndetectable: boolean;
  isPending: boolean;
  isNotTested: boolean;
  confidence: ClassificationConfidence;
  rawReportedValue: string;
  boundType?: '<' | '<=' | '>' | '>=' | '=';
  boundValue?: number;
  reason: string;
  policyVersion: PolicyVersion;
  thresholdBoundary: ThresholdBoundaryMode;
}

export const VIRAL_LOAD_POLICY_METADATA = {
  nacoThreshold: 1000,
  undetectableThreshold: 50,
  defaultPolicy: 'NACO_2021' as PolicyVersion,
  defaultBoundary: 'NACO_STRICT_LESS_THAN' as ThresholdBoundaryMode,
  resolvedBoundaryExplanation:
    'NACO National Guidelines define viral suppression as < 1000 copies/mL and non-suppression as ≥ 1000 copies/mL. Exactly 1000 copies/mL is classified as Unsuppressed (≥1000 copies/mL). 999 copies/mL is Suppressed (<1000 copies/mL).',
} as const;

/**
 * Shared, versioned policy function for deriving viral load suppression category.
 */
export function classifyVLCategoryPolicy(input: ViralLoadPolicyInput): VLCategoryPolicyResult {
  const policyVersion = input.policyVersion || VIRAL_LOAD_POLICY_METADATA.defaultPolicy;
  const thresholdBoundary = input.thresholdBoundary || VIRAL_LOAD_POLICY_METADATA.defaultBoundary;

  const rawStatus = (input.vlStatus || '').trim();
  const rawVL = input.viralLoad !== undefined && input.viralLoad !== null ? String(input.viralLoad).trim() : '';

  // 1. Check Test Status Availability
  if (rawStatus === 'Not tested') {
    return {
      vlCategory: 'Unknown / Pending',
      displayBadge: 'Not Tested',
      isSuppressed: false,
      isUnsuppressed: false,
      isUndetectable: false,
      isPending: false,
      isNotTested: true,
      confidence: 'NOT_APPLICABLE',
      rawReportedValue: rawVL,
      reason: 'No viral load test performed. Suppression classification not applicable.',
      policyVersion,
      thresholdBoundary,
    };
  }

  if (rawStatus === 'Awaiting results') {
    return {
      vlCategory: 'Unknown / Pending',
      displayBadge: 'Awaiting Results',
      isSuppressed: false,
      isUnsuppressed: false,
      isUndetectable: false,
      isPending: true,
      isNotTested: false,
      confidence: 'NOT_APPLICABLE',
      rawReportedValue: rawVL,
      reason: 'Sample collected; laboratory result is pending.',
      policyVersion,
      thresholdBoundary,
    };
  }

  // 2. Check for Missing / Empty Laboratory Input
  if (!rawVL) {
    return {
      vlCategory: 'Unknown / Pending',
      displayBadge: 'Pending Result',
      isSuppressed: false,
      isUnsuppressed: false,
      isUndetectable: false,
      isPending: true,
      isNotTested: false,
      confidence: 'INDETERMINATE',
      rawReportedValue: '',
      reason: 'Missing viral load laboratory result.',
      policyVersion,
      thresholdBoundary,
    };
  }

  const lowerVL = rawVL.toLowerCase();

  // 3. Explicit "Not Detected" / "Target Not Detected" / "TND"
  if (
    lowerVL === 'tnd' ||
    lowerVL === 'target not detected' ||
    lowerVL === 'not detected' ||
    lowerVL === 'undetectable' ||
    lowerVL.includes('not detect') ||
    lowerVL.includes('undetect')
  ) {
    return {
      vlCategory: 'Undetectable (<50 copies/mL)',
      displayBadge: 'Undetectable (<50 copies/mL)',
      isSuppressed: true,
      isUnsuppressed: false,
      isUndetectable: true,
      isPending: false,
      isNotTested: false,
      confidence: 'DEFINITIVE',
      rawReportedValue: rawVL,
      boundType: '<',
      boundValue: 50,
      reason: 'Assay report explicitly confirms target not detected / undetectable viral load.',
      policyVersion,
      thresholdBoundary,
    };
  }

  // 4. Qualified Values (e.g. "< 50", "<20", "< 1000", "> 1000")
  const qualifiedMatch = lowerVL.match(/^([<>≤≥]=?)\s*([0-9]+(?:\.[0-9]+)?)$/);
  if (qualifiedMatch) {
    const operator = qualifiedMatch[1];
    const bound = parseFloat(qualifiedMatch[2]);

    if (isNaN(bound) || bound < 0) {
      return {
        vlCategory: 'Unknown / Pending',
        displayBadge: 'Invalid Result',
        isSuppressed: false,
        isUnsuppressed: false,
        isUndetectable: false,
        isPending: false,
        isNotTested: false,
        confidence: 'INDETERMINATE',
        rawReportedValue: rawVL,
        reason: 'Malformed qualified viral load measurement.',
        policyVersion,
        thresholdBoundary,
      };
    }

    if (operator === '<' || operator === '<=' || operator === '≤') {
      if (bound <= 50) {
        return {
          vlCategory: 'Undetectable (<50 copies/mL)',
          displayBadge: 'Undetectable (<50 copies/mL)',
          isSuppressed: true,
          isUnsuppressed: false,
          isUndetectable: true,
          isPending: false,
          isNotTested: false,
          confidence: 'DEFINITIVE',
          rawReportedValue: rawVL,
          boundType: '<',
          boundValue: bound,
          reason: `Upper bound (${operator} ${bound} copies/mL) is within the undetectable reference threshold (≤ 50 copies/mL).`,
          policyVersion,
          thresholdBoundary,
        };
      }

      if (bound <= 1000) {
        // e.g. < 200, < 400, < 1000
        return {
          vlCategory: 'Suppressed (<1000 copies/mL)',
          displayBadge: 'Suppressed (<1000 copies/mL)',
          isSuppressed: true,
          isUnsuppressed: false,
          isUndetectable: false,
          isPending: false,
          isNotTested: false,
          confidence: 'DEFINITIVE',
          rawReportedValue: rawVL,
          boundType: '<',
          boundValue: bound,
          reason: `Upper bound (${operator} ${bound} copies/mL) definitively confirms viral suppression under 1000 copies/mL.`,
          policyVersion,
          thresholdBoundary,
        };
      }

      // bound > 1000 (e.g. < 5000) cannot prove suppression under 1000 copies/mL
      return {
        vlCategory: 'Unknown / Pending',
        displayBadge: 'Indeterminate Bound',
        isSuppressed: false,
        isUnsuppressed: false,
        isUndetectable: false,
        isPending: false,
        isNotTested: false,
        confidence: 'INDETERMINATE',
        rawReportedValue: rawVL,
        boundType: '<',
        boundValue: bound,
        reason: `Upper bound (${operator} ${bound} copies/mL) exceeds 1000 copies/mL; suppression category cannot be conclusively determined.`,
        policyVersion,
        thresholdBoundary,
      };
    }

    if (operator === '>' || operator === '>=' || operator === '≥') {
      if (bound >= 1000) {
        return {
          vlCategory: 'Unsuppressed (≥1000 copies/mL)',
          displayBadge: 'Unsuppressed (≥1000 copies/mL)',
          isSuppressed: false,
          isUnsuppressed: true,
          isUndetectable: false,
          isPending: false,
          isNotTested: false,
          confidence: 'DEFINITIVE',
          rawReportedValue: rawVL,
          boundType: '>',
          boundValue: bound,
          reason: `Lower bound (${operator} ${bound} copies/mL) definitively confirms viral non-suppression (≥ 1000 copies/mL).`,
          policyVersion,
          thresholdBoundary,
        };
      }

      // bound < 1000 (e.g. > 200) cannot prove whether result is < 1000 or ≥ 1000
      return {
        vlCategory: 'Unknown / Pending',
        displayBadge: 'Indeterminate Bound',
        isSuppressed: false,
        isUnsuppressed: false,
        isUndetectable: false,
        isPending: false,
        isNotTested: false,
        confidence: 'INDETERMINATE',
        rawReportedValue: rawVL,
        boundType: '>',
        boundValue: bound,
        reason: `Lower bound (${operator} ${bound} copies/mL) cannot determine whether result meets the 1000 copies/mL unsuppressed threshold.`,
        policyVersion,
        thresholdBoundary,
      };
    }
  }

  // 5. Exact Numeric Result
  // Check if it is a clean number (e.g. "0", "450", "1000", "45000")
  const numericMatch = rawVL.match(/^-?[0-9]+(?:\.[0-9]+)?$/);
  if (!numericMatch) {
    return {
      vlCategory: 'Unknown / Pending',
      displayBadge: 'Unknown / Non-numeric',
      isSuppressed: false,
      isUnsuppressed: false,
      isUndetectable: false,
      isPending: false,
      isNotTested: false,
      confidence: 'INDETERMINATE',
      rawReportedValue: rawVL,
      reason: 'Non-numeric or unrecognized viral load assay result format.',
      policyVersion,
      thresholdBoundary,
    };
  }

  const numericVal = parseFloat(rawVL);

  if (numericVal < 0) {
    return {
      vlCategory: 'Unknown / Pending',
      displayBadge: 'Invalid Negative',
      isSuppressed: false,
      isUnsuppressed: false,
      isUndetectable: false,
      isPending: false,
      isNotTested: false,
      confidence: 'INDETERMINATE',
      rawReportedValue: rawVL,
      reason: 'Viral load copies/mL cannot be negative.',
      policyVersion,
      thresholdBoundary,
    };
  }

  // Genuine zero or below undetectable threshold (< 50)
  if (numericVal < 50) {
    return {
      vlCategory: 'Undetectable (<50 copies/mL)',
      displayBadge: 'Undetectable (<50 copies/mL)',
      isSuppressed: true,
      isUnsuppressed: false,
      isUndetectable: true,
      isPending: false,
      isNotTested: false,
      confidence: 'DEFINITIVE',
      rawReportedValue: rawVL,
      boundType: '=',
      boundValue: numericVal,
      reason: `Reported copies (${numericVal} copies/mL) are below the 50 copies/mL clinical detection limit.`,
      policyVersion,
      thresholdBoundary,
    };
  }

  // Threshold Evaluation: 50 <= numericVal
  // NACO Strict (< 1000 vs >= 1000):
  //   numericVal < 1000 => Suppressed (<1000 copies/mL)
  //   numericVal >= 1000 => Unsuppressed (≥1000 copies/mL)
  // WHO (<= 1000 vs > 1000):
  //   numericVal <= 1000 => Suppressed
  //   numericVal > 1000 => Unsuppressed
  const isSuppressedByPolicy =
    thresholdBoundary === 'WHO_LESS_OR_EQUAL'
      ? numericVal <= 1000
      : numericVal < 1000;

  if (isSuppressedByPolicy) {
    return {
      vlCategory: 'Suppressed (<1000 copies/mL)',
      displayBadge: 'Suppressed (<1000 copies/mL)',
      isSuppressed: true,
      isUnsuppressed: false,
      isUndetectable: false,
      isPending: false,
      isNotTested: false,
      confidence: 'DEFINITIVE',
      rawReportedValue: rawVL,
      boundType: '=',
      boundValue: numericVal,
      reason: `Reported copies (${numericVal} copies/mL) meet the viral load suppression threshold (< 1000 copies/mL).`,
      policyVersion,
      thresholdBoundary,
    };
  }

  return {
    vlCategory: 'Unsuppressed (≥1000 copies/mL)',
    displayBadge: 'Unsuppressed (≥1000 copies/mL)',
    isSuppressed: false,
    isUnsuppressed: true,
    isUndetectable: false,
    isPending: false,
    isNotTested: false,
    confidence: 'DEFINITIVE',
    rawReportedValue: rawVL,
    boundType: '=',
    boundValue: numericVal,
    reason: `Reported copies (${numericVal} copies/mL) equal or exceed 1000 copies/mL (unsuppressed / virological failure risk).`,
    policyVersion,
    thresholdBoundary,
  };
}
