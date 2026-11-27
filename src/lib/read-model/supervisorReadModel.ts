import type { BMICategory, VLCategory, HbCategory } from '@/types/domain';
import {
  NetworkStatus,
  DataSource,
  SyncStatus,
  SystemStatus,
  FormattedStatus,
  formatSystemStatus,
  getBrowserNetworkHint,
} from '@/lib/status/statusModel';
import {
  deriveBeneficiaryReadiness,
  deduplicateRecordsByChild,
  computeReadinessAggregates,
  type CanonicalRecordReadiness,
  type CanonicalDocumentType,
  type CanonicalApprovalStatus,
  type CanonicalOrphanStatus,
  type ReadinessSummary,
} from './beneficiaryReadiness';
import { deriveSubmissionStages, type SubmissionStages } from '@/lib/shared/submissionStages';
import { canonicalizeStateName } from '@/lib/constants/stateNormalization';

export type {
  NetworkStatus,
  DataSource,
  SyncStatus,
  SystemStatus,
  FormattedStatus,
  CanonicalRecordReadiness,
  CanonicalDocumentType,
  CanonicalApprovalStatus,
  CanonicalOrphanStatus,
  ReadinessSummary,
};
export {
  formatSystemStatus,
  getBrowserNetworkHint,
  deriveBeneficiaryReadiness,
  deduplicateRecordsByChild,
  computeReadinessAggregates,
};

export interface BeneficiaryDocumentStatus {
  isComplete: boolean;
  totalRequired: number;
  uploadedCount: number;
  pendingDocs: string[];
  uploadedDocs: string[];
}

export interface SupervisorBeneficiaryRow {
  id: string;
  artNumber: string;
  childName: string;
  caregiverName?: string;
  caregiverPhone?: string;
  age: number | null;
  gender: string;
  district: string;
  state: string;
  schoolType: string;
  schoolEnrolled: boolean;
  orphanStatus: string;
  bmi: number | null;
  bmiCategory: BMICategory;
  viralLoad: string;
  vlCategory: VLCategory;
  hemoglobin: string;
  hbCategory: HbCategory;
  grantAmount: number;
  syncState: 'SYNCED' | 'QUEUED';
  lastVisit: string;
  createdAt?: string;
  updatedAt?: string;
  editReason?: string;
  sheetRow?: number | string;
  remoteSubmissionId?: string;
  rawRecord?: any;
  version: number;
  documentStatus: BeneficiaryDocumentStatus;
  isApproved: boolean;
  approvedStatus: string;
  readiness?: CanonicalRecordReadiness;
  submittedBy?: string;
  interviewerName?: string;
  srName?: string;
  ssrName?: string;
  stages?: SubmissionStages;
}

export type SupervisorDataStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error'
  | 'offline_cache'
  | 'unauthorized'
  | 'forbidden';

export interface SupervisorDataError {
  code: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
  requestId?: string;
}

export interface SupervisorReadModelState {
  status: SupervisorDataStatus;
  records: SupervisorBeneficiaryRow[];
  total: number;
  lastRefreshed: Date | null;
  lastSuccessAt: Date | null;
  error: SupervisorDataError | null;
  isOnline: boolean;
  consecutiveFailures: number;
  networkStatus: NetworkStatus;
  dataSource: DataSource;
  syncStatus: SyncStatus;
}

const CACHE_STORAGE_KEY = 'child_nutrition:supervisor_cache_v1';
const SUCCESS_POLL_INTERVAL_MS = 30000;
const MAX_BACKOFF_MS = 60000;
const REQUEST_TIMEOUT_MS = 15000;

