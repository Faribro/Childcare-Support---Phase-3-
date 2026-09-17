import { NextRequest, NextResponse } from 'next/server';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req-list-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    const { searchParams } = new URL(req.url);
    const clientSubmissionId = searchParams.get('clientSubmissionId');

    // Single-record reconciliation lookup by clientSubmissionId
    if (clientSubmissionId) {
      const trimmedId = clientSubmissionId.trim();
      const record = await canonicalSubmissionAdapter.getSubmission(trimmedId, 'supervisor');
      if (record.status === 'success' && record.data) {
        const remoteSubmissionId = record.remoteSubmissionId || record.data.remoteSubmissionId || record.data.uniqueId;
        const version = record.version || record.data.version || record.data.revisionNumber || 1;
        return NextResponse.json(
          {
            status: 'success',
            data: {
              remoteSubmissionId,
              clientSubmissionId: trimmedId,
              version,
              submissionStatus: 'ACCEPTED',
              assetStatus: record.data.assetStatus || 'NOT_REQUIRED',
            },
            remoteSubmissionId,
            clientSubmissionId: trimmedId,
            version,
            submissionStatus: 'ACCEPTED',
            assetStatus: record.data.assetStatus || 'NOT_REQUIRED',
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
      } else {
        return NextResponse.json(
          {
            status: 'error',
            code: 'NOT_FOUND',
            message: `Record with clientSubmissionId "${trimmedId}" not found.`,
            requestId,
            retryable: false,
          },
          {
            status: 404,
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
              'X-Request-Id': requestId,
            },
          }
        );
      }
    }

    const cursor = searchParams.get('cursor') || undefined;
    const status = searchParams.get('status') || undefined;
    const updatedAfter = searchParams.get('updatedAfter') || undefined;

    const rawLimit = searchParams.get('limit');
    let limit = 50;

    if (rawLimit !== null) {
      const trimmed = rawLimit.trim();
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed) || !/^\d+$/.test(trimmed) || parsed < 1) {
        return NextResponse.json(
          {
            status: 'error',
            code: 'VALIDATION_ERROR',
            message: 'Query parameter "limit" must be a positive integer between 1 and 100.',
            requestId,
            retryable: false,
          },
          {
            status: 400,
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
              'X-Request-Id': requestId,
            },
          }
        );
      }
      limit = Math.min(parsed, 100);
    }

    const result = await canonicalSubmissionAdapter.listSubmissions({
      cursor,
      limit,
      status,
      updatedAfter,
    });

    if (result.status === 'error') {
      const statusCode = result.statusCode || 502;
      const code = result.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'UPSTREAM_UNAVAILABLE');
      return NextResponse.json(
        {
          status: 'error',
          code,
          message: result.message || 'Failed to list submissions from central bridge',
          requestId,
          retryable: statusCode !== 401 && statusCode !== 403 && code !== 'CONFIGURATION_ERROR' && code !== 'VALIDATION_ERROR',
        },
        {
          status: statusCode,
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
        submissions: records,
        count: records.length,
        limit,
        data: {
          records,
          total,
          nextCursor,
          sourceUpdatedAt,
        },
        items: records,
        pagination: {
          total,
          totalCount: total,
          limit,
          offset: 0,
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

    const resolvedClientSubmissionId = validation.data.clientSubmissionId || validation.data.uuid;
    return NextResponse.json(
      {
        status: 'success',
        submissionStatus: 'ACCEPTED',
        assetStatus: 'NOT_REQUIRED',
        data: {
          remoteSubmissionId: result.remoteSubmissionId,
          clientSubmissionId: resolvedClientSubmissionId,
          version: result.version || 1,
          updatedAt: result.updatedAt || new Date().toISOString(),
          syncStatus: 'SYNCED',
          submissionStatus: 'ACCEPTED',
          assetStatus: 'NOT_REQUIRED',
        },
        acknowledged: true,
        remoteSubmissionId: result.remoteSubmissionId,
        clientSubmissionId: resolvedClientSubmissionId,
        uniqueId: result.uniqueId,
        version: result.version,
        revisionNumber: result.revisionNumber,
        updatedAt: result.updatedAt,
        isDuplicate: result.isDuplicate,
        requestId: result.requestId || requestId,
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
