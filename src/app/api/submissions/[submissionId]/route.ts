import { NextRequest, NextResponse } from 'next/server';
import { patchSubmissionSchema } from '@/lib/validations/submissionSchema';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

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

    const result = await canonicalSubmissionAdapter.getSubmission(submissionId);

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

    // Support If-Match header fallback for expectedVersion
    const ifMatchHeader = req.headers.get('If-Match') || req.headers.get('if-match');
    if (ifMatchHeader && rawBody.expectedVersion === undefined) {
      const parsedHeaderVersion = parseInt(ifMatchHeader.replace(/"/g, ''), 10);
      if (!isNaN(parsedHeaderVersion)) {
        rawBody.expectedVersion = parsedHeaderVersion;
      }
    }

    const validation = patchSubmissionSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Patch failed allowlisted field validation or missing expectedVersion',
          issues: validation.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
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
        acknowledged: true,
        remoteSubmissionId: result.remoteSubmissionId,
        version: result.version,
        updatedAt: result.updatedAt,
        requestId,
        data: result.data,
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
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    const result = await canonicalSubmissionAdapter.deleteSubmission(submissionId);

    if (!result.success) {
      return NextResponse.json(
        { status: 'error', message: result.message },
        { status: result.statusCode || 500 }
      );
    }

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
