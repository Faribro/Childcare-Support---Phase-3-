#!/usr/bin/env tsx
/**
 * scripts/seed-leader-identities.ts
 *
 * Seeds authorized leadership identities into Google Cloud Firestore (`leader_identities` collection).
 *
 * Mandates:
 * 1. Safe by default: Defaults to DRY-RUN mode. Requires `--execute` to commit writes.
 * 2. Staging by default: Targets `staging` database by default.
 * 3. Production Protection: Refuses `(default)` or production without explicit `--confirm-production` flag.
 * 4. Input Sources: Accepts local JSON file (`--file=<path>`), default `leaders.seed.json`,
 *    or environment variable `LEADERSHIP_ALLOWLIST_JSON`.
 *
 * Usage:
 *   bun scripts/seed-leader-identities.ts [--dry-run]
 *   bun scripts/seed-leader-identities.ts --execute
 *   bun scripts/seed-leader-identities.ts --file=my-leaders.json --execute
 *   bun scripts/seed-leader-identities.ts --confirm-production --execute
 */

import fs from 'fs';
import path from 'path';
import { getFirestoreDb } from '../src/lib/server/credentialRegistry';
import { LEADER_IDENTITIES_COLLECTION } from '../src/lib/server/leaderAuthStore';
import { LeaderIdentity } from '../src/lib/server/leaderIdentityStore';
import { validateFirestoreDatabaseEnvironment } from '../src/lib/server/firestoreSubmissionAdapter';

interface InputLeader {
  id: string;
  email: string;
  name: string;
  title: string;
  role?: 'LEADERSHIP';
  allowedStates?: string[];
  allowedDistricts?: string[];
  isActive?: boolean;
  authVersion?: number;
}

function loadLeaders(filePath?: string): InputLeader[] {
  if (filePath) {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Input file not found: ${resolved}`);
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected JSON array of leaders in ${resolved}`);
    }
    return parsed;
  }

  // Check for local file leaders.seed.json
  const defaultLocal = path.resolve(process.cwd(), 'leaders.seed.json');
  if (fs.existsSync(defaultLocal)) {
    console.log(`[SEED_LEADERS] Found local seed file: ${defaultLocal}`);
    const content = fs.readFileSync(defaultLocal, 'utf-8');
    return JSON.parse(content);
  }

  // Check LEADERSHIP_ALLOWLIST_JSON env var
  const envAllowlist = process.env.LEADERSHIP_ALLOWLIST_JSON;
  if (envAllowlist) {
    try {
      const parsed = JSON.parse(envAllowlist);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[SEED_LEADERS] Loaded ${parsed.length} leaders from LEADERSHIP_ALLOWLIST_JSON.`);
        return parsed;
      }
    } catch {
      console.warn('[SEED_LEADERS] Malformed LEADERSHIP_ALLOWLIST_JSON.');
    }
  }

  // Fallback demo/evaluation leaders for initial testing
  console.log('[SEED_LEADERS] Using default initial leadership directory.');
  return [
    {
      id: 'lead-ananya-roy',
      email: 'ananya.roy@allianceindia.org',
      name: 'Dr. Ananya Roy',
      title: 'National Programme Director',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isActive: true,
      authVersion: 1,
    },
    {
      id: 'lead-rajiv-menon',
      email: 'rajiv.menon@allianceindia.org',
      name: 'Rajiv Menon',
      title: 'Senior M&E Specialist',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isActive: true,
      authVersion: 1,
    },
  ];
}

async function main() {
  console.log('================================================================');
  console.log(' Childcare Support Phase 3 — Leadership Identities Seed Utility');
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

  const appEnv = (process.env.APP_ENV || 'staging').toLowerCase();
  const dbId = process.env.FIRESTORE_DATABASE_ID || (appEnv === 'production' ? '(default)' : 'staging');

  console.log(`Target Environment : ${appEnv}`);
  console.log(`Firestore Database : ${dbId}`);
  console.log(`Execution Mode     : ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE COMMIT'}`);
  console.log('----------------------------------------------------------------');

  // Hard production refusal guard
  if ((appEnv === 'production' || dbId === '(default)') && !confirmProduction) {
    console.error('[SEED_LEADERS:REFUSAL] Refusing to target production database "(default)" without explicit --confirm-production flag.');
    console.error('To proceed against production: bun scripts/seed-leader-identities.ts --execute --confirm-production');
    process.exit(1);
  }

  validateFirestoreDatabaseEnvironment(appEnv, dbId);

  const leaders = loadLeaders(customFile);
  console.log(`[SEED_LEADERS] Loaded ${leaders.length} leadership profiles.`);

  if (isDryRun) {
    console.log('================================================================');
    console.log(' DRY-RUN SUMMARY (Zero writes performed to Firestore)');
    console.log('================================================================');
    for (const l of leaders) {
      console.log(`  - [SIMULATED] ID: ${l.id.padEnd(20)} | Email: ${l.email.padEnd(32)} | Name: ${l.name}`);
    }
    console.log('\nRun with `--execute` to commit these records to Firestore.');
    return;
  }

  const db = await getFirestoreDb();
  const collectionRef = db.collection(LEADER_IDENTITIES_COLLECTION);

  let committedCount = 0;
  for (const l of leaders) {
    const docId = l.id || l.email.toLowerCase().trim();
    const docData: LeaderIdentity = {
      id: docId,
      email: l.email.toLowerCase().trim(),
      name: l.name.trim(),
      title: l.title.trim(),
      role: 'LEADERSHIP',
      allowedStates: l.allowedStates || ['*'],
      allowedDistricts: l.allowedDistricts || ['*'],
      isActive: l.isActive !== false,
      authVersion: l.authVersion || 1,
    };

    await collectionRef.doc(docId).set(docData);
    committedCount++;
    console.log(`  + [COMMITTED] ID: ${docId.padEnd(20)} | Email: ${docData.email}`);
  }

  console.log('================================================================');
  console.log(`[SEED_LEADERS:SUCCESS] Successfully committed ${committedCount} leadership records to collection "${LEADER_IDENTITIES_COLLECTION}" in database "${dbId}".`);
  console.log('================================================================');
}

main().catch((err) => {
  console.error('[SEED_LEADERS:FATAL] Seeding failed:', err);
  process.exit(1);
});
