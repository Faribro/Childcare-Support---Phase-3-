#!/usr/bin/env tsx
/**
 * scripts/admin/create-production-invitation.ts
 *
 * Secure Administrative Utility for Creating Scoped Production Pilot Invitations.
 *
 * Directives:
 * 1. Writes directly to Firestore database `(default)` in `cs-p3-production`.
 * 2. Scoped to Maharashtra / Pune.
 * 3. Saves plaintext code to gitignored `.secrets/production_pilot_invitation.txt` with 0600 permissions.
 * 4. NEVER logs the plaintext invitation code to stdout/stderr.
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createInvitationVerifierPair, generatePlaintextInvitationCode } from '../../src/lib/server/invitationCrypto';

const PROJECT_ID = 'cs-p3-production';
const DATABASE_ID = '(default)';
const COLLECTION = 'state_team_invitations';

function getGcloudAccessToken(): string {
  try {
    const stdout = execSync('gcloud auth print-access-token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return stdout.trim();
  } catch (err: any) {
    throw new Error('Failed to retrieve access token via gcloud CLI.');
  }
}

async function fetchFirestore(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getGcloudAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents${endpoint}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore REST call failed [${res.status}]: ${text}`);
  }
  return await res.json();
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: v.toString() };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else if (v === null) fields[k] = { nullValue: null };
  }
  return fields;
}

async function main() {
  const args = process.argv.slice(2);
  let state = 'Maharashtra';
  let maxUses = 10;
  let outFilePath = '.secrets/production_pilot_invitation.txt';

  for (const arg of args) {
    if (arg.startsWith('--state=')) state = arg.split('=')[1].trim();
    else if (arg.startsWith('--maxUses=')) maxUses = parseInt(arg.split('=')[1].trim(), 10);
    else if (arg.startsWith('--out=')) outFilePath = arg.split('=')[1].trim();
  }

  const plainCode = generatePlaintextInvitationCode(state);
  const { salt, verifier } = createInvitationVerifierPair(plainCode);

  const docId = `inv_prod_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = Date.now();
  const expiresAt = now + 90 * 24 * 60 * 60 * 1000; // 90 days validity

  const invitationData = {
    id: docId,
    stateTeamId: `coord-mh-pune-${Date.now()}`,
    state: state.toUpperCase().trim(),
    codeSalt: salt,
    codeVerifier: verifier,
    redemptionCount: 0,
    maxRedemptions: maxUses,
    status: 'ACTIVE',
    expiresAt,
    createdAt: now,
    expiresAtDate: new Date(expiresAt),
  };

  await fetchFirestore(`/${COLLECTION}?documentId=${docId}`, {
    method: 'POST',
    body: JSON.stringify({
      fields: toFirestoreFields(invitationData),
    }),
  });

  const absPath = path.resolve(process.cwd(), outFilePath);
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, `${plainCode.trim()}\n`, { mode: 0o600 });

  console.log('================================================================');
  console.log('PRODUCTION PILOT INVITATION CREATED');
  console.log('================================================================');
  console.log(`✓ Document ID:     ${docId}`);
  console.log(`✓ Target Database: ${DATABASE_ID} (Production)`);
  console.log(`✓ State Scope:     ${state.toUpperCase()}`);
  console.log(`✓ Max Redemptions: ${maxUses}`);
  console.log(`✓ Stored In File:  ${absPath} (0600 permissions)`);
  console.log('✓ Security:        Zero plaintext codes logged to console/logs.\n');
}

main().catch((err) => {
  console.error('[ERROR] Failed to create production invitation:', err.message);
  process.exit(1);
});
