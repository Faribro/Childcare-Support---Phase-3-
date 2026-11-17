import { NextRequest, NextResponse } from 'next/server';
import {
  verifyOnboardingTicket,
  extractOnboardingTicketCookie,
  isGoogleOAuthConfigured,
  NO_STORE_CACHE_HEADERS,
} from '@/lib/server/googleAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const isGoogleConfigured = isGoogleOAuthConfigured();
  const ticketCookie = extractOnboardingTicketCookie(req);
  const ticket = verifyOnboardingTicket(ticketCookie);

  if (!ticket) {
    return NextResponse.json(
      {
        status: 'success',
        hasTicket: false,
        isGoogleConfigured,
      },
      { status: 200, headers: NO_STORE_CACHE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      status: 'success',
      hasTicket: true,
      isGoogleConfigured,
      data: {
        googleEmail: ticket.googleEmail,
        firstName: ticket.firstName,
        lastName: ticket.lastName,
      },
    },
    { status: 200, headers: NO_STORE_CACHE_HEADERS }
  );
}
