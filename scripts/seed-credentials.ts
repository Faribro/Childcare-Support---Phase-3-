#!/usr/bin/env tsx
/**
 * scripts/seed-credentials.ts
 *
 * Seeds evaluation credentials in Google Cloud Firestore from a local JSON file
 * or the canonical state roster. Generates cryptographically random one-time passwords
 * printed ONCE directly to the local terminal session and never persisted to disk or logs.
 *
 * Mandates:
 * 1. Dry-run by default: Requires explicit `--execute` flag to commit writes.
 * 2. Staging by default: Defaults to APP_ENV=staging and FIRESTORE_DATABASE_ID=staging.
 * 3. Production Protection: Refuses to target `(default)` database or production without `--confirm-production`.
 * 4. Zero Disk Persistence: Passwords exist solely in ephemeral memory and stdout during execution.
 *
 * Usage:
 *   bun scripts/seed-credentials.ts [--dry-run]
 *   bun scripts/seed-credentials.ts --execute
 *   bun scripts/seed-credentials.ts --file=my-accounts.json --execute
 *   bun scripts/seed-credentials.ts --confirm-production --execute
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CANONICAL_EVALUATION_STATES,
  LEADERSHIP_ACCESS_IDENTIFIER,
  ADMIN_ACCESS_IDENTIFIER,
  EVALUATION_CREDENTIALS_COLLECTION,
  saveCredentialToFirestore,
  EvaluationCredential,
} from '../src/lib/server/credentialRegistry';
import { hashPassword } from '../src/lib/server/sessionService';
import { validateFirestoreDatabaseEnvironment } from '../src/lib/server/firestoreSubmissionAdapter';

interface InputAccount {
  identifier: string;
  role: 'STATE_REVIEWER' | 'LEADERSHIP' | 'ADMIN' | 'FIELD_USER';
  state?: string;
  districts?: string[];
  displayName?: string;
}

interface SeededResult {
  identifier: string;
  role: string;
  state: string;
  plainPassword: string;
  status: 'DRY_RUN' | 'COMMITTED';
}

function generateOneTimePassword(): string {
  // 16-character high-entropy alphanumeric password
  return crypto.randomBytes(12).toString('base64url');
}

function loadAccounts(filePath?: string): InputAccount[] {
  if (filePath) {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Input accounts file not found: ${resolved}`);
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected JSON array of account objects in ${resolved}`);
    }
    return parsed;
  }

  // Check for local file default credentials.seed.json
  const defaultLocal = path.resolve(process.cwd(), 'credentials.seed.json');
  if (fs.existsSync(defaultLocal)) {
    console.log(`[SEED] Found local seed file: ${defaultLocal}`);
    const content = fs.readFileSync(defaultLocal, 'utf-8');
    return JSON.parse(content);
  }

  // Fallback to canonical roster
  console.log('[SEED] Using canonical evaluation state roster.');
  const canonical: InputAccount[] = CANONICAL_EVALUATION_STATES.map((s) => ({
    identifier: s.accessIdentifier,
    role: 'STATE_REVIEWER',
    state: s.name,
    displayName: `${s.name} State Evaluation`,
  }));

  canonical.push({
    identifier: LEADERSHIP_ACCESS_IDENTIFIER,
    role: 'LEADERSHIP',
    state: '*',
    displayName: 'National Programme Leadership (All States)',
  });

  canonical.push({
    identifier: ADMIN_ACCESS_IDENTIFIER,
    role: 'ADMIN',
    state: '*',
    displayName: 'System Administrator',
  });

  return canonical;
}

async function main() {
  console.log('================================================================');
  console.log(' Childcare Support Phase 3 — Evaluation Credentials Seed Utility');
  console.log('================================================================');

  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isDryRun = !isExecute || args.includes('--dry-run');
  const confirmProduction = args.includes('--confirm-production');

  let customFile: string | undefined;
  for (const a of args) {
    if (a.startsWith('--file=')) {
      customFile = a.split('=')[1];
    }
  }

  // Default to staging
  const appEnv = (process.env.APP_ENV || 'staging').toLowerCase();
  const dbId = process.env.FIRESTORE_DATABASE_ID || (appEnv === 'production' ? '(default)' : 'staging');

  console.log(`Target Environment : ${appEnv}`);
  console.log(`Firestore Database : ${dbId}`);
  console.log(`Execution Mode     : ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE COMMIT'}`);
  console.log('----------------------------------------------------------------');

  // Hard block against production password seeding
  if (appEnv === 'production' || dbId === '(default)' || confirmProduction) {
    console.error('[SEED_CREDENTIALS:REFUSAL] Static password seeding is permanently decommissioned and strictly forbidden against production.');
    console.error('All authentication in production and staging must rely on dynamic OTP.');
    process.exit(1);
  }

  // Hard production refusal guard
  if ((appEnv === 'production' || dbId === '(default)') && !confirmProduction) {
    console.error('[SEED:REFUSAL] Refusing to seed production database "(default)" without explicit --confirm-production flag.');
    console.error('To proceed against production: bun scripts/seed-credentials.ts --execute --confirm-production');
    process.exit(1);
  }

  // Validate database environment pairing
  try {
    validateFirestoreDatabaseEnvironment(appEnv, dbId);
  } catch (err: any) {
    console.error(`[SEED:GUARD_ERROR] ${err.message}`);
    process.exit(1);
  }

  const accounts = loadAccounts(customFile);
  console.log(`[SEED] Loaded ${accounts.length} account definitions.`);

  const results: SeededResult[] = [];

  for (const acc of accounts) {
    const rawId = acc.identifier.trim().toUpperCase();
    const plainPwd = generateOneTimePassword();
    const displayName = acc.displayName || `${rawId} User`;
    const state = acc.state || '*';

    let credKind: 'STATE_EVALUATION' | 'LEADERSHIP_EVALUATION' | 'ADMIN' = 'STATE_EVALUATION';
    if (acc.role === 'LEADERSHIP') credKind = 'LEADERSHIP_EVALUATION';
    if (acc.role === 'ADMIN') credKind = 'ADMIN';

    if (!isDryRun) {
      const pwdHash = await hashPassword(plainPwd);
      const nowIso = new Date().toISOString();
      const record: EvaluationCredential = {
        id: rawId,
        accessIdentifier: rawId,
        displayName,
        credentialKind: credKind,
        stateCode: state !== '*' ? state : null,
        programmeScope: ['alliance-childcare-phase3'],
        passwordHash: pwdHash,
        credentialVersion: 1,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await saveCredentialToFirestore(record);
      results.push({
        identifier: rawId,
        role: acc.role,
        state,
        plainPassword: plainPwd,
        status: 'COMMITTED',
      });
    } else {
      results.push({
        identifier: rawId,
        role: acc.role,
        state,
        plainPassword: plainPwd,
        status: 'DRY_RUN',
      });
    }
  }

  console.log('================================================================');
  if (isDryRun) {
    console.log(' DRY-RUN SUMMARY (Zero writes performed to Firestore)');
    console.log('================================================================');
    for (const r of results) {
      console.log(`  - [SIMULATED] Identifier: ${r.identifier.padEnd(16)} | Role: ${r.role.padEnd(14)} | State: ${r.state}`);
    }
    console.log('\nRun with `--execute` to generate and write these credentials.');
  } else {
    console.log(' CRITICAL ONE-TIME CREDENTIALS ROSTER');
    console.log(' ATTENTION: These passwords are shown ONCE and NEVER stored in plaintext.');
    console.log(' Copy and distribute these credentials to authorized personnel now:');
    console.log('================================================================');
    console.log('IDENTIFIER'.padEnd(18) + 'ROLE'.padEnd(16) + 'STATE'.padEnd(18) + 'ONE-TIME PASSWORD');
    console.log('----------------------------------------------------------------');
    for (const r of results) {
      console.log(
        `${r.identifier.padEnd(18)}${r.role.padEnd(16)}${r.state.padEnd(18)}${r.plainPassword}`
      );
    }
    console.log('================================================================');
    console.log(`[SEED:SUCCESS] Successfully committed ${results.length} credentials to Firestore collection "${EVALUATION_CREDENTIALS_COLLECTION}" in database "${dbId}".`);
  }
}

main().catch((err) => {
  console.error('[SEED:FATAL] Seeding failed:', err);
  process.exit(1);
});
