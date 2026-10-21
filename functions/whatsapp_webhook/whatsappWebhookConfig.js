"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWhatsAppWebhookConfig = getWhatsAppWebhookConfig;
const envConfig_1 = require("./envConfig");
/**
 * Server-only configuration reader for Meta WhatsApp Cloud API Webhook.
 *
 * Values are sourced exclusively from server environment variables:
 * - WHATSAPP_WEBHOOK_ENABLED: 'true' enables the receiver, all other values disable it (fail-closed default).
 * - verifyToken: META_WEBHOOK_VERIFY_TOKEN (with legacy alias WHATSAPP_WEBHOOK_VERIFY_TOKEN).
 * - appSecret: META_APP_SECRET strictly for HMAC-SHA256 signature verification.
 */
function getWhatsAppWebhookConfig() {
    const env = (0, envConfig_1.getAppEnvConfig)();
    const isEnabled = process.env.WHATSAPP_WEBHOOK_ENABLED === 'true';
    return {
        isEnabled,
        verifyToken: env.metaWebhookVerifyToken || '',
        appSecret: env.metaAppSecret || '',
    };
}
