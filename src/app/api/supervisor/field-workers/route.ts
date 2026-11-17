import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessScope, logSecurityEvent } from '@/lib/server/authorisation';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { canonicalizeStateName } from '@/lib/constants/stateNormalization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

export async function GET(req: NextRequest) {
  try {
    const scope = await resolveUserAccessScope(req);

    if (!scope.isVerified) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        details: 'Unauthenticated caller denied on GET /api/supervisor/field-workers',
      });
      return NextResponse.json(
        { status: 'error', error: 'Authentication required to view field workers directory.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (scope.role !== 'STATE_REVIEWER' && scope.role !== 'LEADERSHIP' && scope.role !== 'ADMIN') {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        details: `Caller role '${scope.role}' forbidden on GET /api/supervisor/field-workers`,
      });
      return NextResponse.json(
        { status: 'error', error: 'Forbidden: State Reviewer or Supervisor privileges required.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedStateParam = searchParams.get('state');

    let effectiveState: string | undefined = undefined;

    if (scope.role === 'STATE_REVIEWER') {
      const reviewerState = canonicalizeStateName(scope.allowedStates[0] || 'Maharashtra');
      if (requestedStateParam) {
        const canonicalRequested = canonicalizeStateName(requestedStateParam);
        if (canonicalRequested.toLowerCase() !== reviewerState.toLowerCase()) {
          logSecurityEvent({
            actor: scope.userId,
            actorRole: scope.role,
            eventType: 'SCOPE_VIOLATION',
            outcome: 'DENY',
            scope: `requested=${canonicalRequested},allowed=${reviewerState}`,
            details: 'State reviewer attempted to view field workers outside authorized state',
          });
          return NextResponse.json(
            { status: 'error', error: `Forbidden: Access restricted to ${reviewerState} field workers.` },
            { status: 403, headers: NO_STORE_HEADERS }
          );
        }
      }
      effectiveState = reviewerState;
    } else {
      // Leadership / Admin
      if (requestedStateParam && requestedStateParam !== '*' && requestedStateParam.toUpperCase() !== 'ALL') {
        effectiveState = canonicalizeStateName(requestedStateParam);
      }
    }

    const store = getOnboardingStore();
    const profiles = await store.listFieldUserProfiles(effectiveState);

    // Fetch submissions for effective state to calculate counts
    const submissionsResult = await canonicalSubmissionAdapter.listSubmissions({
      state: effectiveState,
      limit: 1000,
    });

    const submissions =
      submissionsResult.status === 'success' && Array.isArray(submissionsResult.data)
        ? submissionsResult.data
        : [];

    // Group submission stats by worker name/email
    const statsByWorker = new Map<string, { count: number; lastSubmissionTime: string }>();

    for (const sub of submissions) {
      const subTime = sub.submissionTime || '';
      const keysToMatch: string[] = [];

      if (sub.submittedBy) keysToMatch.push(sub.submittedBy.trim().toLowerCase());
      if (sub.interviewerName) keysToMatch.push(sub.interviewerName.trim().toLowerCase());
      if ((sub as any).payload?.userEmail) keysToMatch.push((sub as any).payload.userEmail.trim().toLowerCase());
      if ((sub as any).payload?.interviewerEmail) keysToMatch.push((sub as any).payload.interviewerEmail.trim().toLowerCase());

      const uniqueKeys = Array.from(new Set(keysToMatch));
      for (const k of uniqueKeys) {
        const existing = statsByWorker.get(k) || { count: 0, lastSubmissionTime: '' };
        statsByWorker.set(k, {
          count: existing.count + 1,
          lastSubmissionTime:
            !existing.lastSubmissionTime || subTime > existing.lastSubmissionTime
              ? subTime
              : existing.lastSubmissionTime,
        });
      }
    }

    // Map profiles to directory entries
    const knownWorkerKeys = new Set<string>();
    const fieldWorkers = profiles.map((p) => {
      const fullName = `${p.firstName} ${p.lastName || ''}`.trim();
      const emailLower = (p.googleEmail || '').toLowerCase();
      const nameLower = fullName.toLowerCase();

      knownWorkerKeys.add(emailLower);
      knownWorkerKeys.add(nameLower);

      const emailStats = statsByWorker.get(emailLower);
      const nameStats = statsByWorker.get(nameLower);

      const submissionCount = Math.max(emailStats?.count || 0, nameStats?.count || 0);
      const lastSubmission =
        (emailStats?.lastSubmissionTime || '') > (nameStats?.lastSubmissionTime || '')
          ? emailStats?.lastSubmissionTime
          : nameStats?.lastSubmissionTime;

      return {
        id: p.id,
        googleSub: p.googleSub,
        email: p.googleEmail,
        name: fullName,
        assignedState: p.assignedState,
        assignedDistrict: p.assignedDistrict,
        srName: p.srName || '',
        ssrName: p.ssrName || '',
        status: p.status || 'ACTIVE',
        onboardedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        totalSubmissions: submissionCount,
        lastSubmittedAt: lastSubmission || null,
      };
    });

    // Also include active caseworkers from submissions whose profiles were onboarded before the current store
    const extraWorkersMap = new Map<string, { name: string; state: string; district: string; count: number; lastSubmittedAt: string }>();

    for (const sub of submissions) {
      const submitter = (sub.submittedBy || sub.interviewerName || '').trim();
      if (!submitter) continue;

      const subLower = submitter.toLowerCase();
      if (!knownWorkerKeys.has(subLower)) {
        const existing = extraWorkersMap.get(subLower);
        const subTime = sub.submissionTime || '';
        if (existing) {
          existing.count += 1;
          if (subTime > existing.lastSubmittedAt) existing.lastSubmittedAt = subTime;
        } else {
          extraWorkersMap.set(subLower, {
            name: submitter,
            state: sub.state || effectiveState || '',
            district: sub.district || '',
            count: 1,
            lastSubmittedAt: subTime,
          });
        }
      }
    }

    for (const [key, extra] of extraWorkersMap.entries()) {
      fieldWorkers.push({
        id: `legacy-${Buffer.from(key).toString('hex').slice(0, 12)}`,
        googleSub: '',
        email: key.includes('@') ? key : '',
        name: extra.name,
        assignedState: extra.state,
        assignedDistrict: extra.district,
        srName: '',
        ssrName: '',
        status: 'ACTIVE',
        onboardedAt: extra.lastSubmittedAt || null,
        totalSubmissions: extra.count,
        lastSubmittedAt: extra.lastSubmittedAt || null,
      });
    }

    // Sort by total submissions desc, then name asc
    fieldWorkers.sort((a, b) => b.totalSubmissions - a.totalSubmissions || a.name.localeCompare(b.name));

    return NextResponse.json(
      {
        status: 'success',
        data: {
          fieldWorkers,
          totalCount: fieldWorkers.length,
          stateScope: effectiveState || 'All States',
          viewer: {
            userId: scope.userId,
            name: scope.name,
            role: scope.role,
          },
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: any) {
    console.error('GET /api/supervisor/field-workers error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Internal server error while fetching field workers directory.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
