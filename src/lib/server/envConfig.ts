/**
 * Unified Environment Variable Configuration & Alias Resolver
 *
 * Provides a single canonical source of truth for all server-side environment variables,
 * mapping canonical names to established backward-compatible aliases.
 */

export interface AppEnvConfig {
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  appsScriptUrl: string | undefined;
  appsScriptSecret: string | undefined;
  metaAppSecret: string | undefined;
  metaWebhookVerifyToken: string | undefined;
  allowLiveWhatsAppSend: boolean;
  allowLiveEmailDispatch: boolean;
  isProduction: boolean;
}

export function getAppEnvConfig(): AppEnvConfig {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production';

  // 1. Supabase URL: Canonical SUPABASE_URL, fallback NEXT_PUBLIC_SUPABASE_URL
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim() || undefined;

  // 2. Supabase Service Role Key: Canonical SUPABASE_SERVICE_ROLE_KEY
  const supabaseServiceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    ''
  ).trim() || undefined;

  // 3. Google Apps Script Webapp URL:
  // Canonical: APPS_SCRIPT_URL
  // Aliases: APPS_SCRIPT_WEBAPP_URL, APPS_SCRIPT_DISPATCHER_URL, APPS_SCRIPT_WEBHOOK_URL, STAGING_APPS_SCRIPT_URL
  const appsScriptUrl = (
    process.env.APPS_SCRIPT_URL ||
    process.env.APPS_SCRIPT_WEBAPP_URL ||
    process.env.APPS_SCRIPT_DISPATCHER_URL ||
    process.env.APPS_SCRIPT_WEBHOOK_URL ||
    process.env.STAGING_APPS_SCRIPT_URL ||
    ''
  ).trim() || undefined;

  // 4. Google Apps Script Secret:
  // Canonical: APPS_SCRIPT_SECRET
  // Aliases: APPS_SCRIPT_DISPATCH_SECRET, APPS_SCRIPT_WEBHOOK_SECRET, APPS_SCRIPT_API_KEY, WEBHOOK_SECRET
  const appsScriptSecret = (
    process.env.APPS_SCRIPT_SECRET ||
    process.env.APPS_SCRIPT_DISPATCH_SECRET ||
    process.env.APPS_SCRIPT_WEBHOOK_SECRET ||
    process.env.APPS_SCRIPT_API_KEY ||
    process.env.WEBHOOK_SECRET ||
    ''
  ).trim() || undefined;

  // 5. Meta WhatsApp Secrets
  const metaAppSecret = (process.env.META_APP_SECRET || '').trim() || undefined;
  const metaWebhookVerifyToken = (
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    ''
  ).trim() || undefined;

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
