/**
 * Distributed Shared Store for Leadership Authentication & Sessions
 * 
 * Guarantees:
 * - Distributed persistence (Supabase PostgreSQL / PostgREST adapter)
 * - Zero in-memory fallback in production or staging (strict fail-closed)
 * - Atomic challenge issuance and rate-limiting via database RPCs
 * - Atomic challenge consumption with single-active-session per leader enforcement
 * - Explicit UUID challenge identity verification
 * - Complete check on every database response (status and payload)
 * - Safe unavailable store when credentials/schema are missing
 * - Isolated in-memory adapter exclusively for explicit unit/multi-instance tests
 */

import crypto from 'crypto';
import { findLeaderById, type LeaderIdentity } from './leaderIdentityStore';

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
  getPendingChallengeById(challengeId: string): Promise<LeaderAuthChallengeRecord | null>;
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

  // Persistent identity inspection
  getLeaderIdentity(leaderId: string): Promise<LeaderIdentity | null>;

  clearAllForTesting?(): Promise<void>;
  setLeaderIdentityForTesting?(identity: LeaderIdentity): void;
}

function sanitizeDatabaseError(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'Unknown database error';
  // Strip any API keys, tokens, or bearer headers
  return raw
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/apikey=[a-z0-9._-]+/gi, 'apikey=[REDACTED]')
    .substring(0, 300);
}

// ---------------------------------------------------------------------------
// Unavailable Store (Fails Closed When Credentials / Schema Missing)
// ---------------------------------------------------------------------------

export class UnavailableLeaderAuthStore implements LeaderAuthStore {
  private reason: string;

  constructor(reason: string = 'Distributed authentication store is unconfigured or unavailable.') {
    this.reason = reason;
  }

  async checkAndRecordRateLimit(): Promise<RateLimitCheckResult> {
    throw new Error(this.reason);
  }

  async createChallenge(): Promise<void> {
    throw new Error(this.reason);
  }

  async supersedePriorChallenges(): Promise<void> {
    throw new Error(this.reason);
  }

  async getPendingChallenge(): Promise<LeaderAuthChallengeRecord | null> {
    throw new Error(this.reason);
  }

  async getPendingChallengeById(): Promise<LeaderAuthChallengeRecord | null> {
    throw new Error(this.reason);
  }

  async incrementFailedAttempt(): Promise<{ failedAttempts: number; isLocked: boolean }> {
    throw new Error(this.reason);
  }

  async invalidateChallenge(): Promise<void> {
    throw new Error(this.reason);
  }

  async consumeChallengeAndCreateSession(): Promise<{
    success: boolean;
    session?: LeaderSessionRecord;
    error?: string;
    statusCode: number;
  }> {
    return { success: false, error: this.reason, statusCode: 503 };
  }

  async getSession(): Promise<LeaderSessionRecord | null> {
    return null;
  }

  async updateSessionActivity(): Promise<void> {
    // Fail closed: cannot slide activity
  }

  async revokeSession(): Promise<void> {
    throw new Error(this.reason);
  }

  async revokeAllSessionsForLeader(): Promise<void> {
    throw new Error(this.reason);
  }

  async getLeaderIdentity(): Promise<LeaderIdentity | null> {
    return null;
  }
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
  private identities = new Map<string, LeaderIdentity>();

  setLeaderIdentityForTesting(identity: LeaderIdentity): void {
    this.identities.set(identity.id, { ...identity });
  }

  async getLeaderIdentity(leaderId: string): Promise<LeaderIdentity | null> {
    const fromStore = findLeaderById(leaderId);
    if (fromStore) return { ...fromStore };
    const found = this.identities.get(leaderId);
    return found ? { ...found } : null;
  }

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
    // Supersede any existing unused challenge for this leader or email atomically
    await this.supersedePriorChallenges(challenge.email, challenge.leaderId);
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
    if (!challenge || challenge.isUsed || challenge.isLocked) return null;
    return { ...challenge };
  }

  async getPendingChallengeById(challengeId: string): Promise<LeaderAuthChallengeRecord | null> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.isUsed || challenge.isLocked) return null;
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

    // Keep identity map up to date
    this.identities.set(params.leader.id, { ...params.leader });

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
    this.identities.clear();
  }
}

