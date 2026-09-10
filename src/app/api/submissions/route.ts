import { NextRequest, NextResponse } from 'next/server';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req-list-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const status = searchParams.get('status') || undefined;
    const updatedAfter = searchParams.get('updatedAfter') || undefined;

    const result = await canonicalSubmissionAdapter.listSubmissions({
      cursor,
      limit,
      status,
      updatedAfter,
    });

    if (result.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'UPSTREAM_UNAVAILABLE',
          message: result.message || 'Failed to list submissions',
          requestId,
          retryable: result.statusCode !== 401 && result.statusCode !== 403 && result.code !== 'CONFIGURATION_ERROR',
        },
        {
          status: result.statusCode || 502,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'X-Request-Id': requestId,
          },
        }
      );
    }

    const records = result.data?.records || (Array.isArray(result.data) ? result.data : []);
    const total = result.data?.total ?? result.pagination?.totalCount ?? records.length;
    const nextCursor = result.data?.nextCursor ?? result.pagination?.nextCursor ?? null;
    const sourceUpdatedAt = result.data?.sourceUpdatedAt ?? new Date().toISOString();

    return NextResponse.json(
      {
        status: 'success',
        data: {
          records,
          total,
          nextCursor,
          sourceUpdatedAt,
        },
        items: records,
        pagination: {
          totalCount: total,
          hasMore: Boolean(nextCursor),
          nextCursor,
        },
        requestId,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'X-Request-Id': requestId,
        },
      }
    );
  } catch (err: any) {
    console.error('GET /api/submissions error:', err);
    return NextResponse.json(
      {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Failed to list submissions',
        requestId,
        retryable: true,
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'X-Request-Id': requestId,
        },
      }
    );
  }
}

export async function POST(req: NextRequest) {
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    const idempotencyKey = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'MISSING_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key header is mandatory for assessment creation.',
        },
        { status: 400 }
      );
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON payload.' },
        { status: 400 }
      );
    }

    // Strict Zod schema validation
    const validation = completeSubmissionSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Submission failed schema validation.',
          issues: validation.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 422 }
      );
    }

    const result = await canonicalSubmissionAdapter.createSubmission({
      payload: validation.data,
      idempotencyKey,
      requestId,
    });

    if (result.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'UPSTREAM_FAILURE',
          message: result.message || 'Error processing submission',
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
        uniqueId: result.uniqueId,
        version: result.version,
        revisionNumber: result.revisionNumber,
        updatedAt: result.updatedAt,
        isDuplicate: result.isDuplicate,
        requestId: result.requestId,
        data: result.data,
      },
      { status: result.statusCode || (result.isDuplicate ? 200 : 201) }
    );
  } catch (err: any) {
    console.error('API submission ingestion error:', err);
    return NextResponse.json(
      {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Internal server error processing submission.',
        requestId,
      },
      { status: 500 }
    );
  }
}
