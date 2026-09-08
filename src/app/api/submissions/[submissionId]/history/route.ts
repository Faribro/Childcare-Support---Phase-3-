import { NextRequest, NextResponse } from 'next/server';
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

    const record = MockSheetStore.findRecord(submissionId);
    if (!record) {
      return NextResponse.json(
        { status: 'error', code: 'NOT_FOUND', message: `Record ${submissionId} not found` },
        { status: 404 }
      );
    }

    const history = MockSheetStore.getHistory(record.remote_submission_id);

    return NextResponse.json(
      {
        status: 'success',
        remoteSubmissionId: record.remote_submission_id,
        currentVersion: record.version,
        history,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('GET /api/submissions/[submissionId]/history error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Failed to retrieve audit history' },
      { status: 500 }
    );
  }
}
