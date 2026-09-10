import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const isConfigured = canonicalSubmissionAdapter.isConfigured();
  const isProdOrStaging = canonicalSubmissionAdapter.isProductionOrStaging();
  const webhookSecret = canonicalSubmissionAdapter.getWebhookSecret();
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;

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
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  );
}
