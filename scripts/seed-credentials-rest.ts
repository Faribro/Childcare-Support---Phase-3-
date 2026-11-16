#!/usr/bin/env bun
/**
 * scripts/seed-credentials-rest.ts
 *
 * Seeds evaluation credentials and leadership identities into Cloud Firestore
 * using the Google Cloud Firestore REST API v1 and gcloud authentication.
 *
 * This avoids native gRPC / ADC configuration issues on local developer machines
 * while preserving strict zero-disk plaintext persistence for generated passwords.
 */

import crypto from 'crypto';
import { execSync } from 'child_process';
import { hashPassword } from '../src/lib/server/sessionService';
import { CANONICAL_EVALUATION_STATES } from '../src/lib/server/credentialRegistry';

interface AccountDef {
  identifier: string;
  role: 'STATE_REVIEWER' | 'LEADERSHIP' | 'ADMIN';
  state: string;
  displayName: string;
}

function getGcloudAccessToken(): string {
  try {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();
    if (!token) throw new Error('Empty token returned from gcloud');
    return token;
  } catch (err: any) {
    throw new Error(`Failed to obtain gcloud access token: ${err.message}`);
  }
}

function generatePassword(): string {
  return crypto.randomBytes(12).toString('base64url');
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
      'Authorization': `Bearer ${token}`,
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
  console.log(' Childcare Support Phase 3 — Firestore REST Credentials Seeder');
  console.log('================================================================');

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production';
  const databaseId = process.env.FIRESTORE_DATABASE_ID || 'staging';

  if (databaseId === '(default)' || process.env.APP_ENV === 'production') {
    console.error('[SEED_REST:REFUSAL] Static password seeding is permanently disabled. Cannot target production.');
    process.exit(1);
  }

  console.log(`Target Project  : ${projectId}`);
  console.log(`Database ID     : ${databaseId}`);
  console.log('Obtaining gcloud auth access token...');

  const token = getGcloudAccessToken();
  console.log('gcloud access token acquired successfully.');
  console.log('----------------------------------------------------------------');

  const accounts: AccountDef[] = CANONICAL_EVALUATION_STATES.map((s) => ({
    identifier: s.accessIdentifier,
    role: 'STATE_REVIEWER',
    state: s.name,
    displayName: `${s.name} State Evaluation`,
  }));

  accounts.push({
    identifier: 'LEADERSHIP-ALL',
    role: 'LEADERSHIP',
    state: '*',
    displayName: 'National Programme Leadership (All States)',
  });

  accounts.push({
    identifier: 'ADMIN-SYSTEM',
    role: 'ADMIN',
    state: '*',
    displayName: 'System Administrator',
  });

  const generatedCredentials: Array<{
    identifier: string;
    role: string;
    state: string;
    plainPassword: string;
  }> = [];

  const nowIso = new Date().toISOString();

  console.log(`Generating cryptographically secure passwords and argon2id hashes for ${accounts.length} accounts...`);

  for (const acc of accounts) {
    const plainPwd = generatePassword();
    const hash = await hashPassword(plainPwd);
    const rawId = acc.identifier.trim().toUpperCase();

    let credKind = 'STATE_EVALUATION';
    if (acc.role === 'LEADERSHIP') credKind = 'LEADERSHIP_EVALUATION';
    if (acc.role === 'ADMIN') credKind = 'ADMIN';

    const fields = {
      id: rawId,
      accessIdentifier: rawId,
      displayName: acc.displayName,
      credentialKind: credKind,
      stateCode: acc.state !== '*' ? acc.state : null,
      programmeScope: ['alliance-childcare-phase3'],
      passwordHash: hash,
      credentialVersion: 1,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await writeFirestoreDoc(token, projectId, databaseId, 'evaluation_credentials', rawId, fields);

    generatedCredentials.push({
      identifier: rawId,
      role: acc.role,
      state: acc.state,
      plainPassword: plainPwd,
    });
    console.log(`  + [COMMITTED] ${rawId.padEnd(16)} (${acc.displayName})`);
  }

  // Also seed initial leadership identities into leader_identities
  console.log('----------------------------------------------------------------');
  console.log('Seeding authorized leadership identities (leader_identities)...');
  const leaders = [
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
    {
      id: 'lead-farid-sayyed',
      email: 'faridsayyed1010@gmail.com',
      name: 'Farid Sayyed',
      title: 'Technical Lead & Lead Architect',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isActive: true,
      authVersion: 1,
    },
  ];

  for (const l of leaders) {
    const lFields = {
      id: l.id,
      email: l.email,
      name: l.name,
      title: l.title,
      role: l.role,
      allowedStates: l.allowedStates,
      allowedDistricts: l.allowedDistricts,
      isActive: l.isActive,
      authVersion: l.authVersion,
    };
    await writeFirestoreDoc(token, projectId, databaseId, 'leader_identities', l.id, lFields);
    console.log(`  + [COMMITTED] Leader: ${l.id.padEnd(20)} | Email: ${l.email}`);
  }

  console.log('================================================================');
  console.log(' CRITICAL ONE-TIME CREDENTIALS ROSTER');
  console.log(' ATTENTION: These passwords are shown ONCE and NEVER stored in plaintext.');
  console.log('================================================================');
  console.log('IDENTIFIER'.padEnd(18) + 'ROLE'.padEnd(16) + 'STATE'.padEnd(18) + 'ONE-TIME PASSWORD');
  console.log('----------------------------------------------------------------');
  for (const r of generatedCredentials) {
    console.log(
      `${r.identifier.padEnd(18)}${r.role.padEnd(16)}${r.state.padEnd(18)}${r.plainPassword}`
    );
  }
  console.log('================================================================');
  console.log(`[SEED:SUCCESS] All credentials and leader identities successfully committed to database "${databaseId}".`);
}

main().catch((err) => {
  console.error('[SEED:FATAL]', err);
  process.exit(1);
});
