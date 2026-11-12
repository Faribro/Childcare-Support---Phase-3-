import { NextResponse } from 'next/server';
import {
  canonicalSubmissionAdapter,
  OPERATIONAL_APPS_SCRIPT_DEPLOYMENT_IDS,
  validateUpstreamEndpoint,
} from '@/lib/server/canonicalSubmissionAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  const storageEngine = canonicalSubmissionAdapter.getStorageEngine();
  const environment = (
    process.env.APP_ENV ||
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.VERCEL_ENV ||
    'development'
  )
    .toLowerCase()
    .trim();

  const appsScriptUrl = canonicalSubmissionAdapter.getAppsScriptUrl();
  const endpointValidation = validateUpstreamEndpoint(appsScriptUrl, environment);
  const deploymentId = endpointValidation.deploymentId || null;
  const isOperationalAppsScript = Boolean(
    deploymentId && (OPERATIONAL_APPS_SCRIPT_DEPLOYMENT_IDS as readonly string[]).includes(deploymentId)
  );
  const appsScriptTarget = !appsScriptUrl
    ? 'unconfigured'
    : isOperationalAppsScript
      ? 'operational'
      : 'staging';

  const supabaseConfigured = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const appsScriptConfigured = Boolean(appsScriptUrl);
  const webhookSecretConfigured = Boolean(canonicalSubmissionAdapter.getWebhookSecret());
  const tigrisConfigured = Boolean(
    process.env.AWS_ENDPOINT_URL_S3 &&
      process.env.TIGRIS_BUCKET &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  );

  return NextResponse.json(
    {
      status: 'ok',
      service: 'childcare-support-phase-3',
      version: '3.0.0',
      environment,
      storageEngine,
      appsScriptTarget,
      appsScriptDeploymentSuffix: deploymentId ? deploymentId.slice(-6) : null,
      checks: {
        supabaseConfigured,
        appsScriptConfigured,
        webhookSecretConfigured,
        tigrisConfigured,
      },
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