function isFieldPresent(val: any): boolean {
  if (val === true) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return false;
    if (trimmed === '—' || trimmed === '-' || trimmed === 'N/A' || trimmed === 'n/a') return false;
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('not uploaded') ||
      lower.includes('no fee receipt') ||
      lower.includes('no marksheet') ||
      lower === 'none' ||
      lower === 'null' ||
      lower === 'undefined'
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function evaluateDocuments(it: any, schoolTypeStr?: string): BeneficiaryDocumentStatus {
  const readiness = deriveBeneficiaryReadiness(it);
  return {
    isComplete: readiness.isComplete,
    totalRequired: readiness.totalRequired,
    uploadedCount: readiness.uploadedCount,
    pendingDocs: readiness.missingDocTypes,
    uploadedDocs: readiness.presentDocTypes,
  };
}

function getCurrentSessionScopeSignature(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem('child_nutrition:user_session_v1');
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (!u || !u.isVerified || !u.userId) return null;
    const states = [...(u.allowedStates || [])].map((s: string) => s.trim().toLowerCase()).sort().join(',');
    const districts = [...(u.allowedDistricts || [])].map((d: string) => d.trim().toLowerCase()).sort().join(',');
    return `${String(u.userId).trim().toLowerCase()}|${u.role}|${states}|${districts}`;
  } catch {
    return null;
  }
}

function unwrapSubmissionRecord(rawIt: any): any {
  if (!rawIt || typeof rawIt !== 'object') return rawIt;
  if (rawIt.payload && typeof rawIt.payload === 'object') {
    return {
      ...rawIt.payload,
      ...rawIt,
      payload: rawIt.payload,
    };
  }
  return rawIt;
}

