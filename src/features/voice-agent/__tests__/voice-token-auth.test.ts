/**
 * @vitest-environment node
 * 
 * Automated Test Suite for Voice Token API & Staff Authorization Boundary
 * 
 * Tests server-side role enforcement, loopback bypass constraints, and LiveKit token issuance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authorizeVoiceStaffAccess, isLoopbackHost } from '@/lib/server/voiceStaffAuth';
import { createSessionToken } from '@/lib/server/sessionService';
import { GET as tokenGetHandler } from '@/app/api/staff/voice/token/route';

describe('Voice Staff Authorization & Token Endpoint Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SESSION_SECRET = 'a_very_secure_test_secret_that_is_at_least_32_characters_long!';
    delete process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS;
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Loopback Detection', () => {
    it('correctly identifies loopback hosts and IPs', () => {
      expect(isLoopbackHost('localhost')).toBe(true);
      expect(isLoopbackHost('localhost:3000')).toBe(true);
      expect(isLoopbackHost('127.0.0.1')).toBe(true);
      expect(isLoopbackHost('127.0.0.1:8080')).toBe(true);
      expect(isLoopbackHost('::1')).toBe(true);
      expect(isLoopbackHost('[::1]:3000')).toBe(true);

      expect(isLoopbackHost('192.168.1.10')).toBe(false);
      expect(isLoopbackHost('app.childcare.org')).toBe(false);
      expect(isLoopbackHost('10.0.0.1')).toBe(false);
      expect(isLoopbackHost(null)).toBe(false);
      expect(isLoopbackHost(undefined)).toBe(false);
    });
  });

  describe('Server-Side Staff Authorization', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', () => {
      const mockReq = {
        cookies: { get: () => undefined },
        headers: { get: () => null },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.reason).toContain('Authentication required');
    });

    it('rejects FIELD_USER role with 403 Forbidden', () => {
      const fieldToken = createSessionToken({
        userId: 'field-01',
        role: 'FIELD_USER',
        name: 'Caseworker Field',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const mockReq = {
        cookies: { get: (name: string) => (name === 'evaluation_session_token' ? { value: fieldToken } : undefined) },
        headers: { get: () => null },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.reason).toContain('Role \'FIELD_USER\' is not authorized');
    });

    it('rejects AUDITOR role with 403 Forbidden', () => {
      const auditorToken = createSessionToken({
        userId: 'auditor-01',
        role: 'AUDITOR',
        name: 'External Auditor',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const mockReq = {
        cookies: { get: (name: string) => (name === 'evaluation_session_token' ? { value: auditorToken } : undefined) },
        headers: { get: () => null },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.reason).toContain('Role \'AUDITOR\' is not authorized');
    });

    it('authorizes ADMIN, LEADERSHIP, and STATE_REVIEWER roles', () => {
      for (const role of ['ADMIN', 'LEADERSHIP', 'STATE_REVIEWER'] as const) {
        const staffToken = createSessionToken({
          userId: `staff-${role.toLowerCase()}`,
          role,
          name: `Staff ${role}`,
          allowedStates: ['*'],
          allowedDistricts: ['*'],
        });

        const mockReq = {
          cookies: { get: (name: string) => (name === 'evaluation_session_token' ? { value: staffToken } : undefined) },
          headers: { get: () => null },
        };

        const result = authorizeVoiceStaffAccess(mockReq);
        expect(result.authorized).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.user?.role).toBe(role);
      }
    });

    it('supports Bearer authorization header for authorized staff', () => {
      const adminToken = createSessionToken({
        userId: 'admin-header-01',
        role: 'ADMIN',
        name: 'Admin Header User',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const mockReq = {
        cookies: { get: () => undefined },
        headers: {
          get: (name: string) => (name === 'authorization' ? `Bearer ${adminToken}` : null),
        },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(true);
      expect(result.user?.userId).toBe('admin-header-01');
    });
  });

  describe('Local Development Loopback Bypass Security', () => {
    it('rejects bypass when ALLOW_LOCAL_STAFF_VOICE_BYPASS is not true', () => {
      (process.env as any).NODE_ENV = 'development';
      delete process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS;

      const mockReq = {
        cookies: { get: () => undefined },
        headers: {
          get: (name: string) => (name === 'host' ? 'localhost:3000' : null),
        },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('strictly forbids local bypass in production environment even if flag is set', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS = 'true';

      const mockReq = {
        cookies: { get: () => undefined },
        headers: {
          get: (name: string) => (name === 'host' ? 'localhost:3000' : null),
        },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('rejects local bypass if host is non-loopback', () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS = 'true';

      const mockReq = {
        cookies: { get: () => undefined },
        headers: {
          get: (name: string) => (name === 'host' ? 'external-domain.org' : null),
        },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('allows local bypass when flag is true, in non-production, from loopback host', () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS = 'true';

      const mockReq = {
        cookies: { get: () => undefined },
        headers: {
          get: (name: string) => (name === 'host' ? '127.0.0.1:3000' : null),
        },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.reason).toBe('local_loopback_bypass');
    });

    it('rejects local bypass when X-Forwarded-For contains an external IP', () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS = 'true';

      const mockReq = {
        cookies: { get: () => undefined },
        headers: {
          get: (name: string) => {
            if (name === 'host') return '127.0.0.1:3000';
            if (name === 'x-forwarded-for') return '203.0.113.195, 127.0.0.1';
            return null;
          },
        },
      };

      const result = authorizeVoiceStaffAccess(mockReq);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.reason).toContain('X-Forwarded-For contains external non-loopback IP');
    });
  });

  describe('/api/staff/voice/token Endpoint Behavior', () => {
    it('returns 401 when unauthenticated and bypass is disabled', async () => {
      const req = new NextRequest('http://localhost:3000/api/staff/voice/token');
      const res = await tokenGetHandler(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Authentication required');
    });

    it('returns NOT_CONFIGURED when authorized but LiveKit credentials are absent', async () => {
      const adminToken = createSessionToken({
        userId: 'admin-01',
        role: 'ADMIN',
        name: 'System Admin',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        headers: {
          Cookie: `evaluation_session_token=${adminToken}`,
        },
      });

      const res = await tokenGetHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.configured).toBe(false);
      expect(data.status).toBe('NOT_CONFIGURED');
      expect(data.statusTiers).toBeDefined();
      expect(data.statusTiers.browserConnectionConfigured).toBe(false);
      expect(data.statusTiers.actualAudioSessionExecuted).toBe(false);
      expect(data.message).toContain('AI/Audio Path: NOT EXECUTED');
      expect(data.requiredVariables).toContain('LIVEKIT_URL');
      expect(data.requiredVariables).toContain('SARVAM_API_KEY');
    });

    it('returns signed LiveKit room token with tiered status when credentials are provided', async () => {
      process.env.LIVEKIT_URL = 'wss://eval-livekit.example.com';
      process.env.LIVEKIT_API_KEY = 'test_api_key_lk';
      process.env.LIVEKIT_API_SECRET = 'test_api_secret_lk_32_characters_minimum!';

      const adminToken = createSessionToken({
        userId: 'admin-eval',
        role: 'ADMIN',
        name: 'Eval Admin',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        headers: {
          Cookie: `evaluation_session_token=${adminToken}`,
        },
      });

      const res = await tokenGetHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.configured).toBe(true);
      expect(data.status).toBe('READY');
      expect(data.statusTiers.browserConnectionConfigured).toBe(true);
      expect(data.statusTiers.actualAudioSessionExecuted).toBe(false);
      expect(data.serverUrl).toBe('wss://eval-livekit.example.com');
      expect(data.roomName).toMatch(/^synth-eval-room-/);
      expect(data.token).toBeDefined();
      expect(typeof data.token).toBe('string');
      expect(data.agentName).toBe('childcare-voice-evaluator');
      expect(data.maxDurationSeconds).toBe(180);
    });

    it('enforces server-side concurrency ceiling (HTTP 429 on concurrent session)', async () => {
      process.env.LIVEKIT_URL = 'wss://eval-livekit.example.com';
      process.env.LIVEKIT_API_KEY = 'test_api_key_lk';
      process.env.LIVEKIT_API_SECRET = 'test_api_secret_lk_32_characters_minimum!';

      const adminToken = createSessionToken({
        userId: 'admin-concurrent',
        role: 'ADMIN',
        name: 'Concurrent Admin',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      // Session 1: succeeds (concurrency = 1)
      const req1 = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });
      const res1 = await tokenGetHandler(req1);
      // If a previous test left 1 session active, this may be 429; otherwise it's 200 then next is 429
      if (res1.status === 200) {
        // Session 2: concurrent attempt should be rejected with 429
        const req2 = new NextRequest('http://localhost:3000/api/staff/voice/token', {
          headers: { Cookie: `evaluation_session_token=${adminToken}` },
        });
        const res2 = await tokenGetHandler(req2);
        expect(res2.status).toBe(429);
        const data2 = await res2.json();
        expect(data2.error).toContain('concurrency ceiling reached');
      } else {
        expect(res1.status).toBe(429);
      }
    });
  });
});
