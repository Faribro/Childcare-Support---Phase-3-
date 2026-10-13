import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  resolveUserAccessScope,
  isStateAuthorized,
  isDistrictAuthorized,
  logSecurityEvent,
} from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const ASSET_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
};

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
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const scope = resolveUserAccessScope(req);
    if (!scope.isVerified) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: 'Unverified caller denied on POST /api/submissions/[submissionId]/asset',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Authentication required to upload or update submission assets.',
          requestId,
        },
        { status: 401, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (scope.role !== 'ADMIN') {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: `Caller role '${scope.role}' forbidden to upload assets under Model A read-only evaluation policy`,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Asset upload is restricted to verified Administrator role. State Evaluation and Leadership users have read-only evaluation access.',
          requestId,
        },
        { status: 403, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON body' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const { docType, fileData, documentOperationId, expectedVersion, expectedCurrentCellStateHash } = rawBody || {};

    if (!docType || typeof docType !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required field: docType' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (!fileData || typeof fileData !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required field: fileData' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (expectedVersion === undefined || expectedVersion === null || typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing or invalid required field: expectedVersion (must be positive integer)' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (!expectedCurrentCellStateHash || typeof expectedCurrentCellStateHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(expectedCurrentCellStateHash.trim())) {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing or invalid required field: expectedCurrentCellStateHash (must be 64-character hex SHA-256 hash)' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    // When caller does not have global wildcard scope, verify the target submission belongs to their authorized scope
    if (!scope.allowedStates.includes('*') || !scope.allowedDistricts.includes('*')) {
      const existing = await canonicalSubmissionAdapter.getSubmission(submissionId, 'supervisor');
      if (existing.status === 'success' && existing.data) {
        const recordState = existing.data.state || existing.data['18\nState'] || existing.data.demographics?.state || 'Maharashtra';
        const recordDistrict = existing.data.district || existing.data['19\nDistrict'] || existing.data.demographics?.district || undefined;
        if (!isStateAuthorized(scope, recordState) || (recordDistrict && !isDistrictAuthorized(scope, recordState, recordDistrict))) {
          logSecurityEvent({
            actor: scope.userId,
            actorRole: scope.role,
            eventType: 'SCOPE_VIOLATION',
            outcome: 'DENY',
            targetResource: submissionId,
            scope: `state=${recordState},district=${recordDistrict || ''}`,
            details: 'Caller forbidden to update asset outside authorized geographic scope',
          });
          return NextResponse.json(
            {
              status: 'error',
              code: 'FORBIDDEN_SCOPE',
              message: `Access denied to update assets for records in state "${recordState}".`,
              requestId,
            },
            { status: 403, headers: ASSET_NO_STORE_HEADERS }
          );
        }
      }
    }

    const result = await canonicalSubmissionAdapter.updateAsset({
      submissionId,
      docType,
      fileData,
      documentOperationId,
      expectedVersion,
      expectedCurrentCellStateHash,
      requestId,
    });

    if (result.status === 'error' || result.status === 'conflict') {
      return NextResponse.json(
        {
          status: result.status,
          code: result.code || (result.status === 'conflict' ? 'OCC_CONFLICT' : 'UPSTREAM_FAILURE'),
          message: result.message || 'Failed to update asset',
          requestId,
        },
        { status: result.statusCode || (result.status === 'conflict' ? 409 : 500) }
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
