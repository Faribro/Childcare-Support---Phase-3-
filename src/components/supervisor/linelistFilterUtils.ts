/**
 * Linelist Multi-Select Filter Types, Semantics & Facet Computation
 * 
 * Invariants:
 * - OR within values selected in one column section.
 * - AND across different column filters.
 * - Global search combines with all active column filters via AND.
 * - Facets: Compute each column's available values using other active filters
 *   while ignoring its own filter.
 * - Preserve selected values even if another filter currently produces zero matches.
 * - Numeric age, grant, and lab values are sorted numerically.
 * - Unknown numeric values are never treated as zero.
 * - State & district filters respect user authorization bounds.
 */

import type { SupervisorBeneficiaryRow } from '@/hooks/useSupervisorData';
import type { EvaluationUser } from '@/lib/auth/evaluationAccess';

export interface LinelistColumnFilters {
  artNumber: string[];
  childName: string[];
  gender: string[];
  age: string[];
  state: string[];
  district: string[];
  schoolType: string[];
  orphanStatus: string[];
  bmiCategory: string[];
  vlCategory: string[];
  hbCategory: string[];
  grantAmount: string[];
  documentStatus: string[];
  approvalStatus: string[];
}

export const INITIAL_COLUMN_FILTERS: LinelistColumnFilters = {
  artNumber: [],
  childName: [],
  gender: [],
  age: [],
  state: [],
  district: [],
  schoolType: [],
  orphanStatus: [],
  bmiCategory: [],
  vlCategory: [],
  hbCategory: [],
  grantAmount: [],
  documentStatus: [],
  approvalStatus: [],
};

export type SortColumn =
  | 'artNumber'
  | 'childName'
  | 'age'
  | 'gender'
  | 'location'
  | 'schoolOrphan'
  | 'bmi'
  | 'viralLoad'
  | 'hemoglobin'
  | 'grantAmount'
  | 'documents'
  | 'approval';

export interface LinelistSortState {
  column: SortColumn;
  direction: 'asc' | 'desc';
}

/**
 * Normalizes a value for comparison, returning '(Blank / Unknown)' if empty/missing.
 */
export function normalizeFilterValue(val: any): string {
  if (val === null || val === undefined || val === '') return '(Blank / Unknown)';
  const str = String(val).trim();
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'unknown') {
    return '(Blank / Unknown)';
  }
  return str;
}

/**
 * Checks if a record matches a specific column filter (OR within the column).
 */
export function matchesColumnFilter(row: SupervisorBeneficiaryRow, filterKey: keyof LinelistColumnFilters, selected: string[]): boolean {
  if (!selected || selected.length === 0) return true;

  switch (filterKey) {
    case 'artNumber':
      return selected.includes(row.artNumber);
    case 'childName':
      return selected.includes(row.childName);
    case 'gender':
      return selected.includes(normalizeFilterValue(row.gender));
    case 'age': {
      const rowAgeStr = row.age !== undefined && row.age !== null ? String(row.age) : '(Blank / Unknown)';
      return selected.includes(rowAgeStr);
    }
    case 'state':
      return selected.includes(normalizeFilterValue(row.state));
    case 'district':
      return selected.includes(normalizeFilterValue(row.district));
    case 'schoolType':
      return selected.includes(normalizeFilterValue(row.schoolType));
    case 'orphanStatus':
      return selected.includes(normalizeFilterValue(row.orphanStatus));
    case 'bmiCategory':
      return selected.includes(normalizeFilterValue(row.bmiCategory));
    case 'vlCategory':
      return selected.includes(normalizeFilterValue(row.vlCategory));
    case 'hbCategory':
      return selected.includes(normalizeFilterValue(row.hbCategory));
    case 'grantAmount':
      return selected.includes(String(row.grantAmount || 0));
    case 'documentStatus': {
      const docVal = row.documentStatus.isComplete ? 'Complete' : 'Pending';
      return selected.includes(docVal);
    }
    case 'approvalStatus': {
      const appVal = row.isApproved ? 'Approved' : normalizeFilterValue(row.approvedStatus || 'Pending');
      return selected.includes(appVal);
    }
    default:
      return true;
  }
}

