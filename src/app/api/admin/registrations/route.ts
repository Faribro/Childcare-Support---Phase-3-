import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessScope } from '@/lib/server/authorisation';
import { getOnboardingStore } from '@/lib/server/onboardingStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const scope = await resolveUserAccessScope(req);

  if (!scope.isVerified) {
    return NextResponse.json(
      { status: 'error', error: 'Authentication required to access administrator review.' },
      { status: 401 }
    );
  }

  if (scope.role !== 'ADMIN' && scope.role !== 'LEADERSHIP') {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: Administrator privileges required.' },
      { status: 403 }
    );
  }

  const store = getOnboardingStore();
  const registrations = await store.listStateTeamRegistrations();

  const sanitized = registrations.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    workEmail: r.workEmail,
    requestedState: r.requestedState,
    organization: r.organization,
    status: r.status,
    emailVerified: r.emailVerified,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt,
    notes: r.notes,
  }));

  return NextResponse.json(
    {
      status: 'success',
      data: {
        registrations: sanitized,
        viewer: {
          userId: scope.userId,
          name: scope.name,
          role: scope.role,
        },
      },
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
        Pragma: 'no-cache',
      },
    }
  );
}
