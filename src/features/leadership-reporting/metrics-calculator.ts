import {
  CallerSecurityContext,
  CohortFilterQuery,
  CohortSummaryResult,
  DateBasis,
  DistrictBreakdownItem,
  JuneCohortSummaryResult,
  KpiSummary,
  SourceFreshness,
  StateComparisonMetric,
  SyntheticAssessmentRecord,
  SyntheticChildRecord,
} from './types';

/**
 * Deterministic mathematical calculation engine for leadership surveillance.
 * Zero hallucination: All numbers are strictly evaluated by code.
 */

function round1(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round(val * 10) / 10;
}

// -------------------------------------------------------------
// Core Authorization Validation
// -------------------------------------------------------------

export interface CallerAccessValidation {
  readonly allowed: boolean;
  readonly effectiveStates: readonly string[]; // ['*'] or specific list
  readonly isRestricted: boolean;
  readonly denialReason?: string;
}

export function validateCallerAccess(
  caller: CallerSecurityContext,
  requestedState?: string | null
): CallerAccessValidation {
  const isNational = caller.permittedStates.includes('*');

  // Case 1: Caller has unrestricted national scope (LEADERSHIP)
  if (isNational) {
    if (requestedState && requestedState.trim()) {
      return {
        allowed: true,
        effectiveStates: [requestedState.trim()],
        isRestricted: true,
      };
    }
    return {
      allowed: true,
      effectiveStates: ['*'],
      isRestricted: false,
    };
  }

  // Case 2: Caller has restricted scope (e.g. STATE_LEAD for ['Maharashtra'])
  const normalizedPermitted = caller.permittedStates.map((s) => s.toLowerCase());

  if (requestedState && requestedState.trim()) {
    const target = requestedState.trim();
    if (!normalizedPermitted.includes(target.toLowerCase())) {
      return {
        allowed: false,
        effectiveStates: [],
        isRestricted: true,
        denialReason: `Scope Denied: User '${caller.userId}' with role '${caller.role}' is not authorized to access '${target}'. Permitted state scope: [${caller.permittedStates.join(', ')}].`,
      };
    }
    return {
      allowed: true,
      effectiveStates: [target],
      isRestricted: true,
    };
  }

  // When no specific state is requested (or reset occurs), restore caller's permitted scope, NEVER national
  return {
    allowed: true,
    effectiveStates: [...caller.permittedStates],
    isRestricted: true,
  };
}

// -------------------------------------------------------------
// Generic Cohort Surveillance Engine
// -------------------------------------------------------------

export interface CohortCalculationOptions {
  readonly stateFilter?: string | null;
  readonly dateBasis?: DateBasis;
  readonly year?: number;
}

function parseMonthPrefix(monthStr: string | undefined): string | null {
  if (!monthStr || monthStr.toLowerCase() === 'all' || monthStr === '*') {
    return null;
  }
  const months: Record<string, string> = {
    january: '01', jan: '01', '01': '01',
    february: '02', feb: '02', '02': '02',
    march: '03', mar: '03', '03': '03',
    april: '04', apr: '04', '04': '04',
    may: '05', '05': '05',
    june: '06', jun: '06', '06': '06',
    july: '07', jul: '07', '07': '07',
    august: '08', aug: '08', '08': '08',
    september: '09', sep: '09', '09': '09',
    october: '10', oct: '10', '10': '10',
    november: '11', nov: '11', '11': '11',
    december: '12', dec: '12', '12': '12',
  };
  return months[monthStr.toLowerCase()] || '06';
}

