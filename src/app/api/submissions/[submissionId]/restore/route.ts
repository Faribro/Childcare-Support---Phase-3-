import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  resolveUserAccessScope,
  logSecurityEvent,
  validateCsrfOrigin,
} from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
};

/**
 * POST /api/submissions/[submissionId]/restore
 *
 * Restores a soft-deleted submission tombstone and marks it active again.
 * Strictly restricted to verified Administration (LEADERSHIP / ADMIN).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const csrf = validateCsrfOrigin(req);
    if (!csrf.isValid) {
      return NextResponse.json(
        { status: 'error', code: 'CSRF_VIOLATION', message: csrf.reason || 'Forbidden request origin.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const scope = await resolveUserAccessScope(req);
    if (!scope.isVerified || (scope.role !== 'LEADERSHIP' && scope.role !== 'ADMIN')) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: `Caller role '${scope.role}' (isVerified: ${scope.isVerified}) forbidden to restore soft-deleted submission`,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Restoring soft-deleted records is restricted strictly to verified Administration.',
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    let rawNote = '';
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await req.json().catch(() => null);
        if (body && typeof body.reason === 'string') {
          rawNote = body.reason.trim().slice(0, 500);
        }
      }
    } catch {
      // Optional JSON body
    }

    const result = await canonicalSubmissionAdapter.restoreSubmission(submissionId, {
      actorId: scope.userId,
      actorName: scope.name,
      actorRole: scope.role,
      reason: rawNote || 'Restored by Administration',
    });

    if (!result.success) {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'RESTORE_FAILED',
          message: result.message || 'Unable to restore submission.',
        },
        { status: result.statusCode || 500, headers: NO_STORE_HEADERS }
      );
    }

    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'RECORD_RESTORED',
      outcome: 'ALLOW',
      targetResource: submissionId,
      details: `Record ${submissionId} restored by ${scope.name} (${scope.role})`,
    });

    return NextResponse.json(
      {
        status: 'success',
        restored: true,
        id: result.remoteSubmissionId || submissionId,
        uniqueId: result.uniqueId || submissionId,
        restoredAt: result.restoredAt,
        message: result.message || `Record ${submissionId} restored successfully.`,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err: any) {
    console.error('POST /api/submissions/[submissionId]/restore error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error restoring record' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
