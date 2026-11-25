'use client';

import { getAllDrafts } from '@/lib/db/draftRepository';
import { getAllQueueItems } from '@/lib/db/syncQueueRepository';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';
import type { EvaluationUser } from '@/lib/auth/evaluationAccess';
import { parseBeneficiaryRecord } from '@/lib/read-model/supervisorReadModel';
import type { SupervisorBeneficiaryRow } from '@/hooks/useSupervisorData';

export type PortalId = 'drafts' | 'docs' | 'bank' | 'submitted';

export interface PortalDefinition {
  id: PortalId;
  href: string;
  slowLoadingText: string;
  destinationKind: 'drafts' | 'sync';
  syncTab?: 'docs' | 'bank_pending' | 'synced';
}

export const PORTAL_DEFINITIONS: Record<PortalId, PortalDefinition> = {
  drafts: {
    id: 'drafts',
    href: '/assessment/drafts',
    slowLoadingText: 'Opening unfinished child records…',
    destinationKind: 'drafts',
  },
  docs: {
    id: 'docs',
    href: '/assessment/sync?tab=docs',
    slowLoadingText: 'Opening document follow-ups…',
    destinationKind: 'sync',
    syncTab: 'docs',
  },
  bank: {
    id: 'bank',
    href: '/assessment/sync?tab=bank',
    slowLoadingText: 'Opening bank details…',
    destinationKind: 'sync',
    syncTab: 'bank_pending',
  },
  submitted: {
    id: 'submitted',
    href: '/assessment/sync?tab=synced',
    slowLoadingText: 'Opening submitted assessments…',
    destinationKind: 'sync',
    syncTab: 'synced',
  },
};

export const PORTAL_TRANSITION_DURATION_MS = 340;
export const PORTAL_WARM_TTL_MS = 15_000;
export const PORTAL_FETCH_TIMEOUT_MS = 12_000;
export const PORTAL_MAX_CACHE_ENTRIES = 24;

export interface RouterPrefetchLike {
  prefetch?: (href: string) => void | Promise<void>;
  push?: (href: string) => void | Promise<void>;
  replace?: (href: string) => void | Promise<void>;
}

export interface PortalDraftsWarmData {
  drafts: AssessmentRecord[];
  queueItems: SyncQueueItem[];
  fetchedAt: number;
}

export interface PortalSyncLocalWarmData {
  drafts: AssessmentRecord[];
  queueItems: SyncQueueItem[];
  fetchedAt: number;
}

export interface PortalSyncServerWarmData {
  records: SupervisorBeneficiaryRow[];
  total: number;
  fetchedAt: number;
}

interface CacheEntry<T> {
  key: string;
  principalKey: string;
  destination: string;
  filtersKey: string;
  data: T;
  storedAt: number;
}

interface InFlightEntry<T> {
  key: string;
  principalKey: string;
  promise: Promise<T>;
  controller: AbortController | null;
  ownership: 'speculative' | 'destination';
  timeoutId: ReturnType<typeof setTimeout> | null;
}

export interface FieldPrincipalInput {
  user?: Pick<EvaluationUser, 'userId' | 'role' | 'allowedStates' | 'allowedDistricts' | 'isVerified'> | null;
  fieldProfile?: Record<string, any> | null;
}

const cacheStore = new Map<string, CacheEntry<any>>();
const inFlightStore = new Map<string, InFlightEntry<any>>();
const routePrefetchTimestamps = new Map<string, number>();
const warmedModules = new Set<string>();

let lastActivePrincipalKey: string | null = null;
let listenersBound = false;

function stableSortList(values: unknown): string {
  if (!Array.isArray(values)) return '';
  return [...values]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
}

export function serializePortalFilters(filters?: Record<string, string | number | boolean | null | undefined>): string {
  if (!filters) return 'default';
  const entries = Object.entries(filters)
    .filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return 'default';
  return entries.map(([k, v]) => `${k}=${String(v).trim()}`).join('&');
}

export function buildPortalCacheKey(params: {
  principalKey: string;
  destination: string;
  filters?: Record<string, string | number | boolean | null | undefined>;
}): string {
  const filtersKey = serializePortalFilters(params.filters);
  return `${params.principalKey}::${params.destination}::${filtersKey}`;
}

/**
 * Resolves a deterministic principal+scope cache key strictly for authorised field workers.
 * Returns `null` for non-field roles (LEADERSHIP, STATE_REVIEWER, ADMIN) or unauthenticated callers.
 */
