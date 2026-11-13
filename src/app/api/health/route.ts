import { NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { getFirestoreDb } from '@/lib/server/credentialRegistry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dataEngine = (process.env.DATA_ENGINE || 'sheets').toLowerCase().trim();
  const storageProvider = (process.env.STORAGE_PROVIDER || 'tigris').toLowerCase().trim();
  const environment = (
    process.env.APP_ENV ||
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.VERCEL_ENV ||
    'development'
  )
    .toLowerCase()
    .trim();

  const commit =
    process.env.K_REVISION ||
    process.env.GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    'development';

  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';

  // Subsystem Reachability Checks
  let firestoreReachable = false;
  if (dataEngine === 'firestore') {
    try {
      const db = await getFirestoreDb();
      firestoreReachable = Boolean(db);
    } catch {
      firestoreReachable = false;
    }
  }

  let storageBucketReachable = false;
  if (storageProvider === 'gcs') {
    storageBucketReachable = Boolean(process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET);
  } else if (storageProvider === 'tigris') {
    storageBucketReachable = Boolean(
      process.env.AWS_ENDPOINT_URL_S3 &&
        process.env.TIGRIS_BUCKET &&
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY
    );
  }

  const appsScriptUrl = canonicalSubmissionAdapter.getAppsScriptUrl();
  const appsScriptReachable = Boolean(appsScriptUrl && canonicalSubmissionAdapter.getWebhookSecret());

  const appsScriptConfigured = Boolean(appsScriptUrl);
  const webhookSecretConfigured = Boolean(canonicalSubmissionAdapter.getWebhookSecret());
  const supabaseConfigured = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
      commit,
      appEnv: environment,
      environment,
      dataEngine,
      storageProvider,
      firestoreDatabaseId,
      reachability: {
        firestore: firestoreReachable,
        storageBucket: storageBucketReachable,
        appsScript: appsScriptReachable,
      },
      checks: {
        supabaseConfigured,
        appsScriptConfigured,
        webhookSecretConfigured,
        tigrisConfigured,
        firestoreReachable,
        storageBucketReachable,
        appsScriptReachable,
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
