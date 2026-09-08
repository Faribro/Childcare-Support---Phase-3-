import { NextRequest, NextResponse } from 'next/server';
import { patchSubmissionSchema } from '@/lib/validations/submissionSchema';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

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

    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com')) {
      try {
        const gasUrl = new URL(appsScriptUrl);
        gasUrl.searchParams.set('action', 'read');
        gasUrl.searchParams.set('submissionId', submissionId);
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
          return NextResponse.json(data, { status: 200 });
        }
      } catch (gasErr) {
        console.error('Apps Script read error:', gasErr);
        return NextResponse.json(
          { status: 'error', code: 'UPSTREAM_GATEWAY_ERROR', message: 'Central Sheets bridge unreachable' },
          { status: 502 }
        );
      }
    }

    const record = MockSheetStore.findRecord(submissionId);
    if (!record) {
      return NextResponse.json(
        { status: 'error', code: 'NOT_FOUND', message: `Submission ${submissionId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: record,
      },
      { status: 200 }
    );
  } catch (err) {
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
    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com')) {
      try {
        const gasRes = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            action: 'update',
            submissionId,
            patch: patchPayload,
            secret: webhookSecret,
            requestId,
          }),
        });

        const gasData = await gasRes.json();
        return NextResponse.json(gasData, { status: gasRes.status });
      } catch (gasErr) {
        console.error('Apps Script update forwarding error:', gasErr);
        return NextResponse.json(
          { status: 'error', code: 'GATEWAY_TIMEOUT', message: 'Failed to reach Google Sheets bridge for update' },
          { status: 504 }
        );
      }
    }

    // Local / Staging OCC Store Update
    const result = MockSheetStore.updateRecord(submissionId, patchPayload, 'Caseworker', requestId);

    if ('notFound' in result) {
      return NextResponse.json(
        { status: 'error', code: 'NOT_FOUND', message: `Record ${submissionId} not found` },
        { status: 404 }
      );
    }

    if ('conflict' in result) {
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

    return NextResponse.json(
      {
        status: 'success',
        acknowledged: true,
        remoteSubmissionId: result.record.remote_submission_id,
        version: result.version,
        updatedAt: result.record.updated_at,
        requestId,
        data: result.record,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('PATCH /api/submissions/[submissionId] error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error processing patch' },
      { status: 500 }
    );
  }
}
