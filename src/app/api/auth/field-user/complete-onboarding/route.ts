import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  verifyOnboardingTicket,
  extractOnboardingTicketCookie,
  clearOnboardingTicketCookie,
} from '@/lib/server/googleAuth';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { createSessionToken, setSessionCookie } from '@/lib/server/sessionService';
import { validateMutationOrigin } from '@/lib/server/authorisation';

export async function POST(req: NextRequest) {
  const originCheck = validateMutationOrigin(req);
  if (!originCheck.valid) {
    return NextResponse.json(
      { status: 'error', error: originCheck.reason || 'Cross-site request rejected' },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Malformed JSON payload' }, { status: 400 });
  }

  const { firstName, lastName, state, district, invitationCode, srName, ssrName, email } = body || {};

  const ticketCookie = extractOnboardingTicketCookie(req);
  const ticket = verifyOnboardingTicket(ticketCookie);

  if (!ticket && !invitationCode?.trim()) {
    return NextResponse.json(
      {
        status: 'error',
        error: 'Your onboarding session has expired. Please sign in or provide a valid state-team invitation code.',
      },
      { status: 401 }
    );
  }

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

  // Rate limit: 10 attempts per 15 minutes to prevent brute forcing codes
  const rateLimitKey = ticket
    ? `field-onboarding-attempt:${ticket.googleSub}`
    : `field-onboarding-attempt:inv:${invitationCode.trim().toUpperCase()}`;

  const rateCheck = await store.checkRateLimit(
    rateLimitKey,
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
  const finalSrName = typeof srName === 'string' ? srName.trim() : '';
  const finalSsrName = typeof ssrName === 'string' ? ssrName.trim() : '';

  const googleSub = ticket
    ? ticket.googleSub
    : `direct_inv_${invitation.id}_${crypto.randomBytes(4).toString('hex')}`;

  const googleEmail = ticket
    ? ticket.googleEmail
    : (email && typeof email === 'string' && email.includes('@')
        ? email.trim().toLowerCase()
        : `${finalFirstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${invitation.id.slice(0, 6)}@allianceindia.local`);

  const profile = await store.createFieldUserProfile({
    googleSub,
    googleEmail,
    firstName: finalFirstName,
    lastName: finalLastName,
    assignedState: invitation.state,
    assignedDistrict: district.trim(),
    invitationId: invitation.id,
    srName: finalSrName,
    ssrName: finalSsrName,
  });

  // Issue session token bound to FIELD_USER role
  const sessionToken = createSessionToken({
    userId: profile.id,
    username: profile.googleEmail,
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    role: 'FIELD_USER',
    allowedStates: [profile.assignedState],
    allowedDistricts: [profile.assignedDistrict],
    srName: profile.srName,
    ssrName: profile.ssrName,
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
        srName: profile.srName,
        ssrName: profile.ssrName,
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

  clearOnboardingTicketCookie(response, req);
  setSessionCookie(response, sessionToken, req);

  return response;
}
