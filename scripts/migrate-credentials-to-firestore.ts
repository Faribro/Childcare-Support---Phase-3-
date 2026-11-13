#!/usr/bin/env tsx
/**
 * scripts/migrate-credentials-to-firestore.ts
 *
 * Migration utility for transferring evaluation credentials to Google Cloud Firestore (Native mode).
 *
 * Security & Reliability Mandates:
 * 1. Safe by default: Defaults to DRY-RUN mode. Requires explicit `--execute` flag to modify Firestore.
 * 2. Database Environment Guard: Enforces `validateFirestoreDatabaseEnvironment`.
 *    Refuses to run staging against `(default)` and refuses to run production against `staging`.
 * 3. Zero Secret Leakage: Never logs or prints plaintext passwords, salts, or Argon2 hashes.
 *    Only outputs credential counts, access identifiers, display names, and active statuses.
 * 4. Document Structure: Keyed by canonical `accessIdentifier` in uppercase (e.g., `STATE-MH`, `LEADERSHIP-ALL`).
 *
 * Usage:
 *   bun scripts/migrate-credentials-to-firestore.ts [--dry-run]
 *   bun scripts/migrate-credentials-to-firestore.ts --execute
 *   APP_ENV=staging FIRESTORE_DATABASE_ID=staging bun scripts/migrate-credentials-to-firestore.ts --execute
 */

import {
  CANONICAL_EVALUATION_STATES,
  LEADERSHIP_ACCESS_IDENTIFIER,
  ADMIN_ACCESS_IDENTIFIER,
  EVALUATION_CREDENTIALS_COLLECTION,
  getTestStatePassword,
  getTestLeadershipPassword,
  getTestAdminPassword,
  saveCredentialToFirestore,
  getFirestoreDb,
  EvaluationCredential,
} from '../src/lib/server/credentialRegistry';
import { hashPassword } from '../src/lib/server/sessionService';
import { validateFirestoreDatabaseEnvironment } from '../src/lib/server/firestoreSubmissionAdapter';

interface MigrationPlan {
  records: EvaluationCredential[];
  source: string;
}

async function collectCredentialsFromSupabase(): Promise<EvaluationCredential[] | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/rest/v1/evaluation_credential_registry?select=*`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[MIGRATE] Supabase registry query failed with HTTP ${res.status}. Falling back to canonical seed list.`);
      return null;
    }

    const rows: any[] = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    return rows.map((data) => ({
      id: data.id || data.access_identifier,
      accessIdentifier: data.access_identifier,
      displayName: data.display_name,
      credentialKind: data.credential_kind,
      stateCode: data.state_code || null,
      programmeScope: data.programme_scope || ['alliance-childcare-phase3'],
      passwordHash: data.password_hash,
      credentialVersion: data.credential_version || 1,
      isActive: data.is_active !== false,
      createdAt: data.created_at || new Date().toISOString(),
      updatedAt: data.updated_at || new Date().toISOString(),
      rotatedAt: data.rotated_at || null,
      expiresAt: data.expires_at || null,
      deliveryRef: data.metadata?.deliveryRef || null,
      notes: data.metadata?.notes || null,
    }));
  } catch (err: any) {
    console.warn(`[MIGRATE] Error contacting Supabase: ${err.message}. Falling back to canonical seed list.`);
    return null;
  }
}

async function generateCanonicalSeedCredentials(): Promise<EvaluationCredential[]> {
  const records: EvaluationCredential[] = [];
  const now = new Date().toISOString();

  // 1. Canonical State Evaluators
  for (const st of CANONICAL_EVALUATION_STATES) {
    const pwd = process.env.INITIAL_REV_MH_PWD || getTestStatePassword(st.code);
    const hash = await hashPassword(pwd);
    records.push({
      id: `eval-${st.code.toLowerCase()}-01`,
      accessIdentifier: st.accessIdentifier,
      displayName: `${st.name} State Evaluation`,
      credentialKind: 'STATE_EVALUATION',
      stateCode: st.name,
      programmeScope: ['alliance-childcare-phase3'],
      passwordHash: hash,
      credentialVersion: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deliveryRef: `vault://managed/${st.accessIdentifier.toLowerCase()}`,
      notes: `Canonical credential for ${st.name} state evaluation`,
    });
  }

  // 2. Leadership Credential
  const leadPwd = process.env.INITIAL_LEADERSHIP_PWD || getTestLeadershipPassword();
  const leadHash = await hashPassword(leadPwd);
  records.push({
    id: 'lead-nat-01',
    accessIdentifier: LEADERSHIP_ACCESS_IDENTIFIER,
    displayName: 'National Programme Leadership (All States)',
    credentialKind: 'LEADERSHIP_EVALUATION',
    stateCode: null,
    programmeScope: ['alliance-childcare-phase3'],
    passwordHash: leadHash,
    credentialVersion: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    deliveryRef: 'vault://managed/leadership-all',
    notes: 'National Programme Leadership evaluation credential',
  });

  // 3. Admin Maintenance Credential
  const adminPwd = process.env.INITIAL_ADMIN_PWD || getTestAdminPassword();
  const adminHash = await hashPassword(adminPwd);
  records.push({
    id: 'admin-01',
    accessIdentifier: ADMIN_ACCESS_IDENTIFIER,
    displayName: 'System Administrator',
    credentialKind: 'ADMIN',
    stateCode: null,
    programmeScope: ['alliance-childcare-phase3'],
    passwordHash: adminHash,
    credentialVersion: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    deliveryRef: 'vault://managed/admin-system',
    notes: 'System administrator maintenance credential',
  });

  return records;
}

