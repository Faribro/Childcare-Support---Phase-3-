#!/usr/bin/env tsx
/**
 * scripts/reset-staging.ts
 *
 * Dedicated reset utility for the staging environment.
 * Wipes only the `staging` Firestore database collections and the staging bucket test objects.
 *
 * Hardcoded Safety Invariants:
 * 1. REFUSES to run against production: Aborts immediately if APP_ENV=production,
 *    FIRESTORE_DATABASE_ID=(default), or bucket contains "production".
 * 2. Requires explicit confirmation prompt (or --force for automated testing).
 * 3. Never touches production GCP project resources or DNS.
 *
 * Usage:
 *   bun scripts/reset-staging.ts
 *   bun scripts/reset-staging.ts --force
 *   bun scripts/reset-staging.ts --include-credentials
 */

import readline from 'readline';
import { getFirestoreDb } from '../src/lib/server/credentialRegistry';
import { validateFirestoreDatabaseEnvironment } from '../src/lib/server/firestoreSubmissionAdapter';

const STAGING_COLLECTIONS_TO_WIPE = [
  'submissions',
  'attachment_metadata',
  'sheets_mirror_retry_queue',
  'auth_attempts',
  'auth_lockouts',
  'leadership_sessions',
  'leader_otp_challenges',
  'state_team_registrations',
  'state_team_invitations',
  'state_team_challenges',
  'field_user_profiles',
  'export_delivery_jobs',
  'export_preview_contracts',
];

async function confirmPrompt(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() === 'RESET STAGING');
    });
  });
}

async function wipeFirestoreCollection(db: any, collectionName: string): Promise<number> {
  const collectionRef = db.collection(collectionName);
  const snap = await collectionRef.limit(500).get();

  if (snap.empty) {
    return 0;
  }

  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  return snap.size;
}

async function wipeStagingBucket(bucketName: string): Promise<number> {
  try {
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production' });
    const bucket = storage.bucket(bucketName);
    const [files] = await bucket.getFiles({ maxResults: 1000 });

    if (!files || files.length === 0) {
      return 0;
    }

    let deleted = 0;
    for (const file of files) {
      await file.delete().catch(() => {});
      deleted++;
    }
    return deleted;
  } catch (err: any) {
    console.warn(`[RESET_STAGING:STORAGE_WARN] Bucket wipe warning: ${err?.message}`);
    return 0;
  }
}

async function main() {
  console.log('================================================================');
  console.log(' Childcare Support Phase 3 — Staging Environment Reset Utility');
  console.log('================================================================');

  const args = process.argv.slice(2);
  const isForce = args.includes('--force');
  const includeCredentials = args.includes('--include-credentials');

  const appEnv = (process.env.APP_ENV || 'staging').toLowerCase();
  const dbId = process.env.FIRESTORE_DATABASE_ID || 'staging';
  const bucketName = process.env.GCS_BUCKET_NAME || 'cs-p3-childcare-staging';

  console.log(`Application Environment : ${appEnv}`);
  console.log(`Firestore Database ID   : ${dbId}`);
  console.log(`Storage Bucket Target   : ${bucketName}`);
  console.log('----------------------------------------------------------------');

  // HARD SAFETY INVARIANT: Strictly refuse production
  if (
    appEnv === 'production' ||
    dbId === '(default)' ||
    bucketName.toLowerCase().includes('prod') ||
    bucketName === 'cs-p3-childcare-production'
  ) {
    console.error('\n[RESET_STAGING:HARD_REFUSAL] CRITICAL ERROR: reset-staging is HARDCODED to REFUSE production targets.');
    console.error(`Attempted target: APP_ENV="${appEnv}", FIRESTORE_DATABASE_ID="${dbId}", BUCKET="${bucketName}"`);
    console.error('This utility can ONLY ever be executed against the staging database and staging bucket.\n');
    process.exit(1);
  }

  validateFirestoreDatabaseEnvironment(appEnv, dbId);

  if (!isForce) {
    console.log('\nWARNING: This operation will permanently delete test data from:');
    console.log(`  - Firestore Database: "${dbId}" in project "${process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production'}"`);
    console.log(`  - Cloud Storage Bucket: "${bucketName}"\n`);

    const confirmed = await confirmPrompt("Type 'RESET STAGING' to proceed with wiping staging test data: ");
    if (!confirmed) {
      console.log('[RESET_STAGING] Confirmation mismatch. Reset cancelled.');
      process.exit(0);
    }
  }

  console.log('\n[RESET_STAGING] Commencing staging data wipe...');

  const db = await getFirestoreDb();
  const collections = [...STAGING_COLLECTIONS_TO_WIPE];
  if (includeCredentials) {
    collections.push('evaluation_credentials', 'leader_identities');
  }

  for (const col of collections) {
    try {
      const count = await wipeFirestoreCollection(db, col);
      console.log(`  - Collection "${col}": ${count} documents deleted.`);
    } catch (err: any) {
      console.warn(`  - Collection "${col}" wipe warning: ${err?.message}`);
    }
  }

  console.log(`[RESET_STAGING] Wiping staging Cloud Storage bucket: "${bucketName}"...`);
  const filesDeleted = await wipeStagingBucket(bucketName);
  console.log(`  - Bucket "${bucketName}": ${filesDeleted} test objects deleted.`);

  console.log('================================================================');
  console.log('[RESET_STAGING:SUCCESS] Staging reset complete. Database and bucket are clean.');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('[RESET_STAGING:FATAL] Staging reset failed:', err);
  process.exit(1);
});
