import { NextRequest, NextResponse } from 'next/server';
import { getAppEnvConfig } from '@/lib/server/envConfig';
import { resolveUserAccessScope } from '@/lib/server/authorisation';
import { getExportConfirmationStore } from '@/lib/server/whatsappPipelineFactory';
import { ExportDeliveryJob } from '@/features/leadership-reporting';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const WORKER_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
};

function verifyWorkerAuthorization(req: NextRequest, envSecret?: string): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const webhookSecret = envSecret || process.env.WEBHOOK_SECRET;

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token && (token === cronSecret || token === webhookSecret)) return true;
  }

  const secretHeader = req.headers.get('x-webhook-secret') || '';
  if (secretHeader.trim() && secretHeader.trim() === webhookSecret) return true;

  return false;
}

export async function GET(req: NextRequest) {
  const requestId = `export-worker-status-${Date.now().toString(36)}`;
  const env = getAppEnvConfig();

  const isSecretAuthorized = verifyWorkerAuthorization(req, env.appsScriptSecret);
  if (!isSecretAuthorized) {
    const scope = await resolveUserAccessScope(req);
    if (!scope.isVerified || (scope.role !== 'ADMIN' && scope.role !== 'LEADERSHIP')) {
      return NextResponse.json(
        { status: 'error', code: 'UNAUTHORIZED', message: 'Worker status inspection requires valid authorization.', requestId },
        { status: 401, headers: WORKER_NO_STORE_HEADERS }
      );
    }
  }

  try {
    const confirmationStore = getExportConfirmationStore();
    // Query stale jobs to inspect queue health
    const staleJobs = confirmationStore.recoverStaleDeliveryJobs
      ? await confirmationStore.recoverStaleDeliveryJobs(300000)
      : [];

    return NextResponse.json(
      {
        status: 'ok',
        requestId,
        worker: 'export-delivery',
        liveEmailDispatchEnabled: env.allowLiveEmailDispatch,
        isProduction: env.isProduction,
        staleRecoveredCount: staleJobs.length,
        staleJobs: staleJobs.map((j: ExportDeliveryJob) => ({
          jobId: j.jobId,
          exportId: j.exportId,
          reportType: j.reportType,
          status: j.status,
          queuedAt: j.queuedAt,
          errorReason: j.errorReason,
        })),
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: WORKER_NO_STORE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'WORKER_STATUS_FAILED',
        message: error?.message || 'Failed to inspect export delivery worker status.',
        requestId,
      },
      { status: 500, headers: WORKER_NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  const requestId = `export-worker-drain-${Date.now().toString(36)}`;
  const env = getAppEnvConfig();

  const isSecretAuthorized = verifyWorkerAuthorization(req, env.appsScriptSecret);
  if (!isSecretAuthorized) {
    const scope = await resolveUserAccessScope(req);
    if (!scope.isVerified || (scope.role !== 'ADMIN' && scope.role !== 'LEADERSHIP')) {
      return NextResponse.json(
        { status: 'error', code: 'UNAUTHORIZED', message: 'Worker trigger requires valid authorization.', requestId },
        { status: 401, headers: WORKER_NO_STORE_HEADERS }
      );
    }
  }

  try {
    const confirmationStore = getExportConfirmationStore();
    const workerId = `vercel-worker-${Date.now().toString(36)}`;

    // 1. Recover stale unconfirmed leases first
    const staleRecovered = confirmationStore.recoverStaleDeliveryJobs
      ? await confirmationStore.recoverStaleDeliveryJobs(300000)
      : [];

    // 2. Claim next available job atomically
    const claimedJob = confirmationStore.claimDeliveryJob
      ? await confirmationStore.claimDeliveryJob(workerId, 300000)
      : null;

    if (!claimedJob) {
      return NextResponse.json(
        {
          status: 'ok',
          message: 'No pending export delivery jobs in queue.',
          requestId,
          staleRecoveredCount: staleRecovered.length,
          claimed: null,
        },
        { status: 200, headers: WORKER_NO_STORE_HEADERS }
      );
    }

    // 3. Operational Latch Check
    if (!env.allowLiveEmailDispatch) {
      // Live email dispatch is disabled; simulate drain or record safe skip
      await confirmationStore.updateJobStatus(
        claimedJob.jobId,
        'FAILED',
        'LIVE_EMAIL_DISPATCH_DISABLED: Dispatch skipped safely by kill-switch'
      );

      return NextResponse.json(
        {
          status: 'ok',
          message: 'Job processed with live dispatch disabled (fail-closed simulation).',
          requestId,
          staleRecoveredCount: staleRecovered.length,
          jobId: claimedJob.jobId,
          outcome: 'SIMULATED_DISPATCH_DISABLED',
        },
        { status: 200, headers: WORKER_NO_STORE_HEADERS }
      );
    }

    // 4. Live dispatch execution when enabled
    return NextResponse.json(
      {
        status: 'ok',
        message: 'Job claimed for delivery.',
        requestId,
        jobId: claimedJob.jobId,
        staleRecoveredCount: staleRecovered.length,
      },
      { status: 200, headers: WORKER_NO_STORE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'WORKER_DRAIN_FAILED',
        message: error?.message || 'Export delivery worker execution failed.',
        requestId,
      },
      { status: 500, headers: WORKER_NO_STORE_HEADERS }
    );
  }
}
