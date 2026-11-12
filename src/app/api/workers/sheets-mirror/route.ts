import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  SheetsMirrorWorker,
  GatewayClient,
  DrainSummary,
  SheetsMirrorJob,
} from '@/lib/server/sheetsMirrorWorker';
import { notifyDeadLetterAlert } from '@/lib/server/deadLetterAlert';
import { resolveUserAccessScope, logSecurityEvent } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const WORKER_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
};

function verifyWorkerAuthorization(req: NextRequest, webhookSecret?: string): boolean {
  if (!webhookSecret) return false;

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === webhookSecret) return true;
  }

  const secretHeader = req.headers.get('x-webhook-secret') || '';
  if (secretHeader.trim() === webhookSecret) return true;

  return false;
}

function sanitizeDeadLetterJobs(jobs: SheetsMirrorJob[]) {
  return jobs.map((j) => ({
    id: j.id,
    jobType: j.job_type,
    targetSheetName: j.target_sheet_name,
    attemptCount: j.attempt_count,
    maxAttempts: j.max_attempts,
    lastError: j.last_error,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
  }));
}

export async function GET(req: NextRequest) {
  const requestId = `worker-status-${Date.now().toString(36)}`;
  const webhookSecret = canonicalSubmissionAdapter.getWebhookSecret();

  const isSecretAuthorized = verifyWorkerAuthorization(req, webhookSecret);
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
    const adapter = await canonicalSubmissionAdapter.getSupabaseAdapter();
    const mirrorRepo = adapter.getMirrorRepo ? adapter.getMirrorRepo() : null;

    if (!mirrorRepo) {
      return NextResponse.json(
        { status: 'ok', engine: canonicalSubmissionAdapter.getStorageEngine(), queue: 'NOT_ACTIVE', requestId },
        { status: 200, headers: WORKER_NO_STORE_HEADERS }
      );
    }

    const pendingCount = await mirrorRepo.getPendingCount();
    const deadLetterCount = await mirrorRepo.getDeadLetterCount();
    const includeDeadLetters = req.nextUrl.searchParams.get('includeDeadLetters') === 'true';
    const deadLetterJobs =
      includeDeadLetters && deadLetterCount > 0 ? await mirrorRepo.listDeadLetterJobs(50) : [];

    const alert =
      deadLetterCount > 0
        ? await notifyDeadLetterAlert({
            source: 'GET /api/workers/sheets-mirror',
            requestId,
            deadLetteredInBatch: 0,
            totalDeadLetterCount: deadLetterCount,
            sampleJobs: sanitizeDeadLetterJobs(deadLetterJobs),
          })
        : { triggered: false, webhookDispatched: false };

    return NextResponse.json(
      {
        status: 'ok',
        engine: canonicalSubmissionAdapter.getStorageEngine(),
        queue: {
          pendingCount,
          deadLetterCount,
          status: deadLetterCount > 0 ? 'HAS_DEAD_LETTERS' : pendingCount > 0 ? 'HAS_WORK' : 'IDLE',
        },
        ...(includeDeadLetters ? { deadLetterJobs: sanitizeDeadLetterJobs(deadLetterJobs) } : {}),
        alert,
        requestId,
      },
      { status: 200, headers: WORKER_NO_STORE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: err?.message || 'Failed to inspect queue status.', requestId },
      { status: 500, headers: WORKER_NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  const requestId = `worker-drain-${Date.now().toString(36)}`;
  const webhookSecret = canonicalSubmissionAdapter.getWebhookSecret();

  let actor = 'webhook-cron';
  let actorRole = 'SYSTEM';
  const isSecretAuthorized = verifyWorkerAuthorization(req, webhookSecret);
  if (!isSecretAuthorized) {
    const scope = await resolveUserAccessScope(req);
    if (!scope.isVerified || (scope.role !== 'ADMIN' && scope.role !== 'LEADERSHIP')) {
      logSecurityEvent({
        actor: scope.userId || 'anonymous-worker-caller',
        actorRole: scope.role || 'UNVERIFIED',
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        details: 'Unauthorized caller attempted POST /api/workers/sheets-mirror',
      });
      return NextResponse.json(
        { status: 'error', code: 'UNAUTHORIZED', message: 'Worker trigger requires valid authorization.', requestId },
        { status: 401, headers: WORKER_NO_STORE_HEADERS }
      );
    }
    actor = scope.userId;
    actorRole = scope.role;
  }

  let batchSize = 10;
  let action: 'drain' | 'replayDeadLetters' = 'drain';
  let jobIds: Array<string | number> | undefined;
  let replayLimit = 50;
  let drainAfterReplay = true;

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.batchSize && Number.isInteger(body.batchSize) && body.batchSize > 0 && body.batchSize <= 50) {
      batchSize = body.batchSize;
    }
    if (body?.action === 'replayDeadLetters') {
      action = 'replayDeadLetters';
    }
    if (Array.isArray(body?.jobIds)) {
      jobIds = body.jobIds.filter((id: unknown) => typeof id === 'string' || typeof id === 'number');
    }
    if (body?.limit && Number.isInteger(body.limit) && body.limit > 0 && body.limit <= 200) {
      replayLimit = body.limit;
    }
    if (typeof body?.drainAfterReplay === 'boolean') {
      drainAfterReplay = body.drainAfterReplay;
    }
  } catch {
    // Default options
  }

  try {
    const adapter = await canonicalSubmissionAdapter.getSupabaseAdapter();
    const mirrorRepo = adapter.getMirrorRepo ? adapter.getMirrorRepo() : null;

    if (!mirrorRepo) {
      return NextResponse.json(
        {
          status: 'ok',
          message: 'Storage engine is not currently using an outbox queue.',
          engine: canonicalSubmissionAdapter.getStorageEngine(),
          requestId,
        },
        { status: 200, headers: WORKER_NO_STORE_HEADERS }
      );
    }

    const appsScriptUrl = canonicalSubmissionAdapter.getAppsScriptUrl();
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
      workerId: `api-trigger-${Date.now().toString(36)}`,
    });

    let replayResult: { requeuedCount: number; requeuedJobIds: Array<string | number> } | undefined;
    if (action === 'replayDeadLetters') {
      const replayed = await mirrorRepo.replayDeadLetterJobs({
        jobIds,
        limit: replayLimit,
      });
      replayResult = replayed;
      logSecurityEvent({
        actor,
        actorRole,
        eventType: 'RECORD_MODIFIED',
        targetResource: 'sheets_mirror_jobs',
        outcome: 'ALLOW',
        details: `Replayed ${replayed.requeuedCount} DEAD_LETTER sheets mirror job(s) into QUEUED state.`,
      });
    }

    const summary: DrainSummary =
      action === 'drain' || drainAfterReplay
        ? await worker.drainQueue(batchSize)
        : { processed: 0, completed: 0, failed: 0, deadLettered: 0, superseded: 0 };
    const pendingRemaining = await mirrorRepo.getPendingCount();
    const deadLetterCount = await mirrorRepo.getDeadLetterCount();
    const sampleDeadLetters =
      summary.deadLettered > 0 || deadLetterCount > 0 ? await mirrorRepo.listDeadLetterJobs(10) : [];

    const alert = await notifyDeadLetterAlert({
      source: 'POST /api/workers/sheets-mirror',
      requestId,
      deadLetteredInBatch: summary.deadLettered,
      totalDeadLetterCount: deadLetterCount,
      sampleJobs: sanitizeDeadLetterJobs(sampleDeadLetters),
    });

    return NextResponse.json(
      {
        status: 'success',
        action,
        ...(replayResult ? { replay: replayResult } : {}),
        summary,
        queue: {
          pendingRemaining,
          deadLetterCount,
        },
        alert,
        requestId,
      },
      { status: 200, headers: WORKER_NO_STORE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'WORKER_EXECUTION_ERROR',
        message: err?.message || 'Sheets mirror worker encountered an error during queue drain.',
        requestId,
      },
      { status: 500, headers: WORKER_NO_STORE_HEADERS }
    );
  }
}
