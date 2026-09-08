import { NextRequest, NextResponse } from 'next/server';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20;
    const status = searchParams.get('status') || undefined;
    const updatedAfter = searchParams.get('updatedAfter') || undefined;

    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com')) {
      try {
        const gasUrl = new URL(appsScriptUrl);
        gasUrl.searchParams.set('action', 'list');
        if (cursor) gasUrl.searchParams.set('cursor', cursor);
        gasUrl.searchParams.set('limit', String(limit));
        if (status) gasUrl.searchParams.set('status', status);
        if (updatedAfter) gasUrl.searchParams.set('updatedAfter', updatedAfter);
        if (webhookSecret) gasUrl.searchParams.set('secret', webhookSecret);

        const gasRes = await fetch(gasUrl.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
        });

        if (gasRes.ok) {
          const data = await gasRes.json();
          const totalCount = data.total ?? data.data?.length ?? 0;
          return NextResponse.json(
            {
              ...data,
              pagination: {
                totalCount,
                hasMore: false,
              },
            },
            { status: 200 }
          );
        }
      } catch (gasErr) {
        console.error('Apps Script list forwarding error:', gasErr);
        return NextResponse.json(
          { status: 'error', code: 'UPSTREAM_GATEWAY_ERROR', message: 'Failed to contact central Google Sheets bridge' },
          { status: 502 }
        );
      }
    }

    // Default to In-Memory Staging Store
    const result = MockSheetStore.listRecords({ cursor, limit, status, updatedAfter });
    return NextResponse.json(
      {
        status: 'success',
        data: result.records,
        pagination: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          totalCount: result.totalCount,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('GET /api/submissions error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Failed to list submissions' },
      { status: 500 }
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

    // Strict Zod schema validation (enforcing artCenter absence)
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

    const payload = validation.data;
    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // External Apps Script forwarding if configured
    if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com')) {
      try {
        const gasResponse = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey,
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            action: 'create',
            idempotencyKey,
            secret: webhookSecret,
            ...payload,
          }),
        });

        if (!gasResponse.ok) {
          return NextResponse.json(
            {
              status: 'error',
              code: 'UPSTREAM_FAILURE',
              message: `Central Google Sheets bridge rejected submission (${gasResponse.status})`,
            },
            { status: gasResponse.status >= 500 ? 502 : gasResponse.status }
          );
        }

        const gasData = await gasResponse.json();
        return NextResponse.json(gasData, { status: 200 });
      } catch (gasErr) {
        console.error('Apps Script forwarding network exception:', gasErr);
        return NextResponse.json(
          {
            status: 'error',
            code: 'GATEWAY_TIMEOUT',
            message: 'Unable to connect to Google Sheets backend. Item remains safely queued in outbox.',
          },
          { status: 504 }
        );
      }
    }

    // Staging / Local Store Execution
    const result = MockSheetStore.createRecord(payload, idempotencyKey, requestId);
    return NextResponse.json(result, { status: result.isDuplicate ? 200 : 201 });
  } catch (err) {
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
