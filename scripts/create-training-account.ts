#!/usr/bin/env tsx
/**
 * scripts/create-training-account.ts
 *
 * Dedicated staging utility for creating an isolated synthetic TRAINING evaluation account in Firestore.
 *
 * Safety & Isolation Rules:
 * 1. STRICT STAGING LOCKOUT:
 *    Refuses execution if APP_ENV is 'production' or if FIRESTORE_DATABASE_ID is '(default)'.
 *    Only permitted when APP_ENV=staging and FIRESTORE_DATABASE_ID=staging.
 * 2. CRYPTOGRAPHIC ENTROPY:
 *    Generates a cryptographically strong 24-character random one-time password using crypto.randomBytes.
 * 3. OWASP ARGON2ID HASHING:
 *    Hashes password using native RFC 9106 Argon2id parameters.
 * 4. TRAINING METADATA:
 *    Clearly marked as synthetic test fixture with `stateCode: 'Training'`, `credentialKind: 'STATE_EVALUATION'`.
 *
 * Usage:
 *   APP_ENV=staging FIRESTORE_DATABASE_ID=staging bun scripts/create-training-account.ts
 *   APP_ENV=staging FIRESTORE_DATABASE_ID=staging bun scripts/create-training-account.ts --identifier=STATE-TR
 */

import crypto from 'crypto';
import {
  saveCredentialToFirestore,
  getFirestoreDb,
  EVALUATION_CREDENTIALS_COLLECTION,
  EvaluationCredential,
} from '../src/lib/server/credentialRegistry';
import { hashPassword } from '../src/lib/server/sessionService';
import { validateFirestoreDatabaseEnvironment } from '../src/lib/server/firestoreSubmissionAdapter';

const PASSWORD_LENGTH = 24;
const CHARSET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+';

function generateRandomPassword(length = PASSWORD_LENGTH): string {
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }
  return result;
}

export async function createTrainingAccount(options: {
  identifier?: string;
  appEnv?: string;
  databaseId?: string;
} = {}) {
  const appEnv = options.appEnv || process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'staging';
  const databaseId = options.databaseId || process.env.FIRESTORE_DATABASE_ID || 'staging';
  const identifier = (options.identifier || process.argv.find((a) => a.startsWith('--identifier='))?.split('=')[1] || 'STATE-TR').toUpperCase().trim();

  // Safety Gate: Must run against staging only
  if (appEnv.toLowerCase() === 'production' || databaseId === '(default)') {
    throw new Error(
      `SECURITY_GATE_VIOLATION: Refusing to create training account in production! Must run with APP_ENV=staging and FIRESTORE_DATABASE_ID=staging.`
    );
  }

  // Validate environment database pairing
  validateFirestoreDatabaseEnvironment(appEnv, databaseId);

  const plainPassword = generateRandomPassword();
  const passwordHash = await hashPassword(plainPassword);
  const now = new Date().toISOString();

  const credential: EvaluationCredential = {
    id: `eval-tr-${Date.now()}`,
    accessIdentifier: identifier,
    displayName: 'Staging Synthetic Training Evaluator',
    credentialKind: 'STATE_EVALUATION',
    stateCode: 'Training',
    programmeScope: ['alliance-childcare-phase3'],
    passwordHash,
    credentialVersion: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    deliveryRef: 'operator://terminal-one-time',
    notes: 'Temporary synthetic training account for staging verification. Must be rotated or purged before go-live.',
  };

  const db = await getFirestoreDb();
  await saveCredentialToFirestore(credential, db);

  console.log(`================================================================`);
  console.log(`TRAINING ACCOUNT CREATED IN STAGING FIRESTORE`);
  console.log(`================================================================`);
  console.log(`Project:            ${process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production'}`);
  console.log(`Environment:        ${appEnv}`);
  console.log(`Database ID:        ${databaseId}`);
  console.log(`Collection:         ${EVALUATION_CREDENTIALS_COLLECTION}`);
  console.log(`Access Identifier:  ${credential.accessIdentifier}`);
  console.log(`Display Name:       ${credential.displayName}`);
  console.log(`State Scope:        ${credential.stateCode}`);
  console.log(`Status:             ACTIVE (v1)`);
  console.log(`----------------------------------------------------------------`);
  console.log(`One-Time Password:  ${plainPassword}`);
  console.log(`----------------------------------------------------------------`);
  console.log(`OPERATOR NOTICE: Store this one-time password securely in your vault.`);
  console.log(`It has NOT been logged to disk or committed to source control.`);
  console.log(`================================================================\n`);

  return { identifier, plainPassword, credential };
}

if ((import.meta as any).main || process.argv[1]?.endsWith('create-training-account.ts')) {
  createTrainingAccount().catch((err) => {
    console.error(`FATAL: Could not create training account:`, err.message);
    process.exit(1);
  });
}
