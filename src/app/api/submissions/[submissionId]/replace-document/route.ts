import { NextRequest, NextResponse } from 'next/server';
import { PUT as handleAssetPut } from '../asset/route';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * POST /api/submissions/[submissionId]/replace-document
 *
 * Dedicated alias endpoint for Thread 07 (Field Intake UI / Device Acceptance).
 * Replaces an uploaded document asset using two-phase commit with OCC revision guard.
 */
export async function POST(
  req: NextRequest,
  context: { params: { submissionId: string } }
) {
  return handleAssetPut(req, context);
}