export function calculateCohortMetrics(
  caller: CallerSecurityContext,
  records: readonly SyntheticAssessmentRecord[],
  query?: CohortFilterQuery,
  freshness?: SourceFreshness
): CohortSummaryResult {
  const auth = validateCallerAccess(caller, query?.stateFilter);
  if (!auth.allowed) {
    throw new Error(auth.denialReason || 'Unauthorized state access attempt');
  }

  const year = query?.year ?? 2026;
  const monthName = query?.month ?? 'June';
  const monthPrefix = parseMonthPrefix(monthName);
  const dateBasis = query?.dateBasis ?? 'VISIT_DATE';
  const targetPrefix = monthPrefix ? `${year}-${monthPrefix}` : `${year}`;

  const targetOrphan = query?.orphanCategory ?? 'SINGLE_ORPHAN';
  const targetSchool = query?.schoolCategory ?? 'GOVERNMENT_SCHOOL';

  // 1. Filter by authorized states
  let stateFiltered: readonly SyntheticAssessmentRecord[];
  if (auth.effectiveStates.includes('*')) {
    stateFiltered = records;
  } else {
    const allowedLower = new Set(auth.effectiveStates.map((s) => s.toLowerCase()));
    stateFiltered = records.filter((r) => allowedLower.has(r.state.toLowerCase()));
  }

  // 2. Identify records occurring in target period based on the requested dateBasis
  const timeFiltered = stateFiltered.filter((r) => {
    const dateToCheck = dateBasis === 'VISIT_DATE' ? r.visitDate : r.submissionDate;
    return dateToCheck.startsWith(targetPrefix);
  });

  // 3. Missing-value tracking (Data quality analysis)
  let missingSchoolCount = 0;
  let missingOrphanCount = 0;

  for (const r of timeFiltered) {
    if (targetOrphan !== 'ALL' && r.orphanStatus === targetOrphan && r.schoolType === null) {
      missingSchoolCount++;
    }
    if (targetSchool !== 'ALL' && r.schoolType === targetSchool && r.orphanStatus === null) {
      missingOrphanCount++;
    }
  }

  // 4. Exact cohort matching
  const matching = timeFiltered.filter((r) => {
    const orphanMatches = targetOrphan === 'ALL' || r.orphanStatus === targetOrphan;
    const schoolMatches = targetSchool === 'ALL' || r.schoolType === targetSchool;
    const districtMatches = !query?.districtFilter || r.district === query.districtFilter;
    return orphanMatches && schoolMatches && districtMatches;
  });

  // 5. Unique beneficiaries vs total assessments
  const totalAssessments = matching.length;
  const uniqueBeneficiaries = new Set(matching.map((r) => r.childId)).size;

  // 6. Approval status distribution
  let approved = 0;
  let pending = 0;
  let flagged = 0;
  let rejected = 0;

  for (const r of matching) {
    if (r.verificationStatus === 'APPROVED') approved++;
    else if (r.verificationStatus === 'PENDING') pending++;
    else if (r.verificationStatus === 'FLAGGED') flagged++;
    else if (r.verificationStatus === 'REJECTED') rejected++;
  }

  // 7. District breakdown
  const byDistrict = new Map<string, SyntheticAssessmentRecord[]>();
  for (const r of matching) {
    const list = byDistrict.get(r.district) || [];
    list.push(r);
    byDistrict.set(r.district, list);
  }

  const districtBreakdown: DistrictBreakdownItem[] = [];
  for (const [district, districtRecords] of byDistrict.entries()) {
    const distUnique = new Set(districtRecords.map((r) => r.childId)).size;
    let distApproved = 0;
    let distPending = 0;
    let distFlagged = 0;

    for (const r of districtRecords) {
      if (r.verificationStatus === 'APPROVED') distApproved++;
      else if (r.verificationStatus === 'PENDING') distPending++;
      else if (r.verificationStatus === 'FLAGGED') distFlagged++;
    }

    districtBreakdown.push({
      district,
      uniqueBeneficiaries: distUnique,
      totalAssessments: districtRecords.length,
      approvedAssessments: distApproved,
      pendingAssessments: distPending,
      flaggedAssessments: distFlagged,
    });
  }

  // Sort district breakdown alphabetically
  districtBreakdown.sort((a, b) => a.district.localeCompare(b.district));

  const effectiveState =
    query?.stateFilter ||
    (!auth.effectiveStates.includes('*') && auth.effectiveStates.length === 1
      ? auth.effectiveStates[0]
      : null);

  const effectiveFreshness: SourceFreshness = freshness ?? {
    lastSyncedAt: '2026-10-15T18:00:00.000Z',
    sourceVersion: 'synthetic-bridge-v1.3.0',
    recordCount: records.length,
    isSynthetic: true,
  };

  return {
    year,
    month: monthName,
    dateBasis,
    stateFilter: effectiveState,
    districtFilter: query?.districtFilter,
    orphanCategory: targetOrphan,
    schoolCategory: targetSchool,
    uniqueBeneficiariesCount: uniqueBeneficiaries,
    totalAssessmentsCount: totalAssessments,
    approvedAssessmentsCount: approved,
    pendingAssessmentsCount: pending,
    flaggedAssessmentsCount: flagged,
    rejectedAssessmentsCount: rejected,
    recordsExcludedMissingSchool: missingSchoolCount,
    recordsExcludedMissingOrphanStatus: missingOrphanCount,
    districtBreakdown,
    sourceFreshness: effectiveFreshness,
    isSynthetic: true,
  };
}

export function calculateJuneCohortMetrics(
  caller: CallerSecurityContext,
  records: readonly SyntheticAssessmentRecord[],
  options?: CohortCalculationOptions,
  freshness?: SourceFreshness
): JuneCohortSummaryResult {
  return calculateCohortMetrics(
    caller,
    records,
    {
      year: options?.year ?? 2026,
      month: 'June',
      dateBasis: options?.dateBasis ?? 'VISIT_DATE',
      orphanCategory: 'SINGLE_ORPHAN',
      schoolCategory: 'GOVERNMENT_SCHOOL',
      stateFilter: options?.stateFilter,
    },
    freshness
  ) as JuneCohortSummaryResult;
}

// -------------------------------------------------------------
// General Surveillance Metrics
// -------------------------------------------------------------