export function resolveFieldPrincipalKey(input?: FieldPrincipalInput): string | null {
  let resolvedUser = input?.user ?? null;
  let resolvedProfile = input?.fieldProfile ?? null;

  if (typeof window !== 'undefined') {
    if (!resolvedUser) {
      try {
        const rawUser = localStorage.getItem('child_nutrition:user_session_v1');
        if (rawUser) {
          resolvedUser = JSON.parse(rawUser);
        }
      } catch {
        resolvedUser = null;
      }
    }
    if (!resolvedProfile) {
      try {
        const rawProfile = localStorage.getItem('field_user_profile');
        if (rawProfile) {
          resolvedProfile = JSON.parse(rawProfile);
        }
      } catch {
        resolvedProfile = null;
      }
    }
  }

  // Strictly block Evaluation/Supervisory roles from using field-worker portal caches
  if (
    resolvedUser &&
    resolvedUser.role &&
    resolvedUser.role !== 'FIELD_USER'
  ) {
    return null;
  }

  const hasVerifiedFieldUser = Boolean(
    resolvedUser && resolvedUser.isVerified && resolvedUser.role === 'FIELD_USER'
  );
  const hasStoredFieldProfile = Boolean(
    resolvedProfile &&
      (resolvedProfile.id ||
        resolvedProfile.workerId ||
        resolvedProfile.googleEmail ||
        resolvedProfile.email ||
        (resolvedProfile.name &&
          resolvedProfile.name !== 'Field Caseworker' &&
          resolvedProfile.assignedState))
  );

  if (!hasVerifiedFieldUser && !hasStoredFieldProfile) {
    return null;
  }

  const userId = String(
    resolvedUser?.userId ||
      resolvedProfile?.workerId ||
      resolvedProfile?.id ||
      resolvedProfile?.googleEmail ||
      resolvedProfile?.email ||
      resolvedProfile?.name ||
      'field-worker'
  )
    .trim()
    .toLowerCase();

  const statesScope =
    stableSortList(resolvedUser?.allowedStates) ||
    String(resolvedProfile?.assignedState || '').trim().toLowerCase() ||
    'self';

  const districtsScope =
    stableSortList(resolvedUser?.allowedDistricts) ||
    String(resolvedProfile?.assignedDistrict || '').trim().toLowerCase() ||
    'self';

  return `field:${userId}|states:${statesScope}|districts:${districtsScope}`;
}

function syncPrincipalBoundary(principalKey: string | null): void {
  if (principalKey === null && lastActivePrincipalKey !== null) {
    invalidateAllPortalCaches();
    lastActivePrincipalKey = null;
    return;
  }
  if (principalKey && lastActivePrincipalKey && principalKey !== lastActivePrincipalKey) {
    invalidateAllPortalCaches();
  }
  if (principalKey) {
    lastActivePrincipalKey = principalKey;
  }
}

function evictExpiredAndEnforceBounds(): void {
  const now = Date.now();
  for (const [key, entry] of cacheStore.entries()) {
    if (now - entry.storedAt >= PORTAL_WARM_TTL_MS) {
      cacheStore.delete(key);
    }
  }
  while (cacheStore.size > PORTAL_MAX_CACHE_ENTRIES) {
    const oldestKey = cacheStore.keys().next().value;
    if (!oldestKey) break;
    cacheStore.delete(oldestKey);
  }
}

function readFreshCache<T>(key: string, principalKey: string): T | null {
  evictExpiredAndEnforceBounds();
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (entry.principalKey !== principalKey) {
    cacheStore.delete(key);
    return null;
  }
  if (Date.now() - entry.storedAt >= PORTAL_WARM_TTL_MS) {
    cacheStore.delete(key);
    return null;
  }
  // Refresh LRU order
  cacheStore.delete(key);
  cacheStore.set(key, entry);
  return entry.data as T;
}

function writeFreshCache<T>(
  key: string,
  principalKey: string,
  destination: string,
  filtersKey: string,
  data: T
): void {
  if (cacheStore.has(key)) {
    cacheStore.delete(key);
  }
  cacheStore.set(key, {
    key,
    principalKey,
    destination,
    filtersKey,
    data,
    storedAt: Date.now(),
  });
  evictExpiredAndEnforceBounds();
}