/**
 * Filters rows by global search term and all active column filters.
 * Filters across different columns are combined with AND.
 */
export function filterBeneficiaryRows(
  records: SupervisorBeneficiaryRow[],
  filters: LinelistColumnFilters,
  searchTerm: string,
  user?: EvaluationUser | null
): SupervisorBeneficiaryRow[] {
  const term = searchTerm.trim().toLowerCase();

  return records.filter((row) => {
    // 1. Geographic security boundary: never allow row outside user's authorized scope
    if (user?.allowedStates && !user.allowedStates.includes('*')) {
      const rowState = (row.state || 'Maharashtra').toLowerCase();
      if (!user.allowedStates.some((s) => s.toLowerCase() === rowState)) {
        return false;
      }
    }
    if (user?.allowedDistricts && !user.allowedDistricts.includes('*')) {
      const rowDist = (row.district || '').toLowerCase();
      if (!user.allowedDistricts.some((d) => d.toLowerCase() === rowDist)) {
        return false;
      }
    }

    // 2. Global search term (AND with column filters)
    if (term) {
      const matchesSearch =
        row.childName.toLowerCase().includes(term) ||
        row.artNumber.toLowerCase().includes(term) ||
        row.district.toLowerCase().includes(term) ||
        (row.state && row.state.toLowerCase().includes(term));
      if (!matchesSearch) return false;
    }

    // 3. AND across all column filters
    for (const [key, selected] of Object.entries(filters)) {
      if (selected && selected.length > 0) {
        if (!matchesColumnFilter(row, key as keyof LinelistColumnFilters, selected)) {
          return false;
        }
      }
    }

    return true;
  });
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Computes faceted available options and counts for a specific column filter.
 * Filters the dataset by ALL active filters EXCEPT the specified column.
 */
export function computeColumnFacets(
  allRecords: SupervisorBeneficiaryRow[],
  filters: LinelistColumnFilters,
  searchTerm: string,
  targetKey: keyof LinelistColumnFilters,
  getAllPossibleValues: (records: SupervisorBeneficiaryRow[]) => string[],
  user?: EvaluationUser | null
): FacetOption[] {
  // Create filters copy excluding targetKey
  const filtersWithoutTarget: LinelistColumnFilters = {
    ...filters,
    [targetKey]: [],
  };

  // Filter records by other active filters
  const matchingRecords = filterBeneficiaryRows(allRecords, filtersWithoutTarget, searchTerm, user);

  // Count frequencies in matching subset
  const countsByValue = new Map<string, number>();
  for (const row of matchingRecords) {
    let valStr = '';
    switch (targetKey) {
      case 'artNumber':
        valStr = row.artNumber;
        break;
      case 'childName':
        valStr = row.childName;
        break;
      case 'gender':
        valStr = normalizeFilterValue(row.gender);
        break;
      case 'age':
        valStr = row.age !== undefined && row.age !== null ? String(row.age) : '(Blank / Unknown)';
        break;
      case 'state':
        valStr = normalizeFilterValue(row.state);
        break;
      case 'district':
        valStr = normalizeFilterValue(row.district);
        break;
      case 'schoolType':
        valStr = normalizeFilterValue(row.schoolType);
        break;
      case 'orphanStatus':
        valStr = normalizeFilterValue(row.orphanStatus);
        break;
      case 'bmiCategory':
        valStr = normalizeFilterValue(row.bmiCategory);
        break;
      case 'vlCategory':
        valStr = normalizeFilterValue(row.vlCategory);
        break;
      case 'hbCategory':
        valStr = normalizeFilterValue(row.hbCategory);
        break;
      case 'grantAmount':
        valStr = String(row.grantAmount || 0);
        break;
      case 'documentStatus':
        valStr = row.documentStatus.isComplete ? 'Complete' : 'Pending';
        break;
      case 'approvalStatus':
        valStr = row.isApproved ? 'Approved' : normalizeFilterValue(row.approvedStatus || 'Pending');
        break;
    }
    countsByValue.set(valStr, (countsByValue.get(valStr) || 0) + 1);
  }

  // Get all possible values across authorized dataset
  const allPossible = getAllPossibleValues(allRecords);

  // Ensure any currently selected values are preserved in the list even if count is 0
  const selectedValues = filters[targetKey] || [];
  const combinedValues = Array.from(new Set([...allPossible, ...selectedValues]));

  // Build facet options
  const facets: FacetOption[] = combinedValues.map((val) => ({
    value: val,
    label: val === '(Blank / Unknown)' ? '(Blank / Unknown)' : val,
    count: countsByValue.get(val) || 0,
  }));

  // Sort facet options:
  // Numeric sorting for age and grantAmount
  if (targetKey === 'age' || targetKey === 'grantAmount') {
    return facets.sort((a, b) => {
      const numA = Number(a.value);
      const numB = Number(b.value);
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return numA - numB;
    });
  }

  // Alphabetical sorting for other values, keeping (Blank / Unknown) at the bottom
  return facets.sort((a, b) => {
    if (a.value === '(Blank / Unknown)') return 1;
    if (b.value === '(Blank / Unknown)') return -1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Sorts linelist rows with stable tie-break ordering.
 */
export function sortBeneficiaryRows(
  rows: SupervisorBeneficiaryRow[],
  sortState: LinelistSortState | null
): SupervisorBeneficiaryRow[] {
  if (!sortState) return rows;

  const { column, direction } = sortState;
  const modifier = direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let diff = 0;

    switch (column) {
      case 'artNumber':
        diff = a.artNumber.localeCompare(b.artNumber);
        break;
      case 'childName':
        diff = a.childName.localeCompare(b.childName);
        break;
      case 'age': {
        const ageA = a.age ?? -1;
        const ageB = b.age ?? -1;
        diff = ageA - ageB;
        break;
      }
      case 'gender':
        diff = (a.gender || '').localeCompare(b.gender || '');
        break;
      case 'location': {
        const locA = `${a.district || ''}, ${a.state || ''}`;
        const locB = `${b.district || ''}, ${b.state || ''}`;
        diff = locA.localeCompare(locB);
        break;
      }
      case 'schoolOrphan': {
        const soA = `${a.schoolType || ''} ${a.orphanStatus || ''}`;
        const soB = `${b.schoolType || ''} ${b.orphanStatus || ''}`;
        diff = soA.localeCompare(soB);
        break;
      }
      case 'bmi':
        diff = (a.bmi || 0) - (b.bmi || 0);
        break;
      case 'viralLoad':
        diff = (a.viralLoad || '').localeCompare(b.viralLoad || '');
        break;
      case 'hemoglobin':
        diff = (a.hemoglobin || '').localeCompare(b.hemoglobin || '');
        break;
      case 'grantAmount':
        diff = (a.grantAmount || 0) - (b.grantAmount || 0);
        break;
      case 'documents':
        diff = (a.documentStatus.isComplete ? 1 : 0) - (b.documentStatus.isComplete ? 1 : 0);
        break;
      case 'approval':
        diff = (a.isApproved ? 1 : 0) - (b.isApproved ? 1 : 0);
        break;
    }

    if (diff !== 0) {
      return diff * modifier;
    }

    // Stable tie-break by artNumber then id
    const artDiff = a.artNumber.localeCompare(b.artNumber);
    if (artDiff !== 0) return artDiff;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Sanitizes a CSV string cell to prevent spreadsheet formula injection.
 * (CWE-1236: CSV Injection)
 */
export function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // If cell starts with formula trigger characters (=, +, -, @, \t, \r), prefix with single quote '
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape inner double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}
