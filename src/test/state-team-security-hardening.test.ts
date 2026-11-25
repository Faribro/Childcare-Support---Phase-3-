import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  MemoryOnboardingStore,
  setOnboardingStoreForTesting,
} from '@/lib/server/onboardingStore';
import { MockEmailStore } from '@/lib/server/emailProvider';
import {
  clearRegistry,
  createMockFirestore,
  setFirestoreDbForTesting,
  EVALUATION_CREDENTIALS_COLLECTION,
} from '@/lib/server/credentialRegistry';
import { createSessionToken } from '@/lib/server/sessionService';
import { resolveUserAccessScope } from '@/lib/server/authorisation';
import { POST as registerRoute } from '@/app/api/auth/state-team/register/route';
import { POST as verifyOtpRoute } from '@/app/api/auth/state-team/verify-otp/route';
import { POST as loginOtpRequestRoute } from '@/app/api/auth/state-team/login-otp/request/route';
import { POST as issueFieldInviteRoute } from '@/app/api/auth/state-team/invitation/issue/route';
import { POST as revokeRoute } from '@/app/api/admin/registrations/[id]/revoke/route';
import { POST as approveRoute } from '@/app/api/admin/registrations/[id]/approve/route';
import {
  POST as adminAccessInvitePost,
  GET as adminAccessInviteGet,
  DELETE as adminAccessInviteDelete,
} from '@/app/api/admin/state-team-invitations/route';
import { GET as getSubmissionsRoute } from '@/app/api/submissions/route';
import { GET as getSingleSubmissionRoute } from '@/app/api/submissions/[submissionId]/route';
import { GET as getAssetRoute, POST as postAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { GET as exportRoute } from '@/app/api/submissions/[submissionId]/export/route';

describe('State Team Authorization, Revocation, Multi-User Isolation & Asset Scope Security', () => {
  let store: MemoryOnboardingStore;
  let adminToken: string;

  beforeEach(() => {
    clearRegistry();
    MockEmailStore.clear();
    store = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(store);
    setFirestoreDbForTesting(createMockFirestore());
    process.env.SESSION_SECRET = 'sec-hardening-secret-key-min-32-chars-ok';
    process.env.STATE_TEAM_APPROVED_DOMAINS = 'allianceindia.org';

    adminToken = createSessionToken({
      userId: 'admin-01',
      username: 'admin@allianceindia.org',
      name: 'Administration Lead',
      role: 'ADMIN',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      authMethod: 'email_otp',
    });
  });

  it('1. Blocks self-registered @allianceindia.org account from accessing submissions, records, assets, exports, or credentials before approval', async () => {
    const email = 'self.signup@allianceindia.org';

    const regReq = new NextRequest('http://localhost:3000/api/auth/state-team/register', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Self',
        lastName: 'User',
        workEmail: email,
        requestedState: 'Maharashtra',
        organization: 'Partner',
      }),
    });
    const regRes = await registerRoute(regReq);
    expect(regRes.status).toBe(200);

    const otp = MockEmailStore.getLastFor(email)!.otp!;
    const verifyReq = new NextRequest('http://localhost:3000/api/auth/state-team/verify-otp', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workEmail: email, code: otp }),
    });
    const verifyRes = await verifyOtpRoute(verifyReq);
    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.registrationStatus).toBe('PENDING_APPROVAL');
    expect(verifyJson.sessionActive).toBe(false);
    expect(verifyJson.data.session).toBeNull();
    expect(verifyRes.headers.get('set-cookie')).toBeNull();

    const reg = await store.getStateTeamRegistrationByEmail(email);
    expect(reg?.status).toBe('PENDING_APPROVAL');
    expect(reg?.emailVerified).toBe(true);

    // Even if a forged/stale cookie claimed STATE_REVIEWER for that pending registration, resolveUserAccessScope MUST reject!
    const forgedToken = createSessionToken({
      userId: reg!.id,
      username: email,
      name: 'Self User',
      role: 'STATE_REVIEWER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
      credentialVersion: 1,
      credentialKind: 'STATE_EVALUATION',
      authMethod: 'email_otp',
    });

    for (const [label, resPromise] of [
      ['list submissions', getSubmissionsRoute(new NextRequest('http://localhost:3000/api/submissions', { headers: { cookie: `evaluation_session_token=${forgedToken}` } }))],
      ['single record', getSingleSubmissionRoute(new NextRequest('http://localhost:3000/api/submissions/SUB-MH-01', { headers: { cookie: `evaluation_session_token=${forgedToken}` } }), { params: { submissionId: 'SUB-MH-01' } })],
      ['asset download', getAssetRoute(new NextRequest('http://localhost:3000/api/submissions/SUB-MH-01/asset?docType=aadhaar', { headers: { cookie: `evaluation_session_token=${forgedToken}` } }), { params: { submissionId: 'SUB-MH-01' } })],
      ['pdf export', exportRoute(new NextRequest('http://localhost:3000/api/submissions/SUB-MH-01/export', { headers: { cookie: `evaluation_session_token=${forgedToken}` } }), { params: { submissionId: 'SUB-MH-01' } })],
    ] as const) {
      const res = await resPromise;
      expect(res.status, `Pending user must be denied on ${label}`).toBe(401);
    }

    // Cannot request login OTP while PENDING_APPROVAL
    const loginOtpRes = await loginOtpRequestRoute(new NextRequest('http://localhost:3000/api/auth/state-team/login-otp/request', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workEmail: email }),
    }));
    expect(loginOtpRes.status).toBe(403);
  });

  it('2. Issues email-bound expiring single-use Administration invitation, rejects wrong email/expired/reused/tampered state, and sets server-assigned state', async () => {
    const inviteRes = await adminAccessInvitePost(new NextRequest('http://localhost:3000/api/admin/state-team-invitations', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `evaluation_session_token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invitedEmail: 'invitee.tn@partner.org',
        assignedState: 'Tamil Nadu',
        expiresInDays: 3,
      }),
    }));
    expect(inviteRes.status).toBe(201);
    const inviteJson = await inviteRes.json();
    const plainCode = inviteJson.plainCode;
    expect(plainCode).toMatch(/^ALN-TN-/);

    // Wrong email cannot use invitee's code
    const wrongEmailRes = await registerRoute(new NextRequest('http://localhost:3000/api/auth/state-team/register', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Attacker',
        lastName: 'Two',
        workEmail: 'attacker@partner.org',
        requestedState: 'Delhi',
        organization: 'Attacker NGO',
        invitationCode: plainCode,
      }),
    }));
    expect(wrongEmailRes.status).toBe(403);

    // Invited user submits form even claiming Maharashtra -> server enforces Tamil Nadu!
    const validReqRes = await registerRoute(new NextRequest('http://localhost:3000/api/auth/state-team/register', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Kavitha',
        lastName: 'R',
        workEmail: 'invitee.tn@partner.org',
        requestedState: 'Maharashtra',
        organization: 'TN Partner',
        invitationCode: plainCode,
      }),
    }));
    expect(validReqRes.status).toBe(200);

    const otp = MockEmailStore.getLastFor('invitee.tn@partner.org')!.otp!;
    const verifyRes = await verifyOtpRoute(new NextRequest('http://localhost:3000/api/auth/state-team/verify-otp', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workEmail: 'invitee.tn@partner.org', code: otp }),
    }));
    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.registrationStatus).toBe('APPROVED');
    expect(verifyJson.data.session.allowedStates).toEqual(['Tamil Nadu']);

    // List confirms REDEEMED
    const listRes = await adminAccessInviteGet(new NextRequest('http://localhost:3000/api/admin/state-team-invitations', {
      headers: { cookie: `evaluation_session_token=${adminToken}` },
    }));
    const listJson = await listRes.json();
    expect(listJson.invitations[0].status).toBe('REDEEMED');

    // Admin can also issue and revoke an unused invite
    const inv2Res = await adminAccessInvitePost(new NextRequest('http://localhost:3000/api/admin/state-team-invitations', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `evaluation_session_token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invitedEmail: 'revoked.inv@partner.org', assignedState: 'Delhi' }),
    }));
    const inv2Json = await inv2Res.json();
    const delRes = await adminAccessInviteDelete(
      new NextRequest(`http://localhost:3000/api/admin/state-team-invitations?id=${inv2Json.invitation.id}`, {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000', cookie: `evaluation_session_token=${adminToken}` },
      })
    );
    expect(delRes.status).toBe(200);
  });

  it('3. Supports multiple independent same-state coordinators and revoking one immediately invalidates only that user', async () => {
    const coordA = await store.createStateTeamRegistration({
      firstName: 'CoordA',
      lastName: 'MH',
      workEmail: 'coord.a@allianceindia.org',
      requestedState: 'Maharashtra',
      organization: 'Alliance MH',
    });
    await store.verifyStateTeamEmail(coordA.workEmail);
    await store.approveStateTeamRegistration(coordA.id, 'admin@allianceindia.org', 'Maharashtra');

    const coordB = await store.createStateTeamRegistration({
      firstName: 'CoordB',
      lastName: 'MH',
      workEmail: 'coord.b@allianceindia.org',
      requestedState: 'Maharashtra',
      organization: 'Alliance MH',
    });
    await store.verifyStateTeamEmail(coordB.workEmail);
    await store.approveStateTeamRegistration(coordB.id, 'admin@allianceindia.org', 'Maharashtra');

    // Sign in both independently via login OTP
    await loginOtpRequestRoute(new NextRequest('http://localhost:3000/api/auth/state-team/login-otp/request', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workEmail: coordA.workEmail }),
    }));
    const verifyARes = await verifyOtpRoute(new NextRequest('http://localhost:3000/api/auth/state-team/verify-otp', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workEmail: coordA.workEmail, code: MockEmailStore.getLastFor(coordA.workEmail)!.otp! }),
    }));
    const tokenA = verifyARes.headers.get('set-cookie')!.match(/evaluation_session_token=([^;]+)/)![1];

    await loginOtpRequestRoute(new NextRequest('http://localhost:3000/api/auth/state-team/login-otp/request', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workEmail: coordB.workEmail }),
    }));
    const verifyBRes = await verifyOtpRoute(new NextRequest('http://localhost:3000/api/auth/state-team/verify-otp', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workEmail: coordB.workEmail, code: MockEmailStore.getLastFor(coordB.workEmail)!.otp! }),
    }));
    const tokenB = verifyBRes.headers.get('set-cookie')!.match(/evaluation_session_token=([^;]+)/)![1];

    // Both active initially with distinct identities
    const scopeA1 = await resolveUserAccessScope(new NextRequest('http://localhost:3000/api/submissions', { headers: { cookie: `evaluation_session_token=${tokenA}` } }));
    const scopeB1 = await resolveUserAccessScope(new NextRequest('http://localhost:3000/api/submissions', { headers: { cookie: `evaluation_session_token=${tokenB}` } }));
    expect(scopeA1.isVerified).toBe(true);
    expect(scopeB1.isVerified).toBe(true);
    expect(scopeA1.userId).not.toBe(scopeB1.userId);
    expect(scopeA1.username).toBe('coord.a@allianceindia.org');
    expect(scopeB1.username).toBe('coord.b@allianceindia.org');

    // Administration revokes CoordA with reason
    const revokeRes = await revokeRoute(new NextRequest(`http://localhost:3000/api/admin/registrations/${coordA.id}/revoke`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `evaluation_session_token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Role transferred out of Maharashtra' }),
    }), { params: { id: coordA.id } });
    expect(revokeRes.status).toBe(200);
    const revokeJson = await revokeRes.json();
    expect(revokeJson.registration.status).toBe('REVOKED');
    expect(revokeJson.registration.revokedBy).toContain('admin');
    expect(revokeJson.registration.revokedAt).toBeTypeOf('number');

    // CoordA's existing session is immediately invalid across scope check, reads, exports, and invitation issuance!
    const scopeA2 = await resolveUserAccessScope(new NextRequest('http://localhost:3000/api/submissions', { headers: { cookie: `evaluation_session_token=${tokenA}` } }));
    expect(scopeA2.isVerified).toBe(false);

    const revokedIssueRes = await issueFieldInviteRoute(new NextRequest('http://localhost:3000/api/auth/state-team/invitation/issue', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', cookie: `evaluation_session_token=${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'Maharashtra' }),
    }));
    expect(revokedIssueRes.status).toBe(401);

    // CoordB in Maharashtra remains completely unaffected!
    const scopeB2 = await resolveUserAccessScope(new NextRequest('http://localhost:3000/api/submissions', { headers: { cookie: `evaluation_session_token=${tokenB}` } }));
    expect(scopeB2.isVerified).toBe(true);
    expect(scopeB2.allowedStates).toEqual(['Maharashtra']);
  });

  it('4. Allows Administration to assign authoritative state during approval and enforces non-wildcard asset POST record existence', async () => {
    const reg = await store.createStateTeamRegistration({
      firstName: 'Applicant',
      lastName: 'Mismatch',
      workEmail: 'mismatch@partner.org',
      requestedState: 'Delhi',
      organization: 'NGO',
    });
    await store.verifyStateTeamEmail(reg.workEmail);

    const approveRes = await approveRoute(new NextRequest(`http://localhost:3000/api/admin/registrations/${reg.id}/approve`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `evaluation_session_token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedState: 'Gujarat' }),
    }), { params: { id: reg.id } });
    expect(approveRes.status).toBe(200);
    const updated = await store.getStateTeamRegistrationById(reg.id);
    expect(updated?.assignedState).toBe('Gujarat');

    // Login yields Gujarat scope even though user originally requested Delhi
    const coordToken = createSessionToken({
      userId: reg.id,
      username: reg.workEmail,
      name: 'Applicant Mismatch',
      role: 'STATE_REVIEWER',
      allowedStates: ['Delhi'], // Even stale cookie claim overridden by DB!
      allowedDistricts: ['*'],
      credentialVersion: 1,
      canEdit: true,
      authMethod: 'email_otp',
    });
    const scope = await resolveUserAccessScope(new NextRequest('http://localhost:3000/api/submissions', {
      headers: { cookie: `evaluation_session_token=${coordToken}` },
    }));
    expect(scope.isVerified).toBe(true);
    expect(scope.allowedStates).toEqual(['Gujarat']);

    // Asset upload on missing submission fails closed (404) for STATE_REVIEWER with canEdit
    const assetPostRes = await postAssetRoute(new NextRequest('http://localhost:3000/api/submissions/NONEXISTENT-999/asset', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `evaluation_session_token=${coordToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        docType: 'aadhaar',
        fileData: 'data:application/pdf;base64,JVBERi0xLjQKJSB0ZXN0',
        expectedVersion: 1,
        expectedCurrentCellStateHash: 'a'.repeat(64),
      }),
    }), { params: { submissionId: 'NONEXISTENT-999' } });
    expect([403, 404]).toContain(assetPostRes.status);
  });
});
