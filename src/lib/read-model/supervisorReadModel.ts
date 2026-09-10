import type { BMICategory, VLCategory, HbCategory } from '@/types/domain';

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
  age: number;
  gender: string;
  district: string;
  state: string;
  schoolType: string;
  schoolEnrolled: boolean;
  orphanStatus: string;
  bmi: number;
  bmiCategory: BMICategory;
  viralLoad: string;
  vlCategory: VLCategory;
  hemoglobin: string;
  hbCategory: HbCategory;
  grantAmount: number;
  syncState: 'SYNCED' | 'QUEUED';
  lastVisit: string;
  version: number;
  documentStatus: BeneficiaryDocumentStatus;
  isApproved: boolean;
  approvedStatus: string;
}

export type SupervisorDataStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'offline_cache';

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

export function evaluateDocuments(it: any, schoolTypeStr: string): BeneficiaryDocumentStatus {
  const pendingDocs: string[] = [];
  const uploadedDocs: string[] = [];

  const passbook =
    it['25\nPassbook Front Page Link'] ||
    it['25\\nPassbook Front Page Link'] ||
    it['Passbook Front Page Link'] ||
    it['passbook front page link'] ||
    it.passbookPhotoUrl ||
    it.passbook_photo_url ||
    it.bankingAndKyc?.passbookPhotoUrl ||
    it.bankDetails?.passbookPhotoCaptured ||
    it.raw_payload?.bankingAndKyc?.passbookPhotoUrl;
  if (isFieldPresent(passbook)) {
    uploadedDocs.push('Bank Passbook Front Page');
  } else {
    pendingDocs.push('Bank Passbook Front Page');
  }

  const aadhaar =
    it['26\nAadhaar Card Link'] ||
    it['26\\nAadhaar Card Link'] ||
    it['Aadhaar Card Link'] ||
    it['aadhaar card link'] ||
    it.aadhaarCardPhotoUrl ||
    it.aadhaar_card_photo_url ||
    it.bankingAndKyc?.aadhaarCardPhotoUrl ||
    it.raw_payload?.bankingAndKyc?.aadhaarCardPhotoUrl;
  if (isFieldPresent(aadhaar)) {
    uploadedDocs.push('Aadhaar Card');
  } else {
    pendingDocs.push('Aadhaar Card');
  }

  const childPhoto =
    it['27\nPassport Size Photo Link'] ||
    it['27\\nPassport Size Photo Link'] ||
    it['Passport Size Photo Link'] ||
    it['passport size photo link'] ||
    it.childPhotoUrl ||
    it.child_photo_url ||
    it.bankingAndKyc?.childPhotoUrl ||
    it.raw_payload?.bankingAndKyc?.childPhotoUrl;
  if (isFieldPresent(childPhoto)) {
    uploadedDocs.push('Passport Size Photo');
  } else {
    pendingDocs.push('Passport Size Photo');
  }

  const signature =
    it['6\nSignature /\nThumb Impression'] ||
    it['6\\nSignature /\\nThumb Impression'] ||
    it['Signature /\nThumb Impression'] ||
    it['signature'] ||
    it.consentSignatureUrl ||
    it.signature_url ||
    it.consent?.caregiverSignature ||
    it.raw_payload?.consent?.caregiverSignature;
  if (isFieldPresent(signature)) {
    uploadedDocs.push('Caregiver Signature');
  } else {
    pendingDocs.push('Caregiver Signature');
  }

  const isOutOfSchool =
    schoolTypeStr.toLowerCase().includes('out of school') ||
    schoolTypeStr.toLowerCase().includes('not in school') ||
    schoolTypeStr.toLowerCase().includes('dropped out') ||
    schoolTypeStr.toLowerCase().includes('never enrolled');

  if (!isOutOfSchool) {
    const feeReceipt =
      it['64\nSchool Fee Receipt Link'] ||
      it['64\\nSchool Fee Receipt Link'] ||
      it['School Fee Receipt Link'] ||
      it['school fee receipt link'] ||
      it.feeReceiptPhotoUrl ||
      it.fee_receipt_photo_url ||
      it.educationExpenses?.feeReceiptPhotoUrl ||
      it.raw_payload?.educationExpenses?.feeReceiptPhotoUrl;
    if (isFieldPresent(feeReceipt)) {
      uploadedDocs.push('School Fee Receipt');
    } else {
      pendingDocs.push('School Fee Receipt');
    }

    const marksheet =
      it['65\nMarksheet Photo Link'] ||
      it['65\\nMarksheet Photo Link'] ||
      it['Marksheet Photo Link'] ||
      it['marksheet photo link'] ||
      it.marksheetPhotoUrl ||
      it.marksheet_photo_url ||
      it.educationExpenses?.marksheetPhotoUrl ||
      it.raw_payload?.educationExpenses?.marksheetPhotoUrl;
    if (isFieldPresent(marksheet)) {
      uploadedDocs.push('Academic Marksheet');
    } else {
      pendingDocs.push('Academic Marksheet');
    }
  }

  const totalRequired = uploadedDocs.length + pendingDocs.length;
  const isComplete = pendingDocs.length === 0;

  return {
    isComplete,
    totalRequired,
    uploadedCount: uploadedDocs.length,
    pendingDocs,
    uploadedDocs,
  };
}

