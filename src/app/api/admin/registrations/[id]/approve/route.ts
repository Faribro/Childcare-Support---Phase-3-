import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessScope, validateMutationOrigin, logSecurityEvent } from '@/lib/server/authorisation';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { sendCoordinatorApprovalNotificationEmail } from '@/lib/server/emailProvider';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. CSRF Protection
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', error: originCheck.reason || 'Cross-site mutation rejected.' },
      { status: 403 }
    );
  }

  // 2. Authentication & Administrator Authorization
  const scope = await resolveUserAccessScope(req);
  if (!scope.isVerified) {
    return NextResponse.json(
      { status: 'error', error: 'Authentication required.' },
      { status: 401 }
    );
  }

  if (scope.role !== 'ADMIN' && scope.role !== 'LEADERSHIP') {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: Administrator privileges required.' },
      { status: 403 }
    );
  }

  const registrationId = params.id;
  if (!registrationId) {
    return NextResponse.json(
      { status: 'error', error: 'Registration ID is required.' },
      { status: 400 }
    );
  }

  const store = getOnboardingStore();
  const registration = await store.getStateTeamRegistrationById(registrationId);

  if (!registration) {
    return NextResponse.json(
      { status: 'error', error: 'Registration record not found.' },
      { status: 404 }
    );
  }

  // 3. Security Invariant: Require email verification before approval
  if (!registration.emailVerified) {
    return NextResponse.json(
      {
        status: 'error',
        error: 'Cannot approve registration: Email verification has not been completed by the applicant.',
      },
      { status: 400 }
    );
  }

  // 4. Security Invariant: Preserve suspension/rejection rules
  if (registration.status === 'SUSPENDED') {
    return NextResponse.json(
      {
        status: 'error',
        error: 'Suspended registration cannot be approved directly without formal administrative reinstatement.',
      },
      { status: 403 }
    );
  }

  if (registration.status === 'REJECTED') {
    return NextResponse.json(
      {
        status: 'error',
        error: 'Rejected registration cannot be re-approved directly.',
      },
      { status: 403 }
    );
  }

  // 5. Optional server-assigned state override supplied by Administration
  let body: any = null;
  try {
    body = await req.json().catch(() => null);
  } catch {
    body = null;
  }
  const requestedAssignedState =
    typeof body?.assignedState === 'string' && body.assignedState.trim()
      ? body.assignedState.trim()
      : typeof body?.state === 'string' && body.state.trim()
        ? body.state.trim()
        : undefined;
  const effectiveState = requestedAssignedState || registration.assignedState || registration.requestedState;

  // 6. Approve registration with server-assigned state scope
  const approverIdentifier = scope.name ? `${scope.name} (${scope.userId})` : scope.userId;
  const approved = await store.approveStateTeamRegistration(registrationId, approverIdentifier, effectiveState);

  if (!approved) {
    return NextResponse.json(
      { status: 'error', error: 'Failed to update registration status in store.' },
      { status: 500 }
    );
  }

  // 7. Record security audit event
  logSecurityEvent({
    actor: scope.userId,
    actorRole: scope.role,
    eventType: 'APPROVAL_CHANGED',
    targetResource: `state_team_registration:${registrationId}`,
    scope: effectiveState,
    outcome: 'ALLOW',
    details: `Coordinator registration approved by ${approverIdentifier} for state: ${effectiveState}`,
  });

  // 8. Dispatch approval notification to coordinator
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://childcare-support-phase-3.vercel.app';
  try {
    await sendCoordinatorApprovalNotificationEmail({
      coordinatorEmail: registration.workEmail,
      coordinatorName: `${registration.firstName} ${registration.lastName}`.trim(),
      state: effectiveState,
      portalUrl: appUrl,
    });
  } catch (err: any) {
    console.error('[ADMIN_APPROVE:WARN] Failed to send approval email to coordinator:', err?.message);
  }

  const updated = await store.getStateTeamRegistrationById(registrationId);

  return NextResponse.json(
    {
      status: 'success',
      message: `Registration for ${registration.workEmail} successfully approved for ${effectiveState}.`,
      data: {
        registration: updated,
      },
    },
    { status: 200 }
  );
}
