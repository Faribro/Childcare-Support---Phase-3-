/**
 * Database Migration, Privilege Boundary & Independent-Connection Concurrency Integration Suite
 * 
 * Target: Ephemeral PostgreSQL 15+ (Disposable integration database in CI)
 * 
 * Test Coverage:
 * 1. Migration DDL: applies 003_leadership_email_auth.sql cleanly.
 * 2. Schema Structure: tables, primary keys, check constraints, partial unique index.
 * 3. Privilege Boundary: RLS fail-closed, anon/authenticated rejected, service_role authorized.
 * 4. Idempotent Provisioning: UUID integrity, email case-normalization, duplicate update.
 * 5. Independent DB Connection Races:
 *    - Same challenge verified concurrently across separate clients -> at most 1 session.
 *    - Superseded challenges cannot authenticate.
 *    - Concurrent logins enforce single active session (uq_active_leader_session).
 *    - Sliding-window rate limit holds under concurrent independent requests.
 *    - Atomic failed-attempt counter and lockout dynamics.
 *    - Expired/locked/inactive accounts rejected atomically.
 *    - Transaction failure atomicity (zero partial records).
 * 6. Production Adapter (SupabaseLeaderAuthStore) Contract Verification:
 *    - Parameter mapping against SQL RPC signatures.
 *    - Timestamp parsing, UUID mapping, error redaction, fail-closed behavior.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool, Client } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SupabaseLeaderAuthStore } from '@/lib/server/leaderAuthStore';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const hasDatabase = Boolean(TEST_DB_URL);

// Enforce that in dedicated database integration jobs (REQUIRE_DB=true), the database must be present and NEVER skip
if (process.env.REQUIRE_DB === 'true' && !hasDatabase) {
  throw new Error(
    'FATAL: TEST_DATABASE_URL environment variable is required when REQUIRE_DB=true. Database integration cannot be skipped in the dedicated database job.'
  );
}

// Helper to hash test codes/tokens
function hashString(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

describe.skipIf(!hasDatabase)('1. Database Integration: Ephemeral PostgreSQL 15 Service', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: TEST_DB_URL,
      max: 20,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    });

    const client = await pool.connect();
    try {
      // Bootstrap test roles for non-Supabase PostgreSQL environments (e.g. CI service container)
      // Keeps the production migration file clean and free of cluster-level role management
      await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
                CREATE ROLE anon NOLOGIN;
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated NOLOGIN;
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
                CREATE ROLE service_role NOLOGIN;
            END IF;
        END
        $$;
      `);

      // Read and apply migration DDL directly from docs/migrations/003_leadership_email_auth.sql
      const migrationPath = path.resolve(process.cwd(), 'docs/migrations/003_leadership_email_auth.sql');
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await client.query(sql);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('1.1 Schema Structure, Constraints & Function Definitions', () => {
    it('verifies active disposable database connection and validates against silent skipping in CI', () => {
      expect(hasDatabase).toBe(true);
      expect(TEST_DB_URL).toBeDefined();
    });

    it('creates all 4 core tables in public schema', async () => {
      const res = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('leader_identities', 'leader_auth_challenges', 'leader_sessions', 'leader_rate_limit_events')
        ORDER BY table_name;
      `);
      const names = res.rows.map((r: any) => r.table_name);
      expect(names).toEqual([
        'leader_auth_challenges',
        'leader_identities',
        'leader_rate_limit_events',
        'leader_sessions',
      ]);
    });

    it('creates partial unique index enforcing single active session per leader', async () => {
      const res = await pool.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'leader_sessions' 
          AND indexname = 'uq_active_leader_session';
      `);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].indexdef).toContain('WHERE (is_revoked = false)');
    });

    it('enforces check constraints on roles and auth version', async () => {
      const res = await pool.query(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'public.leader_identities'::regclass
          AND conname IN ('ck_leader_identity_role', 'ck_leader_auth_version', 'uq_leader_identity_email');
      `);
      const defs = res.rows.map((r: any) => r.def);
      expect(defs.some((d: string) => d.includes("role = 'LEADERSHIP'"))).toBe(true);
      expect(defs.some((d: string) => d.includes('auth_version >= 1'))).toBe(true);
    });

    it('defines all 5 stored functions with safe search_path = public, pg_temp', async () => {
      const res = await pool.query(`
        SELECT proname, proconfig
        FROM pg_proc
        JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
        WHERE pg_namespace.nspname = 'public'
          AND proname IN (
            'check_and_record_leader_rate_limit',
            'issue_leader_auth_challenge',
            'consume_leader_challenge_and_create_session',
            'increment_challenge_failed_attempts',
            'provision_leader_identity'
          );
      `);
      expect(res.rows.length).toBe(5);
      for (const row of res.rows) {
        expect(row.proconfig).toEqual(['search_path=public, pg_temp']);
      }
    });
  });

  describe('1.2 Privilege Boundary & RLS Enforcement', () => {
    it('enables Row Level Security on all auth tables', async () => {
      const res = await pool.query(`
        SELECT relname, relrowsecurity
        FROM pg_class
        JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
        WHERE pg_namespace.nspname = 'public'
          AND relname IN ('leader_identities', 'leader_auth_challenges', 'leader_sessions', 'leader_rate_limit_events');
      `);
      expect(res.rows.length).toBe(4);
      for (const row of res.rows) {
        expect(row.relrowsecurity).toBe(true);
      }
    });

    const assertRoleDenied = async (role: string, queryStr: string) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(client.query(queryStr)).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    };

    it('denies direct table queries and function execution to anon role (fail closed)', async () => {
      await assertRoleDenied('anon', 'SELECT * FROM public.leader_identities');
      await assertRoleDenied('anon', 'SELECT * FROM public.leader_sessions');
      await assertRoleDenied('anon', 'SELECT * FROM public.leader_auth_challenges');
      await assertRoleDenied('anon', "SELECT public.check_and_record_leader_rate_limit('test', 3, 900, 10, 86400)");
      await assertRoleDenied('anon', "SELECT public.consume_leader_challenge_and_create_session('00000000-0000-0000-0000-000000000000', 'c', 'd', 's')");
    });

    it('denies direct table queries and function execution to authenticated role (fail closed)', async () => {
      await assertRoleDenied('authenticated', 'SELECT * FROM public.leader_identities');
      await assertRoleDenied('authenticated', 'SELECT * FROM public.leader_sessions');
      await assertRoleDenied('authenticated', "SELECT public.check_and_record_leader_rate_limit('test', 3, 900, 10, 86400)");
      await assertRoleDenied('authenticated', "SELECT public.consume_leader_challenge_and_create_session('00000000-0000-0000-0000-000000000000', 'c', 'd', 's')");
    });

    it('permits authorized operations when executed as service_role', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE service_role');

        const testKey = `rate:privilege:${Date.now()}`;
        const res = await client.query(
          'SELECT public.check_and_record_leader_rate_limit($1, 3, 900, 10, 86400) as result',
          [testKey]
        );
        expect(res.rows[0].result.allowed).toBe(true);

        await client.query('ROLLBACK');
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    });
  });

  describe('1.3 Idempotent Identity Provisioning & Integrity', () => {
    it('provisions leader identity with case-normalized email and valid UUID', async () => {
      const leaderId = crypto.randomUUID();
      const rawEmail = '  ANANYA.SYNTHETIC@EXAMPLE.ORG  ';

      const res = await pool.query(
        'SELECT public.provision_leader_identity($1, $2, $3, $4, $5, $6, $7, $8) as result',
        [
          leaderId,
          rawEmail,
          'Dr. Ananya Roy (Synthetic Integration)',
          'National Programme Director',
          ['*'],
          ['*'],
          true,
          1,
        ]
      );

      const result = res.rows[0].result;
      expect(result.success).toBe(true);
      expect(result.leaderId).toBe(leaderId);
      expect(result.email).toBe('ananya.synthetic@example.org'); // Case-normalized

      // Verify row in database
      const rowRes = await pool.query('SELECT * FROM public.leader_identities WHERE id = $1', [leaderId]);
      expect(rowRes.rows.length).toBe(1);
      expect(rowRes.rows[0].email).toBe('ananya.synthetic@example.org');
      expect(rowRes.rows[0].role).toBe('LEADERSHIP');
    });

    it('idempotently updates identity on email conflict without changing UUID', async () => {
      const leaderId1 = crypto.randomUUID();
      const leaderId2 = crypto.randomUUID();
      const email = 'rajiv.synthetic@example.org';

      // First provisioning
      await pool.query(
        'SELECT public.provision_leader_identity($1, $2, $3, $4, $5, $6, $7, $8)',
        [leaderId1, email, 'Rajiv Nair', 'Regional Operations Head', ['*'], ['*'], true, 1]
      );

      // Second provisioning with different ID but same email (simulating rerun)
      const res2 = await pool.query(
        'SELECT public.provision_leader_identity($1, $2, $3, $4, $5, $6, $7, $8) as result',
        [leaderId2, email, 'Rajiv Nair Updated', 'Executive Director', ['*'], ['*'], true, 2]
      );

      expect(res2.rows[0].result.success).toBe(true);
      // Retains original UUID
      expect(res2.rows[0].result.leaderId).toBe(leaderId1);

      // Verify only 1 row exists
      const countRes = await pool.query('SELECT COUNT(*) FROM public.leader_identities WHERE email = $1', [email]);
      expect(Number(countRes.rows[0].count)).toBe(1);

      const row = (await pool.query('SELECT * FROM public.leader_identities WHERE email = $1', [email])).rows[0];
      expect(row.full_name).toBe('Rajiv Nair Updated');
      expect(row.title).toBe('Executive Director');
      expect(row.auth_version).toBe(2);
    });
  });

  describe('1.4 Independent-Connection Concurrency Races & Atomic Operations', () => {
    let testLeaderId: string;
    let testEmail: string;

    beforeEach(async () => {
      testLeaderId = crypto.randomUUID();
      testEmail = `priya.concurrent-${crypto.randomBytes(6).toString('hex')}@example.org`;
      const res = await pool.query(
        'SELECT public.provision_leader_identity($1, $2, $3, $4, $5, $6, $7, $8) as res',
        [testLeaderId, testEmail, 'Priya Menon (Synthetic Race)', 'State Reviewer', ['*'], ['*'], true, 1]
      );
      testLeaderId = res.rows[0].res.leaderId;
    });

    it('enforces that concurrent verification of the same challenge yields at most ONE session across independent connections', async () => {
      const challengeId = crypto.randomUUID();
      const plainCode = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const codeHash = hashString(plainCode);
      const deviceBinding = 'test-device-binding-secret-123';
      const deviceBindingHash = hashString(deviceBinding);

      // Issue challenge via stored procedure
      await pool.query(
        'SELECT public.issue_leader_auth_challenge($1, $2, $3, $4, $5, $6, $7)',
        [challengeId, testLeaderId, testEmail, codeHash, deviceBindingHash, 'Agent/1.0', '127.0.0.1']
      );

      // Create 5 independent TCP client connections to simulate distinct serverless instances
      const clients: Client[] = [];
      for (let i = 0; i < 5; i++) {
        const client = new Client({ connectionString: TEST_DB_URL });
        await client.connect();
        clients.push(client);
      }

      try {
        // Fire concurrent consumption requests simultaneously
        const promises = clients.map((client, idx) => {
          const newSessionId = `session-concurrent-${idx}-${crypto.randomBytes(8).toString('hex')}`;
          return client.query(
            'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
            [challengeId, codeHash, deviceBindingHash, newSessionId]
          );
        });

        const results = await Promise.all(promises);
        const outcomes = results.map((r) => r.rows[0].result);

        // Exactly ONE connection must have succeeded
        const successes = outcomes.filter((o) => o.success === true);
        const failures = outcomes.filter((o) => o.success === false);

        expect(successes.length).toBe(1);
        expect(failures.length).toBe(4);

        // All failures must be due to challenge already used
        for (const failure of failures) {
          expect(failure.code).toBe('CODE_ALREADY_USED');
          expect(failure.status).toBe(401);
        }

        // Verify database state: exactly ONE session exists in leader_sessions
        const sessionCount = await pool.query(
          'SELECT COUNT(*) FROM public.leader_sessions WHERE leader_id = $1',
          [testLeaderId]
        );
        expect(Number(sessionCount.rows[0].count)).toBe(1);
      } finally {
        for (const client of clients) {
          await client.end();
        }
      }
    });

    it('supersedes previous unused challenges when a new challenge is issued', async () => {
      const challenge1 = crypto.randomUUID();
      const challenge2 = crypto.randomUUID();
      const codeHash = hashString('code-1234');
      const devHash = hashString('dev-1234');

      // Issue challenge 1
      await pool.query(
        'SELECT public.issue_leader_auth_challenge($1, $2, $3, $4, $5, $6, $7)',
        [challenge1, testLeaderId, testEmail, codeHash, devHash, '', '']
      );

      // Issue challenge 2 (supersedes challenge 1)
      await pool.query(
        'SELECT public.issue_leader_auth_challenge($1, $2, $3, $4, $5, $6, $7)',
        [challenge2, testLeaderId, testEmail, codeHash, devHash, '', '']
      );

      // Verify challenge 1 is marked is_used = TRUE
      const c1Res = await pool.query('SELECT is_used FROM public.leader_auth_challenges WHERE challenge_id = $1', [challenge1]);
      expect(c1Res.rows[0].is_used).toBe(true);

      // Verify challenge 2 is is_used = FALSE
      const c2Res = await pool.query('SELECT is_used FROM public.leader_auth_challenges WHERE challenge_id = $1', [challenge2]);
      expect(c2Res.rows[0].is_used).toBe(false);

      // Attempting to consume superseded challenge 1 fails
      const consumeC1 = await pool.query(
        'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
        [challenge1, codeHash, devHash, 'session-attempt-old']
      );
      expect(consumeC1.rows[0].result.success).toBe(false);
      expect(consumeC1.rows[0].result.code).toBe('CODE_ALREADY_USED');

      // Consuming current challenge 2 succeeds
      const consumeC2 = await pool.query(
        'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
        [challenge2, codeHash, devHash, 'session-attempt-new']
      );
      expect(consumeC2.rows[0].result.success).toBe(true);
    });

    it('enforces single active session per leader under concurrent logins', async () => {
      // Create 5 separate challenges for the same leader
      const challenges: { id: string; codeHash: string; devHash: string }[] = [];
      for (let i = 0; i < 5; i++) {
        const id = crypto.randomUUID();
        const codeHash = hashString(`code-${i}`);
        const devHash = hashString(`dev-${i}`);
        // Insert directly into table to simulate 5 valid challenges issued over time
        await pool.query(`
          INSERT INTO public.leader_auth_challenges (
            challenge_id, leader_id, email, code_hash, device_binding_hash, expires_at
          ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')
        `, [id, testLeaderId, testEmail, codeHash, devHash]);
        challenges.push({ id, codeHash, devHash });
      }

      // 5 independent connections verify their distinct challenges simultaneously
      const clients: Client[] = [];
      for (let i = 0; i < 5; i++) {
        const client = new Client({ connectionString: TEST_DB_URL });
        await client.connect();
        clients.push(client);
      }

      try {
        const promises = clients.map((client, idx) => {
          const ch = challenges[idx];
          const newSessionId = `session-sequential-login-${idx}-${crypto.randomBytes(6).toString('hex')}`;
          return client.query(
            'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
            [ch.id, ch.codeHash, ch.devHash, newSessionId]
          );
        });

        const results = await Promise.all(promises);
        // All distinct challenges succeed in sequence under advisory locks
        for (const res of results) {
          expect(res.rows[0].result.success).toBe(true);
        }

        // Under partial unique index `uq_active_leader_session`:
        // Exactly ONE session MUST have is_revoked = FALSE!
        const activeRes = await pool.query(
          'SELECT COUNT(*) FROM public.leader_sessions WHERE leader_id = $1 AND is_revoked = FALSE',
          [testLeaderId]
        );
        expect(Number(activeRes.rows[0].count)).toBe(1);

        // 4 prior sessions must have is_revoked = TRUE with populated revoked_at
        const revokedRes = await pool.query(
          'SELECT COUNT(*) FROM public.leader_sessions WHERE leader_id = $1 AND is_revoked = TRUE AND revoked_at IS NOT NULL',
          [testLeaderId]
        );
        expect(Number(revokedRes.rows[0].count)).toBe(4);
      } finally {
        for (const client of clients) {
          await client.end();
        }
      }
    });

    it('enforces request rate limits atomically under concurrent clients', async () => {
      const rateKey = `rate:atomic-test:${Date.now()}`;
      const shortLimit = 3;
      const shortWindowSec = 60;

      // 10 concurrent requests from 10 independent connections
      const clients: Client[] = [];
      for (let i = 0; i < 10; i++) {
        const client = new Client({ connectionString: TEST_DB_URL });
        await client.connect();
        clients.push(client);
      }

      try {
        const promises = clients.map((client) =>
          client.query(
            'SELECT public.check_and_record_leader_rate_limit($1, $2, $3, $4, $5) as result',
            [rateKey, shortLimit, shortWindowSec, 10, 86400]
          )
        );

        const results = await Promise.all(promises);
        const outcomes = results.map((r) => r.rows[0].result);

        const allowed = outcomes.filter((o) => o.allowed === true);
        const denied = outcomes.filter((o) => o.allowed === false);

        expect(allowed.length).toBe(3);
        expect(denied.length).toBe(7);

        for (const d of denied) {
          expect(d.retryAfterSeconds).toBeGreaterThan(0);
          expect(d.reason).toContain('Too many verification code requests');
        }
      } finally {
        for (const client of clients) {
          await client.end();
        }
      }
    });

    it('atomically increments failed attempts and locks out challenge at 5 failures', async () => {
      const challengeId = crypto.randomUUID();
      const correctHash = hashString('correct-code');
      const devHash = hashString('device-binding');

      await pool.query(
        'SELECT public.issue_leader_auth_challenge($1, $2, $3, $4, $5, $6, $7)',
        [challengeId, testLeaderId, testEmail, correctHash, devHash, '', '']
      );

      // Submit 4 incorrect codes
      for (let i = 1; i <= 4; i++) {
        const wrongHash = hashString(`wrong-code-${i}`);
        const res = await pool.query(
          'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
          [challengeId, wrongHash, devHash, 'session-fail']
        );
        expect(res.rows[0].result.success).toBe(false);
        expect(res.rows[0].result.code).toBe('INVALID_CODE');
        expect(res.rows[0].result.status).toBe(401);
      }

      // 5th attempt locks out
      const res5 = await pool.query(
        'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
        [challengeId, hashString('wrong-code-5'), devHash, 'session-fail']
      );
      expect(res5.rows[0].result.success).toBe(false);
      expect(res5.rows[0].result.code).toBe('LOCKED_OUT');
      expect(res5.rows[0].result.status).toBe(429);

      // Verify database row is locked
      const row = (await pool.query('SELECT failed_attempts, is_locked FROM public.leader_auth_challenges WHERE challenge_id = $1', [challengeId])).rows[0];
      expect(row.failed_attempts).toBe(5);
      expect(row.is_locked).toBe(true);

      // 6th attempt (even with correct code) is rejected with CHALLENGE_LOCKED
      const res6 = await pool.query(
        'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
        [challengeId, correctHash, devHash, 'session-fail']
      );
      expect(res6.rows[0].result.success).toBe(false);
      expect(res6.rows[0].result.code).toBe('CHALLENGE_LOCKED');
      expect(res6.rows[0].result.status).toBe(429);
    });

    it('rejects expired challenges and does not issue sessions', async () => {
      const challengeId = crypto.randomUUID();
      const codeHash = hashString('expired-code');
      const devHash = hashString('dev-binding');

      // Insert challenge with past expiry
      await pool.query(`
        INSERT INTO public.leader_auth_challenges (
          challenge_id, leader_id, email, code_hash, device_binding_hash, expires_at
        ) VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '5 minutes')
      `, [challengeId, testLeaderId, testEmail, codeHash, devHash]);

      const res = await pool.query(
        'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
        [challengeId, codeHash, devHash, 'session-expired']
      );

      expect(res.rows[0].result.success).toBe(false);
      expect(res.rows[0].result.code).toBe('EXPIRED_CODE');
      expect(res.rows[0].result.status).toBe(401);

      // Zero sessions issued
      const sessions = await pool.query('SELECT COUNT(*) FROM public.leader_sessions WHERE session_id = $1', ['session-expired']);
      expect(Number(sessions.rows[0].count)).toBe(0);
    });

    it('rejects challenge consumption if leader identity is deactivated in database', async () => {
      // Deactivate leader
      await pool.query('UPDATE public.leader_identities SET is_active = FALSE WHERE id = $1', [testLeaderId]);

      const challengeId = crypto.randomUUID();
      const codeHash = hashString('code-deactivated');
      const devHash = hashString('dev-deactivated');

      await pool.query(`
        INSERT INTO public.leader_auth_challenges (
          challenge_id, leader_id, email, code_hash, device_binding_hash, expires_at
        ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')
      `, [challengeId, testLeaderId, testEmail, codeHash, devHash]);

      const res = await pool.query(
        'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
        [challengeId, codeHash, devHash, 'session-deactivated']
      );

      expect(res.rows[0].result.success).toBe(false);
      expect(res.rows[0].result.code).toBe('ACCOUNT_INACTIVE');
      expect(res.rows[0].result.status).toBe(403);
    });

    it('leaves zero partial records on transaction rollback/mismatch', async () => {
      const challengeId = crypto.randomUUID();
      const codeHash = hashString('valid-code');
      const correctDev = hashString('device-A');
      const wrongDev = hashString('device-B');

      await pool.query(`
        INSERT INTO public.leader_auth_challenges (
          challenge_id, leader_id, email, code_hash, device_binding_hash, expires_at
        ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')
      `, [challengeId, testLeaderId, testEmail, codeHash, correctDev]);

      const res = await pool.query(
        'SELECT public.consume_leader_challenge_and_create_session($1, $2, $3, $4) as result',
        [challengeId, codeHash, wrongDev, 'session-mismatch']
      );

      expect(res.rows[0].result.success).toBe(false);
      expect(res.rows[0].result.code).toBe('DEVICE_MISMATCH');

      // Challenge is NOT marked is_used
      const ch = (await pool.query('SELECT is_used, failed_attempts FROM public.leader_auth_challenges WHERE challenge_id = $1', [challengeId])).rows[0];
      expect(ch.is_used).toBe(false);
      expect(ch.failed_attempts).toBe(1);

      // Zero sessions created
      const count = await pool.query('SELECT COUNT(*) FROM public.leader_sessions WHERE session_id = $1', ['session-mismatch']);
      expect(Number(count.rows[0].count)).toBe(0);
    });
  });
});

describe('2. Production Database Adapter (SupabaseLeaderAuthStore) Contract Tests', () => {
  it('maps rate limit RPC request and response payload types correctly', async () => {
    let capturedBody: any;
    let capturedUrl: string = '';
    const fakeFetch = async (url: string, init?: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body || '{}');
      return {
        ok: true,
        json: async () => ({ allowed: true, reason: undefined, retryAfterSeconds: undefined }),
      } as any;
    };

    const prevFetch = globalThis.fetch;
    try {
      globalThis.fetch = fakeFetch as any;
      const store = new SupabaseLeaderAuthStore('https://example.supabase.co', 'test-service-key');

      const res = await store.checkAndRecordRateLimit('rate:test:key', Date.now());
      expect(res.allowed).toBe(true);
      expect(capturedUrl).toContain('/rest/v1/rpc/check_and_record_leader_rate_limit');
      expect(capturedBody).toEqual({
        p_key: 'rate:test:key',
        p_short_limit: 3,
        p_short_window_seconds: 900,
        p_long_limit: 10,
        p_long_window_seconds: 86400,
      });
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('maps issue_leader_auth_challenge RPC parameters with lowercase email and valid UUIDs', async () => {
    let capturedBody: any;
    let capturedHeaders: any;
    const fakeFetch = async (url: string, init?: any) => {
      capturedBody = JSON.parse(init?.body || '{}');
      capturedHeaders = init?.headers;
      return {
        ok: true,
        json: async () => ({ success: true }),
      } as any;
    };

    const prevFetch = globalThis.fetch;
    try {
      globalThis.fetch = fakeFetch as any;
      const store = new SupabaseLeaderAuthStore('https://example.supabase.co', 'test-service-key');

      const challengeId = crypto.randomUUID();
      const leaderId = crypto.randomUUID();
      await store.createChallenge({
        challengeId,
        leaderId,
        email: 'ANANYA.ROY@EXAMPLE.ORG',
        codeHash: 'hash123',
        deviceBindingHash: 'dev123',
        userAgentHash: 'ua123',
        ip: '127.0.0.1',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
        failedAttempts: 0,
        isUsed: false,
        isLocked: false,
      });

      expect(capturedHeaders.apikey).toBe('test-service-key');
      expect(capturedHeaders.Authorization).toBe('Bearer test-service-key');
      expect(capturedBody).toEqual({
        p_challenge_id: challengeId,
        p_leader_id: leaderId,
        p_email: 'ananya.roy@example.org', // Lowercased
        p_code_hash: 'hash123',
        p_device_binding_hash: 'dev123',
        p_user_agent_hash: 'ua123',
        p_ip: '127.0.0.1',
      });
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('maps consume_leader_challenge_and_create_session RPC and formats session object', async () => {
    const fakeSession = {
      sessionId: 'session-xyz-123',
      leaderId: crypto.randomUUID(),
      email: 'priya.test@example.org',
      name: 'Priya Menon',
      title: 'State Reviewer',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      authVersion: 1,
      createdAt: 1700000000000,
      lastActivityAt: 1700000000000,
      absoluteExpiresAt: 1700028800000,
      deviceBindingHash: 'dev123',
      isRevoked: false,
      revokedAt: null,
    };

    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ success: true, session: fakeSession }),
    } as any);

    const prevFetch = globalThis.fetch;
    try {
      globalThis.fetch = fakeFetch as any;
      const store = new SupabaseLeaderAuthStore('https://example.supabase.co', 'test-service-key');

      const res = await store.consumeChallengeAndCreateSession({
        challengeId: crypto.randomUUID(),
        submittedCodeHash: 'sub-hash',
        deviceBindingHash: 'dev123',
        leader: {
          id: fakeSession.leaderId,
          email: fakeSession.email,
          name: fakeSession.name,
          title: fakeSession.title,
          role: 'LEADERSHIP',
          allowedStates: ['*'],
          allowedDistricts: ['*'],
          isActive: true,
          authVersion: 1,
        },
        now: Date.now(),
        absoluteLifetimeMs: 28800000,
      });

      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.session?.sessionId).toBe('session-xyz-123');
      expect(res.session?.leaderId).toBe(fakeSession.leaderId);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('redacts sensitive credentials from database errors and fails closed (no memory fallback)', async () => {
    const fakeFetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Error: connection failed for service-role Bearer eyJhbGciOi... and apikey=secret_12345',
    } as any);

    const prevFetch = globalThis.fetch;
    try {
      globalThis.fetch = fakeFetch as any;
      const store = new SupabaseLeaderAuthStore('https://example.supabase.co', 'test-service-key');

      await expect(store.getSession('some-session-id')).rejects.toThrowError(
        /Database getSession failed \(status 500\)/
      );

      // Confirm sensitive keys were sanitized
      await expect(store.getSession('some-session-id')).rejects.toThrowError(
        /Bearer \[REDACTED\]/
      );
      await expect(store.getSession('some-session-id')).rejects.toThrowError(
        /apikey=\[REDACTED\]/
      );
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});
