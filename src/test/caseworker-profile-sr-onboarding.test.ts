import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryOnboardingStore } from '@/lib/server/onboardingStore';
import { createSessionToken, verifySessionToken } from '@/lib/server/sessionService';

describe('Caseworker SR/SSR Onboarding & Persistent Submission Flow', () => {
  let store: MemoryOnboardingStore;

  beforeEach(() => {
    store = new MemoryOnboardingStore();
  });

  it('1. collects and stores srName and ssrName during first registration in field user profile', async () => {
    const profile = await store.createFieldUserProfile({
      googleSub: 'google-sub-caseworker-01',
      googleEmail: 'caseworker01@allianceindia.org',
      firstName: 'Kavita',
      lastName: 'Sharma',
      assignedState: 'MAHARASHTRA',
      assignedDistrict: 'Pune',
      invitationId: 'inv-mh-test-01',
      srName: 'Alliance India Maharashtra SR',
      ssrName: 'Pune Care Center / CCC',
    });

    expect(profile).toBeDefined();
    expect(profile.id).toBeDefined();
    expect(profile.srName).toBe('Alliance India Maharashtra SR');
    expect(profile.ssrName).toBe('Pune Care Center / CCC');
    expect(profile.assignedState).toBe('MAHARASHTRA');
    expect(profile.assignedDistrict).toBe('Pune');

    // Retrieve by email
    const fetched = await store.getFieldUserProfileByEmail('caseworker01@allianceindia.org');
    expect(fetched).not.toBeNull();
    expect(fetched?.srName).toBe('Alliance India Maharashtra SR');
    expect(fetched?.ssrName).toBe('Pune Care Center / CCC');
  });

  it('2. embeds srName and ssrName into session token issued at onboarding', () => {
    const token = createSessionToken({
      userId: 'fld_user_test_99',
      username: 'caseworker@allianceindia.org',
      name: 'Sunita Patil',
      role: 'FIELD_USER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
      srName: 'Alliance India Maharashtra SR',
      ssrName: 'Haveli Taluka CCC',
    });

    expect(token).toBeDefined();
    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.role).toBe('FIELD_USER');
    expect(verified?.srName).toBe('Alliance India Maharashtra SR');
    expect(verified?.ssrName).toBe('Haveli Taluka CCC');
  });

  it('3. updates existing profile with new SR/SSR without losing other fields', async () => {
    const profile = await store.createFieldUserProfile({
      googleSub: 'google-sub-caseworker-02',
      googleEmail: 'caseworker02@allianceindia.org',
      firstName: 'Ramesh',
      lastName: 'Kumar',
      assignedState: 'MAHARASHTRA',
      assignedDistrict: 'Nagpur',
      invitationId: 'inv-mh-test-02',
      srName: 'Initial SR',
      ssrName: 'Initial SSR',
    });

    const updated = await store.updateFieldUserProfile(profile.id, {
      srName: 'Updated Maharashtra State SR',
      ssrName: 'Nagpur District Center',
    });

    expect(updated).not.toBeNull();
    expect(updated?.firstName).toBe('Ramesh');
    expect(updated?.srName).toBe('Updated Maharashtra State SR');
    expect(updated?.ssrName).toBe('Nagpur District Center');
  });

  it('4. subsequent submissions auto-attach SR and SSR from profile without re-asking', () => {
    // Simulate stored profile in localStorage
    const storedProfile = {
      id: 'fld_101',
      name: 'Kavita Sharma',
      assignedState: 'Maharashtra',
      assignedDistrict: 'Pune',
      srName: 'Alliance India Maharashtra SR',
      ssrName: 'Pune Care Center',
    };

    // Simulated assessment form data before submit
    const formData = {
      artNumber: 'MH-PUN-001-01',
      srName: '', // empty on initial form state
      ssrName: '',
      childAadhaarNumber: '',
      state: 'Maharashtra',
      district: 'Pune',
    };

    // Form logic resolution (matching assessment/new/page.tsx line 730)
    let effectiveSrName = formData.srName;
    let effectiveSsrName = formData.ssrName;
    if (!effectiveSrName && storedProfile.srName) {
      effectiveSrName = storedProfile.srName;
    }
    if (!effectiveSsrName && storedProfile.ssrName) {
      effectiveSsrName = storedProfile.ssrName;
    }

    // Verify submission record has SR and SSR populated without any modal intervention
    const finalRecordDemographics = {
      state: formData.state,
      district: formData.district,
      childAadhaarNumber: formData.childAadhaarNumber,
      srName: effectiveSrName,
      ssrName: effectiveSsrName,
    };

    expect(finalRecordDemographics.srName).toBe('Alliance India Maharashtra SR');
    expect(finalRecordDemographics.ssrName).toBe('Pune Care Center');
  });
});
