import { NextResponse } from 'next/server';
import {
  getPublicDirectoryLeaders,
} from '@/lib/server/leaderIdentityStore';
import { isLeadershipEmailAuthEnabled } from '@/lib/server/leaderAuthChallenge';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isLeadershipEmailAuthEnabled()) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'FEATURE_DISABLED',
        message: 'Leadership email authentication is not enabled on this environment.',
      },
      { status: 403 }
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
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  );
}