export function parseBeneficiaryRecord(rawIt: any): SupervisorBeneficiaryRow {
  const it = unwrapSubmissionRecord(rawIt);
  const readiness = deriveBeneficiaryReadiness(it);

  const rawBmi = it['34\nBMI'] ?? it['bmi'] ?? it.nutrition?.bmi ?? it.clinical?.bmi ?? 0;
  let bmiCat: BMICategory = 'Normal';
  const numBmi = Number(rawBmi) || 0;
  if (numBmi > 0) {
    if (numBmi < 13.5) bmiCat = 'Severe Underweight';
    else if (numBmi < 15.0) bmiCat = 'Moderate Underweight';
    else if (numBmi > 22.0) bmiCat = 'Overweight / Obese';
  }

  const rawVl = it['45\nViral Load'] ?? it['viral load'] ?? it.clinical?.viralLoad ?? it.clinical?.viralload ?? it.viralload ?? '';
  const numVl = parseFloat(String(rawVl).replace(/[^0-9.]/g, ''));
  let vlCat: VLCategory = 'Unknown / Pending';
  if (String(rawVl).toLowerCase().includes('undetect') || String(rawVl).includes('<50') || String(rawVl).includes('< 50') || numVl < 50) {
    vlCat = 'Undetectable (<50 copies/mL)';
  } else if (!isNaN(numVl)) {
    if (numVl < 1000) vlCat = 'Suppressed (<1000 copies/mL)';
    else vlCat = 'Unsuppressed (≥1000 copies/mL)';
  }

  const rawHb = it['36\nHemoglobin (g/dL)'] ?? it['hemoglobin (g/dl)'] ?? it.clinical?.hemoglobin ?? it.clinical?.haemoglobin ?? it.hemoglobin ?? '';
  const numHb = parseFloat(String(rawHb));
  let hbCat: HbCategory = 'Normal';
  if (!isNaN(numHb) && numHb > 0) {
    if (numHb < 7.0) hbCat = 'Severe Anemia';
    else if (numHb < 10.0) hbCat = 'Moderate Anemia';
    else if (numHb < 11.0) hbCat = 'Mild Anemia';
  }

  const id = readiness.recordId;
  const artNumber = readiness.artNumber;
  const childName = readiness.childName;
  const caregiverName =
    it['14\nCaregiver Full Name'] ||
    it['caregiver full name'] ||
    it.demographics?.caregiverName ||
    it.caregiver_name ||
    it.caregiverName ||
    'Caregiver';
  const caregiverPhone =
    it['16\nCaregiver Contact'] ||
    it['caregiver contact'] ||
    it.demographics?.caregiverPhone ||
    it.demographics?.contactNumber ||
    it.caregiver_phone ||
    it.caregiverPhone ||
    undefined;
  const age = readiness.age;
  const gender = it['12\nGender'] || it['gender'] || it.demographics?.gender || it.gender || '—';
  const district = it['19\nDistrict'] || it['district'] || it.demographics?.district || it.district || 'General';
  const rawState = it['18\nState'] || it['state'] || it.demographics?.state || it.state || 'Maharashtra';
  const state = canonicalizeStateName(rawState) || rawState;
  const schoolType = it['53\nSchool Type'] || it['school type'] || it.educationStatus?.schoolType || it.education?.schoolType || it.school_type || 'Government school';
  const schoolEnrolled = readiness.isEnrolledInSchool;
  const orphanStatus = readiness.orphanClassification;
  const grantAmount = readiness.grantAmount;
  const createdAt =
    it['3\nSubmission Time'] ||
    it.submissionTime ||
    it.created_at ||
    it.createdAt ||
    it['7\nVisit Date'] ||
    it['visit date'] ||
    it['73\nLast Updated'] ||
    it.updatedAt ||
    new Date().toISOString();
  const updatedAt = it['73\nLast Updated'] || it.updated_at || it.updatedAt || undefined;
  const lastVisit = (it['7\nVisit Date'] || it['visit date'] || it['73\nLast Updated'] || it['3\nSubmission Time'] || it.updatedAt || it.createdAt || new Date().toISOString()).split('T')[0];
  const version = Number(it['2\nRevision Number'] ?? it['revision number'] ?? it.version ?? 1);
  const editReason = it['4\nEdit Reason'] || it['48\nEdit Reason'] || it.editReason || it.edit_reason || undefined;
  const sheetRow = it.sheetRow ?? it.rowNumber ?? undefined;
  const remoteSubmissionId = it.remote_submission_id || it.remoteSubmissionId || it._uuid || undefined;
  const documentStatus = {
    isComplete: readiness.isComplete,
    totalRequired: readiness.totalRequired,
    uploadedCount: readiness.uploadedCount,
    pendingDocs: readiness.missingDocTypes,
    uploadedDocs: readiness.presentDocTypes,
  };

  const isApproved = readiness.isApproved;
  const approvedStatus = readiness.approvalStatus;

  const stages = deriveSubmissionStages(it);
  const submittedBy =
    it['70\nForm Submitted By'] ||
    it['form submitted by'] ||
    it.submittedBy ||
    it['5\nInterviewer Name'] ||
    it.interviewerName ||
    it.demographics?.interviewerName ||
    it.raw_payload?.interviewerName ||
    it.payload?.interviewerName ||
    'Field Worker';

  const interviewerName =
    it['5\nInterviewer Name'] ||
    it['interviewer name'] ||
    it.interviewerName ||
    it.submittedBy ||
    it.demographics?.interviewerName ||
    it.raw_payload?.interviewerName ||
    it.payload?.interviewerName ||
    'Field Worker';

  const srName =
    it['75\nSR Name'] ||
    it['sr name'] ||
    it.srName ||
    it.sr_name ||
    it.demographics?.srName ||
    it.raw_payload?.demographics?.srName ||
    it.payload?.demographics?.srName ||
    '';

  const ssrName =
    it['76\nSSR Name'] ||
    it['ssr name'] ||
    it.ssrName ||
    it.ssr_name ||
    it.demographics?.ssrName ||
    it.raw_payload?.demographics?.ssrName ||
    it.payload?.demographics?.ssrName ||
    '';

  return {
    id: String(id),
    artNumber: String(artNumber),
    childName: String(childName),
    caregiverName: String(caregiverName),
    caregiverPhone: caregiverPhone ? String(caregiverPhone) : undefined,
    age,
    gender: String(gender),
    district: String(district),
    state: String(state),
    schoolType: String(schoolType),
    schoolEnrolled: Boolean(schoolEnrolled),
    orphanStatus: String(orphanStatus),
    bmi: readiness.bmi,
    bmiCategory: (it['35\nBMI Category'] || it['bmi category'] || it.clinical?.bmiCategory || it.bmicategory || bmiCat) as BMICategory,
    viralLoad: String(rawVl || '—'),
    vlCategory: (it['46\nVL Category'] || it['vl category'] || it.clinical?.vlCategory || it.vl_category || vlCat) as VLCategory,
    hemoglobin: String(rawHb || '—'),
    hbCategory: (it['37\nHb Category'] || it['hb category'] || it.clinical?.hbCategory || it.hb_category || hbCat) as HbCategory,
    grantAmount,
    syncState: 'SYNCED',
    lastVisit,
    createdAt: String(createdAt),
    updatedAt: updatedAt ? String(updatedAt) : undefined,
    editReason: editReason ? String(editReason) : undefined,
    sheetRow,
    remoteSubmissionId: remoteSubmissionId ? String(remoteSubmissionId) : undefined,
    rawRecord: it,
    version,
    documentStatus,
    isApproved,
    approvedStatus,
    readiness,
    submittedBy: String(submittedBy),
    interviewerName: String(interviewerName),
    srName: String(srName),
    ssrName: String(ssrName),
    stages,
  };
}

