/**
 * Test script for Google Sheets sync via Google Apps Script Web App
 * Usage:
 *   node scripts/test-gas-sync.js [APPS_SCRIPT_URL]
 */

const https = require('https');
const url = require('url');

const APPS_SCRIPT_URL = process.argv[2] || process.env.APPS_SCRIPT_URL;

if (!APPS_SCRIPT_URL) {
  console.log('\x1b[33m%s\x1b[0m', 'Usage: node scripts/test-gas-sync.js <APPS_SCRIPT_WEB_APP_URL>');
  console.log('Example: node scripts/test-gas-sync.js https://script.google.com/macros/s/.../exec\n');
  console.log('No URL provided. Testing schema structure locally...');
  process.exit(0);
}

function sendRequest(targetUrl, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(targetUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: {
        'Accept': 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      // Handle Google Apps Script 302 Redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(sendRequest(res.headers.location, 'GET', null));
      }

      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: responseData });
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log(`\nTesting Google Apps Script Web App: ${APPS_SCRIPT_URL}\n`);

  // Step 1: Trigger setupSheet to ensure 73 headers are populated in Row 1
  console.log('1. Calling ?action=setupSheet...');
  try {
    const setupRes = await sendRequest(`${APPS_SCRIPT_URL}?action=setupSheet`);
    console.log('Setup result:', JSON.stringify(setupRes, null, 2));
  } catch (err) {
    console.error('Setup error:', err.message);
  }

  // Step 2: Test ping
  console.log('\n2. Calling ?action=ping...');
  try {
    const pingRes = await sendRequest(`${APPS_SCRIPT_URL}?action=ping`);
    console.log('Ping result:', JSON.stringify(pingRes, null, 2));
  } catch (err) {
    console.error('Ping error:', err.message);
  }

  // Step 3: Insert sample record with 73 fields
  const testUuid = 'test-' + Date.now().toString(36);
  console.log(`\n3. Submitting sample 73-field assessment record (${testUuid})...`);
  const samplePayload = {
    action: 'create',
    uuid: testUuid,
    koboId: 'TEST-001',
    submissionTime: new Date().toISOString(),
    formSubmittedBy: 'Alliance Field Worker',
    consentObtained: 'Yes',
    signatureStatus: 'CAPTURED_LOCAL',
    visitDate: new Date().toISOString().split('T')[0],
    interviewerName: 'Field Worker Test',
    demographics: {
      childName: 'Aarav Rahul Kumar',
      dob: '2018-05-12',
      calculatedAgeYears: 8,
      gender: 'Male',
      orphanStatus: 'Single orphan (mother alive)',
      caregiverName: 'Sunita Kumar',
      caregiverRelationship: 'Mother',
      contactNumber: '9876543210',
      fullAddress: 'Plot 42, Anand Nagar',
      state: 'Maharashtra',
      district: 'Pune',
      childAadhaarNumber: 'XXXX-XXXX-1234',
    },
    caregiverConsent: {
      consentObtained: 'Yes',
      caregiverFullName: 'Sunita Kumar',
      caregiverRelation: 'Mother',
      signatureStatus: 'CAPTURED_LOCAL',
    },
    bankingAndKyc: {
      accountHolderName: 'Sunita Kumar',
      accountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
      bankLinkedMobileNumber: '9876543210',
      childAadhaarNumber: 'XXXX-XXXX-1234',
      passbookFrontPageUrl: 'https://storage.local/passbook-test.jpg',
      aadhaarCardUrl: 'https://storage.local/aadhaar-test.jpg',
      passportSizePhotoUrl: 'https://storage.local/photo-test.jpg',
    },
    householdFinancial: {
      totalFamilyMembers: 4,
      numberOfChildrenUnder18: 2,
      monthlyIncomeRs: 6500,
      mainSourceOfIncome: 'Daily wage labour',
    },
    health: {
      weightKg: 19.5,
      heightCm: 116,
      bmi: 14.5,
      bmiCategory: 'Normal',
      haemoglobinGdl: 11.2,
      hbCategory: 'Mild Anemia',
      artStatus: 'On ART',
      artRegistrationDate: '2023-01-15',
      artIdNumber: 'MH-PUN-0842',
      vlStatus: 'Tested in last 6 months',
      vlDate: '2026-02-10',
      viralLoad: '< 50',
      vlCategory: 'Undetectable (<50 copies/mL)',
      otherHealthConditions: ['None'],
    },
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    },
    educationStatus: {
      educationStatus: 'Currently going to school',
      schoolName: 'Zilla Parishad Primary School',
      schoolSessionStartDate: '2026-06-15',
      schoolType: 'Government school',
      currentClass: 'Class 3',
      attendance: 'Regular',
    },
    educationExpenses: {
      schoolFees: 1200,
      tuitionFees: 600,
      books: 800,
      stationery: 400,
      uniform: 900,
      transport: 500,
      otherExpenses: 200,
      totalAnnualCost: 4600,
      feeReceiptPhotoUrl: 'https://storage.local/receipt-test.jpg',
      marksheetPhotoUrl: 'https://storage.local/marksheet-test.jpg',
      remarks: 'Child attending regularly, needs educational support',
    },
    finalReview: {
      approvedAllianceIndia: 'Approved',
      allInfoCorrect: true,
      organizationName: 'India HIV/AIDS Alliance',
      formSubmittedBy: 'Field Worker Test',
      organizationEmail: 'field@allianceindia.org',
    },
    syncNeeded: 'NO',
  };

  try {
    const createRes = await sendRequest(APPS_SCRIPT_URL, 'POST', JSON.stringify(samplePayload));
    console.log('Create result:', JSON.stringify(createRes, null, 2));
  } catch (err) {
    console.error('Create error:', err.message);
  }
}

run();