export async function runMigration(options: { execute?: boolean; databaseId?: string; appEnv?: string } = {}) {
  const isExecute = options.execute ?? process.argv.includes('--execute');
  const appEnv = options.appEnv || process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'staging';
  const databaseId = options.databaseId || process.env.FIRESTORE_DATABASE_ID || (appEnv === 'staging' ? 'staging' : '(default)');

  console.log(`================================================================`);
  console.log(`EVALUATION CREDENTIALS -> FIRESTORE MIGRATION`);
  console.log(`Mode:        ${isExecute ? 'EXECUTE (LIVE WRITE)' : 'DRY RUN (AUDIT ONLY)'}`);
  console.log(`Target Env:  ${appEnv}`);
  console.log(`Database ID: ${databaseId}`);
  console.log(`Project:     ${process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production'}`);
  console.log(`Collection:  ${EVALUATION_CREDENTIALS_COLLECTION}`);
  console.log(`================================================================`);

  // Step 1: Enforce Environment Isolation Guard
  validateFirestoreDatabaseEnvironment(appEnv, databaseId);
  console.log(`✓ Environment guard passed: ${appEnv} successfully paired with database "${databaseId}".`);

  // Step 2: Fetch source credentials
  let credentials = await collectCredentialsFromSupabase();
  let sourceName = 'Supabase evaluation_credential_registry';

  if (!credentials) {
    credentials = await generateCanonicalSeedCredentials();
    sourceName = 'Canonical Evaluation Registry Seed';
  }

  console.log(`✓ Discovered ${credentials.length} credentials from source [${sourceName}].`);
  console.log(`----------------------------------------------------------------`);
  console.log(`Identifier          Kind                    State         Active`);
  console.log(`----------------------------------------------------------------`);

  for (const c of credentials) {
    const ident = c.accessIdentifier.padEnd(19);
    const kind = c.credentialKind.padEnd(23);
    const state = (c.stateCode || '-').padEnd(13);
    const active = c.isActive ? 'ACTIVE' : 'INACTIVE';
    console.log(`${ident} ${kind} ${state} ${active}`);
  }
  console.log(`----------------------------------------------------------------`);
  console.log(`Note: Sensitive password hashes and salts are omitted from logs.`);

  if (!isExecute) {
    console.log(`\n[DRY RUN COMPLETE] No records written to Firestore.`);
    console.log(`To commit these records to Firestore, re-run with:`);
    console.log(`  bun scripts/migrate-credentials-to-firestore.ts --execute\n`);
    return { count: credentials.length, executed: false };
  }

  // Step 3: Write records to Firestore
  console.log(`\nWriting ${credentials.length} records to Firestore collection "${EVALUATION_CREDENTIALS_COLLECTION}"...`);
  const db = await getFirestoreDb();
  let migrated = 0;

  for (const cred of credentials) {
    await saveCredentialToFirestore(cred, db);
    migrated++;
    console.log(`  ✓ Migrated: ${cred.accessIdentifier}`);
  }

  console.log(`\n================================================================`);
  console.log(`MIGRATION COMPLETED SUCCESSFULLY`);
  console.log(`Total Records: ${migrated} written to database "${databaseId}".`);
  console.log(`================================================================\n`);

  return { count: migrated, executed: true };
}

if ((import.meta as any).main || process.argv[1]?.endsWith('migrate-credentials-to-firestore.ts')) {
  runMigration().catch((err) => {
    console.error(`FATAL: Migration failed:`, err.message);
    process.exit(1);
  });
}
