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
import { verifyMobileTicket, validateAndFormatIndianMobile } from '@/lib/server/phoneValidation';
import { verifyEmailTicket } from '@/lib/server/fieldEmailOtpChallenge';

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

  const { firstName, lastName, state, district, invitationCode, srName, ssrName, email, emailTicket, mobileNumber, mobileTicket } = body || {};

  let verifiedEmail: string | undefined = undefined;
  if (emailTicket) {
    const emailTicketCheck = verifyEmailTicket(emailTicket);
    if (emailTicketCheck.valid && emailTicketCheck.email) {
      verifiedEmail = emailTicketCheck.email;
    }
  } else if (email && typeof email === 'string' && email.includes('@')) {
    verifiedEmail = email.trim().toLowerCase();
  }

  let verifiedMobile: string | undefined = undefined;
  let isMobileVerified = false;

  if (mobileTicket) {
    const ticketCheck = verifyMobileTicket(mobileTicket);
    if (!ticketCheck.valid || !ticketCheck.mobile) {
      return NextResponse.json(
        { status: 'error', error: ticketCheck.error || 'Invalid or expired mobile verification ticket. Please verify your phone number via OTP again.' },
        { status: 400 }
      );
    }
    verifiedMobile = ticketCheck.mobile;
    isMobileVerified = true;
  } else if (mobileNumber && typeof mobileNumber === 'string') {
    const phoneCheck = validateAndFormatIndianMobile(mobileNumber);
    if (phoneCheck.valid && phoneCheck.canonical) {
      verifiedMobile = phoneCheck.canonical;
    }
  }

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
    : (verifiedEmail || `${finalFirstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${invitation.id.slice(0, 6)}@allianceindia.local`);

  const profile = await store.createFieldUserProfile({
    googleSub,
    googleEmail,
    mobileNumber: verifiedMobile,
    isMobileVerified,
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

  const safeProfile = {
    id: profile.id,
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    firstName: profile.firstName,
    lastName: profile.lastName,
    assignedState: profile.assignedState,
    assignedDistrict: profile.assignedDistrict,
    googleEmail: profile.googleEmail,
    maskedMobile: profile.mobileNumber ? `+91 ******${profile.mobileNumber.slice(-4)}` : undefined,
    srName: profile.srName,
    ssrName: profile.ssrName,
  };

  const response = NextResponse.json(
    {
      status: 'success',
      message: 'Onboarding completed successfully. Welcome to Childcare Support!',
      redirectUrl: '/assessment/new',
      profile: safeProfile,
      data: {
        profile: safeProfile,
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
