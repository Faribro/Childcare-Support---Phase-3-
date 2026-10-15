"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWhatsAppWebhookConfig = getWhatsAppWebhookConfig;
/**
 * Server-only configuration reader for Meta WhatsApp Cloud API Webhook.
 *
 * Values are sourced exclusively from server environment variables:
 * - WHATSAPP_WEBHOOK_ENABLED: 'true' enables the receiver, all other values disable it (fail-closed default).
 * - WHATSAPP_WEBHOOK_VERIFY_TOKEN: Shared secret used during the GET hub challenge handshake.
 * - META_APP_SECRET: Meta App Secret used to compute and verify HMAC-SHA256 signatures on POST requests.
 */
function getWhatsAppWebhookConfig() {
    const isEnabled = process.env.WHATSAPP_WEBHOOK_ENABLED === 'true';
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
    const appSecret = process.env.META_APP_SECRET || '';
    return {
        isEnabled,
        verifyToken,
        appSecret,
    };
}
