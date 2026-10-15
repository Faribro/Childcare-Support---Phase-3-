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
import {
  GET as tokenGetHandler,
  POST as tokenPostHandler,
  DELETE as tokenDeleteHandler,
} from '@/app/api/staff/voice/token/route';
import { _resetActiveSessionsForTesting } from '@/lib/server/voiceSessionRegistry';

describe('Voice Staff Authorization & Token Endpoint Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SESSION_SECRET = 'a_very_secure_test_secret_that_is_at_least_32_characters_long!';
    delete process.env.ALLOW_LOCAL_STAFF_VOICE_BYPASS;
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    _resetActiveSessionsForTesting();
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
    function decodeJwtPayload(token: string): any {
      const parts = token.split('.');
      expect(parts.length).toBe(3);
      const jsonStr = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(jsonStr);
    }

    it('returns 401 when unauthenticated on GET, POST, and DELETE', async () => {
      const getReq = new NextRequest('http://localhost:3000/api/staff/voice/token');
      const getRes = await tokenGetHandler(getReq);
      expect(getRes.status).toBe(401);
      const getData = await getRes.json();
      expect(getData.error).toContain('Authentication required');

      const postReq = new NextRequest('http://localhost:3000/api/staff/voice/token', { method: 'POST' });
      const postRes = await tokenPostHandler(postReq);
      expect(postRes.status).toBe(401);

      const delReq = new NextRequest('http://localhost:3000/api/staff/voice/token', { method: 'DELETE' });
      const delRes = await tokenDeleteHandler(delReq);
      expect(delRes.status).toBe(401);
    });

    it('GET: returns readiness and NOT_CONFIGURED without reserving session slot when unconfigured', async () => {
      const adminToken = createSessionToken({
        userId: 'admin-01',
        role: 'ADMIN',
        name: 'System Admin',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });

      const res = await tokenGetHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.configured).toBe(false);
      expect(data.status).toBe('NOT_CONFIGURED');
      expect(data.token).toBeUndefined();
      expect(data.activeSessions).toBe(0);
      expect(data.concurrencyAvailable).toBe(true);
      expect(data.message).toContain('AI/Audio Path: NOT EXECUTED');
    });

    it('GET: does NOT reserve session slot or issue token when server is configured', async () => {
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
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });

      const res = await tokenGetHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.configured).toBe(true);
      expect(data.status).toBe('READY');
      expect(data.token).toBeUndefined(); // GET never generates tokens
      expect(data.roomName).toBeUndefined(); // GET never creates rooms
      expect(data.activeSessions).toBe(0); // Zero reservations on mount/check
      expect(data.concurrencyAvailable).toBe(true);
    });

    it('POST: issues token with exact RoomAgentDispatch claims matching worker registration name', async () => {
      process.env.LIVEKIT_URL = 'wss://eval-livekit.example.com';
      process.env.LIVEKIT_API_KEY = 'test_api_key_lk';
      process.env.LIVEKIT_API_SECRET = 'test_api_secret_lk_32_characters_minimum!';

      const adminToken = createSessionToken({
        userId: 'admin-dispatch',
        role: 'ADMIN',
        name: 'Dispatch Admin',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        method: 'POST',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });

      const res = await tokenPostHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.configured).toBe(true);
      expect(data.status).toBe('READY');
      expect(data.serverUrl).toBe('wss://eval-livekit.example.com');
      expect(data.token).toBeDefined();
      expect(typeof data.token).toBe('string');
      expect(data.roomName).toMatch(/^synth-eval-room-[0-9a-f]{8}$/);
      expect(data.agentName).toBe('childcare-voice-evaluator');
      expect(data.maxDurationSeconds).toBe(180);

      // Verify exact RoomConfiguration.agents dispatch in JWT payload (NOT plain metadata)
      const payload = decodeJwtPayload(data.token);
      expect(payload.roomConfig).toBeDefined();
      expect(payload.roomConfig.agents).toBeDefined();
      expect(Array.isArray(payload.roomConfig.agents)).toBe(true);
      expect(payload.roomConfig.agents.length).toBeGreaterThanOrEqual(1);

      const agentDispatch = payload.roomConfig.agents[0];
      expect(agentDispatch.agentName).toBe('childcare-voice-evaluator');
      // Worker registration strictly matches token dispatch target
      expect(agentDispatch.agentName).toBe(data.agentName);
    });

    it('POST: creates a fresh, distinct room name per session', async () => {
      process.env.LIVEKIT_URL = 'wss://eval-livekit.example.com';
      process.env.LIVEKIT_API_KEY = 'test_api_key_lk';
      process.env.LIVEKIT_API_SECRET = 'test_api_secret_lk_32_characters_minimum!';

      const adminToken = createSessionToken({
        userId: 'admin-fresh',
        role: 'ADMIN',
        name: 'Fresh Admin',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      // Session 1
      const req1 = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        method: 'POST',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });
      const res1 = await tokenPostHandler(req1);
      const data1 = await res1.json();
      expect(res1.status).toBe(200);

      // Release Session 1 reservation
      const delReq = new NextRequest(`http://localhost:3000/api/staff/voice/token?roomName=${data1.roomName}`, {
        method: 'DELETE',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });
      await tokenDeleteHandler(delReq);

      // Session 2
      const req2 = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        method: 'POST',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });
      const res2 = await tokenPostHandler(req2);
      const data2 = await res2.json();
      expect(res2.status).toBe(200);

      // Room names must be distinct fresh identifiers
      expect(data1.roomName).toMatch(/^synth-eval-room-[0-9a-f]{8}$/);
      expect(data2.roomName).toMatch(/^synth-eval-room-[0-9a-f]{8}$/);
      expect(data1.roomName).not.toBe(data2.roomName);
    });

    it('enforces single-process concurrency ceiling and releases via DELETE', async () => {
      process.env.LIVEKIT_URL = 'wss://eval-livekit.example.com';
      process.env.LIVEKIT_API_KEY = 'test_api_key_lk';
      process.env.LIVEKIT_API_SECRET = 'test_api_secret_lk_32_characters_minimum!';

      const adminToken = createSessionToken({
        userId: 'admin-concurrency',
        role: 'ADMIN',
        name: 'Concurrency Admin',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      // Session 1: succeeds (occupies the 1 allowed slot)
      const req1 = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        method: 'POST',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });
      const res1 = await tokenPostHandler(req1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();

      // Session 2: concurrent attempt should be rejected with 429
      const req2 = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        method: 'POST',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });
      const res2 = await tokenPostHandler(req2);
      expect(res2.status).toBe(429);
      const data2 = await res2.json();
      expect(data2.error).toContain('concurrency ceiling reached');
      expect(data2.activeSessions).toBe(1);

      // Release Session 1 via DELETE
      const delReq = new NextRequest(`http://localhost:3000/api/staff/voice/token?roomName=${data1.roomName}`, {
        method: 'DELETE',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });
      const delRes = await tokenDeleteHandler(delReq);
      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.released).toBe(true);
      expect(delData.activeSessions).toBe(0);

      // Session 3: Now succeeds because previous reservation was released
      const req3 = new NextRequest('http://localhost:3000/api/staff/voice/token', {
        method: 'POST',
        headers: { Cookie: `evaluation_session_token=${adminToken}` },
      });
      const res3 = await tokenPostHandler(req3);
      expect(res3.status).toBe(200);
      const data3 = await res3.json();
      expect(data3.roomName).toBeDefined();
    });
  });
});