function filterByActiveWorker<T extends Record<string, any>>(items: T[]): T[] {
  if (typeof window === 'undefined') return items || [];
  let currentWorkerName: string | null = null;
  let currentWorkerId: string | null = null;
  try {
    const rawProfile = localStorage.getItem('field_user_profile');
    if (rawProfile) {
      const parsed = JSON.parse(rawProfile);
      currentWorkerName = parsed.name?.trim().toLowerCase() || null;
      currentWorkerId = parsed.workerId?.trim().toLowerCase() || null;
    }
  } catch {
    return items || [];
  }

  if (!currentWorkerName && !currentWorkerId) return items || [];

  return (items || []).filter((item) => {
    const payload = item.payload || item;
    const submittedBy = String(
      payload.submittedBy ||
        payload['4\nSubmitted By'] ||
        payload.interviewerName ||
        payload.demographics?.interviewerName ||
        ''
    )
      .trim()
      .toLowerCase();
    const userId = String(payload.userId || '').trim().toLowerCase();
    if (!submittedBy && !userId) return true;
    return (
      Boolean(currentWorkerName && submittedBy === currentWorkerName) ||
      Boolean(currentWorkerId && (submittedBy === currentWorkerId || userId === currentWorkerId))
    );
  });
}

function warmDestinationModules(portal: PortalId, router?: RouterPrefetchLike | null): void {
  const def = PORTAL_DEFINITIONS[portal];
  const now = Date.now();
  const lastPrefetch = routePrefetchTimestamps.get(def.href) ?? 0;

  if (router?.prefetch && now - lastPrefetch >= PORTAL_WARM_TTL_MS) {
    routePrefetchTimestamps.set(def.href, now);
    try {
      const res = router.prefetch(def.href);
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch(() => {
          routePrefetchTimestamps.delete(def.href);
        });
      }
    } catch {
      routePrefetchTimestamps.delete(def.href);
    }
  }

  // Warm destination client chunks safely (only leaf components/utilities, never circular route imports)
  if (!warmedModules.has(portal)) {
    warmedModules.add(portal);
    if (portal === 'drafts') {
      void Promise.allSettled([
        import('@/components/forms/DraftCard'),
        import('@/lib/db/draftRepository'),
        import('@/lib/db/syncQueueRepository'),
      ]);
    } else {
      void Promise.allSettled([
        import('@/components/forms/DraftCard'),
        import('@/lib/shared/submissionStages'),
        import('@/lib/read-model/beneficiaryReadiness'),
        import('@/features/submission/submissionWorker'),
      ]);
    }
  }
}

async function fetchDraftsBundle(
  key: string,
  principalKey: string,
  destination: string,
  filtersKey: string,
  ownership: 'speculative' | 'destination'
): Promise<PortalDraftsWarmData> {
  const existing = inFlightStore.get(key) as InFlightEntry<PortalDraftsWarmData> | undefined;
  if (existing && existing.principalKey === principalKey) {
    if (ownership === 'destination') {
      existing.ownership = 'destination';
    }
    return existing.promise;
  }

  const promise = Promise.all([getAllDrafts(), getAllQueueItems()])
    .then(([allDrafts, allQueue]) => {
      const data: PortalDraftsWarmData = {
        drafts: filterByActiveWorker(allDrafts || []),
        queueItems: filterByActiveWorker(allQueue || []),
        fetchedAt: Date.now(),
      };
      // Only cache if this key wasn't invalidated while awaiting
      if (lastActivePrincipalKey === principalKey) {
        writeFreshCache(key, principalKey, destination, filtersKey, data);
      }
      return data;
    })
    .catch((err) => {
      cacheStore.delete(key);
      throw err;
    })
    .finally(() => {
      const current = inFlightStore.get(key);
      if (current?.promise === promise) {
        inFlightStore.delete(key);
      }
    });

  inFlightStore.set(key, {
    key,
    principalKey,
    promise,
    controller: null,
    ownership,
    timeoutId: null,
  });

  return promise;
}