class SupervisorReadModelService {
  private state: SupervisorReadModelState = {
    status: 'idle',
    records: [],
    total: 0,
    lastRefreshed: null,
    lastSuccessAt: null,
    error: null,
    isOnline: true,
    consecutiveFailures: 0,
    networkStatus: 'online',
    dataSource: 'live',
    syncStatus: 'synced',
  };

  private listeners: Set<() => void> = new Set();
  private inFlightPromise: Promise<void> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;
  private hasHydratedClient = false;
  private hasBoundWindowEvents = false;
  private activeFilters: { state?: string; district?: string } = {};

  constructor() {
    // Defer browser cache restoration and navigator checks until after client hydration
    // to ensure SSR HTML matches the initial client render deterministically.
  }

  public hydrateClientState(): void {
    if (typeof window === 'undefined' || this.hasHydratedClient) return;
    this.hasHydratedClient = true;
    this.state.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.state.networkStatus = getBrowserNetworkHint();
    this.restoreCache();
    this.bindWindowEvents();
    this.notify();
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public getSnapshot(): SupervisorReadModelState {
    return this.state;
  }

  public getState(): SupervisorReadModelState {
    return this.state;
  }

  public getActiveFilters(): { state?: string; district?: string } {
    return { ...this.activeFilters };
  }

  public resetForTesting(initial?: Partial<SupervisorReadModelState>) {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.inFlightPromise = null;
    this.isInitialized = false;
    this.hasHydratedClient = false;
    this.activeFilters = {};
    this.state = {
      status: 'idle',
      records: [],
      total: 0,
      lastRefreshed: null,
      lastSuccessAt: null,
      error: null,
      isOnline: true,
      consecutiveFailures: 0,
      networkStatus: 'online',
      dataSource: 'live',
      syncStatus: 'synced',
      ...initial,
    };
    this.notify();
  }

  public startPolling(intervalMs: number = SUCCESS_POLL_INTERVAL_MS) {
    this.schedulePoll(intervalMs);
  }

  public stopPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public isInitializedState(): boolean {
    return this.isInitialized;
  }

  public initiateFetch(force: boolean = false) {
    this.isInitialized = true;
    return this.fetchSubmissions({ force });
  }

  public purgeSession() {
    this.stopPolling();
    this.inFlightPromise = null;
    this.isInitialized = false;
    this.hasHydratedClient = false;
    this.activeFilters = {};
    this.clearCache();
    this.state = {
      status: 'idle',
      records: [],
      total: 0,
      lastRefreshed: null,
      lastSuccessAt: null,
      error: null,
      isOnline: true,
      consecutiveFailures: 0,
      networkStatus: getBrowserNetworkHint(),
      dataSource: 'local-only',
      syncStatus: 'synced',
    };
    this.notify();
  }

  public subscribe(listener: () => void, options?: { enabled?: boolean }): () => void {
    this.listeners.add(listener);
    if (options?.enabled !== false && !this.isInitialized) {
      this.isInitialized = true;
      this.fetchSubmissions({ force: false }).catch(() => {});
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
    };
  }

  public setRecords(updater: React.SetStateAction<SupervisorBeneficiaryRow[]>) {
    const next = typeof updater === 'function' ? updater(this.state.records) : updater;
    this.state = {
      ...this.state,
      records: next,
      total: next.length,
    };
    this.notify();
  }

  private restoreCache() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const cached = localStorage.getItem(CACHE_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const currentScope = getCurrentSessionScopeSignature();
        if (parsed.scopeKey && currentScope && parsed.scopeKey !== currentScope) {
          this.clearCache();
          return;
        }
        if (Array.isArray(parsed.records) && parsed.records.length > 0) {
          this.state = {
            ...this.state,
            records: parsed.records,
            total: parsed.total || parsed.records.length,
            lastRefreshed: parsed.lastSuccessAt ? new Date(parsed.lastSuccessAt) : null,
            lastSuccessAt: parsed.lastSuccessAt ? new Date(parsed.lastSuccessAt) : null,
            status: 'offline_cache',
            dataSource: 'cache',
            networkStatus: getBrowserNetworkHint(),
            syncStatus: 'synced',
          };
        }
      }
    } catch {
      // Ignore corrupted localStorage cache
    }
  }

  private saveCache(records: SupervisorBeneficiaryRow[], total: number) {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        CACHE_STORAGE_KEY,
        JSON.stringify({
          records,
          total,
          lastSuccessAt: new Date().toISOString(),
          scopeKey: getCurrentSessionScopeSignature(),
        })
      );
    } catch {
      // Storage quota or privacy mode
    }
  }

  public clearCache() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(CACHE_STORAGE_KEY);
    } catch {
      // Storage quota or privacy mode
    }
  }

  private bindWindowEvents() {
    if (typeof window === 'undefined' || this.hasBoundWindowEvents) return;
    this.hasBoundWindowEvents = true;

    window.addEventListener('online', () => {
      this.state.isOnline = true;
      this.state.networkStatus = 'online';
      this.state.consecutiveFailures = 0;
      this.notify();
      this.fetchSubmissions({ force: true }).catch(() => {});
    });

    window.addEventListener('offline', () => {
      this.state.isOnline = false;
      this.state.networkStatus = 'offline';
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.state.records.length > 0) {
        this.state.status = 'offline_cache';
        this.state.dataSource = 'cache';
      } else {
        this.state.dataSource = 'local-only';
      }
      this.state.syncStatus = 'pending';
      this.notify();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const lastSuccess = this.state.lastSuccessAt ? this.state.lastSuccessAt.getTime() : 0;
        if (now - lastSuccess > SUCCESS_POLL_INTERVAL_MS || this.state.status === 'error') {
          this.fetchSubmissions({ force: false }).catch(() => {});
        } else {
          this.schedulePoll(SUCCESS_POLL_INTERVAL_MS - (now - lastSuccess));
        }
      } else {
        if (this.pollTimer) {
          clearTimeout(this.pollTimer);
          this.pollTimer = null;
        }
      }
    });

    const handleSyncComplete = () => {
      this.fetchSubmissions({ force: true }).catch(() => {});
    };
    window.addEventListener('child_nutrition:sync_completed', handleSyncComplete);
    window.addEventListener('child_nutrition:record_synced', handleSyncComplete);
  }

  private schedulePoll(delayMs: number) {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    const isHidden = typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible';
    if (isHidden || !this.state.isOnline) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      this.fetchSubmissions({ force: false }).catch(() => {});
    }, Math.max(1000, delayMs));
  }

  public async fetchSubmissions(options?: { force?: boolean; state?: string; district?: string }): Promise<void> {
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    if (typeof window !== 'undefined') {
      try {
        const isStoredUnlocked = localStorage.getItem('child_nutrition_evaluation_unlocked') === 'true';
        const cachedUser = localStorage.getItem('child_nutrition:user_session_v1');
        const parsed = cachedUser ? JSON.parse(cachedUser) : null;
        if (!isStoredUnlocked || !parsed?.isVerified) return;
      } catch {
        return;
      }
    }

    if (options?.state !== undefined) {
      this.activeFilters.state = options.state === 'ALL' || !options.state ? undefined : options.state;
    }
    if (options?.district !== undefined) {
      this.activeFilters.district = options.district === 'ALL' || !options.district ? undefined : options.district;
    }

    if (!this.state.isOnline) {
      this.state.networkStatus = 'offline';
      if (this.state.records.length > 0) {
        this.state.status = 'offline_cache';
        this.state.dataSource = 'cache';
      } else {
        this.state.dataSource = 'local-only';
      }
      this.state.syncStatus = 'pending';
      this.notify();
      return;
    }

    this.inFlightPromise = (async () => {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }

      // Do not enter loading screen if we already have records (silent background refresh)
      if (this.state.records.length === 0) {
        this.state = {
          ...this.state,
          status: 'loading',
        };
        this.notify();
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const baseParams: string[] = ['limit=100'];
        if (this.activeFilters.state) {
          baseParams.push(`state=${encodeURIComponent(this.activeFilters.state)}`);
        }
        if (this.activeFilters.district) {
          baseParams.push(`district=${encodeURIComponent(this.activeFilters.district)}`);
        }

        const MAX_FETCH_PAGES = 50;
        const allRawItems: any[] = [];
        const seenItemKeys = new Set<string>();
        const seenCursors = new Set<string>();
        let pageCursor: string | null = null;
        let reportedTotal = 0;

        for (let pageIndex = 0; pageIndex < MAX_FETCH_PAGES; pageIndex++) {
          const queryParts = [...baseParams];
          if (pageCursor) {
            queryParts.push(`cursor=${encodeURIComponent(pageCursor)}`);
          }
          const url = `/api/submissions?${queryParts.join('&')}`;

          const res = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store',
              Pragma: 'no-cache',
            },
            signal: controller.signal,
          });

          if (!res.ok) {
            clearTimeout(timeoutId);
            // If a subsequent page fails while we already have page 1 records, keep partial result safely
            if (pageIndex > 0 && allRawItems.length > 0) {
              break;
            }
            let errCode = res.status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'VALIDATION_ERROR';
            let errMsg = `Server returned HTTP ${res.status}`;
            let retryable = res.status !== 400 && res.status !== 401 && res.status !== 403;
            let reqId: string | undefined;

            try {
              const errBody = await res.json();
              if (errBody && typeof errBody === 'object') {
                if (errBody.code) errCode = errBody.code;
                if (errBody.message) errMsg = errBody.message;
                if (typeof errBody.retryable === 'boolean') retryable = errBody.retryable;
                if (errBody.requestId) reqId = errBody.requestId;
              }
            } catch {
              errMsg = `Gateway returned HTTP ${res.status}: ${res.statusText}`;
            }

            const nextFailures = this.state.consecutiveFailures + 1;
            const errorObj = {
              code: errCode,
              message: errMsg,
              retryable,
              statusCode: res.status,
              requestId: reqId,
            };

            // Auth or scope failure: halt polling immediately and purge records
            if (res.status === 401) {
              this.clearCache();
              this.stopPolling();
              this.state = {
                ...this.state,
                records: [],
                total: 0,
                dataSource: 'local-only',
                status: 'unauthorized',
                consecutiveFailures: nextFailures,
                networkStatus: getBrowserNetworkHint() === 'offline' ? 'offline' : 'online',
                syncStatus: 'failed',
                error: errorObj,
              };
              this.notify();
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('child_nutrition:session_unauthorized'));
              }
              return;
            }

            if (res.status === 403) {
              this.clearCache();
              this.stopPolling();
              this.state = {
                ...this.state,
                records: [],
                total: 0,
                dataSource: 'local-only',
                status: 'forbidden',
                consecutiveFailures: nextFailures,
                networkStatus: getBrowserNetworkHint() === 'offline' ? 'offline' : 'online',
                syncStatus: 'failed',
                error: errorObj,
              };
              this.notify();
              return;
            }

            // Non-retryable error (terminal 4xx): halt polling completely!
            if (!retryable || res.status === 400) {
              this.stopPolling();
              this.state = {
                ...this.state,
                status: 'error',
                consecutiveFailures: nextFailures,
                networkStatus: getBrowserNetworkHint() === 'offline' ? 'offline' : 'online',
                syncStatus: 'failed',
                error: errorObj,
              };
              this.notify();
              return;
            }

            // Retryable error: retain cached records if available, otherwise show error
            this.state = {
              ...this.state,
              status: this.state.records.length > 0 ? 'offline_cache' : 'error',
              dataSource: this.state.records.length > 0 ? 'cache' : 'local-only',
              consecutiveFailures: nextFailures,
              networkStatus: getBrowserNetworkHint() === 'offline' ? 'offline' : 'online',
              syncStatus: retryable ? 'retrying' : 'failed',
              error: errorObj,
            };
            this.notify();

            // Exponential backoff with jitter
            const backoff = Math.min(
              10000 * Math.pow(1.5, Math.min(nextFailures, 5)),
              MAX_BACKOFF_MS
            ) + Math.random() * 2000;

            if (nextFailures < 6) {
              this.schedulePoll(backoff);
            }
            return;
          }

          const json = await res.json();
          let pageItems: any[] = [];
          if (json.data && Array.isArray(json.data.records)) {
            pageItems = json.data.records;
          } else if (Array.isArray(json.data)) {
            pageItems = json.data;
          } else if (Array.isArray(json.items)) {
            pageItems = json.items;
          }

          if (pageIndex === 0) {
            reportedTotal = json.data?.total ?? json.pagination?.totalCount ?? pageItems.length;
          }

          let addedThisPage = 0;
          for (const rawItem of pageItems) {
            const keyCandidate =
              rawItem?.id ||
              rawItem?.clientSubmissionId ||
              rawItem?.client_submission_id ||
              rawItem?.remoteSubmissionId ||
              rawItem?.remote_submission_id ||
              rawItem?.uniqueId ||
              rawItem?.['1\nUnique ID'];
            const keyStr = keyCandidate ? String(keyCandidate) : null;
            if (keyStr && seenItemKeys.has(keyStr)) {
              continue;
            }
            if (keyStr) seenItemKeys.add(keyStr);
            allRawItems.push(rawItem);
            addedThisPage++;
          }

          const nextCursor = json.data?.nextCursor ?? json.pagination?.nextCursor ?? null;
          if (
            !nextCursor ||
            typeof nextCursor !== 'string' ||
            pageItems.length === 0 ||
            addedThisPage === 0 ||
            seenCursors.has(nextCursor)
          ) {
            break;
          }
          seenCursors.add(nextCursor);
          pageCursor = nextCursor;
        }

        clearTimeout(timeoutId);

        const mapped = allRawItems.map(parseBeneficiaryRecord);
        const now = new Date();

        this.state = {
          records: mapped,
          total: Math.max(reportedTotal || 0, mapped.length),
          status: mapped.length === 0 ? 'empty' : 'success',
          lastRefreshed: now,
          lastSuccessAt: now,
          error: null,
          isOnline: true,
          consecutiveFailures: 0,
          networkStatus: 'online',
          dataSource: 'live',
          syncStatus: 'synced',
        };

        if (mapped.length > 0) {
          this.saveCache(mapped, this.state.total);
        } else {
          this.clearCache();
        }

        this.notify();
        this.schedulePoll(SUCCESS_POLL_INTERVAL_MS);
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isAbort = err?.name === 'AbortError';
        const nextFailures = this.state.consecutiveFailures + 1;
        this.state = {
          ...this.state,
          consecutiveFailures: nextFailures,
          networkStatus: getBrowserNetworkHint() === 'offline' ? 'offline' : 'online',
          syncStatus: 'retrying',
          status: this.state.records.length > 0 ? 'offline_cache' : 'error',
          dataSource: this.state.records.length > 0 ? 'cache' : 'local-only',
          error: {
            code: isAbort ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
            message: isAbort
              ? 'Request to central bridge timed out after 15 seconds.'
              : 'Unable to connect to records server. Check your connection.',
            retryable: true,
          },
        };
        this.notify();

        const backoff = Math.min(
          10000 * Math.pow(1.5, Math.min(this.state.consecutiveFailures, 5)),
          MAX_BACKOFF_MS
        ) + Math.random() * 2000;

        if (this.state.consecutiveFailures < 6) {
          this.schedulePoll(backoff);
        }
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }
}

export const supervisorReadModel = new SupervisorReadModelService();
