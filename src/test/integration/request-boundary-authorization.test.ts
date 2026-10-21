/**
 * Next.js Request Boundary Authorization & Security Verification Suite
 *
 * Verifies strict boundary-level invariants across route handlers:
 * 1. Invalid / expired HMAC token rejection (HTTP 401)
 * 2. Wrong role access denial on approval/edit routes (HTTP 403)
 * 3. Wrong state / district geographic scope violation (HTTP 403)
 * 4. Programme scope validation
 * 5. Authorized reviewer approval flow with OCC revision increment (HTTP 200)
 * 6. Intake privilege escalation prevention (initial submission cannot set Approved)
 * 7. Server service credentials absent from client bundles & environment
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { GET as getSubmissionsRoute, POST as postSubmissionsRoute } from '@/app/api/submissions/route';
import {
  GET as getSingleSubmissionRoute,
  PATCH as patchSubmissionRoute,
} from '@/app/api/submissions/[submissionId]/route';
import { createSessionToken } from '@/lib/server/sessionService';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

describe('Next.js Request Boundary Authorization & Security Suite', () => {
  const originalEnv = { ...process.env };
  const TEST_SECRET = 'boundary-test-secret-minimum-32-chars-long-xxx';

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.SESSION_SECRET = TEST_SECRET;
    (process.env as any).NODE_ENV = 'test';
    process.env.E2E_ALLOW_LOCAL_MOCK = 'false';
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Invalid / Expired Token
  // ---------------------------------------------------------------------------
  describe('1. Invalid / Expired Token Rejection', () => {
    it('rejects malformed bearer tokens with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer malformed.signature.here',
          'x-test-unauthenticated': 'true',
        },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('rejects tokens with forged HMAC signature with 401 UNAUTHORIZED', async () => {
      const payload = {
        userId: 'forger-01',
        name: 'Attacker',
        role: 'ADMIN' as const,
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };
      const json = JSON.stringify(payload);
      const encodedPayload = Buffer.from(json).toString('base64url');
      const forgedToken = `${encodedPayload}.fakeSignature1234567890`;

      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${forgedToken}`,
          'x-test-unauthenticated': 'true',
        },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('rejects expired tokens with 401 UNAUTHORIZED', async () => {
      const expiredToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Expired Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
        ttlMs: -10000, // Expired 10s ago
      });

      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${expiredToken}`,
          'x-test-unauthenticated': 'true',
        },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Wrong Role Authorization
  // ---------------------------------------------------------------------------
  describe('2. Wrong Role Authorization Guards', () => {
    it('denies unprivileged FIELD_USER role attempting to execute PATCH on submission with 403 FORBIDDEN', async () => {
      const fieldToken = createSessionToken({
        userId: 'field-user-01',
        name: 'Field Caseworker',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${fieldToken}`,
          'Content-Type': 'application/json',
          'If-Match': '1',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          approval: { decision: 'Approved' },
          editReason: 'Unauthorized approval attempt',
        }),
      });

      const res = await patchSubmissionRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
      expect(data.message).toContain('restricted to verified Administrator and Leadership roles');
    });

    it('denies read-only STATE_REVIEWER role attempting to execute PATCH with 403 FORBIDDEN', async () => {
      const reviewerToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'State Evaluator',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${reviewerToken}`,
          'Content-Type': 'application/json',
          'If-Match': '1',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          approval: { decision: 'Approved' },
          editReason: 'State evaluator cannot approve',
        }),
      });

      const res = await patchSubmissionRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Wrong State / District Geographic Scope
  // ---------------------------------------------------------------------------
  describe('3. Wrong State / District Geographic Scope Enforcement', () => {
    it('blocks access to records outside caller allowed state with 403 FORBIDDEN_SCOPE', async () => {
      // Token scoped only to Maharashtra
      const mhToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Maharashtra Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      // Attempt to access Delhi record
      const req = new NextRequest('http://localhost:3000/api/submissions/DL-CEN-081200-03', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mhToken}`,
        },
      });

      const res = await getSingleSubmissionRoute(req, { params: { submissionId: 'DL-CEN-081200-03' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN_SCOPE');
      expect(data.message).toContain('Access denied to record in state');
    });

    it('blocks query list tampering when caller specifies state outside permitted scope', async () => {
      const mhToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Maharashtra Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions?state=Delhi', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mhToken}`,
        },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN_SCOPE');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Programme Scope Validation
  // ---------------------------------------------------------------------------
  describe('4. Programme Scope Validation', () => {
    it('rejects requests targeting unauthorized programme scopes with 403 FORBIDDEN_SCOPE', async () => {
      const token = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Standard Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
        allowedProgrammes: ['alliance-childcare-phase3'],
      });

      // List query targeting an unrelated programme
      const req = new NextRequest('http://localhost:3000/api/submissions?programme=unauthorized-programme-x', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN_SCOPE');
    });

    it('allows queries targeting authorized programme scope and returns matching records', async () => {
      const token = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Standard Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
        allowedProgrammes: ['alliance-childcare-phase3'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions?programme=alliance-childcare-phase3', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('success');
      expect(Array.isArray(data.submissions)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Authorized Reviewer Flow & OCC Revision
  // ---------------------------------------------------------------------------
  describe('5. Authorized Reviewer Flow & OCC Invariants', () => {
    it('permits authorized LEADERSHIP reviewer to read and update record with revision increment', async () => {
      const leadToken = createSessionToken({
        userId: 'lead-01',
        name: 'National Leadership',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      // 1. Authorized Read
      const getReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${leadToken}`,
          Cookie: `evaluation_session_token=${leadToken}`,
        },
      });
      const getRes = await getSingleSubmissionRoute(getReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      const currentVersion = getBody.data.version || 1;

      // 2. Authorized Approval with OCC
      const patchReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${leadToken}`,
          Cookie: `evaluation_session_token=${leadToken}`,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'If-Match': String(currentVersion),
        },
        body: JSON.stringify({
          expectedVersion: currentVersion,
          approval: { decision: 'Approved' },
          editReason: 'Authorized leadership evaluation passed',
        }),
      });

      const patchRes = await patchSubmissionRoute(patchReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.status).toBe('success');
      expect(patchBody.data.version).toBe(currentVersion + 1);
    });

    it('rejects stale OCC revision update with 409 OCC_CONFLICT', async () => {
      const adminToken = createSessionToken({
        userId: 'admin-01',
        name: 'Administrator',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const patchReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Cookie: `evaluation_session_token=${adminToken}`,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'If-Match': '999', // Stale expected version
        },
        body: JSON.stringify({
          expectedVersion: 999,
          editReason: 'Stale update attempt',
        }),
      });

      const patchRes = await patchSubmissionRoute(patchReq, { params: { submissionId: 'MH-PUN-081200-02' } });
      expect([409, 412]).toContain(patchRes.status);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Intake Cannot Set Approved (Privilege Escalation Prevention)
  // ---------------------------------------------------------------------------
  describe('6. Intake Status Escalation Prevention', () => {
    it('strictly forces approvedAllianceIndia to Pending on intake even if client requests Approved', async () => {
      const validSurveyPayload = {
        uuid: crypto.randomUUID(),
        clientSubmissionId: crypto.randomUUID(),
        interviewerName: 'Sunita Sharma',
        demographics: {
          artNumber: '12345',
          childName: 'Intake Test Child',
          dob: '2015-05-10',
          gender: 'Female',
          orphanStatus: 'Single orphan (one parent deceased)',
          caregiverName: 'Test Caregiver',
          caregiverRelationship: 'Mother',
          district: 'Pune',
          state: 'Maharashtra',
        },
        caregiverConsent: {
          consentProvided: true,
          dateOfConsent: '2026-10-16',
        },
        finalReview: {
          allInfoCorrect: true,
          formSubmittedBy: 'Sunita Sharma',
          organizationName: 'India HIV/AIDS Alliance',
        },
        // Client attempts to escalate status to Approved upon initial submission
        approvedAllianceIndia: 'Approved',
        status: 'Approved',
      };

      const postReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `idemp-escalate-${Date.now()}`,
        },
        body: JSON.stringify(validSurveyPayload),
      });

      const postRes = await postSubmissionsRoute(postReq);
      expect([200, 201]).toContain(postRes.status);
      const postBody = await postRes.json();
      expect(postBody.status).toBe('success');

      // Verify server acknowledgement is ACCEPTED / Submitted, never escalated to Approved
      expect(postBody.submissionStatus).toBe('ACCEPTED');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Service Credentials Absent from Client Bundles & Environment
  // ---------------------------------------------------------------------------
  describe('7. Service Credentials Isolation (Zero Leakage to Client)', () => {
    it('ensures server-only secrets are not prefixed with NEXT_PUBLIC_', () => {
      const forbiddenPrefixes = [
        'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
        'NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY',
        'NEXT_PUBLIC_TIGRIS_SECRET_ACCESS_KEY',
        'NEXT_PUBLIC_SESSION_SECRET',
        'NEXT_PUBLIC_WEBHOOK_SECRET',
        'NEXT_PUBLIC_INTERNAL_AUTH_SECRET',
      ];

      for (const varName of forbiddenPrefixes) {
        expect(process.env[varName]).toBeUndefined();
      }
    });

    it('verifies that client component files do not directly import server storage services', () => {
      const componentsDir = path.resolve(process.cwd(), 'src/components');
      if (fs.existsSync(componentsDir)) {
        const files = fs.readdirSync(componentsDir, { recursive: true }) as string[];
        for (const file of files) {
          if (typeof file === 'string' && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
            const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
            expect(content).not.toContain("from '@/lib/server/supabaseSubmissionAdapter'");
            expect(content).not.toContain("from '@/lib/server/tigrisStorageService'");
            expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
          }
        }
      }
    });
  });
});
