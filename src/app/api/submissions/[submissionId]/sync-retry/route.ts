import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessScope, logSecurityEvent } from '@/lib/server/authorisation';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { SheetsMirrorWorker, GatewayClient } from '@/lib/server/sheetsMirrorWorker';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function POST(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const submissionId = params.submissionId;
  const requestId = `sync-retry-${Date.now().toString(36)}`;

  try {
    const scope = await resolveUserAccessScope(req);
    if (!scope.isVerified) {
      return NextResponse.json(
        { status: 'error', code: 'UNAUTHORIZED', message: 'Authentication required to retry sync.', requestId },
        { status: 401 }
      );
    }

    const appsScriptUrl = canonicalSubmissionAdapter.getAppsScriptUrl();
    const webhookSecret = canonicalSubmissionAdapter.getWebhookSecret();

    if (!appsScriptUrl || !canonicalSubmissionAdapter.isConfigured()) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNCONFIGURED_BRIDGE',
          message: 'Central Google Sheets bridge is unconfigured in this environment.',
          requestId,
        },
        { status: 503 }
      );
    }

    if (canonicalSubmissionAdapter.getStorageEngine() === 'supabase') {
      const adapter = await canonicalSubmissionAdapter.getSupabaseAdapter();
      const mirrorRepo = adapter.getMirrorRepo ? adapter.getMirrorRepo() : null;

      if (mirrorRepo) {
        const gatewayClient: GatewayClient = {
          callGateway: async (payload: Record<string, any>) => {
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
          workerId: `retry-trigger-${Date.now().toString(36)}`,
          leaseDurationMs: 60000,
        });

        // Drain up to 10 jobs to process this submission's queued job
        const summary = await worker.drainQueue(10);

        logSecurityEvent({
          actor: scope.userId,
          actorRole: scope.role,
          eventType: 'RECORD_MODIFIED',
          outcome: 'ALLOW',
          targetResource: submissionId,
          details: `Manual sync-retry triggered for ${submissionId}. Processed: ${summary.processed}, Completed: ${summary.completed}, Failed: ${summary.failed}`,
        });

        if (summary.failed > 0 && summary.completed === 0) {
          return NextResponse.json(
            {
              status: 'error',
              syncStatus: 'FAILED',
              message: 'Google Sheets sync retry failed. Please try again or contact support.',
              summary,
              requestId,
            },
            { status: 502 }
          );
        }

        return NextResponse.json(
          {
            status: 'success',
            syncStatus: 'SYNCED',
            message: 'Record successfully synced to Google Sheets and Revisions log.',
            summary,
            requestId,
          },
          { status: 200 }
        );
      }
    }

    // Direct Sheets Engine Sync Retry
    const existing = await canonicalSubmissionAdapter.getSubmission(submissionId, 'caseworker');
    if (existing.status !== 'success' || !existing.data) {
      return NextResponse.json(
        { status: 'error', code: 'NOT_FOUND', message: `Record ${submissionId} not found.`, requestId },
        { status: 404 }
      );
    }

    const retryRes = await canonicalSubmissionAdapter.updateSubmission({
      submissionId,
      patch: existing.data,
      expectedVersion: existing.data.version || existing.data.revisionNumber || 1,
      idempotencyKey: `retry-${submissionId}-${Date.now()}`,
      requestId,
    });

    if (retryRes.status !== 'success') {
      return NextResponse.json(
        {
          status: 'error',
          syncStatus: 'FAILED',
          message: retryRes.message || 'Direct sync retry to Google Sheets failed.',
          requestId,
        },
        { status: retryRes.statusCode || 502 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        syncStatus: 'SYNCED',
        message: 'Record successfully synced to Google Sheets and Revisions log.',
        requestId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('POST /api/submissions/[submissionId]/sync-retry error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: err?.message || 'Error executing sync retry.', requestId },
      { status: 500 }
    );
  }
}
