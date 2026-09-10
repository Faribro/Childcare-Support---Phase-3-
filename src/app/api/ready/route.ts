import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

export const dynamic = 'force-dynamic';

/**
 * Restricted Internal Readiness & Diagnostics Endpoint
 * 
 * In production, requires authentication via 'x-diagnostics-token' or 'Authorization: Bearer <token>'
 * matching DIAGNOSTICS_SECRET or WEBHOOK_SECRET.
 * In local/test environments (NODE_ENV !== 'production'), diagnostics are accessible for automated testing.
 */
export async function GET(req: NextRequest) {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredSecret = process.env.DIAGNOSTICS_SECRET || process.env.WEBHOOK_SECRET;

  if (isProduction && configuredSecret) {
    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    const diagHeader = req.headers.get('x-diagnostics-token') || '';

    const isAuthorized =
      (bearerToken && bearerToken === configuredSecret) ||
      (diagHeader && diagHeader === configuredSecret);

    if (!isAuthorized) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Readiness diagnostics require authentication',
        },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      );
    }
  }

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
      ready: true,
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
