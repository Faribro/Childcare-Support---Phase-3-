import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  SheetsMirrorWorker,
  GatewayClient,
  DrainSummary,
} from '@/lib/server/sheetsMirrorWorker';
import { getAppEnvConfig } from '@/lib/server/envConfig';
import { getExportConfirmationStore } from '@/lib/server/whatsappPipelineFactory';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
};

function safeCompareSecrets(provided: string, expected?: string): boolean {
  if (!expected || !provided) return false;
  const pHash = crypto.createHash('sha256').update(provided).digest();
  const eHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(pHash, eHash);
}

function verifyCronAuthorization(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.substring(7).trim()
    : '';

  const cronHeader = req.headers.get('x-cron-secret') || '';
  const secretHeader = req.headers.get('x-webhook-secret') || '';

  const candidate = bearerToken || cronHeader.trim() || secretHeader.trim();
  if (!candidate) return false;

  return (
    safeCompareSecrets(candidate, cronSecret) ||
    safeCompareSecrets(candidate, webhookSecret)
  );
}

export async function POST(req: NextRequest) {
  const requestId = `cron-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

  if (!verifyCronAuthorization(req)) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Scheduled worker invocation requires valid CRON_SECRET authorization.',
        requestId,
      },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const results: {
    sheetsMirror?: {
      status: string;
      summary?: DrainSummary;
      pendingRemaining?: number;
      deadLetterCount?: number;
      replayedDeadLetters?: number;
    };
    exportDelivery?: {
      status: string;
      staleRecoveredCount?: number;
      claimedJobsProcessed?: number;
    };
  } = {};

  // 1. Sheets Mirror Queue Drain & Dead Letter Recovery
  try {
    const adapter = await canonicalSubmissionAdapter.getSupabaseAdapter();
    const mirrorRepo = adapter.getMirrorRepo ? adapter.getMirrorRepo() : null;

    if (mirrorRepo) {
      const appsScriptUrl = canonicalSubmissionAdapter.getAppsScriptUrl();
      const webhookSecret = canonicalSubmissionAdapter.getWebhookSecret();

      const gatewayClient: GatewayClient = {
        callGateway: async (payload: Record<string, any>) => {
          if (!appsScriptUrl || !canonicalSubmissionAdapter.isConfigured()) {
            return {
              status: 'error',
              statusCode: 503,
              message: 'Central Google Sheets bridge is unconfigured in current environment.',
            };
          }

          const res = await fetch(appsScriptUrl, {
            method: 'POST',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
            },
            body: JSON.stringify({ ...payload, secret: webhookSecret }),
          });

          const gasData = await res.json().catch(() => ({}));
          return {
            status: gasData.status || (res.ok ? 'success' : 'error'),
            statusCode: res.status,
            resolvedRow: gasData.resolvedRow || gasData.rowNumber,
            currentVersion: gasData.currentVersion,
            message: gasData.message,
          };
        },
      };

      const worker = new SheetsMirrorWorker(mirrorRepo, gatewayClient, {
        workerId: `cron-worker-${requestId}`,
      });

      // Drain queue (batch of 25)
      const summary = await worker.drainQueue(25);
      const pendingRemaining = await mirrorRepo.getPendingCount();
      const deadLetterCount = await mirrorRepo.getDeadLetterCount();

      results.sheetsMirror = {
        status: 'completed',
        summary,
        pendingRemaining,
        deadLetterCount,
      };
    } else {
      results.sheetsMirror = {
        status: 'skipped',
      };
    }
  } catch (err: any) {
    results.sheetsMirror = {
      status: 'error',
      summary: { processed: 0, completed: 0, failed: 1, deadLettered: 0, superseded: 0 },
    };
  }

  // 2. Export Delivery Lease Recovery & Queue Drain
  try {
    const confirmationStore = getExportConfirmationStore();
    const staleJobs = confirmationStore.recoverStaleDeliveryJobs
      ? await confirmationStore.recoverStaleDeliveryJobs(300000)
      : [];

    results.exportDelivery = {
      status: 'completed',
      staleRecoveredCount: staleJobs.length,
      claimedJobsProcessed: 0,
    };
  } catch {
    results.exportDelivery = {
      status: 'skipped',
    };
  }

  return NextResponse.json(
    {
      status: 'success',
      requestId,
      executedAt: new Date().toISOString(),
      workers: results,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

export async function GET(req: NextRequest) {
  return POST(req);
}
