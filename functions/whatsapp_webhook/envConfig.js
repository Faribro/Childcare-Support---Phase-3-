"use strict";
/**
 * Unified Environment Variable Configuration & Alias Resolver
 *
 * Provides a single canonical source of truth for all server-side environment variables,
 * mapping canonical names to established backward-compatible aliases.
 *
 * Safety Invariants:
 * 1. Rejects conflicting canonical/alias configurations fail-closed.
 * 2. META_APP_SECRET is strictly dedicated to payload HMAC signature verification;
 *    never falls back to or substitutes for a webhook verification token.
 * 3. Privileged credentials (SUPABASE_SERVICE_ROLE_KEY) are server-only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppEnvConfig = getAppEnvConfig;
function getAppEnvConfig() {
    const isProduction = process.env.NODE_ENV === 'production' ||
        process.env.VERCEL_ENV === 'production';
    // 1. Supabase URL: Reject conflicting canonical and alias
    const canonicalSbUrl = (process.env.SUPABASE_URL || '').trim();
    const aliasSbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    if (canonicalSbUrl && aliasSbUrl && canonicalSbUrl !== aliasSbUrl) {
        throw new Error(`CONFIGURATION_CONFLICT: SUPABASE_URL ('${canonicalSbUrl}') and NEXT_PUBLIC_SUPABASE_URL ('${aliasSbUrl}') conflict. Rejecting ambiguous configuration.`);
    }
    const supabaseUrl = canonicalSbUrl || aliasSbUrl || undefined;
    // 2. Supabase Service Role Key: Must be server-only. Reject conflicting alias.
    const canonicalSbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const aliasSbKey = (process.env.SUPABASE_KEY || '').trim();
    if (canonicalSbKey && aliasSbKey && canonicalSbKey !== aliasSbKey) {
        throw new Error(`CONFIGURATION_CONFLICT: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_KEY conflict. Rejecting ambiguous configuration.`);
    }
    const supabaseServiceRoleKey = canonicalSbKey || aliasSbKey || undefined;
    // 3. Google Apps Script Webapp URL: Reject conflicting URLs
    const appsScriptUrlRaw = [
        process.env.APPS_SCRIPT_URL,
        process.env.APPS_SCRIPT_WEBAPP_URL,
        process.env.APPS_SCRIPT_DISPATCHER_URL,
        process.env.APPS_SCRIPT_WEBHOOK_URL,
        process.env.STAGING_APPS_SCRIPT_URL,
    ]
        .map((u) => (u || '').trim())
        .filter(Boolean);
    const distinctAppsScriptUrls = Array.from(new Set(appsScriptUrlRaw));
    if (distinctAppsScriptUrls.length > 1) {
        throw new Error(`CONFIGURATION_CONFLICT: Multiple conflicting Apps Script URLs configured (${distinctAppsScriptUrls.join(', ')}). Rejecting ambiguous configuration.`);
    }
    const appsScriptUrl = distinctAppsScriptUrls[0] || undefined;
    // 4. Google Apps Script Secret: Reject conflicting secrets
    const appsScriptSecretRaw = [
        process.env.APPS_SCRIPT_SECRET,
        process.env.APPS_SCRIPT_DISPATCH_SECRET,
        process.env.APPS_SCRIPT_WEBHOOK_SECRET,
        process.env.APPS_SCRIPT_API_KEY,
        process.env.WEBHOOK_SECRET,
    ]
        .map((s) => (s || '').trim())
        .filter(Boolean);
    const distinctAppsScriptSecrets = Array.from(new Set(appsScriptSecretRaw));
    if (distinctAppsScriptSecrets.length > 1) {
        throw new Error(`CONFIGURATION_CONFLICT: Multiple conflicting Apps Script secrets configured. Rejecting ambiguous configuration.`);
    }
    const appsScriptSecret = distinctAppsScriptSecrets[0] || undefined;
    // 5. Meta WhatsApp Secrets: Strict Separation
    // META_APP_SECRET is used ONLY for Meta payload HMAC signature verification.
    const metaAppSecret = (process.env.META_APP_SECRET || '').trim() || undefined;
    // META_WEBHOOK_VERIFY_TOKEN may alias WHATSAPP_WEBHOOK_VERIFY_TOKEN (reject if conflicting)
    const canonicalVerifyToken = (process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
    const aliasVerifyToken = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
    if (canonicalVerifyToken && aliasVerifyToken && canonicalVerifyToken !== aliasVerifyToken) {
        throw new Error(`CONFIGURATION_CONFLICT: META_WEBHOOK_VERIFY_TOKEN and WHATSAPP_WEBHOOK_VERIFY_TOKEN conflict. Rejecting ambiguous configuration.`);
    }
    const metaWebhookVerifyToken = canonicalVerifyToken || aliasVerifyToken || undefined;
    // Invariant check: Verify token must never be substituted for app secret or vice-versa
    // (Both have distinct cryptographic purposes and lifetimes)
    // 6. Operational Kill-Switches (strict boolean parsing, default false)
    const allowLiveWhatsAppSend = process.env.ALLOW_LIVE_WHATSAPP_SEND === 'true';
    const allowLiveEmailDispatch = process.env.ALLOW_LIVE_EMAIL_DISPATCH === 'true';
    return {
        supabaseUrl,
        supabaseServiceRoleKey,
        appsScriptUrl,
        appsScriptSecret,
        metaAppSecret,
        metaWebhookVerifyToken,
        allowLiveWhatsAppSend,
        allowLiveEmailDispatch,
        isProduction,
    };
}
