import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateInvitationCode,
  computeInvitationVerifier,
  verifyInvitationCode,
  normalizeInvitationCode,
} from '@/lib/server/invitationCrypto';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import {
  issueStateTeamOtpChallenge,
  verifyStateTeamOtpChallenge,
  issueStateTeamInvitation,
} from '@/lib/server/stateTeamAuthChallenge';

describe('State Team Onboarding & Invitation Engine', () => {
  let store: MemoryOnboardingStore;

  beforeEach(() => {
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
  });

  describe('Invitation Crypto Primitives', () => {
    it('generates high-entropy invitation codes with state prefix and no confusing chars', () => {
      const code = generateInvitationCode('Maharashtra');
      expect(code).toMatch(/^ALN-MH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      // Confusing characters (0, O, 1, I) should never appear in random chunks
      const body = code.replace('ALN-MH-', '');
      expect(body).not.toMatch(/[01IO]/);
    });

    it('computes salted SHA-256 verifier and validates matching plain code', () => {
      const code = 'ALN-WB-7X8K-9M2P';
      const { salt, verifier } = computeInvitationVerifier(code);

      expect(salt).toHaveLength(32);
      expect(verifier).toHaveLength(64);

      // Positive match
      expect(verifyInvitationCode(code, salt, verifier)).toBe(true);

      // Case and spacing insensitivity
      expect(verifyInvitationCode('  aln-wb-7x8k-9m2p  ', salt, verifier)).toBe(true);

      // Incorrect code fails
      expect(verifyInvitationCode('ALN-WB-7X8K-9M2Q', salt, verifier)).toBe(false);
    });

    it('normalizes invitation codes cleanly', () => {
      expect(normalizeInvitationCode(' aln-mh-abcd-1234 ')).toBe('ALNMHABCD1234');
      expect(normalizeInvitationCode('ALN-MH-ABCD-1234')).toBe('ALNMHABCD1234');
    });
  });

  describe('State Team Registration & Single-Name Support', () => {
    it('successfully registers state team coordinator with single name (no last name)', async () => {
      const reg = await store.createStateTeamRegistration({
        firstName: 'Geeta',
        lastName: '',
        workEmail: 'geeta@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India',
      });

      expect(reg.id).toBeDefined();
      expect(reg.firstName).toBe('Geeta');
      expect(reg.lastName).toBe('');
      expect(reg.workEmail).toBe('geeta@allianceindia.org');
      expect(reg.requestedState).toBe('Maharashtra');
      expect(reg.status).toBe('PENDING_APPROVAL');
      expect(reg.emailVerified).toBe(false);
    });

    it('auto-approves coordinator from official @allianceindia.org domain in registration challenge', async () => {
      const result = await issueStateTeamOtpChallenge({
        firstName: 'Ramesh',
        lastName: 'Kumar',
        workEmail: 'ramesh.k@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India MH Programme',
      });

      expect(result.success).toBe(true);
      expect(result.registration.status).toBe('APPROVED');
    });

    it('sets external partner domain to PENDING_APPROVAL pending administrator review', async () => {
      const result = await issueStateTeamOtpChallenge({
        firstName: 'Sunita',
        lastName: 'Patil',
        workEmail: 'sunita@communitypartner-ngo.org',
        requestedState: 'Maharashtra',
        organization: 'Local CBO Partner',
      });

      expect(result.success).toBe(true);
      expect(result.registration.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('OTP Challenge Issuance & Verification', () => {
    it('verifies valid 6-digit OTP and unlocks STATE_REVIEWER session for approved coordinator', async () => {
      const issue = await issueStateTeamOtpChallenge({
        firstName: 'Anjali',
        lastName: 'Deshmukh',
        workEmail: 'anjali.d@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India',
      });

      expect(issue.success).toBe(true);
      expect(issue.otp).toBeDefined();

      const verify = await verifyStateTeamOtpChallenge({
        email: 'anjali.d@allianceindia.org',
        otp: issue.otp!,
      });

      expect(verify.success).toBe(true);
      expect(verify.session).toBeDefined();
      expect(verify.session?.role).toBe('STATE_REVIEWER');
      expect(verify.session?.allowedStates).toEqual(['Maharashtra']);
    });

    it('locks out after 5 consecutive incorrect OTP attempts', async () => {
      const issue = await issueStateTeamOtpChallenge({
        firstName: 'Dev',
        lastName: 'Sharma',
        workEmail: 'dev.sharma@allianceindia.org',
        requestedState: 'Delhi',
        organization: 'Alliance India',
      });

      for (let i = 0; i < 4; i++) {
        const attempt = await verifyStateTeamOtpChallenge({
          email: 'dev.sharma@allianceindia.org',
          otp: '000000',
        });
        expect(attempt.success).toBe(false);
        expect(attempt.statusCode).toBe(401);
      }

      // 5th failed attempt triggers lockout
      const fifthAttempt = await verifyStateTeamOtpChallenge({
        email: 'dev.sharma@allianceindia.org',
        otp: '000000',
      });
      expect(fifthAttempt.success).toBe(false);
      expect(fifthAttempt.statusCode).toBe(429);
      expect(fifthAttempt.error).toMatch(/locked/i);
    });
  });

  describe('State Team Invitation Issuance & Private Dispatch', () => {
    it('issues high-entropy invitation, stores only verifier, and never stores plaintext code', async () => {
      const reg = await store.createStateTeamRegistration({
        firstName: 'Priya',
        lastName: 'Menon',
        workEmail: 'priya.m@allianceindia.org',
        requestedState: 'West Bengal',
        organization: 'Alliance India',
        autoApprove: true,
      });
      await store.verifyStateTeamEmail(reg.workEmail);

      const issue = await issueStateTeamInvitation({
        stateTeamId: reg.id,
      });

      expect(issue.success).toBe(true);
      expect(issue.plainInvitationCode).toMatch(/^ALN-WB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);

      // Verify DB record
      const stored = await store.getInvitationById(issue.invitationId);
      expect(stored).not.toBeNull();
      expect(stored?.codeSalt).toBeDefined();
      expect(stored?.codeVerifier).toBeDefined();
      // Ensure plaintext is NOT in DB record
      expect((stored as any).plainInvitationCode).toBeUndefined();
      expect((stored as any).code).toBeUndefined();

      // Test validation against stored verifier
      const check = await store.findAndValidateInvitation(issue.plainInvitationCode, 'West Bengal');
      expect(check.valid).toBe(true);
      expect(check.invitation?.id).toBe(issue.invitationId);
    });

    it('rotates invitation code, marking prior as ROTATED', async () => {
      const reg = await store.createStateTeamRegistration({
        firstName: 'Karan',
        lastName: 'Johar',
        workEmail: 'karan@allianceindia.org',
        requestedState: 'Gujarat',
        organization: 'Alliance India',
        autoApprove: true,
      });
      await store.verifyStateTeamEmail(reg.workEmail);

      const first = await issueStateTeamInvitation({ stateTeamId: reg.id });
      expect(first.success).toBe(true);

      const rotated = await issueStateTeamInvitation({ stateTeamId: reg.id, rotate: true });
      expect(rotated.success).toBe(true);
      expect(rotated.plainInvitationCode).not.toBe(first.plainInvitationCode);

      // Old code validation returns 403 rotated
      const oldCheck = await store.findAndValidateInvitation(first.plainInvitationCode, 'Gujarat');
      expect(oldCheck.valid).toBe(false);
      expect(oldCheck.statusCode).toBe(403);
      expect(oldCheck.error).toMatch(/rotated/i);

      // New code validation succeeds
      const newCheck = await store.findAndValidateInvitation(rotated.plainInvitationCode, 'Gujarat');
      expect(newCheck.valid).toBe(true);
    });
  });
});
