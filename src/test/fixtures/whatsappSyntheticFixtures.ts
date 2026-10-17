import crypto from 'crypto';
import type {
  MetaWhatsAppWebhookPayload,
  MetaWhatsAppMessage,
  MetaWhatsAppStatus,
  MetaWhatsAppChange,
} from '@/lib/server/whatsappWebhookParser';

/**
 * Synthetic Test Fixture Factory for WhatsApp Cloud API Webhooks.
 *
 * Provides typed, pre-computed synthetic fixtures and signing helpers
 * for testing without connecting to live Meta APIs or using real beneficiary data.
 */

export const SYNTHETIC_PHONE_NUMBER_ID = '1413691425156891';
export const SYNTHETIC_WABA_ID = '1670497521174128';
export const SYNTHETIC_DISPLAY_PHONE = '+15551234567';
export const SYNTHETIC_RECIPIENT_PHONE = '919876543210';
export const SYNTHETIC_APP_SECRET = 'synthetic_meta_app_secret_1234567890abcdef';
export const SYNTHETIC_VERIFY_TOKEN = 'synthetic_verify_token_secure_xyz_789';

/**
 * Computes X-Hub-Signature-256 for a given payload and secret.
 */
export function computeSyntheticSignature(payload: string | Buffer, secret: string = SYNTHETIC_APP_SECRET): string {
  const buffer = typeof payload === 'string' ? Buffer.from(payload, 'utf-8') : payload;
  const digest = crypto.createHmac('sha256', secret).update(buffer).digest('hex');
  return `sha256=${digest}`;
}

/**
 * Creates a signed raw webhook payload envelope with headers.
 */
export function createSignedWebhookPayload(
  payload: Record<string, unknown> | string,
  secret: string = SYNTHETIC_APP_SECRET
): {
  rawBody: string;
  signature: string;
  signatureHeader: string;
  headers: Record<string, string>;
} {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = computeSyntheticSignature(rawBody, secret);
  return {
    rawBody,
    signature,
    signatureHeader: signature,
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
    },
  };
}

/**
 * 1. Synthetic Inbound Text Message Payload
 */
