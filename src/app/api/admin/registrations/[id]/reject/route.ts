import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessScope, validateMutationOrigin, logSecurityEvent } from '@/lib/server/authorisation';
import { getOnboardingStore } from '@/lib/server/onboardingStore';

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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const store = getOnboardingStore();
  const registration = await store.getStateTeamRegistrationById(registrationId);

  if (!registration) {
    return NextResponse.json(
      { status: 'error', error: 'Registration record not found.' },
      { status: 404 }
    );
  }

  const rejectorIdentifier = scope.name ? `${scope.name} (${scope.userId})` : scope.userId;
  const reason = body?.reason || 'Registration rejected by programme administrator';

  const rejected = await store.rejectStateTeamRegistration(registrationId, rejectorIdentifier, reason);

  if (!rejected) {
    return NextResponse.json(
      { status: 'error', error: 'Failed to update registration status in store.' },
      { status: 500 }
    );
  }

  logSecurityEvent({
    actor: scope.userId,
    actorRole: scope.role,
    eventType: 'APPROVAL_CHANGED',
    targetResource: `state_team_registration:${registrationId}`,
    scope: registration.requestedState,
    outcome: 'DENY',
    details: `Coordinator registration rejected by ${rejectorIdentifier}: ${reason}`,
  });

  const updated = await store.getStateTeamRegistrationById(registrationId);

  return NextResponse.json(
    {
      status: 'success',
      message: `Registration for ${registration.workEmail} rejected.`,
      data: {
        registration: updated,
      },
    },
    { status: 200 }
  );
}
