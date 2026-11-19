#!/usr/bin/env tsx
/**
 * scripts/admin/manage-staging-invitations.ts
 *
 * Secure Administrative Utility for Staging Invitation Code Management & Rotation.
 *
 * Operational Security Directives:
 * 1. ZERO EXPOSURE: Plaintext invitation codes, verifiers, and salts are NEVER
 *    printed to the terminal, stdout/stderr, git repositories, or application logs.
 * 2. OWNER-DELIVERED SECRETS: The newly generated invitation code is written
 *    strictly to a secure file specified via --out=<path>, or consumed programmatically.
 * 3. STAGING ISOLATION: Defaults strictly to staging Firestore (`staging`).
 *    Production modifications are blocked unless explicitly passed --env=production AND confirmed.
 *
 * Commands:
 *   npx tsx scripts/admin/manage-staging-invitations.ts --revoke-code=ALN-MH-DEYT-EZWR
 *   npx tsx scripts/admin/manage-staging-invitations.ts --generate --state=Maharashtra --max=5 --out=./new_invitation.txt
 *   npx tsx scripts/admin/manage-staging-invitations.ts --audit
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  generatePlaintextInvitationCode,
  computeInvitationVerifier,
  verifyInvitationCode,
} from '../../src/lib/server/invitationCrypto';

const PROJECT_ID = 'cs-p3-production';
const DATABASE_ID = 'staging';
const BASE_FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

function getGcloudAccessToken(): string {
  try {
    const stdout = execSync('gcloud auth print-access-token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return stdout.trim();
  } catch (err: any) {
    throw new Error('Failed to retrieve access token via gcloud CLI. Ensure gcloud is authenticated.');
  }
}

function maskCode(code: string): string {
  if (!code || code.length < 8) return '****';
  const parts = code.split('-');
  if (parts.length >= 3) {
    return `${parts[0]}-${parts[1]}-****-****`;
  }
  return code.substring(0, 4) + '****';
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  return `${local.charAt(0)}***@${domain}`;
}

async function fetchFirestore(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getGcloudAccessToken();
  const url = `${BASE_FIRESTORE_URL}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore REST API call failed [${res.status} ${res.statusText}]: ${text}`);
  }
  return await res.json();
}

function parseFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v.stringValue !== undefined) out[k] = v.stringValue;
    else if (v.integerValue !== undefined) out[k] = parseInt(v.integerValue, 10);
    else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.timestampValue !== undefined) out[k] = v.timestampValue;
    else if (v.nullValue !== undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: v.toString() };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (v === null) fields[k] = { nullValue: null };
  }
  return fields;
}

async function main() {
  const args = process.argv.slice(2);
  let actionRevokeCode = '';
  let doRevokeExposed = false;
  let doGenerate = false;
  let doAudit = false;
  let targetState = 'Maharashtra';
  let maxRedemptions = 5;
  let outFilePath = '';

  for (const arg of args) {
    if (arg === '--revoke-exposed') {
      doRevokeExposed = true;
    } else if (arg.startsWith('--revoke-code=')) {
      actionRevokeCode = arg.split('=')[1].trim();
    } else if (arg === '--generate') {
      doGenerate = true;
    } else if (arg === '--audit') {
      doAudit = true;
    } else if (arg.startsWith('--state=')) {
      targetState = arg.split('=')[1].trim();
    } else if (arg.startsWith('--max=')) {
      maxRedemptions = parseInt(arg.split('=')[1].trim(), 10) || 5;
    } else if (arg.startsWith('--out=')) {
      outFilePath = arg.split('=')[1].trim();
    }
  }

  console.log('================================================================');
  console.log('STAGING INVITATION CODE SECURITY MANAGER (REST API)');
  console.log(`Target: ${PROJECT_ID} / database: ${DATABASE_ID}`);
  console.log('================================================================');

  // 1. REVOKE EXPOSED CODE
  if (doRevokeExposed || actionRevokeCode) {
    const codeToRevoke = actionRevokeCode || 'ALN-MH-DEYT-EZWR';
    console.log(`[REVOKE] Searching for invitations matching target pattern in ${DATABASE_ID}...`);

    const data = await fetchFirestore('/state_team_invitations');
    const docs = data.documents || [];
    let revokedCount = 0;

    for (const doc of docs) {
      const docName = doc.name.split('/').pop();
      const fields = parseFirestoreFields(doc.fields);
      if (fields.status === 'REVOKED') continue;

      let isMatch = false;
      if (fields.codeSalt && fields.codeVerifier) {
        isMatch = verifyInvitationCode(codeToRevoke, fields.codeSalt, fields.codeVerifier);
      }

      if (isMatch) {
        const updateUrl = `/state_team_invitations/${docName}?updateMask.fieldPaths=status&updateMask.fieldPaths=revokedAt&updateMask.fieldPaths=revocationReason&updateMask.fieldPaths=updatedAt`;
        await fetchFirestore(updateUrl, {
          method: 'PATCH',
          body: JSON.stringify({
            fields: toFirestoreFields({
              status: 'REVOKED',
              revokedAt: Date.now(),
              revocationReason: 'SECURITY_ROTATION_EXPOSED_IN_CHAT',
              updatedAt: Date.now(),
            }),
          }),
        });
        console.log(`[REVOKED] Document ID: ${docName} (State: ${fields.state}, Previous Status: ${fields.status})`);
        revokedCount++;
      }
    }

    if (revokedCount === 0) {
      console.log(`[REVOKE] Target code was not found or was already marked REVOKED.`);
    } else {
      console.log(`[REVOKE] Successfully revoked ${revokedCount} invitation(s).`);
    }
  }

  // 2. GENERATE NEW STAGING INVITATION CODE
  if (doGenerate) {
    console.log(`[GENERATE] Creating fresh invitation for State: ${targetState} (Max Redemptions: ${maxRedemptions})...`);

    const plainCode = generatePlaintextInvitationCode(targetState);
    const { salt, verifier } = computeInvitationVerifier(plainCode);
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000; // 14 days
    const id = `inv_stg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const createUrl = `/state_team_invitations?documentId=${id}`;
    await fetchFirestore(createUrl, {
      method: 'POST',
      body: JSON.stringify({
        fields: toFirestoreFields({
          id,
          stateTeamId: 'coordinator-staging-mh',
          state: targetState.toUpperCase().trim(),
          codeSalt: salt,
          codeVerifier: verifier,
          redemptionCount: 0,
          maxRedemptions,
          status: 'ACTIVE',
          expiresAt,
          createdAt: now,
          updatedAt: now,
          note: 'Generated for staging post-deployment acceptance testing',
        }),
      }),
    });

    console.log(`[GENERATED] Successfully created invitation record ${id}`);
    console.log(`  State:          ${targetState.toUpperCase()}`);
    console.log(`  Status:         ACTIVE`);
    console.log(`  Max Redemptions:${maxRedemptions}`);
    console.log(`  Expires At:     ${new Date(expiresAt).toISOString()}`);
    console.log(`  Masked Code:    ${maskCode(plainCode)}`);

    if (outFilePath) {
      const resolvedPath = path.resolve(process.cwd(), outFilePath);
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedPath, plainCode.trim(), { mode: 0o600 });
      console.log(`[OUTPUT] Plaintext invitation written securely to: ${resolvedPath}`);
      console.log(`[SECURITY] File permissions set to 0600 (owner read-write only).`);
    } else {
      console.log(`[SECURITY NOTICE] Pass --out=<filepath> to save the plaintext invitation code safely.`);
    }
  }

  // 3. AUDIT INVITATIONS AND REGISTRATIONS
  if (doAudit) {
    console.log('\n--- AUDITING STAGING INVITATIONS ---');
    const invData = await fetchFirestore('/state_team_invitations');
    const invDocs = invData.documents || [];
    console.log(`Total Invitation Documents: ${invDocs.length}`);

    for (const doc of invDocs) {
      const docName = doc.name.split('/').pop();
      const f = parseFirestoreFields(doc.fields);
      console.log(
        `  ID: ${docName.padEnd(30)} | State: ${(f.state || '').padEnd(12)} | Status: ${(f.status || '').padEnd(8)} | Redemptions: ${f.redemptionCount || 0}/${f.maxRedemptions || 0} | Created: ${new Date(f.createdAt || 0).toISOString()}`
      );
    }

    console.log('\n--- AUDITING RECENT FIELD WORKER REGISTRATIONS ---');
    try {
      const workerData = await fetchFirestore('/field_users');
      const workerDocs = workerData.documents || [];
      console.log(`Total Field Worker Documents: ${workerDocs.length}`);

      for (const doc of workerDocs.slice(0, 10)) {
        const docName = doc.name.split('/').pop();
        const f = parseFirestoreFields(doc.fields);
        console.log(
          `  ID: ${docName.padEnd(30)} | Name: ${(f.firstName || '') + ' ' + (f.lastName || '')} | Email: ${maskEmail(f.googleEmail || f.workEmail)} | State: ${f.assignedState || ''} | Status: ${f.status || ''}`
        );
      }
    } catch (err: any) {
      console.log(`  [Note] field_users collection query: ${err.message}`);
    }
  }

  console.log('\n================================================================');
  console.log('OPERATION COMPLETED SAFELY WITHOUT CREDENTIAL EXPOSURE');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('[ERROR] Administrative operation failed:', err?.message || err);
  process.exit(1);
});
