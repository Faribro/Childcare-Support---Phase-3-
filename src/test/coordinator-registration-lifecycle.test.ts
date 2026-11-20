import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestStateTeamOtp,
  verifyStateTeamOtp,
} from '@/lib/server/stateTeamAuthChallenge';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import {
  getCredentialByIdentifier,
  registerCredential,
  clearRegistry,
  getFirestoreDb,
  setFirestoreDbForTesting,
  resetFirestoreDb,
  createMockFirestore,
  EVALUATION_CREDENTIALS_COLLECTION,
} from '@/lib/server/credentialRegistry';
import { verifyPassword } from '@/lib/server/sessionService';

describe('Coordinator Registration Lifecycle & Credential Invariants', () => {
  let mockDb: any;
  let store: MemoryOnboardingStore;

  beforeEach(() => {
    clearRegistry();
    mockDb = createMockFirestore();
    setFirestoreDbForTesting(mockDb);
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
  });

  it('atomically initializes credential on first registration and includes personal password', async () => {
    const email = 'coordinator.alpha@allianceindia.org';
    const res = await requestStateTeamOtp({
      firstName: 'Alpha',
      lastName: 'Coordinator',
      workEmail: email,
      requestedState: 'Maharashtra',
      organization: 'Alliance India Partner',
    });

    expect(res.success).toBe(true);
    expect(res.statusCode).toBe(200);

    // Verify credential was committed to Firestore
    const credSnap = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(email.toUpperCase()).get();
    expect(credSnap.exists).toBe(true);
    const credData = credSnap.data();
    expect(credData.accessIdentifier).toBe(email.toUpperCase());
    expect(credData.isActive).toBe(true);
    expect(credData.credentialKind).toBe('STATE_EVALUATION');
    expect(credData.stateCode).toBe('MH');
    expect(credData.passwordHash).toBeDefined();
    expect(credData.passwordHash.length).toBeGreaterThan(20);
  });

  it('registration retry / OTP resend preserves existing password hash without overwriting', async () => {
    const email = 'coordinator.beta@allianceindia.org';

    // 1. First registration
    const res1 = await requestStateTeamOtp({
      firstName: 'Beta',
      lastName: 'Coordinator',
      workEmail: email,
      requestedState: 'Maharashtra',
      organization: 'Alliance India Partner',
    });
    expect(res1.success).toBe(true);

    const snap1 = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(email.toUpperCase()).get();
    const initialHash = snap1.data().passwordHash;
    const initialUpdatedAt = snap1.data().updatedAt;

    // 2. Second registration (OTP resend / retry)
    const res2 = await requestStateTeamOtp({
      firstName: 'Beta',
      lastName: 'Coordinator',
      workEmail: email,
      requestedState: 'Maharashtra',
      organization: 'Alliance India Partner',
    });
    expect(res2.success).toBe(true);

    const snap2 = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(email.toUpperCase()).get();
    const secondHash = snap2.data().passwordHash;

    // Invariant: passwordHash must be strictly identical; never replaced on retry
    expect(secondHash).toBe(initialHash);
  });

  it('registration retry does not reactivate a disabled account', async () => {
    const email = 'coordinator.disabled@allianceindia.org';

    // 1. Initial registration
    await requestStateTeamOtp({
      firstName: 'Disabled',
      lastName: 'User',
      workEmail: email,
      requestedState: 'Maharashtra',
      organization: 'Alliance India Partner',
    });

    // 2. Administrator deactivates the account
    const credRef = mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(email.toUpperCase());
    await credRef.update({ isActive: false });

    const checkSnap = await credRef.get();
    expect(checkSnap.data().isActive).toBe(false);

    // 3. User attempts to re-register or request OTP
    const res = await requestStateTeamOtp({
      firstName: 'Disabled',
      lastName: 'User',
      workEmail: email,
      requestedState: 'Maharashtra',
      organization: 'Alliance India Partner',
    });
    expect(res.success).toBe(true);

    // Invariant: Account remains deactivated; registration retry cannot bypass administrative suspension
    const afterSnap = await credRef.get();
    expect(afterSnap.data().isActive).toBe(false);
  });

  it('registration retry does not alter role, stateCode, or programme scope', async () => {
    const email = 'coordinator.immutable@allianceindia.org';

    await requestStateTeamOtp({
      firstName: 'Immutable',
      lastName: 'User',
      workEmail: email,
      requestedState: 'Maharashtra',
      organization: 'Alliance India Partner',
    });

    // Attempt retry with different state and org
    await requestStateTeamOtp({
      firstName: 'Hacker',
      lastName: 'Attempt',
      workEmail: email,
      requestedState: 'Delhi',
      organization: 'Different Org',
    });

    const snap = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(email.toUpperCase()).get();
    const data = snap.data();
    expect(data.stateCode).toBe('MH'); // Preserved original state
    expect(data.credentialKind).toBe('STATE_EVALUATION');
    expect(data.programmeScope).toEqual(['alliance-childcare-phase3']);
  });

  it('handles concurrent initial registration requests atomically without data corruption', async () => {
    const email = 'coordinator.concurrent@allianceindia.org';

    // Fire 3 simultaneous registration requests
    const promises = [
      requestStateTeamOtp({
        firstName: 'Concurrent',
        lastName: 'One',
        workEmail: email,
        requestedState: 'Maharashtra',
        organization: 'Alliance India Partner',
      }),
      requestStateTeamOtp({
        firstName: 'Concurrent',
        lastName: 'Two',
        workEmail: email,
        requestedState: 'Maharashtra',
        organization: 'Alliance India Partner',
      }),
      requestStateTeamOtp({
        firstName: 'Concurrent',
        lastName: 'Three',
        workEmail: email,
        requestedState: 'Maharashtra',
        organization: 'Alliance India Partner',
      }),
    ];

    const results = await Promise.all(promises);
    expect(results.every((r) => r.success)).toBe(true);

    // Verify only one valid credential document exists
    const credSnap = await mockDb.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(email.toUpperCase()).get();
    expect(credSnap.exists).toBe(true);
    expect(credSnap.data().passwordHash).toBeDefined();
    expect(credSnap.data().isActive).toBe(true);
  });
});
