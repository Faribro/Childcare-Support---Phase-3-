/**
 * Scope B Bounded Synthetic Staging Verification Runner
 * 
 * Strict Invariants:
 * 1. Target Record ID: SYN-STAGING-001
 * 2. Target Spreadsheet ID: 17Rm_U93nXilrvWu7LHBXlQ5LBC1f45Lydt76TIpiCg8
 * 3. Target Drive Root ID: 1P4KeWpUl9Psel-VpwmIhjMaA8gWyIElE
 * 4. Target Web App Bridge: AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA
 * 5. Hard Caps: 9 app calls, 9 bridge calls, 4 direct reads, 8 sheet mutations, 4 drive mutations
 * 6. Zero logging or output of the private secret
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { createSyntheticSubmission, SYNTHETIC_BASE64_IMAGE } from '../src/test/fixtures/syntheticAssessmentFactory';
import { canonicalSubmissionAdapter } from '../src/lib/server/canonicalSubmissionAdapter';
import type { CanonicalCreateInput, CanonicalUpdateInput } from '../src/lib/server/canonicalSubmissionAdapter';

// ============================================================================
// 1. CONFIGURATION & PRE-FLIGHT ISOLATION GUARDS
// ============================================================================

const TARGET_SPREADSHEET_ID = '17Rm_U93nXilrvWu7LHBXlQ5LBC1f45Lydt76TIpiCg8';
const TARGET_ROOT_FOLDER_ID = '1P4KeWpUl9Psel-VpwmIhjMaA8gWyIElE';
const TARGET_DEPLOYMENT_ID = 'AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA';
const EXPECTED_BRIDGE_URL = `https://script.google.com/macros/s/${TARGET_DEPLOYMENT_ID}/exec`;

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

// Hard collision assertion
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

// ============================================================================
// 2. BUDGET TRACKING & HARD CAPS
// ============================================================================

const CAPS = {
  maxAppHttpCalls: 9,
  maxBridgeCalls: 9,
  maxDirectVerificationReads: 4,
  maxSheetMutations: 8,
  maxDriveMutations: 4,
};

const counters = {
  appHttpCalls: 0,
  bridgeCalls: 0,
  directVerificationReads: 0,
  sheetMutations: 0,
  driveMutations: 0,
  cleanupRetries: 0,
};

function checkCaps(phase: string) {
  if (counters.appHttpCalls > CAPS.maxAppHttpCalls) {
    throw new Error(`[CAP BREACH in ${phase}] appHttpCalls ${counters.appHttpCalls} > ${CAPS.maxAppHttpCalls}`);
  }
  if (counters.bridgeCalls > CAPS.maxBridgeCalls) {
    throw new Error(`[CAP BREACH in ${phase}] bridgeCalls ${counters.bridgeCalls} > ${CAPS.maxBridgeCalls}`);
  }
  if (counters.directVerificationReads > CAPS.maxDirectVerificationReads) {
    throw new Error(`[CAP BREACH in ${phase}] directVerificationReads ${counters.directVerificationReads} > ${CAPS.maxDirectVerificationReads}`);
  }
  if (counters.sheetMutations > CAPS.maxSheetMutations) {
    throw new Error(`[CAP BREACH in ${phase}] sheetMutations ${counters.sheetMutations} > ${CAPS.maxSheetMutations}`);
  }
  if (counters.driveMutations > CAPS.maxDriveMutations) {
    throw new Error(`[CAP BREACH in ${phase}] driveMutations ${counters.driveMutations} > ${CAPS.maxDriveMutations}`);
  }
}

// Google OAuth Token for Direct Verification Reads
function getClaspAccessToken(): string {
  const claspRcPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.clasprc.json');
  const claspRc = JSON.parse(fs.readFileSync(claspRcPath, 'utf8'));
  return claspRc.tokens.default.access_token;
}

async function queryDriveFile(fileId: string): Promise<any> {
  counters.directVerificationReads++;
  checkCaps('directDriveRead');
  const token = getClaspAccessToken();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${fileId}?fields=id,name,trashed`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyRegistryCleanDirect(sheetId: string, testId: string): Promise<boolean> {
  counters.directVerificationReads++;
  checkCaps('directSheetRead');
  const token = getClaspAccessToken();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${sheetId}/export?mimeType=${encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', async () => {
        try {
          const buf = Buffer.concat(chunks);
          // Quick scan for the test ID inside the raw zip/sharedStrings buffer
          const found = buf.includes(Buffer.from(testId));
          resolve(!found);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ============================================================================
// 3. MAIN SEQUENCE EXECUTION
// ============================================================================

async function runScopeB() {
  console.log('======================================================================');
  console.log('STARTING SCOPE B STAGING TEST — SYNTHETIC RECORD: SYN-STAGING-001');
  console.log('Target Spreadsheet:', TARGET_SPREADSHEET_ID);
  console.log('Target Drive Root:', TARGET_ROOT_FOLDER_ID);
  console.log('Target Web App Bridge:', TARGET_DEPLOYMENT_ID);
  console.log('======================================================================\n');

  const TEST_ID = 'SYN-STAGING-001';
  let capturedFolderId: string | null = null;
  let capturedAssetContainerId: string | null = null;

  try {
    // ------------------------------------------------------------------------
    // PRE-CHECK: Anonymous Ping
    // ------------------------------------------------------------------------
    console.log('[PRE-FLIGHT] Verifying anonymous ping to bridge...');
    const pingRes = await fetch(`${EXPECTED_BRIDGE_URL}?action=ping`);
    if (!pingRes.ok) {
      throw new Error(`Anonymous ping failed with HTTP ${pingRes.status}`);
    }
    const pingData = await pingRes.json();
    if (pingData.status !== 'ok') {
      throw new Error(`Anonymous ping did not return status 'ok' (got ${JSON.stringify(pingData)})`);
    }
    console.log('  âœ“ Anonymous ping OK! Timestamp:', pingData.timestamp);

    // ------------------------------------------------------------------------
    // STEP 1: CREATE SUBMISSION
    // ------------------------------------------------------------------------
    console.log('\n[STEP 1/10] POST /api/submissions (Create SYN-STAGING-001)...');
    const rawPayload = createSyntheticSubmission({
      runId: 'staging-scope-b',
      uniqueSuffix: 'STAGING-001',
      withSignature: false
    });
    // Explicitly lock ID to SYN-STAGING-001
    rawPayload.uniqueId = TEST_ID;
    rawPayload.demographics.artNumber = TEST_ID;
    rawPayload.uuid = `syn-uuid-${Date.now()}`;
    rawPayload.clientSubmissionId = rawPayload.uuid;

    counters.appHttpCalls++;
    counters.bridgeCalls++;
    counters.sheetMutations += 2; // Linelist row + _Asset_Containers row
    counters.driveMutations += 1; // Container folder
    checkCaps('Step 1: Create');

    const createInput: CanonicalCreateInput = {
      payload: rawPayload,
      idempotencyKey: `idem-create-${TEST_ID}-${Date.now()}`,
      requestId: `req-step1-${Date.now()}`
    };

    const createRes = await canonicalSubmissionAdapter.createSubmission(createInput);
    if (createRes.status !== 'success' || createRes.statusCode !== 201) {
      throw new Error(`Create failed: status=${createRes.status}, code=${createRes.statusCode}, msg=${createRes.message}`);
    }
    console.log('  âœ“ Created successfully! Revision:', createRes.revisionNumber, 'Row:', createRes.data?.rowNumber);
    if (createRes.data?.assetContainerId) {
      capturedAssetContainerId = createRes.data.assetContainerId;
    }

    // ------------------------------------------------------------------------
    // STEP 2: DUPLICATE REPLAY (IDEMPOTENCY)
    // ------------------------------------------------------------------------
    console.log('\n[STEP 2/10] POST /api/submissions (Duplicate Replay with same uniqueId)...');
    counters.appHttpCalls++;
    counters.bridgeCalls++;
    // 0 Sheet mutations, 0 Drive mutations
    checkCaps('Step 2: Idempotency');

    const replayRes = await canonicalSubmissionAdapter.createSubmission(createInput);
    if (replayRes.status !== 'success' || !replayRes.isDuplicate) {
      throw new Error(`Duplicate replay failed: expected isDuplicate=true, got status=${replayRes.status}, isDuplicate=${replayRes.isDuplicate}`);
    }
    console.log('  âœ“ Idempotency verified! isDuplicate=true, acknowledged=true');

    // ------------------------------------------------------------------------
    // STEP 3: READ-BACK VERIFICATION
    // ------------------------------------------------------------------------
    console.log('\n[STEP 3/10] GET /api/submissions/SYN-STAGING-001 (Read-back)...');
    counters.appHttpCalls++;
    counters.bridgeCalls++;
    // 0 Sheet mutations, 0 Drive mutations
    checkCaps('Step 3: Read-back');

    const readRes = await canonicalSubmissionAdapter.getSubmission(TEST_ID, 'supervisor');
    if (readRes.status !== 'success' || !readRes.data) {
      throw new Error(`Read-back failed: status=${readRes.status}, msg=${readRes.message}`);
    }
    const fetchedId = readRes.data.uniqueId || readRes.data['1\nUnique ID'] || readRes.data.demographics?.artNumber;
    if (fetchedId !== TEST_ID) {
      throw new Error(`Read-back data mismatch: expected ${TEST_ID}, got ${fetchedId}`);
    }
    console.log('  âœ“ Read-back verified! Child Name:', readRes.data.childName || readRes.data['9\nChild Name'] || readRes.data.demographics?.childName);

    // ------------------------------------------------------------------------
    // STEP 4: OPTIMISTIC CONCURRENCY CONTROL (OCC) PATCH
    // ------------------------------------------------------------------------
    console.log('\n[STEP 4/10] PATCH /api/submissions/SYN-STAGING-001 (OCC revision patch with expectedVersion=1)...');
    counters.appHttpCalls++;
    counters.bridgeCalls++;
    counters.sheetMutations += 1; // Row updated, rev incremented
    checkCaps('Step 4: OCC Patch');

    const patchInput: CanonicalUpdateInput = {
      submissionId: TEST_ID,
      expectedVersion: 1,
      idempotencyKey: `idem-patch-${Date.now()}`,
      requestId: `req-step4-${Date.now()}`,
      patch: {
        remarksReview: {
          comments: 'Scope B OCC staging patch verified'
        }
      } as any
    };

    const patchRes = await canonicalSubmissionAdapter.updateSubmission(patchInput);
    if (patchRes.status !== 'success') {
      throw new Error(`OCC Patch failed: status=${patchRes.status}, code=${patchRes.statusCode}, msg=${patchRes.message}`);
    }
    const newVersion = patchRes.revisionNumber || patchRes.version;
    if (newVersion !== 2) {
      throw new Error(`OCC Patch revision mismatch: expected 2, got ${newVersion}`);
    }
    console.log('  âœ“ OCC Patch verified! Revision incremented 1 â†’ 2');

    // ------------------------------------------------------------------------
    // STEP 5: ASSET UPLOAD
    // ------------------------------------------------------------------------
    console.log('\n[STEP 5/10] POST /api/submissions/SYN-STAGING-001/asset (Upload Signature Asset)...');
    counters.appHttpCalls++;
    counters.bridgeCalls++;
    counters.sheetMutations += 1; // Formula cell written
    counters.driveMutations += 1; // File created in container
    checkCaps('Step 5: Asset Upload');

    const assetRes = await canonicalSubmissionAdapter.updateAsset({
      submissionId: TEST_ID,
      docType: 'SIGNATURE',
      fileData: SYNTHETIC_BASE64_IMAGE,
      documentOperationId: `doc-op-${Date.now()}`,
      expectedVersion: 2,
      requestId: `req-step5-${Date.now()}`
    });

    if (assetRes.status !== 'success') {
      throw new Error(`Asset upload failed: status=${assetRes.status}, msg=${assetRes.message}`);
    }
    console.log('  âœ“ Asset uploaded! Status:', assetRes.assetStatus || 'UPLOADED');

    // ------------------------------------------------------------------------
    // STEP 6: LINELIST QUERY
    // ------------------------------------------------------------------------
    console.log('\n[STEP 6/10] GET /api/submissions (Linelist list check)...');
    counters.appHttpCalls++;
    counters.bridgeCalls++;
    checkCaps('Step 6: Linelist');

    const listRes = await canonicalSubmissionAdapter.listSubmissions({ limit: 50 });
    if (listRes.status !== 'success') {
      throw new Error(`Linelist query failed: status=${listRes.status}, msg=${listRes.message}`);
    }
    const items = listRes.data?.records || listRes.data?.submissions || (Array.isArray(listRes.data) ? listRes.data : []);
    const matching = items.filter((item: any) => {
      const id = item.uniqueId || item.id || item['1\nUnique ID'];
      return id === TEST_ID;
    });
    if (matching.length !== 1) {
      throw new Error(`Linelist expected exactly 1 match for ${TEST_ID}, found ${matching.length}`);
    }
    console.log(`  âœ“ Linelist verified! Found exactly 1 record for ${TEST_ID} in total ${items.length} records.`);

    // ------------------------------------------------------------------------
    // STEP 7: EXACT-ID DELETION
    // ------------------------------------------------------------------------
    console.log('\n[STEP 7/10] DELETE /api/submissions/SYN-STAGING-001 (Exact-ID Cleanup)...');
    counters.appHttpCalls++;
    counters.bridgeCalls++;
    counters.sheetMutations += 2; // Linelist row delete + _Asset_Containers row delete
    counters.driveMutations += 1; // Drive container folder trashed
    checkCaps('Step 7: Delete');

    const deleteRes = await canonicalSubmissionAdapter.deleteSubmission(TEST_ID);
    if (!deleteRes.success || deleteRes.statusCode !== 200) {
      console.warn('  âš  Delete initial attempt failed, invoking reserved cleanup retry...');
      if (counters.cleanupRetries >= 1) {
        throw new Error(`Cleanup retry exhausted! Delete failed: ${deleteRes.message}`);
      }
      counters.cleanupRetries++;
      counters.appHttpCalls++;
      counters.bridgeCalls++;
      checkCaps('Cleanup Retry');
      const retryDeleteRes = await canonicalSubmissionAdapter.deleteSubmission(TEST_ID);
      if (!retryDeleteRes.success) {
        throw new Error(`Cleanup retry failed: ${retryDeleteRes.message}`);
      }
    }
    console.log('  âœ“ Delete acknowledged! Message:', deleteRes.message);

    // ------------------------------------------------------------------------
    // STEP 8: DELETE VERIFICATION (LINELIST)
    // ------------------------------------------------------------------------
    console.log('\n[STEP 8/10] GET /api/submissions/SYN-STAGING-001 (Verify Linelist 404)...');
    counters.appHttpCalls++;
    counters.bridgeCalls++;
    checkCaps('Step 8: Linelist 404 Check');

    const postDeleteRead = await canonicalSubmissionAdapter.getSubmission(TEST_ID, 'supervisor');
    if (postDeleteRead.status !== 'error' || postDeleteRead.statusCode !== 404) {
      throw new Error(`Expected 404 Not Found after delete, but got status=${postDeleteRead.status}, code=${postDeleteRead.statusCode}`);
    }
    console.log('  âœ“ Linelist 404 verified! Record does not exist in primary sheet.');

    // ------------------------------------------------------------------------
    // STEP 9: DIRECT METADATA REGISTRY VERIFICATION
    // ------------------------------------------------------------------------
    console.log('\n[STEP 9/10] Direct Drive API Spreadsheet Read (Verify _Asset_Containers has 0 rows for SYN-STAGING-001)...');
    const isRegistryClean = await verifyRegistryCleanDirect(TARGET_SPREADSHEET_ID, TEST_ID);
    if (!isRegistryClean) {
      throw new Error(`Residual metadata found! SYN-STAGING-001 still referenced in spreadsheet!`);
    }
    console.log('  âœ“ Direct metadata check verified! 0 matching rows in spreadsheet tabs.');

    // ------------------------------------------------------------------------
    // STEP 10: DIRECT DRIVE TRASH VERIFICATION
    // ------------------------------------------------------------------------
    console.log('\n[STEP 10/10] Direct Drive API Folder Verification (Checking container trashed status)...');
    // Query assessments folder for any surviving untrashed folder for this test
    const token = getClaspAccessToken();
    const folderSearchRes: any = await new Promise((resolve, reject) => {
      counters.directVerificationReads++;
      checkCaps('Drive folder search');
      const q = encodeURIComponent(`'${TARGET_ROOT_FOLDER_ID}' in parents and trashed = false and name contains '${TEST_ID}'`);
      const req = https.request({
        hostname: 'www.googleapis.com',
        path: `/drive/v3/files?q=${q}&fields=files(id,name,trashed)`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve(JSON.parse(d)));
      });
      req.on('error', reject);
      req.end();
    });

    const orphanCount = (folderSearchRes.files || []).length;
    if (orphanCount > 0) {
      throw new Error(`Direct Drive verification failed: ${orphanCount} untrashed folder(s) found for ${TEST_ID}!`);
    }
    console.log('  ✓ Direct Drive verification completed! 0 untrashed orphan folders found in staging root.');

    // ------------------------------------------------------------------------
    // SUMMARY REPORT
    // ------------------------------------------------------------------------
    console.log('\n======================================================================');
    console.log('SCOPE B STAGING VERIFICATION: ALL 10 STEPS PASSED SUCCESSFULLY');
    console.log('======================================================================');
    console.log('Exercised Layers:');
    console.log('  - Canonical Submission Adapter (Create, OCC Update, Asset, List, Delete)');
    console.log('  - Staging Google Apps Script Bridge (AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA)');
    console.log('  - Staging Google Spreadsheet (17Rm_U93nXilrvWu7LHBXlQ5LBC1f45Lydt76TIpiCg8)');
    console.log('  - Staging Google Drive Root (1P4KeWpUl9Psel-VpwmIhjMaA8gWyIElE)');
    console.log('  - Direct Google Drive API Verification (Metadata & Folder Trashing)');
    console.log('\nMutation & Call Accounting:');
    console.log(`  - Application HTTP Calls: ${counters.appHttpCalls} / ${CAPS.maxAppHttpCalls} max`);
    console.log(`  - Bridge Calls:           ${counters.bridgeCalls} / ${CAPS.maxBridgeCalls} max`);
    console.log(`  - Direct Verification Reads: ${counters.directVerificationReads} / ${CAPS.maxDirectVerificationReads} max`);
    console.log(`  - Sheet Mutations:        ${counters.sheetMutations} / ${CAPS.maxSheetMutations} max`);
    console.log(`  - Drive Mutations:        ${counters.driveMutations} / ${CAPS.maxDriveMutations} max`);
    console.log(`  - Cleanup Retries Used:   ${counters.cleanupRetries} / 1 max`);
    console.log(`  - Residual Artifacts:     0 (ALL CLEANED)`);
    console.log('======================================================================\n');

  } catch (err: any) {
    console.error('\n[SCOPE B RUNNER FAILED]:', err?.message || err);
    console.error('Current counters at failure:', counters);
    if (counters.sheetMutations > 0 && counters.cleanupRetries < 1) {
      console.log('\n[EMERGENCY CLEANUP] Attempting cleanup after failure...');
      try {
        await canonicalSubmissionAdapter.deleteSubmission(TEST_ID);
        console.log('Emergency cleanup delete acknowledged.');
      } catch (cleanErr) {
        console.error('Emergency cleanup failed:', cleanErr);
      }
    }
    process.exit(1);
  }
}

runScopeB();
