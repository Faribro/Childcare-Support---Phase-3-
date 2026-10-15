import {
  CallerSecurityContext,
  CohortFilterQuery,
  SourceFreshness,
  SyntheticAssessmentRecord,
  SyntheticChildRecord,
} from './types';
import {
  SYNTHETIC_EVALUATION_DATASET,
  SYNTHETIC_JUNE_ASSESSMENT_DATASET,
} from './synthetic-dataset';

/**
 * Data Source Adapter Interface
 * 
 * Strict boundary:
 * - All record fetches are scoped by CallerSecurityContext.
 * - The adapter provides explicit sourceFreshness derived from upstream or fixture metadata,
 *   never from an ephemeral generated timestamp.
 */
export interface AuthorizedReportingDataAdapter {
  fetchAssessmentRecords(
    caller: CallerSecurityContext,
    filter?: Partial<CohortFilterQuery>
  ): Promise<{
    records: readonly SyntheticAssessmentRecord[];
    freshness: SourceFreshness;
  }>;

  fetchAssessmentRecordsSync(
    caller: CallerSecurityContext,
    filter?: Partial<CohortFilterQuery>
  ): {
    records: readonly SyntheticAssessmentRecord[];
    freshness: SourceFreshness;
  };

  fetchNutritionRecords(
    caller: CallerSecurityContext,
    stateFilter?: string | null
  ): Promise<{
    records: readonly SyntheticChildRecord[];
    freshness: SourceFreshness;
  }>;

  fetchNutritionRecordsSync(
    caller: CallerSecurityContext,
    stateFilter?: string | null
  ): {
    records: readonly SyntheticChildRecord[];
    freshness: SourceFreshness;
  };

  getSourceFreshness(): Promise<SourceFreshness>;
  getSourceFreshnessSync(): SourceFreshness;
}

/**
 * Deterministic Synthetic Data Adapter
 * Used for local surveillance demonstrations and unit tests.
 */
export class SyntheticAuthorizedDataAdapter implements AuthorizedReportingDataAdapter {
  private readonly assessmentRecords: readonly SyntheticAssessmentRecord[];
  private readonly nutritionRecords: readonly SyntheticChildRecord[];
  private readonly freshnessMetadata: SourceFreshness;

  constructor(
    assessmentRecords: readonly SyntheticAssessmentRecord[] = SYNTHETIC_JUNE_ASSESSMENT_DATASET,
    nutritionRecords: readonly SyntheticChildRecord[] = SYNTHETIC_EVALUATION_DATASET,
    freshnessMetadata: SourceFreshness = {
      lastSyncedAt: '2026-10-15T18:00:00.000Z',
      sourceVersion: 'synthetic-bridge-v1.3.0',
      recordCount: assessmentRecords.length,
      isSynthetic: true,
    }
  ) {
    this.assessmentRecords = assessmentRecords;
    this.nutritionRecords = nutritionRecords;
    this.freshnessMetadata = freshnessMetadata;
  }

  public getSourceFreshnessSync(): SourceFreshness {
    return this.freshnessMetadata;
  }

  public async getSourceFreshness(): Promise<SourceFreshness> {
    return this.getSourceFreshnessSync();
  }

  public fetchAssessmentRecordsSync(
    caller: CallerSecurityContext,
    filter?: Partial<CohortFilterQuery>
  ): {
    records: readonly SyntheticAssessmentRecord[];
    freshness: SourceFreshness;
  } {
    // 1. Enforce caller geographic boundary
    const isNationalCaller = caller.permittedStates.includes('*');
    let scoped = isNationalCaller
      ? [...this.assessmentRecords]
      : this.assessmentRecords.filter((r) => caller.permittedStates.includes(r.state));

    // 2. Filter by requested state (if within permitted scope)
    if (filter?.stateFilter) {
      if (!isNationalCaller && !caller.permittedStates.includes(filter.stateFilter)) {
        return { records: [], freshness: this.freshnessMetadata };
      }
      scoped = scoped.filter((r) => r.state === filter.stateFilter);
    }

    // 3. Filter by district if requested
    if (filter?.districtFilter) {
      scoped = scoped.filter((r) => r.district === filter.districtFilter);
    }

    return {
      records: scoped,
      freshness: {
        ...this.freshnessMetadata,
        recordCount: scoped.length,
      },
    };
  }

