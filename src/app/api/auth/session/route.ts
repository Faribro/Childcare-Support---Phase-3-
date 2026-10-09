import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessScope } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const scope = resolveUserAccessScope(req);
  return NextResponse.json({
    status: 'success',
    data: {
      userId: scope.userId,
      name: scope.name,
      role: scope.role,
      allowedStates: scope.allowedStates,
      allowedDistricts: scope.allowedDistricts,
      isVerified: scope.isVerified,
    },
  });
}
