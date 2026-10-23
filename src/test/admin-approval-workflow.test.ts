import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getRegistrationsRoute } from '@/app/api/admin/registrations/route';
import { POST as approveRegistrationRoute } from '@/app/api/admin/registrations/[id]/approve/route';
import { POST as rejectRegistrationRoute } from '@/app/api/admin/registrations/[id]/reject/route';
import { POST as notifyRegistrationRoute } from '@/app/api/admin/registrations/[id]/notify/route';
import { MemoryOnboardingStore, setOnboardingStoreForTesting } from '@/lib/server/onboardingStore';
import { requestStateTeamOtp, verifyStateTeamOtp } from '@/lib/server/stateTeamAuthChallenge';
import { createSessionToken } from '@/lib/server/sessionService';
import { MockEmailStore } from '@/lib/server/emailProvider';

describe('Administrator Review & Approval Workflow (End-to-End)', () => {
  let store: MemoryOnboardingStore;
  let adminSessionToken: string;
  let stateReviewerToken: string;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'a'.repeat(64);
    process.env.ADMIN_NOTIFICATION_EMAIL = 'fsayyed@allianceindia.org';

    adminSessionToken = createSessionToken({
      userId: 'admin-01',
      username: 'admin',
      name: 'System Administrator',
      role: 'ADMIN',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    });

    stateReviewerToken = createSessionToken({
      userId: 'coord-mh-01',
      username: 'coord.mh@partner.org',
      name: 'Maharashtra Coordinator',
      role: 'STATE_REVIEWER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
    });

    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
    MockEmailStore.clear();
  });

  afterEach(() => {
    MockEmailStore.clear();
  });

  it('1. GET /api/admin/registrations requires authenticated ADMIN or LEADERSHIP session', async () => {
    // Unauthenticated
    const unauthReq = new NextRequest('http://localhost:3000/api/admin/registrations', {
      headers: {
        'x-test-unauthenticated': 'true',
      },
    });
    const unauthRes = await getRegistrationsRoute(unauthReq);
    expect(unauthRes.status).toBe(401);

    // State Reviewer (unauthorized)
    const reviewerReq = new NextRequest('http://localhost:3000/api/admin/registrations', {
      headers: {
        cookie: `evaluation_session_token=${stateReviewerToken}`,
      },
    });
    const reviewerRes = await getRegistrationsRoute(reviewerReq);
    expect(reviewerRes.status).toBe(403);

    // Admin (authorized)
    const adminReq = new NextRequest('http://localhost:3000/api/admin/registrations', {
      headers: {
        cookie: `evaluation_session_token=${adminSessionToken}`,
      },
    });
    const adminRes = await getRegistrationsRoute(adminReq);
    expect(adminRes.status).toBe(200);
    const body = await adminRes.json();
    expect(body.status).toBe('success');
    expect(Array.isArray(body.data.registrations)).toBe(true);
  });

  it('2. Enforces CSRF origin checks on approval and rejection mutations', async () => {
    const crossSiteReq = new NextRequest('http://localhost:3000/api/admin/registrations/reg-1/approve', {
      method: 'POST',
      headers: {
        cookie: `evaluation_session_token=${adminSessionToken}`,
        origin: 'https://malicious-site.com',
      },
    });
    const res = await approveRegistrationRoute(crossSiteReq, { params: { id: 'reg-1' } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Origin mismatch|Cross-site/i);
  });

  it('3. Dispatches admin notification to fsayyed@allianceindia.org upon OTP verification of pending applicant', async () => {
    // Register external applicant
    const regRes = await requestStateTeamOtp({
      firstName: 'Farid',
      lastName: 'Sayyed',
      workEmail: 'faridsayyed1010@gmail.com',
      requestedState: 'Maharashtra',
      organization: 'Civil Society Partner',
    });
    expect(regRes.success).toBe(true);

    const otpCode = regRes.otp!;
    MockEmailStore.clear(); // Clear signup emails to observe only verification emails

    // Verify OTP
    const verifyRes = await verifyStateTeamOtp({
      workEmail: 'faridsayyed1010@gmail.com',
      code: otpCode,
    });
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.status).toBe('PENDING_APPROVAL');

    // Check dispatched email to admin
    const emails = MockEmailStore.getAll();
    const adminEmail = emails.find((e) => e.to === 'fsayyed@allianceindia.org');
    expect(adminEmail).toBeDefined();
    expect(adminEmail!.subject).toContain('Maharashtra');
    expect(adminEmail!.text).toContain('Farid Sayyed');
    expect(adminEmail!.text).toContain('faridsayyed1010@gmail.com');
    expect(adminEmail!.text).toContain('Civil Society Partner');
    expect(adminEmail!.text).toContain('/supervisor/registrations');

    // STRICT INVARIANT: Zero OTP or invitation codes in admin notification
    expect(adminEmail!.text).not.toContain(otpCode);
    expect(adminEmail!.text).not.toContain('ALN-');
    expect(adminEmail!.html).not.toContain('ALN-');
  });

  it('4. Deduplicates admin notification on OTP verification retries', async () => {
    // Register external applicant
    const regRes = await requestStateTeamOtp({
      firstName: 'Pooja',
      lastName: 'Sharma',
      workEmail: 'pooja.sharma@ngo-india.org',
      requestedState: 'Delhi',
      organization: 'Child Support Trust',
    });
    const otpCode = regRes.otp!;
    MockEmailStore.clear();

    // Verify OTP 1st time
    await verifyStateTeamOtp({
      workEmail: 'pooja.sharma@ngo-india.org',
      code: otpCode,
    });

    const adminEmailsFirst = MockEmailStore.getAll().filter((e) => e.to === 'fsayyed@allianceindia.org');
    expect(adminEmailsFirst.length).toBe(1);

    // Verify OTP 2nd time (idempotent / retry)
    await verifyStateTeamOtp({
      workEmail: 'pooja.sharma@ngo-india.org',
      code: otpCode,
    });

    const adminEmailsSecond = MockEmailStore.getAll().filter((e) => e.to === 'fsayyed@allianceindia.org');
    expect(adminEmailsSecond.length).toBe(1); // Still exactly 1, no duplicate notification dispatched!
  });

  it('5. Rejects approval if applicant has not completed email verification', async () => {
    const unverifiedReg = await store.createStateTeamRegistration({
      firstName: 'Dev',
      lastName: 'Kumar',
      workEmail: 'dev.kumar@gmail.com',
      requestedState: 'Karnataka',
      organization: 'Dev NGO',
      autoApprove: false,
    });

    const approveReq = new NextRequest(`http://localhost:3000/api/admin/registrations/${unverifiedReg.id}/approve`, {
      method: 'POST',
      headers: {
        cookie: `evaluation_session_token=${adminSessionToken}`,
        origin: 'http://localhost:3000',
      },
    });

    const res = await approveRegistrationRoute(approveReq, { params: { id: unverifiedReg.id } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Email verification has not been completed');
  });

  it('6. Rejects approval for suspended or rejected registrations', async () => {
    const suspendedReg = await store.createStateTeamRegistration({
      firstName: 'Suresh',
      lastName: 'Patil',
      workEmail: 'suresh.patil@partner.org',
      requestedState: 'Gujarat',
      organization: 'Health Partner',
      autoApprove: false,
    });
    await store.verifyStateTeamEmail('suresh.patil@partner.org');
    suspendedReg.status = 'SUSPENDED';

    const approveReq = new NextRequest(`http://localhost:3000/api/admin/registrations/${suspendedReg.id}/approve`, {
      method: 'POST',
      headers: {
        cookie: `evaluation_session_token=${adminSessionToken}`,
        origin: 'http://localhost:3000',
      },
    });

    const res = await approveRegistrationRoute(approveReq, { params: { id: suspendedReg.id } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Suspended registration cannot be approved');
  });

  it('7. Full Workflow: Pending applicant email verified -> Admin approves -> Invitation active -> Coordinator notified', async () => {
    // 1. Coordinator registers
    const regRes = await requestStateTeamOtp({
      firstName: 'Farid',
      lastName: 'Sayyed',
      workEmail: 'faridsayyed1010@gmail.com',
      requestedState: 'Maharashtra',
      organization: 'Alliance Partner',
    });
    const otpCode = regRes.otp!;

    // 2. Coordinator verifies email OTP
    await verifyStateTeamOtp({
      workEmail: 'faridsayyed1010@gmail.com',
      code: otpCode,
    });

    // 3. Before approval, check that invitation exists but is not yet active for field users
    const inv = await store.getActiveInvitationForCoordinator(regRes.registration.id);
    expect(inv).toBeDefined();

    // 4. Admin approves registration
    MockEmailStore.clear();
    const approveReq = new NextRequest(`http://localhost:3000/api/admin/registrations/${regRes.registration.id}/approve`, {
      method: 'POST',
      headers: {
        cookie: `evaluation_session_token=${adminSessionToken}`,
        origin: 'http://localhost:3000',
      },
    });

    const approveRes = await approveRegistrationRoute(approveReq, { params: { id: regRes.registration.id } });
    expect(approveRes.status).toBe(200);

    // 5. Verification of approved record
    const updated = await store.getStateTeamRegistrationById(regRes.registration.id);
    expect(updated!.status).toBe('APPROVED');
    expect(updated!.approvedBy).toContain('System Administrator');
    expect(updated!.approvedAt).toBeDefined();

    // 6. Check that approval notification email was sent to the coordinator
    const emails = MockEmailStore.getAll();
    const coordEmail = emails.find((e) => e.to === 'faridsayyed1010@gmail.com');
    expect(coordEmail).toBeDefined();
    expect(coordEmail!.subject).toContain('Registration Approved');
    expect(coordEmail!.text).toContain('Farid Sayyed');
    expect(coordEmail!.text).toContain('Maharashtra');

    // 7. Check that existing invitation is now valid without generating duplicates
    const invAfterApproval = await store.getActiveInvitationForCoordinator(regRes.registration.id);
    expect(invAfterApproval!.id).toBe(inv!.id); // EXACT SAME INVITATION, ZERO DUPLICATE!
  });

  it('8. Rejects registration with reason and records in notes', async () => {
    const reg = await store.createStateTeamRegistration({
      firstName: 'Amit',
      lastName: 'Verma',
      workEmail: 'amit.verma@unknown.org',
      requestedState: 'Rajasthan',
      organization: 'Unknown Org',
      autoApprove: false,
    });
    await store.verifyStateTeamEmail('amit.verma@unknown.org');

    const rejectReq = new NextRequest(`http://localhost:3000/api/admin/registrations/${reg.id}/reject`, {
      method: 'POST',
      headers: {
        cookie: `evaluation_session_token=${adminSessionToken}`,
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ reason: 'Unverified organizational affiliation' }),
    });

    const rejectRes = await rejectRegistrationRoute(rejectReq, { params: { id: reg.id } });
    expect(rejectRes.status).toBe(200);

    const updated = await store.getStateTeamRegistrationById(reg.id);
    expect(updated!.status).toBe('REJECTED');
    expect(updated!.notes).toContain('Unverified organizational affiliation');
  });

  it('9. Explicit POST /api/admin/registrations/[id]/notify dispatches approval-request email and links to exact id', async () => {
    const reg = await store.createStateTeamRegistration({
      firstName: 'Farid',
      lastName: 'Sayyed',
      workEmail: 'faridsayyed1010@gmail.com',
      requestedState: 'Maharashtra',
      organization: 'CSC Sagar',
      autoApprove: false,
    });
    await store.verifyStateTeamEmail('faridsayyed1010@gmail.com');

    MockEmailStore.clear();

    const notifyReq = new NextRequest(`http://localhost:3000/api/admin/registrations/${reg.id}/notify`, {
      method: 'POST',
      headers: {
        cookie: `evaluation_session_token=${adminSessionToken}`,
        origin: 'http://localhost:3000',
      },
    });

    const notifyRes = await notifyRegistrationRoute(notifyReq, { params: { id: reg.id } });
    expect(notifyRes.status).toBe(200);

    const resJson = await notifyRes.json();
    expect(resJson.status).toBe('success');
    expect(resJson.data.providerAccepted).toBe(true);
    expect(resJson.data.recipient).toBe('fsayyed@allianceindia.org');
    expect(resJson.data.reviewUrl).toBe(`https://childcare-support-phase-3.vercel.app/supervisor/registrations?id=${reg.id}`);

    const emails = MockEmailStore.getAll().filter((e) => e.to === 'fsayyed@allianceindia.org');
    expect(emails.length).toBe(1);
    expect(emails[0].html).toContain('Review application');
    expect(emails[0].html).toContain(`id=${reg.id}`);
    expect(emails[0].text).toContain(`id=${reg.id}`);
  });
});
