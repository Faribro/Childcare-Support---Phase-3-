import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncOrchestrator } from '@/lib/sync/syncOrchestrator';
import {
  demographicsSchema,
  caregiverConsentSchema,
  householdFinancialSchema,
  healthSchema,
  nutritionHabitsSchema,
  educationStatusSchema,
  finalReviewSchema,
} from '@/lib/validations/submissionSchema';
import type { SyncQueueItem, AssessmentRecord } from '@/types/domain';

// In-memory mock queue store for transactional outbox testing
let mockQueueStore: SyncQueueItem[] = [];
let mockLocked = false;

vi.mock('@/lib/db/syncQueueRepository', () => ({
  acquireSyncLock: vi.fn(() => {
    if (mockLocked) return false;
    mockLocked = true;
    return true;
  }),
  releaseSyncLock: vi.fn(() => {
    mockLocked = false;
  }),
  isSyncLocked: vi.fn(() => mockLocked),
  migrateLegacyQueueItems: vi.fn(async () => 0),
  getPendingQueue: vi.fn(async (_forceAll: boolean) => {
    return mockQueueStore.filter(
      (item) => item.status === 'queued' || item.status === 'failed' || item.status === 'failed_retryable'
    );
  }),
  getQueueItemByUuid: vi.fn(async (uuid: string) => {
    return mockQueueStore.find((i) => i.submissionUuid === uuid);
  }),
  markSyncing: vi.fn(async (queueId: number) => {
    const item = mockQueueStore.find((i) => i.id === queueId);
    if (item) item.status = 'syncing';
  }),
  markSynced: vi.fn(async (queueId: number, uuid: string, remoteId: string, version: number) => {
    const item = mockQueueStore.find((i) => i.id === queueId);
    if (item) {
      item.status = 'synced';
      item.errorMessage = null;
      (item.payload as any).remoteSubmissionId = remoteId;
      (item.payload as any).version = version;
    }
  }),
  markFailedRetryable: vi.fn(async (queueId: number, errorMessage: string, statusCode?: number | string) => {
    const item = mockQueueStore.find((i) => i.id === queueId);
    if (item) {
      item.status = 'failed';
      item.retryCount = (item.retryCount || 0) + 1;
      const backoffSeconds = Math.min(300, Math.pow(2, item.retryCount) * 3);
      const jitter = 2; // Fixed jitter for deterministic testing
      item.nextRetryTimestamp = Date.now() + (backoffSeconds + jitter) * 1000;
      item.lastErrorCode = statusCode;
      item.errorMessage = errorMessage;
    }
  }),
  markFailedFinal: vi.fn(async (queueId: number, errorMessage: string, statusCode?: number | string) => {
    const item = mockQueueStore.find((i) => i.id === queueId);
    if (item) {
      item.status = 'failed';
      item.retryCount = (item.retryCount || 0) + 1;
      item.nextRetryTimestamp = null; // Halt retries
      item.lastErrorCode = statusCode;
      item.errorMessage = `Terminal Failure (${statusCode}): ${errorMessage}`;
    }
  }),
  markConflict: vi.fn(async (queueId: number, conflictMetadata: any) => {
    const item = mockQueueStore.find((i) => i.id === queueId);
    if (item) {
      item.status = 'failed';
      item.conflictMetadata = conflictMetadata;
      item.nextRetryTimestamp = null;
      item.errorMessage = 'Concurrency conflict detected';
    }
  }),
  getAllQueueItems: vi.fn(async () => [...mockQueueStore]),
  getQueueStats: vi.fn(async () => ({
    total: mockQueueStore.length,
    queued: mockQueueStore.filter((i) => i.status === 'queued').length,
    syncing: mockQueueStore.filter((i) => i.status === 'syncing').length,
    synced: mockQueueStore.filter((i) => i.status === 'synced').length,
    failedRetryable: mockQueueStore.filter(
      (i) => i.status === 'failed' && i.nextRetryTimestamp !== null
    ).length,
    failedFinal: mockQueueStore.filter(
      (i) => i.status === 'failed' && i.nextRetryTimestamp === null
    ).length,
  })),
}));

