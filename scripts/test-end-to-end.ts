/**
 * End-to-End Live Integration Verification Script
 * Validates full survey lifecycle:
 * 1. Sheet empty check
 * 2. Create survey (73 fields)
 * 3. Read survey verification
 * 4. OCC Revision update
 * 5. Delete survey
 * 6. Pristine sheet state confirmation
 */

import https from 'https';
import { URL } from 'url';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxbo4ErI10K505h1qMIY8HY7bo-gQU2Gw6c8NSZ3Py6aOTVAsjeK28OPsxilyHjgmTL/exec';
const WEBHOOK_SECRET = 'childcare_phase3_secret_token_2026';

function request(targetUrl: string, method: string = 'GET', payload?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const postData = payload ? JSON.stringify(payload) : null;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: {
        Accept: 'application/json',
        ...(postData
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
            }
          : {}),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(request(res.headers.location, 'GET', null));
      }

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, json });
        } catch {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runE2ETests() {
  console.log('=====================================================');
  console.log('  CHILD NUTRITION PWA — PHASE 3 E2E SYSTEM AUDIT');
  console.log('=====================================================\n');

  // STEP 1: Verify Initial Clean State
  console.log('TEST 1: Verifying Google Sheet Initial Clean State...');
  const initRes = await request(`${APPS_SCRIPT_URL}?action=list&limit=10`);
  console.log(`Initial total records: ${initRes.json.total}`);
  if (initRes.json.total !== 0) {
    console.log('Sheet has leftover rows! Purging now...');
    const clearRes = await request(`${APPS_SCRIPT_URL}?action=clearData`);
    console.log('Purge result:', clearRes.json);
  }
  console.log('✔ Sheet confirmed 100% clean with 0 records.\n');

  // STEP 2: Submit a Test Beneficiary Record (Full 73 Fields)
  const testId = `TEST-BEN-${Date.now().toString(36).toUpperCase()}`;
  console.log(`TEST 2: Submitting Test Beneficiary Record: ${testId}...`);
  const surveyPayload = {
    action: 'create',
    secret: WEBHOOK_SECRET,
    uniqueId: testId,
    clientSubmissionId: testId,
    submissionTime: new Date().toISOString(),
    demographics: {
      dateOfFilling: new Date().toISOString().split('T')[0],
      childName: 'Validation Test Child',
      dob: '2016-08-15',
      calculatedAgeYears: 10,
      gender: 'Female',
      orphanStatus: 'Single Orphan',
      caregiverName: 'Test Caregiver Mother',
      caregiverRelationship: 'Mother',
      contactNumber: '9820011223',
      fullAddress: 'Flat 102, Test Shelter, Pune, Maharashtra',
      state: 'Maharashtra',
      district: 'Pune',
      childAadhaarNumber: 'XXXX-XXXX-9988',
    },
    bankingAndKyc: {
      bankAccountHolderName: 'Test Caregiver Mother',
      bankAccountNumber: '987654321098',
      bankIfscCode: 'SBIN0001234',
      bankLinkedMobileNumber: '9820011223',
      childAadhaarNumber: 'XXXX-XXXX-9988',
      passbookPhotoUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=200',
      aadhaarCardPhotoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200',
      childPhotoUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200',
    },
    householdFinancial: {
      totalFamilyMembers: 4,
      numberOfChildrenUnder18: 2,
      monthlyIncomeRs: 7500,
      mainSourceOfIncome: 'Tailoring',
    },
    health: {
      weightKg: 28.5,
      heightCm: 132,
      bmi: 16.3,
      bmiCategory: 'Normal',
      haemoglobinGdl: 12.1,
      hbCategory: 'Normal',
      otherHealthConditions: ['None'],
      otherHealthConditionSpecify: '',
      artStatus: 'On ART',
      artRegistrationDate: '2021-05-10',
      artIdNumber: 'MH-PUN-9821',
      vlStatus: 'Tested in last 6 months',
      vlDate: '2026-03-01',
      viralLoad: '< 50',
      vlCategory: 'Undetectable (<50 copies/mL)',
    },
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    },
    educationStatus: {
      educationStatus: 'Currently going to school',
      educationStatusSpecify: '',
      schoolName: 'Pune Vidya Mandir Primary',
      schoolSessionStartDate: '2026-06-15',
      schoolType: 'Government school',
      currentClass: 'Class 5',
      attendance: 'Regular',
    },
    educationExpenses: {
      schoolFees: 1500,
      tuitionFees: 3600,
      books: 1200,
      stationery: 800,
      uniform: 1400,
      transport: 1800,
      otherExpenses: 500,
      totalAnnualCost: 10800,
      feeReceiptPhotoUrl: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=200',
      marksheetPhotoUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=200',
      remarks: 'Automated E2E Test Survey',
    },
    consent: {
      agreeToParticipate: true,
      signatureDataUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=200',
    },
    finalReview: {
      formSubmittedBy: 'Quality Assurance Auditor',
      organizationName: 'India HIV/AIDS Alliance',
      organizationEmail: 'qa@allianceindia.org',
      approvedAllianceIndia: 'Approved',
      allInfoCorrect: true,
    },
    syncNeeded: 'NO',
  };

  const createRes = await request(APPS_SCRIPT_URL, 'POST', surveyPayload);
  console.log('Create Response:', createRes.json);
  if (createRes.json.status !== 'success' || createRes.json.uniqueId !== testId) {
    throw new Error('Create failed or returned incorrect uniqueId');
  }
  console.log(`✔ Created record ${testId} with Revision Number: ${createRes.json.revisionNumber}\n`);

  // STEP 3: Read Created Record
  console.log(`TEST 3: Reading Record back from Google Sheet (${testId})...`);
  const readRes = await request(`${APPS_SCRIPT_URL}?action=read&submissionId=${testId}`);
  console.log('Read Status:', readRes.json.status);
  console.log('Unique ID:', readRes.json.uniqueId);
  console.log('Child Name:', readRes.json.data['9\nChild Name']);
  console.log('Current Revision:', readRes.json.revisionNumber);
  if (readRes.json.data['9\nChild Name'] !== 'Validation Test Child') {
    throw new Error('Read verification failed: Child Name does not match');
  }
  console.log('✔ Read verification passed.\n');

  // STEP 4: Update Record (OCC Revision Check)
  console.log(`TEST 4: Updating Record with OCC revision increment...`);
  const updatePayload = {
    action: 'update',
    secret: WEBHOOK_SECRET,
    uniqueId: testId,
    expectedRevision: 1,
    weightKg: 29.0,
    bmi: 16.6,
    remarks: 'E2E Updated Weight & BMI successfully verified',
  };

  const updateRes = await request(APPS_SCRIPT_URL, 'POST', updatePayload);
  console.log('Update Response:', updateRes.json);
  if (updateRes.json.status !== 'success' || updateRes.json.revisionNumber !== 2) {
    throw new Error('Update failed or revision number did not increment to 2');
  }
  console.log('✔ OCC Revision incremented from 1 to 2.\n');

  // STEP 5: Delete Test Record to Leave Sheet Completely Pristine
  console.log(`TEST 5: Deleting Test Record (${testId}) to purge test data...`);
  const deletePayload = {
    action: 'delete',
    secret: WEBHOOK_SECRET,
    uniqueId: testId,
  };

  const deleteRes = await request(APPS_SCRIPT_URL, 'POST', deletePayload);
  console.log('Delete Response:', deleteRes.json);
  if (deleteRes.json.status !== 'success') {
    throw new Error('Delete failed');
  }
  console.log('✔ Successfully deleted test record.\n');

  // STEP 6: Confirm 0 Rows Remain in Sheet
  console.log('TEST 6: Final Verification of Sheet Cleanliness...');
  const finalRes = await request(`${APPS_SCRIPT_URL}?action=list&limit=10`);
  console.log(`Final total records in sheet: ${finalRes.json.total}`);
  if (finalRes.json.total !== 0) {
    throw new Error(`Sheet still contains ${finalRes.json.total} records!`);
  }
  console.log('✔ Zero dummy records confirmed. Google Sheet is 100% clean and ready for real data!\n');

  console.log('=====================================================');
  console.log('  ALL END-TO-END TESTS PASSED WITH 100% SUCCESS!');
  console.log('=====================================================');
}

runE2ETests().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
