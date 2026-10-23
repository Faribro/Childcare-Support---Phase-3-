import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  SheetsMirrorWorker,
  GatewayClient,
  DrainSummary,
} from '@/lib/server/sheetsMirrorWorker';
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

    return NextResponse.json(
      {
        status: 'ok',
        engine: canonicalSubmissionAdapter.getStorageEngine(),
        queue: {
          pendingCount,
          deadLetterCount,
          status: pendingCount > 0 ? 'HAS_WORK' : 'IDLE',
        },
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
  }

  let batchSize = 10;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.batchSize && Number.isInteger(body.batchSize) && body.batchSize > 0 && body.batchSize <= 50) {
      batchSize = body.batchSize;
    }
  } catch {
    // Default to batch size 10
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

    const summary: DrainSummary = await worker.drainQueue(batchSize);
    const pendingRemaining = await mirrorRepo.getPendingCount();
    const deadLetterCount = await mirrorRepo.getDeadLetterCount();

    return NextResponse.json(
      {
        status: 'success',
        summary,
        queue: {
          pendingRemaining,
          deadLetterCount,
        },
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
