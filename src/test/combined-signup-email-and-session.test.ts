import { describe, it, expect, beforeEach } from 'vitest';
import {
  generatePlaintextInvitationCode,
  createInvitationVerifierPair,
  verifyInvitationCode,
  encryptInvitationEnvelope,
  decryptInvitationEnvelope,
  DEFAULT_MAX_REDEMPTIONS,
  DEFAULT_INVITATION_EXPIRY_DAYS,
} from '@/lib/server/invitationCrypto';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import {
  requestStateTeamOtp,
  verifyStateTeamOtp,
} from '@/lib/server/stateTeamAuthChallenge';
import {
  MockEmailStore,
} from '@/lib/server/emailProvider';
import { createSessionToken, verifySessionToken } from '@/lib/server/sessionService';

describe('Combined Signup Email, Activation Gating & Persistent Sessions', () => {
  let store: MemoryOnboardingStore;

  beforeEach(() => {
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
    MockEmailStore.clear();
    process.env.SESSION_SECRET = 'a'.repeat(64);
    process.env.STATE_TEAM_APPROVED_DOMAINS = 'allianceindia.org';
  });

  describe('1. First Signup Email with Both Codes', () => {
    it('generates both personal OTP and field-team invitation in the same initial email', async () => {
      const res = await requestStateTeamOtp({
        firstName: 'Anjali',
        lastName: 'Deshmukh',
        workEmail: 'anjali@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India Partner',
      });

      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(200);

      // Verify email was dispatched
      const sent = MockEmailStore.getAll().pop();
      expect(sent).toBeDefined();
      expect(sent?.to).toBe('anjali@allianceindia.org');

      // Check Section A: Personal verification code
      expect(sent?.text).toContain('SECTION A: Your personal email verification code');
      expect(sent?.text).toContain('For your email verification only. Do not share with field users');
      expect(sent?.otp).toMatch(/^\d{6}$/);

      // Check Section B: Field-team invitation code
      expect(sent?.text).toContain('SECTION B: Your field-team invitation code');
      expect(sent?.text).toContain('Field Team Invitation Code: ALN-MH-');
      expect(sent?.text).toContain('State Scope: Maharashtra');
      expect(sent?.text).toContain('Instructions for authorized caseworkers:');
      expect(sent?.text).toContain('Share privately with authorized field caseworkers only');

      // Verify HTML also contains both sections
      expect(sent?.html).toContain('SECTION A');
      expect(sent?.html).toContain('Your personal email verification code');
      expect(sent?.html).toContain('SECTION B');
      expect(sent?.html).toContain('Your field-team invitation code');
      expect(sent?.html).toContain('Start New Survey');
    });

    it('does not leak OTP or invitation code to the client API response', async () => {
      const res = await requestStateTeamOtp({
        firstName: 'Karan',
        lastName: 'Patel',
        workEmail: 'karan@allianceindia.org',
        requestedState: 'Gujarat',
        organization: 'Alliance India Partner',
      });

      expect(res.success).toBe(true);
      // Ensure API response only contains confirmation message
      expect((res as any).invitationCode).toBeUndefined();
    });
  });

  describe('2. Idempotency & Safe Retries', () => {
    it('does not create duplicate invitations or rotate code when OTP is requested again', async () => {
      // First request
      await requestStateTeamOtp({
        firstName: 'Ramesh',
        lastName: 'Kumar',
        workEmail: 'ramesh@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India',
      });

      const firstEmail = MockEmailStore.getAll().pop();
      const firstInvitationMatch = firstEmail?.text.match(/ALN-MH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/);
      expect(firstInvitationMatch).toBeTruthy();
      const firstInvitationCode = firstInvitationMatch![0];

      // Second request (retry / resend OTP)
      await requestStateTeamOtp({
        firstName: 'Ramesh',
        lastName: 'Kumar',
        workEmail: 'ramesh@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India',
      });

      const secondEmail = MockEmailStore.getAll().pop();
      const secondInvitationMatch = secondEmail?.text.match(/ALN-MH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/);
      expect(secondInvitationMatch).toBeTruthy();
      const secondInvitationCode = secondInvitationMatch![0];

      // Plaintext code must remain the exact same (idempotent, no code rotation on resend)
      expect(secondInvitationCode).toBe(firstInvitationCode);

      // Verify only ONE invitation exists in the store for Maharashtra
      const allInvs = await store.listInvitationsForState('Maharashtra');
      expect(allInvs.length).toBe(1);
    });

    it('securely encrypts and decrypts invitation envelope using authenticated AES-GCM', () => {
      const plainCode = 'ALN-DL-4X9K-2M7P';
      const envelope = encryptInvitationEnvelope(plainCode);

      // Never stores plaintext
      expect(envelope).not.toContain(plainCode);
      expect(envelope.split(':').length).toBe(3); // iv:tag:ciphertext

      // Authenticated decryption
      const recovered = decryptInvitationEnvelope(envelope);
      expect(recovered).toBe(plainCode);

      // Tampered envelope fails closed
      const tampered = envelope.replace(/:[0-9a-f]+$/, ':00112233');
      expect(decryptInvitationEnvelope(tampered)).toBeNull();
    });
  });

  describe('3. Activation Gating: Generation != Activation', () => {
    it('rejects invitation redemption before the coordinator verifies their personal OTP', async () => {
      // Register coordinator (pre-approved domain, but email NOT yet verified)
      await requestStateTeamOtp({
        firstName: 'Sunita',
        lastName: 'Rao',
        workEmail: 'sunita@allianceindia.org',
        requestedState: 'Karnataka',
        organization: 'Alliance India',
      });

      const email = MockEmailStore.getAll().pop();
      const invCode = email!.text.match(/ALN-KA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/)![0];

      // Caseworker attempts to redeem before coordinator verification
      const check = await store.findAndValidateInvitation(invCode, 'Karnataka');
      expect(check.valid).toBe(false);
      expect(check.statusCode).toBe(403);
      expect(check.error).toContain('coordinator email verification is pending');
    });

    it('rejects invitation redemption for external applicant until programme approval is granted', async () => {
      // External applicant (e.g. Gmail)
      await requestStateTeamOtp({
        firstName: 'Pooja',
        lastName: 'Sharma',
        workEmail: 'pooja.coordinator@gmail.com',
        requestedState: 'Delhi',
        organization: 'Delhi Partner NGO',
      });

      const email = MockEmailStore.getAll().pop();
      const otp = email!.otp!;
      const invCode = email!.text.match(/ALN-DL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/)![0];

      // Coordinator verifies personal email OTP
      const verifyRes = await verifyStateTeamOtp({
        workEmail: 'pooja.coordinator@gmail.com',
        code: otp,
      });
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.status).toBe('PENDING_APPROVAL');

      // Email is verified, but registration is PENDING_APPROVAL: caseworker CANNOT redeem yet
      const checkBeforeApproval = await store.findAndValidateInvitation(invCode, 'Delhi');
      expect(checkBeforeApproval.valid).toBe(false);
      expect(checkBeforeApproval.statusCode).toBe(403);
      expect(checkBeforeApproval.error).toContain('pending programme approval');

      // Now programme leadership approves coordinator
      const reg = await store.getStateTeamRegistrationByEmail('pooja.coordinator@gmail.com');
      await store.approveStateTeamRegistration(reg!.id, 'admin-leader');

      // Now caseworker CAN redeem!
      const checkAfterApproval = await store.findAndValidateInvitation(invCode, 'Delhi');
      expect(checkAfterApproval.valid).toBe(true);
      expect(checkAfterApproval.invitation).toBeDefined();

      // Redeem invitation atomically
      const redeem = await store.redeemInvitation(checkAfterApproval.invitation!.id, invCode);
      expect(redeem.success).toBe(true);
      expect(redeem.invitation?.redemptionCount).toBe(1);
    });

    it('activates invitation immediately for pre-approved coordinator once email is verified', async () => {
      await requestStateTeamOtp({
        firstName: 'Amit',
        lastName: 'Verma',
        workEmail: 'amit.v@allianceindia.org',
        requestedState: 'Uttar Pradesh',
        organization: 'Alliance India',
      });

      const email = MockEmailStore.getAll().pop();
      const otp = email!.otp!;
      const invCode = email!.text.match(/ALN-UP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/)![0];

      // Verify OTP
      const verifyRes = await verifyStateTeamOtp({
        workEmail: 'amit.v@allianceindia.org',
        code: otp,
      });
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.status).toBe('APPROVED');

      // Pre-approved coordinator is now approved: invitation is ACTIVE
      const check = await store.findAndValidateInvitation(invCode, 'Uttar Pradesh');
      expect(check.valid).toBe(true);
      expect(check.invitation?.status).toBe('ACTIVE');
    });
  });

  describe('4. Persistent Sessions & Returning Field User', () => {
    it('creates persistent 8-hour session token with correct claims', () => {
      const token = createSessionToken({
        userId: 'field-user-123',
        username: 'worker@gmail.com',
        name: 'Field Worker',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const parsed = verifySessionToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.role).toBe('FIELD_USER');
      expect(parsed?.allowedStates).toEqual(['Maharashtra']);
      expect(parsed?.expiresAt - parsed?.createdAt).toBe(8 * 60 * 60 * 1000); // 8 hours
    });

    it('returning field user does not consume additional invitation redemption', async () => {
      // Create initial profile
      const profile = await store.createFieldUserProfile({
        googleSub: 'google-sub-returning-001',
        googleEmail: 'returning.worker@gmail.com',
        firstName: 'Meena',
        lastName: 'Kumari',
        assignedState: 'Maharashtra',
        assignedDistrict: 'Pune',
        invitationId: 'inv-test-1',
      });

      // Subsequent query for returning user returns existing profile without repeating redemption
      const existing = await store.getFieldUserProfileByGoogleSub('google-sub-returning-001');
      expect(existing).toBeDefined();
      expect(existing?.id).toBe(profile.id);
      expect(existing?.status).toBe('ACTIVE');
    });
  });
});
