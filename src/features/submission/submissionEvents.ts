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
