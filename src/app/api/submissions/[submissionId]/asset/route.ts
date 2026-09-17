import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { resolveServerVerifiedRole } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const requestId = `req-asset-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    resolveServerVerifiedRole(req);

    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    const { docType, fileData, documentOperationId } = rawBody || {};

    if (!docType || typeof docType !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required field: docType' },
        { status: 400 }
      );
    }

    if (!fileData || typeof fileData !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required field: fileData' },
        { status: 400 }
      );
    }

    const result = await canonicalSubmissionAdapter.updateAsset({
      submissionId,
      docType,
      fileData,
      documentOperationId,
      requestId,
    });

    if (result.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'UPSTREAM_FAILURE',
          message: result.message || 'Failed to update asset',
          requestId,
        },
        { status: result.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        acknowledged: true,
        submissionId: result.remoteSubmissionId || submissionId,
        uniqueId: result.uniqueId || submissionId,
        docType: result.docType || docType,
        cellFormula: result.cellFormula,
        assetStatus: result.assetStatus || 'UPLOADED',
        updatedAt: result.updatedAt,
        requestId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('POST /api/submissions/[submissionId]/asset error:', err?.message || 'Unknown error');
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error', requestId },
      { status: 500 }
    );
  }
}
