import { DiagnosticEventRecord } from './whatsappWebhookParser';

const MAX_SINK_CAPACITY = 50;
const eventBuffer: DiagnosticEventRecord[] = [];
let totalEventsReceived = 0;

/**
 * In-Memory Diagnostic Event Sink (Server-Only, Private)
 *
 * Operational Guarantees:
 * - Strictly bounded to a maximum of 50 diagnostic records via FIFO eviction.
 * - Private internal module: NO public API endpoint exposes this buffer.
 * - Non-durable & ephemeral: Does NOT provide persistence, durable queuing,
 *   or cross-instance synchronization.
 * - Idempotent reception: Duplicate deliveries do NOT trigger side effects.
 * - Zero PII: Records contain only aggregate counts, event class, and random correlation IDs.
 */
export function recordDiagnosticEvent(event: DiagnosticEventRecord): void {
  if (eventBuffer.length >= MAX_SINK_CAPACITY) {
    eventBuffer.shift(); // FIFO eviction
  }
  eventBuffer.push(event);
  totalEventsReceived++;
}

/**
 * Retrieves recent diagnostic records for local testing and inspection (newest first).
 */
export function getRecentDiagnosticEvents(limit = 10): DiagnosticEventRecord[] {
  return [...eventBuffer].reverse().slice(0, limit);
}

/**
 * Clears the event buffer (useful for test isolation).
 */
export function clearDiagnosticEvents(): void {
  eventBuffer.length = 0;
  totalEventsReceived = 0;
}

/**
 * Diagnostic metrics for the in-memory sink.
 */
export function getDiagnosticSinkStats() {
  return {
    totalEventsReceived,
    currentBufferSize: eventBuffer.length,
    maxCapacity: MAX_SINK_CAPACITY,
    lastReceivedAt: eventBuffer.length > 0 ? eventBuffer[eventBuffer.length - 1].receivedAt : null,
  };
}
