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

  // Fallback default authorized leadership directory
  console.log('[SEED_LEADERS] Using authorized leadership roster.');
  return [
    {
      id: 'lead-faridsayyed1010',
      email: 'faridsayyed1010@gmail.com',
      name: 'faridsayyed1010',
      title: 'faridsayyed1010',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isActive: true,
      authVersion: 1,
    },
    {
      id: 'lead-mbalani',
      email: 'mbalani@allianceindia.org',
      name: 'mbalani',
      title: 'mbalani',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isActive: true,
      authVersion: 1,
    },
    {
      id: 'lead-pramodk',
      email: 'pramodk@allianceindia.org',
      name: 'pramodk',
      title: 'pramodk',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isActive: true,
      authVersion: 1,
    },
    {
      id: 'lead-agusain',
      email: 'agusain@allianceindia.org',
      name: 'agusain',
      title: 'agusain',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isActive: true,
      authVersion: 1,
    },
    {
      id: 'lead-mbamrotiya',
      email: 'mbamrotiya@allianceindia.org',
      name: 'mbamrotiya',
      title: 'mbamrotiya',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isActive: true,
      authVersion: 1,
    },
  ];
}

function getGcloudAccessToken(): string | null {
  try {
    const { execSync } = require('child_process');
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();
    return token || null;
  } catch {
    return null;
  }
}

async function writeFirestoreDoc(
  token: string,
  projectId: string,
  databaseId: string,
  collection: string,
  docId: string,
  fields: Record<string, any>
) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collection}/${encodeURIComponent(docId)}`;
  
  const formattedFields: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val === null || val === undefined) {
      formattedFields[key] = { nullValue: null };
    } else if (typeof val === 'string') {
      formattedFields[key] = { stringValue: val };
    } else if (typeof val === 'boolean') {
      formattedFields[key] = { booleanValue: val };
    } else if (typeof val === 'number') {
      formattedFields[key] = { integerValue: String(Math.floor(val)) };
    } else if (Array.isArray(val)) {
      formattedFields[key] = {
        arrayValue: {
          values: val.map((v) => ({ stringValue: String(v) })),
        },
      };
    }
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: formattedFields }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Firestore REST write failed for ${collection}/${docId} [${res.status}]: ${errorText}`);
  }

  return await res.json();
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
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production';

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

  const gcloudToken = getGcloudAccessToken();
  let db: any = null;
  if (!gcloudToken) {
    db = await getFirestoreDb();
  }

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

    if (gcloudToken) {
      await writeFirestoreDoc(gcloudToken, projectId, dbId, LEADER_IDENTITIES_COLLECTION, docId, {
        id: docData.id,
        email: docData.email,
        name: docData.name,
        title: docData.title,
        role: docData.role,
        allowedStates: docData.allowedStates,
        allowedDistricts: docData.allowedDistricts,
        isActive: docData.isActive,
        authVersion: docData.authVersion,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const collectionRef = db.collection(LEADER_IDENTITIES_COLLECTION);
      await collectionRef.doc(docId).set(docData);
    }

    committedCount++;
    console.log(`  + [COMMITTED] ID: ${docId.padEnd(25)} | Email: ${docData.email}`);
  }

  console.log('================================================================');
  console.log(`[SEED_LEADERS:SUCCESS] Successfully committed ${committedCount} leadership records to collection "${LEADER_IDENTITIES_COLLECTION}" in database "${dbId}".`);
  console.log('================================================================');
}

main().catch((err) => {
  console.error('[SEED_LEADERS:FATAL] Seeding failed:', err);
  process.exit(1);
});
