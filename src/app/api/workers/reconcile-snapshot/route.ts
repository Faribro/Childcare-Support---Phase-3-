import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isReconcileSnapshotEnabled } from '@/lib/server/reconciliationFlags';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { logSecurityEvent } from '@/lib/server/authorisation';
import { logServerError } from '@/lib/server/errorLogger';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const RECONCILE_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
};

function sha256TimingSafeEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const aHash = crypto.createHash('sha256').update(provided).digest();
  const bHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

function extractCallerReconcileSecret(req: NextRequest): string {
  const headerSecret = (req.headers.get('x-reconcile-secret') || '').trim();
  if (headerSecret) return headerSecret;

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

/**
 * GET /api/workers/reconcile-snapshot
 *
 * Feature-flagged, secret-authenticated read endpoint for nightly Sheet mirror reconciliation:
 * - Default mode (`snapshot`): keyset-paginated ID-ordered metadata (`id`, `uniqueId`,
 *   `state`, `rowVersion`, `rowHash`, `isDeleted`, `deletedAt`, ...), zero child PII.
 * - On-demand mode (`mode=record&submissionId=...`): full Firestore submission record to
 *   repair missing or hash-mismatched Sheet rows.
 */
export async function GET(req: NextRequest) {
  const requestId = `reconcile-snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  if (!isReconcileSnapshotEnabled()) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'FEATURE_DISABLED',
        message: 'Reconciliation snapshot endpoint is disabled (RECONCILIATION_SNAPSHOT_ENABLED=false).',
        requestId,
      },
      { status: 503, headers: RECONCILE_NO_STORE_HEADERS }
    );
  }

  const expectedSecret = (process.env.SHEET_RECONCILE_SECRET || '').trim();
  if (!expectedSecret || expectedSecret.length < 16) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'RECONCILE_SECRET_NOT_CONFIGURED',
        message: 'Dedicated SHEET_RECONCILE_SECRET is not configured.',
        requestId,
      },
      { status: 503, headers: RECONCILE_NO_STORE_HEADERS }
    );
  }

  const providedSecret = extractCallerReconcileSecret(req);
  if (!sha256TimingSafeEqual(providedSecret, expectedSecret)) {
    logSecurityEvent({
      actor: 'reconcile_worker',
      actorRole: 'SYSTEM',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      targetResource: '/api/workers/reconcile-snapshot',
      details: 'Invalid or missing X-Reconcile-Secret credential on reconciliation snapshot endpoint.',
    });
    return NextResponse.json(
      {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing reconciliation secret.',
        requestId,
      },
      { status: 401, headers: RECONCILE_NO_STORE_HEADERS }
    );
  }

  if (canonicalSubmissionAdapter.getDataEngine() !== 'firestore') {
    return NextResponse.json(
      {
        status: 'error',
        code: 'UNSUPPORTED_ENGINE',
        message: 'Reconciliation snapshot requires DATA_ENGINE=firestore.',
        requestId,
      },
      { status: 501, headers: RECONCILE_NO_STORE_HEADERS }
    );
  }

  try {
    const fsAdapter = await canonicalSubmissionAdapter.getFirestoreAdapter();
    if (!fsAdapter || typeof fsAdapter.listReconcileSnapshot !== 'function') {
      return NextResponse.json(
        {
          status: 'error',
          code: 'ADAPTER_UNAVAILABLE',
          message: 'Firestore reconciliation adapter unavailable.',
          requestId,
        },
        { status: 500, headers: RECONCILE_NO_STORE_HEADERS }
      );
    }

    const mode = (req.nextUrl.searchParams.get('mode') || 'snapshot').trim().toLowerCase();

    if (mode === 'record') {
      const submissionId = (req.nextUrl.searchParams.get('submissionId') || '').trim();
      if (!submissionId) {
        return NextResponse.json(
          {
            status: 'error',
            code: 'INVALID_SUBMISSION_ID',
            message: 'submissionId query parameter is required when mode=record.',
            requestId,
          },
          { status: 400, headers: RECONCILE_NO_STORE_HEADERS }
        );
      }

      const record = await fsAdapter.getReconcileSubmissionRecord(submissionId);
      if (!record) {
        return NextResponse.json(
          {
            status: 'error',
            code: 'NOT_FOUND',
            message: `Submission ${submissionId} not found in Firestore.`,
            requestId,
          },
          { status: 404, headers: RECONCILE_NO_STORE_HEADERS }
        );
      }

      return NextResponse.json(
        {
          status: 'success',
          mode: 'record',
          record,
          requestId,
        },
        { status: 200, headers: RECONCILE_NO_STORE_HEADERS }
      );
    }

    const afterId = (req.nextUrl.searchParams.get('afterId') || '').trim() || undefined;
    const rawLimit = req.nextUrl.searchParams.get('limit');
    const parsedLimit = rawLimit ? Number(rawLimit) : 200;
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(Math.trunc(parsedLimit), 500) : 200;

    const page = await fsAdapter.listReconcileSnapshot({ afterId, limit });

    return NextResponse.json(
      {
        status: 'success',
        mode: 'snapshot',
        ...page,
        requestId,
      },
      { status: 200, headers: RECONCILE_NO_STORE_HEADERS }
    );
  } catch (err: any) {
    logServerError('GET /api/workers/reconcile-snapshot', err, { requestId });
    return NextResponse.json(
      {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve reconciliation snapshot.',
        requestId,
      },
      { status: 500, headers: RECONCILE_NO_STORE_HEADERS }
    );
  }
}
