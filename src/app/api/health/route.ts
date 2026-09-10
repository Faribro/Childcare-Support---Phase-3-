import { NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  const isProdOrStaging = canonicalSubmissionAdapter.isProductionOrStaging();
  const isConfigured =
    canonicalSubmissionAdapter.isConfigured() &&
    Boolean(canonicalSubmissionAdapter.getWebhookSecret());

  const adapterMode = isConfigured
    ? 'configured'
    : isProdOrStaging
    ? 'failing_closed_unconfigured'
    : 'mock_development';

  return NextResponse.json(
    {
      status: 'ok',
      service: 'childcare-support-phase-3',
      version: '3.0.0',
      apiContractVersion: 'v3.1.0-contract',
      buildCommitSha:
        process.env.RENDER_GIT_COMMIT ||
        process.env.GIT_COMMIT ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        'local',
      adapterMode,
      appEnvironmentMarker:
        process.env.NEXT_PUBLIC_APP_ENV ||
        process.env.NODE_ENV ||
        'development',
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
