import { NextRequest, NextResponse } from 'next/server';
import {
  verifyOnboardingTicket,
  ONBOARDING_TICKET_COOKIE,
} from '@/lib/server/googleAuth';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { createSessionToken } from '@/lib/server/sessionService';
import { validateMutationOrigin } from '@/lib/server/authorisation';

const SESSION_COOKIE_NAME = 'evaluation_session_token';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export async function POST(req: NextRequest) {
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', error: originCheck.reason || 'Cross-site request rejected' },
      { status: 403 }
    );
  }

  const ticketCookie = req.cookies.get(ONBOARDING_TICKET_COOKIE)?.value;
  const ticket = verifyOnboardingTicket(ticketCookie);

  if (!ticket) {
    return NextResponse.json(
      {
        status: 'error',
        error: 'Your onboarding session has expired. Please sign in with Google again.',
      },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Malformed JSON payload' }, { status: 400 });
  }

  const { firstName, lastName, state, district, invitationCode } = body || {};

  if (!firstName?.trim()) {
    return NextResponse.json({ status: 'error', error: 'First name is required.' }, { status: 400 });
  }
  if (!state?.trim()) {
    return NextResponse.json({ status: 'error', error: 'State selection is required.' }, { status: 400 });
  }
  if (!district?.trim()) {
    return NextResponse.json({ status: 'error', error: 'District selection is required.' }, { status: 400 });
  }
  if (!invitationCode?.trim()) {
    return NextResponse.json(
      { status: 'error', error: 'State team invitation code is required.' },
      { status: 400 }
    );
  }

  const store = getOnboardingStore();
  const now = Date.now();

  // Rate limit: 10 attempts per 15 minutes per googleSub to prevent brute forcing codes
  const rateCheck = await store.checkRateLimit(
    `field-onboarding-attempt:${ticket.googleSub}`,
    now,
    10,
    15 * 60 * 1000
  );
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        status: 'error',
        error: `Too many redemption attempts. Please wait ${rateCheck.retryAfterSeconds} seconds.`,
      },
      { status: 429 }
    );
  }

  // Validate the invitation code against the requested state
  const validation = await store.findAndValidateInvitation(invitationCode, state, now);
  if (!validation.valid || !validation.invitation) {
    return NextResponse.json(
      { status: 'error', error: validation.error || 'Invalid invitation code.' },
      { status: validation.statusCode || 400 }
    );
  }

  const invitation = validation.invitation;

  // Atomically increment redemption count
  const redemption = await store.atomicRedeemInvitation(invitation.id);
  if (!redemption.success) {
    return NextResponse.json(
      {
        status: 'error',
        error: redemption.error || 'Invitation code has reached maximum redemption capacity.',
      },
      { status: 429 }
    );
  }

  // Create persistent field user profile
  // Note: assignedState is derived from the verified invitation, NOT client state override!
  const finalFirstName = firstName.trim();
  const finalLastName = (lastName || '').trim();

  const profile = await store.createFieldUserProfile({
    googleSub: ticket.googleSub,
    googleEmail: ticket.googleEmail,
    firstName: finalFirstName,
    lastName: finalLastName,
    assignedState: invitation.state,
    assignedDistrict: district.trim(),
    invitationId: invitation.id,
  });

  // Issue session token bound to FIELD_USER role
  const sessionToken = createSessionToken({
    userId: profile.id,
    username: profile.googleEmail,
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    role: 'FIELD_USER',
    allowedStates: [profile.assignedState],
    allowedDistricts: [profile.assignedDistrict],
  });

  const response = NextResponse.json(
    {
      status: 'success',
      message: 'Onboarding completed successfully. Welcome to Childcare Support!',
      redirectUrl: '/assessment/new',
      profile: {
        id: profile.id,
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        assignedState: profile.assignedState,
        assignedDistrict: profile.assignedDistrict,
      },
      data: {
        profile,
        session: {
          role: 'FIELD_USER',
          token: sessionToken,
        },
      },
    },
    { status: 200 }
  );

  const isProduction = process.env.NODE_ENV === 'production';

  // Clear onboarding ticket cookie
  response.cookies.delete(ONBOARDING_TICKET_COOKIE);

  // Set session cookie
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return response;
}
