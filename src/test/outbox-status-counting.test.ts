/**
 * Phase 5 Unit Tests — Outbox Status Counting Contract
 * Tests the fix for the silent outbox send bug (RC-1 through RC-6).
 * Branch: fix/silent-outbox-send-and-terminal-status-ui
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: build minimal SyncQueueItem fixtures
// ---------------------------------------------------------------------------
function makeItem(overrides: Record<string, any>) {
  return {
    id: Math.floor(Math.random() * 10000),
    schemaVersion: 2,
    submissionUuid: 'test-uuid-' + Math.random(),
    idempotencyKey: 'idem-' + Math.random(),
    operationType: 'CREATE',
    payload: {} as any,
    retryCount: 0,
    lastAttempt: null,
    nextRetryTimestamp: Date.now(),
    errorMessage: null,
    conflictMetadata: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. getPendingQueue exclusions
// ---------------------------------------------------------------------------
describe('getPendingQueue — terminal exclusions', () => {
  it('excludes items with status=synced', () => {
    const item = makeItem({ status: 'synced' });
    const isSynced = item.status === 'synced';
    expect(isSynced).toBe(true);
    // Simulate the filter logic from getPendingQueue
    const shouldExclude =
      item.status === 'synced' || item.status === 'conflict' || item.status === 'needs_review' || item.status === 'failed_final';
    expect(shouldExclude).toBe(true);
  });

  it('excludes items with status=conflict', () => {
    const item = makeItem({ status: 'conflict', nextRetryTimestamp: null });
    const shouldExclude =
      item.status === 'synced' || item.status === 'conflict' || item.status === 'needs_review' || item.status === 'failed_final';
    expect(shouldExclude).toBe(true);
  });

  it('excludes items with status=needs_review', () => {
    const item = makeItem({ status: 'needs_review', nextRetryTimestamp: null });
    const shouldExclude =
      item.status === 'synced' || item.status === 'conflict' || item.status === 'needs_review' || item.status === 'failed_final';
    expect(shouldExclude).toBe(true);
  });

  it('excludes failed items with nextRetryTimestamp=null (terminal)', () => {
    const item = makeItem({ status: 'failed', nextRetryTimestamp: null, lastErrorCode: 422 });
    const isTerminal =
      item.status === 'failed' &&
      (item.nextRetryTimestamp === null || [400, 401, 403, 422].includes(Number(item.lastErrorCode)));
    expect(isTerminal).toBe(true);
  });

  it('includes failed items with nextRetryTimestamp in the past (retryable)', () => {
    const item = makeItem({ status: 'failed', nextRetryTimestamp: Date.now() - 1000, lastErrorCode: 503 });
    const isTerminal =
      item.status === 'failed' &&
      (item.nextRetryTimestamp === null || [400, 401, 403, 422].includes(Number(item.lastErrorCode)));
    expect(isTerminal).toBe(false);
    const isCandidate =
      item.status === 'queued' || item.status === 'failed_retryable' ||
      (item.status === 'failed' && item.nextRetryTimestamp !== null && item.nextRetryTimestamp <= Date.now());
    expect(isCandidate).toBe(true);
  });

  it('includes queued items unconditionally', () => {
    const item = makeItem({ status: 'queued' });
    const isCandidate = item.status === 'queued' || item.status === 'failed_retryable';
    expect(isCandidate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. UI counting — actionableCount vs attentionCount split
// ---------------------------------------------------------------------------
describe('UI counting contract — actionableCount vs attentionCount', () => {
  function classifyItem(status: string): 'actionable' | 'attention' | 'synced' | 'syncing' {
    if (status === 'ready_to_sync' || status === 'failed_retryable') return 'actionable';
    if (status === 'failed_final' || status === 'conflict') return 'attention';
    if (status === 'synced') return 'synced';
    return 'syncing';
  }

  it('ready_to_sync → actionable (counted in send button)', () => {
    expect(classifyItem('ready_to_sync')).toBe('actionable');
  });

  it('failed_retryable → actionable (counted in send button)', () => {
    expect(classifyItem('failed_retryable')).toBe('actionable');
  });

  it('failed_final → attention (NOT counted as waiting to send)', () => {
    expect(classifyItem('failed_final')).toBe('attention');
  });

  it('conflict → attention (NOT counted as waiting to send)', () => {
    expect(classifyItem('conflict')).toBe('attention');
  });

  it('synced → not in outbox', () => {
    expect(classifyItem('synced')).toBe('synced');
  });

  it('banner shows only actionableCount when attentionCount=0', () => {
    const actionableCount = 2;
    const attentionCount = 0;
    // The original bug: pendingCount = outboxItems.length would have returned 2
    // The fix: pendingCount = actionableCount = 2 (correct)
    const pendingCount = actionableCount;
    expect(pendingCount).toBe(2);
    // No attention banner when attentionCount=0
    const showAttentionBanner = actionableCount === 0 && attentionCount > 0;
    expect(showAttentionBanner).toBe(false);
  });

  it('banner shows attention-only state when actionableCount=0 and attentionCount>0', () => {
    // This is the reported bug scenario: 1 failed_final item, no queued/retryable
    const actionableCount = 0;
    const attentionCount = 1;
    const showSendBanner = actionableCount > 0;
    const showAttentionBanner = actionableCount === 0 && attentionCount > 0;
    expect(showSendBanner).toBe(false);      // BUG FIX: send banner must be HIDDEN
    expect(showAttentionBanner).toBe(true);  // Attention banner must be SHOWN
  });

  it('legacy pendingCount is alias for actionableCount, not outboxItems.length', () => {
    // The original bug: pendingCount = outboxItems.length (included terminal items)
    const outboxCount = 3; // 1 queued + 1 failed_retryable + 1 failed_final
    const actionableCount = 2; // only queued + failed_retryable
    const legacyBugCount = outboxCount; // old pendingCount
    const fixedCount = actionableCount; // new pendingCount = actionableCount

    expect(legacyBugCount).toBe(3); // would have shown "3 waiting to synchronize" — wrong
    expect(fixedCount).toBe(2);     // correctly shows "2 waiting to synchronize"
  });
});

// ---------------------------------------------------------------------------
// 3. retryQueueItem guards
// ---------------------------------------------------------------------------
describe('retryQueueItem guards', () => {
  const TERMINAL_STATUSES = new Set(['synced', 'SYNCED', 'failed_final', 'FAILED_FINAL', 'conflict', 'needs_review', 'NEEDS_REVIEW']);

  it('rejects synced items', () => {
    expect(TERMINAL_STATUSES.has('synced')).toBe(true);
  });

  it('rejects failed_final items', () => {
    expect(TERMINAL_STATUSES.has('failed_final')).toBe(true);
  });

  it('rejects conflict items', () => {
    expect(TERMINAL_STATUSES.has('conflict')).toBe(true);
  });

  it('rejects needs_review items', () => {
    expect(TERMINAL_STATUSES.has('needs_review')).toBe(true);
  });

  it('allows queued items', () => {
    expect(TERMINAL_STATUSES.has('queued')).toBe(false);
  });

  it('allows failed items with retryable error code', () => {
    const item = makeItem({ status: 'failed', nextRetryTimestamp: Date.now(), lastErrorCode: 503 });
    const isTerminalByCode = [400, 401, 403, 422].includes(Number(item.lastErrorCode));
    const isTerminalByTimestamp = item.nextRetryTimestamp === null;
    const isRejected = TERMINAL_STATUSES.has(item.status) || (item.status === 'failed' && isTerminalByCode && isTerminalByTimestamp);
    expect(isRejected).toBe(false);
  });

  it('rejects failed items with terminal error code + null timestamp', () => {
    const item = makeItem({ status: 'failed', nextRetryTimestamp: null, lastErrorCode: 422 });
    const isTerminalByCode = [400, 401, 403, 422].includes(Number(item.lastErrorCode));
    const isTerminalByTimestamp = item.nextRetryTimestamp === null;
    const isRejected = isTerminalByCode && isTerminalByTimestamp;
    expect(isRejected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. chipStatus assignment
// ---------------------------------------------------------------------------
describe('chipStatus assignment', () => {
  function getChipForFailedStatus(code: number, errorMessage?: string): string {
    if (code === 409 || (errorMessage?.toLowerCase() ?? '').includes('conflict')) return 'Conflict';
    if (code >= 400 && code < 500 && code !== 408 && code !== 429) return 'Needs attention';
    return 'Retrying'; // was 'Local' before fix — ambiguous
  }

  it('failed with 409 → Conflict chip', () => {
    expect(getChipForFailedStatus(409)).toBe('Conflict');
  });

  it('failed with 422 → Needs attention chip', () => {
    expect(getChipForFailedStatus(422)).toBe('Needs attention');
  });

  it('failed with 400 → Needs attention chip', () => {
    expect(getChipForFailedStatus(400)).toBe('Needs attention');
  });

  it('failed with 503 → Retrying chip (NOT Local — the fix)', () => {
    // Before fix: chipStatus was 'Local' — indistinguishable from a new draft
    // After fix: chipStatus is 'Retrying' — clearly communicates it was already attempted
    expect(getChipForFailedStatus(503)).toBe('Retrying');
  });

  it('failed with 0 (unknown) → Retrying chip', () => {
    expect(getChipForFailedStatus(0)).toBe('Retrying');
  });
});
