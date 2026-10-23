import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as registerHandler } from '@/app/api/auth/state-team/register/route';
import { POST as verifyOtpHandler } from '@/app/api/auth/state-team/verify-otp/route';
import { POST as issueInvitationHandler } from '@/app/api/auth/state-team/invitation/issue/route';
import { GET as ticketHandler } from '@/app/api/auth/field-user/ticket/route';
import { POST as completeOnboardingHandler } from '@/app/api/auth/field-user/complete-onboarding/route';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import { signOnboardingTicket, ONBOARDING_TICKET_COOKIE } from '@/lib/server/googleAuth';
import { issueStateTeamOtpChallenge } from '@/lib/server/stateTeamAuthChallenge';
import { createSessionToken } from '@/lib/server/sessionService';

describe('Onboarding Next.js HTTP API Route Handlers', () => {
  let store: MemoryOnboardingStore;

  beforeEach(() => {
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
  });

  describe('POST /api/auth/state-team/register', () => {
    it('returns 400 when required fields are missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/state-team/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Test' }),
      });

      const res = await registerHandler(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.status).toBe('error');
      expect(json.error).toMatch(/valid work email/i);
    });

    it('returns 200 and triggers email OTP for valid state team staff', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/state-team/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Kailash',
          lastName: '', // Single-name support
          workEmail: 'kailash@allianceindia.org',
          requestedState: 'Maharashtra',
          organization: 'Alliance India MH State Office',
        }),
      });

      const res = await registerHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.message).toMatch(/verification code sent/i);
    });
  });

  describe('POST /api/auth/state-team/verify-otp', () => {
    it('verifies OTP and sets evaluation_session_token cookie for approved coordinator', async () => {
      // 1. Issue challenge
      const issue = await issueStateTeamOtpChallenge({
        firstName: 'Meenakshi',
        lastName: 'Sundaram',
        workEmail: 'meenakshi@allianceindia.org',
        requestedState: 'Tamil Nadu',
        organization: 'Alliance India TN',
      });

      expect(issue.success).toBe(true);

      // 2. Call HTTP verify endpoint
      const req = new NextRequest('http://localhost:3000/api/auth/state-team/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'meenakshi@allianceindia.org',
          otp: issue.otp,
        }),
      });

      const res = await verifyOtpHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.data.session).toBeDefined();
      expect(json.data.session.role).toBe('STATE_REVIEWER');
      expect(json.data.session.allowedStates).toEqual(['Tamil Nadu']);

      // Check cookie header
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('evaluation_session_token=');
    });
  });

  describe('POST /api/auth/state-team/invitation/issue', () => {
    it('issues invitation and dispatches email without exposing plaintext code in response', async () => {
      const reg = await store.createStateTeamRegistration({
        firstName: 'Alok',
        lastName: 'Nath',
        workEmail: 'alok@allianceindia.org',
        requestedState: 'Delhi',
        organization: 'Alliance India',
        autoApprove: true,
      });

      const sessionToken = createSessionToken({
        userId: reg.id,
        username: reg.workEmail,
        name: 'Alok Nath',
        role: 'STATE_REVIEWER',
        allowedStates: ['Delhi'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/auth/state-team/invitation/issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `evaluation_session_token=${sessionToken}`,
        },
        body: JSON.stringify({ state: 'Delhi' }),
      });

      const res = await issueInvitationHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.data.invitationId).toBeDefined();
      expect(json.data.state).toBe('Delhi');
      // Crucial security invariant: plaintext code is NOT in response JSON
      expect(json.data.plainInvitationCode).toBeUndefined();
      expect(json.data.code).toBeUndefined();
    });
  });

  describe('GET /api/auth/field-user/ticket', () => {
    it('returns hasTicket: false when no ticket cookie is present', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/ticket');
      const res = await ticketHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.hasTicket).toBe(false);
    });

    it('returns verified Google ticket data when ticket cookie is present', async () => {
      const signedTicket = signOnboardingTicket({
        googleSub: 'gsub-98765',
        googleEmail: 'field.volunteer@gmail.com',
        firstName: 'Asha',
        lastName: 'Devi',
      });

      const req = new NextRequest('http://localhost:3000/api/auth/field-user/ticket', {
        headers: {
          cookie: `${ONBOARDING_TICKET_COOKIE}=${signedTicket}`,
        },
      });

      const res = await ticketHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.hasTicket).toBe(true);
      expect(json.data.googleEmail).toBe('field.volunteer@gmail.com');
      expect(json.data.firstName).toBe('Asha');
      expect(json.data.lastName).toBe('Devi');
    });
  });

  describe('POST /api/auth/field-user/complete-onboarding', () => {
    it('validates ticket and invitation code, creates profile, and issues FIELD_USER session token', async () => {
      // 1. Create approved state team and active invitation
      const reg = await store.createStateTeamRegistration({
        firstName: 'Suraj',
        lastName: 'Bhan',
        workEmail: 'suraj@allianceindia.org',
        requestedState: 'Rajasthan',
        organization: 'Alliance India',
        autoApprove: true,
      });

      const { issueStateTeamInvitation } = await import('@/lib/server/stateTeamAuthChallenge');
      const inv = await issueStateTeamInvitation({ stateTeamId: reg.id });

      // 2. Create signed ticket cookie
      const signedTicket = signOnboardingTicket({
        googleSub: 'gsub-caseworker-rj-01',
        googleEmail: 'caseworker.rj@gmail.com',
        firstName: 'Pooja',
        lastName: '', // Single-name caseworker
      });

      // 3. Submit complete onboarding
      const req = new NextRequest('http://localhost:3000/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${ONBOARDING_TICKET_COOKIE}=${signedTicket}`,
        },
        body: JSON.stringify({
          firstName: 'Pooja',
          lastName: '',
          state: 'Rajasthan',
          district: 'Jaipur',
          invitationCode: inv.plainInvitationCode,
        }),
      });

      const res = await completeOnboardingHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.data.profile.firstName).toBe('Pooja');
      expect(json.data.profile.lastName).toBe('');
      expect(json.data.profile.assignedState).toBe('Rajasthan');
      expect(json.data.profile.assignedDistrict).toBe('Jaipur');
      expect(json.data.session.role).toBe('FIELD_USER');
      expect(json.redirectUrl).toBe('/assessment/new');

      // Check session cookie issued
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('evaluation_session_token=');
    });
  });
});
