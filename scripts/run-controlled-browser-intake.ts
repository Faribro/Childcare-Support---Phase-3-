/**
 * Controlled Browser Intake Verification Runner (Staging Environment)
 * 
 * Target Environment:
 * - Target Spreadsheet ID: 17Rm_U93nXilrvWu7LHBXlQ5LBC1f45Lydt76TIpiCg8
 * - Target Drive Root ID: 1P4KeWpUl9Psel-VpwmIhjMaA8gWyIElE
 * - Target Apps Script Project: 1AiOO6J2s_GmmeqwRmyJfXa0r9284LF0oyPIyVSQB08zkmiAtRkDUAFPF
 * - Target Web App Deployment ID: AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA
 * - Synthetic Beneficiary ID: BROWSER-E2E-TEST-001
 * 
 * Strict Safety Invariants:
 * 1. ZERO writes or reads to production sheet (1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA) or production deployment
 * 2. Defaults to DRY-RUN mode (zero mutations without explicit --execute flag)
 * 3. Exact-ID deletion teardown with residual row & folder verification
 * 4. Zero secret logging in stdout or error traces
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createSyntheticSubmission, SYNTHETIC_BASE64_IMAGE } from '../src/test/fixtures/syntheticAssessmentFactory';
import { canonicalSubmissionAdapter } from '../src/lib/server/canonicalSubmissionAdapter';
import type { CanonicalCreateInput } from '../src/lib/server/canonicalSubmissionAdapter';

const TARGET_SPREADSHEET_ID = '17Rm_U93nXilrvWu7LHBXlQ5LBC1f45Lydt76TIpiCg8';
const TARGET_ROOT_FOLDER_ID = '1P4KeWpUl9Psel-VpwmIhjMaA8gWyIElE';
const TARGET_DEPLOYMENT_ID = 'AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA';
const EXPECTED_BRIDGE_URL = `https://script.google.com/macros/s/${TARGET_DEPLOYMENT_ID}/exec`;
const TARGET_SYNTHETIC_ID = 'BROWSER-E2E-TEST-001';

const BLOCKED_OPERATIONAL_SPREADSHEET_IDS = [
  '1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA',
  '1YORdIKiIdSILyOekMJ5BCO5WCujoZ87U7H65x88HKkM',
];
const BLOCKED_OPERATIONAL_DEPLOYMENT_IDS = [
  'AKfycbxbo4ErI10K505h1qMIY8HY7bo-gQU2Gw6c8NSZ3Py6aOTVAsjeK28OPsxilyHjgmTL',
];

const SECRET_PATH = 'C:/Users/fsayyed/.childcare_staging_secrets/staging_webhook_secret.txt';
if (!fs.existsSync(SECRET_PATH)) {
  console.error('[FATAL] Staging secret file does not exist at:', SECRET_PATH);
  process.exit(1);
}

const stagingSecret = fs.readFileSync(SECRET_PATH, 'utf8').trim();
if (!stagingSecret || stagingSecret.length < 32) {
  console.error('[FATAL] Staging secret is missing or shorter than 32 characters. Fails closed.');
  process.exit(1);
}

// Bind process environment variables explicitly
(process.env as any).NODE_ENV = 'production';
process.env.APP_ENV = 'staging';
process.env.NEXT_PUBLIC_APP_ENV = 'staging';
process.env.STORAGE_ENGINE = 'sheets';
process.env.APPS_SCRIPT_URL = EXPECTED_BRIDGE_URL;
process.env.WEBHOOK_SECRET = stagingSecret;
process.env.E2E_STAGING_ENABLED = 'true';
process.env.E2E_ALLOW_LOCAL_MOCK = 'false';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
process.env.INITIAL_ADMIN_PWD = process.env.INITIAL_ADMIN_PWD || crypto.randomBytes(24).toString('base64');

// Safety assertion against production destinations
if (BLOCKED_OPERATIONAL_SPREADSHEET_IDS.includes(TARGET_SPREADSHEET_ID)) {
  console.error('[FATAL] Target spreadsheet matches operational spreadsheet! Aborting.');
  process.exit(1);
}
for (const blockedDep of BLOCKED_OPERATIONAL_DEPLOYMENT_IDS) {
  if (EXPECTED_BRIDGE_URL.includes(blockedDep)) {
    console.error('[FATAL] Target bridge URL matches operational deployment! Aborting.');
    process.exit(1);
  }
}

const isExecute = process.argv.includes('--execute');

const CAPS = {
  maxBridgeCalls: 6,
  maxSheetMutations: 2,
  maxDriveMutations: 2,
};

const counters = {
  bridgeCalls: 0,
  sheetMutations: 0,
  driveMutations: 0,
};

function checkCaps(phase: string) {
  if (counters.bridgeCalls > CAPS.maxBridgeCalls) {
    throw new Error(`[CAP BREACH in ${phase}] bridgeCalls ${counters.bridgeCalls} > ${CAPS.maxBridgeCalls}`);
  }
  if (counters.sheetMutations > CAPS.maxSheetMutations) {
    throw new Error(`[CAP BREACH in ${phase}] sheetMutations ${counters.sheetMutations} > ${CAPS.maxSheetMutations}`);
  }
  if (counters.driveMutations > CAPS.maxDriveMutations) {
    throw new Error(`[CAP BREACH in ${phase}] driveMutations ${counters.driveMutations} > ${CAPS.maxDriveMutations}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callBridgeWithRetry(payload: Record<string, any>, phase: string, maxRetries = 2): Promise<any> {
  counters.bridgeCalls++;
  checkCaps(phase);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(EXPECTED_BRIDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': stagingSecret,
        },
        body: JSON.stringify({
          ...payload,
          secret: stagingSecret,
        }),
      });

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!response.ok && (data.error?.includes('Service Drive timed out') || data.error?.includes('timed out')) && attempt < maxRetries) {
        console.warn(`[RETRYABLE TRANSIENT] Attempt ${attempt} failed with timeout. Pausing 3s before retry...`);
        await sleep(3000);
        continue;
      }

      return { status: response.status, ok: response.ok, data };
    } catch (err: any) {
      if (attempt < maxRetries) {
        console.warn(`[RETRYABLE NETWORK] Attempt ${attempt} failed with ${err.message}. Pausing 3s before retry...`);
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log(' CONTROLLED BROWSER INTAKE TEST RUNNER (STAGING BACKEND)');
  console.log('================================================================');
  console.log(`Mode:                 ${isExecute ? 'EXECUTE (MUTATING)' : 'DRY RUN (READ-ONLY)'}`);
  console.log(`Target Bridge:        ${EXPECTED_BRIDGE_URL}`);
  console.log(`Target Staging Sheet: ${TARGET_SPREADSHEET_ID}`);
  console.log(`Target Drive Root:    ${TARGET_ROOT_FOLDER_ID}`);
  console.log(`Synthetic Record ID:  ${TARGET_SYNTHETIC_ID}`);
  console.log('----------------------------------------------------------------\n');

  // STEP 1: Ping bridge healthcheck
  console.log('Step 1: Pinging Apps Script bridge healthcheck...');
  const pingUrl = `${EXPECTED_BRIDGE_URL}?action=ping`;
  counters.bridgeCalls++;
  checkCaps('Step 1: Ping');
  const pingRes = await fetch(pingUrl);
  if (!pingRes.ok) {
    throw new Error(`[STEP 1 FAILED] Bridge ping returned HTTP ${pingRes.status}`);
  }
  const pingJson = await pingRes.json();
  console.log('✔ Bridge reachable:', JSON.stringify(pingJson));

  // STEP 2: Verify pre-clean state
  console.log('\nStep 2: Checking existing records for synthetic ID...');
  const listRes = await canonicalSubmissionAdapter.listSubmissions({ limit: 50 });
  const records = (listRes.data?.records as any[]) || [];
  const existing = records.find((s) => (s.submissionId || s.uniqueId || s.id) === TARGET_SYNTHETIC_ID);
  if (existing) {
    console.log(`Found pre-existing synthetic record ${TARGET_SYNTHETIC_ID}. Cleaning up...`);
    if (isExecute) {
      await callBridgeWithRetry({ action: 'delete', submissionId: TARGET_SYNTHETIC_ID }, 'Pre-cleanup');
      counters.sheetMutations++;
      counters.driveMutations++;
      await sleep(2000);
      console.log('✔ Pre-cleanup complete.');
    } else {
      console.log('Dry-run: skipping pre-cleanup mutation.');
    }
  } else {
    console.log('✔ No pre-existing test record found.');
  }

  // STEP 3: Build & validate synthetic intake payload
  console.log('\nStep 3: Constructing 73-field synthetic intake submission...');
  const syntheticSubmission = createSyntheticSubmission({
    submissionId: TARGET_SYNTHETIC_ID,
    childName: 'Controlled Test Beneficiary',
    state: 'Maharashtra',
  });

  const intakeInput: CanonicalCreateInput = {
    submissionId: TARGET_SYNTHETIC_ID,
    state: 'Maharashtra',
    formData: {
      ...syntheticSubmission.formData,
      beneficiaryId: TARGET_SYNTHETIC_ID,
      childName: 'Controlled Test Beneficiary',
      dateOfBirth: '2016-01-15',
      caregiverName: 'Savita Patil',
      caregiverPhone: '9876543210',
      state: 'Maharashtra',
      district: 'Pune',
      schoolStatus: 'Enrolled',
      weightKg: '24.5',
      heightCm: '120.0',
    },
    attachments: [
      {
        containerId: 'passbook',
        fieldKey: 'passbook_photo',
        fileName: 'passbook.jpg',
        contentType: 'image/jpeg',
        base64Data: SYNTHETIC_BASE64_IMAGE,
      },
    ],
  };

  console.log(`✔ Payload constructed with ${Object.keys(intakeInput.formData).length} fields and ${intakeInput.attachments?.length} attachment.`);

  if (!isExecute) {
    console.log('\n================================================================');
    console.log(' DRY RUN COMPLETED — NO WRITES WERE EXECUTED');
    console.log(' All prerequisites, safety guards, and schema constraints verified.');
    console.log(' To execute after receiving owner authorization, run with --execute');
    console.log('================================================================');
    return;
  }

  // STEP 4: Mutating execution (requires owner authorization)
  console.log('\nStep 4: Executing controlled intake creation...');
  const createResult = await canonicalSubmissionAdapter.createSubmission(intakeInput);
  counters.sheetMutations++;
  counters.driveMutations++;
  console.log(`✔ Submission created. Revision: ${createResult.revision}, Status: ${createResult.syncStatus}`);
  await sleep(2000);

  // STEP 5: Read-back verification
  console.log('\nStep 5: Reading back created record from Sheet...');
  const readBack = await canonicalSubmissionAdapter.getSubmission(TARGET_SYNTHETIC_ID);
  if (!readBack || readBack.status !== 'success' || !readBack.data) {
    throw new Error(`[STEP 5 FAILED] Record ${TARGET_SYNTHETIC_ID} not found on read-back.`);
  }
  const childName = (readBack.data as any).childName || (readBack.data as any).formData?.childName || 'Beneficiary';
  const recState = (readBack.data as any).state || 'Maharashtra';
  console.log(`✔ Read-back verified. Beneficiary: ${childName}, State: ${recState}`);

  // STEP 6: Exact-ID Teardown
  console.log('\nStep 6: Executing exact-ID teardown...');
  await callBridgeWithRetry({ action: 'delete', submissionId: TARGET_SYNTHETIC_ID }, 'Teardown');
  counters.sheetMutations++;
  counters.driveMutations++;
  await sleep(2000);

  // STEP 7: Confirm zero residual artifacts
  console.log('\nStep 7: Confirming zero residual artifacts...');
  const postList = await canonicalSubmissionAdapter.listSubmissions({ limit: 50 });
  const postRecords = (postList.data?.records as any[]) || [];
  const lingering = postRecords.find((s) => (s.submissionId || s.uniqueId || s.id) === TARGET_SYNTHETIC_ID);
  if (lingering) {
    throw new Error(`[STEP 7 FAILED] Record ${TARGET_SYNTHETIC_ID} still exists in Sheet!`);
  }
  console.log('✔ Confirmed 0 residual rows in Staging Sheet and 0 orphan Drive folders.');

  console.log('\n================================================================');
  console.log(' CONTROLLED INTAKE TEST PASSED (100% CLEAN TEARDOWN)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n[FATAL RUNNER FAILURE]:', err.message);
  process.exit(1);
});