export function calculateKpiSummary(
  records: readonly SyntheticChildRecord[],
  stateFilter?: string | null
): KpiSummary {
  const normalizedFilter = stateFilter?.trim().toLowerCase() || null;
  const filtered = normalizedFilter
    ? records.filter((r) => r.state.toLowerCase() === normalizedFilter)
    : records;

  const total = filtered.length;
  if (total === 0) {
    return {
      totalEnrolled: 0,
      activeAttendanceCount: 0,
      activeAttendanceRate: 0,
      samCount: 0,
      mamCount: 0,
      normalCount: 0,
      samPercentage: 0,
      recoveredCount: 0,
      recoveryRate: 0,
      pendingVerifications: 0,
      flaggedVerifications: 0,
      stateFilter: stateFilter || null,
      isSynthetic: true,
    };
  }

  let activeCount = 0;
  let sam = 0;
  let mam = 0;
  let normal = 0;
  let baselineMalnourished = 0;
  let recovered = 0;
  let pending = 0;
  let flagged = 0;

  for (const r of filtered) {
    if (r.attendance === 'REGULAR') activeCount++;
    if (r.nutritionCurrent === 'SAM') sam++;
    else if (r.nutritionCurrent === 'MAM') mam++;
    else if (r.nutritionCurrent === 'NORMAL') normal++;

    if (r.nutritionBaseline === 'SAM' || r.nutritionBaseline === 'MAM') {
      baselineMalnourished++;
      if (r.recovered) recovered++;
    }

    if (r.verification === 'PENDING') pending++;
    else if (r.verification === 'FLAGGED') flagged++;
  }

  const attendanceRate = round1((activeCount / total) * 100);
  const samPercentage = round1((sam / total) * 100);
  const recoveryRate =
    baselineMalnourished > 0 ? round1((recovered / baselineMalnourished) * 100) : 0;

  return {
    totalEnrolled: total,
    activeAttendanceCount: activeCount,
    activeAttendanceRate: attendanceRate,
    samCount: sam,
    mamCount: mam,
    normalCount: normal,
    samPercentage,
    recoveredCount: recovered,
    recoveryRate,
    pendingVerifications: pending,
    flaggedVerifications: flagged,
    stateFilter: stateFilter || null,
    isSynthetic: true,
  };
}

export function calculateStateComparison(
  records: readonly SyntheticChildRecord[]
): StateComparisonMetric[] {
  const byState = new Map<string, SyntheticChildRecord[]>();

  for (const r of records) {
    const list = byState.get(r.state) || [];
    list.push(r);
    byState.set(r.state, list);
  }

  const results: StateComparisonMetric[] = [];

  for (const [state, stateRecords] of byState.entries()) {
    const total = stateRecords.length;
    let sam = 0;
    let mam = 0;
    let normal = 0;
    let regular = 0;
    let baselineMalnourished = 0;
    let recovered = 0;
    let pending = 0;

    for (const r of stateRecords) {
      if (r.nutritionCurrent === 'SAM') sam++;
      else if (r.nutritionCurrent === 'MAM') mam++;
      else if (r.nutritionCurrent === 'NORMAL') normal++;

      if (r.attendance === 'REGULAR') regular++;
      if (r.nutritionBaseline === 'SAM' || r.nutritionBaseline === 'MAM') {
        baselineMalnourished++;
        if (r.recovered) recovered++;
      }
      if (r.verification === 'PENDING') pending++;
    }

    const attendanceRate = total > 0 ? round1((regular / total) * 100) : 0;
    const recoveryRate =
      baselineMalnourished > 0 ? round1((recovered / baselineMalnourished) * 100) : 0;

    results.push({
      state,
      enrolled: total,
      samCount: sam,
      mamCount: mam,
      normalCount: normal,
      recoveryRate,
      attendanceRate,
      pendingApprovals: pending,
    });
  }

  return results.sort((a, b) => b.enrolled - a.enrolled);
}

export function filterHighRiskCohorts(
  records: readonly SyntheticChildRecord[],
  stateFilter?: string | null
): SyntheticChildRecord[] {
  const normalizedFilter = stateFilter?.trim().toLowerCase() || null;
  return records.filter((r) => {
    if (normalizedFilter && r.state.toLowerCase() !== normalizedFilter) {
      return false;
    }
    return (
      r.nutritionCurrent === 'SAM' ||
      r.attendance === 'DEFAULTED' ||
      r.lastVisitDaysAgo >= 14 ||
      r.verification === 'FLAGGED'
    );
  });
}

export function filterPendingApprovals(
  records: readonly SyntheticChildRecord[],
  stateFilter?: string | null
): SyntheticChildRecord[] {
  const normalizedFilter = stateFilter?.trim().toLowerCase() || null;
  return records.filter((r) => {
    if (normalizedFilter && r.state.toLowerCase() !== normalizedFilter) {
      return false;
    }
    return r.verification === 'PENDING';
  });
}
