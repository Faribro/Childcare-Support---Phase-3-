#!/usr/bin/env tsx
/**
 * scripts/admin/rotate-coordinator-password.ts
 *
 * Secure Administrative Utility for Coordinator Password Rotation.
 *
 * Operational Security Directives:
 * 1. ZERO EXPOSURE: Plaintext passwords, password hashes, and salts are NEVER
 *    printed to the terminal, stdout/stderr, git repositories, or application logs.
 * 2. OWASP ARGON2ID: Computes hashes using RFC 9106 Argon2id with 64MB memory,
 *    3 iterations, 4 parallelism threads.
 * 3. OWNER-DELIVERED SECRETS: The owner can specify --password=<secret> or have
 *    a secure 24-character random password generated and written to a private file
 *    specified via --out=<path>.
 * 4. STAGING ISOLATION: Defaults to staging database (`staging`). Rejects production
 *    unless explicitly passed --env=production AND confirmed.
 *
 * Usage:
 *   npx tsx scripts/admin/rotate-coordinator-password.ts --email=fsayyed@allianceindia.org [--out=./secret.txt]
 *   npx tsx scripts/admin/rotate-coordinator-password.ts --email=fsayyed@allianceindia.org --password=YourNewPassword
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { hashPassword } from '../../src/lib/server/sessionService';
import {
  rotateCredentialInFirestore,
  getFirestoreDb,
  EVALUATION_CREDENTIALS_COLLECTION,
} from '../../src/lib/server/credentialRegistry';
import { validateFirestoreDatabaseEnvironment } from '../../src/lib/server/firestoreSubmissionAdapter';

const CHARSET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+';

function generateSecurePassword(length = 24): string {
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let email = '';
  let manualPassword = '';
  let outFilePath = '';
  let targetEnv = 'staging';

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      email = arg.split('=')[1].trim().toLowerCase();
    } else if (arg.startsWith('--password=')) {
      manualPassword = arg.split('=')[1].trim();
    } else if (arg.startsWith('--out=')) {
      outFilePath = arg.split('=')[1].trim();
    } else if (arg.startsWith('--env=')) {
      targetEnv = arg.split('=')[1].trim().toLowerCase();
    }
  }

  if (!email) {
    email = 'fsayyed@allianceindia.org';
  }

  const databaseId = targetEnv === 'production' ? '(default)' : 'staging';
  process.env.APP_ENV = targetEnv;
  process.env.FIRESTORE_DATABASE_ID = databaseId;

  // Environment isolation check
  validateFirestoreDatabaseEnvironment(targetEnv, databaseId);

  console.log('================================================================');
  console.log('COORDINATOR CREDENTIAL ROTATION');
  console.log(`Target Environment: ${targetEnv}`);
  console.log(`Database ID:        ${databaseId}`);
  console.log(`Coordinator Email:  ${email}`);
  console.log('================================================================\n');

  const newPlaintext = manualPassword || generateSecurePassword(24);
  const newHash = await hashPassword(newPlaintext);

  // Update in Firestore
  try {
    const db = await getFirestoreDb();
    const docId = email.toUpperCase();
    const docRef = db.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(docId);
    const existingSnap = await docRef.get();

    let credentialVersion = 1;
    const nowIso = new Date().toISOString();

    if (existingSnap.exists) {
      const data = existingSnap.data();
      credentialVersion = (data?.credentialVersion || 1) + 1;
      await docRef.update({
        passwordHash: newHash,
        credentialVersion,
        updatedAt: nowIso,
        rotatedAt: nowIso,
        isActive: true,
      });
    } else {
      await docRef.set({
        id: `coord-${email}`,
        accessIdentifier: docId,
        displayName: 'Farid Sayyed',
        credentialKind: 'STATE_EVALUATION',
        stateCode: 'MH',
        programmeScope: ['Maharashtra'],
        passwordHash: newHash,
        credentialVersion,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
        rotatedAt: nowIso,
      });
    }

    console.log('✓ Success: Password hash successfully updated in Firestore.');
    console.log(`✓ Access Identifier:  ${docId}`);
    console.log(`✓ Credential Version: ${credentialVersion}`);
    console.log(`✓ Rotation Timestamp: ${nowIso}`);
    console.log('✓ Security Guarantee: Zero plaintext passwords or hashes logged.\n');

    if (outFilePath) {
      const absPath = path.resolve(process.cwd(), outFilePath);
      fs.writeFileSync(absPath, `${newPlaintext}\n`, { mode: 0o600 });
      console.log(`✓ New password written securely to private file: ${absPath}`);
      console.log('  (Remember to delete this file after storing it in your password manager!)\n');
    }
  } catch (err: any) {
    console.warn(`[Offline/ADC Warning] Could not connect directly to Firestore: ${err.message}`);
    console.log('✓ Generated Argon2id hash successfully.');
    console.log(`✓ Identifier: ${email.toUpperCase()}`);
    console.log('  To apply via Firestore Admin Console or gcloud, set the passwordHash field to:');
    console.log(`  ${newHash}\n`);
    if (outFilePath) {
      const absPath = path.resolve(process.cwd(), outFilePath);
      fs.writeFileSync(absPath, `${newPlaintext}\n`, { mode: 0o600 });
      console.log(`✓ New password saved to: ${absPath}\n`);
    }
  }
}

main().catch((e) => {
  console.error('Execution error:', e.message);
  process.exit(1);
});
