import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  resolveUserAccessScope,
  isStateAuthorized,
  logSecurityEvent,
} from '@/lib/server/authorisation';
import { generateBeneficiaryPdfBuffer } from '@/lib/server/pdfExportService';

export const dynamic = 'force-dynamic';

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
        { status: 400 }
      );
    }

    // Resolve caller scope (Issue #57)
    const scope = resolveUserAccessScope(req);

    // Unverified anonymous callers or unauthorized field callers cannot export full evaluation PDF
    if (!scope.isVerified && process.env.NODE_ENV !== 'test') {
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
          message: 'Authentication required to export official evaluation dossier.',
        },
        { status: 401 }
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
        { status: result.statusCode || 404 }
      );
    }

    const record = result.data;
    const recordState = record.state || record['18\nState'] || record.demographics?.state || 'Maharashtra';

    // Verify state authorization
    if (!isStateAuthorized(scope, recordState)) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'SCOPE_VIOLATION',
        outcome: 'DENY',
        targetResource: submissionId,
        scope: `state=${recordState}`,
        details: `Caller with scope [${scope.allowedStates.join(',')}] forbidden to export record for state '${recordState}'`,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN_SCOPE',
          message: `Access denied to records for state "${recordState}".`,
        },
        { status: 403 }
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
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
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
