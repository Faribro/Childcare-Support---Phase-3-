import { NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  const storageEngine = canonicalSubmissionAdapter.getStorageEngine();
  const supabaseConfigured = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const appsScriptConfigured = Boolean(canonicalSubmissionAdapter.getAppsScriptUrl());
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
      storageEngine,
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
