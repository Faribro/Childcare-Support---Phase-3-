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

export interface AppEnvConfig {
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  appsScriptUrl: string | undefined;
  appsScriptSecret: string | undefined;
  metaAppSecret: string | undefined;
  metaWebhookVerifyToken: string | undefined;
  metaAccessToken: string | undefined;
  metaPhoneNumberId: string | undefined;
  metaBusinessAccountId: string | undefined;
  metaGraphApiVersion: string;
  allowLiveWhatsAppSend: boolean;
  allowLiveEmailDispatch: boolean;
  isProduction: boolean;
}

export function getAppEnvConfig(): AppEnvConfig {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production';

  // 1. Supabase URL: Reject conflicting canonical and alias
  const canonicalSbUrl = (process.env.SUPABASE_URL || '').trim();
  const aliasSbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (canonicalSbUrl && aliasSbUrl && canonicalSbUrl !== aliasSbUrl) {
    throw new Error(
      `CONFIGURATION_CONFLICT: SUPABASE_URL ('${canonicalSbUrl}') and NEXT_PUBLIC_SUPABASE_URL ('${aliasSbUrl}') conflict. Rejecting ambiguous configuration.`
    );
  }
  const supabaseUrl = canonicalSbUrl || aliasSbUrl || undefined;

  // 2. Supabase Service Role Key: Must be server-only. Reject conflicting alias.
  const canonicalSbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const aliasSbKey = (process.env.SUPABASE_KEY || '').trim();
  if (canonicalSbKey && aliasSbKey && canonicalSbKey !== aliasSbKey) {
    throw new Error(
      `CONFIGURATION_CONFLICT: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_KEY conflict. Rejecting ambiguous configuration.`
    );
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
    throw new Error(
      `CONFIGURATION_CONFLICT: Multiple conflicting Apps Script URLs configured (${distinctAppsScriptUrls.join(', ')}). Rejecting ambiguous configuration.`
    );
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
    throw new Error(
      `CONFIGURATION_CONFLICT: Multiple conflicting Apps Script secrets configured. Rejecting ambiguous configuration.`
    );
  }
  const appsScriptSecret = distinctAppsScriptSecrets[0] || undefined;

  // 5. Meta WhatsApp Secrets: Strict Separation & Alias Resolution
  // META_APP_SECRET is used ONLY for Meta payload HMAC signature verification.
  const canonicalAppSecret = (process.env.META_APP_SECRET || '').trim();
  const aliasAppSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  if (canonicalAppSecret && aliasAppSecret && canonicalAppSecret !== aliasAppSecret) {
    throw new Error(
      `CONFIGURATION_CONFLICT: META_APP_SECRET and WHATSAPP_APP_SECRET conflict. Rejecting ambiguous configuration.`
    );
  }
  const metaAppSecret = canonicalAppSecret || aliasAppSecret || undefined;

  // META_WEBHOOK_VERIFY_TOKEN may alias WHATSAPP_WEBHOOK_VERIFY_TOKEN (reject if conflicting)
  const canonicalVerifyToken = (process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
  const aliasVerifyToken = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
  if (canonicalVerifyToken && aliasVerifyToken && canonicalVerifyToken !== aliasVerifyToken) {
    throw new Error(
      `CONFIGURATION_CONFLICT: META_WEBHOOK_VERIFY_TOKEN and WHATSAPP_WEBHOOK_VERIFY_TOKEN conflict. Rejecting ambiguous configuration.`
    );
  }
  const metaWebhookVerifyToken = canonicalVerifyToken || aliasVerifyToken || undefined;

  // META_ACCESS_TOKEN (Cloud API bearer token) may alias WHATSAPP_CLOUD_API_TOKEN
  const canonicalAccessToken = (process.env.META_ACCESS_TOKEN || '').trim();
  const aliasAccessToken = (process.env.WHATSAPP_CLOUD_API_TOKEN || '').trim();
  if (canonicalAccessToken && aliasAccessToken && canonicalAccessToken !== aliasAccessToken) {
    throw new Error(
      `CONFIGURATION_CONFLICT: META_ACCESS_TOKEN and WHATSAPP_CLOUD_API_TOKEN conflict. Rejecting ambiguous configuration.`
    );
  }
  const metaAccessToken = canonicalAccessToken || aliasAccessToken || undefined;

  // META_PHONE_NUMBER_ID may alias WHATSAPP_PHONE_NUMBER_ID
  const canonicalPhoneId = (process.env.META_PHONE_NUMBER_ID || '').trim();
  const aliasPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  if (canonicalPhoneId && aliasPhoneId && canonicalPhoneId !== aliasPhoneId) {
    throw new Error(
      `CONFIGURATION_CONFLICT: META_PHONE_NUMBER_ID and WHATSAPP_PHONE_NUMBER_ID conflict. Rejecting ambiguous configuration.`
    );
  }
  const metaPhoneNumberId = canonicalPhoneId || aliasPhoneId || undefined;

  // META_BUSINESS_ACCOUNT_ID may alias WHATSAPP_BUSINESS_ACCOUNT_ID
  const canonicalWabaId = (process.env.META_BUSINESS_ACCOUNT_ID || '').trim();
  const aliasWabaId = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();
  if (canonicalWabaId && aliasWabaId && canonicalWabaId !== aliasWabaId) {
    throw new Error(
      `CONFIGURATION_CONFLICT: META_BUSINESS_ACCOUNT_ID and WHATSAPP_BUSINESS_ACCOUNT_ID conflict. Rejecting ambiguous configuration.`
    );
  }
  const metaBusinessAccountId = canonicalWabaId || aliasWabaId || undefined;

  const metaGraphApiVersion = (process.env.META_GRAPH_API_VERSION || 'v20.0').trim();

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
    metaAccessToken,
    metaPhoneNumberId,
    metaBusinessAccountId,
    metaGraphApiVersion,
    allowLiveWhatsAppSend,
    allowLiveEmailDispatch,
    isProduction,
  };
}
