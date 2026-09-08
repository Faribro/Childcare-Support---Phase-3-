import { NextRequest, NextResponse } from 'next/server';
import { completeSubmissionSchema, patchSubmissionSchema } from '@/lib/validations/submissionSchema';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

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

        const res = MockSheetStore.createRecord(parsed.data, item.idempotencyKey, itemReqId);
        results.push({
          submissionUuid: item.submissionUuid,
          status: 'synced',
          statusCode: 200,
          remoteSubmissionId: res.remoteSubmissionId,
          version: res.version,
          updatedAt: res.updatedAt,
        });
      } else if (item.operationType === 'UPDATE') {
        const patchData = {
          expectedVersion: item.expectedVersion || item.payload.expectedVersion || 1,
          ...item.payload,
        };
        const parsed = patchSubmissionSchema.safeParse(patchData);
        if (!parsed.success) {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'failed',
            statusCode: 422,
            error: 'Patch validation failed',
          });
          continue;
        }

        const res = MockSheetStore.updateRecord(item.submissionUuid, parsed.data, 'Caseworker-Batch', itemReqId);
        if ('conflict' in res) {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'conflict',
            statusCode: 409,
            currentVersion: res.currentVersion,
            expectedVersion: res.expectedVersion,
          });
        } else if ('notFound' in res) {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'failed',
            statusCode: 404,
            error: 'Target record not found for update',
          });
        } else {
          results.push({
            submissionUuid: item.submissionUuid,
            status: 'synced',
            statusCode: 200,
            remoteSubmissionId: res.record.remote_submission_id,
            version: res.version,
            updatedAt: res.record.updated_at,
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
  } catch (err) {
    console.error('POST /api/sync batch error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Failed to process sync batch' },
      { status: 500 }
    );
  }
}
