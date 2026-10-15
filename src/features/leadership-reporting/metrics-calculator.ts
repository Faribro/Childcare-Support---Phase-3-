import { KpiSummary, StateComparisonMetric, SyntheticChildRecord } from './types';

/**
 * Deterministic mathematical calculation engine for leadership surveillance.
 * Zero hallucination: All numbers are strictly evaluated by code.
 */

function round1(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round(val * 10) / 10;
}

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
    // High risk: SAM cases, defaulted attendance, or last visit > 14 days ago
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
