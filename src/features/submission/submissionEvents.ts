/**
 * submissionEvents.ts — Canonical Event/Observer Boundary
 *
 * The single pub/sub mechanism for submission lifecycle events.
 * UI components, read-models, and supervisor views must subscribe here,
 * not to ad hoc window events, duplicated context mutations, or polling.
 *
 * Emits:
 *   submission:saved    — local snapshot persisted, identity assigned
 *   submission:sending  — HTTP request dispatched
 *   submission:success  — server acknowledged (remoteSubmissionId available)
 *   submission:retrying — transient failure, will retry automatically
 *   submission:failed   — terminal failure, user action required
 *   submission:conflict — concurrency conflict detected
 */

export type SubmissionEventType =
  | 'submission:saved'
  | 'submission:sending'
  | 'submission:success'
  | 'submission:retrying'
  | 'submission:failed'
  | 'submission:conflict';

export interface SubmissionEventPayload {
  /** Client-generated stable UUID — safe for correlation */
  clientSubmissionId: string;
  /** Server-assigned ID — available only on success/conflict */
  remoteSubmissionId?: string;
  /** Server-assigned version — available only on success */
  version?: number;
  /** Correlation/request ID from the server */
  requestId?: string;
  /** Non-PII correlation ID for request tracing within a session */
  correlationId?: string;
  /** ISO timestamp */
  timestamp: string;

  /** Error category for failed/conflict events */
  errorCategory?: string;
  /** Human-readable safe error message (no PII, no tokens) */
  message?: string;
  /** Retry count at time of event */
  retryCount?: number;
}

type SubmissionEventListener = (payload: SubmissionEventPayload) => void;

class SubmissionEventBus {
  private listeners: Map<SubmissionEventType, Set<SubmissionEventListener>> = new Map();

  /**
   * Subscribe to a submission lifecycle event.
   * Returns an unsubscribe function.
   */
  on(eventType: SubmissionEventType, listener: SubmissionEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Emit a submission lifecycle event to all subscribers.
   * Errors in individual listeners are caught and logged without
   * disrupting other listeners.
   */
  emit(eventType: SubmissionEventType, payload: SubmissionEventPayload): void {
    const listenersForType = this.listeners.get(eventType);
    if (!listenersForType) return;

    for (const listener of listenersForType) {
      try {
        listener(payload);
      } catch (err) {
        // Listener errors must not propagate to the worker
        console.error(`[SubmissionEventBus] Error in listener for "${eventType}":`, err);
      }
    }
  }

  /** Remove all listeners (used in tests and unmount cleanup) */
  removeAll(eventType?: SubmissionEventType): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }
}

/**
 * Global submission event bus singleton.
 * Import this in UI components, read-model hooks, and the worker.
 */
export const submissionEvents = new SubmissionEventBus();

// ---------------------------------------------------------------------------
// Pre-Dispatch Subscription Helper — Canonical Form Submit Lifecycle
// ---------------------------------------------------------------------------

export interface WaitForSubmissionOutcomeOptions {
  timeoutMs?: number;
  onSending?: (payload: SubmissionEventPayload) => void;
  onRetrying?: (payload: SubmissionEventPayload) => void;
}

export type SubmissionOutcome =
  | { status: 'success'; payload: SubmissionEventPayload }
  | { status: 'failed'; payload: SubmissionEventPayload }
  | { status: 'timeout' };

export interface SubmissionOutcomePromise extends Promise<SubmissionOutcome> {
  cleanup: () => void;
}

/**
 * Subscribes to submission lifecycle events for a specific clientSubmissionId
 * BEFORE any worker dispatch occurs.
 *
 * Guarantees:
 * - Listeners are registered synchronously upon invocation before processQueue.
 * - Filters every event strictly by exact clientSubmissionId.
 * - Success resolves only on matching submission:success.
 * - Failed resolves only on matching submission:failed.
 * - Retrying updates local status callback but does not falsely complete.
 * - Timeout resolves with status: 'timeout'.
 * - Any terminal resolution (success, failed, timeout) or manual cleanup()
 *   unsubscribes every listener immediately.
 * - Late events after resolution cannot trigger callbacks or duplicate resolution.
 */
export function waitForSubmissionOutcome(
  targetClientId: string,
  options?: WaitForSubmissionOutcomeOptions
): SubmissionOutcomePromise {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolved = false;

  let unsubSending: (() => void) | undefined;
  let unsubRetrying: (() => void) | undefined;
  let unsubSuccess: (() => void) | undefined;
  let unsubFailed: (() => void) | undefined;

  const cleanup = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (unsubSending) {
      unsubSending();
      unsubSending = undefined;
    }
    if (unsubRetrying) {
      unsubRetrying();
      unsubRetrying = undefined;
    }
    if (unsubSuccess) {
      unsubSuccess();
      unsubSuccess = undefined;
    }
    if (unsubFailed) {
      unsubFailed();
      unsubFailed = undefined;
    }
  };

  const promise = new Promise<SubmissionOutcome>((resolve) => {
    // Synchronous registration before executor finishes
    unsubSending = submissionEvents.on('submission:sending', (payload) => {
      if (payload.clientSubmissionId === targetClientId && !resolved) {
        options?.onSending?.(payload);
      }
    });

    unsubRetrying = submissionEvents.on('submission:retrying', (payload) => {
      if (payload.clientSubmissionId === targetClientId && !resolved) {
        options?.onRetrying?.(payload);
      }
    });

    unsubSuccess = submissionEvents.on('submission:success', (payload) => {
      if (payload.clientSubmissionId === targetClientId && !resolved) {
        resolved = true;
        cleanup();
        resolve({ status: 'success', payload });
      }
    });

    unsubFailed = submissionEvents.on('submission:failed', (payload) => {
      if (payload.clientSubmissionId === targetClientId && !resolved) {
        resolved = true;
        cleanup();
        resolve({ status: 'failed', payload });
      }
    });

    timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ status: 'timeout' });
      }
    }, timeoutMs);
  }) as SubmissionOutcomePromise;

  promise.cleanup = cleanup;
  return promise;
}
