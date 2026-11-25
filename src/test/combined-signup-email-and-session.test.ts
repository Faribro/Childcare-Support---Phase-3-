import { describe, it, expect, beforeEach } from 'vitest';
import {
  generatePlaintextInvitationCode,
  createInvitationVerifierPair,
} from '@/lib/server/invitationCrypto';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import {
  requestStateTeamOtp,
  verifyStateTeamOtp,
  issueStateTeamInvitation,
} from '@/lib/server/stateTeamAuthChallenge';
import { MockEmailStore } from '@/lib/server/emailProvider';
import { createSessionToken, verifySessionToken } from '@/lib/server/sessionService';

describe('State Team Access Request Email, Approval Gating & Single-Use Invitation Activation', () => {
  let store: MemoryOnboardingStore;

  beforeEach(() => {
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
    MockEmailStore.clear();
    process.env.SESSION_SECRET = 'a'.repeat(64);
    process.env.STATE_TEAM_APPROVED_DOMAINS = 'allianceindia.org';
  });

  describe('1. Unprivileged Access Request Without Invitation', () => {
    it('sends ONLY a 6-digit personal email OTP and zero field-team codes or passwords', async () => {
      const res = await requestStateTeamOtp({
        firstName: 'Anjali',
        lastName: 'Deshmukh',
        workEmail: 'anjali@allianceindia.org',
        requestedState: 'Maharashtra',
        organization: 'Alliance India Partner',
      });

      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.registration?.status).toBe('PENDING_APPROVAL');
      expect((res as any).otp).toBeUndefined();
      expect((res as any).invitationCode).toBeUndefined();

      const sent = MockEmailStore.getLastFor('anjali@allianceindia.org');
      expect(sent).toBeDefined();
      expect(sent?.otp).toMatch(/^\d{6}$/);
      expect(sent?.text).not.toMatch(/ALN-[A-Z]{2}-/);
      expect(sent?.html).not.toContain('Your All-Time Login Password');
    });

    it('keeps verified uninvited applicant in PENDING_APPROVAL with zero session until Administration approves', async () => {
      await requestStateTeamOtp({
        firstName: 'Pooja',
        lastName: 'Sharma',
        workEmail: 'pooja.coordinator@gmail.com',
        requestedState: 'Delhi',
        organization: 'Delhi Partner NGO',
      });

      const email = MockEmailStore.getLastFor('pooja.coordinator@gmail.com')!;
      const verifyRes = await verifyStateTeamOtp({
        workEmail: 'pooja.coordinator@gmail.com',
        code: email.otp!,
      });

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.status).toBe('PENDING_APPROVAL');
      expect(verifyRes.sessionToken).toBeUndefined();
      expect(verifyRes.session).toBeUndefined();

      // Cannot issue field invitations while still PENDING_APPROVAL
      const reg = await store.getStateTeamRegistrationByEmail('pooja.coordinator@gmail.com');
      await expect(issueStateTeamInvitation({ stateTeamId: reg!.id })).rejects.toThrow(/pending|not approved/i);

      // Admin approves with server-assigned state -> coordinator can now issue field invitations
      await store.approveStateTeamRegistration(reg!.id, 'admin-leader', 'Delhi');
      const issuedInv = await issueStateTeamInvitation({ stateTeamId: reg!.id });
      const checkAfterApproval = await store.findAndValidateInvitation(issuedInv.plainInvitationCode, 'Delhi');
      expect(checkAfterApproval.valid).toBe(true);
    });
  });

  describe('2. Single-Use Email-Bound Administration Invitation', () => {
    it('enforces single-use atomic redemption after OTP verify and overrides state from server invitation', async () => {
      const invitedEmail = 'amit.v@allianceindia.org';
      const plainAccessCode = generatePlaintextInvitationCode('Uttar Pradesh');
      const { salt, verifier } = createInvitationVerifierPair(plainAccessCode);
      await store.createStateTeamAccessInvitation({
        invitedEmail,
        assignedState: 'Uttar Pradesh',
        codeSalt: salt,
        codeVerifier: verifier,
        issuedBy: 'admin@allianceindia.org',
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      // Even if client passes another state, server invitation forces Uttar Pradesh
      const reqRes = await requestStateTeamOtp({
        firstName: 'Amit',
        lastName: 'Verma',
        workEmail: invitedEmail,
        requestedState: 'Maharashtra',
        organization: 'Alliance India',
        invitationCode: plainAccessCode,
      });
      expect(reqRes.success).toBe(true);

      const otp = MockEmailStore.getLastFor(invitedEmail)!.otp!;
      const verifyRes = await verifyStateTeamOtp({ workEmail: invitedEmail, code: otp });
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.status).toBe('APPROVED');
      expect(verifyRes.session?.allowedStates).toEqual(['Uttar Pradesh']);
      expect(verifyRes.sessionToken).toBeDefined();

      // Single-use invitation cannot be reused again even by another account
      const reuseCheck = await store.findValidStateTeamAccessInvitation({
        invitedEmail,
        plainCode: plainAccessCode,
      });
      expect(reuseCheck.valid).toBe(false);
      expect(reuseCheck.statusCode).toBe(409);
    });
  });

  describe('3. Persistent Sessions', () => {
    it('creates persistent 8-hour session token with correct claims', () => {
      const token = createSessionToken({
        userId: 'field-user-123',
        username: 'worker@gmail.com',
        name: 'Field Worker',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });
      const decoded = verifySessionToken(token);
      expect(decoded?.userId).toBe('field-user-123');
      expect(decoded?.role).toBe('FIELD_USER');
    });
  });
});
