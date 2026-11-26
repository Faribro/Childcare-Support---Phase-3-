import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { deriveSubmissionStages } from '@/lib/shared/submissionStages';
import {
  resolveUserAccessScope,
  isSyntheticDemoModeAllowed,
  isStateAuthorized,
  isDistrictAuthorized,
  filterRecordsByScope,
  logSecurityEvent,
  UserAccessScope,
} from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const AUTH_SCOPED_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
};

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req-sum-${Date.now().toString(36)}`;
  const scope = await resolveUserAccessScope(req);
  const syntheticDemoAllowed = !scope.isVerified && isSyntheticDemoModeAllowed(req);

  if (!scope.isVerified && !syntheticDemoAllowed) {
    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'AUTH_FAILURE',
      outcome: 'DENY',
      details: 'Unauthenticated request denied on GET /api/submissions/summary',
    });
    return NextResponse.json(
      {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Authentication required to read submission summaries.',
        requestId,
        retryable: false,
      },
      {
        status: 401,
        headers: {
          ...AUTH_SCOPED_NO_STORE_HEADERS,
          'X-Request-Id': requestId,
        },
      }
    );
  }

  const effectiveScope: UserAccessScope = syntheticDemoAllowed
    ? {
        ...scope,
        isVerified: true,
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        reason: 'synthetic_demo_mode',
      }
    : scope;

  const { searchParams } = new URL(req.url);

  const stateParam = searchParams.get('state') || undefined;
  const districtParam = searchParams.get('district') || undefined;

  // 1. Enforce geographic scope authorization (Issue #57)
  if (stateParam && !isStateAuthorized(effectiveScope, stateParam)) {
    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'SCOPE_VIOLATION',
      outcome: 'DENY',
      scope: `state=${stateParam}`,
      details: `User scope [${effectiveScope.allowedStates.join(',')}] rejected for state ${stateParam}`,
    });

    return NextResponse.json(
      {
        status: 'error',
        code: 'FORBIDDEN_SCOPE',
        message: `You do not have permission to access summary records for state "${stateParam}".`,
        requestId,
      },
      {
        status: 403,
        headers: {
          ...AUTH_SCOPED_NO_STORE_HEADERS,
          'X-Request-Id': requestId,
        },
      }
    );
  }

  if (districtParam && !isDistrictAuthorized(effectiveScope, stateParam, districtParam)) {
    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'SCOPE_VIOLATION',
      outcome: 'DENY',
      scope: `district=${districtParam}`,
      details: `User scope [${effectiveScope.allowedDistricts.join(',')}] rejected for district ${districtParam}`,
    });

    return NextResponse.json(
      {
        status: 'error',
        code: 'FORBIDDEN_SCOPE',
        message: `You do not have permission to access summary records for district "${districtParam}".`,
        requestId,
      },
      {
        status: 403,
        headers: {
          ...AUTH_SCOPED_NO_STORE_HEADERS,
          'X-Request-Id': requestId,
        },
      }
    );
  }

  try {
    const effectiveStateFilter =
      stateParam && stateParam.toUpperCase() !== 'ALL'
        ? stateParam
        : !effectiveScope.allowedStates.includes('*') && effectiveScope.allowedStates.length === 1
          ? effectiveScope.allowedStates[0]
          : stateParam;

    const effectiveDistrictFilter =
      districtParam && districtParam.toUpperCase() !== 'ALL'
        ? districtParam
        : !effectiveScope.allowedDistricts.includes('*') && effectiveScope.allowedDistricts.length === 1
          ? effectiveScope.allowedDistricts[0]
          : districtParam;

    // 2. Fetch all pages of submissions from canonical storage (bounded to 50 pages / 5,000 records)
    const rawRecords: any[] = [];
    let cursor: string | undefined = undefined;
    let upstreamTotal: number | undefined = undefined;
    const seenCursors = new Set<string>();
    const MAX_SUMMARY_PAGES = 50;

    for (let page = 0; page < MAX_SUMMARY_PAGES; page++) {
      const listResult = await canonicalSubmissionAdapter.listSubmissions({
        cursor,
        limit: 100,
        state: effectiveStateFilter,
        district: effectiveDistrictFilter,
      });

      if (listResult.status === 'error') {
        if (page === 0) {
          return NextResponse.json(
            {
              status: 'error',
              code: listResult.code || 'UPSTREAM_ERROR',
              message: listResult.message || 'Unable to retrieve submissions summary',
              requestId,
            },
            {
              status: listResult.statusCode || 502,
              headers: {
                ...AUTH_SCOPED_NO_STORE_HEADERS,
                'X-Request-Id': requestId,
              },
            }
          );
        }
        break;
      }

      const batch = listResult.data?.records || (Array.isArray(listResult.data) ? listResult.data : []);
      rawRecords.push(...batch);

      if (upstreamTotal === undefined) {
        const candidateTotal = listResult.pagination?.totalCount ?? listResult.data?.total;
        if (typeof candidateTotal === 'number') {
          upstreamTotal = candidateTotal;
        }
      }

      const nextCursor = listResult.pagination?.nextCursor ?? listResult.data?.nextCursor ?? null;
      if (!nextCursor || batch.length === 0 || seenCursors.has(nextCursor)) {
        break;
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    // 3. Apply server-authoritative scope filtering
    let scoped = filterRecordsByScope(effectiveScope, rawRecords);

    // Apply explicit query filters if provided
    if (stateParam && stateParam.toUpperCase() !== 'ALL') {
      scoped = scoped.filter((r: any) => {
        const rs = (r.state || r['18\nState'] || r.demographics?.state || r.payload?.demographics?.state || r.payload?.state || 'Maharashtra').toString().trim().toLowerCase();
        return rs === stateParam.trim().toLowerCase();
      });
    }
    if (districtParam && districtParam.toUpperCase() !== 'ALL') {
      scoped = scoped.filter((r: any) => {
        const rd = (r.district || r['19\nDistrict'] || r.demographics?.district || r.payload?.demographics?.district || r.payload?.district || '').toString().trim().toLowerCase();
        return rd === districtParam.trim().toLowerCase();
      });
    }

    // Determine un-truncated total count
    const isFilteredByLocation =
      Boolean(stateParam && stateParam.toUpperCase() !== 'ALL') ||
      Boolean(districtParam && districtParam.toUpperCase() !== 'ALL');
    const hasWildcardScope =
      (effectiveScope.allowedStates.includes('*') && effectiveScope.allowedDistricts.includes('*')) ||
      effectiveScope.role === 'LEADERSHIP' ||
      effectiveScope.role === 'ADMIN';
    const totalCount = isFilteredByLocation
      ? scoped.length
      : typeof upstreamTotal === 'number' && hasWildcardScope
        ? Math.max(upstreamTotal, scoped.length)
        : scoped.length;
    const now = new Date().toISOString();

    let intakeIncompleteCount = 0;
    let bankPendingCount = 0;
    for (const rawItem of scoped) {
      const r =
        rawItem && typeof rawItem === 'object' && rawItem.payload && typeof rawItem.payload === 'object'
          ? { ...rawItem.payload, ...rawItem }
          : rawItem;
      const stages = deriveSubmissionStages(r);
      if (
        stages.intakeCompleteness === 'incomplete' ||
        stages.intakeCompleteness === 'pending_review' ||
        stages.intakeCompleteness === 'partial'
      ) {
        intakeIncompleteCount++;
      }
      if (stages.bankWorkflow === 'pending') bankPendingCount++;
    }

    return NextResponse.json(
      {
        status: 'success',
        data: {
          serverConfirmed: totalCount,
          total: totalCount,
          intakeIncomplete: intakeIncompleteCount,
          bankPending: bankPendingCount,
          source: 'server',
          generatedAt: now,
          scope: {
            role: scope.role,
            allowedStates: scope.allowedStates,
            allowedDistricts: scope.allowedDistricts,
            isVerified: scope.isVerified,
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
          ...AUTH_SCOPED_NO_STORE_HEADERS,
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
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'X-Request-Id': requestId,
        },
      }
    );
  }
}
