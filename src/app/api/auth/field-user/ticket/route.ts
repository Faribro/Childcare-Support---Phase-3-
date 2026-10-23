import { NextRequest, NextResponse } from 'next/server';
import { verifyOnboardingTicket, ONBOARDING_TICKET_COOKIE } from '@/lib/server/googleAuth';

export async function GET(req: NextRequest) {
  const ticketCookie = req.cookies.get(ONBOARDING_TICKET_COOKIE)?.value;
  const ticket = verifyOnboardingTicket(ticketCookie);

  if (!ticket) {
    return NextResponse.json(
      {
        status: 'success',
        hasTicket: false,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      status: 'success',
      hasTicket: true,
      data: {
        googleEmail: ticket.googleEmail,
        firstName: ticket.firstName,
        lastName: ticket.lastName,
      },
    },
    { status: 200 }
  );
}
