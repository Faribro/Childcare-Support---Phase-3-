import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/sessionService';
import { validateCsrfOrigin } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Enforce CSRF Origin validation on logout
  const csrf = validateCsrfOrigin(req);
  if (!csrf.isValid) {
    return NextResponse.json(
      { status: 'error', code: 'CSRF_VIOLATION', message: csrf.reason || 'Forbidden request origin.' },
      { status: 403 }
    );
  }

  const response = NextResponse.json({
    status: 'success',
    message: 'Signed out successfully.',
  });
  clearSessionCookie(response);
  return response;
}
