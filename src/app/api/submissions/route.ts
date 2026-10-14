import { NextRequest, NextResponse } from 'next/server';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
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
  const requestId = req.headers.get('x-request-id') || `req-list-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    const { searchParams } = new URL(req.url);
    const clientSubmissionId = searchParams.get('clientSubmissionId');

    // Resolve caller scope (Issue #57)
    const scope = await resolveUserAccessScope(req);
    const syntheticDemoAllowed = !scope.isVerified && isSyntheticDemoModeAllowed(req);

    if (!scope.isVerified && !syntheticDemoAllowed) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'AUTH_FAILURE',
        outcome: 'DENY',
        details: 'Unauthenticated request denied on GET /api/submissions',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Authentication required to read beneficiary submissions.',
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

    // Single-record reconciliation lookup by clientSubmissionId
    if (clientSubmissionId) {
      const trimmedId = clientSubmissionId.trim();
      const record = await canonicalSubmissionAdapter.getSubmission(trimmedId, 'supervisor');
      if (record.status === 'success' && record.data) {
        const recordState = record.data.state || record.data['18\nState'] || record.data.demographics?.state || 'Maharashtra';
        const recordDistrict = record.data.district || record.data['19\nDistrict'] || record.data.demographics?.district || undefined;
        if (!isStateAuthorized(effectiveScope, recordState) || (recordDistrict && !isDistrictAuthorized(effectiveScope, recordState, recordDistrict))) {
          logSecurityEvent({
            actor: scope.userId,
            actorRole: scope.role,
            eventType: 'SCOPE_VIOLATION',
            outcome: 'DENY',
            targetResource: trimmedId,
            scope: `state=${recordState},district=${recordDistrict || ''}`,
            details: 'Caller attempted reconciliation lookup outside authorized geographic scope',
          });
          return NextResponse.json(
            {
              status: 'error',
              code: 'FORBIDDEN_SCOPE',
              message: 'Access denied to submission outside your assigned geographic scope.',
              requestId,
              retryable: false,
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

        const remoteSubmissionId = record.remoteSubmissionId || record.data.remoteSubmissionId || record.data.uniqueId;
        const version = record.version || record.data.version || record.data.revisionNumber || 1;
        return NextResponse.json(
          {
            status: 'success',
            data: {
              remoteSubmissionId,
              clientSubmissionId: trimmedId,
              version,
              submissionStatus: 'ACCEPTED',
              assetStatus: record.data.assetStatus || 'NOT_REQUIRED',
            },
            remoteSubmissionId,
            clientSubmissionId: trimmedId,
            version,
            submissionStatus: 'ACCEPTED',
            assetStatus: record.data.assetStatus || 'NOT_REQUIRED',
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
      } else {
        return NextResponse.json(
          {
            status: 'error',
            code: 'NOT_FOUND',
            message: `Record with clientSubmissionId "${trimmedId}" not found.`,
            requestId,
            retryable: false,
          },
          {
            status: 404,
            headers: {
              ...AUTH_SCOPED_NO_STORE_HEADERS,
              'X-Request-Id': requestId,
            },
          }
        );
      }
    }

    const cursor = searchParams.get('cursor') || undefined;
    const status = searchParams.get('status') || undefined;
    const updatedAfter = searchParams.get('updatedAfter') || undefined;
    const stateParam = searchParams.get('state') || undefined;
    const districtParam = searchParams.get('district') || undefined;

    // Validate state & district authorization
    if (stateParam && !isStateAuthorized(effectiveScope, stateParam)) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'SCOPE_VIOLATION',
        outcome: 'DENY',
        scope: `state=${stateParam}`,
        details: `Access to state '${stateParam}' forbidden for scope [${effectiveScope.allowedStates.join(',')}]`,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN_SCOPE',
          message: `Access denied to records for state "${stateParam}".`,
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
        details: `Access to district '${districtParam}' forbidden for scope [${effectiveScope.allowedDistricts.join(',')}]`,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN_SCOPE',
          message: `Access denied to records for district "${districtParam}".`,
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

    const rawLimit = searchParams.get('limit');
    let limit = 50;

    if (rawLimit !== null) {
      const trimmed = rawLimit.trim();
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed) || !/^\d+$/.test(trimmed) || parsed < 1) {
        return NextResponse.json(
          {
            status: 'error',
            code: 'VALIDATION_ERROR',
            message: 'Query parameter "limit" must be a positive integer between 1 and 100.',
            requestId,
            retryable: false,
          },
          {
            status: 400,
            headers: {
              ...AUTH_SCOPED_NO_STORE_HEADERS,
              'X-Request-Id': requestId,
            },
          }
        );
      }
      limit = Math.min(parsed, 100);
    }

    // Enforce scope in upstream Google Apps Script / repository query parameters
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

    const result = await canonicalSubmissionAdapter.listSubmissions({
      cursor,
      limit,
      status,
      updatedAfter,
      state: effectiveStateFilter,
      district: effectiveDistrictFilter,
    });

    if (result.status === 'error') {
      const statusCode = result.statusCode || 502;
      const code = result.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'UPSTREAM_UNAVAILABLE');
      return NextResponse.json(
        {
          status: 'error',
          code,
          message: result.message || 'Failed to list submissions from central bridge',
          requestId,
          retryable: statusCode !== 401 && statusCode !== 403 && code !== 'CONFIGURATION_ERROR' && code !== 'VALIDATION_ERROR',
        },
        {
          status: statusCode,
          headers: {
            ...AUTH_SCOPED_NO_STORE_HEADERS,
            'X-Request-Id': requestId,
          },
        }
      );
    }

    const rawRecords = result.data?.records || (Array.isArray(result.data) ? result.data : []);

    // Apply server-authoritative scope boundary (Issue #57)
    let records = filterRecordsByScope(effectiveScope, rawRecords);

    // Apply explicit query filters (Issue #53)
    if (stateParam && stateParam.toUpperCase() !== 'ALL') {
      records = records.filter(
        (r: any) => (r.state || r['18\nState'] || 'Maharashtra').toLowerCase() === stateParam.toLowerCase()
      );
    }
    if (districtParam && districtParam.toUpperCase() !== 'ALL') {
      records = records.filter(
        (r: any) => (r.district || r['19\nDistrict'] || '').toLowerCase() === districtParam.toLowerCase()
      );
    }

    const hasWildcardScope =
      (effectiveScope.allowedStates.includes('*') && effectiveScope.allowedDistricts.includes('*')) ||
      effectiveScope.role === 'LEADERSHIP' ||
      effectiveScope.role === 'ADMIN';
    const isFilteredByLocation =
      Boolean(stateParam && stateParam.toUpperCase() !== 'ALL') ||
      Boolean(districtParam && districtParam.toUpperCase() !== 'ALL');
    const total = (isFilteredByLocation || !hasWildcardScope)
      ? records.length
      : (result.data?.total ?? result.pagination?.totalCount ?? records.length);
    const nextCursor = result.data?.nextCursor ?? result.pagination?.nextCursor ?? null;
    const sourceUpdatedAt = result.data?.sourceUpdatedAt ?? new Date().toISOString();

    return NextResponse.json(
      {
        status: 'success',
        submissions: records,
        count: records.length,
        limit,
        data: {
          records,
          total,
          nextCursor,
          sourceUpdatedAt,
        },
        items: records,
        pagination: {
          total,
          totalCount: total,
          limit,
          offset: 0,
          hasMore: Boolean(nextCursor),
          nextCursor,
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
    console.error('GET /api/submissions error:', err);
    return NextResponse.json(
      {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Failed to list submissions',
        requestId,
        retryable: true,
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

    // Strict Zod schema validation
    const validation = completeSubmissionSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'The record needs correction before it can be sent.',
          details: {
            fields: validation.error.issues.map((i) => ({
              field: i.path.join('.'),
              path: i.path.join('.'),
              issue: i.message,
              code: i.code,
            })),
          },
          issues: validation.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
          requestId,
        },
        { status: 422 }
      );
    }

    const result = await canonicalSubmissionAdapter.createSubmission({
      payload: validation.data,
      idempotencyKey,
      requestId,
    });

    if (result.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'UPSTREAM_FAILURE',
          message: result.message || 'Error processing submission',
          requestId,
        },
        { status: result.statusCode || 502 }
      );
    }

    const resolvedClientSubmissionId = validation.data.clientSubmissionId || validation.data.uuid;
    return NextResponse.json(
      {
        status: 'success',
        submissionStatus: 'ACCEPTED',
        assetStatus: 'NOT_REQUIRED',
        data: {
          remoteSubmissionId: result.remoteSubmissionId,
          clientSubmissionId: resolvedClientSubmissionId,
          version: result.version || 1,
          updatedAt: result.updatedAt || new Date().toISOString(),
          syncStatus: 'SYNCED',
          submissionStatus: 'ACCEPTED',
          assetStatus: 'NOT_REQUIRED',
        },
        acknowledged: true,
        remoteSubmissionId: result.remoteSubmissionId,
        clientSubmissionId: resolvedClientSubmissionId,
        uniqueId: result.uniqueId,
        version: result.version,
        revisionNumber: result.revisionNumber,
        updatedAt: result.updatedAt,
        isDuplicate: result.isDuplicate,
        requestId: result.requestId || requestId,
      },
      { status: result.statusCode || (result.isDuplicate ? 200 : 201) }
    );
  } catch (err: any) {
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