// ---------------------------------------------------------------------------
// Supabase PostgREST Adapter (Production Distributed Store — ZERO Memory Fallback)
// ---------------------------------------------------------------------------

export class SupabaseLeaderAuthStore implements LeaderAuthStore {
  private baseUrl: string;
  private apiKey: string;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SupabaseLeaderAuthStore requires non-empty supabaseUrl and serviceRoleKey.');
    }
    this.baseUrl = supabaseUrl.replace(/\/+$/, '');
    this.apiKey = serviceRoleKey;
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

  async checkAndRecordRateLimit(key: string, _now: number): Promise<RateLimitCheckResult> {
    const url = `${this.baseUrl}/rest/v1/rpc/check_and_record_leader_rate_limit`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        p_key: key,
        p_short_limit: MAX_REQUESTS_15M,
        p_short_window_seconds: 15 * 60,
        p_long_limit: MAX_REQUESTS_24H,
        p_long_window_seconds: 24 * 60 * 60,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database rate limit RPC failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }

    const data = await res.json();
    return {
      allowed: Boolean(data?.allowed),
      reason: data?.reason,
      retryAfterSeconds: data?.retryAfterSeconds,
    };
  }

  async createChallenge(challenge: LeaderAuthChallengeRecord): Promise<void> {
    const url = `${this.baseUrl}/rest/v1/rpc/issue_leader_auth_challenge`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        p_challenge_id: challenge.challengeId,
        p_leader_id: challenge.leaderId,
        p_email: challenge.email.toLowerCase(),
        p_code_hash: challenge.codeHash,
        p_device_binding_hash: challenge.deviceBindingHash,
        p_user_agent_hash: challenge.userAgentHash,
        p_ip: challenge.ip,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database issue_leader_auth_challenge failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }
  }

  async supersedePriorChallenges(email: string, leaderId: string): Promise<void> {
    const norm = encodeURIComponent(email.toLowerCase());
    const res = await fetch(
      `${this.baseUrl}/rest/v1/leader_auth_challenges?email=eq.${norm}&is_used=eq.false`,
      {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({ is_used: true }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database supersedePriorChallenges failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }
  }

  async getPendingChallenge(email: string): Promise<LeaderAuthChallengeRecord | null> {
    const norm = encodeURIComponent(email.toLowerCase());
    const url = `${this.baseUrl}/rest/v1/leader_auth_challenges?email=eq.${norm}&is_used=eq.false&is_locked=eq.false&order=created_at.desc&limit=1`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database getPendingChallenge query failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
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
  }

  async getPendingChallengeById(challengeId: string): Promise<LeaderAuthChallengeRecord | null> {
    const url = `${this.baseUrl}/rest/v1/leader_auth_challenges?challenge_id=eq.${encodeURIComponent(challengeId)}&is_used=eq.false&is_locked=eq.false&limit=1`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database getPendingChallengeById failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
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
  }

  async incrementFailedAttempt(
    challengeId: string,
    maxAttempts: number
  ): Promise<{ failedAttempts: number; isLocked: boolean }> {
    const rpcUrl = `${this.baseUrl}/rest/v1/rpc/increment_challenge_failed_attempts`;
    const rpcRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        p_challenge_id: challengeId,
        p_max_attempts: maxAttempts,
      }),
    });

    if (rpcRes.ok) {
      const data = await rpcRes.json();
      if (data && data.success) {
        return { failedAttempts: data.failedAttempts, isLocked: Boolean(data.isLocked) };
      }
    }

    // Fallback: direct PATCH with current counter check
    const current = await this.getPendingChallengeById(challengeId);
    const nextAttempts = (current?.failedAttempts || 0) + 1;
    const isLocked = nextAttempts >= maxAttempts;

    const res = await fetch(
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

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database incrementFailedAttempt failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }

    return { failedAttempts: nextAttempts, isLocked };
  }

  async invalidateChallenge(challengeId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/leader_auth_challenges?challenge_id=eq.${encodeURIComponent(challengeId)}`,
      {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({ is_used: true }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database invalidateChallenge failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
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
    const rpcUrl = `${this.baseUrl}/rest/v1/rpc/consume_leader_challenge_and_create_session`;
    const sessionId = crypto.randomBytes(32).toString('hex');
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        p_challenge_id: params.challengeId,
        p_code_hash: params.submittedCodeHash,
        p_device_binding_hash: params.deviceBindingHash,
        p_new_session_id: sessionId,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database consume_leader_challenge_and_create_session RPC failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }

    const data = await res.json();
    if (data && data.success) {
      return {
        success: true,
        session: data.session,
        statusCode: 200,
      };
    }

    return {
      success: false,
      error: data?.error || 'Verification failed on persistent store.',
      statusCode: data?.status || 401,
    };
  }

  async getSession(sessionId: string): Promise<LeaderSessionRecord | null> {
    const url = `${this.baseUrl}/rest/v1/leader_sessions?session_id=eq.${encodeURIComponent(sessionId)}&is_revoked=eq.false&select=*`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database getSession failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
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
  }

  async updateSessionActivity(sessionId: string, now: number): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/leader_sessions?session_id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({
          last_activity_at: new Date(now).toISOString(),
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database updateSessionActivity failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    const res = await fetch(
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

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database revokeSession failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }
  }

  async revokeAllSessionsForLeader(leaderId: string): Promise<void> {
    const res = await fetch(
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

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database revokeAllSessionsForLeader failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }
  }

  async getLeaderIdentity(leaderId: string): Promise<LeaderIdentity | null> {
    const url = `${this.baseUrl}/rest/v1/leader_identities?id=eq.${encodeURIComponent(leaderId)}&select=*`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database getLeaderIdentity failed (status ${res.status}): ${sanitizeDatabaseError(errText)}`);
    }

    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      email: r.email,
      name: r.full_name,
      title: r.title,
      role: 'LEADERSHIP',
      allowedStates: r.allowed_states || ['*'],
      allowedDistricts: r.allowed_districts || ['*'],
      isActive: Boolean(r.is_active),
      authVersion: Number(r.auth_version || 1),
    };
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

  const isProductionOrStaging =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.APP_ENV === 'production' ||
    (process.env.NODE_ENV as string) === 'staging' ||
    process.env.APP_ENV === 'staging';

  // Strict rejection of memory forcing in production/staging
  if (isProductionOrStaging && process.env.FORCE_MEMORY_STORE) {
    throw new Error('[LEADER_AUTH_STORE:FATAL] FORCE_MEMORY_STORE is strictly forbidden in production and staging environments.');
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    activeStoreInstance = new SupabaseLeaderAuthStore(supabaseUrl, serviceRoleKey);
    return activeStoreInstance;
  }

  if (isProductionOrStaging) {
    // Fail-closed: missing database credentials in production/staging MUST NOT select in-memory adapter
    return new UnavailableLeaderAuthStore('Database credentials missing in production/staging. Leadership auth disabled.');
  }

  // Development environment fallback
  if (process.env.NODE_ENV === 'development') {
    activeStoreInstance = new MemoryLeaderAuthStore();
    return activeStoreInstance;
  }

  // Unit tests default
  return new MemoryLeaderAuthStore();
}

export function setLeaderAuthStoreForTesting(store: LeaderAuthStore | null): void {
  activeStoreInstance = store;
}
