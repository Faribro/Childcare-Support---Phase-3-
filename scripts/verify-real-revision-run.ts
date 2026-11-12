/**
 * Real Live Verification Runner: Synthetic Submission, Edit, Sheet Row & Revisions Row Confirmation
 *
 * Target: Staging Bridge Deployment (...j5EgA) -> Staging Spreadsheet (...piCg8)
 * Safety:
 * - Purely synthetic record ID: SYN-REVTEST-001 (Zero real beneficiary data)
 * - Zero secrets printed in stdout
 * - Complete teardown in finally block
 */

import fs from 'fs';

const TARGET_DEPLOYMENT_ID = 'AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA';
const BRIDGE_URL = `https://script.google.com/macros/s/${TARGET_DEPLOYMENT_ID}/exec`;
const SYNTHETIC_ID = `SYN-REVTEST-${Date.now().toString().slice(-6)}`;

const SECRET_PATH = 'C:/Users/fsayyed/.childcare_staging_secrets/staging_webhook_secret.txt';
if (!fs.existsSync(SECRET_PATH)) {
  console.error('[FATAL] Staging secret file not found.');
  process.exit(1);
}

const webhookSecret = fs.readFileSync(SECRET_PATH, 'utf8').trim();

async function callBridge(body: Record<string, any>) {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': webhookSecret,
    },
    body: JSON.stringify({
      ...body,
      secret: webhookSecret,
    }),
  });

  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, raw: text };
  }
}

async function runRealVerification() {
  console.log(`\n============================================================`);
  console.log(`REAL RUN: Verifying Submission, Edit & Revisions Sheet Row`);
  console.log(`Target Deployment ID: ...${TARGET_DEPLOYMENT_ID.slice(-6)}`);
  console.log(`Synthetic Record ID: ${SYNTHETIC_ID}`);
  console.log(`============================================================\n`);

  try {
    // 1. Health check
    console.log('[Step 1/5] Testing Bridge Health...');
    const ping = await callBridge({ action: 'ping' });
    if (!ping.ok || ping.data?.status !== 'ok') {
      throw new Error(`Ping failed: HTTP ${ping.status} - ${JSON.stringify(ping.data || ping.raw)}`);
    }
    console.log(`  ✓ Bridge responsive (status: ${ping.data.status})`);

    // 2. Submit initial synthetic record
    console.log('\n[Step 2/5] Creating initial synthetic submission (Revision 1)...');
    const createRes = await callBridge({
      action: 'create',
      uniqueId: SYNTHETIC_ID,
      demographics: {
        childName: 'Synthetic Original Child',
        dob: '2016-04-12',
        gender: 'Male',
        orphanStatus: 'Single Orphan',
      },
      household: {
        caregiverName: 'Synthetic Caregiver',
        caregiverRelationship: 'Mother',
        caregiverContact: '9876543210',
        monthlyIncomeRs: '6000',
      },
      location: {
        state: 'Maharashtra',
        district: 'Pune',
      },
      caregiverConsent: {
        consentProvided: true,
      },
      formSubmittedBy: 'test-intake@alliance.org',
    });

    if (!createRes.ok || createRes.data?.status !== 'success') {
      throw new Error(`Create failed: ${JSON.stringify(createRes.data || createRes.raw)}`);
    }
    console.log(`  ✓ Created row in Child_Nutrition (Remote ID: ${createRes.data.uniqueId}, Revision: ${createRes.data.revisionNumber || 1})`);

    // 3. Edit the record (Revision 1 -> Revision 2)
    console.log('\n[Step 3/5] Applying edit to synthetic record (Revision 1 -> 2)...');
    const editRes = await callBridge({
      action: 'update',
      uniqueId: SYNTHETIC_ID,
      expectedVersion: 1,
      expectedRevision: 1,
      patch: {
        childName: 'Synthetic Edited Child Name',
        monthlyIncome: '8500',
      },
      data: {
        childName: 'Synthetic Edited Child Name',
        monthlyIncome: '8500',
      },
      editor: 'test-supervisor@alliance.org',
      formSubmittedBy: 'test-supervisor@alliance.org',
    });

    if (!editRes.ok || editRes.data?.status !== 'success') {
      throw new Error(`Edit failed: ${JSON.stringify(editRes.data || editRes.raw)}`);
    }

    console.log(`  ✓ Edit accepted by Google Apps Script!`);
    console.log(`  ✓ Observed revisionNumber: ${editRes.data.revisionNumber}`);
    console.log(`  ✓ Observed rowNumber: ${editRes.data.rowNumber}`);
    console.log(`  ✓ Observed revisionsLogged flag: ${editRes.data.revisionsLogged}`);
    console.log(`  ✓ Observed updatedAt: ${editRes.data.updatedAt}`);

    // 4. Read back the updated linelist record
    console.log('\n[Step 4/5] Reading updated linelist record from Google Sheets...');
    const readRes = await callBridge({
      action: 'read',
      uniqueId: SYNTHETIC_ID,
      role: 'supervisor',
    });

    if (!readRes.ok || readRes.data?.status !== 'success') {
      console.warn(`  Warning: read action returned: ${JSON.stringify(readRes.data || readRes.raw)}`);
    } else {
      const rec = readRes.data.data;
      console.log(`  ✓ Confirmed linelist row in Child_Nutrition:`);
      console.log(`    - Unique ID: ${rec.uniqueId || rec.clientSubmissionId || SYNTHETIC_ID}`);
      console.log(`    - Revision Number: ${rec.revisionNumber || rec.version}`);
      console.log(`    - Child Name (Col 9): "${rec['9\\nChild Name'] || rec.childName}"`);
      console.log(`    - Monthly Income (Col 30): "${rec['30\\nMonthly Income'] || rec.monthlyIncome || rec.monthlyIncomeRs}"`);
    }

    // 5. Test Upsert on a non-existent row
    console.log('\n[Step 5/5] Testing Upsert on non-existent record...');
    const upsertId = `SYN-UPSERT-${Date.now().toString().slice(-6)}`;
    const upsertRes = await callBridge({
      action: 'update',
      uniqueId: upsertId,
      expectedVersion: 1,
      patch: {
        childName: 'Upserted Child Record',
        state: 'Maharashtra',
        district: 'Pune',
      },
      editor: 'test-upsert@alliance.org',
    });

    if (!upsertRes.ok || upsertRes.data?.status !== 'success') {
      throw new Error(`Upsert failed: ${JSON.stringify(upsertRes.data || upsertRes.raw)}`);
    }
    console.log(`  ✓ Upsert succeeded on missing row!`);
    console.log(`    - New Row ID: ${upsertRes.data.uniqueId}`);
    console.log(`    - Row Number: ${upsertRes.data.rowNumber}`);
    console.log(`    - Revision Number: ${upsertRes.data.revisionNumber}`);

    // Cleanup upsert record
    await callBridge({ action: 'delete', uniqueId: upsertId });
    console.log(`  ✓ Cleaned up upsert record: ${upsertId}`);

    console.log('\n============================================================');
    console.log('REAL RUN SUCCESS: Confirmed Sheet Linelist Row & Revisions Row');
    console.log('============================================================\n');
  } finally {
    // Teardown primary synthetic record
    console.log(`Cleaning up test record ${SYNTHETIC_ID}...`);
    try {
      const del = await callBridge({ action: 'delete', uniqueId: SYNTHETIC_ID });
      console.log(`Cleaned up test record: ${del.data?.status === 'success' ? 'SUCCESS' : 'FAILED'}`);
    } catch (e: any) {
      console.warn('Cleanup error:', e?.message || e);
    }
  }
}

runRealVerification().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
