/**
 * Comprehensive Verification Script for State-SSR-Child Drive Hierarchy & CRUD Flow
 * Using REAL images selected randomly from Downloads folder (C:\Users\fsayyed\Downloads)
 * Target: Staging Apps Script Web App (Staging v10)
 */

import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATH = 'C:\\Users\\fsayyed\\.childcare_staging_secrets\\staging_webhook_secret.txt';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA/exec';
const DOWNLOADS_DIR = 'C:\\Users\\fsayyed\\Downloads';

if (!fs.existsSync(SECRET_PATH)) {
  console.error(`ERROR: Secret file not found at ${SECRET_PATH}`);
  process.exit(1);
}

const WEBHOOK_SECRET = fs.readFileSync(SECRET_PATH, 'utf8').trim();

// Pick real images from Downloads under 500KB for quick upload
function getRealImageFiles() {
  const allFiles = fs.readdirSync(DOWNLOADS_DIR);
  const imageFiles = allFiles
    .filter(f => /\.(png|jpe?g)$/i.test(f))
    .map(f => path.join(DOWNLOADS_DIR, f))
    .filter(filePath => {
      try {
        const stat = fs.statSync(filePath);
        return stat.isFile() && stat.size > 1000 && stat.size < 500 * 1024;
      } catch (e) {
        return false;
      }
    });

  if (imageFiles.length === 0) {
    throw new Error('No suitable real image files (<500KB) found in Downloads folder');
  }

  // Shuffle and pick 4 images
  const shuffled = [...imageFiles].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 4);
}

function fileToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  return {
    dataUrl: `data:${mime};base64,${base64}`,
    filename: path.basename(filePath),
    bytes: buffer.length,
    mime: mime
  };
}

async function sendAppsScript(payload) {
  const body = JSON.stringify({
    ...payload,
    secret: WEBHOOK_SECRET,
  });

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body,
    redirect: 'follow',
  });

  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text) };
  } catch (e) {
    return { status: res.status, ok: res.ok, raw: text };
  }
}

