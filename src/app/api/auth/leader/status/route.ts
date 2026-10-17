import { NextResponse } from 'next/server';
import { getLeadershipAuthPolicyStatus } from '@/lib/server/leadershipAuthPolicy';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

/**
 * GET /api/auth/leader/status
 * Runtime status check for Leadership email authentication availability and policy.
 * Returns dynamic configuration without client-side guessing.
 */
export async function GET() {
  const status = getLeadershipAuthPolicyStatus();

  return NextResponse.json(
    {
      status: 'success',
      data: status,
    },
    {
      status: 200,
      headers: NO_STORE_HEADERS,
    }
  );
}
