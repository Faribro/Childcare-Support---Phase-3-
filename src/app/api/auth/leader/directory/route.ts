import { NextRequest, NextResponse } from 'next/server';
import { getPublicDirectoryLeaders } from '@/lib/server/leaderIdentityStore';
import { isLeadershipEmailAuthEnabled } from '@/lib/server/leaderAuthChallenge';
import { resolveUserAccessScope } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isLeadershipEmailAuthEnabled()) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'FEATURE_DISABLED',
        message: 'Leadership email authentication is not enabled on this environment.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    );
  }

  // Require approved organizational session boundary: unauthenticated callers CANNOT enumerate leaders!
  const scope = await resolveUserAccessScope(req);
  if (!scope.isVerified) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Authentication required to view directory.',
      },
      {
        status: 401,
        headers: {
          'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    );
  }

  const leaders = getPublicDirectoryLeaders();

  return NextResponse.json(
    {
      status: 'success',
      data: leaders,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
        Pragma: 'no-cache',
      },
    }
  );
}
