/**
 * Google OAuth 2.0 Integration & Field Onboarding Ticket Engine
 *
 * Invariants:
 * - Minimal scope: openid, email, profile only (zero Google Drive/Gmail scopes requested)
 * - HMAC-signed CSRF state parameter preventing login CSRF
 * - Signed, short-lived onboarding tickets for carrying Google identity to profile completion
 * - Returning users with completed profiles are immediately logged in to /assessment/new
 * - First-time users receive signed onboarding ticket cookie and continue to Welcome Kite
 * - Cancellation safely returns to /app?auth_cancelled=1 without record creation
 * - Zero role escalation: Google accounts are assigned FIELD_USER role strictly
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSecret } from './sessionService';
import { getOnboardingStore } from './onboardingStore';
import type { FieldUserProfile } from '@/lib/types/onboarding';

export const GOOGLE_AUTH_COOKIE_STATE = 'google_oauth_state';
export const ONBOARDING_TICKET_COOKIE = 'field_onboarding_ticket';
export const ONBOARDING_TICKET_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface OnboardingTicketPayload {
  googleSub: string;
  googleEmail: string;
  firstName: string;
  lastName: string;
  picture?: string;
  createdAt: number;
  expiresAt: number;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}

/**
 * Signs an OAuth state string with HMAC-SHA256.
 */
export function signOAuthState(data: { nonce: string; returnTo: string; timestamp: number }): string {
  const secret = getSessionSecret();
  const raw = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

/**
 * Verifies signed OAuth state parameter.
 */
export function verifyOAuthState(stateToken: string): { nonce: string; returnTo: string } | null {
  if (!stateToken || !stateToken.includes('.')) return null;
  const [raw, sig] = stateToken.split('.');

  try {
    const secret = getSessionSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(raw).digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
    // Expire state after 15 minutes
    if (Date.now() - payload.timestamp > 15 * 60 * 1000) {
      return null;
    }

    return { nonce: payload.nonce, returnTo: payload.returnTo };
  } catch {
    return null;
  }
}

/**
 * Signs a short-lived onboarding ticket carrying verified Google identity.
 */
export function signOnboardingTicket(payload: {
  googleSub: string;
  googleEmail: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
}): string {
  const secret = getSessionSecret();
  const now = Date.now();
  const ticket: OnboardingTicketPayload = {
    googleSub: payload.googleSub,
    googleEmail: payload.googleEmail.trim().toLowerCase(),
    firstName: (payload.firstName || '').trim(),
    lastName: (payload.lastName || '').trim(),
    picture: payload.picture,
    createdAt: now,
    expiresAt: now + ONBOARDING_TICKET_TTL_MS,
  };

  const raw = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

/**
 * Verifies signed onboarding ticket from cookie.
 */
export function verifyOnboardingTicket(ticketString?: string | null): OnboardingTicketPayload | null {
  if (!ticketString || !ticketString.includes('.')) return null;
  const [raw, sig] = ticketString.split('.');

  try {
    const secret = getSessionSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(raw).digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const ticket: OnboardingTicketPayload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
    if (!ticket.expiresAt || Date.now() > ticket.expiresAt) {
      return null;
    }

    return ticket;
  } catch {
    return null;
  }
}

/**
 * Builds the canonical Google OAuth 2.0 authorization URL.
 */
export function buildGoogleAuthUrl(req: NextRequest, returnTo: string = '/assessment/new'): {
  authUrl: string;
  stateToken: string;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id';
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

  const nonce = crypto.randomBytes(16).toString('hex');
  const stateToken = signOAuthState({ nonce, returnTo, timestamp: Date.now() });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', stateToken);
  authUrl.searchParams.set('prompt', 'select_account');

  return { authUrl: authUrl.toString(), stateToken };
}

/**
 * Exchanges Google authorization code for user info.
 * In test/synthetic mode, accepts mock tokens if configured.
 */
export async function exchangeGoogleCodeForUser(
  code: string,
  req: NextRequest
): Promise<{ success: boolean; user?: GoogleUserInfo; error?: string }> {
  // Synthetic testing mode for automated test suites
  if (
    process.env.NODE_ENV === 'test' ||
    (process.env.NODE_ENV !== 'production' && process.env.ENABLE_MOCK_GOOGLE_AUTH === 'true')
  ) {
    if (code.startsWith('mock-google-code:')) {
      const parts = code.replace('mock-google-code:', '').split(':');
      const email = parts[0] || 'caseworker@example.com';
      const customSub = parts.find((p) => p.startsWith('google-sub-'));
      const sub = customSub || `google-sub-${crypto.createHash('md5').update(email).digest('hex')}`;
      const name = parts.find((p) => !p.startsWith('google-sub-') && p !== email) || 'Caseworker Test';
      return {
        success: true,
        user: {
          sub,
          email,
          email_verified: true,
          given_name: name.split(' ')[0] || 'Field',
          family_name: name.split(' ').slice(1).join(' ') || '',
          name,
        },
      };
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error: 'Google OAuth is not configured on this environment (missing client credentials).',
    };
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[Google OAuth Error] Token exchange failed:', errBody);
      return { success: false, error: 'Failed to authenticate with Google identity provider.' };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch verified user profile
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      return { success: false, error: 'Failed to retrieve profile information from Google.' };
    }

    const userInfo: GoogleUserInfo = await userInfoRes.json();

    if (!userInfo.email_verified) {
      return { success: false, error: 'Google account email is not verified.' };
    }

    return { success: true, user: userInfo };
  } catch (err: any) {
    console.error('[Google OAuth Exception]:', err?.message);
    return { success: false, error: 'Network error communicating with Google OAuth service.' };
  }
}

/**
 * Test & Integration Helper Aliases
 */
export const generateGoogleAuthUrl = (returnTo?: string) => {
  const req = new NextRequest('http://localhost:3000/api/auth/google/login');
  const res = buildGoogleAuthUrl(req, returnTo);
  return { url: res.authUrl, state: res.stateToken };
};

export const signFieldOnboardingTicket = signOnboardingTicket;
export const verifyFieldOnboardingTicket = verifyOnboardingTicket;

export async function verifyGoogleAuthCallback(code: string): Promise<{
  success: boolean;
  existingProfile?: FieldUserProfile | null;
  userInfo?: GoogleUserInfo;
  error?: string;
}> {
  const req = new NextRequest('http://localhost:3000/api/auth/google/callback');
  const exchange = await exchangeGoogleCodeForUser(code, req);
  if (!exchange.success || !exchange.user) {
    return { success: false, error: exchange.error };
  }
  const store = getOnboardingStore();
  const existingProfile = await store.getFieldUserProfileByGoogleSub(exchange.user.sub);
  return {
    success: true,
    existingProfile,
    userInfo: exchange.user,
  };
}
