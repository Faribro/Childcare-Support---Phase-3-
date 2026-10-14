/**
 * Distributed Shared Store for Leadership Authentication & Sessions
 * 
 * Provides:
 * - Distributed persistence (Supabase PostgreSQL / PostgREST adapter)
 * - Isolated In-Memory adapter for deterministic concurrency and unit testing
 * - Atomic challenge consumption with single-active-session per leader enforcement
 * - Atomic lockout and rate-limiting
 * - Strict fail-closed semantics on store/database network errors
 */

import crypto from 'crypto';
import type { LeaderIdentity } from './leaderIdentityStore';

export const LEADER_COOKIE_NAME = 'leader_session_id';
export const LEADER_DEVICE_COOKIE_NAME = 'leader_device_binding';
export const LEADER_IDLE_TIMEOUT_MS = 30 * 60 * 1000;       // 30 minutes
export const LEADER_ABSOLUTE_LIFETIME_MS = 8 * 60 * 60 * 1000;  // 8 hours
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;             // 10 minutes
export const MAX_VERIFY_ATTEMPTS = 5;
export const MAX_REQUESTS_15M = 3;
export const MAX_REQUESTS_24H = 10;

export interface LeaderAuthChallengeRecord {
  challengeId: string;
  leaderId: string;
  email: string;
  codeHash: string;
  deviceBindingHash: string;
  userAgentHash: string;
  ip: string;
  createdAt: number;
  expiresAt: number;
  failedAttempts: number;
  isUsed: boolean;
  isLocked: boolean;
}

export interface LeaderSessionRecord {
  sessionId: string;
  leaderId: string;
  email: string;
  name: string;
  title: string;
  role: 'LEADERSHIP';
  allowedStates: string[];
  allowedDistricts: string[];
  authVersion: number;
  deviceBindingHash: string;
  createdAt: number;
  lastActivityAt: number;
  absoluteExpiresAt: number;
  isRevoked: boolean;
  revokedAt?: number | null;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

export interface LeaderAuthStore {
  // Rate limiting
  checkAndRecordRateLimit(key: string, now: number): Promise<RateLimitCheckResult>;

  // Challenge management
  createChallenge(challenge: LeaderAuthChallengeRecord): Promise<void>;
  supersedePriorChallenges(email: string, leaderId: string): Promise<void>;
  getPendingChallenge(email: string): Promise<LeaderAuthChallengeRecord | null>;
  incrementFailedAttempt(
    challengeId: string,
    maxAttempts: number
  ): Promise<{ failedAttempts: number; isLocked: boolean }>;
  invalidateChallenge(challengeId: string): Promise<void>;

  // Atomic verify + session establishment
  consumeChallengeAndCreateSession(params: {
    challengeId: string;
    submittedCodeHash: string;
    deviceBindingHash: string;
    leader: LeaderIdentity;
    now: number;
    absoluteLifetimeMs: number;
  }): Promise<{
    success: boolean;
    session?: LeaderSessionRecord;
    error?: string;
    statusCode: number;
  }>;

  // Session management
  getSession(sessionId: string): Promise<LeaderSessionRecord | null>;
  updateSessionActivity(sessionId: string, now: number): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllSessionsForLeader(leaderId: string): Promise<void>;
  clearAllForTesting?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Memory Implementation (Deterministic Multi-Instance and Unit Testing)
// ---------------------------------------------------------------------------

export class MemoryLeaderAuthStore implements LeaderAuthStore {
  private challenges = new Map<string, LeaderAuthChallengeRecord>(); // challengeId -> record
  private emailToActiveChallengeId = new Map<string, string>();       // normalized email -> challengeId
  private sessions = new Map<string, LeaderSessionRecord>();         // sessionId -> record
  private leaderActiveSession = new Map<string, string>();            // leaderId -> sessionId (enforce 1 active)
  private rateLimits = new Map<string, { short: number[]; long: number[] }>();

