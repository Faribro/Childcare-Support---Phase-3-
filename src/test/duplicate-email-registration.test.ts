import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestFieldEmailOtp } from '@/lib/server/fieldEmailOtpChallenge';
import { getOnboardingStore } from '@/lib/server/onboardingStore';

describe('Workstream B: Duplicate Email Registration Handling', () => {
  const testEmail = 'existing.worker@allianceindia.org';

  beforeEach(async () => {
    const store = getOnboardingStore();
    // Seed an existing profile
    await store.createFieldUserProfile({
      googleSub: 'sub_test_existing_001',
      googleEmail: testEmail,
      firstName: 'Existing',
      lastName: 'Worker',
      assignedState: 'Maharashtra',
      assignedDistrict: 'Pune',
      invitationId: 'inv_test_001',
    });
  });

  it('1. Rejects registration for an already registered email with HTTP 409', async () => {
    const res = await requestFieldEmailOtp({
      email: testEmail,
      purpose: 'registration',
    });

    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(409);
    expect(res.error).toBe('This email is already registered. Please sign in instead.');
  });

  it('2. Permits sign-in request for an already registered email with HTTP 200', async () => {
    const res = await requestFieldEmailOtp({
      email: testEmail,
      purpose: 'login',
    });

    expect(res.success).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.message).toMatch(/Verification code sent to/i);
  });

  it('3. Anti-enumeration: returns generic 200 for unregistered email on login', async () => {
    const unregisteredEmail = 'unregistered.person@allianceindia.org';
    const res = await requestFieldEmailOtp({
      email: unregisteredEmail,
      purpose: 'login',
    });

    expect(res.success).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.message).toMatch(/If this email address is registered/i);
  });
});
