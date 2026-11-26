import { NextRequest, NextResponse } from 'next/server';
import { patchSubmissionSchema, flattenPatchBody } from '@/lib/validations/submissionSchema';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { validateSubmissionAttachments } from '@/lib/server/assetValidation';
import { buildRateLimitHeaders, checkUserAwareRateLimit } from '@/lib/server/rateLimit';
import { logServerError } from '@/lib/server/errorLogger';
import {
  resolveServerVerifiedRole,
  resolveUserAccessScope,
  isSyntheticDemoModeAllowed,
  isStateAuthorized,
  isDistrictAuthorized,
  extractRecordAuthorId,
  evaluateRecordAccess,
  logSecurityEvent,
  validateCsrfOrigin,
} from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
};

export async function GET(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const scope = await resolveUserAccessScope(req);
    const syntheticDemoAllowed = !scope.isVerified && isSyntheticDemoModeAllowed(req);

    if (!scope.isVerified && !syntheticDemoAllowed) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'AUTH_FAILURE',
        outcome: 'DENY',
        targetResource: submissionId,
        details: 'Unauthenticated request denied on GET /api/submissions/[submissionId]',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Authentication required to read beneficiary submission details.',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { role } = await resolveServerVerifiedRole(req);

    const result = await canonicalSubmissionAdapter.getSubmission(submissionId, role);

    if (result.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'NOT_FOUND',
          message: result.message || `Submission ${submissionId} not found`,
        },
        { status: result.statusCode || 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!syntheticDemoAllowed && result.data) {
      const access = evaluateRecordAccess(scope, result.data, 'record');
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
          { status: access.statusCode || 403, headers: NO_STORE_HEADERS }
        );
      }
    }

    const record = result.data;
    const isApproved = Boolean(
      record?.isApproved === true ||
      record?.approvedAllianceIndia === 'APPROVED' ||
      record?.approvalStatus === 'APPROVED' ||
      record?.['67\nApproved Alliance India'] === 'APPROVED'
    );

    const recordAuthorId = extractRecordAuthorId(record);
    const isAuthor = Boolean(
      (recordAuthorId && scope.userId && recordAuthorId.toLowerCase() === scope.userId.trim().toLowerCase()) ||
      (!recordAuthorId && syntheticDemoAllowed)
    );

    let canEdit = false;
    let canEditAssessment = false;
    let canUploadOutstandingDocuments = false;
    let canReplaceDocuments = false;
    let canChangeApproval = false;
    let canDelete = false;
    let capabilityReason: string | undefined = undefined;

    if (!scope.isVerified && !syntheticDemoAllowed) {
      canEdit = false;
      canEditAssessment = false;
      canUploadOutstandingDocuments = false;
      canReplaceDocuments = false;
      canChangeApproval = false;
      canDelete = false;
      capabilityReason = 'Authentication required to edit assessments.';
    } else if (scope.role === 'ADMIN') {
      canEdit = true;
      canEditAssessment = true;
      canUploadOutstandingDocuments = true;
      canReplaceDocuments = true;
      canChangeApproval = true;
      canDelete = true;
    } else if (scope.role === 'LEADERSHIP') {
      canEdit = true;
      canEditAssessment = true;
      canUploadOutstandingDocuments = true;
      canReplaceDocuments = true;
      canChangeApproval = true;
      canDelete = true;
    } else if (scope.role === 'STATE_REVIEWER') {
      const recordState = record?.state || record?.['18\nState'] || record?.demographics?.state || 'Maharashtra';
      if (!isStateAuthorized(scope, recordState)) {
        canEdit = false;
        canEditAssessment = false;
        canUploadOutstandingDocuments = false;
        canReplaceDocuments = false;
        canChangeApproval = false;
        canDelete = false;
        capabilityReason = `State reviewers can only edit records within their assigned state (${scope.allowedStates.join(', ')}).`;
      } else if (scope.canEdit === false) {
        canEdit = false;
        canEditAssessment = false;
        canUploadOutstandingDocuments = false;
        canReplaceDocuments = false;
        canChangeApproval = false;
        canDelete = false;
        capabilityReason = 'Your current State Reviewer session operates under a read-only policy.';
      } else {
        canEdit = true;
        canEditAssessment = true;
        canUploadOutstandingDocuments = true;
        canReplaceDocuments = true;
        canChangeApproval = false;
        canDelete = true;
      }
    } else if (scope.role === 'FIELD_USER') {
      if (isAuthor) {
        if (isApproved) {
          canEdit = false;
          canEditAssessment = false;
          canUploadOutstandingDocuments = true;
          canReplaceDocuments = false;
          canChangeApproval = false;
          canDelete = false;
          capabilityReason = 'This assessment has been approved by Leadership and is locked against field-worker edits. Post-approval bank documents may still be uploaded.';
        } else {
          canEdit = true;
          canEditAssessment = true;
          canUploadOutstandingDocuments = true;
          canReplaceDocuments = true;
          canChangeApproval = false;
          canDelete = false;
        }
      } else {
        canEdit = false;
        canEditAssessment = false;
        canUploadOutstandingDocuments = false;
        canReplaceDocuments = false;
        canChangeApproval = false;
        canDelete = false;
        capabilityReason = 'Only the originating field worker or an authorized State Team reviewer can edit this assessment.';
      }
    } else {
      canEdit = false;
      canEditAssessment = false;
      canUploadOutstandingDocuments = false;
      canReplaceDocuments = false;
      canChangeApproval = false;
      canDelete = false;
      capabilityReason = 'Editing not permitted for your current role.';
    }

    const capabilities = {
      canEdit,
      canEditAssessment,
      canUploadOutstandingDocuments,
      canReplaceDocuments,
      canChangeApproval,
      canDelete,
      reason: capabilityReason,
    };

    return NextResponse.json(
      {
        status: 'success',
        data: result.data,
        remoteSubmissionId: result.remoteSubmissionId,
        version: result.version,
        capabilities,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err: any) {
    console.error('GET /api/submissions/[submissionId] error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    const scope = await resolveUserAccessScope(req);
    const rl = checkUserAwareRateLimit({
      req,
      namespace: 'submissions_patch',
      perUserLimit: 150,
      sharedIpLimit: 600,
      windowMs: 60 * 1000,
      userId: scope.userId,
      isVerifiedUser: scope.isVerified,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many update requests sent quickly. Please retry shortly.',
          requestId,
        },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const csrf = validateCsrfOrigin(req);
    if (!csrf.isValid) {
      return NextResponse.json(
        { status: 'error', code: 'CSRF_VIOLATION', message: csrf.reason || 'Forbidden request origin.' },
        { status: 403 }
      );
    }

    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    if (!scope.isVerified) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: 'Unverified caller denied on PATCH /api/submissions/[submissionId]',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Authentication required to edit submissions.',
          requestId,
        },
        { status: 401 }
      );
    }

    const isStateEvaluatorWithEdit = scope.role === 'STATE_REVIEWER' && scope.canEdit === true;
    const isFieldWorker = scope.role === 'FIELD_USER';
    if (scope.role !== 'ADMIN' && scope.role !== 'LEADERSHIP' && !isStateEvaluatorWithEdit && !isFieldWorker) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: `Caller role '${scope.role}' forbidden to execute PATCH on submission.`,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Record edits and approvals are restricted to verified Administrator and Leadership roles. State Evaluator and Field sessions operate under read-only or restricted policies.',
          requestId,
        },
        { status: 403 }
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

    // State evaluators and Field workers can edit record fields within their authorized scope,
    // but CANNOT modify leadership grant approval
    if (scope.role === 'STATE_REVIEWER' || scope.role === 'FIELD_USER') {
      if (rawBody.approval !== undefined || rawBody.approvedAllianceIndia !== undefined) {
        logSecurityEvent({
          actor: scope.userId,
          actorRole: scope.role,
          eventType: 'ACCESS_DENIED',
          outcome: 'DENY',
          targetResource: submissionId,
          details: `${scope.role} forbidden to modify grant approval status. Approval is restricted to Leadership and Admin.`,
        });
        return NextResponse.json(
          {
            status: 'error',
            code: 'FORBIDDEN',
            message: 'Grant approval decisions are strictly restricted to verified Administrator and Leadership roles. Field workers and State evaluators cannot modify approval status.',
            requestId,
          },
          { status: 403 }
        );
      }
    }

    // Parse If-Match header
    const ifMatchHeader = req.headers.get('If-Match') || req.headers.get('if-match');
    let parsedIfMatch: number | undefined = undefined;
    if (ifMatchHeader) {
      const matchNum = parseInt(ifMatchHeader.replace(/"/g, '').trim(), 10);
      if (!isNaN(matchNum) && matchNum > 0) {
        parsedIfMatch = matchNum;
      }
    }

    const bodyVersion =
      rawBody.expectedVersion !== undefined && rawBody.expectedVersion !== null && rawBody.expectedVersion !== ''
        ? Number(rawBody.expectedVersion)
        : undefined;

    // Enforce consistency: If both are provided and disagree, return HTTP 400 PRECONDITION_MISMATCH
    if (
      bodyVersion !== undefined &&
      parsedIfMatch !== undefined &&
      bodyVersion !== parsedIfMatch
    ) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'PRECONDITION_MISMATCH',
          message: 'Version preconditions disagree: If-Match header and body expectedVersion must match',
          requestId,
        },
        { status: 400 }
      );
    }

    // Canonical resolution: prefer parsed If-Match header, fallback to body expectedVersion
    const resolvedVersion = parsedIfMatch ?? bodyVersion;

    if (
      resolvedVersion === undefined ||
      isNaN(resolvedVersion) ||
      resolvedVersion < 1
    ) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'The record needs correction before it can be sent.',
          details: {
            fields: [
              {
                field: 'expectedVersion',
                path: 'expectedVersion',
                issue: 'expectedVersion is required and must be a positive integer',
                code: 'invalid_type',
              },
            ],
          },
          requestId,
        },
        { status: 422 }
      );
    }

    rawBody.expectedVersion = resolvedVersion;

    const flattenedBody = flattenPatchBody(rawBody);
    const attachmentRes = validateSubmissionAttachments(rawBody);
    if (!attachmentRes.valid) {
      return NextResponse.json(
        {
          status: 'error',
          code: attachmentRes.code || 'INVALID_ASSET',
          message: attachmentRes.message || 'Uploaded attachment exceeds limits or uses an unsupported format.',
          requestId,
        },
        { status: attachmentRes.statusCode || 422 }
      );
    }

    const validation = patchSubmissionSchema.safeParse(flattenedBody);
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

    const patchPayload = validation.data;
    const idempotencyKey =
      req.headers.get('Idempotency-Key') ||
      req.headers.get('idempotency-key') ||
      `update-${submissionId}-${patchPayload.expectedVersion || 1}`;

    // Geographic and permission scope enforcement
    if (scope.role === 'FIELD_USER') {
      const existing = await canonicalSubmissionAdapter.getSubmission(submissionId, 'caseworker');
      if (existing.status === 'success' && existing.data) {
        const recordAuthorId = existing.data.authorId || existing.data.submittedByWorkerId || existing.data.authorIdentifier || existing.data.userId;
        const isAuthor = Boolean(recordAuthorId && scope.userId && recordAuthorId.trim().toLowerCase() === scope.userId.trim().toLowerCase());

        if (!isAuthor) {
          logSecurityEvent({
            actor: scope.userId,
            actorRole: scope.role,
            eventType: 'ACCESS_DENIED',
            outcome: 'DENY',
            targetResource: submissionId,
            details: 'Field worker attempted to edit a record authored by another worker.',
          });
          return NextResponse.json(
            {
              status: 'error',
              code: 'FORBIDDEN_AUTHOR_MISMATCH',
              message: 'Only the originating field worker or an authorized State Team reviewer can edit this assessment.',
              requestId,
            },
            { status: 403 }
          );
        }

        const isApproved = Boolean(
          existing.data.isApproved === true ||
          existing.data.approvedAllianceIndia === 'APPROVED' ||
          existing.data.approvalStatus === 'APPROVED' ||
          existing.data['67\nApproved Alliance India'] === 'APPROVED'
        );

        if (isApproved) {
          // If approved, field caseworkers can only submit post-approval banking corrections.
          // General intake, demographics, and clinical fields remain strictly locked.
          const allowedBankPatchKeys = new Set([
            'expectedVersion',
            'bankAccountHolderName',
            'bankAccountNumber',
            'bankIfscCode',
            'bankName',
            'branchName',
            'accountHolderName',
            'bankAccountNumberMasked',
            'bankIfsc',
            'bankMobile',
            'bankAccountNo',
            'ifsc',
          ]);

          const patchKeys = Object.keys(patchPayload);
          const hasNonBankEdits = patchKeys.some((k) => !allowedBankPatchKeys.has(k));

          if (hasNonBankEdits) {
            logSecurityEvent({
              actor: scope.userId,
              actorRole: scope.role,
              eventType: 'ACCESS_DENIED',
              outcome: 'DENY',
              targetResource: submissionId,
              details: 'Field worker attempted to edit intake fields on a Leadership-approved record.',
            });
            return NextResponse.json(
              {
                status: 'error',
                code: 'RECORD_LOCKED_APPROVED',
                message: 'This assessment has been approved by Leadership and is locked against field-worker intake edits. Contact your State Team coordinator for revision requests.',
                requestId,
              },
              { status: 403 }
            );
          }
        }
      }
    } else if (
      (scope.role === 'STATE_REVIEWER' || scope.role === 'LEADERSHIP') &&
      (!scope.allowedStates.includes('*') || !scope.allowedDistricts.includes('*'))
    ) {
      const existing = await canonicalSubmissionAdapter.getSubmission(submissionId, 'caseworker');
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
            details: `${scope.role} caller forbidden to edit record outside authorized scope ('${recordState}')`,
          });
          return NextResponse.json(
            {
              status: 'error',
              code: 'FORBIDDEN_SCOPE',
              message: `Access denied to edit records in state "${recordState}".`,
              requestId,
            },
            { status: 403 }
          );
        }
      }
    }

    const result = await canonicalSubmissionAdapter.updateSubmission({
      submissionId,
      patch: patchPayload,
      expectedVersion: patchPayload.expectedVersion,
      idempotencyKey,
      requestId,
    });

    if (result.status === 'conflict') {
      return NextResponse.json(
        {
          status: 'error',
          code: 'CONCURRENCY_CONFLICT',
          message: 'The record has been updated by another caseworker. Please refresh before saving.',
          currentVersion: result.currentVersion,
          expectedVersion: result.expectedVersion,
          resolutionPath: 'REFRESH_AND_MERGE',
          requestId,
        },
        { status: 409 }
      );
    }

    if (result.status === 'error') {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'UPSTREAM_FAILURE',
          message: result.message || 'Error updating record',
          requestId,
        },
        { status: result.statusCode || 502 }
      );
    }

    // Trigger best-effort Firestore mirror drain to sync updated row to Google Sheets
    canonicalSubmissionAdapter.triggerBestEffortFirestoreMirrorDrain?.();

    const isApprovalChange = patchPayload.approvedAllianceIndia !== undefined;
    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: isApprovalChange ? 'APPROVAL_CHANGED' : 'RECORD_MODIFIED',
      outcome: 'ALLOW',
      targetResource: submissionId,
      details: `Record ${submissionId} updated by ${scope.name || scope.userId} (${scope.role}). Fields: ${Object.keys(patchPayload).filter((k) => k !== 'expectedVersion').join(', ')}. Version: ${result.version || patchPayload.expectedVersion + 1}`,
    });

    const finalSyncStatus = result.syncStatus || (result.sheetSyncCompleted ? 'SYNCED' : 'PENDING_SHEET_SYNC');
    const syncMessage = finalSyncStatus === 'SYNCED'
      ? 'Record updated and synced to Google Sheets.'
      : (finalSyncStatus === 'FAILED_SHEET_SYNC' ? 'Saved. Sheet sync failed, retry available.' : 'Saved. Sheet sync pending.');

    return NextResponse.json(
      {
        status: 'success',
        syncStatus: finalSyncStatus,
        message: syncMessage,
        data: {
          ...(result.data || {}),
          remoteSubmissionId: result.remoteSubmissionId || submissionId,
          clientSubmissionId: result.uniqueId || submissionId,
          version: result.version || patchPayload.expectedVersion + 1,
          updatedAt: result.updatedAt || new Date().toISOString(),
          syncStatus: finalSyncStatus,
          syncMessage,
        },
        acknowledged: true,
        remoteSubmissionId: result.remoteSubmissionId || submissionId,
        version: result.version || patchPayload.expectedVersion + 1,
        updatedAt: result.updatedAt || new Date().toISOString(),
        requestId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logServerError('PATCH /api/submissions/[submissionId]', err, { requestId });
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error processing patch', requestId },
      { status: 500 }
    );
  }
}

