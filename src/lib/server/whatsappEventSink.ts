import { RedactedWhatsAppEvent } from './whatsappWebhookParser';

const MAX_SINK_CAPACITY = 50;
const eventBuffer: RedactedWhatsAppEvent[] = [];
let totalEventsReceived = 0;

/**
 * Records a redacted event into the in-memory test sink.
 * Capacity is strictly bounded via FIFO eviction.
 */
export function recordWebhookEvent(event: RedactedWhatsAppEvent): void {
  if (eventBuffer.length >= MAX_SINK_CAPACITY) {
    eventBuffer.shift();
  }
  eventBuffer.push(event);
  totalEventsReceived++;
}

/**
 * Retrieves the most recent events from the in-memory sink (newest first).
 */
export function getRecentWebhookEvents(limit = 10): RedactedWhatsAppEvent[] {
  return [...eventBuffer].reverse().slice(0, limit);
}

/**
 * Clears the event buffer (useful for test isolation).
 */
export function clearWebhookEvents(): void {
  eventBuffer.length = 0;
  totalEventsReceived = 0;
}

/**
 * Diagnostic metrics for the in-memory sink.
 */
export function getWebhookSinkStats() {
  return {
    totalEventsReceived,
    currentBufferSize: eventBuffer.length,
    maxCapacity: MAX_SINK_CAPACITY,
    lastReceivedAt: eventBuffer.length > 0 ? eventBuffer[eventBuffer.length - 1].receivedAt : null,
  };
}