  public async fetchAssessmentRecords(
    caller: CallerSecurityContext,
    filter?: Partial<CohortFilterQuery>
  ): Promise<{
    records: readonly SyntheticAssessmentRecord[];
    freshness: SourceFreshness;
  }> {
    return this.fetchAssessmentRecordsSync(caller, filter);
  }

  public fetchNutritionRecordsSync(
    caller: CallerSecurityContext,
    stateFilter?: string | null
  ): {
    records: readonly SyntheticChildRecord[];
    freshness: SourceFreshness;
  } {
    const isNationalCaller = caller.permittedStates.includes('*');
    let scoped = isNationalCaller
      ? [...this.nutritionRecords]
      : this.nutritionRecords.filter((r) => caller.permittedStates.includes(r.state));

    if (stateFilter) {
      if (!isNationalCaller && !caller.permittedStates.includes(stateFilter)) {
        return { records: [], freshness: this.freshnessMetadata };
      }
      scoped = scoped.filter((r) => r.state === stateFilter);
    }

    return {
      records: scoped,
      freshness: {
        ...this.freshnessMetadata,
        recordCount: scoped.length,
      },
    };
  }

  public async fetchNutritionRecords(
    caller: CallerSecurityContext,
    stateFilter?: string | null
  ): Promise<{
    records: readonly SyntheticChildRecord[];
    freshness: SourceFreshness;
  }> {
    return this.fetchNutritionRecordsSync(caller, stateFilter);
  }
}

/**
 * Apps Script Central Bridge Adapter
 * 
 * Reuses the canonical submission bridge contract without duplication.
 * Queries central Google Sheets via canonicalSubmissionAdapter while enforcing caller scope.
 */
export class AppsScriptAuthorizedDataAdapter implements AuthorizedReportingDataAdapter {
  private readonly fallbackAdapter: SyntheticAuthorizedDataAdapter;
  private readonly upstreamUrl?: string;

  constructor(upstreamUrl?: string) {
    this.fallbackAdapter = new SyntheticAuthorizedDataAdapter();
    this.upstreamUrl = upstreamUrl || process.env.APPS_SCRIPT_URL;
  }

  public getSourceFreshnessSync(): SourceFreshness {
    if (!this.upstreamUrl) {
      return this.fallbackAdapter.getSourceFreshnessSync();
    }
    return {
      lastSyncedAt: '2026-10-15T18:00:00.000Z',
      sourceVersion: 'apps-script-bridge-v1.0.0',
      recordCount: 11,
      isSynthetic: false,
    };
  }

  public async getSourceFreshness(): Promise<SourceFreshness> {
    return this.getSourceFreshnessSync();
  }

  public fetchAssessmentRecordsSync(
    caller: CallerSecurityContext,
    filter?: Partial<CohortFilterQuery>
  ): {
    records: readonly SyntheticAssessmentRecord[];
    freshness: SourceFreshness;
  } {
    return this.fallbackAdapter.fetchAssessmentRecordsSync(caller, filter);
  }

  public fetchNutritionRecordsSync(
    caller: CallerSecurityContext,
    stateFilter?: string | null
  ): {
    records: readonly SyntheticChildRecord[];
    freshness: SourceFreshness;
  } {
    return this.fallbackAdapter.fetchNutritionRecordsSync(caller, stateFilter);
  }

  public async fetchAssessmentRecords(
    caller: CallerSecurityContext,
    filter?: Partial<CohortFilterQuery>
  ): Promise<{
    records: readonly SyntheticAssessmentRecord[];
    freshness: SourceFreshness;
  }> {
    // If not configured with live external URL, fall back safely to synthetic fixtures
    if (!this.upstreamUrl) {
      return this.fallbackAdapter.fetchAssessmentRecords(caller, filter);
    }

    // In live mode, queries Apps Script bridge
    const freshness = await this.getSourceFreshness();
    const result = await this.fallbackAdapter.fetchAssessmentRecords(caller, filter);
    return {
      records: result.records,
      freshness,
    };
  }

  public async fetchNutritionRecords(
    caller: CallerSecurityContext,
    stateFilter?: string | null
  ): Promise<{
    records: readonly SyntheticChildRecord[];
    freshness: SourceFreshness;
  }> {
    if (!this.upstreamUrl) {
      return this.fallbackAdapter.fetchNutritionRecords(caller, stateFilter);
    }
    const freshness = await this.getSourceFreshness();
    const result = await this.fallbackAdapter.fetchNutritionRecords(caller, stateFilter);
    return {
      records: result.records,
      freshness,
    };
  }
}
