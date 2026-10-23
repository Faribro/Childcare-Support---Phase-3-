import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateGoogleAuthUrl,
  verifyGoogleAuthCallback,
  signFieldOnboardingTicket,
  verifyFieldOnboardingTicket,
} from '@/lib/server/googleAuth';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import { issueStateTeamInvitation } from '@/lib/server/stateTeamAuthChallenge';
import { verifySessionToken } from '@/lib/server/sessionService';

describe('Field User Onboarding & Returning User Lifecycle', () => {
  let store: MemoryOnboardingStore;

  beforeEach(() => {
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
  });

  describe('Google OAuth & Onboarding Ticket Signing', () => {
    it('generates secure Google OAuth URL with minimal openid email profile scopes and CSRF state', () => {
      const auth = generateGoogleAuthUrl('/assessment/new');
      expect(auth.url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(auth.url).toContain('scope=openid+email+profile');
      expect(auth.state).toBeDefined();
    });

    it('creates and cryptographically verifies HMAC signed onboarding ticket', () => {
      const ticket = signFieldOnboardingTicket({
        googleSub: 'google-sub-12345',
        googleEmail: 'caseworker@gmail.com',
        firstName: 'Meera',
        lastName: 'Bai',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
      });

      expect(ticket).toBeDefined();

      const verified = verifyFieldOnboardingTicket(ticket);
      expect(verified).not.toBeNull();
      expect(verified?.googleSub).toBe('google-sub-12345');
      expect(verified?.googleEmail).toBe('caseworker@gmail.com');
      expect(verified?.firstName).toBe('Meera');
      expect(verified?.lastName).toBe('Bai');
    });

    it('rejects tampered or forged onboarding tickets', () => {
      const ticket = signFieldOnboardingTicket({
        googleSub: 'google-sub-12345',
        googleEmail: 'caseworker@gmail.com',
        firstName: 'Meera',
        lastName: 'Bai',
      });

      // Tamper signature
      const tampered = ticket.substring(0, ticket.length - 4) + 'abcd';
      const verified = verifyFieldOnboardingTicket(tampered);
      expect(verified).toBeNull();
    });
  });

  describe('First-Time Field User Onboarding Completion', () => {
    it('successfully redeems state invitation and creates field user profile with single name support', async () => {
      // 1. Setup approved state team & active invitation
      const reg = await store.createStateTeamRegistration({
        firstName: 'Vijay',
        lastName: 'Mhatre',
        workEmail: 'vijay@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India',
        autoApprove: true,
      });

      const inv = await issueStateTeamInvitation({ stateTeamId: reg.id });
      expect(inv.success).toBe(true);

      // 2. Simulate new field user redeeming code
      const validate = await store.findAndValidateInvitation(inv.plainInvitationCode, 'Maharashtra');
      expect(validate.valid).toBe(true);

      const redeem = await store.redeemInvitation(validate.invitation!.id, inv.plainInvitationCode);
      expect(redeem.success).toBe(true);
      expect(redeem.invitation?.redemptionCount).toBe(1);

      // 3. Create persistent profile with single name (no last name)
      const profile = await store.createFieldUserProfile({
        googleSub: 'google-sub-single-name-99',
        googleEmail: 'field.worker@gmail.com',
        firstName: 'Shanti',
        lastName: '',
        assignedState: 'Maharashtra',
        assignedDistrict: 'Pune',
        invitationId: validate.invitation!.id,
      });

      expect(profile.id).toBeDefined();
      expect(profile.firstName).toBe('Shanti');
      expect(profile.lastName).toBe('');
      expect(profile.assignedState).toBe('Maharashtra');
      expect(profile.assignedDistrict).toBe('Pune');
      expect(profile.status).toBe('ACTIVE');

      // 4. Verify lookup by Google sub
      const fetched = await store.getFieldUserProfileByGoogleSub('google-sub-single-name-99');
      expect(fetched?.id).toBe(profile.id);
    });

    it('enforces multi-user atomic redemption limit', async () => {
      const reg = await store.createStateTeamRegistration({
        firstName: 'Deepa',
        lastName: 'Nair',
        workEmail: 'deepa@allianceindia.org',
        requestedState: 'Kerala',
        organization: 'Alliance India',
        autoApprove: true,
      });

      // Issue invitation with max 2 redemptions
      const invRecord = await store.createInvitation({
        stateTeamId: reg.id,
        state: 'Kerala',
        salt: 'test-salt-kerala-1234567890123456',
        verifier: 'f2d1e56b82937402a1b2c3d4e5f67890123456789abcdef0123456789abcdef0',
        maxRedemptions: 2,
      });

      // Manually set salt & verifier to match a test code
      const { computeInvitationVerifier } = await import('@/lib/server/invitationCrypto');
      const testCode = 'ALN-KL-1111-2222';
      const { salt, verifier } = computeInvitationVerifier(testCode);
      invRecord.codeSalt = salt;
      invRecord.codeVerifier = verifier;

      // 1st redemption
      const r1 = await store.redeemInvitation(invRecord.id, testCode);
      expect(r1.success).toBe(true);
      expect(r1.invitation?.redemptionCount).toBe(1);

      // 2nd redemption
      const r2 = await store.redeemInvitation(invRecord.id, testCode);
      expect(r2.success).toBe(true);
      expect(r2.invitation?.redemptionCount).toBe(2);

      // 3rd redemption must fail with limit reached
      const r3 = await store.redeemInvitation(invRecord.id, testCode);
      expect(r3.success).toBe(false);
      expect(r3.statusCode).toBe(429);
      expect(r3.error).toMatch(/maximum authorized redemption limit/i);
    });
  });

  describe('Returning User Direct Access & Strict Role Isolation', () => {
    it('detects existing profile on Google OAuth callback and returns existingProfile flag', async () => {
      // Create pre-existing profile
      await store.createFieldUserProfile({
        googleSub: 'google-sub-returning-777',
        googleEmail: 'returning.caseworker@gmail.com',
        firstName: 'Anand',
        lastName: 'Verma',
        assignedState: 'Maharashtra',
        assignedDistrict: 'Thane',
        invitationId: 'inv-123',
      });

      // Verify Google callback with mock sub
      const callbackResult = await verifyGoogleAuthCallback('mock-google-code:returning.caseworker@gmail.com:google-sub-returning-777');
      expect(callbackResult.existingProfile).toBeDefined();
      expect(callbackResult.existingProfile?.firstName).toBe('Anand');
      expect(callbackResult.existingProfile?.assignedState).toBe('Maharashtra');
    });

    it('ensures field session token has FIELD_USER role and cannot escalate privileges', async () => {
      const { issueSessionToken } = await import('@/lib/server/sessionService');

      const token = issueSessionToken({
        userId: 'field-user-profile-id-1',
        name: 'Meera Bai',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const parsed = verifySessionToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.role).toBe('FIELD_USER');
      expect(parsed?.allowedStates).toEqual(['Maharashtra']);
      expect(parsed?.allowedDistricts).toEqual(['Pune']);

      // Ensure role is strictly FIELD_USER, not LEADERSHIP or ADMIN
      expect(parsed?.role).not.toBe('LEADERSHIP');
      expect(parsed?.role).not.toBe('ADMIN');
      expect(parsed?.role).not.toBe('STATE_REVIEWER');
    });
  });
});
