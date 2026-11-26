import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  resolveUserAccessScope,
  evaluateRecordAccess,
  logSecurityEvent,
} from '@/lib/server/authorisation';
import { generateBeneficiaryPdfBuffer } from '@/lib/server/pdfExportService';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const EXPORT_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
};

export async function GET(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const requestId = `req-export-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400, headers: EXPORT_NO_STORE_HEADERS }
      );
    }

    // Resolve caller scope (Issue #57)
    const scope = await resolveUserAccessScope(req);

    // Unverified anonymous callers cannot export full evaluation PDF under any environment
    if (!scope.isVerified) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: 'Unverified session attempted to export confidential assessment PDF',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Authentication required to export official assessment report.',
        },
        { status: 401, headers: EXPORT_NO_STORE_HEADERS }
      );
    }

    // Fetch the record
    const adapterRole = 'supervisor';
    const result = await canonicalSubmissionAdapter.getSubmission(submissionId, adapterRole);

    if (result.status === 'error' || !result.data) {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'NOT_FOUND',
          message: result.message || `Submission ${submissionId} not found`,
        },
        { status: result.statusCode || 404, headers: EXPORT_NO_STORE_HEADERS }
      );
    }

    const record = result.data;
    const access = evaluateRecordAccess(scope, record, 'assessment record');
    if (!access.allowed) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: access.eventType || 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        scope: `state=${access.recordState},district=${access.recordDistrict || ''}`,
        details: access.details,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: access.code,
          message: access.message,
        },
        { status: access.statusCode || 403, headers: EXPORT_NO_STORE_HEADERS }
      );
    }

    // Log authorized export audit event
    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'RECORD_EXPORTED',
      outcome: 'ALLOW',
      targetResource: submissionId,
      details: `Official assessment PDF exported by ${scope.userId} (${scope.role})`,
    });

    const pdfBuffer = generateBeneficiaryPdfBuffer(record);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Alliance_Record_${encodeURIComponent(submissionId)}.pdf"`,
        ...EXPORT_NO_STORE_HEADERS,
        'X-Request-Id': requestId,
      },
    });
  } catch (err: any) {
    console.error('GET /api/submissions/[submissionId]/export error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Failed to generate PDF export' },
      { status: 500 }
    );
  }
}