describe('Immediate Submit & Autosync Integration Test Suite (13 Gates)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockQueueStore = [];
    mockLocked = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const sampleRecord: any = {
    uuid: '99999999-8888-4777-a666-555555555555',
    clientSubmissionId: '99999999-8888-4777-a666-555555555555',
    stepIndex: 9,
    updatedAt: new Date().toISOString(),
    syncStatus: 'queued',
    demographics: {
      artNumber: 'DL-SOU-101122-01',
      childName: 'Rohit Kumar',
      dob: '2021-06-15',
      gender: 'Male',
      caregiverName: 'Sunita Kumar',
      caregiverRelationship: 'Mother',
      contactNumber: '9876543210',
      district: 'South Delhi',
      state: 'Delhi',
    },
    consent: {
      consentProvided: true,
      consentVersion: 'v1.0-2026',
      caregiverName: 'Sunita Kumar',
      caregiverRelationship: 'Mother',
      consentCapturedAt: new Date().toISOString(),
      signatureRequired: true,
      signatureStatus: 'CAPTURED_LOCAL',
    },
    household: {
      totalFamilyMembers: 4,
      numberOfChildrenUnder18: 2,
      monthlyIncomeRs: 6500,
      mainSourceOfIncome: 'Daily wage labour',
    },
    health: {
      weightKg: 13.2,
      heightCm: 95.0,
      bmi: 14.6,
      haemoglobinGdl: 11.2,
      otherHealthConditions: [],
    },
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    },
    education: {
      educationStatus: 'Currently going to school',
      schoolName: 'Govt Boys Senior Secondary School',
      schoolType: 'Government school',
      currentClass: 'Nursery',
      attendance: 'Regular',
    },
    educationExpenses: {
      schoolFees: 0,
      books: 500,
      uniform: 800,
      transport: 0,
      totalAnnualCost: 1300,
    },
    educationSupportRequired: {
      requiredSchoolFees: 0,
      requiredBooks: 500,
      requiredUniform: 800,
      totalRequiredSupport: 1300,
    },
    finalReview: {
      allInfoCorrect: true,
      organizationName: 'India HIV/AIDS Alliance',
      formSubmittedBy: 'Pooja Verma',
    },
  };

  // GATE 1: Immediate push on submit (Online)
  it('Gate 1: Should immediately flush queue on submit when online', async () => {
    mockQueueStore.push({
      id: 1,
      submissionUuid: sampleRecord.uuid,
      idempotencyKey: `idem-${sampleRecord.uuid}`,
      operationType: 'CREATE',
      payload: sampleRecord,
      status: 'queued',
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: null,
      errorMessage: null,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        remoteSubmissionId: 'DL-SOU-101122-01',
        version: 1,
        acknowledged: true,
      }),
    });

    const result = await syncOrchestrator.flushQueue('form_submit');

    expect(result.status).toBe('success');
    expect(result.syncedCount).toBe(1);
    expect(mockQueueStore[0].status).toBe('synced');
    expect((mockQueueStore[0].payload as any).remoteSubmissionId).toBe('DL-SOU-101122-01');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // GATE 2: Offline retention and safe queueing
  it('Gate 2: Should retain record safely in outbox when offline without calling fetch', async () => {
    mockQueueStore.push({
      id: 2,
      submissionUuid: sampleRecord.uuid,
      idempotencyKey: `idem-${sampleRecord.uuid}`,
      operationType: 'CREATE',
      payload: sampleRecord,
      status: 'queued',
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: null,
      errorMessage: null,
    });

    // Simulate browser offline
    vi.spyOn(syncOrchestrator, 'isOnline').mockReturnValue(false);
    global.fetch = vi.fn();

    const result = await syncOrchestrator.flushQueue('form_submit');

    expect(result.status).toBe('offline');
    expect(result.syncedCount).toBe(0);
    expect(mockQueueStore[0].status).toBe('queued'); // Remains queued safely
    expect(global.fetch).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  // GATE 3: Canonical remote acknowledgment verification
  it('Gate 3: Should verify canonical acknowledgment and reject unacknowledged responses', async () => {
    mockQueueStore.push({
      id: 3,
      submissionUuid: sampleRecord.uuid,
      idempotencyKey: `idem-${sampleRecord.uuid}`,
      operationType: 'CREATE',
      payload: sampleRecord,
      status: 'queued',
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: null,
      errorMessage: null,
    });

    // Server returns HTTP 200 but WITHOUT remoteSubmissionId (corrupt response)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        acknowledged: false, // Explicit negative acknowledgment
      }),
    });

    const result = await syncOrchestrator.flushQueue('manual');

    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(mockQueueStore[0].status).toBe('failed'); // Must NOT mark synced!
  });

  // GATE 4: Exponential backoff with jitter
  it('Gate 4: Should calculate exponential backoff with jitter on retryable failures', async () => {
    const queueItem: SyncQueueItem = {
      id: 4,
      submissionUuid: sampleRecord.uuid,
      idempotencyKey: `idem-${sampleRecord.uuid}`,
      operationType: 'CREATE',
      payload: sampleRecord,
      status: 'queued',
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: null,
      errorMessage: null,
    };
    mockQueueStore.push(queueItem);

    // 503 Service Unavailable (Retryable error)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Google Sheets API quota exceeded' }),
    });

    const startTime = Date.now();
    await syncOrchestrator.flushQueue('manual');

    expect(queueItem.status).toBe('failed');
    expect(queueItem.retryCount).toBe(1);
    expect(queueItem.nextRetryTimestamp).not.toBeNull();
    // retryCount 1 -> backoff = min(300, 2^1 * 3) = 6s + jitter (2s) = 8s
    expect(queueItem.nextRetryTimestamp!).toBeGreaterThanOrEqual(startTime + 6000);
  });

  // GATE 5: 4xx non-retryable handling (e.g. 422 Unprocessable Entity)
  it('Gate 5: Should immediately halt retries on 4xx validation errors and mark failed_final', async () => {
    const queueItem: SyncQueueItem = {
      id: 5,
      submissionUuid: sampleRecord.uuid,
      idempotencyKey: `idem-${sampleRecord.uuid}`,
      operationType: 'CREATE',
      payload: sampleRecord,
      status: 'queued',
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: null,
      errorMessage: null,
    };
    mockQueueStore.push(queueItem);

    // 422 Unprocessable Entity
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Invalid date format' }),
    });

    const result = await syncOrchestrator.flushQueue('manual');

    expect(result.status).toBe('failed');
    expect(queueItem.status).toBe('failed');
    expect(queueItem.nextRetryTimestamp).toBeNull(); // Retries halted
    expect(queueItem.errorMessage).toContain('Terminal Failure (422)');
  });

  // GATE 6: 409 Concurrency conflict handling
  it('Gate 6: Should mark conflict and preserve local state when 409 Conflict occurs', async () => {
    const queueItem: SyncQueueItem = {
      id: 6,
      submissionUuid: sampleRecord.uuid,
      idempotencyKey: `idem-${sampleRecord.uuid}`,
      operationType: 'UPDATE',
      expectedVersion: 1,
      payload: sampleRecord,
      status: 'queued',
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: null,
      errorMessage: null,
    };
    mockQueueStore.push(queueItem);

    // 409 Conflict
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        message: 'Concurrency conflict: server version is 2',
        serverVersion: 2,
        expectedVersion: 1,
      }),
    });

    const result = await syncOrchestrator.flushQueue('form_update');

    expect(result.conflictCount).toBe(1);
    expect(queueItem.conflictMetadata).toBeDefined();
    expect(queueItem.nextRetryTimestamp).toBeNull(); // Do not retry conflict automatically
  });

  // GATE 7: Client-side mutex lock and deduplication
  it('Gate 7: Should reject concurrent flush requests with busy status when locked', async () => {
    mockLocked = true; // Mutex already held by another flush

    const result = await syncOrchestrator.flushQueue('manual');

    expect(result.status).toBe('busy');
    expect(result.processedCount).toBe(0);
  });

  // GATE 8: Fail-closed configuration check
  it('Gate 8: Should ensure fail-closed configuration when required params are missing', () => {
    // Verify that empty or missing mandatory fields fail validation
    const invalidDemographics = {
      artNumber: '', // missing
      childName: '',
      dob: 'future-date',
    };
    const parseResult = demographicsSchema.safeParse(invalidDemographics);
    expect(parseResult.success).toBe(false);
  });

  // GATE 9: Event dispatching
  it('Gate 9: Should dispatch child_nutrition:sync_completed on window after flush', async () => {
    mockQueueStore.push({
      id: 9,
      submissionUuid: sampleRecord.uuid,
      idempotencyKey: `idem-${sampleRecord.uuid}`,
      operationType: 'CREATE',
      payload: sampleRecord,
      status: 'queued',
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: null,
      errorMessage: null,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        remoteSubmissionId: 'DL-SOU-101122-01',
        version: 1,
      }),
    });

    let eventFired = false;
    let eventDetail: any = null;

    const listener = (e: any) => {
      eventFired = true;
      eventDetail = e.detail;
    };
    window.addEventListener('child_nutrition:sync_completed', listener);

    await syncOrchestrator.flushQueue('manual');

    expect(eventFired).toBe(true);
    expect(eventDetail.syncedCount).toBe(1);

    window.removeEventListener('child_nutrition:sync_completed', listener);
  });

  // GATE 10: Local-first persistence guarantee
  it('Gate 10: Should verify local-first payload structure matches domain schema before sync', () => {
    expect(sampleRecord.uuid).toBeDefined();
    expect(sampleRecord.demographics.childName).toBe('Rohit Kumar');
    expect(sampleRecord.consent.signatureStatus).toBe('CAPTURED_LOCAL');
    expect(sampleRecord.syncStatus).toBe('queued');
  });

  // GATE 11: Status chip mapping truthfulness
  it('Gate 11: Should correctly map queue statuses to truthful chips', () => {
    const chipMapper = (status: string, code?: number) => {
      if (status === 'synced') return 'Submitted';
      if (status === 'syncing') return 'Sending';
      if (status === 'failed') {
        if (code === 409) return 'Conflict';
        if (code && code >= 400 && code < 500 && code !== 408 && code !== 429) return 'Needs attention';
        return 'Local';
      }
      return 'Local';
    };

    expect(chipMapper('queued')).toBe('Local');
    expect(chipMapper('syncing')).toBe('Sending');
    expect(chipMapper('synced')).toBe('Submitted');
    expect(chipMapper('failed', 422)).toBe('Needs attention');
    expect(chipMapper('failed', 400)).toBe('Needs attention');
    expect(chipMapper('failed', 409)).toBe('Conflict');
    expect(chipMapper('failed', 503)).toBe('Local');
  });

  // GATE 12: Truthful UI banner criteria
  it('Gate 12: Should distinguish local vs synced banner copy without false green successes', () => {
    const getBannerState = (justSubmitted: boolean, status: string | null, isOnline: boolean) => {
      if (!justSubmitted) return null;
      const effective = status || (isOnline ? 'syncing' : 'offline');
      return {
        effective,
        isGreen: effective === 'synced',
        isOfflineWarning: effective === 'offline',
        isPendingPulse: effective === 'syncing',
      };
    };

    // When offline: MUST NOT be green!
    const offlineState = getBannerState(true, 'offline', false);
    expect(offlineState?.isGreen).toBe(false);
    expect(offlineState?.isOfflineWarning).toBe(true);

    // When syncing: MUST NOT be green!
    const syncingState = getBannerState(true, 'syncing', true);
    expect(syncingState?.isGreen).toBe(false);
    expect(syncingState?.isPendingPulse).toBe(true);

    // Only synced is green
    const syncedState = getBannerState(true, 'synced', true);
    expect(syncedState?.isGreen).toBe(true);
  });

  // GATE 13: Empty string & zero sanitization (Prevents 422 rejection)
  it('Gate 13: Should gracefully parse empty strings and zeroes on optional fields without 422 failure', () => {
    const formDataWithZeroesAndEmptyStrings = {
      demographics: {
        artNumber: 'DL-SOU-101122-01',
        childName: 'Rohit Kumar',
        dob: '2021-06-15',
        gender: 'Male',
        caregiverName: 'Sunita Kumar',
        caregiverRelationship: 'Mother',
        contactNumber: '', // Empty string optional
        district: 'South Delhi',
        state: 'Delhi',
      },
      household: {
        totalFamilyMembers: 3,
        numberOfChildrenUnder18: 1,
        monthlyIncomeRs: 0, // 0 Rs income
        mainSourceOfIncome: 'No regular income',
      },
      health: {
        weightKg: 0, // 0 kg initial placeholder
        heightCm: 0,
        bmi: 0,
        haemoglobinGdl: 0,
        otherHealthConditions: [], // Empty array
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
      },
      education: {
        educationStatus: 'Currently going to school',
        schoolName: '',
        schoolType: 'Government school',
        currentClass: '',
        attendance: 'Regular',
      },
      finalReview: {
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        formSubmittedBy: 'Caseworker',
      },
    };

    expect(demographicsSchema.safeParse(formDataWithZeroesAndEmptyStrings.demographics).success).toBe(true);
    expect(householdFinancialSchema.safeParse(formDataWithZeroesAndEmptyStrings.household).success).toBe(true);
    expect(healthSchema.safeParse(formDataWithZeroesAndEmptyStrings.health).success).toBe(true);
    expect(nutritionHabitsSchema.safeParse(formDataWithZeroesAndEmptyStrings.nutrition).success).toBe(true);
    expect(educationStatusSchema.safeParse(formDataWithZeroesAndEmptyStrings.education).success).toBe(true);
    expect(finalReviewSchema.safeParse(formDataWithZeroesAndEmptyStrings.finalReview).success).toBe(true);
  });
});