async function fetchServerSubmissionsWarmup(
  key: string,
  principalKey: string,
  filtersKey: string,
  ownership: 'speculative' | 'destination'
): Promise<PortalSyncServerWarmData> {
  const existing = inFlightStore.get(key) as InFlightEntry<PortalSyncServerWarmData> | undefined;
  if (existing && existing.principalKey === principalKey) {
    if (ownership === 'destination') {
      existing.ownership = 'destination';
    }
    return existing.promise;
  }

  // Respect browser offline state cleanly without issuing a doomed network request
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { records: [], total: 0, fetchedAt: Date.now() };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (controller) {
    timeoutId = setTimeout(() => {
      try {
        controller.abort(new DOMException('Portal warmup timeout', 'AbortError'));
      } catch {
        controller.abort();
      }
    }, PORTAL_FETCH_TIMEOUT_MS);
  }

  const promise = fetch('/api/submissions?limit=250', {
    cache: 'no-store',
    signal: controller?.signal,
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache, no-store',
    },
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      const rawRecords: any[] =
        (Array.isArray(json?.data?.records) && json.data.records) ||
        (Array.isArray(json?.submissions) && json.submissions) ||
        (Array.isArray(json?.records) && json.records) ||
        (Array.isArray(json?.items) && json.items) ||
        [];

      const records = rawRecords.map((item) => parseBeneficiaryRecord(item));
      const total =
        typeof json?.data?.total === 'number'
          ? json.data.total
          : typeof json?.pagination?.totalCount === 'number'
          ? json.pagination.totalCount
          : records.length;

      const data: PortalSyncServerWarmData = {
        records,
        total,
        fetchedAt: Date.now(),
      };

      if (lastActivePrincipalKey === principalKey) {
        writeFreshCache(key, principalKey, '/api/submissions', filtersKey, data);
      }
      return data;
    })
    .catch((err) => {
      // Failed or aborted requests must never populate the cache
      cacheStore.delete(key);
      throw err;
    })
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
      const current = inFlightStore.get(key);
      if (current?.promise === promise) {
        inFlightStore.delete(key);
      }
    });

  inFlightStore.set(key, {
    key,
    principalKey,
    promise,
    controller,
    ownership,
    timeoutId,
  });

  return promise;
}

export function ensurePortalInvalidationListeners(): void {
  if (typeof window === 'undefined' || listenersBound) return;
  listenersBound = true;

  const invalidateLocalAndServer = () => invalidatePortalCache('all');
  const invalidateSyncOnly = () => invalidatePortalCache('sync');

  window.addEventListener('child_nutrition:draft_updated', () => invalidatePortalCache('drafts'));
  window.addEventListener('child_nutrition:sync_completed', invalidateLocalAndServer);
  window.addEventListener('child_nutrition:record_synced', invalidateSyncOnly);
  window.addEventListener('child_nutrition:doc_uploaded', invalidateSyncOnly);
  window.addEventListener('child_nutrition:submission_deleted', invalidateLocalAndServer);
  window.addEventListener('online', invalidateSyncOnly);
}

/**
 * Starts concurrent route, module, and read-only data warmups for an authorised field-worker portal.
 * Returns silently with zero network/data work for non-field roles or unauthenticated callers.
 */
export function startPortalWarmup(params: {
  portal: PortalId;
  ownership: 'speculative' | 'destination';
  router?: RouterPrefetchLike | null;
  principal?: FieldPrincipalInput;
  filters?: Record<string, string | number | boolean | null | undefined>;
}): void {
  ensurePortalInvalidationListeners();
  const principalKey = resolveFieldPrincipalKey(params.principal);
  syncPrincipalBoundary(principalKey);
  if (!principalKey) return;

  warmDestinationModules(params.portal, params.router);

  const filtersKey = serializePortalFilters(params.filters);

  if (params.portal === 'drafts') {
    const draftsKey = buildPortalCacheKey({
      principalKey,
      destination: '/assessment/drafts',
      filters: params.filters,
    });
    if (!readFreshCache<PortalDraftsWarmData>(draftsKey, principalKey)) {
      void fetchDraftsBundle(
        draftsKey,
        principalKey,
        '/assessment/drafts',
        filtersKey,
        params.ownership
      ).catch(() => {});
    }
    return;
  }

  // Sync portals ('docs', 'bank', 'submitted') warm both local IndexedDB queue/drafts and scoped submissions
  const syncLocalKey = buildPortalCacheKey({
    principalKey,
    destination: '/assessment/sync:local',
    filters: params.filters,
  });
  if (!readFreshCache<PortalSyncLocalWarmData>(syncLocalKey, principalKey)) {
    void fetchDraftsBundle(
      syncLocalKey,
      principalKey,
      '/assessment/sync:local',
      filtersKey,
      params.ownership
    ).catch(() => {});
  }

  const syncServerKey = buildPortalCacheKey({
    principalKey,
    destination: '/api/submissions',
    filters: params.filters,
  });
  if (!readFreshCache<PortalSyncServerWarmData>(syncServerKey, principalKey)) {
    void fetchServerSubmissionsWarmup(
      syncServerKey,
      principalKey,
      filtersKey,
      params.ownership
    ).catch(() => {});
  } else if (params.ownership === 'destination') {
    const entry = inFlightStore.get(syncServerKey);
    if (entry) entry.ownership = 'destination';
  }
}

/**
 * Aborts only unowned speculative warmups (e.g., when hover leaves or portal component unmounts).
 * Never aborts fetches claimed by an active navigation / mounted destination.
 */
