import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE as deleteSubmissionRoute } from '@/app/api/submissions/[submissionId]/route';
import { GET as getSubmissionsRoute } from '@/app/api/submissions/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import {
  createSessionToken,
  getSessionSecret,
  verifySessionToken,
  hashPassword,
  verifyPassword,
  authenticateUser,
  resetPasswordHashCache,
} from '@/lib/server/sessionService';

describe('Issue #57: Scoped Auditable Access Control & Deletion Hardening', () => {
  beforeEach(() => {
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
    resetPasswordHashCache();
  });

  describe('CSRF Origin Defense on Mutating Endpoints', () => {
    it('rejects state-changing DELETE when Origin header is completely missing', async () => {
      const adminToken = createSessionToken({
        userId: 'admin-01',
        name: 'System Admin',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const missingOriginReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01', {
        method: 'DELETE',
        headers: {
          Cookie: `evaluation_session_token=${adminToken}`,
        },
      });

      const res = await deleteSubmissionRoute(missingOriginReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('CSRF_VIOLATION');
      expect(body.message).toContain('Missing Origin header');
    });

    it('rejects state-changing DELETE when Origin header does not match application host', async () => {
      const adminToken = createSessionToken({
        userId: 'admin-01',
        name: 'System Admin',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const spoofedOriginReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01', {
        method: 'DELETE',
        headers: {
          Origin: 'https://malicious-cross-origin.com',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
      });

      const res = await deleteSubmissionRoute(spoofedOriginReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('CSRF_VIOLATION');
      expect(body.message).toContain('Mismatched Origin');
    });
  });

  describe('Server-Enforced Role and Geographic Scope', () => {
    it('rejects unauthenticated caller attempting to DELETE record with 403 FORBIDDEN', async () => {
      const unauthenticatedReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          'x-test-unauthenticated': 'true',
        },
      });

      const res = await deleteSubmissionRoute(unauthenticatedReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FORBIDDEN');
      expect(body.message).toContain('Administrator or State Reviewer');
    });

    it('rejects FIELD_USER caller attempting to DELETE record with 403 FORBIDDEN', async () => {
      const fieldToken = createSessionToken({
        userId: 'field-user-01',
        name: 'Caseworker Ramesh',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      const fieldReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${fieldToken}`,
        },
      });

      const res = await deleteSubmissionRoute(fieldReq, {
        params: { submissionId: 'MH-PUN-081200-02' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FORBIDDEN');
    });

    it('rejects STATE_REVIEWER trying to delete record outside assigned state with 403 FORBIDDEN_SCOPE', async () => {
      const mhReviewerToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Reviewer Maharashtra',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      // WB-KOL-081200-01 is located in West Bengal
      const crossStateReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${mhReviewerToken}`,
        },
      });

      const res = await deleteSubmissionRoute(crossStateReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FORBIDDEN_SCOPE');
      expect(body.message).toContain('West Bengal');
    });

    it('allows STATE_REVIEWER to delete record within assigned state', async () => {
      const mhReviewerToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Reviewer Maharashtra',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      // MH-PUN-081200-02 is located in Maharashtra (Pune)
      const validStateReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${mhReviewerToken}`,
        },
      });

      const res = await deleteSubmissionRoute(validStateReq, {
        params: { submissionId: 'MH-PUN-081200-02' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
    });

    it('allows ADMIN to delete any record across states', async () => {
      const adminToken = createSessionToken({
        userId: 'admin-01',
        name: 'System Admin',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const adminReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: `evaluation_session_token=${adminToken}`,
        },
      });

      const res = await deleteSubmissionRoute(adminReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
    });
  });

  describe('Fail-Closed Session Secret & Argon2id Password Cryptography', () => {
    it('fails closed when SESSION_SECRET is missing or shorter than 32 characters', () => {
      const originalSecret = process.env.SESSION_SECRET;
      try {
        delete process.env.SESSION_SECRET;
        expect(() => getSessionSecret()).toThrow(/FATAL: SESSION_SECRET is not configured/);

        // Verification must return null rather than falling back to an insecure key
        const dummyToken = 'eyJhbGciOiJIUzI1NiJ9.test-sig';
        expect(verifySessionToken(dummyToken)).toBeNull();

        process.env.SESSION_SECRET = 'short-secret';
        expect(() => getSessionSecret()).toThrow(/minimum length requirement/);
        expect(verifySessionToken(dummyToken)).toBeNull();
      } finally {
        process.env.SESSION_SECRET = originalSecret;
      }
    });

    it('generates Argon2id hashes with unique salts and verifies constant-time matching', async () => {
      const samplePhrase = 'test-suite-fixture-arbitrary-hashing-sample';
      const hash1 = await hashPassword(samplePhrase);
      const hash2 = await hashPassword(samplePhrase);

      // Must be formatted as Argon2id
      expect(hash1.startsWith('$argon2id$')).toBe(true);
      expect(hash2.startsWith('$argon2id$')).toBe(true);

      // Library must generate a unique salt each time
      expect(hash1).not.toBe(hash2);

      // Verification succeeds with correct password
      expect(await verifyPassword(hash1, samplePhrase)).toBe(true);
      expect(await verifyPassword(hash2, samplePhrase)).toBe(true);

      // Verification fails with wrong password
      expect(await verifyPassword(hash1, 'test-suite-fixture-mismatched-non-matching-sample')).toBe(false);
    });

    it('authenticates configured system user with Argon2id and rejects invalid passwords', async () => {
      const authSuccess = await authenticateUser('reviewer_mh', 'test-suite-fixture-reviewer-secret', '127.0.0.1');
      expect(authSuccess.success).toBe(true);
      if (authSuccess.success) {
        expect(authSuccess.user.role).toBe('STATE_REVIEWER');
        expect(authSuccess.user.allowedStates).toEqual(['Maharashtra']);
        expect(authSuccess.token).toBeDefined();
      }

      const authWrongPwd = await authenticateUser('reviewer_mh', 'test-suite-fixture-mismatched-non-matching-sample', '127.0.0.1');
      expect(authWrongPwd.success).toBe(false);
      if (!authWrongPwd.success) {
        expect(authWrongPwd.statusCode).toBe(401);
      }
    });
  });
});