export function createSyntheticInboundMessage(options: {
  text?: string;
  senderPhone?: string;
  senderName?: string;
  messageId?: string;
  timestamp?: string;
} = {}): MetaWhatsAppWebhookPayload {
  const messageId = options.messageId || `wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhgWM0VCRDBERkMxMjM0NTY3ODkwQUIQA${Date.now()}`;
  const timestamp = options.timestamp || Math.floor(Date.now() / 1000).toString();

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: SYNTHETIC_WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: SYNTHETIC_DISPLAY_PHONE,
                phone_number_id: SYNTHETIC_PHONE_NUMBER_ID,
              },
              contacts: [
                {
                  profile: { name: options.senderName || 'Synthetic Beneficiary' },
                  wa_id: options.senderPhone || SYNTHETIC_RECIPIENT_PHONE,
                },
              ],
              messages: [
                {
                  from: options.senderPhone || SYNTHETIC_RECIPIENT_PHONE,
                  id: messageId,
                  timestamp,
                  type: 'text',
                  text: { body: options.text || 'Synthetic health status update' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * 2. Synthetic Outbound Status Delivery Receipt Payload ('sent' | 'delivered' | 'read')
 */
export function createSyntheticDeliveryReceipt(options: {
  status?: 'sent' | 'delivered' | 'read';
  recipientId?: string;
  messageId?: string;
  conversationId?: string;
  timestamp?: string;
} = {}): MetaWhatsAppWebhookPayload {
  const messageId = options.messageId || `wamid.OUT_${Date.now()}`;
  const timestamp = options.timestamp || Math.floor(Date.now() / 1000).toString();

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: SYNTHETIC_WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: SYNTHETIC_DISPLAY_PHONE,
                phone_number_id: SYNTHETIC_PHONE_NUMBER_ID,
              },
              statuses: [
                {
                  id: messageId,
                  status: options.status || 'delivered',
                  timestamp,
                  recipient_id: options.recipientId || SYNTHETIC_RECIPIENT_PHONE,
                  conversation: {
                    id: options.conversationId || 'conv_synth_12345',
                    origin: { type: 'business_initiated' },
                  },
                  pricing: {
                    billable: true,
                    pricing_model: 'CBP',
                    category: 'utility',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * 3. Synthetic Outbound Status Failure Payload with Error Codes
 * Examples:
 * - 131026: Message undeliverable
 * - 131047: Re-engagement message required (24h customer window expired)
 * - 130429: Rate limit hit
 */
export function createSyntheticFailedDelivery(options: {
  errorCode?: number;
  errorTitle?: string;
  errorMessage?: string;
  recipientId?: string;
  messageId?: string;
} = {}): MetaWhatsAppWebhookPayload {
  const errorCode = options.errorCode ?? 131026;
  const messageId = options.messageId || `wamid.FAIL_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: SYNTHETIC_WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: SYNTHETIC_DISPLAY_PHONE,
                phone_number_id: SYNTHETIC_PHONE_NUMBER_ID,
              },
              statuses: [
                {
                  id: messageId,
                  status: 'failed',
                  timestamp,
                  recipient_id: options.recipientId || SYNTHETIC_RECIPIENT_PHONE,
                  errors: [
                    {
                      code: errorCode,
                      title: options.errorTitle || 'Message Undeliverable',
                      message: options.errorMessage || 'Unable to deliver message to destination.',
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * 4. Synthetic Account Alert / Non-Message Update
 */
export function createSyntheticAccountAlert(options: {
  field?: string;
  alertType?: string;
} = {}): MetaWhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: SYNTHETIC_WABA_ID,
        changes: [
          {
            field: options.field || 'account_alerts',
            value: {
              messaging_product: 'whatsapp',
              alert_type: options.alertType || 'TEMPLATE_STATUS_UPDATE',
              event: 'APPROVED',
            },
          },
        ],
      },
    ],
  };
}

/**
 * 5. Pre-computed static synthetic fixtures for fast deterministic tests
 */
export const STATIC_SYNTHETIC_FIXTURES = {
  inboundTextMessage: createSyntheticInboundMessage({
    text: 'Namaste, nutrition kit received.',
    senderPhone: '919876543210',
    senderName: 'Synthetic Mother',
    messageId: 'wamid.STATIC_MSG_001',
    timestamp: '1700000000',
  }),

  deliveryDeliveredReceipt: createSyntheticDeliveryReceipt({
    status: 'delivered',
    recipientId: '919876543210',
    messageId: 'wamid.STATIC_MSG_001',
    timestamp: '1700000005',
  }),

  deliveryReadReceipt: createSyntheticDeliveryReceipt({
    status: 'read',
    recipientId: '919876543210',
    messageId: 'wamid.STATIC_MSG_001',
    timestamp: '1700000010',
  }),

  deliveryWindowExpiredFailure: createSyntheticFailedDelivery({
    errorCode: 131047,
    errorTitle: 'Re-engagement message',
    errorMessage: 'More than 24 hours have passed since the customer last replied to this number.',
    messageId: 'wamid.STATIC_MSG_EXPIRED',
  }),

  deliveryUndeliverableFailure: createSyntheticFailedDelivery({
    errorCode: 131026,
    errorTitle: 'Message undeliverable',
    errorMessage: 'Message could not be delivered to this recipient.',
    messageId: 'wamid.STATIC_MSG_UNDELIV',
  }),

  nonMessageTemplateUpdate: createSyntheticAccountAlert({
    field: 'message_template_status_update',
    alertType: 'TEMPLATE_STATUS_UPDATE',
  }),

  unsupportedObjectType: {
    object: 'page',
    entry: [{ id: '12345', changes: [] }],
  },

  malformedJsonString: '{"object":"whatsapp_business_account", "entry": [INVALID_JSON',
};