export function abortSpeculativePortalPrefetches(): void {
  for (const [key, entry] of inFlightStore.entries()) {
    if (entry.ownership === 'speculative') {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
      if (entry.controller) {
        try {
          entry.controller.abort(new DOMException('Speculative portal warmup cancelled', 'AbortError'));
        } catch {
          entry.controller.abort();
        }
      }
      inFlightStore.delete(key);
    }
  }
}

/**
 * Consumes cached drafts data (or joins an already-started in-flight warmup) for /assessment/drafts.
 */
export async function claimOrFetchDraftsData(
  principal?: FieldPrincipalInput
): Promise<PortalDraftsWarmData | null> {
  const principalKey = resolveFieldPrincipalKey(principal);
  syncPrincipalBoundary(principalKey);
  if (!principalKey) return null;

  const key = buildPortalCacheKey({
    principalKey,
    destination: '/assessment/drafts',
  });

  const cached = readFreshCache<PortalDraftsWarmData>(key, principalKey);
  if (cached) return cached;

  const inFlight = inFlightStore.get(key) as InFlightEntry<PortalDraftsWarmData> | undefined;
  if (inFlight && inFlight.principalKey === principalKey) {
    inFlight.ownership = 'destination';
    return inFlight.promise;
  }

  return null;
}

/**
 * Consumes cached or in-flight local sync/draft data for /assessment/sync without duplicate IndexedDB scans.
 */
export async function claimOrFetchSyncLocalData(
  principal?: FieldPrincipalInput
): Promise<PortalSyncLocalWarmData | null> {
  const principalKey = resolveFieldPrincipalKey(principal);
  syncPrincipalBoundary(principalKey);
  if (!principalKey) return null;

  const key = buildPortalCacheKey({
    principalKey,
    destination: '/assessment/sync:local',
  });

  const cached = readFreshCache<PortalSyncLocalWarmData>(key, principalKey);
  if (cached) return cached;

  const inFlight = inFlightStore.get(key) as InFlightEntry<PortalSyncLocalWarmData> | undefined;
  if (inFlight && inFlight.principalKey === principalKey) {
    inFlight.ownership = 'destination';
    return inFlight.promise;
  }

  return null;
}

/**
 * Consumes cached or in-flight field-worker /api/submissions data, or fetches once with deduplication.
 */
export async function claimOrFetchFieldSubmissions(options?: {
  principal?: FieldPrincipalInput;
  force?: boolean;
}): Promise<PortalSyncServerWarmData | null> {
  const principalKey = resolveFieldPrincipalKey(options?.principal);
  syncPrincipalBoundary(principalKey);
  if (!principalKey) return null;

  const key = buildPortalCacheKey({
    principalKey,
    destination: '/api/submissions',
  });

  if (options?.force) {
    cacheStore.delete(key);
  } else {
    const cached = readFreshCache<PortalSyncServerWarmData>(key, principalKey);
    if (cached) return cached;
  }

  return fetchServerSubmissionsWarmup(key, principalKey, 'default', 'destination');
}

export function invalidatePortalCache(scope: 'drafts' | 'sync' | 'all' = 'all'): void {
  if (scope === 'all') {
    for (const key of cacheStore.keys()) {
      cacheStore.delete(key);
    }
    return;
  }
  for (const [key, entry] of cacheStore.entries()) {
    if (scope === 'drafts' && entry.destination === '/assessment/drafts') {
      cacheStore.delete(key);
    } else if (
      scope === 'sync' &&
      (entry.destination === '/assessment/sync:local' || entry.destination === '/api/submissions')
    ) {
      cacheStore.delete(key);
    }
  }
}

/**
 * Purges all portal caches, route warmups, and aborts in-flight portal fetches on logout or account switch.
 * Leaves local IndexedDB drafts and offline queue items completely untouched.
 */
export function invalidateAllPortalCaches(): void {
  cacheStore.clear();
  routePrefetchTimestamps.clear();
  warmedModules.clear();
  lastActivePrincipalKey = null;

  for (const [key, entry] of inFlightStore.entries()) {
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    if (entry.controller) {
      try {
        entry.controller.abort(new DOMException('Session changed or signed out', 'AbortError'));
      } catch {
        entry.controller.abort();
      }
    }
    inFlightStore.delete(key);
  }
}

/**
 * Exposed solely for deterministic tests to inspect cache bounds and state.
 */
export function __getPortalWarmCacheDebugState() {
  return {
    cacheSize: cacheStore.size,
    inFlightSize: inFlightStore.size,
    cacheKeys: Array.from(cacheStore.keys()),
    inFlightOwnership: Array.from(inFlightStore.entries()).map(([k, v]) => [k, v.ownership]),
    lastActivePrincipalKey,
  };
}
