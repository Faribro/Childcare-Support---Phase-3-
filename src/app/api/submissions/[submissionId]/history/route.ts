import { NextRequest, NextResponse } from 'next/server';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  resolveUserAccessScope,
  isSyntheticDemoModeAllowed,
  evaluateRecordAccess,
  logSecurityEvent,
} from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const HISTORY_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
};

export async function GET(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400, headers: HISTORY_NO_STORE_HEADERS }
      );
    }

    const scope = await resolveUserAccessScope(req);
    const syntheticDemoAllowed = !scope.isVerified && isSyntheticDemoModeAllowed(req);

    if (!scope.isVerified && !syntheticDemoAllowed) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'AUTH_FAILURE',
        outcome: 'DENY',
        targetResource: submissionId,
        details: 'Unauthenticated request denied on GET /api/submissions/[submissionId]/history',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Authentication required to view audit history.',
        },
        { status: 401, headers: HISTORY_NO_STORE_HEADERS }
      );
    }

    const mockRecord = MockSheetStore.findRecord(submissionId);
    const adapterResult = mockRecord
      ? null
      : await canonicalSubmissionAdapter.getSubmission(submissionId, 'supervisor');
    const resolvedRecord = mockRecord || (adapterResult?.status === 'success' ? adapterResult.data : null);

    if (!resolvedRecord) {
      return NextResponse.json(
        { status: 'error', code: 'NOT_FOUND', message: `Record ${submissionId} not found` },
        { status: 404, headers: HISTORY_NO_STORE_HEADERS }
      );
    }

    if (!syntheticDemoAllowed) {
      const access = evaluateRecordAccess(scope, resolvedRecord, 'audit history');
      if (!access.allowed) {
        logSecurityEvent({
          actor: scope.userId,
          actorRole: scope.role,
          eventType: access.eventType || 'ACCESS_DENIED',
          outcome: 'DENY',
          targetResource: submissionId,
          scope: `state=${access.recordState},district=${access.recordDistrict || ''}`,
          details: access.details,
        });
        return NextResponse.json(
          {
            status: 'error',
            code: access.code,
            message: access.message,
          },
          { status: access.statusCode || 403, headers: HISTORY_NO_STORE_HEADERS }
        );
      }
    }

    const remoteId =
      mockRecord?.remote_submission_id ||
      resolvedRecord.remoteSubmissionId ||
      resolvedRecord.uniqueId ||
      submissionId;
    const history = mockRecord ? MockSheetStore.getHistory(remoteId) : [];

    return NextResponse.json(
      {
        status: 'success',
        remoteSubmissionId: remoteId,
        currentVersion: mockRecord?.version ?? resolvedRecord.version ?? 1,
        history,
      },
      { status: 200, headers: HISTORY_NO_STORE_HEADERS }
    );
  } catch (err) {
    console.error('GET /api/submissions/[submissionId]/history error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Failed to retrieve audit history' },
      { status: 500, headers: HISTORY_NO_STORE_HEADERS }
    );
  }
}