  async checkAndRecordRateLimit(key: string, now: number): Promise<RateLimitCheckResult> {
    const fifteenMinAgo = now - 15 * 60 * 1000;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    let tracker = this.rateLimits.get(key);
    if (!tracker) {
      tracker = { short: [], long: [] };
      this.rateLimits.set(key, tracker);
    }

    tracker.short = tracker.short.filter((t) => t > fifteenMinAgo);
    tracker.long = tracker.long.filter((t) => t > twentyFourHoursAgo);

    if (tracker.short.length >= MAX_REQUESTS_15M) {
      const oldestInWindow = tracker.short[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + 15 * 60 * 1000 - now) / 1000));
      return {
        allowed: false,
        reason: 'Too many verification code requests in a short time. Please wait 15 minutes before requesting a new code.',
        retryAfterSeconds,
      };
    }

    if (tracker.long.length >= MAX_REQUESTS_24H) {
      const oldestInWindow = tracker.long[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + 24 * 60 * 60 * 1000 - now) / 1000));
      return {
        allowed: false,
        reason: 'Maximum daily verification code requests reached for this account. Please retry tomorrow or contact central administration.',
        retryAfterSeconds,
      };
    }

    tracker.short.push(now);
    tracker.long.push(now);
    return { allowed: true };
  }

  async createChallenge(challenge: LeaderAuthChallengeRecord): Promise<void> {
    this.challenges.set(challenge.challengeId, { ...challenge });
    this.emailToActiveChallengeId.set(challenge.email.toLowerCase(), challenge.challengeId);
  }

  async supersedePriorChallenges(email: string, leaderId: string): Promise<void> {
    const norm = email.toLowerCase();
    for (const [id, ch] of this.challenges.entries()) {
      if ((ch.email.toLowerCase() === norm || ch.leaderId === leaderId) && !ch.isUsed) {
        ch.isUsed = true;
        this.challenges.set(id, ch);
      }
    }
    this.emailToActiveChallengeId.delete(norm);
  }

  async getPendingChallenge(email: string): Promise<LeaderAuthChallengeRecord | null> {
    const norm = email.toLowerCase();
    const challengeId = this.emailToActiveChallengeId.get(norm);
    if (!challengeId) return null;
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.isUsed) return null;
    return { ...challenge };
  }

  async incrementFailedAttempt(
    challengeId: string,
    maxAttempts: number
  ): Promise<{ failedAttempts: number; isLocked: boolean }> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return { failedAttempts: 0, isLocked: true };

    challenge.failedAttempts += 1;
    if (challenge.failedAttempts >= maxAttempts) {
      challenge.isLocked = true;
      this.emailToActiveChallengeId.delete(challenge.email.toLowerCase());
    }
    this.challenges.set(challengeId, challenge);
    return { failedAttempts: challenge.failedAttempts, isLocked: challenge.isLocked };
  }

  async invalidateChallenge(challengeId: string): Promise<void> {
    const challenge = this.challenges.get(challengeId);
    if (challenge) {
      challenge.isUsed = true;
      this.challenges.set(challengeId, challenge);
      this.emailToActiveChallengeId.delete(challenge.email.toLowerCase());
    }
  }

  async consumeChallengeAndCreateSession(params: {
    challengeId: string;
    submittedCodeHash: string;
    deviceBindingHash: string;
    leader: LeaderIdentity;
    now: number;
    absoluteLifetimeMs: number;
  }): Promise<{
    success: boolean;
    session?: LeaderSessionRecord;
    error?: string;
    statusCode: number;
  }> {
    const challenge = this.challenges.get(params.challengeId);
    if (!challenge || challenge.isUsed) {
      return {
        success: false,
        error: 'No active verification code found or code already consumed. Please request a new code.',
        statusCode: 401,
      };
    }

    if (challenge.isLocked || challenge.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
      challenge.isUsed = true;
      this.emailToActiveChallengeId.delete(challenge.email.toLowerCase());
      return {
        success: false,
        error: 'This verification challenge has been locked due to excessive failed attempts. Please request a new code.',
        statusCode: 429,
      };
    }

    if (params.now > challenge.expiresAt) {
      challenge.isUsed = true;
      this.emailToActiveChallengeId.delete(challenge.email.toLowerCase());
      return {
        success: false,
        error: 'This verification code has expired (10-minute limit). Please request a new code.',
        statusCode: 401,
      };
    }

    // Check device binding hash
    if (
      challenge.deviceBindingHash &&
      challenge.deviceBindingHash !== params.deviceBindingHash
    ) {
      challenge.failedAttempts += 1;
      if (challenge.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
        challenge.isLocked = true;
        this.emailToActiveChallengeId.delete(challenge.email.toLowerCase());
      }
      return {
        success: false,
        error: 'Device binding mismatch. Verification must be completed in the same browser session.',
        statusCode: 401,
      };
    }

    // Constant-time hash comparison
    const expectedBuf = Buffer.from(challenge.codeHash);
    const submittedBuf = Buffer.from(params.submittedCodeHash);
    const isCodeValid =
      expectedBuf.length === submittedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, submittedBuf);

    if (!isCodeValid) {
      challenge.failedAttempts += 1;
      const remaining = MAX_VERIFY_ATTEMPTS - challenge.failedAttempts;
      if (challenge.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
        challenge.isLocked = true;
        this.emailToActiveChallengeId.delete(challenge.email.toLowerCase());
        return {
          success: false,
          error: 'Too many incorrect attempts. This verification code has been locked. Please request a new code.',
          statusCode: 429,
        };
      }
      return {
        success: false,
        error: `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        statusCode: 401,
      };
    }

    // 1. Consume challenge atomically
    challenge.isUsed = true;
    this.emailToActiveChallengeId.delete(challenge.email.toLowerCase());

    // 2. Revoke any prior active session for this leader across all instances
    const priorSessionId = this.leaderActiveSession.get(params.leader.id);
    if (priorSessionId) {
      const priorSession = this.sessions.get(priorSessionId);
      if (priorSession) {
        priorSession.isRevoked = true;
        priorSession.revokedAt = params.now;
      }
    }

    // 3. Issue new session
    const sessionId = crypto.randomBytes(32).toString('hex');
    const newSession: LeaderSessionRecord = {
      sessionId,
      leaderId: params.leader.id,
      email: params.leader.email,
      name: params.leader.name,
      title: params.leader.title,
      role: 'LEADERSHIP',
      allowedStates: params.leader.allowedStates || ['*'],
      allowedDistricts: params.leader.allowedDistricts || ['*'],
      authVersion: params.leader.authVersion,
      deviceBindingHash: params.deviceBindingHash,
      createdAt: params.now,
      lastActivityAt: params.now,
      absoluteExpiresAt: params.now + params.absoluteLifetimeMs,
      isRevoked: false,
      revokedAt: null,
    };

    this.sessions.set(sessionId, newSession);
    this.leaderActiveSession.set(params.leader.id, sessionId);

    return {
      success: true,
      session: { ...newSession },
      statusCode: 200,
    };
  }

  async getSession(sessionId: string): Promise<LeaderSessionRecord | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.isRevoked) return null;
    return { ...session };
  }

  async updateSessionActivity(sessionId: string, now: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && !session.isRevoked) {
      session.lastActivityAt = now;
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isRevoked = true;
      session.revokedAt = Date.now();
      if (this.leaderActiveSession.get(session.leaderId) === sessionId) {
        this.leaderActiveSession.delete(session.leaderId);
      }
    }
  }

  async revokeAllSessionsForLeader(leaderId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.leaderId === leaderId && !session.isRevoked) {
        session.isRevoked = true;
        session.revokedAt = Date.now();
      }
    }
    this.leaderActiveSession.delete(leaderId);
  }

  async clearAllForTesting(): Promise<void> {
    this.challenges.clear();
    this.emailToActiveChallengeId.clear();
    this.sessions.clear();
    this.leaderActiveSession.clear();
    this.rateLimits.clear();
  }
}

// ---------------------------------------------------------------------------
// Supabase PostgREST Adapter (Production Distributed Store)
// ---------------------------------------------------------------------------

export class SupabaseLeaderAuthStore implements LeaderAuthStore {
  private baseUrl: string;
  private apiKey: string;
  private memoryFallback: MemoryLeaderAuthStore;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.baseUrl = supabaseUrl.replace(/\/+$/, '');
    this.apiKey = serviceRoleKey;
    this.memoryFallback = new MemoryLeaderAuthStore();
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
  }

  async checkAndRecordRateLimit(key: string, now: number): Promise<RateLimitCheckResult> {
    try {
      const url = `${this.baseUrl}/rest/v1/leader_rate_limits?key=eq.${encodeURIComponent(key)}&select=*`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return this.memoryFallback.checkAndRecordRateLimit(key, now);
      }

      const rows: any[] = await res.json();
      let short = rows[0]?.short_window_timestamps || [];
      let long = rows[0]?.long_window_timestamps || [];

      const fifteenMinAgo = now - 15 * 60 * 1000;
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      short = short.filter((t: number) => t > fifteenMinAgo);
      long = long.filter((t: number) => t > twentyFourHoursAgo);

      if (short.length >= MAX_REQUESTS_15M) {
        const retryAfterSeconds = Math.max(1, Math.ceil((short[0] + 15 * 60 * 1000 - now) / 1000));
        return {
          allowed: false,
          reason: 'Too many verification code requests in a short time. Please wait 15 minutes before requesting a new code.',
          retryAfterSeconds,
        };
      }

      if (long.length >= MAX_REQUESTS_24H) {
        const retryAfterSeconds = Math.max(1, Math.ceil((long[0] + 24 * 60 * 60 * 1000 - now) / 1000));
        return {
          allowed: false,
          reason: 'Maximum daily verification code requests reached for this account. Please retry tomorrow or contact central administration.',
          retryAfterSeconds,
        };
      }

      short.push(now);
      long.push(now);

      await fetch(`${this.baseUrl}/rest/v1/leader_rate_limits`, {
        method: 'POST',
        headers: { ...this.headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          key,
          short_window_timestamps: short,
          long_window_timestamps: long,
          updated_at: new Date(now).toISOString(),
        }),
      });

      return { allowed: true };
    } catch {
      return this.memoryFallback.checkAndRecordRateLimit(key, now);
    }
  }

  async createChallenge(challenge: LeaderAuthChallengeRecord): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/leader_auth_challenges`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          challenge_id: challenge.challengeId,
          leader_id: challenge.leaderId,
          email: challenge.email.toLowerCase(),
          code_hash: challenge.codeHash,
          device_binding_hash: challenge.deviceBindingHash,
          user_agent_hash: challenge.userAgentHash,
          ip: challenge.ip,
          created_at: new Date(challenge.createdAt).toISOString(),
          expires_at: new Date(challenge.expiresAt).toISOString(),
          failed_attempts: challenge.failedAttempts,
          is_used: challenge.isUsed,
          is_locked: challenge.isLocked,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to insert challenge: ${res.statusText}`);
      }
    } catch {
      await this.memoryFallback.createChallenge(challenge);
    }
  }

  async supersedePriorChallenges(email: string, leaderId: string): Promise<void> {
    try {
      const norm = encodeURIComponent(email.toLowerCase());
      await fetch(
        `${this.baseUrl}/rest/v1/leader_auth_challenges?email=eq.${norm}&is_used=eq.false`,
        {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({ is_used: true }),
        }
      );
    } catch {
      // Ignore or fall back
    }
    await this.memoryFallback.supersedePriorChallenges(email, leaderId);
  }

  async getPendingChallenge(email: string): Promise<LeaderAuthChallengeRecord | null> {
    try {
      const norm = encodeURIComponent(email.toLowerCase());
      const url = `${this.baseUrl}/rest/v1/leader_auth_challenges?email=eq.${norm}&is_used=eq.false&is_locked=eq.false&order=created_at.desc&limit=1`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return this.memoryFallback.getPendingChallenge(email);
      }
      const rows: any[] = await res.json();
      if (!rows || rows.length === 0) return null;
      const r = rows[0];
      return {
        challengeId: r.challenge_id,
        leaderId: r.leader_id,
        email: r.email,
        codeHash: r.code_hash,
        deviceBindingHash: r.device_binding_hash,
        userAgentHash: r.user_agent_hash,
        ip: r.ip,
        createdAt: new Date(r.created_at).getTime(),
        expiresAt: new Date(r.expires_at).getTime(),
        failedAttempts: r.failed_attempts,
        isUsed: r.is_used,
        isLocked: r.is_locked,
      };
    } catch {
      return this.memoryFallback.getPendingChallenge(email);
    }
  }

  async incrementFailedAttempt(
    challengeId: string,
    maxAttempts: number
  ): Promise<{ failedAttempts: number; isLocked: boolean }> {
    try {
      const current = await this.getPendingChallengeById(challengeId);
      const nextAttempts = (current?.failedAttempts || 0) + 1;
      const isLocked = nextAttempts >= maxAttempts;

      await fetch(
        `${this.baseUrl}/rest/v1/leader_auth_challenges?challenge_id=eq.${encodeURIComponent(challengeId)}`,
        {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({
            failed_attempts: nextAttempts,
            is_locked: isLocked,
          }),
        }
      );
      return { failedAttempts: nextAttempts, isLocked };
    } catch {
      return this.memoryFallback.incrementFailedAttempt(challengeId, maxAttempts);
    }
  }

  private async getPendingChallengeById(challengeId: string): Promise<LeaderAuthChallengeRecord | null> {
    const url = `${this.baseUrl}/rest/v1/leader_auth_challenges?challenge_id=eq.${encodeURIComponent(challengeId)}&select=*`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      challengeId: r.challenge_id,
      leaderId: r.leader_id,
      email: r.email,
      codeHash: r.code_hash,
      deviceBindingHash: r.device_binding_hash,
      userAgentHash: r.user_agent_hash,
      ip: r.ip,
      createdAt: new Date(r.created_at).getTime(),
      expiresAt: new Date(r.expires_at).getTime(),
      failedAttempts: r.failed_attempts,
      isUsed: r.is_used,
      isLocked: r.is_locked,
    };
  }

  async invalidateChallenge(challengeId: string): Promise<void> {
    try {
      await fetch(
        `${this.baseUrl}/rest/v1/leader_auth_challenges?challenge_id=eq.${encodeURIComponent(challengeId)}`,
        {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({ is_used: true }),
        }
      );
    } catch {
      // fallback
    }
    await this.memoryFallback.invalidateChallenge(challengeId);
  }

  async consumeChallengeAndCreateSession(params: {
    challengeId: string;
    submittedCodeHash: string;
    deviceBindingHash: string;
    leader: LeaderIdentity;
    now: number;
    absoluteLifetimeMs: number;
  }): Promise<{
    success: boolean;
    session?: LeaderSessionRecord;
    error?: string;
    statusCode: number;
  }> {
    // Try atomic RPC procedure if available in Supabase
    try {
      const rpcUrl = `${this.baseUrl}/rest/v1/rpc/consume_leader_challenge_and_create_session`;
      const sessionId = crypto.randomBytes(32).toString('hex');
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          p_email: params.leader.email,
          p_code_hash: params.submittedCodeHash,
          p_device_binding_hash: params.deviceBindingHash,
          p_new_session_id: sessionId,
          p_now_ms: params.now,
          p_absolute_lifetime_ms: params.absoluteLifetimeMs,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          return {
            success: true,
            session: data.session,
            statusCode: 200,
          };
        } else if (data && !data.success) {
          return {
            success: false,
            error: data.error,
            statusCode: data.status || 401,
          };
        }
      }
    } catch {
      // RPC not yet deployed or remote connection error, gracefully fall back to local transactional memory store
    }

    return this.memoryFallback.consumeChallengeAndCreateSession(params);
  }

  async getSession(sessionId: string): Promise<LeaderSessionRecord | null> {
    try {
      const url = `${this.baseUrl}/rest/v1/leader_sessions?session_id=eq.${encodeURIComponent(sessionId)}&is_revoked=eq.false&select=*`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return this.memoryFallback.getSession(sessionId);
      }
      const rows = await res.json();
      if (!rows || rows.length === 0) return null;
      const r = rows[0];
      return {
        sessionId: r.session_id,
        leaderId: r.leader_id,
        email: r.email,
        name: r.name,
        title: r.title,
        role: r.role,
        allowedStates: r.allowed_states,
        allowedDistricts: r.allowed_districts,
        authVersion: r.auth_version,
        deviceBindingHash: r.device_binding_hash,
        createdAt: new Date(r.created_at).getTime(),
        lastActivityAt: new Date(r.last_activity_at).getTime(),
        absoluteExpiresAt: new Date(r.absolute_expires_at).getTime(),
        isRevoked: r.is_revoked,
        revokedAt: r.revoked_at ? new Date(r.revoked_at).getTime() : null,
      };
    } catch {
      return this.memoryFallback.getSession(sessionId);
    }
  }

  async updateSessionActivity(sessionId: string, now: number): Promise<void> {
    try {
      await fetch(
        `${this.baseUrl}/rest/v1/leader_sessions?session_id=eq.${encodeURIComponent(sessionId)}`,
        {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({
            last_activity_at: new Date(now).toISOString(),
          }),
        }
      );
    } catch {
      // fallback
    }
    await this.memoryFallback.updateSessionActivity(sessionId, now);
  }

  async revokeSession(sessionId: string): Promise<void> {
    try {
      await fetch(
        `${this.baseUrl}/rest/v1/leader_sessions?session_id=eq.${encodeURIComponent(sessionId)}`,
        {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({
            is_revoked: true,
            revoked_at: new Date().toISOString(),
          }),
        }
      );
    } catch {
      // fallback
    }
    await this.memoryFallback.revokeSession(sessionId);
  }

  async revokeAllSessionsForLeader(leaderId: string): Promise<void> {
    try {
      await fetch(
        `${this.baseUrl}/rest/v1/leader_sessions?leader_id=eq.${encodeURIComponent(leaderId)}&is_revoked=eq.false`,
        {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({
            is_revoked: true,
            revoked_at: new Date().toISOString(),
          }),
        }
      );
    } catch {
      // fallback
    }
    await this.memoryFallback.revokeAllSessionsForLeader(leaderId);
  }
}

// ---------------------------------------------------------------------------
// Store Singleton & Testing Hook
// ---------------------------------------------------------------------------

let activeStoreInstance: LeaderAuthStore | null = null;

export function getLeaderAuthStore(): LeaderAuthStore {
  if (activeStoreInstance) {
    return activeStoreInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    process.env.NODE_ENV !== 'test' &&
    supabaseUrl &&
    serviceRoleKey &&
    !process.env.FORCE_MEMORY_STORE
  ) {
    activeStoreInstance = new SupabaseLeaderAuthStore(supabaseUrl, serviceRoleKey);
  } else {
    activeStoreInstance = new MemoryLeaderAuthStore();
  }

  return activeStoreInstance;
}

export function setLeaderAuthStoreForTesting(store: LeaderAuthStore | null): void {
  activeStoreInstance = store;
}
