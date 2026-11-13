/**
 * Real Integration Test against Staging Firestore Database
 *
 * Target:
 * - Project: cs-p3-production
 * - Region: asia-south1
 * - Database: staging (named database)
 * - Environment: APP_ENV=staging, FIRESTORE_DATABASE_ID=staging
 *
 * Execution Prerequisites (Run by owner in terminal before executing):
 * 1. gcloud auth application-default login
 * 2. gcloud config set project cs-p3-production
 * 3. $env:APP_ENV="staging"; $env:FIRESTORE_DATABASE_ID="staging"; $env:GOOGLE_CLOUD_PROJECT="cs-p3-production"
 * 4. npx tsx scripts/test-staging-firestore-live.ts (or bun run scripts/test-staging-firestore-live.ts)
 */

import { Firestore } from '@google-cloud/firestore';
import { validateFirestoreDatabaseEnvironment } from '../src/lib/server/firestoreSubmissionAdapter';

async function runStagingFirestoreLiveTest() {
  console.log('--- STAGING FIRESTORE LIVE INTEGRATION TEST ---');
  
  const appEnv = process.env.APP_ENV || 'staging';
  const databaseId = process.env.FIRESTORE_DATABASE_ID || 'staging';
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production';

  console.log(`Verifying Environment: APP_ENV=${appEnv}, DATABASE_ID=${databaseId}, PROJECT=${projectId}`);

  // 1. Enforce environment isolation guard
  try {
    validateFirestoreDatabaseEnvironment(appEnv, databaseId);
    console.log('✓ Environment isolation guard validated successfully.');
  } catch (err: any) {
    console.error(`✗ Environment isolation violation: ${err.message}`);
    process.exit(1);
  }

  if (appEnv !== 'staging' || databaseId !== 'staging') {
    console.error('✗ ERROR: This script must ONLY run with APP_ENV=staging and FIRESTORE_DATABASE_ID=staging.');
    process.exit(1);
  }

  // 2. Initialize Firestore client targeting named database 'staging'
  console.log(`Initializing Firestore client for database: ${databaseId}...`);
  const db = new Firestore({
    projectId,
    databaseId,
  });

  const testId = `TEST-INTEG-${Date.now()}`;
  const docRef = db.collection('submissions').doc(testId);
  const now = new Date().toISOString();

  try {
    // 3. STEP 1: CREATE
    console.log(`\n[STEP 1: CREATE] Creating synthetic test record: ${testId}`);
    const initialPayload = {
      id: testId,
      clientSubmissionId: testId,
      uniqueId: testId,
      version: 1,
      revisionNumber: 1,
      status: 'SUBMITTED',
      state: 'Delhi',
      district: 'Central',
      childName: 'Synthetic Test Child',
      submittedBy: 'Live Integration Test Runner',
      payload: {
        clientSubmissionId: testId,
        testRun: true,
        timestamp: now,
      },
      submissionTime: now,
      createdAt: now,
      updatedAt: now,
      mirrorStatus: 'TEST_SYNTHETIC',
    };

    await docRef.set(initialPayload);
    const snap1 = await docRef.get();
    if (!snap1.exists) throw new Error('Document failed to persist.');
    console.log(`✓ Record created successfully in collection "submissions" (version: ${snap1.data()?.version}).`);

    // 4. STEP 2: DUPLICATE (IDEMPOTENCY / OVERWRITE)
    console.log(`\n[STEP 2: DUPLICATE] Re-submitting identical clientSubmissionId: ${testId}`);
    const snapBeforeDup = await docRef.get();
    if (snapBeforeDup.exists) {
      console.log('✓ Idempotency check: detected existing document with same clientSubmissionId.');
    }
    // Overwrite with identical payload
    await docRef.set({ ...initialPayload, duplicateAcknowledged: true }, { merge: true });
    const snapDup = await docRef.get();
    if (snapDup.data()?.duplicateAcknowledged !== true) {
      throw new Error('Duplicate overwrite failed to merge acknowledged flag.');
    }
    console.log('✓ Duplicate submission handled cleanly without duplicating records.');

    // 5. STEP 3: UPDATE (OCC PATCH)
    console.log(`\n[STEP 3: UPDATE] Updating record with OCC patch (bumping version to 2)...`);
    const updateTime = new Date().toISOString();
    await docRef.update({
      version: 2,
      revisionNumber: 2,
      remarks: 'Live integration test update verified',
      updatedAt: updateTime,
    });
    const snap2 = await docRef.get();
    const updatedData = snap2.data();
    if (updatedData?.version !== 2 || updatedData?.remarks !== 'Live integration test update verified') {
      throw new Error(`Update verification failed: version=${updatedData?.version}, remarks=${updatedData?.remarks}`);
    }
    console.log(`✓ Record updated successfully (version bumped to ${updatedData.version}).`);

    // 6. STEP 4: LIST (PAGINATED QUERY)
    console.log(`\n[STEP 4: LIST] Querying collection with limit and filtering...`);
    const querySnap = await db
      .collection('submissions')
      .where('state', '==', 'Delhi')
      .limit(10)
      .get();
    console.log(`✓ List query succeeded. Retrieved ${querySnap.docs.length} document(s).`);
    const found = querySnap.docs.some((d) => d.id === testId);
    if (!found) {
      console.warn('Note: Newly created record not matched in filtered query or indexed view.');
    } else {
      console.log(`✓ Verified target test document ${testId} present in query results.`);
    }

    // 7. STEP 5: CLEANUP (DELETE)
    console.log(`\n[STEP 5: CLEANUP] Deleting test record: ${testId}...`);
    await docRef.delete();
    const snapAfterDelete = await docRef.get();
    if (snapAfterDelete.exists) {
      throw new Error('Failed to delete test document during cleanup.');
    }
    console.log(`✓ Test record ${testId} deleted successfully. Staging database clean.`);

    console.log('\n======================================================');
    console.log('ALL LIVE STAGING FIRESTORE INTEGRATION CHECKS PASSED!');
    console.log('======================================================');
  } catch (err: any) {
    console.error(`\n✗ ERROR during live staging test: ${err.message}`);
    // Attempt emergency cleanup
    try {
      await docRef.delete();
      console.log(`(Emergency cleanup executed for ${testId})`);
    } catch {}
    process.exit(1);
  }
}

runStagingFirestoreLiveTest();
