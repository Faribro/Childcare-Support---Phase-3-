import { describe, it, expect, beforeEach } from 'vitest';
import {
  generatePlaintextInvitationCode,
  createInvitationVerifierPair,
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
import { MockEmailStore } from '@/lib/server/emailProvider';

describe('State Team Onboarding & Invitation Engine', () => {
  let store: MemoryOnboardingStore;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-for-vitest-state-team-onboarding-min-32-chars';
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
    MockEmailStore.clear();
  });

  describe('Invitation Crypto & Verifier Security', () => {
    it('generates high-entropy invitation codes with state prefix and no confusing chars', () => {
      const code = generatePlaintextInvitationCode('Maharashtra');
      expect(code).toMatch(/^ALN-MH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      const body = code.replace('ALN-MH-', '');
      expect(body).not.toMatch(/[0O1I]/);
    });

    it('computes salted SHA-256 verifier and validates matching plain code', () => {
      const code = 'ALN-WB-7X8K-9M2P';
      const { salt, verifier } = createInvitationVerifierPair(code);
      expect(salt).toHaveLength(32);
      expect(verifier).toHaveLength(64);
      expect(verifier).not.toContain('7X8K');
      expect(verifyInvitationCode('  aln-wb-7x8k-9m2p  ', salt, verifier)).toBe(true);
      expect(verifyInvitationCode('ALN-WB-7X8K-9M2Q', salt, verifier)).toBe(false);
    });

    it('normalizes invitation codes cleanly', () => {
      expect(normalizeInvitationCode(' aln-mh-abcd-1234 ')).toBe('ALNMHABCD1234');
      expect(normalizeInvitationCode('ALN-MH-ABCD-1234')).toBe('ALNMHABCD1234');
    });
  });

  describe('State Team Registration & Approval Enforcement', () => {
    it('successfully registers state team coordinator with single name (no last name)', async () => {
      const reg = await store.createStateTeamRegistration({
        firstName: 'Farid',
        lastName: '',
        workEmail: 'farid.only@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India',
      });
      expect(reg.firstName).toBe('Farid');
      expect(reg.lastName).toBe('');
      expect(reg.status).toBe('PENDING_APPROVAL');
    });

    it('does NOT auto-approve coordinator based solely on @allianceindia.org email domain', async () => {
      process.env.STATE_TEAM_APPROVED_DOMAINS = 'allianceindia.org';
      const result = await issueStateTeamOtpChallenge({
        firstName: 'Anita',
        lastName: 'Desai',
        workEmail: 'anita.desai@allianceindia.org',
        requestedState: 'West Bengal',
        organization: 'Alliance India State Partner',
      });

      expect(result.success).toBe(true);
      expect(result.registration.status).toBe('PENDING_APPROVAL');
    });

    it('sets external partner domain to PENDING_APPROVAL pending administrator review', async () => {
      const result = await issueStateTeamOtpChallenge({
        firstName: 'Ramesh',
        lastName: 'Kumar',
        workEmail: 'ramesh@partner-ngo.org',
        requestedState: 'Tamil Nadu',
        organization: 'Partner NGO',
      });

      expect(result.success).toBe(true);
      expect(result.registration.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('OTP Challenge Issuance & Verification', () => {
    it('verifies valid 6-digit OTP and unlocks STATE_REVIEWER session once Administration approves', async () => {
      const issue = await issueStateTeamOtpChallenge({
        firstName: 'Priya',
        lastName: 'Sharma',
        workEmail: 'priya.sharma@allianceindia.org',
        requestedState: 'Delhi',
        organization: 'Alliance India',
      });

      expect(issue.success).toBe(true);
      expect((issue as any).otp).toBeUndefined();
      const otpFromEmail = MockEmailStore.getLastFor('priya.sharma@allianceindia.org')?.otp;
      expect(otpFromEmail).toMatch(/^\d{6}$/);

      // Admin approves registration with assigned state
      await store.approveStateTeamRegistration(issue.registration.id, 'admin@allianceindia.org', 'Delhi');

      const verify = await verifyStateTeamOtpChallenge({
        email: 'priya.sharma@allianceindia.org',
        otp: otpFromEmail!,
      });

      expect(verify.success).toBe(true);
      expect(verify.statusCode).toBe(200);
      expect(verify.sessionToken).toBeDefined();
      expect(verify.session?.role).toBe('STATE_REVIEWER');
      expect(verify.session?.allowedStates).toEqual(['Delhi']);
    });

    it('locks out after 5 consecutive incorrect OTP attempts', async () => {
      await issueStateTeamOtpChallenge({
        firstName: 'Lockout',
        lastName: 'Tester',
        workEmail: 'lockout@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India',
      });

      for (let i = 0; i < 4; i++) {
        const attempt = await verifyStateTeamOtpChallenge({
          email: 'lockout@allianceindia.org',
          otp: '000000',
        });
        expect(attempt.success).toBe(false);
        expect(attempt.statusCode).toBe(401);
      }

      const fifthAttempt = await verifyStateTeamOtpChallenge({
        email: 'lockout@allianceindia.org',
        otp: '000000',
      });
      expect(fifthAttempt.success).toBe(false);
      expect(fifthAttempt.statusCode).toBe(429);
    });
  });

  describe('State Team Invitation Issuance & Private Dispatch', () => {
    it('issues high-entropy invitation, stores only verifier, and never stores plaintext code', async () => {
      const reg = await store.createStateTeamRegistration({
        firstName: 'Sunita',
        lastName: 'Sen',
        workEmail: 'sunita.sen@allianceindia.org',
        requestedState: 'West Bengal',
        organization: 'Alliance India WB',
      });
      await store.verifyStateTeamEmail(reg.workEmail);
      await store.approveStateTeamRegistration(reg.id, 'admin@allianceindia.org', 'West Bengal');

      const issue = await issueStateTeamInvitation({
        stateTeamId: reg.id,
        maxRedemptions: 10,
        expiryDays: 14,
      });

      expect(issue.success).toBe(true);
      expect(issue.plainInvitationCode).toMatch(/^ALN-WB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      const stored = await store.getInvitationById(issue.invitationId);
      expect(stored?.codeVerifier).toHaveLength(64);
      expect(stored?.codeVerifier).not.toBe(issue.plainInvitationCode);
    });

    it('rotates invitation code, marking prior as ROTATED', async () => {
      const reg = await store.createStateTeamRegistration({
        firstName: 'Raj',
        lastName: 'Kapoor',
        workEmail: 'raj.kapoor@allianceindia.org',
        requestedState: 'Gujarat',
        organization: 'Alliance India GJ',
      });
      await store.verifyStateTeamEmail(reg.workEmail);
      await store.approveStateTeamRegistration(reg.id, 'admin@allianceindia.org', 'Gujarat');

      const first = await issueStateTeamInvitation({ stateTeamId: reg.id });
      const second = await issueStateTeamInvitation({ stateTeamId: reg.id, rotate: true });

      expect(second.plainInvitationCode).not.toBe(first.plainInvitationCode);
      const oldInv = await store.getInvitationById(first.invitationId);
      expect(oldInv?.status).toBe('ROTATED');
    });
  });
});
