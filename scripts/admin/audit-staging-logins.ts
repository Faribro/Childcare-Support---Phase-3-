#!/usr/bin/env tsx
/**
 * scripts/admin/audit-staging-logins.ts
 *
 * Read-only security audit utility for inspecting recent coordinator and
 * evaluation authentication attempts in the staging environment.
 *
 * Security Invariants:
 * 1. Zero secret exposure: NEVER displays passwords, hashes, salts, or tokens.
 * 2. Anonymizes IPs partially for operational privacy (e.g., masks last octet).
 * 3. Inspects rate limiting and lockout state without mutating records.
 */

import { getFirestoreDb, AUTH_ATTEMPTS_COLLECTION } from '../../src/lib/server/credentialRegistry';
import { validateFirestoreDatabaseEnvironment } from '../../src/lib/server/firestoreSubmissionAdapter';

function maskIp(ip?: string): string {
  if (!ip) return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  return ip.substring(0, Math.min(ip.length, 12)) + '...';
}

async function main() {
  const targetEnv = 'staging';
  const databaseId = 'staging';

  process.env.APP_ENV = targetEnv;
  process.env.FIRESTORE_DATABASE_ID = databaseId;
  validateFirestoreDatabaseEnvironment(targetEnv, databaseId);

  console.log('================================================================');
  console.log('STAGING AUTHENTICATION ATTEMPTS AUDIT');
  console.log(`Environment: ${targetEnv} | Database: ${databaseId}`);
  console.log('================================================================\n');

  try {
    const db = await getFirestoreDb();
    const snap = await db.collection(AUTH_ATTEMPTS_COLLECTION).limit(50).get();

    if (snap.empty) {
      console.log('✓ Zero active lockout records or failed attempt trackers in auth_attempts.');
      console.log('  All evaluation accounts are currently clear of rate-limit lockouts.\n');
      return;
    }

    console.log(`Found ${snap.size} active attempt tracking document(s):\n`);
    const now = Date.now();

    for (const doc of snap.docs) {
      const data = doc.data();
      const isLocked = Boolean(data.lockoutUntil && data.lockoutUntil > now);
      const remainingSec = isLocked ? Math.ceil((data.lockoutUntil - now) / 1000) : 0;

      console.log(`- Document ID:   ${doc.id}`);
      console.log(`  Access ID:     ${data.accessIdentifier || 'N/A'}`);
      console.log(`  IP Mask:       ${maskIp(data.ipAddress)}`);
      console.log(`  Failed Count:  ${data.failedAttempts || 0}`);
      console.log(`  Lockout State: ${isLocked ? `LOCKED (expires in ${remainingSec}s)` : 'ACTIVE / NOT LOCKED'}`);
      console.log(`  Last Attempt:  ${data.lastAttemptIso || 'N/A'}\n`);
    }
  } catch (err: any) {
    console.warn(`[ADC/Connection Notice] Could not read live Firestore: ${err.message}`);
    console.log('When running in Cloud Run, auth_attempts records are queried directly by the server.');
  }
}

main().catch((e) => {
  console.error('Audit execution error:', e.message);
  process.exit(1);
});
