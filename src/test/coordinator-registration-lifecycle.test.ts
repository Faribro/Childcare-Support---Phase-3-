import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestStateTeamOtp,
  requestStateTeamLoginOtp,
  verifyStateTeamOtp,
} from '@/lib/server/stateTeamAuthChallenge';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import { MockEmailStore } from '@/lib/server/emailProvider';
import {
  createMockFirestore,
  setFirestoreDbForTesting,
  EVALUATION_CREDENTIALS_COLLECTION,
  clearRegistry,
} from '@/lib/server/credentialRegistry';
import {
  generatePlaintextInvitationCode,
  createInvitationVerifierPair,
} from '@/lib/server/invitationCrypto';

describe('Coordinator Registration Lifecycle & Credential Invariants', () => {
  let store: MemoryOnboardingStore;
  let mockDb: ReturnType<typeof createMockFirestore>;

  beforeEach(() => {
    clearRegistry();
    MockEmailStore.clear();
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
    mockDb = createMockFirestore();
    setFirestoreDbForTesting(mockDb);
    process.env.SESSION_SECRET = 'b'.repeat(64);
    process.env.STATE_TEAM_APPROVED_DOMAINS = 'allianceindia.org';
  });

  it('never writes active evaluation_credentials, passwords, or field invitations during unapproved signup', async () => {
    const email = 'rohan.mh@allianceindia.org';
    const res = await requestStateTeamOtp({
      firstName: 'Rohan',
      lastName: 'Patil',
      workEmail: email,
      requestedState: 'Maharashtra',
      organization: 'Alliance India MH',
    });

    expect(res.success).toBe(true);
    expect(res.registration?.status).toBe('PENDING_APPROVAL');
    expect((res as any).otp).toBeUndefined();

    // No credentials provisioned in evaluation_credentials
    const credSnap = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(email.toUpperCase()).get();
    expect(credSnap.exists).toBe(false);

    // Email contains ONLY 6-digit OTP verification code (zero password, zero ALN- field invite)
    const sent = MockEmailStore.getLastFor(email);
    expect(sent).toBeDefined();
    expect(sent?.otp).toMatch(/^\d{6}$/);
    expect(sent?.text).not.toMatch(/ALN-[A-Z]{2}-/);
    expect(sent?.text).not.toContain('Password:');
  });

  it('prevents duplicate registration from overwriting an approved, verified, or revoked coordinator', async () => {
    const email = 'anita.mh@allianceindia.org';
    const invCode = generatePlaintextInvitationCode('Maharashtra');
    const { salt, verifier } = createInvitationVerifierPair(invCode);
    await store.createStateTeamAccessInvitation({
      invitedEmail: email,
      assignedState: 'Maharashtra',
      codeSalt: salt,
      codeVerifier: verifier,
      issuedBy: 'admin@allianceindia.org',
      expiresAt: Date.now() + 86400000,
    });

    await requestStateTeamOtp({
      firstName: 'Anita',
      lastName: 'Joshi',
      workEmail: email,
      requestedState: 'Maharashtra',
      organization: 'Alliance India',
      invitationCode: invCode,
    });
    const otp = MockEmailStore.getLastFor(email)!.otp!;
    const verifyRes = await verifyStateTeamOtp({ workEmail: email, code: otp });
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.status).toBe('APPROVED');

    // Attempt second self-registration requesting a different state must fail 409 without overwriting state
    const dupRes = await requestStateTeamOtp({
      firstName: 'Anita',
      lastName: 'Hijack',
      workEmail: email,
      requestedState: 'Gujarat',
      organization: 'Other Org',
    });
    expect(dupRes.success).toBe(false);
    expect(dupRes.statusCode).toBe(409);

    const reg = await store.getStateTeamRegistrationByEmail(email);
    expect(reg?.assignedState).toBe('Maharashtra');
    expect(reg?.firstName).toBe('Anita');
  });

  it('rejects login OTP for revoked or unapproved coordinator', async () => {
    const email = 'pending.revoked@allianceindia.org';
    await requestStateTeamOtp({
      firstName: 'Vikram',
      lastName: 'Singh',
      workEmail: email,
      requestedState: 'Delhi',
      organization: 'Partner NGO',
    });
    const otp = MockEmailStore.getLastFor(email)!.otp!;
    const verifyRes = await verifyStateTeamOtp({ workEmail: email, code: otp });
    expect(verifyRes.status).toBe('PENDING_APPROVAL');
    expect(verifyRes.sessionToken).toBeUndefined();

    // Pending coordinator cannot request login OTP
    const pendingLogin = await requestStateTeamLoginOtp({ workEmail: email });
    expect(pendingLogin.success).toBe(false);
    expect(pendingLogin.statusCode).toBe(403);

    // Approve then revoke
    const reg = await store.getStateTeamRegistrationByEmail(email);
    await store.approveStateTeamRegistration(reg!.id, 'admin@allianceindia.org', 'Delhi');
    await store.revokeStateTeamRegistration(reg!.id, 'admin@allianceindia.org', 'Completed rotation');

    const revokedLogin = await requestStateTeamLoginOtp({ workEmail: email });
    expect(revokedLogin.success).toBe(false);
    expect(revokedLogin.statusCode).toBe(403);
  });

  it('allows approved coordinator to request and verify individual login OTP bound to server state', async () => {
    const email = 'approved.coord@allianceindia.org';
    const reg = await store.createStateTeamRegistration({
      firstName: 'Meera',
      lastName: 'Nair',
      workEmail: email,
      requestedState: 'Karnataka',
      organization: 'Alliance Partner',
    });
    await store.verifyStateTeamEmail(email);
    await store.approveStateTeamRegistration(reg.id, 'admin@allianceindia.org', 'Karnataka');

    const loginReq = await requestStateTeamLoginOtp({ workEmail: email });
    expect(loginReq.success).toBe(true);
    const loginOtp = MockEmailStore.getLastFor(email)?.otp;
    expect(loginOtp).toMatch(/^\d{6}$/);

    const verifyRes = await verifyStateTeamOtp({ workEmail: email, code: loginOtp! });
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.status).toBe('APPROVED');
    expect(verifyRes.session?.allowedStates).toEqual(['Karnataka']);
    expect(verifyRes.sessionToken).toBeDefined();
  });
});
