import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { resolveUserAccessScope } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
};

function safeCompareSecrets(provided: string, expected?: string): boolean {
  if (!expected || !provided) return false;
  const pHash = crypto.createHash('sha256').update(provided).digest();
  const eHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(pHash, eHash);
}

function verifyDiagnosticsAuthorization(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.substring(7).trim()
    : '';

  const diagHeader = req.headers.get('x-diagnostics-secret') || '';
  const cronHeader = req.headers.get('x-cron-secret') || '';
  const webhookHeader = req.headers.get('x-webhook-secret') || '';

  const candidate = bearerToken || diagHeader.trim() || cronHeader.trim() || webhookHeader.trim();
  if (!candidate) return false;

  const expectedSecrets = [
    process.env.DIAGNOSTICS_SECRET,
    process.env.INTERNAL_AUTH_SECRET,
    process.env.CRON_SECRET,
    process.env.WEBHOOK_SECRET,
  ].filter(Boolean) as string[];

  return expectedSecrets.some((secret) => safeCompareSecrets(candidate, secret));
}

export async function GET(req: NextRequest) {
  const isProdOrStaging =
    process.env.APP_ENV === 'production' ||
    process.env.APP_ENV === 'staging' ||
    process.env.NEXT_PUBLIC_APP_ENV === 'production' ||
    process.env.NEXT_PUBLIC_APP_ENV === 'staging' ||
    canonicalSubmissionAdapter.isProductionOrStaging();
  const hasAuthHeader = Boolean(
    req.headers.get('authorization') ||
    req.headers.get('x-diagnostics-secret') ||
    req.headers.get('x-cron-secret') ||
    req.headers.get('x-webhook-secret')
  );

  // If a secret header is provided, it must be validated with constant-time timingSafeEqual
  if (hasAuthHeader) {
    if (!verifyDiagnosticsAuthorization(req)) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Diagnostics endpoint requires valid authorization.',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  } else if (isProdOrStaging || process.env.REQUIRE_DIAGNOSTICS_AUTH === 'true') {
    // In production/staging, check for authenticated supervisor/admin/leadership session
    const scope = await resolveUserAccessScope(req);
    const isAllowedRole = scope.isVerified && ['ADMIN', 'SUPERVISOR', 'LEADERSHIP'].includes(scope.role);
    if (!isAllowedRole) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Diagnostics endpoint requires valid authorization.',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  const isConfigured = canonicalSubmissionAdapter.isConfigured();
  const webhookSecret = canonicalSubmissionAdapter.getWebhookSecret();
  const appsScriptUrl = canonicalSubmissionAdapter.getAppsScriptUrl();

  let urlHostname = null;
  if (appsScriptUrl) {
    try {
      urlHostname = new URL(appsScriptUrl).hostname;
    } catch {
      urlHostname = 'invalid-url';
    }
  }

  const mockRecords = MockSheetStore.listRecords({ limit: 10 });

  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      appEnv: process.env.NEXT_PUBLIC_APP_ENV || 'unset',
      isProductionOrStaging: isProdOrStaging,
      e2eStagingEnabled: process.env.E2E_STAGING_ENABLED === 'true',
      e2eAllowLocalMock: process.env.E2E_ALLOW_LOCAL_MOCK === 'true',
    },
    bridge: {
      isConfigured,
      hasAppsScriptUrl: Boolean(appsScriptUrl),
      appsScriptHost: urlHostname,
      hasWebhookSecret: Boolean(webhookSecret),
      secretConfiguredLength: webhookSecret ? webhookSecret.length : 0,
      activeMode: isConfigured ? 'live_apps_script' : 'in_memory_mock',
    },
    mockStore: {
      recordCount: MockSheetStore.recordCount(),
      sampleIds: mockRecords.records.map((r: any) => r.uniqueId || r.art_number || r.client_submission_id),
    },
    status: 'healthy',
  };

  return NextResponse.json(
    { status: 'success', data: diagnostics },
    {
      status: 200,
      headers: NO_STORE_HEADERS,
    }
  );
}
