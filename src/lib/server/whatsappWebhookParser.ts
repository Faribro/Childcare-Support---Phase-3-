export interface MetaWhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; sha256?: string; caption?: string };
  document?: { id: string; filename?: string; mime_type?: string; sha256?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  button?: { payload: string; text: string };
  interactive?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MetaWhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; origin?: { type: string } };
  pricing?: { billable?: boolean; pricing_model?: string; category?: string };
  errors?: Array<{ code: number; title: string; message?: string }>;
  [key: string]: unknown;
}

export interface MetaWhatsAppContact {
  profile?: { name?: string };
  wa_id?: string;
}

export interface MetaWhatsAppChangeValue {
  messaging_product: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: MetaWhatsAppContact[];
  messages?: MetaWhatsAppMessage[];
  statuses?: MetaWhatsAppStatus[];
  errors?: Array<{ code: number; title: string; message?: string }>;
}

export interface MetaWhatsAppChange {
  value: MetaWhatsAppChangeValue;
  field: string;
}

export interface MetaWhatsAppEntry {
  id: string; // WhatsApp Business Account ID (WABA ID)
  changes: MetaWhatsAppChange[];
}

export interface MetaWhatsAppWebhookPayload {
  object: string;
  entry: MetaWhatsAppEntry[];
}

export interface RedactedMessageItem {
  id: string;
  type: string;
  timestamp: string;
  maskedSender: string;
  contentRedacted: true;
}

export interface RedactedStatusItem {
  id: string;
  status: string;
  timestamp: string;
  maskedRecipient: string;
  errorCode?: number;
}

export interface RedactedWhatsAppEvent {
  eventId: string;
  receivedAt: string;
  wabaId: string;
  field: string;
  phoneNumberId: string;
  maskedDisplayPhone: string;
  messages: RedactedMessageItem[];
  statuses: RedactedStatusItem[];
  contactCount: number;
}

/**
 * Masks phone numbers to protect personally identifiable information (PII).
 *
 * Example:
 *   "919876543210" -> "******3210"
 *   "+919876543210" -> "+******3210"
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '[UNKNOWN]';
  const cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.length <= 4) return '****';
  const lastFour = cleaned.slice(-4);
  const prefix = cleaned.startsWith('+') ? '+' : '';
  return `${prefix}******${lastFour}`;
}

/**
 * Transforms an incoming Meta WhatsApp webhook payload into a sanitized,
 * privacy-preserving record stripped of all PII (names, messages, raw phone numbers).
 */
export function redactWhatsAppPayload(payload: MetaWhatsAppWebhookPayload): RedactedWhatsAppEvent[] {
  const events: RedactedWhatsAppEvent[] = [];
  const now = new Date().toISOString();

  if (!payload || !Array.isArray(payload.entry)) {
    return events;
  }

  for (let entryIdx = 0; entryIdx < payload.entry.length; entryIdx++) {
    const entry = payload.entry[entryIdx];
    const wabaId = entry?.id || 'unknown';
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (let changeIdx = 0; changeIdx < changes.length; changeIdx++) {
      const change = changes[changeIdx];
      const field = change?.field || 'unknown';
      const val = change?.value;

      const phoneNumberId = val?.metadata?.phone_number_id || 'unknown';
      const maskedDisplayPhone = maskPhoneNumber(val?.metadata?.display_phone_number);

      const redactedMessages: RedactedMessageItem[] = [];
      if (Array.isArray(val?.messages)) {
        for (const msg of val.messages) {
          redactedMessages.push({
            id: String(msg.id || 'unknown'),
            type: String(msg.type || 'unknown'),
            timestamp: String(msg.timestamp || ''),
            maskedSender: maskPhoneNumber(msg.from),
            contentRedacted: true,
          });
        }
      }

      const redactedStatuses: RedactedStatusItem[] = [];
      if (Array.isArray(val?.statuses)) {
        for (const st of val.statuses) {
          redactedStatuses.push({
            id: String(st.id || 'unknown'),
            status: String(st.status || 'unknown'),
            timestamp: String(st.timestamp || ''),
            maskedRecipient: maskPhoneNumber(st.recipient_id),
            errorCode: Array.isArray(st.errors) && st.errors[0]?.code ? st.errors[0].code : undefined,
          });
        }
      }

      const contactCount = Array.isArray(val?.contacts) ? val.contacts.length : 0;

      events.push({
        eventId: `ev-${wabaId}-${entryIdx}-${changeIdx}-${Date.now()}`,
        receivedAt: now,
        wabaId,
        field,
        phoneNumberId,
        maskedDisplayPhone,
        messages: redactedMessages,
        statuses: redactedStatuses,
        contactCount,
      });
    }
  }

  return events;
}