async function main() {
  console.log('================================================================');
  console.log('DRIVE HIERARCHY & CRUD FLOW END-TO-END VERIFICATION');
  console.log('USING REAL IMAGES FROM DOWNLOADS FOLDER');
  console.log(`Target: ${APPS_SCRIPT_URL}`);
  console.log('================================================================\n');

  const selectedImages = getRealImageFiles();
  console.log('Selected Real Images from Downloads:');
  selectedImages.forEach((p, idx) => {
    const stat = fs.statSync(p);
    console.log(`  [${idx + 1}] ${path.basename(p)} (${(stat.size / 1024).toFixed(1)} KB)`);
  });
  console.log('');

  const imgPhoto = fileToDataUrl(selectedImages[0]);
  const imgPassbook = fileToDataUrl(selectedImages[1 % selectedImages.length]);
  const imgAadhaar = fileToDataUrl(selectedImages[2 % selectedImages.length]);
  const imgReplacementPassbook = fileToDataUrl(selectedImages[3 % selectedImages.length]);

  const results = [];
  const testChildId = 'SYN-HIER-' + Date.now().toString(36).toUpperCase();
  const stateName = 'Maharashtra';
  const ssrName = 'Sahara Kalyan Samiti';

  console.log(`Test Child Unique ID: ${testChildId}`);
  console.log(`State: ${stateName}, SSR: ${ssrName}\n`);

  // -------------------------------------------------------------------------
  // TEST 1: Hierarchy Creation with 2 Real Documents (Photo + Passbook)
  // -------------------------------------------------------------------------
  console.log(`--- TEST 1: Hierarchy Creation with 2 Real Documents (${imgPhoto.filename}, ${imgPassbook.filename}) ---`);
  const createPayload = {
    action: 'create',
    uniqueId: testChildId,
    clientSubmissionId: testChildId,
    interviewerName: 'Field Officer Anjali',
    formSubmittedBy: 'Anjali Sharma',
    demographics: {
      childName: 'Aarav Rahul Kumar',
      dob: '2017-06-15',
      calculatedAgeYears: 9,
      gender: 'Male',
      orphanStatus: 'Single orphan (mother alive)',
      caregiverName: 'Sunita Kumar',
      caregiverRelationship: 'Mother',
      contactNumber: '9876543210',
      fullAddress: 'Plot 101, Sahara Road',
      state: stateName,
      district: 'Pune',
      childAadhaarNumber: 'XXXX-XXXX-8899',
      srName: 'Priya Verma',
      ssrName: ssrName,
      guardianStatus: 'Alive and Well',
    },
    caregiverConsent: {
      consentObtained: 'Yes',
      caregiverFullName: 'Sunita Kumar',
      caregiverRelation: 'Mother',
      signatureStatus: 'CAPTURED_LOCAL',
    },
    bankingAndKyc: {
      accountHolderName: 'Sunita Kumar',
      accountNumber: '987654321012',
      ifscCode: 'SBIN0001234',
      bankLinkedMobileNumber: '9876543210',
      passbookPhotoUrl: imgPassbook.dataUrl,
      childPhotoUrl: imgPhoto.dataUrl,
      passportSizePhotoUrl: imgPhoto.dataUrl,
    },
    householdFinancial: {
      totalFamilyMembers: 3,
      numberOfChildrenUnder18: 1,
      monthlyIncomeRs: 7500,
      mainSourceOfIncome: 'Small Enterprise',
    },
    health: {
      weightKg: 22,
      heightCm: 120,
      bmi: 15.3,
      bmiCategory: 'Normal',
      artStatus: 'Not on ART',
    },
    educationStatus: {
      educationStatus: 'Currently going to school',
      schoolName: 'Sahara Public School',
      currentClass: 'Class 4',
      attendance: 'Regular',
    },
    finalReview: {
      approvedAllianceIndia: 'Approved',
      allInfoCorrect: true,
      organizationName: 'India HIV/AIDS Alliance',
      formSubmittedBy: 'Anjali Sharma',
      organizationEmail: 'anjali@saharakalyan.org',
    },
    syncNeeded: 'NO',
  };

  const createRes = await sendAppsScript(createPayload);
  console.log('Create Response:', JSON.stringify(createRes.data, null, 2));

  // Verify getChildDocuments after Create
  const listAfterCreate = await sendAppsScript({ action: 'getChildDocuments', uniqueId: testChildId });
  console.log('Documents After Create:', JSON.stringify(listAfterCreate.data, null, 2));

  const docsAfterCreate = listAfterCreate.data?.documents || [];
  const createdPassbook = docsAfterCreate.some(d => d.name.toLowerCase().includes('passbook') && (d.folder === 'current' || d.subfolder === 'current'));
  const createdPhoto = docsAfterCreate.some(d => (d.name.toLowerCase().includes('photo') || d.name.toLowerCase().includes('child')) && (d.folder === 'current' || d.subfolder === 'current'));

  const t1Pass = createRes.ok &&
    createRes.data.status === 'success' &&
    createRes.data.driveFolderId &&
    createRes.data.driveHierarchy === `${stateName} / ${ssrName} / ${testChildId}` &&
    createRes.data.assetStatus === 'UPLOADED' &&
    createdPassbook &&
    createdPhoto;

  results.push({
    test: 'Test 1: Hierarchy Creation (State -> SSR -> ChildId) with Real Images',
    expected: `Hierarchy "${stateName} / ${ssrName} / ${testChildId}" & 2 real files in current/`,
    actual: `${createRes.data?.driveHierarchy} | passbook:${createdPassbook}, photo:${createdPhoto}, count:${docsAfterCreate.length}`,
    pass: t1Pass,
  });

  // -------------------------------------------------------------------------
  // TEST 2: Add 3rd Real Document (Aadhaar) Later into Existing Child Folder
  // -------------------------------------------------------------------------
  console.log(`\n--- TEST 2: Add 3rd Document (${imgAadhaar.filename}) to Existing Child ---`);
  const addDocPayload = {
    action: 'replaceAsset',
    uniqueId: testChildId,
    slotPrefix: 'Aadhaar',
    fileDataUrl: imgAadhaar.dataUrl,
    expectedRevision: 1,
    state: stateName,
    ssrName: ssrName,
  };

  const addDocRes = await sendAppsScript(addDocPayload);
  console.log('Add Aadhaar Response:', JSON.stringify(addDocRes.data, null, 2));

  const listAfterAdd = await sendAppsScript({ action: 'getChildDocuments', uniqueId: testChildId });
  console.log('Documents After Add:', JSON.stringify(listAfterAdd.data, null, 2));

  const currentDocsAfterAdd = (listAfterAdd.data?.documents || []).filter(d => (d.folder === 'current' || d.subfolder === 'current'));
  const hasAadhaar = currentDocsAfterAdd.some(d => d.name.toLowerCase().includes('identity') || d.name.toLowerCase().includes('aadhaar'));
  const t2Pass = addDocRes.ok &&
    addDocRes.data.status === 'success' &&
    hasAadhaar &&
    currentDocsAfterAdd.length >= 3 &&
    addDocRes.data.driveFolderId === createRes.data.driveFolderId;

  results.push({
    test: 'Test 2: Add 3rd Document Later (Real File)',
    expected: 'Aadhaar lands in current/ alongside existing docs; folder ID preserved',
    actual: `current docs count: ${currentDocsAfterAdd.length}, folderId matched: ${addDocRes.data?.driveFolderId === createRes.data?.driveFolderId}`,
    pass: t2Pass,
  });

  // -------------------------------------------------------------------------
  // TEST 3: Replace Passbook with Real Image & OCC Check
  // -------------------------------------------------------------------------
  console.log(`\n--- TEST 3: Replace Passbook with Real Image (${imgReplacementPassbook.filename}) & OCC ---`);
  // 3a: Verify OCC rejects outdated revision
  const occFailPayload = {
    action: 'replaceAsset',
    uniqueId: testChildId,
    slotPrefix: 'Passbook',
    fileDataUrl: imgReplacementPassbook.dataUrl,
    expectedRevision: 0,
  };
  const occFailRes = await sendAppsScript(occFailPayload);
  console.log('OCC Conflict Test (Expected 409):', JSON.stringify(occFailRes.data, null, 2));
  const occBlocked = !occFailRes.ok || occFailRes.status === 409 || occFailRes.data?.code === 'OCC_CONFLICT';

  // 3b: Replace with valid revision
  const currentRevision = addDocRes.data?.revisionNumber || 2;
  const replacePayload = {
    action: 'replaceAsset',
    uniqueId: testChildId,
    slotPrefix: 'Passbook',
    fileDataUrl: imgReplacementPassbook.dataUrl,
    expectedRevision: currentRevision,
  };
  const replaceRes = await sendAppsScript(replacePayload);
  console.log('Replace Passbook Response:', JSON.stringify(replaceRes.data, null, 2));

  const listAfterReplace = await sendAppsScript({ action: 'getChildDocuments', uniqueId: testChildId });
  console.log('Documents After Replace:', JSON.stringify(listAfterReplace.data, null, 2));

  const revDocs = (listAfterReplace.data?.documents || []).filter(d => (d.folder === 'revisions' || d.subfolder === 'revisions'));
  const supersededPassbook = revDocs.some(d => d.name.toLowerCase().includes('passbook'));
  const activePassbook = (listAfterReplace.data?.documents || []).some(d => (d.folder === 'current' || d.subfolder === 'current') && d.name.toLowerCase().includes('passbook'));

  const t3Pass = occBlocked && replaceRes.ok && replaceRes.data.status === 'success' && supersededPassbook && activePassbook;

  results.push({
    test: 'Test 3: Replace Document & OCC Check (Real File)',
    expected: 'OCC conflict rejected outdated rev; old passbook moved to revisions/ as SUPERSEDED_',
    actual: `OCC blocked: ${occBlocked}, replaced status: ${replaceRes.data?.status}, revisions has passbook: ${supersededPassbook}, active passbook: ${activePassbook}`,
    pass: t3Pass,
  });

  // -------------------------------------------------------------------------
  // TEST 4: Quarantine Child Photo (Real File)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Quarantine Child Photo ---');
  const quarantinePayload = {
    action: 'quarantineAsset',
    uniqueId: testChildId,
    slotPrefix: 'Child_Photo',
    reason: 'blurry image',
  };
  const quarantineRes = await sendAppsScript(quarantinePayload);
  console.log('Quarantine Response:', JSON.stringify(quarantineRes.data, null, 2));

  const listAfterQuarantine = await sendAppsScript({ action: 'getChildDocuments', uniqueId: testChildId });
  console.log('Documents After Quarantine:', JSON.stringify(listAfterQuarantine.data, null, 2));

  const quarDocs = (listAfterQuarantine.data?.documents || []).filter(d => (d.folder === 'quarantine' || d.subfolder === 'quarantine'));
  const quarantinedPhoto = quarDocs.some(d => d.name.toLowerCase().includes('photo') || d.name.toLowerCase().includes('child'));
  const t4Pass = quarantineRes.ok &&
    quarantineRes.data.status === 'success' &&
    quarantineRes.data.quarantined === true &&
    quarantineRes.data.fileMoved === true &&
    quarantinedPhoto;

  results.push({
    test: 'Test 4: Quarantine Document (Real File Soft-Delete)',
    expected: 'Photo moved from current/ to quarantine/, revision incremented, audit logged',
    actual: `quarantined: ${quarantineRes.data?.quarantined}, fileMoved: ${quarantineRes.data?.fileMoved}, quar docs count: ${quarDocs.length}`,
    pass: t4Pass,
  });

  // -------------------------------------------------------------------------
  // TEST 5: Query getChildDocuments Complete Status
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Query getChildDocuments Complete Status ---');
  const getDocsRes = await sendAppsScript({ action: 'getChildDocuments', uniqueId: testChildId });
  console.log('Complete getChildDocuments Result:', JSON.stringify(getDocsRes.data, null, 2));

  const allDocs = getDocsRes.data?.documents || [];
  const hasActive = allDocs.some(d => d.status === 'ACTIVE');
  const hasSuperseded = allDocs.some(d => d.status === 'SUPERSEDED');
  const hasQuarantined = allDocs.some(d => d.status === 'QUARANTINED');
  const t5Pass = getDocsRes.ok &&
    getDocsRes.data.status === 'success' &&
    getDocsRes.data.hierarchy?.path === `${stateName} / ${ssrName} / ${testChildId}` &&
    hasActive && hasSuperseded && hasQuarantined;

  results.push({
    test: 'Test 5: Query getChildDocuments (Fast O(1) Lookup)',
    expected: 'Returns active, superseded, and quarantined docs with hierarchy path and URLs',
    actual: `path: ${getDocsRes.data?.hierarchy?.path}, active: ${hasActive}, superseded: ${hasSuperseded}, quarantined: ${hasQuarantined}, totalDocs: ${allDocs.length}`,
    pass: t5Pass,
  });

  // -------------------------------------------------------------------------
  // TEST 6: Migration Utility (dryRun + apply + idempotence)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Migration Utility ---');
  console.log('Running dryRun: true...');
  const dryRunRes = await sendAppsScript({ action: 'migrateLegacyFolders', dryRun: true });
  console.log('DryRun Migration Result:', JSON.stringify(dryRunRes.data, null, 2));

  console.log('Running apply (dryRun: false)...');
  const applyRes = await sendAppsScript({ action: 'migrateLegacyFolders', dryRun: false });
  console.log('Apply Migration Result:', JSON.stringify(applyRes.data, null, 2));

  const t6Pass = dryRunRes.ok &&
    dryRunRes.data?.dryRun === true &&
    applyRes.ok &&
    applyRes.data?.status === 'success' &&
    applyRes.data?.alreadyCompliant >= 1;

  results.push({
    test: 'Test 6: Migration Utility (dryRun + apply)',
    expected: 'dryRun reports moves without modifying; apply confirms compliance',
    actual: `dryRun.dryRun: ${dryRunRes.data?.dryRun}, apply.status: ${applyRes.data?.status}, alreadyCompliant: ${applyRes.data?.alreadyCompliant}`,
    pass: t6Pass,
  });

  // -------------------------------------------------------------------------
  // SUMMARY TABLE
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('VERIFICATION SUMMARY TABLE:');
  console.log('================================================================');
  console.table(results.map(r => ({
    'Test Case': r.test,
    'Expected Result': r.expected,
    'Actual Result': r.actual,
    'Pass / Fail': r.pass ? 'PASS' : 'FAIL',
  })));

  const allPassed = results.every(r => r.pass);
  console.log(`\nOverall Result: ${allPassed ? 'ALL TESTS PASSED (6/6)' : 'SOME TESTS FAILED'}\n`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
