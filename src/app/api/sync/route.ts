import { NextRequest, NextResponse } from 'next/server';
import { completeSubmissionSchema, patchSubmissionSchema, flattenPatchBody } from '@/lib/validations/submissionSchema';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

export const dynamic = 'force-dynamic';

interface SyncBatchItem {
  id?: number;
  submissionUuid: string;
  operationType: 'CREATE' | 'UPDATE';
  idempotencyKey: string;
  expectedVersion?: number;
  payload: any;
}

export async function POST(req: NextRequest) {
  const requestId = `batch-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    // Fail-closed verification in production/staging
    const configCheck = canonicalSubmissionAdapter.checkConfiguration('write');
    if (!configCheck.valid && configCheck.errorResponse) {
      return NextResponse.json(
        {
          status: 'error',
          code: configCheck.errorResponse.code,
          message: configCheck.errorResponse.message,
          batchRequestId: requestId,
        },
        { status: configCheck.errorResponse.statusCode }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON batch payload' },
        { status: 400 }
      );
    }

    const items: SyncBatchItem[] = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { status: 'error', code: 'EMPTY_BATCH', message: 'items array cannot be empty' },
        { status: 400 }
      );
    }

    if (items.length > 10) {
      return NextResponse.json(
        { status: 'error', code: 'BATCH_TOO_LARGE', message: 'Maximum 10 items per sync batch allowed' },
        { status: 413 }
      );
    }

    const results = [];

    for (const item of items) {
      const itemReqId = `${requestId}-${item.id || item.submissionUuid.slice(0, 4)}`;

      if (item.operationType === 'CREATE') {
        const parsed = completeSubmissionSchema.safeParse(item.payload);
        if (!parsed.success) {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'failed',
            statusCode: 422,
            error: 'Validation failed',
            issues: parsed.error.issues.map((i) => i.message),
          });
          continue;
        }

        const res = await canonicalSubmissionAdapter.createSubmission({
          payload: parsed.data,
          idempotencyKey: item.idempotencyKey || `idem-${item.submissionUuid}`,
          requestId: itemReqId,
        });

        if (res.status === 'error') {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'failed',
            statusCode: res.statusCode,
            error: res.message || 'Upstream creation error',
            code: res.code,
          });
        } else {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'synced',
            statusCode: res.statusCode,
            remoteSubmissionId: res.remoteSubmissionId,
            version: res.version,
            updatedAt: res.updatedAt,
          });
        }
      } else if (item.operationType === 'UPDATE') {
        const expectedVersion = item.expectedVersion || (item.payload && (item.payload.expectedVersion || item.payload.version)) || 1;
        const patchData = {
          ...(typeof item.payload === 'object' ? item.payload : {}),
          expectedVersion,
        };
        const flattenedPatch = flattenPatchBody(patchData);
        const parsed = patchSubmissionSchema.safeParse(flattenedPatch);
        if (!parsed.success) {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'failed',
            statusCode: 422,
            error: 'Patch validation failed',
            issues: parsed.error.issues.map((i) => i.message),
          });
          continue;
        }

        const res = await canonicalSubmissionAdapter.updateSubmission({
          submissionId: item.submissionUuid,
          patch: parsed.data,
          expectedVersion: patchData.expectedVersion,
          idempotencyKey: item.idempotencyKey || `update-${item.submissionUuid}-${patchData.expectedVersion}`,
          requestId: itemReqId,
        });

        if (res.status === 'conflict') {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'conflict',
            statusCode: 409,
            currentVersion: res.currentVersion,
            expectedVersion: res.expectedVersion,
            error: res.message || 'Concurrent edit conflict',
          });
        } else if (res.status === 'error') {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'failed',
            statusCode: res.statusCode,
            error: res.message || 'Update failed',
            code: res.code,
          });
        } else {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'synced',
            statusCode: 200,
            remoteSubmissionId: res.remoteSubmissionId,
            version: res.version,
            updatedAt: res.updatedAt,
          });
        }
      } else {
        results.push({
          submissionUuid: item.submissionUuid,
          status: 'failed',
          statusCode: 400,
          error: `Unknown operationType: ${item.operationType}`,
        });
      }
    }

    return NextResponse.json(
      {
        status: 'success',
        batchRequestId: requestId,
        processedCount: results.length,
        results,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('POST /api/sync batch error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Failed to process sync batch' },
      { status: 500 }
    );
  }
}
