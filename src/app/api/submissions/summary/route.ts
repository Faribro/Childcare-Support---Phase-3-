import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  resolveUserAccessScope,
  isStateAuthorized,
  isDistrictAuthorized,
  filterRecordsByScope,
  logSecurityEvent,
} from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req-sum-${Date.now().toString(36)}`;
  const scope = resolveUserAccessScope(req);
  const { searchParams } = new URL(req.url);

  const stateParam = searchParams.get('state') || undefined;
  const districtParam = searchParams.get('district') || undefined;

  // 1. Enforce geographic scope authorization (Issue #57)
  if (stateParam && !isStateAuthorized(scope, stateParam)) {
    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'SCOPE_VIOLATION',
      outcome: 'DENY',
      scope: `state=${stateParam}`,
      details: `User scope [${scope.allowedStates.join(',')}] rejected for state ${stateParam}`,
    });

    return NextResponse.json(
      {
        status: 'error',
        code: 'FORBIDDEN_SCOPE',
        message: `You do not have permission to access summary records for state "${stateParam}".`,
        requestId,
      },
      { status: 403 }
    );
  }

  if (districtParam && !isDistrictAuthorized(scope, stateParam, districtParam)) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'FORBIDDEN_SCOPE',
        message: `You do not have permission to access summary records for district "${districtParam}".`,
        requestId,
      },
      { status: 403 }
    );
  }

  try {
    // 2. Fetch submissions from canonical storage
    const listResult = await canonicalSubmissionAdapter.listSubmissions({
      limit: 100,
      state: stateParam,
      district: districtParam,
    });

    if (listResult.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: listResult.code || 'UPSTREAM_ERROR',
          message: listResult.message || 'Unable to retrieve submissions summary',
          requestId,
        },
        { status: listResult.statusCode || 502 }
      );
    }

    const rawRecords = listResult.data?.records || (Array.isArray(listResult.data) ? listResult.data : []);
    
    // 3. Apply server-authoritative scope filtering
    let scoped = filterRecordsByScope(scope, rawRecords);

    // Apply explicit query filters if provided
    if (stateParam && stateParam.toUpperCase() !== 'ALL') {
      scoped = scoped.filter(
        (r: any) => (r.state || 'Maharashtra').toLowerCase() === stateParam.toLowerCase()
      );
    }
    if (districtParam && districtParam.toUpperCase() !== 'ALL') {
      scoped = scoped.filter(
        (r: any) => (r.district || '').toLowerCase() === districtParam.toLowerCase()
      );
    }

    const totalCount = scoped.length;
    const now = new Date().toISOString();

    return NextResponse.json(
      {
        status: 'success',
        data: {
          serverConfirmed: totalCount,
          total: totalCount,
          source: 'server',
          generatedAt: now,
          scope: {
            role: scope.role,
            allowedStates: scope.allowedStates,
          },
        },
        pagination: {
          totalCount,
        },
        requestId,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'X-Request-Id': requestId,
        },
      }
    );
  } catch (err: any) {
    console.error('GET /api/submissions/summary error:', err);
    return NextResponse.json(
      {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Failed to compute submission summary.',
        requestId,
      },
      { status: 500 }
    );
  }
}