export function parseBeneficiaryRecord(it: any): SupervisorBeneficiaryRow {
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

  const id = it['1\nUnique ID'] || it['unique id'] || it.id || it._uuid || it.client_submission_id || it.remote_submission_id || it.clientSubmissionId;
  const artNumber = it['42\nART ID Number'] || it['art id number'] || it['1\nUnique ID'] || it.demographics?.artNumber || it.art_number || id || 'MH-BEN-00';
  const childName = it['9\nChild Name'] || it['child name'] || it.demographics?.childName || it.child_name || 'Beneficiary Child';
  const age = Number(it['11\nAge'] ?? it['age'] ?? it.demographics?.calculatedAgeYears ?? it.calculated_age ?? 0);
  const gender = it['12\nGender'] || it['gender'] || it.demographics?.gender || it.gender || '—';
  const district = it['19\nDistrict'] || it['district'] || it.demographics?.district || it.district || 'General';
  const state = it['18\nState'] || it['state'] || it.demographics?.state || it.state || 'Maharashtra';
  const schoolType = it['53\nSchool Type'] || it['school type'] || it.educationStatus?.schoolType || it.education?.schoolType || it.school_type || 'Government school';
  const schoolEnrolled = it['49\nEducation Status']
    ? !String(it['49\nEducation Status']).toLowerCase().includes('not')
    : (it.education?.educationStatus?.includes('going') ?? it.school_enrolled ?? true);
  const orphanStatus = it['13\nOrphan Status'] || it['orphan status'] || it.demographics?.orphanStatus || it.orphan_status || 'Both parents alive';
  const grantAmount = Number(it['63\nTotal Annual Education Cost'] ?? it['total annual education cost'] ?? it.grantCalculation?.totalGrantAmount ?? it.recommended_grant_amount ?? it.educationExpenses?.totalRequiredSupport ?? 0);
  const lastVisit = (it['7\nVisit Date'] || it['visit date'] || it['73\nLast Updated'] || it['3\nSubmission Time'] || it.updatedAt || it.createdAt || new Date().toISOString()).split('T')[0];
  const version = Number(it['2\nRevision Number'] ?? it['revision number'] ?? it.version ?? 1);
  const documentStatus = evaluateDocuments(it, schoolType);

  const rawApproved =
    it['67\nApproved Alliance India'] ||
    it['67\\nApproved Alliance India'] ||
    it['Approved Alliance India'] ||
    it['approved alliance india'] ||
    it.approvedAllianceIndia ||
    it.approved_alliance_india ||
    it.finalReview?.approvedAllianceIndia ||
    it.raw_payload?.finalReview?.approvedAllianceIndia;

  const isApproved =
    typeof rawApproved === 'boolean'
      ? rawApproved
      : String(rawApproved || '').toLowerCase().includes('approv') ||
        String(rawApproved || '').toLowerCase() === 'yes';

  const approvedStatus = isApproved ? 'Approved' : String(rawApproved || 'Pending');

  return {
    id: String(id),
    artNumber: String(artNumber),
    childName: String(childName),
    age,
    gender: String(gender),
    district: String(district),
    state: String(state),
    schoolType: String(schoolType),
    schoolEnrolled: Boolean(schoolEnrolled),
    orphanStatus: String(orphanStatus),
    bmi: numBmi,
    bmiCategory: (it['35\nBMI Category'] || it['bmi category'] || it.clinical?.bmiCategory || it.bmicategory || bmiCat) as BMICategory,
    viralLoad: String(rawVl || '—'),
    vlCategory: (it['46\nVL Category'] || it['vl category'] || it.clinical?.vlCategory || it.vl_category || vlCat) as VLCategory,
    hemoglobin: String(rawHb || '—'),
    hbCategory: (it['37\nHb Category'] || it['hb category'] || it.clinical?.hbCategory || it.hb_category || hbCat) as HbCategory,
    grantAmount,
    syncState: 'SYNCED',
    lastVisit,
    version,
    documentStatus,
    isApproved,
    approvedStatus,
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
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    consecutiveFailures: 0,
  };

  private listeners: Set<() => void> = new Set();
  private inFlightPromise: Promise<void> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;

  constructor() {
    this.restoreCache();
    this.bindWindowEvents();
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

  public resetForTesting(initial?: Partial<SupervisorReadModelState>) {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.inFlightPromise = null;
    this.isInitialized = false;
    this.state = {
      status: 'idle',
      records: [],
      total: 0,
      lastRefreshed: null,
      lastSuccessAt: null,
      error: null,
      isOnline: true,
      consecutiveFailures: 0,
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

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.isInitialized) {
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
        if (Array.isArray(parsed.records) && parsed.records.length > 0) {
          this.state = {
            ...this.state,
            records: parsed.records,
            total: parsed.total || parsed.records.length,
            lastRefreshed: parsed.lastSuccessAt ? new Date(parsed.lastSuccessAt) : null,
            lastSuccessAt: parsed.lastSuccessAt ? new Date(parsed.lastSuccessAt) : null,
            status: 'offline_cache',
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
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.state.isOnline = true;
      this.state.consecutiveFailures = 0;
      this.notify();
      this.fetchSubmissions({ force: true }).catch(() => {});
    });

    window.addEventListener('offline', () => {
      this.state.isOnline = false;
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.state.records.length > 0) {
        this.state.status = 'offline_cache';
      }
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

  public async fetchSubmissions(options?: { force?: boolean }): Promise<void> {
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    if (!this.state.isOnline) {
      if (this.state.records.length > 0) {
        this.state.status = 'offline_cache';
      }
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
        this.state.status = 'loading';
        this.notify();
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch('/api/submissions?limit=100', {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store',
            Pragma: 'no-cache',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
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

          this.state.consecutiveFailures += 1;
          this.state.error = {
            code: errCode,
            message: errMsg,
            retryable,
            statusCode: res.status,
            requestId: reqId,
          };

          // Non-retryable error (terminal 4xx): halt polling completely!
          if (!retryable || [400, 401, 403].includes(res.status)) {
            this.state.status = 'error';
            this.notify();
            return;
          }

          // Retryable error: retain cached records if available, otherwise show error
          if (this.state.records.length > 0) {
            this.state.status = 'offline_cache';
          } else {
            this.state.status = 'error';
          }

          this.notify();

          // Exponential backoff with jitter
          const backoff = Math.min(
            10000 * Math.pow(1.5, Math.min(this.state.consecutiveFailures, 5)),
            MAX_BACKOFF_MS
          ) + Math.random() * 2000;

          if (this.state.consecutiveFailures < 6) {
            this.schedulePoll(backoff);
          }
          return;
        }

        const json = await res.json();
        let rawItems: any[] = [];
        if (json.data && Array.isArray(json.data.records)) {
          rawItems = json.data.records;
        } else if (Array.isArray(json.data)) {
          rawItems = json.data;
        } else if (Array.isArray(json.items)) {
          rawItems = json.items;
        }

        const reportedTotal = json.data?.total ?? json.pagination?.totalCount ?? rawItems.length;
        const mapped = rawItems.map(parseBeneficiaryRecord);
        const now = new Date();

        this.state = {
          records: mapped,
          total: reportedTotal > 0 ? reportedTotal : mapped.length,
          status: mapped.length === 0 ? 'empty' : 'success',
          lastRefreshed: now,
          lastSuccessAt: now,
          error: null,
          isOnline: true,
          consecutiveFailures: 0,
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
        this.state.consecutiveFailures += 1;
        this.state.error = {
          code: isAbort ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
          message: isAbort
            ? 'Request to central bridge timed out after 15 seconds.'
            : 'Unable to connect to records server. Check your connection.',
          retryable: true,
        };

        if (this.state.records.length > 0) {
          this.state.status = 'offline_cache';
        } else {
          this.state.status = 'error';
        }

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
