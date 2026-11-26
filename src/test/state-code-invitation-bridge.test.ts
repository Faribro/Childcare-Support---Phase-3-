import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import {
  MockEmailStore,
  AppsScriptEmailProvider,
} from '@/lib/server/emailProvider';
import {
  clearRegistry,
  createMockFirestore,
  setFirestoreDbForTesting,
  registerCredential,
} from '@/lib/server/credentialRegistry';
import {
  setLeaderAuthStoreForTesting,
  MemoryLeaderAuthStore,
} from '@/lib/server/leaderAuthStore';
import {
  resetLeaderIdentitiesForTesting,
  setLeaderActiveStatusForTesting,
} from '@/lib/server/leaderIdentityStore';
import { requestLeadershipAuthCode } from '@/lib/server/leaderAuthChallenge';
import { POST as sheetBridgePost } from '@/app/api/admin/state-team-invitations/sheet-bridge/route';
import { POST as registerRoute } from '@/app/api/auth/state-team/register/route';
import { POST as verifyOtpRoute } from '@/app/api/auth/state-team/verify-otp/route';
import { STATE_CATALOG } from '@/lib/constants/stateCatalog';

describe('Google Sheet State Code Invitation Bridge & Security Controls', () => {
  const originalEnv = { ...process.env };
  let store: MemoryOnboardingStore;
  let leaderAuthStore: MemoryLeaderAuthStore;

  const BRIDGE_SECRET = 'sheet-bridge-secret-only-min-32-chars!!';
  const OTHER_WEBHOOK_SECRET = 'different-webhook-secret-must-not-work!!';

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    delete process.env.LEADERSHIP_ALLOWLIST_JSON;
    clearRegistry();
    MockEmailStore.clear();
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
    leaderAuthStore = new MemoryLeaderAuthStore();
    setLeaderAuthStoreForTesting(leaderAuthStore);
    setFirestoreDbForTesting(createMockFirestore());
    resetLeaderIdentitiesForTesting();

    process.env.SESSION_SECRET = 'sec-bridge-session-key-min-32-chars-ok';
    process.env.SHEET_INVITATION_BRIDGE_SECRET = BRIDGE_SECRET;
    process.env.WEBHOOK_SECRET = OTHER_WEBHOOK_SECRET;
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example.org';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
    resetLeaderIdentitiesForTesting();
    setOnboardingStoreForTesting(null);
    setLeaderAuthStoreForTesting(null);
  });

  it('rejects calls without dedicated SHEET_INVITATION_BRIDGE_SECRET, rejects WEBHOOK_SECRET reuse, and fails closed if unset', async () => {
    const baseReq = (headers: Record<string, string>) =>
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Asha Kale',
          recipientEmail: 'asha.kale@example.org',
          assignedState: 'Maharashtra',
        }),
      });

    // Missing header -> 401
    const resMissing = await sheetBridgePost(baseReq({}));
    expect(resMissing.status).toBe(401);

    // Reusing WEBHOOK_SECRET must fail -> 401
    const resReusedWebhook = await sheetBridgePost(
      baseReq({ 'x-invitation-bridge-secret': OTHER_WEBHOOK_SECRET })
    );
    expect(resReusedWebhook.status).toBe(401);

    // Unconfigured secret fails closed -> 503
    delete process.env.SHEET_INVITATION_BRIDGE_SECRET;
    const resUnset = await sheetBridgePost(
      baseReq({ 'x-invitation-bridge-secret': BRIDGE_SECRET })
    );
    expect(resUnset.status).toBe(503);
    expect(MockEmailStore.getAll()).toHaveLength(0);
  });

  it('rejects unauthorised or deactivated senders even when holding valid bridge secret', async () => {
    const resOutsider = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-invitation-bridge-secret': BRIDGE_SECRET,
        },
        body: JSON.stringify({
          actorEmail: 'outsider@example.org',
          recipientName: 'Asha Kale',
          recipientEmail: 'asha.kale@example.org',
          assignedState: 'Maharashtra',
        }),
      })
    );
    expect(resOutsider.status).toBe(403);
    expect((await resOutsider.json()).code).toBe('FORBIDDEN_SENDER');
    expect(MockEmailStore.getAll()).toHaveLength(0);

    // Deactivated leader in allowlist also rejected (fatima.sheikh@example.org is inactive fixture)
    const resInactive = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-invitation-bridge-secret': BRIDGE_SECRET,
        },
        body: JSON.stringify({
          actorEmail: 'fatima.sheikh@example.org',
          recipientName: 'Asha Kale',
          recipientEmail: 'asha.kale@example.org',
          assignedState: 'Maharashtra',
        }),
      })
    );
    expect(resInactive.status).toBe(403);
    expect(MockEmailStore.getAll()).toHaveLength(0);
  });

  it('validates recipient name, email format, and canonical 36-state catalog server-side', async () => {
    const callBridge = (payload: any) =>
      sheetBridgePost(
        new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-invitation-bridge-secret': BRIDGE_SECRET,
          },
          body: JSON.stringify({
            actorEmail: 'rajiv.menon@example.org',
            ...payload,
          }),
        })
      );

    expect(
      (
        await callBridge({
          recipientName: 'A',
          recipientEmail: 'valid@example.org',
          assignedState: 'Maharashtra',
        })
      ).status
    ).toBe(400);

    expect(
      (
        await callBridge({
          recipientName: 'Valid Name',
          recipientEmail: 'not-an-email',
          assignedState: 'Maharashtra',
        })
      ).status
    ).toBe(400);

    // Numeric LGD code or fabricated state is not an accepted state assignment unless resolved via canonical table
    expect(
      (
        await callBridge({
          recipientName: 'Valid Name',
          recipientEmail: 'valid@example.org',
          assignedState: 'Nonexistent State',
        })
      ).status
    ).toBe(400);

    expect(
      (
        await callBridge({
          recipientName: 'Valid Name',
          recipientEmail: 'valid@example.org',
          assignedState: '027',
        })
      ).status
    ).toBe(400);
    expect(MockEmailStore.getAll()).toHaveLength(0);
  });

  it('issues invite via app mechanism, alerts all active administrators, and NEVER returns plainCode to bridge caller', async () => {
    // Isolate active allowlist set cleanly for deterministic notification verification
    setLeaderActiveStatusForTesting('lead-sanjay-deshmukh', false);

    const res = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-invitation-bridge-secret': BRIDGE_SECRET,
        },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Meera Joshi',
          recipientEmail: 'meera.joshi@example.org',
          assignedState: 'Lakshadweep',
        }),
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    const rawJsonStr = JSON.stringify(json);

    expect(json.status).toBe('success');
    expect(json.invitation.assignedState).toBe('Lakshadweep');
    expect(json.emailDispatched).toBe(true);
    expect(json.plainCode).toBeUndefined();
    expect(rawJsonStr).not.toMatch(/ALN-/);
    expect(json.adminNotifiedCount).toBeGreaterThanOrEqual(2);

    // Verify recipient received single-use email-bound code
    const recipientMail = MockEmailStore.getLastFor('meera.joshi@example.org');
    expect(recipientMail).toBeDefined();
    expect(recipientMail?.otp).toMatch(/^ALN-LD-/);
    expect(recipientMail?.text).toContain('Hello Meera Joshi');
    expect(rawJsonStr).not.toContain(recipientMail!.otp!);

    // Verify active administrators received alert without invite code or bridge secret
    const adminMail1 = MockEmailStore.getLastFor('rajiv.menon@example.org');
    const adminMail2 = MockEmailStore.getLastFor('ananya.roy@example.org');
    expect(adminMail1).toBeDefined();
    expect(adminMail2).toBeDefined();
    expect(adminMail1?.subject).toContain('Security Alert');
    expect(adminMail1?.text).not.toContain(recipientMail!.otp!);
    expect(adminMail1?.text).not.toContain(BRIDGE_SECRET);
    expect(adminMail1?.text).toContain('meera.joshi@example.org');
    expect(adminMail1?.text).toContain('Lakshadweep');

    // Verify the emailed invite code actually works through standard registration + OTP signup
    const regRes = await registerRoute(
      new NextRequest('http://localhost:3000/api/auth/state-team/register', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Meera',
          lastName: 'Joshi',
          workEmail: 'meera.joshi@example.org',
          requestedState: 'Delhi', // Must be overridden by server invitation's assignedState (Lakshadweep)
          organization: 'Alliance Partner',
          invitationCode: recipientMail!.otp!,
        }),
      })
    );
    expect(regRes.status).toBe(200);
    const otpMail = MockEmailStore.getLastFor('meera.joshi@example.org');
    const verifyRes = await verifyOtpRoute(
      new NextRequest('http://localhost:3000/api/auth/state-team/verify-otp', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workEmail: 'meera.joshi@example.org',
          code: otpMail!.otp!,
        }),
      })
    );
    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.registrationStatus).toBe('APPROVED');
    expect(verifyJson.data.session.allowedStates).toEqual(['Lakshadweep']);
  });

  it('rejects duplicate invitations, existing registrations, and active accounts with 409 without overwriting', async () => {
    // 1. Active duplicate invite
    const firstRes = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invitation-bridge-secret': BRIDGE_SECRET },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Dup One',
          recipientEmail: 'dup.invite@example.org',
          assignedState: 'Kerala',
        }),
      })
    );
    expect(firstRes.status).toBe(201);
    const firstJson = await firstRes.json();

    const secondRes = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invitation-bridge-secret': BRIDGE_SECRET },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Dup One Modified',
          recipientEmail: 'dup.invite@example.org',
          assignedState: 'Goa',
        }),
      })
    );
    expect(secondRes.status).toBe(409);
    const secondJson = await secondRes.json();
    expect(secondJson.code).toBe('DUPLICATE_OR_EXISTING_ACCOUNT');
    // Non-enumerating error must NOT expose prior assigned state 'Kerala'
    expect(secondJson.error).not.toMatch(/Kerala/i);
    const invites = await store.listStateTeamAccessInvitations();
    expect(invites.filter((i) => i.invitedEmail === 'dup.invite@example.org')).toHaveLength(1);
    expect(invites[0].id).toBe(firstJson.invitation.id);
    expect(invites[0].assignedState).toBe('Kerala');

    // 2. Existing registration without invite
    await store.createStateTeamRegistration({
      firstName: 'Existing',
      lastName: 'Reg',
      workEmail: 'existing.reg@example.org',
      requestedState: 'Odisha',
      organization: 'Partner',
      autoApprove: false,
    });
    const regDupRes = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invitation-bridge-secret': BRIDGE_SECRET },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Existing Reg',
          recipientEmail: 'existing.reg@example.org',
          assignedState: 'Assam',
        }),
      })
    );
    expect(regDupRes.status).toBe(409);
    expect((await store.getStateTeamRegistrationByEmail('existing.reg@example.org'))?.requestedState).toBe('Odisha');

    // 3. Existing active credential
    registerCredential({
      id: 'cred-active-1',
      accessIdentifier: 'active.staff@example.org',
      displayName: 'Active Staff',
      credentialKind: 'STATE_EVALUATION',
      stateCode: 'TN',
      programmeScope: ['alliance-childcare-phase3'],
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$mock$mock',
      credentialVersion: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const activeCredRes = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invitation-bridge-secret': BRIDGE_SECRET },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Active Staff',
          recipientEmail: 'active.staff@example.org',
          assignedState: 'Bihar',
        }),
      })
    );
    expect(activeCredRes.status).toBe(409);
  });

  it('enforces per-actor and per-recipient sliding window rate limits (429)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await sheetBridgePost(
        new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-invitation-bridge-secret': BRIDGE_SECRET },
          body: JSON.stringify({
            actorEmail: 'rajiv.menon@example.org',
            recipientName: `Person ${i}`,
            recipientEmail: `person.${i}@example.org`,
            assignedState: STATE_CATALOG[i % STATE_CATALOG.length].canonicalName,
          }),
        })
      );
      expect(res.status).toBe(201);
    }

    const eleventhRes = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invitation-bridge-secret': BRIDGE_SECRET },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Person 11',
          recipientEmail: 'person.11@example.org',
          assignedState: 'Gujarat',
        }),
      })
    );
    expect(eleventhRes.status).toBe(429);
    expect(eleventhRes.headers.get('Retry-After')).toBeDefined();
  });

  it('propagates remainingDailyQuota from AppsScriptEmailProvider when Apps Script reports quota', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, remainingDailyQuota: 1487 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new AppsScriptEmailProvider(
      'https://script.google.com/macros/s/MOCK_DEPLOY/exec',
      'mock-dispatch-secret-32-chars-ok'
    );
    const res = await provider.sendEmail({
      to: 'recipient@example.org',
      subject: 'Invite',
      html: '<p>Test</p>',
      text: 'Test',
      otp: 'ALN-MH-2345-6789',
      action: 'send_transactional_email',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.remainingDailyQuota).toBe(1487);
  });

  it('revokes orphaned invitation if email dispatch fails in sheet-bridge so retry is not blocked', async () => {
    process.env.EMAIL_PROVIDER = 'apps_script';
    process.env.APPS_SCRIPT_WEBAPP_URL = 'https://script.google.com/macros/s/MOCK_DEPLOY/exec';
    process.env.APPS_SCRIPT_DISPATCH_SECRET = 'mock-dispatch-secret-32-chars-ok';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'AUTH_QUOTA_DEPLETED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const failRes = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invitation-bridge-secret': BRIDGE_SECRET },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Retry Candidate',
          recipientEmail: 'retry.candidate@example.org',
          assignedState: 'Assam',
        }),
      })
    );
    expect(failRes.status).toBe(502);
    expect((await failRes.json()).code).toBe('EMAIL_DISPATCH_FAILED');

    const storedAfterFail = await store.listStateTeamAccessInvitations();
    const failedInvite = storedAfterFail.find((i) => i.invitedEmail === 'retry.candidate@example.org');
    expect(failedInvite?.status).toBe('REVOKED');

    // Subsequent retry after email gateway recovery succeeds (not blocked by 409)
    delete process.env.EMAIL_PROVIDER;
    const retryRes = await sheetBridgePost(
      new NextRequest('http://localhost:3000/api/admin/state-team-invitations/sheet-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invitation-bridge-secret': BRIDGE_SECRET },
        body: JSON.stringify({
          actorEmail: 'rajiv.menon@example.org',
          recipientName: 'Retry Candidate',
          recipientEmail: 'retry.candidate@example.org',
          assignedState: 'Assam',
        }),
      })
    );
    expect(retryRes.status).toBe(201);
  });

  it('equalises response floor on leadership OTP request when LEADER_OTP_TIMING_FLOOR_MS is configured', async () => {
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'true';
    process.env.LEADER_OTP_TIMING_FLOOR_MS = '120';

    const t0 = Date.now();
    const resUnknown = await requestLeadershipAuthCode({
      email: 'unknown.person@example.org',
      deviceBindingSecret: 'device-binding-secret-123456',
      clientIp: '127.0.0.1',
    });
    const unknownElapsed = Date.now() - t0;

    const t1 = Date.now();
    const resKnown = await requestLeadershipAuthCode({
      email: 'rajiv.menon@example.org',
      deviceBindingSecret: 'device-binding-secret-123456',
      clientIp: '127.0.0.2',
    });
    const knownElapsed = Date.now() - t1;

    expect(resUnknown.statusCode).toBe(200);
    expect(resKnown.statusCode).toBe(200);
    expect(unknownElapsed).toBeGreaterThanOrEqual(105);
    expect(knownElapsed).toBeGreaterThanOrEqual(105);
  });
});
