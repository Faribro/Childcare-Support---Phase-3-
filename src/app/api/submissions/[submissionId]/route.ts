import { NextRequest, NextResponse } from 'next/server';
import { patchSubmissionSchema, flattenPatchBody } from '@/lib/validations/submissionSchema';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  resolveServerVerifiedRole,
  resolveUserAccessScope,
  isStateAuthorized,
  logSecurityEvent,
  validateCsrfOrigin,
} from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    const { role } = resolveServerVerifiedRole(req);

    const result = await canonicalSubmissionAdapter.getSubmission(submissionId, role);

    if (result.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'NOT_FOUND',
          message: result.message || `Submission ${submissionId} not found`,
        },
        { status: result.statusCode || 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: result.data,
        remoteSubmissionId: result.remoteSubmissionId,
        version: result.version,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('GET /api/submissions/[submissionId] error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    const csrf = validateCsrfOrigin(req);
    if (!csrf.isValid) {
      return NextResponse.json(
        { status: 'error', code: 'CSRF_VIOLATION', message: csrf.reason || 'Forbidden request origin.' },
        { status: 403 }
      );
    }

    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    // Parse If-Match header
    const ifMatchHeader = req.headers.get('If-Match') || req.headers.get('if-match');
    let parsedIfMatch: number | undefined = undefined;
    if (ifMatchHeader) {
      const matchNum = parseInt(ifMatchHeader.replace(/"/g, '').trim(), 10);
      if (!isNaN(matchNum) && matchNum > 0) {
        parsedIfMatch = matchNum;
      }
    }

    const bodyVersion =
      rawBody.expectedVersion !== undefined && rawBody.expectedVersion !== null && rawBody.expectedVersion !== ''
        ? Number(rawBody.expectedVersion)
        : undefined;

    // Enforce consistency: If both are provided and disagree, return HTTP 400 PRECONDITION_MISMATCH
    if (
      bodyVersion !== undefined &&
      parsedIfMatch !== undefined &&
      bodyVersion !== parsedIfMatch
    ) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'PRECONDITION_MISMATCH',
          message: 'Version preconditions disagree: If-Match header and body expectedVersion must match',
          requestId,
        },
        { status: 400 }
      );
    }

    // Canonical resolution: prefer parsed If-Match header, fallback to body expectedVersion
    const resolvedVersion = parsedIfMatch ?? bodyVersion;

    if (
      resolvedVersion === undefined ||
      isNaN(resolvedVersion) ||
      resolvedVersion < 1
    ) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'The record needs correction before it can be sent.',
          details: {
            fields: [
              {
                field: 'expectedVersion',
                path: 'expectedVersion',
                issue: 'expectedVersion is required and must be a positive integer',
                code: 'invalid_type',
              },
            ],
          },
          requestId,
        },
        { status: 422 }
      );
    }

    rawBody.expectedVersion = resolvedVersion;

    const flattenedBody = flattenPatchBody(rawBody);
    const validation = patchSubmissionSchema.safeParse(flattenedBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'The record needs correction before it can be sent.',
          details: {
            fields: validation.error.issues.map((i) => ({
              field: i.path.join('.'),
              path: i.path.join('.'),
              issue: i.message,
              code: i.code,
            })),
          },
          issues: validation.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
          requestId,
        },
        { status: 422 }
      );
    }

    const patchPayload = validation.data;
    const idempotencyKey =
      req.headers.get('Idempotency-Key') ||
      req.headers.get('idempotency-key') ||
      `update-${submissionId}-${patchPayload.expectedVersion || 1}`;

    const result = await canonicalSubmissionAdapter.updateSubmission({
      submissionId,
      patch: patchPayload,
      expectedVersion: patchPayload.expectedVersion,
      idempotencyKey,
      requestId,
    });

    if (result.status === 'conflict') {
      return NextResponse.json(
        {
          status: 'error',
          code: 'CONCURRENCY_CONFLICT',
          message: 'The record has been updated by another caseworker. Please refresh before saving.',
          currentVersion: result.currentVersion,
          expectedVersion: result.expectedVersion,
          resolutionPath: 'REFRESH_AND_MERGE',
          requestId,
        },
        { status: 409 }
      );
    }

    if (result.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'UPSTREAM_FAILURE',
          message: result.message || 'Error updating record',
          requestId,
        },
        { status: result.statusCode || 502 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: {
          ...(result.data || {}),
          remoteSubmissionId: result.remoteSubmissionId || submissionId,
          clientSubmissionId: result.uniqueId || submissionId,
          version: result.version || patchPayload.expectedVersion + 1,
          updatedAt: result.updatedAt || new Date().toISOString(),
          syncStatus: 'SYNCED',
        },
        acknowledged: true,
        remoteSubmissionId: result.remoteSubmissionId || submissionId,
        version: result.version || patchPayload.expectedVersion + 1,
        updatedAt: result.updatedAt || new Date().toISOString(),
        requestId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('PATCH /api/submissions/[submissionId] error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error processing patch' },
      { status: 500 }
    );
  }
}

// Support PUT as an alias to PATCH for REST compatibility
export async function PUT(
  req: NextRequest,
  context: { params: { submissionId: string } }
) {
  return PATCH(req, context);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const csrf = validateCsrfOrigin(req);
    if (!csrf.isValid) {
      return NextResponse.json(
        { status: 'error', code: 'CSRF_VIOLATION', message: csrf.reason || 'Forbidden request origin.' },
        { status: 403 }
      );
    }

    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    const scope = resolveUserAccessScope(req);

    // Enforce role authorization (Issue #57)
    if (!scope.isVerified || (scope.role !== 'ADMIN' && scope.role !== 'STATE_REVIEWER')) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: `Caller role '${scope.role}' (isVerified: ${scope.isVerified}) forbidden to execute DELETE on submission`,
      });

      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Deletion requires verified Administrator or State Reviewer role.',
        },
        { status: 403 }
      );
    }

    // If STATE_REVIEWER, verify the record belongs to the authorized state scope
    if (scope.role === 'STATE_REVIEWER') {
      const existing = await canonicalSubmissionAdapter.getSubmission(submissionId, 'supervisor');
      if (existing.status === 'success' && existing.data) {
        const recordState = existing.data.state || existing.data['18\nState'] || 'Maharashtra';
        if (!isStateAuthorized(scope, recordState)) {
          logSecurityEvent({
            actor: scope.userId,
            actorRole: scope.role,
            eventType: 'SCOPE_VIOLATION',
            outcome: 'DENY',
            targetResource: submissionId,
            scope: `state=${recordState}`,
            details: `State Reviewer not authorized to delete record in state '${recordState}'`,
          });

          return NextResponse.json(
            {
              status: 'error',
              code: 'FORBIDDEN_SCOPE',
              message: `You are not authorized to delete records in state "${recordState}".`,
            },
            { status: 403 }
          );
        }
      }
    }

    const result = await canonicalSubmissionAdapter.deleteSubmission(submissionId);

    if (!result.success) {
      return NextResponse.json(
        { status: 'error', message: result.message },
        { status: result.statusCode || 500 }
      );
    }

    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'RECORD_DELETED',
      outcome: 'ALLOW',
      targetResource: submissionId,
      details: `Record ${submissionId} deleted by ${scope.name}`,
    });

    return NextResponse.json(
      { status: 'success', message: `Record ${submissionId} deleted successfully` },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('DELETE /api/submissions/[submissionId] error:', err);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error deleting record' },
      { status: 500 }
    );
  }
}
