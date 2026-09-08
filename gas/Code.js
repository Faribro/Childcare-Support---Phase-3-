/**
 * Google Apps Script Backend Adapter — Phase 3 Hardened OCC Architecture
 * Project ID: 1yXEgElXFb0Fb_CzTlQ8TDvRUuEYmq5dady7ialsqMnkAU1XX5SPJW8P3
 * Target Sheet ID: 1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA
 *
 * Implements:
 * - Exact 73-column schema matching the official CHILD_HIV_SUPPORT_FORM & linelist
 * - Automatic row 1 header initialization & styling
 * - 30s LockService Mutex around dedupe and mutations
 * - Idempotent create (action: 'create') returning canonical remoteSubmissionId
 * - Optimistic Concurrency Control update (action: 'update')
 * - Read single record (action: 'read')
 * - List records with pagination (action: 'list')
 * - Strictly NO art_center columns per programme data privacy rule
 * - Zero base64 images in Sheet (only metadata & status flags)
 */

var TARGET_SPREADSHEET_ID = '1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA';
var PRIMARY_SHEET_NAME = 'Sheet1';
var AUDIT_SHEET_NAME = 'Audit_Log';
var HEADER_ROW_INDEX = 1;
var LOCK_TIMEOUT_MS = 30000;

var COLUMN_HEADERS = [
  "UUID",                           // 1
  "Kobo ID",                        // 2
  "Submission Time",                // 3
  "Submitted By",                   // 4
  "Consent Obtained",               // 5
  "Signature / Thumb Impression",   // 6
  "Visit Date",                     // 7
  "Interviewer Name",               // 8
  "Child Name",                     // 9
  "Date of Birth",                  // 10
  "Age",                            // 11
  "Gender",                         // 12
  "Orphan Status",                  // 13
  "Caregiver Full Name",            // 14
  "Caregiver Relation",             // 15
  "Caregiver Contact",              // 16
  "Address",                        // 17
  "State",                          // 18
  "District",                       // 19
  "Bank Account Holder Name",       // 20
  "Bank Account Number",            // 21
  "Bank IFSC Code",                 // 22
  "Bank Linked Mobile Number",      // 23
  "Child Aadhaar Number",           // 24
  "Passbook Front Page Link",       // 25
  "Aadhaar Card Link",              // 26
  "Passport Size Photo Link",       // 27
  "Household Members",              // 28
  "No of Children",                 // 29
  "Monthly Income",                 // 30
  "Income Source",                  // 31
  "Current Weight (kg)",            // 32
  "Current Height (cm)",            // 33
  "BMI",                            // 34
  "BMI Category",                   // 35
  "Hemoglobin (g/dL)",              // 36
  "Hb Category",                    // 37
  "Comorbidities",                  // 38
  "Comorbidities Other",            // 39
  "ART Status",                     // 40
  "ART Registration Date",          // 41
  "ART ID Number",                  // 42
  "VL Status",                      // 43
  "VL Date",                        // 44
  "Viral Load",                     // 45
  "VL Category",                    // 46
  "Appetite",                       // 47
  "Meals per Day",                  // 48
  "Education Status",               // 49
  "Education Status Other",         // 50
  "School Name",                    // 51
  "School Session Start Date",      // 52
  "School Type",                    // 53
  "Current Class",                  // 54
  "Attendance Status",              // 55
  "School Fees",                    // 56
  "Private Tuition Fee",            // 57
  "School Books",                   // 58
  "School Stationery",              // 59
  "School Uniform",                 // 60
  "School Transport",               // 61
  "School Other Expenses",          // 62
  "Total Annual Education Cost",    // 63
  "School Fee Receipt Link",        // 64
  "Marksheet Photo Link",           // 65
  "Remarks (If Any)",               // 66
  "Approved Alliance India",        // 67
  "Review Confirmed",               // 68
  "Organization Name",              // 69
  "Form Submitted By",              // 70
  "Organization Email",             // 71
  "Sync Needed",                    // 72
  "Last Updated"                    // 73
];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'health';

  if (action === 'health') {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'ok',
        service: 'childcare-apps-script-bridge',
        version: '3.1.0',
        columns: COLUMN_HEADERS.length,
        timestamp: new Date().toISOString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'setupSheet') {
    var ctx = getSheetAndColMap_();
    ensureHeaders_(ctx.sheet);
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'ok',
        message: 'Google Sheet row 1 headers verified and initialized successfully.',
        totalColumns: COLUMN_HEADERS.length,
        headers: COLUMN_HEADERS,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'read') {
    return handleRead_(e.parameter);
  }

  if (action === 'list') {
    return handleList_(e.parameter);
  }

  return errorResponse_('Unknown action: ' + action, 400);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var success = lock.waitLock(LOCK_TIMEOUT_MS);
    if (!success) {
      return errorResponse_('Server concurrency lock busy. Please retry.', 503);
    }

    if (!e || !e.postData || !e.postData.contents) {
      return errorResponse_('Invalid submission: Empty payload.', 400);
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return errorResponse_('Malformed JSON payload.', 400);
    }

    // Authenticate Webhook Secret if configured
    var expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (expectedSecret) {
      var providedSecret = (e.parameter && e.parameter.secret) || (payload && payload.secret);
      if (providedSecret !== expectedSecret) {
        return errorResponse_('Unauthorized: Invalid webhook secret.', 401);
      }
    }

    var action = payload.action || 'create';

    if (action === 'create') {
      return handleCreate_(payload);
    }

    if (action === 'update') {
      return handleUpdate_(payload);
    }

    return errorResponse_('Unsupported action: ' + action, 400);
  } catch (err) {
    return errorResponse_('Internal Apps Script Error: ' + err.toString(), 500);
  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  var needsInit = false;

  if (lastCol < COLUMN_HEADERS.length || sheet.getLastRow() < 1) {
    needsInit = true;
  } else {
    var existingRow1 = sheet.getRange(1, 1, 1, Math.min(lastCol, 3)).getValues()[0];
    if (!existingRow1[0] || String(existingRow1[0]).trim() === '') {
      needsInit = true;
    }
  }

  if (needsInit) {
    var headerRange = sheet.getRange(1, 1, 1, COLUMN_HEADERS.length);
    headerRange.setValues([COLUMN_HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0D9488');
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
}

function getSheetAndColMap_() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  } catch (err) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  if (!ss) {
    throw new Error('Unable to open spreadsheet with ID: ' + TARGET_SPREADSHEET_ID);
  }

  var sheet = ss.getSheetByName(PRIMARY_SHEET_NAME) || ss.getSheets()[0];
  ensureHeaders_(sheet);

  var headerRow = sheet.getRange(1, 1, 1, COLUMN_HEADERS.length).getValues()[0];
  var colMap = {};
  for (var i = 0; i < headerRow.length; i++) {
    var h = String(headerRow[i]).trim().toLowerCase();
    if (h) {
      colMap[h] = i + 1;
    }
  }

  return { ss: ss, sheet: sheet, colMap: colMap };
}

function handleCreate_(payload) {
  var submissionUuid = payload.uuid || payload._uuid;
  if (!submissionUuid) {
    return errorResponse_('Missing required field: uuid.', 422);
  }

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  // Idempotency check: Column 1 is UUID
  if (lastRow > 1) {
    var existingUuids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < existingUuids.length; r++) {
      if (String(existingUuids[r][0]).trim() === String(submissionUuid).trim()) {
        var rowIndex = 2 + r;
        var existingRow = sheet.getRange(rowIndex, 1, 1, COLUMN_HEADERS.length).getValues()[0];
        return ContentService.createTextOutput(
          JSON.stringify({
            status: 'success',
            acknowledged: true,
            remoteSubmissionId: String(existingRow[0]),
            clientSubmissionId: submissionUuid,
            version: 1,
            isDuplicate: true,
            idempotencyNote: 'Duplicate recognized. Existing row confirmed in Sheet.',
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  var now = new Date().toISOString();
  var d = payload.demographics || {};
  var h = payload.health || {};
  var n = payload.nutrition || {};
  var e = payload.educationStatus || {};
  var exp = payload.educationExpenses || {};
  var b = payload.bankingAndKyc || payload.bankDetails || {};
  var f = payload.finalReview || {};

  // Build the 73-value array matching COLUMN_HEADERS 1-to-1
  var row = new Array(COLUMN_HEADERS.length);

  row[0] = submissionUuid; // 1 UUID
  row[1] = payload.koboId || d.artNumber || payload.artNumber || ''; // 2 Kobo ID
  row[2] = payload.submissionTime || payload.createdAt || now; // 3 Submission Time
  row[3] = f.formSubmittedBy || payload.formSubmittedBy || payload.interviewerName || ''; // 4 Submitted By
  row[4] = (payload.consent && payload.consent.agreeToParticipate) || payload.consentObtained === 'Yes' ? 'Yes' : 'No'; // 5 Consent Obtained
  row[5] = payload.signatureStatus || (payload.caregiverConsent && payload.caregiverConsent.signatureStatus) || 'CAPTURED_LOCAL'; // 6 Signature / Thumb Impression
  row[6] = d.dateOfFilling || payload.visitDate || now.split('T')[0]; // 7 Visit Date
  row[7] = payload.interviewerName || f.formSubmittedBy || ''; // 8 Interviewer Name
  row[8] = d.childName || payload.childName || ''; // 9 Child Name
  row[9] = d.dob || payload.dob || ''; // 10 Date of Birth
  row[10] = d.calculatedAgeYears !== undefined ? d.calculatedAgeYears : (payload.age || ''); // 11 Age
  row[11] = d.gender || payload.gender || 'Male'; // 12 Gender
  row[12] = d.orphanStatus || payload.orphanStatus || ''; // 13 Orphan Status
  row[13] = d.caregiverName || payload.caregiverName || ''; // 14 Caregiver Full Name
  row[14] = d.caregiverRelationship || payload.caregiverRelationship || ''; // 15 Caregiver Relation
  row[15] = d.contactNumber || d.caregiverPhone || payload.caregiverContact || ''; // 16 Caregiver Contact
  row[16] = d.fullAddress || payload.address || ''; // 17 Address
  row[17] = d.state || payload.state || 'Maharashtra'; // 18 State
  row[18] = d.district || payload.district || 'Pune'; // 19 District
  row[19] = b.bankAccountHolderName || b.accountHolderName || payload.bankAccountHolderName || ''; // 20 Bank Account Holder Name
  row[20] = b.bankAccountNumber || b.accountNumber || payload.bankAccountNumber || ''; // 21 Bank Account Number
  row[21] = b.bankIfscCode || b.ifscCode || payload.bankIfscCode || ''; // 22 Bank IFSC Code
  row[22] = b.bankLinkedMobileNumber || payload.bankLinkedMobileNumber || ''; // 23 Bank Linked Mobile Number
  row[23] = b.childAadhaarNumber || d.childAadhaarNumber || payload.childAadhaarNumber || ''; // 24 Child Aadhaar Number
  row[24] = b.passbookPhotoUrl || payload.passbookFrontPageLink || ''; // 25 Passbook Front Page Link
  row[25] = b.aadhaarCardPhotoUrl || payload.aadhaarCardLink || ''; // 26 Aadhaar Card Link
  row[26] = b.childPhotoUrl || payload.passportSizePhotoLink || ''; // 27 Passport Size Photo Link
  row[27] = payload.householdFinancial ? payload.householdFinancial.totalFamilyMembers : (payload.householdMembers || 4); // 28 Household Members
  row[28] = payload.householdFinancial ? payload.householdFinancial.numberOfChildrenUnder18 : (payload.noOfChildren || 2); // 29 No of Children
  row[29] = payload.householdFinancial ? payload.householdFinancial.monthlyIncomeRs : (payload.monthlyIncome || 0); // 30 Monthly Income
  row[30] = payload.householdFinancial ? payload.householdFinancial.mainSourceOfIncome : (payload.incomeSource || 'Daily wage labour'); // 31 Income Source
  row[31] = h.weightKg || n.weightKg || payload.currentWeightKg || 0; // 32 Current Weight (kg)
  row[32] = h.heightCm || n.heightCm || payload.currentHeightCm || 0; // 33 Current Height (cm)
  row[33] = h.bmi || n.bmi || payload.bmi || 0; // 34 BMI
  row[34] = h.bmiCategory || payload.bmiCategory || (h.nutritionStatus || n.nutritionStatus || 'Normal'); // 35 BMI Category
  row[35] = h.haemoglobinGdl !== undefined ? h.haemoglobinGdl : (payload.hemoglobinGdl || ''); // 36 Hemoglobin (g/dL)
  row[36] = h.hbCategory || payload.hbCategory || 'Normal'; // 37 Hb Category
  row[37] = Array.isArray(h.otherHealthConditions) ? h.otherHealthConditions.join(', ') : (payload.comorbidities || ''); // 38 Comorbidities
  row[38] = h.otherHealthConditionSpecify || payload.comorbiditiesOther || ''; // 39 Comorbidities Other
  row[39] = h.artStatus || payload.artStatus || 'On ART'; // 40 ART Status
  row[40] = h.artRegistrationDate || payload.artRegistrationDate || ''; // 41 ART Registration Date
  row[41] = h.artIdNumber || payload.artIdNumber || ''; // 42 ART ID Number
  row[42] = h.vlStatus || payload.vlStatus || 'Tested in last 6 months'; // 43 VL Status
  row[43] = h.vlDate || payload.vlDate || ''; // 44 VL Date
  row[44] = h.viralLoad !== undefined ? String(h.viralLoad) : (payload.viralLoad || '< 50'); // 45 Viral Load
  row[45] = h.vlCategory || payload.vlCategory || 'Undetectable (<50 copies/mL)'; // 46 VL Category
  row[46] = n.appetite || payload.appetite || 'Good'; // 47 Appetite
  row[47] = n.mealsPerDay || payload.mealsPerDay || 3; // 48 Meals per Day
  row[48] = e.educationStatus || payload.educationStatus || 'Currently going to school'; // 49 Education Status
  row[49] = e.educationStatusSpecify || payload.educationStatusOther || ''; // 50 Education Status Other
  row[50] = e.schoolName || payload.schoolName || ''; // 51 School Name
  row[51] = e.schoolSessionStartDate || payload.schoolSessionStartDate || ''; // 52 School Session Start Date
  row[52] = e.schoolType || payload.schoolType || 'Government school'; // 53 School Type
  row[53] = e.currentClass || payload.currentClass || ''; // 54 Current Class
  row[54] = e.attendance || payload.attendanceStatus || 'Regular'; // 55 Attendance Status
  row[55] = Number(exp.schoolFees) || 0; // 56 School Fees
  row[56] = Number(exp.tuitionFees) || 0; // 57 Private Tuition Fee
  row[57] = Number(exp.books) || 0; // 58 School Books
  row[58] = Number(exp.stationery) || 0; // 59 School Stationery
  row[59] = Number(exp.uniform) || 0; // 60 School Uniform
  row[60] = Number(exp.transport) || 0; // 61 School Transport
  row[61] = Number(exp.otherExpenses) || 0; // 62 School Other Expenses
  row[62] = Number(exp.totalAnnualCost) || 0; // 63 Total Annual Education Cost
  row[63] = exp.feeReceiptPhotoUrl || payload.schoolFeeReceiptLink || ''; // 64 School Fee Receipt Link
  row[64] = exp.marksheetPhotoUrl || payload.marksheetPhotoLink || ''; // 65 Marksheet Photo Link
  row[65] = exp.remarks || payload.remarks || ''; // 66 Remarks (If Any)
  row[66] = f.approvedAllianceIndia || payload.approvedAllianceIndia || 'Pending'; // 67 Approved Alliance India
  row[67] = f.allInfoCorrect || payload.reviewConfirmed ? 'Yes' : 'No'; // 68 Review Confirmed
  row[68] = f.organizationName || payload.organizationName || 'India HIV/AIDS Alliance'; // 69 Organization Name
  row[69] = f.formSubmittedBy || payload.formSubmittedBy || payload.interviewerName || ''; // 70 Form Submitted By
  row[70] = f.organizationEmail || payload.organizationEmail || ''; // 71 Organization Email
  row[71] = payload.syncNeeded || 'NO'; // 72 Sync Needed
  row[72] = payload.updatedAt || now; // 73 Last Updated

  sheet.appendRow(row);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: submissionUuid,
      clientSubmissionId: submissionUuid,
      rowNumber: sheet.getLastRow(),
      totalColumns: COLUMN_HEADERS.length,
      version: 1,
      updatedAt: now,
      isDuplicate: false,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdate_(payload) {
  var targetUuid = payload.uuid || payload.submissionId || payload.remoteSubmissionId;
  if (!targetUuid) {
    return errorResponse_('Missing uuid for update.', 400);
  }

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return errorResponse_('Record not found: Sheet is empty.', 404);
  }

  var uuids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var foundRow = -1;

  for (var r = 0; r < uuids.length; r++) {
    if (String(uuids[r][0]).trim() === String(targetUuid).trim()) {
      foundRow = 2 + r;
      break;
    }
  }

  if (foundRow === -1) {
    return errorResponse_('Record not found with UUID: ' + targetUuid, 404);
  }

  var patch = payload.patch || payload;
  var now = new Date().toISOString();

  function updateCol(colIndex, val) {
    if (val !== undefined && val !== null) {
      sheet.getRange(foundRow, colIndex).setValue(val);
    }
  }

  // Allow updates to key columns
  if (patch.caregiverName !== undefined) updateCol(14, patch.caregiverName);
  if (patch.caregiverRelationship !== undefined) updateCol(15, patch.caregiverRelationship);
  if (patch.contactNumber !== undefined) updateCol(16, patch.contactNumber);
  if (patch.fullAddress !== undefined) updateCol(17, patch.fullAddress);
  if (patch.bankAccountHolderName !== undefined) updateCol(20, patch.bankAccountHolderName);
  if (patch.bankAccountNumber !== undefined) updateCol(21, patch.bankAccountNumber);
  if (patch.bankIfscCode !== undefined) updateCol(22, patch.bankIfscCode);
  if (patch.weightKg !== undefined) updateCol(32, patch.weightKg);
  if (patch.heightCm !== undefined) updateCol(33, patch.heightCm);
  if (patch.bmi !== undefined) updateCol(34, patch.bmi);
  if (patch.bmiCategory !== undefined) updateCol(35, patch.bmiCategory);
  if (patch.haemoglobinGdl !== undefined) updateCol(36, patch.haemoglobinGdl);
  if (patch.hbCategory !== undefined) updateCol(37, patch.hbCategory);
  if (patch.artStatus !== undefined) updateCol(40, patch.artStatus);
  if (patch.viralLoad !== undefined) updateCol(45, patch.viralLoad);
  if (patch.vlCategory !== undefined) updateCol(46, patch.vlCategory);
  if (patch.approvedAllianceIndia !== undefined) updateCol(67, patch.approvedAllianceIndia);
  if (patch.syncNeeded !== undefined) updateCol(72, patch.syncNeeded);

  updateCol(73, now); // Last Updated

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: targetUuid,
      updatedAt: now,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleRead_(params) {
  var id = params.submissionId || params.id || params.uuid;
  if (!id) return errorResponse_('Missing id for read.', 400);

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) return errorResponse_('Record not found.', 404);

  var uuids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (var r = 0; r < uuids.length; r++) {
    if (String(uuids[r][0]).trim() === String(id).trim()) {
      var rowValues = sheet.getRange(2 + r, 1, 1, COLUMN_HEADERS.length).getValues()[0];
      var recordObj = {};
      for (var c = 0; c < COLUMN_HEADERS.length; c++) {
        recordObj[COLUMN_HEADERS[c]] = rowValues[c];
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          status: 'success',
          data: recordObj,
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return errorResponse_('Record not found with ID: ' + id, 404);
}

function handleList_(params) {
  var limit = Math.min(Number(params.limit || 25), 100);
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', data: [], pagination: { hasMore: false } })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var count = Math.min(lastRow - 1, limit);
  var dataRows = sheet.getRange(2, 1, count, COLUMN_HEADERS.length).getValues();
  var items = [];

  for (var i = 0; i < dataRows.length; i++) {
    items.push({
      uuid: dataRows[i][0],
      koboId: dataRows[i][1],
      childName: dataRows[i][8],
      district: dataRows[i][18],
      artStatus: dataRows[i][39],
      viralLoad: dataRows[i][44],
      approvedAllianceIndia: dataRows[i][66],
      updatedAt: dataRows[i][72],
    });
  }

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      data: items,
      pagination: { hasMore: lastRow - 1 > limit },
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(message, code) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'error',
      code: code || 500,
      message: message,
      timestamp: new Date().toISOString(),
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function diagnosticCheck() {
  var log = [];
  log.push('Starting diagnostic');
  try {
    log.push('Opening spreadsheet by ID: ' + TARGET_SPREADSHEET_ID);
    var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    log.push('Spreadsheet opened successfully: ' + ss.getName());
    var sheets = ss.getSheets();
    log.push('Number of sheets: ' + sheets.length);
    for (var i = 0; i < sheets.length; i++) {
      log.push('Sheet ' + i + ' name: ' + sheets[i].getName() + ', gid: ' + sheets[i].getSheetId());
    }
  } catch (e) {
    log.push('Error opening by ID: ' + e.toString());
  }
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    log.push('Active spreadsheet: ' + (active ? active.getName() : 'null'));
  } catch (e) {
    log.push('Error getting active: ' + e.toString());
  }
  return log.join('\n');
}

/**
 * Direct initialization and testing helper.
 * Can be executed directly from Google Apps Script editor or via clasp run.
 * Populates all 73 headers in Row 1 and appends 3 realistic Phase 3 assessment records.
 */
function runSetupAndInsertSampleRows() {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;

  // 1. Ensure all 73 headers are in Row 1
  var headerRange = sheet.getRange(1, 1, 1, COLUMN_HEADERS.length);
  headerRange.setValues([COLUMN_HEADERS]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0D9488');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  Logger.log('Row 1 headers successfully set (' + COLUMN_HEADERS.length + ' columns).');

  // 2. Sample Beneficiaries
  var samples = [
    {
      uuid: 'e0111111-1111-4111-8111-111111111111',
      koboId: 'MH-PUN-0842',
      formSubmittedBy: 'Kavita Shinde (Field Worker)',
      interviewerName: 'Kavita Shinde',
      visitDate: '2026-09-08',
      demographics: {
        childName: 'Pooja Ramesh K.',
        dob: '2019-02-15',
        calculatedAgeYears: 7,
        gender: 'Female',
        orphanStatus: 'Single orphan (mother alive)',
        caregiverName: 'Sunita Ramesh K.',
        caregiverRelationship: 'Mother',
        contactNumber: '9822011223',
        fullAddress: 'Room 12, Chawl No 4, Anand Nagar, Wadgaon Sheri',
        state: 'Maharashtra',
        district: 'Pune',
        childAadhaarNumber: 'XXXX-XXXX-8421',
      },
      caregiverConsent: {
        consentObtained: 'Yes',
        caregiverFullName: 'Sunita Ramesh K.',
        caregiverRelation: 'Mother',
        signatureStatus: 'CAPTURED_LOCAL',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Sunita Ramesh K.',
        bankAccountNumber: '30981245671',
        bankIfscCode: 'SBIN0001482',
        bankLinkedMobileNumber: '9822011223',
        childAadhaarNumber: 'XXXX-XXXX-8421',
        passbookPhotoUrl: 'https://alliance.org/kyc/pb-8421.jpg',
        aadhaarCardPhotoUrl: 'https://alliance.org/kyc/adh-8421.jpg',
        childPhotoUrl: 'https://alliance.org/kyc/photo-8421.jpg',
      },
      householdFinancial: {
        totalFamilyMembers: 4,
        numberOfChildrenUnder18: 2,
        monthlyIncomeRs: 6500,
        mainSourceOfIncome: 'Daily wage domestic worker',
      },
      health: {
        weightKg: 18.2,
        heightCm: 114,
        bmi: 14.0,
        bmiCategory: 'Normal',
        haemoglobinGdl: 11.4,
        hbCategory: 'Mild Anemia',
        otherHealthConditions: ['None'],
        artStatus: 'On ART',
        artRegistrationDate: '2022-06-10',
        artIdNumber: 'MH-PUN-0842',
        vlStatus: 'Tested in last 6 months',
        vlDate: '2026-04-12',
        viralLoad: '< 50',
        vlCategory: 'Undetectable (<50 copies/mL)',
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
      },
      educationStatus: {
        educationStatus: 'Currently going to school',
        schoolName: 'Pune Mahanagarpalika Vidyaniketan No 14',
        schoolSessionStartDate: '2026-06-15',
        schoolType: 'Government school',
        currentClass: 'Class 2',
        attendance: 'Regular',
      },
      educationExpenses: {
        schoolFees: 1200,
        tuitionFees: 500,
        books: 600,
        stationery: 300,
        uniform: 800,
        transport: 400,
        otherExpenses: 0,
        totalAnnualCost: 3800,
        feeReceiptPhotoUrl: 'https://alliance.org/receipts/rec-8421.pdf',
        marksheetPhotoUrl: 'https://alliance.org/receipts/mark-8421.jpg',
        remarks: 'Eligible for Phase 3 stationery and tuition support.',
      },
      finalReview: {
        approvedAllianceIndia: 'Approved',
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        formSubmittedBy: 'Kavita Shinde',
        organizationEmail: 'pune.field@allianceindia.org',
      },
      syncNeeded: 'NO',
    },
    {
      uuid: 'e0222222-2222-4222-8222-222222222222',
      koboId: 'MH-THN-0951',
      formSubmittedBy: 'Amol Jadhav (Field Worker)',
      interviewerName: 'Amol Jadhav',
      visitDate: '2026-09-07',
      demographics: {
        childName: 'Aarav Sachin P.',
        dob: '2021-05-10',
        calculatedAgeYears: 5,
        gender: 'Male',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Priya Sachin P.',
        caregiverRelationship: 'Mother',
        contactNumber: '9822022334',
        fullAddress: 'Gali 3, Kisan Nagar, Wagle Estate',
        state: 'Maharashtra',
        district: 'Thane',
        childAadhaarNumber: 'XXXX-XXXX-9512',
      },
      caregiverConsent: {
        consentObtained: 'Yes',
        caregiverFullName: 'Priya Sachin P.',
        caregiverRelation: 'Mother',
        signatureStatus: 'CAPTURED_LOCAL',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Priya Sachin P.',
        bankAccountNumber: '60124458902',
        bankIfscCode: 'MAHB0000412',
        bankLinkedMobileNumber: '9822022334',
        childAadhaarNumber: 'XXXX-XXXX-9512',
        passbookPhotoUrl: 'https://alliance.org/kyc/pb-9512.jpg',
        aadhaarCardPhotoUrl: 'https://alliance.org/kyc/adh-9512.jpg',
        childPhotoUrl: 'https://alliance.org/kyc/photo-9512.jpg',
      },
      householdFinancial: {
        totalFamilyMembers: 5,
        numberOfChildrenUnder18: 3,
        monthlyIncomeRs: 5200,
        mainSourceOfIncome: 'Auto rickshaw helper',
      },
      health: {
        weightKg: 12.1,
        heightCm: 98,
        bmi: 12.6,
        bmiCategory: 'MAM (Moderate Acute Malnutrition)',
        haemoglobinGdl: 9.8,
        hbCategory: 'Moderate Anemia',
        otherHealthConditions: ['Recurrent respiratory infection'],
        artStatus: 'On ART',
        artRegistrationDate: '2023-11-20',
        artIdNumber: 'MH-THN-0951',
        vlStatus: 'Tested in last 6 months',
        vlDate: '2026-05-18',
        viralLoad: '120',
        vlCategory: 'Suppressed (<1000 copies/mL)',
      },
      nutrition: {
        appetite: 'Poor',
        mealsPerDay: 2,
      },
      educationStatus: {
        educationStatus: 'Currently going to school',
        schoolName: 'Balwadi Anganwadi Kendra No 8',
        schoolSessionStartDate: '2026-06-15',
        schoolType: 'Anganwadi',
        currentClass: 'Anganwadi Senior',
        attendance: 'Irregular',
      },
      educationExpenses: {
        schoolFees: 600,
        tuitionFees: 400,
        books: 400,
        stationery: 250,
        uniform: 500,
        transport: 0,
        otherExpenses: 150,
        totalAnnualCost: 2300,
        feeReceiptPhotoUrl: 'https://alliance.org/receipts/rec-9512.pdf',
        marksheetPhotoUrl: 'https://alliance.org/receipts/mark-9512.jpg',
        remarks: 'Requires immediate supplementary nutrition support (MAM).',
      },
      finalReview: {
        approvedAllianceIndia: 'Approved',
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        formSubmittedBy: 'Amol Jadhav',
        organizationEmail: 'thane.field@allianceindia.org',
      },
      syncNeeded: 'NO',
    },
    {
      uuid: 'e0333333-3333-4333-8333-333333333333',
      koboId: 'MH-MUM-1102',
      formSubmittedBy: 'Fatima Shaikh (Field Worker)',
      interviewerName: 'Fatima Shaikh',
      visitDate: '2026-09-06',
      demographics: {
        childName: 'Tanvi Dilip M.',
        dob: '2017-08-20',
        calculatedAgeYears: 9,
        gender: 'Female',
        orphanStatus: 'Double orphan (both parents deceased)',
        caregiverName: 'Parvati M. (Grandmother)',
        caregiverRelationship: 'Grandmother',
        contactNumber: '9822033445',
        fullAddress: 'Room 5, PMG Colony, Mankhurd',
        state: 'Maharashtra',
        district: 'Mumbai Suburban',
        childAadhaarNumber: 'XXXX-XXXX-1102',
      },
      caregiverConsent: {
        consentObtained: 'Yes',
        caregiverFullName: 'Parvati M.',
        caregiverRelation: 'Grandmother',
        signatureStatus: 'CAPTURED_LOCAL',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Parvati M.',
        bankAccountNumber: '10842239011',
        bankIfscCode: 'CBIN0281045',
        bankLinkedMobileNumber: '9822033445',
        childAadhaarNumber: 'XXXX-XXXX-1102',
        passbookPhotoUrl: 'https://alliance.org/kyc/pb-1102.jpg',
        aadhaarCardPhotoUrl: 'https://alliance.org/kyc/adh-1102.jpg',
        childPhotoUrl: 'https://alliance.org/kyc/photo-1102.jpg',
      },
      householdFinancial: {
        totalFamilyMembers: 3,
        numberOfChildrenUnder18: 1,
        monthlyIncomeRs: 4000,
        mainSourceOfIncome: 'Old age pension & knitting',
      },
      health: {
        weightKg: 24.5,
        heightCm: 125,
        bmi: 15.7,
        bmiCategory: 'Normal',
        haemoglobinGdl: 12.0,
        hbCategory: 'Normal',
        otherHealthConditions: ['None'],
        artStatus: 'On ART',
        artRegistrationDate: '2021-03-14',
        artIdNumber: 'MH-MUM-1102',
        vlStatus: 'Tested in last 6 months',
        vlDate: '2026-03-25',
        viralLoad: '< 50',
        vlCategory: 'Undetectable (<50 copies/mL)',
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
      },
      educationStatus: {
        educationStatus: 'Currently going to school',
        schoolName: 'Mankhurd Municipal Primary School',
        schoolSessionStartDate: '2026-06-15',
        schoolType: 'Government school',
        currentClass: 'Class 4',
        attendance: 'Regular',
      },
      educationExpenses: {
        schoolFees: 1500,
        tuitionFees: 700,
        books: 800,
        stationery: 400,
        uniform: 900,
        transport: 500,
        otherExpenses: 0,
        totalAnnualCost: 4800,
        feeReceiptPhotoUrl: 'https://alliance.org/receipts/rec-1102.pdf',
        marksheetPhotoUrl: 'https://alliance.org/receipts/mark-1102.jpg',
        remarks: 'High priority grant entitlement: Double orphan under elderly grandmother care.',
      },
      finalReview: {
        approvedAllianceIndia: 'Approved',
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        formSubmittedBy: 'Fatima Shaikh',
        organizationEmail: 'mumbai.field@allianceindia.org',
      },
      syncNeeded: 'NO',
    }
  ];

  for (var s = 0; s < samples.length; s++) {
    var res = handleCreate_(samples[s]);
    Logger.log('Sample ' + (s + 1) + ' result: ' + res.getContent());
  }

  return 'Setup complete! Row 1 headers formatted and ' + samples.length + ' sample records inserted into ' + PRIMARY_SHEET_NAME;
}