// Support PUT as an alias to PATCH for REST compatibility
export async function PUT(
  req: NextRequest,
  context: { params: { submissionId: string } }
) {
  return PATCH(req, context);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const csrf = validateCsrfOrigin(req);
    if (!csrf.isValid) {
      return NextResponse.json(
        { status: 'error', code: 'CSRF_VIOLATION', message: csrf.reason || 'Forbidden request origin.' },
        { status: 403 }
      );
    }

    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    const scope = await resolveUserAccessScope(req);

    // Role authorization:
    // - Administration (LEADERSHIP / ADMIN): any record
    // - State Team (STATE_REVIEWER with edit access): own state only, reason required
    // - Field Workers (FIELD_USER), AUDITOR, and unauthenticated callers: strictly denied
    const isAdminOrLeadership = scope.role === 'ADMIN' || scope.role === 'LEADERSHIP';
    const isAuthorizedStateReviewer = scope.role === 'STATE_REVIEWER' && scope.canEdit !== false;

    if (!scope.isVerified || (!isAdminOrLeadership && !isAuthorizedStateReviewer)) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: `Caller role '${scope.role}' (isVerified: ${scope.isVerified}) forbidden to execute DELETE on submission`,
      });

      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Soft deletion is restricted to verified Administrator, Leadership, and state-scoped State Team coordinators.',
        },
        { status: 403 }
      );
    }

    let providedReason = '';
    try {
      const body = await req.json().catch(() => null);
      const raw = body?.reason ?? body?.deleteReason ?? req.headers.get('x-delete-reason') ?? '';
      if (typeof raw === 'string') {
        providedReason = raw.replace(/[\r\n\t]+/g, ' ').trim();
      }
    } catch {
      const headerReason = req.headers.get('x-delete-reason') || '';
      providedReason = headerReason.replace(/[\r\n\t]+/g, ' ').trim();
    }

    if (scope.role === 'STATE_REVIEWER') {
      if (providedReason.length < 3 || providedReason.length > 500) {
        return NextResponse.json(
          {
            status: 'error',
            code: 'DELETE_REASON_REQUIRED',
            message: 'A valid deletion reason (between 3 and 500 characters) is required for State Team soft deletes.',
          },
          { status: 400 }
        );
      }

      const existing = await canonicalSubmissionAdapter.getSubmission(submissionId, 'supervisor');
      if (existing.status !== 'success' || !existing.data) {
        return NextResponse.json(
          {
            status: 'error',
            code: existing.code || 'NOT_FOUND',
            message: existing.message || `Record ${submissionId} not found.`,
          },
          { status: existing.statusCode || 404 }
        );
      }

      const recordState =
        existing.data.state ||
        existing.data['18\nState'] ||
        existing.data.demographics?.state ||
        'Maharashtra';
      const recordDistrict =
        existing.data.district ||
        existing.data['19\nDistrict'] ||
        existing.data.demographics?.district ||
        undefined;

      if (
        !isStateAuthorized(scope, recordState) ||
        (recordDistrict && !isDistrictAuthorized(scope, recordState, recordDistrict))
      ) {
        logSecurityEvent({
          actor: scope.userId,
          actorRole: scope.role,
          eventType: 'SCOPE_VIOLATION',
          outcome: 'DENY',
          targetResource: submissionId,
          scope: `state=${recordState},district=${recordDistrict || ''}`,
          details: `STATE_REVIEWER forbidden to soft-delete out-of-state record ('${recordState}')`,
        });

        return NextResponse.json(
          {
            status: 'error',
            code: 'FORBIDDEN_SCOPE',
            message: `Access denied: State Team coordinators can only delete records within their assigned state (${scope.allowedStates.join(', ')}).`,
          },
          { status: 403 }
        );
      }
    }

    const effectiveReason = providedReason || 'Deleted by Administration';
    const result = await canonicalSubmissionAdapter.deleteSubmission(submissionId, {
      actorId: scope.userId,
      actorName: scope.name,
      actorRole: scope.role,
      reason: effectiveReason,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          status: 'error',
          code: result.code || 'DELETE_FAILED',
          message: result.message || 'Failed to soft-delete record.',
        },
        { status: result.statusCode || 500 }
      );
    }

    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'RECORD_DELETED',
      outcome: 'ALLOW',
      targetResource: submissionId,
      details: `Record ${submissionId} soft-deleted by ${scope.name} (${scope.role}): ${effectiveReason}`,
    });

    return NextResponse.json(
      {
        status: 'success',
        deleted: true,
        softDeleted: true,
        deletedAt: result.deletedAt,
        reason: effectiveReason,
        message: `Record ${submissionId} soft-deleted successfully`,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('DELETE /api/submissions/[submissionId] error:', err);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error deleting record' },
      { status: 500 }
    );
  }
}
