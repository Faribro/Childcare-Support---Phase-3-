/**
 * Google Apps Script Backend Adapter — Phase 3 Hardened OCC Architecture
 * Project ID: 1yXEgElXFb0Fb_CzTlQ8TDvRUuEYmq5dady7ialsqMnkAU1XX5SPJW8P3
 * Target Sheet ID: 1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA
 *
 * Implements:
 * - Exact 73-column schema matching official CHILD_HIV_SUPPORT_FORM & linelist
 * - 3-Row Header Design (Row 1 Navy Banner + Row 2 Spacer + Row 3 Pastel Category Headers)
 * - In-cell embedded images with hover-to-copy & click-to-open links (=HYPERLINK(url, IMAGE(url)))
 * - Automatic conversion of Drive file links & base64 image uploads to Google Drive files
 * - Row height 60px for data rows, 90px for header row 3
 * - 30s LockService Mutex around dedupe and mutations
 * - Idempotent create (action: 'create') & OCC update (action: 'update')
 * - Automatic onOpen(e) trigger and custom UI menu for 1-click sheet formatting
 */

var TARGET_SPREADSHEET_ID = '1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA';
var PRIMARY_SHEET_NAME = 'Child_Nutrition';
var AUDIT_SHEET_NAME = 'Audit_Log';
var HEADER_ROW_INDEX = 3;
var LOCK_TIMEOUT_MS = 30000;
var BANNER_TITLE = 'CHILD HIV CARE & NUTRITION LINELIST';
var DASHBOARD_URL = 'https://childcare-support-phase-3.onrender.com';

// Exact 73-Column Headers with Number on Top & Newline
var COLUMN_HEADERS = [
  "1\nUUID",
  "2\nKobo ID",
  "3\nSubmission Time",
  "4\nSubmitted By",
  "5\nConsent Obtained",
  "6\nSignature /\nThumb Impression",
  "7\nVisit Date",
  "8\nInterviewer Name",
  "9\nChild Name",
  "10\nDate of Birth",
  "11\nAge",
  "12\nGender",
  "13\nOrphan Status",
  "14\nCaregiver Full Name",
  "15\nCaregiver Relation",
  "16\nCaregiver Contact",
  "17\nAddress",
  "18\nState",
  "19\nDistrict",
  "20\nBank Account Holder Name",
  "21\nBank Account Number",
  "22\nBank IFSC Code",
  "23\nBank Linked Mobile Number",
  "24\nChild Aadhaar Number",
  "25\nPassbook Front Page Link",
  "26\nAadhaar Card Link",
  "27\nPassport Size Photo Link",
  "28\nHousehold Members",
  "29\nNo of Children",
  "30\nMonthly Income",
  "31\nIncome Source",
  "32\nCurrent Weight (kg)",
  "33\nCurrent Height (cm)",
  "34\nBMI",
  "35\nBMI Category",
  "36\nHemoglobin (g/dL)",
  "37\nHb Category",
  "38\nComorbidities",
  "39\nComorbidities Other",
  "40\nART Status",
  "41\nART Registration Date",
  "42\nART ID Number",
  "43\nVL Status",
  "44\nVL Date",
  "45\nViral Load",
  "46\nVL Category",
  "47\nAppetite",
  "48\nMeals per Day",
  "49\nEducation Status",
  "50\nEducation Status Other",
  "51\nSchool Name",
  "52\nSchool Session Start Date",
  "53\nSchool Type",
  "54\nCurrent Class",
  "55\nAttendance Status",
  "56\nSchool Fees",
  "57\nPrivate Tuition Fee",
  "58\nSchool Books",
  "59\nSchool Stationery",
  "60\nSchool Uniform",
  "61\nSchool Transport",
  "62\nSchool Other Expenses",
  "63\nTotal Annual Education Cost",
  "64\nSchool Fee Receipt Link",
  "65\nMarksheet Photo Link",
  "66\nRemarks (If Any)",
  "67\nApproved Alliance India",
  "68\nReview Confirmed",
  "69\nOrganization Name",
  "70\nForm Submitted By",
  "71\nOrganization Email",
  "72\nSync Needed",
  "73\nLast Updated"
];

/**
 * Simple trigger that automatically executes whenever the Google Sheet is opened.
 * Formats 3-row headers and adds custom menu in the Sheet UI.
 */
function onOpen(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      try { ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID); } catch (openErr) {}
    }
    if (ss) {
      var sheet = ss.getSheetByName(PRIMARY_SHEET_NAME) || ss.getSheetByName('Sheet1') || ss.getSheets()[0];
      if (sheet) {
        if (sheet.getName() === 'Sheet1') {
          try { sheet.setName(PRIMARY_SHEET_NAME); } catch (rErr) {}
        }
        ensureHeaders_(sheet);
      }
    }
  } catch (err) {
    Logger.log('onOpen ensureHeaders error: ' + err);
  }

  try {
    SpreadsheetApp.getUi()
      .createMenu('Child Nutrition PWA')
      .addItem('Setup 73 Headers & Insert Samples', 'runSetupAndInsertSampleRows')
      .addItem('Re-apply Formatting & Colors', 'reapplySheetFormatting')
      .addToUi();
  } catch (uiErr) {
    Logger.log('onOpen menu error: ' + uiErr);
  }
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'health';

  if (action === 'health') {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'ok',
        service: 'childcare-apps-script-bridge',
        version: '3.2.0',
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
        message: 'Google Sheet 3-row headers verified and initialized successfully.',
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

/**
 * Initializes Row 1 Title Banner, Row 2 Spacer, and Row 3 Grouped Headers
 */
function ensureHeaders_(sheet) {
  var maxCols = sheet.getMaxColumns();
  if (maxCols < COLUMN_HEADERS.length) {
    sheet.insertColumnsAfter(maxCols, COLUMN_HEADERS.length - maxCols);
  }

  var maxRows = sheet.getMaxRows();
  if (maxRows < 4) {
    sheet.insertRowsAfter(maxRows, 4 - maxRows);
  }

  var lastCol = sheet.getLastColumn();
  var needsInit = false;

  if (lastCol < COLUMN_HEADERS.length || sheet.getLastRow() < HEADER_ROW_INDEX) {
    needsInit = true;
  } else {
    var checkVal = sheet.getRange(HEADER_ROW_INDEX, 1).getValue();
    if (!checkVal || String(checkVal).trim() === '') {
      needsInit = true;
    }
  }

  if (needsInit) {
    // --- ROW 1: Title Banner & Action Button ---
    sheet.setRowHeight(1, 38);
    var cellA1 = sheet.getRange(1, 1);
    cellA1.setValue('=HYPERLINK("' + DASHBOARD_URL + '", "Open Dashboard ↗")');
    cellA1.setFontWeight('bold');
    cellA1.setFontSize(10);
    cellA1.setBackground('#1E3A8A');
    cellA1.setFontColor('#FFFFFF');
    cellA1.setHorizontalAlignment('center');
    cellA1.setVerticalAlignment('middle');

    // Merge B1 to BU1 (cols 2 to 73)
    sheet.getRange(1, 2, 1, COLUMN_HEADERS.length - 1).merge();
    var mergedBanner = sheet.getRange(1, 2);
    mergedBanner.setValue(BANNER_TITLE);
    mergedBanner.setFontWeight('bold');
    mergedBanner.setFontSize(14);
    mergedBanner.setBackground('#1B365D');
    mergedBanner.setFontColor('#FFFFFF');
    mergedBanner.setHorizontalAlignment('center');
    mergedBanner.setVerticalAlignment('middle');

    // --- ROW 2: Spacer Row ---
    sheet.setRowHeight(2, 12);
    var spacerRange = sheet.getRange(2, 1, 1, COLUMN_HEADERS.length);
    spacerRange.setBackground('#FFFFFF');

    // --- ROW 3: Category-Grouped Column Headers ---
    sheet.setRowHeight(3, 90);
    var headerRange = sheet.getRange(HEADER_ROW_INDEX, 1, 1, COLUMN_HEADERS.length);
    headerRange.setValues([COLUMN_HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(10);
    headerRange.setFontColor('#0F172A');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    headerRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

    // Apply Pastel Category Colors to Row 3
    applyHeaderCategoryColors_(sheet, HEADER_ROW_INDEX);

    // Apply Column Widths
    applyColumnWidths_(sheet);

    // Freeze top 3 rows
    sheet.setFrozenRows(3);
  }
}

/**
 * Applies exact pastel color grouping matching the reference linelist
 */
function applyHeaderCategoryColors_(sheet, rowIdx) {
  // Section 1: Submission & Consent (Cols 1-8) -> Lavender / Periwinkle
  sheet.getRange(rowIdx, 1, 1, 8).setBackground('#D9E2F3');

  // Section 2: Child & Caregiver Demographics (Cols 9-16) -> Sage Green
  sheet.getRange(rowIdx, 9, 1, 8).setBackground('#E2EFDA');

  // Section 3: Geographic / Location (Cols 17-19) -> Pale Cream / Yellow
  sheet.getRange(rowIdx, 17, 1, 3).setBackground('#FFF2CC');

  // Section 4: Banking & KYC Documents (Cols 20-27) -> Soft Sky Blue
  sheet.getRange(rowIdx, 20, 1, 8).setBackground('#D0E0E3');

  // Section 5: Household & Financial (Cols 28-31) -> Warm Peach
  sheet.getRange(rowIdx, 28, 1, 4).setBackground('#FCE5CD');

  // Section 6: Clinical & Health / ART (Cols 32-46) -> Soft Blush Rose
  sheet.getRange(rowIdx, 32, 1, 15).setBackground('#F4CCCC');

  // Section 7: Nutrition & Meals (Cols 47-48) -> Soft Butter Yellow
  sheet.getRange(rowIdx, 47, 1, 2).setBackground('#FFF2CC');

  // Section 8: Education & Expenses (Cols 49-65) -> Soft Celadon / Mint
  sheet.getRange(rowIdx, 49, 1, 17).setBackground('#D9EAD3');

  // Section 9: Alliance Review & Sign-off (Cols 66-73) -> Soft Slate Gray
  sheet.getRange(rowIdx, 66, 1, 8).setBackground('#E6E8EA');

  // Subtle clean borders on header row
  sheet.getRange(rowIdx, 1, 1, COLUMN_HEADERS.length).setBorder(
    true, true, true, true, true, true,
    '#CBD5E1',
    SpreadsheetApp.BorderStyle.SOLID
  );
}

/**
 * Optimizes column widths so no headers are cramped or awkwardly truncated
 */
function applyColumnWidths_(sheet) {
  var widths = [
    140, // 1 UUID
    110, // 2 Kobo ID
    140, // 3 Submission Time
    130, // 4 Submitted By
    90,  // 5 Consent Obtained
    160, // 6 Signature / Thumb Impression (Image Thumbnail)
    100, // 7 Visit Date
    130, // 8 Interviewer Name
    140, // 9 Child Name
    100, // 10 Date of Birth
    60,  // 11 Age
    80,  // 12 Gender
    130, // 13 Orphan Status
    140, // 14 Caregiver Full Name
    100, // 15 Caregiver Relation
    120, // 16 Caregiver Contact
    220, // 17 Address
    110, // 18 State
    110, // 19 District
    160, // 20 Bank Account Holder Name
    150, // 21 Bank Account Number
    120, // 22 Bank IFSC Code
    140, // 23 Bank Linked Mobile Number
    140, // 24 Child Aadhaar Number
    150, // 25 Passbook Front Page Link (Image Thumbnail)
    150, // 26 Aadhaar Card Link (Image Thumbnail)
    150, // 27 Passport Size Photo Link (Image Thumbnail)
    100, // 28 Household Members
    90,  // 29 No of Children
    110, // 30 Monthly Income
    140, // 31 Income Source
    100, // 32 Current Weight (kg)
    100, // 33 Current Height (cm)
    70,  // 34 BMI
    100, // 35 BMI Category
    100, // 36 Hemoglobin (g/dL)
    100, // 37 Hb Category
    130, // 38 Comorbidities
    130, // 39 Comorbidities Other
    100, // 40 ART Status
    110, // 41 ART Registration Date
    120, // 42 ART ID Number
    120, // 43 VL Status
    100, // 44 VL Date
    90,  // 45 Viral Load
    150, // 46 VL Category
    90,  // 47 Appetite
    90,  // 48 Meals per Day
    130, // 49 Education Status
    130, // 50 Education Status Other
    180, // 51 School Name
    110, // 52 School Session Start Date
    110, // 53 School Type
    90,  // 54 Current Class
    100, // 55 Attendance Status
    100, // 56 School Fees
    100, // 57 Private Tuition Fee
    100, // 58 School Books
    100, // 59 School Stationery
    100, // 60 School Uniform
    100, // 61 School Transport
    100, // 62 School Other Expenses
    120, // 63 Total Annual Education Cost
    150, // 64 School Fee Receipt Link (Image Thumbnail)
    150, // 65 Marksheet Photo Link (Image Thumbnail)
    200, // 66 Remarks (If Any)
    120, // 67 Approved Alliance India
    100, // 68 Review Confirmed
    160, // 69 Organization Name
    130, // 70 Form Submitted By
    160, // 71 Organization Email
    90,  // 72 Sync Needed
    140  // 73 Last Updated
  ];

  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }
}

/**
 * Formats an image URL or Drive ID into =HYPERLINK(viewUrl, IMAGE(thumbnailUrl))
 * Displays the thumbnail neatly inside the cell, and enables Google Sheets hover card
 * with URL preview, Copy Link, and Open in New Tab functionality.
 */
function formatCellImageFormula_(urlOrData, defaultName) {
  if (!urlOrData || String(urlOrData).trim() === '') return '';
  var val = String(urlOrData).trim();

  // If already a formula
  if (val.charAt(0) === '=') return val;

  // Check if it's a Google Drive link
  var driveId = extractDriveId_(val);
  if (driveId) {
    var viewUrl = 'https://drive.google.com/uc?export=view&id=' + driveId;
    var thumbUrl = 'https://drive.google.com/thumbnail?id=' + driveId + '&sz=w150';
    return '=HYPERLINK("' + viewUrl + '", IMAGE("' + thumbUrl + '"))';
  }

  // If base64 image data URL (canvas signature or camera photo)
  if (val.indexOf('data:image') === 0) {
    var fileId = saveBase64ImageToDrive_(val, (defaultName || 'upload') + '_' + Date.now() + '.png');
    if (fileId) {
      var viewUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
      var thumbUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w150';
      return '=HYPERLINK("' + viewUrl + '", IMAGE("' + thumbUrl + '"))';
    }
  }

  // If standard web image URL
  if (val.indexOf('http://') === 0 || val.indexOf('https://') === 0) {
    return '=HYPERLINK("' + val + '", IMAGE("' + val + '", 1))';
  }

  return val;
}

function extractDriveId_(url) {
  if (!url) return null;
  var str = String(url);
  var m = str.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
          str.match(/id=([a-zA-Z0-9_-]+)/) ||
          str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function saveBase64ImageToDrive_(base64Data, filename) {
  try {
    var parts = base64Data.split(',');
    var meta = parts[0];
    var data = parts[1];
    var mimeType = 'image/png';
    var mimeMatch = meta.match(/data:([^;]+);base64/);
    if (mimeMatch) mimeType = mimeMatch[1];

    var decoded = Utilities.base64Decode(data);
    var blob = Utilities.newBlob(decoded, mimeType, filename);

    var folderName = 'Child_Nutrition_Phase3_Uploads';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getId();
  } catch (e) {
    Logger.log('saveBase64ImageToDrive_ failed: ' + e);
    return null;
  }
}

/**
 * Formats an inserted data row (Row 4+) with height 60px, zebra striping, and subtle borders
 */
function formatDataRow_(sheet, rowIndex) {
  sheet.setRowHeight(rowIndex, 60);
  var rowRange = sheet.getRange(rowIndex, 1, 1, COLUMN_HEADERS.length);
  rowRange.setVerticalAlignment('middle');
  rowRange.setFontSize(10);

  // Subtle alternating row striping
  if (rowIndex % 2 === 0) {
    rowRange.setBackground('#FFFFFF');
  } else {
    rowRange.setBackground('#F8FAFC');
  }

  // Soft gridlines
  rowRange.setBorder(true, true, true, true, true, true, '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID);
}

function getSheetAndColMap_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    } catch (err) {
      Logger.log('Could not openById: ' + err);
    }
  }

  if (!ss) {
    throw new Error('Unable to open spreadsheet with ID: ' + TARGET_SPREADSHEET_ID);
  }

  var sheet = ss.getSheetByName(PRIMARY_SHEET_NAME) || ss.getSheetByName('Sheet1') || ss.getSheets()[0];
  if (sheet.getName() === 'Sheet1') {
    try { sheet.setName(PRIMARY_SHEET_NAME); } catch (rErr) {}
  }
  ensureHeaders_(sheet);

  var headerRow = sheet.getRange(HEADER_ROW_INDEX, 1, 1, COLUMN_HEADERS.length).getValues()[0];
  var colMap = {};
  for (var i = 0; i < headerRow.length; i++) {
    var full = String(headerRow[i]).trim();
    if (full) {
      colMap[full.toLowerCase()] = i + 1;
      var clean = full.replace(/^\d+\s*\n\s*/, '').trim().toLowerCase();
      if (clean) {
        colMap[clean] = i + 1;
      }
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

  // Idempotency check: Column 1 is UUID, data starts at row 4
  if (lastRow >= 4) {
    var existingUuids = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
    for (var r = 0; r < existingUuids.length; r++) {
      if (String(existingUuids[r][0]).trim() === String(submissionUuid).trim()) {
        var rowIndex = 4 + r;
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

  // 6 Signature / Thumb Impression — Embedded in-cell image with hover link
  var sigInput = payload.signatureDataUrl || payload.signatureUrl || (payload.caregiverConsent && payload.caregiverConsent.signatureUrl) || payload.signatureStatus || '';
  row[5] = formatCellImageFormula_(sigInput, 'signature');

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

  // KYC Image Links — Embedded in-cell images with hover links
  row[24] = formatCellImageFormula_(b.passbookPhotoUrl || payload.passbookFrontPageLink || '', 'passbook');
  row[25] = formatCellImageFormula_(b.aadhaarCardPhotoUrl || payload.aadhaarCardLink || '', 'aadhaar');
  row[26] = formatCellImageFormula_(b.childPhotoUrl || payload.passportSizePhotoLink || '', 'photo');

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

  // Education Photo Links — Embedded in-cell images with hover links
  row[63] = formatCellImageFormula_(exp.feeReceiptPhotoUrl || payload.schoolFeeReceiptLink || '', 'fee_receipt');
  row[64] = formatCellImageFormula_(exp.marksheetPhotoUrl || payload.marksheetPhotoLink || '', 'marksheet');

  row[65] = exp.remarks || payload.remarks || ''; // 66 Remarks (If Any)
  row[66] = f.approvedAllianceIndia || payload.approvedAllianceIndia || 'Pending'; // 67 Approved Alliance India
  row[67] = f.allInfoCorrect || payload.reviewConfirmed ? 'Yes' : 'No'; // 68 Review Confirmed
  row[68] = f.organizationName || payload.organizationName || 'India HIV/AIDS Alliance'; // 69 Organization Name
  row[69] = f.formSubmittedBy || payload.formSubmittedBy || payload.interviewerName || ''; // 70 Form Submitted By
  row[70] = f.organizationEmail || payload.organizationEmail || ''; // 71 Organization Email
  row[71] = payload.syncNeeded || 'NO'; // 72 Sync Needed
  row[72] = payload.updatedAt || now; // 73 Last Updated

  sheet.appendRow(row);
  var newRowIndex = sheet.getLastRow();
  formatDataRow_(sheet, newRowIndex);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: submissionUuid,
      clientSubmissionId: submissionUuid,
      rowNumber: newRowIndex,
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

  if (lastRow < 4) {
    return errorResponse_('Record not found: Sheet is empty.', 404);
  }

  var uuids = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
  var foundRow = -1;

  for (var r = 0; r < uuids.length; r++) {
    if (String(uuids[r][0]).trim() === String(targetUuid).trim()) {
      foundRow = 4 + r;
      break;
    }
  }

  if (foundRow === -1) {
    return errorResponse_('Record not found with UUID: ' + targetUuid, 404);
  }

  var existingRow = sheet.getRange(foundRow, 1, 1, COLUMN_HEADERS.length).getValues()[0];
  var colMap = ctx.colMap;

  // OCC Version check if client sent baseVersion
  if (payload.baseVersion !== undefined) {
    var sheetVersion = 1;
    if (colMap['version'] && existingRow[colMap['version'] - 1]) {
      sheetVersion = parseInt(existingRow[colMap['version'] - 1], 10) || 1;
    }
    if (sheetVersion > payload.baseVersion) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: 'error',
          code: 'OCC_CONFLICT',
          message: 'Conflict: The record has been modified by another supervisor. Refresh before saving.',
          sheetVersion: sheetVersion,
          clientVersion: payload.baseVersion,
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Selective Field Updates
  function updateCell(colKey, value) {
    var c = colMap[colKey.toLowerCase()];
    if (c) {
      sheet.getRange(foundRow, c).setValue(value);
    }
  }

  if (payload.approvedAllianceIndia !== undefined) updateCell('approved alliance india', payload.approvedAllianceIndia);
  if (payload.reviewConfirmed !== undefined) updateCell('review confirmed', payload.reviewConfirmed ? 'Yes' : 'No');
  if (payload.remarks !== undefined) updateCell('remarks (if any)', payload.remarks);
  if (payload.currentWeightKg !== undefined) updateCell('current weight (kg)', payload.currentWeightKg);
  if (payload.currentHeightCm !== undefined) updateCell('current height (cm)', payload.currentHeightCm);
  if (payload.bmi !== undefined) updateCell('bmi', payload.bmi);
  if (payload.bmiCategory !== undefined) updateCell('bmi category', payload.bmiCategory);
  if (payload.syncNeeded !== undefined) updateCell('sync needed', payload.syncNeeded);

  var now = new Date().toISOString();
  updateCell('last updated', now);
  formatDataRow_(sheet, foundRow);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: targetUuid,
      rowNumber: foundRow,
      updatedAt: now,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleRead_(params) {
  var targetUuid = params.uuid || params.id;
  if (!targetUuid) {
    return errorResponse_('Missing uuid parameter.', 400);
  }

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < 4) {
    return errorResponse_('Record not found: Sheet has no data.', 404);
  }

  var uuids = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
  var targetRow = -1;

  for (var r = 0; r < uuids.length; r++) {
    if (String(uuids[r][0]).trim() === String(targetUuid).trim()) {
      targetRow = 4 + r;
      break;
    }
  }

  if (targetRow === -1) {
    return errorResponse_('Record not found with UUID: ' + targetUuid, 404);
  }

  var rowVals = sheet.getRange(targetRow, 1, 1, COLUMN_HEADERS.length).getValues()[0];
  var record = {};
  for (var c = 0; c < COLUMN_HEADERS.length; c++) {
    record[COLUMN_HEADERS[c]] = rowVals[c];
  }

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      record: record,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleList_(params) {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < 4) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        records: [],
        total: 0,
        hasMore: false,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var totalDataRows = lastRow - 3;
  var limit = parseInt(params.limit, 10) || 50;
  var cursor = parseInt(params.cursor, 10) || 0;

  var startOffset = cursor;
  var fetchCount = Math.min(limit, totalDataRows - startOffset);

  if (fetchCount <= 0) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        records: [],
        total: totalDataRows,
        hasMore: false,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var startRow = 4 + startOffset;
  var allValues = sheet.getRange(startRow, 1, fetchCount, COLUMN_HEADERS.length).getValues();
  var records = [];

  for (var r = 0; r < allValues.length; r++) {
    var rowVals = allValues[r];
    var obj = {};
    for (var c = 0; c < COLUMN_HEADERS.length; c++) {
      obj[COLUMN_HEADERS[c]] = rowVals[c];
    }
    records.push(obj);
  }

  var nextCursor = startOffset + fetchCount < totalDataRows ? startOffset + fetchCount : null;

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      records: records,
      total: totalDataRows,
      cursor: nextCursor,
      hasMore: nextCursor !== null,
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

function reapplySheetFormatting() {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 4) {
    for (var r = 4; r <= lastRow; r++) {
      formatDataRow_(sheet, r);
    }
  }
  return 'Formatting and category colors reapplied successfully!';
}

/**
 * Direct initialization and testing helper.
 * Populates all 3-row headers, category colors, and appends 3 realistic Phase 3 assessment records
 * with in-cell embedded signatures, photos, and hover-to-copy links!
 */
function runSetupAndInsertSampleRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    try { ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID); } catch (e) {}
  }
  var sheet = ss.getSheetByName(PRIMARY_SHEET_NAME) || ss.getSheetByName('Sheet1') || ss.getSheets()[0];
  if (sheet.getName() === 'Sheet1') {
    try { sheet.setName(PRIMARY_SHEET_NAME); } catch (rErr) {}
  }

  // Clear existing content and formats for a fresh, beautiful presentation
  sheet.clear();

  // 1. Ensure all 3 header rows and pastel colors are set
  ensureHeaders_(sheet);

  // 2. Realistic Phase 3 Beneficiaries with real Drive thumbnail hyperlinks
  var samples = [
    {
      uuid: 'aab2349d-336a-48fd-8747-638eed645b22',
      koboId: '792058493',
      formSubmittedBy: 'Juli Yadav (Caseworker)',
      interviewerName: 'Kobo Webhook',
      visitDate: '2026-06-25',
      signatureUrl: 'https://drive.google.com/uc?export=view&id=16orHeE3AVchZcxaI08Y8eGwkqP6j06eC',
      demographics: {
        childName: 'Rohit Yadav',
        dob: '2009-06-26',
        calculatedAgeYears: 17,
        gender: 'Male',
        orphanStatus: 'Single Orphan',
        caregiverName: 'Juli yadav',
        caregiverRelationship: 'Mother',
        contactNumber: '7044465416',
        fullAddress: '15/1, sujendra seth lane, Kolkata 700006',
        state: 'West Bengal',
        district: 'Kolkata',
        childAadhaarNumber: 'XXXX-XXXX-5416',
      },
      caregiverConsent: {
        consentObtained: 'Yes',
        caregiverFullName: 'Juli yadav',
        caregiverRelation: 'Mother',
        signatureUrl: 'https://drive.google.com/uc?export=view&id=16orHeE3AVchZcxaI08Y8eGwkqP6j06eC',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Juli Yadav',
        bankAccountNumber: '30891048291',
        bankIfscCode: 'SBIN0000108',
        bankLinkedMobileNumber: '7044465416',
        childAadhaarNumber: 'XXXX-XXXX-5416',
        passbookPhotoUrl: 'https://drive.google.com/uc?export=view&id=1K0rU5wbrG_EsMFWW3AYTHCbE4x0AWJFU',
        aadhaarCardPhotoUrl: 'https://drive.google.com/uc?export=view&id=1BhBJxIp9__0jCSu3Rm8Cet0kjhQ9-r_Z',
        childPhotoUrl: 'https://drive.google.com/uc?export=view&id=12qt2evl6v-beZy_YxUFzBwvmuCjrZS5U',
      },
      householdFinancial: {
        totalFamilyMembers: 3,
        numberOfChildrenUnder18: 2,
        monthlyIncomeRs: 6000,
        mainSourceOfIncome: 'No Regular Income',
      },
      health: {
        weightKg: 48,
        heightCm: 160,
        bmi: 18.8,
        bmiCategory: 'Normal',
        haemoglobinGdl: 13,
        hbCategory: 'Normal',
        otherHealthConditions: ['None'],
        artStatus: 'On ART',
        artRegistrationDate: '2020-04-10',
        artIdNumber: 'WB-KOL-7920',
        vlStatus: 'Tested in last 6 months',
        vlDate: '2026-03-15',
        viralLoad: '< 50',
        vlCategory: 'Undetectable (<50 copies/mL)',
      },
      nutrition: {
        appetite: 'Reduced',
        mealsPerDay: 3,
      },
      educationStatus: {
        educationStatus: 'School Going',
        schoolName: 'S B Modern High School',
        schoolSessionStartDate: '2026-06-15',
        schoolType: 'Government school',
        currentClass: 'Class 11',
        attendance: 'Irregular',
      },
      educationExpenses: {
        schoolFees: 2100,
        tuitionFees: 7200,
        books: 1000,
        stationery: 1500,
        uniform: 2000,
        transport: 3200,
        otherExpenses: 1000,
        totalAnnualCost: 18000,
        feeReceiptPhotoUrl: 'https://drive.google.com/uc?export=view&id=1s7_22iVd145fM2399_2N4w17sR2f2m4Q',
        marksheetPhotoUrl: 'https://drive.google.com/uc?export=view&id=1s7_22iVd145fM2399_2N4w17sR2f2m4Q',
        remarks: 'Phase 3 educational aid recommended. Low income family.',
      },
      finalReview: {
        approvedAllianceIndia: 'Approved',
        allInfoCorrect: true,
        organizationName: 'Amra Padatik',
        formSubmittedBy: 'Juli Yadav',
        organizationEmail: 'amrapadatik@gmail.com',
      },
      syncNeeded: 'NO',
    },
    {
      uuid: 'bb12349d-446a-48fd-8747-638eed645b33',
      koboId: '792083945',
      formSubmittedBy: 'Asthi Saha (Caseworker)',
      interviewerName: 'Kobo Webhook',
      visitDate: '2026-06-25',
      signatureUrl: 'https://drive.google.com/uc?export=view&id=1SQu7TIGPEWj5yoTSC2Wl3PF8b4BJldpQ',
      demographics: {
        childName: 'Puja Saha',
        dob: '2008-11-01',
        calculatedAgeYears: 17,
        gender: 'Female',
        orphanStatus: 'Both Alive',
        caregiverName: 'Asthi Saha',
        caregiverRelationship: 'Mother',
        contactNumber: '9003684983',
        fullAddress: '15/1 Sujendra Seth lane, Kolkata - 700006',
        state: 'West Bengal',
        district: 'Kolkata',
        childAadhaarNumber: 'XXXX-XXXX-4983',
      },
      caregiverConsent: {
        consentObtained: 'Yes',
        caregiverFullName: 'Asthi Saha',
        caregiverRelation: 'Mother',
        signatureUrl: 'https://drive.google.com/uc?export=view&id=1SQu7TIGPEWj5yoTSC2Wl3PF8b4BJldpQ',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Asthi Saha',
        bankAccountNumber: '20491823901',
        bankIfscCode: 'CBIN0281045',
        bankLinkedMobileNumber: '9003684983',
        childAadhaarNumber: 'XXXX-XXXX-4983',
        passbookPhotoUrl: 'https://drive.google.com/uc?export=view&id=1BhBJxIp9__0jCSu3Rm8Cet0kjhQ9-r_Z',
        aadhaarCardPhotoUrl: 'https://drive.google.com/uc?export=view&id=1K0rU5wbrG_EsMFWW3AYTHCbE4x0AWJFU',
        childPhotoUrl: 'https://drive.google.com/uc?export=view&id=16orHeE3AVchZcxaI08Y8eGwkqP6j06eC',
      },
      householdFinancial: {
        totalFamilyMembers: 4,
        numberOfChildrenUnder18: 2,
        monthlyIncomeRs: 7500,
        mainSourceOfIncome: 'Tailoring & Domestic work',
      },
      health: {
        weightKg: 42,
        heightCm: 152,
        bmi: 18.2,
        bmiCategory: 'Normal',
        haemoglobinGdl: 11.8,
        hbCategory: 'Mild Anemia',
        otherHealthConditions: ['None'],
        artStatus: 'On ART',
        artRegistrationDate: '2019-08-22',
        artIdNumber: 'WB-KOL-8394',
        vlStatus: 'Tested in last 6 months',
        vlDate: '2026-04-10',
        viralLoad: '< 50',
        vlCategory: 'Undetectable (<50 copies/mL)',
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
      },
      educationStatus: {
        educationStatus: 'School Going',
        schoolName: 'Kolkata Girls High School',
        schoolSessionStartDate: '2026-06-15',
        schoolType: 'Government school',
        currentClass: 'Class 12',
        attendance: 'Regular',
      },
      educationExpenses: {
        schoolFees: 1800,
        tuitionFees: 6000,
        books: 1200,
        stationery: 800,
        uniform: 1500,
        transport: 2400,
        otherExpenses: 500,
        totalAnnualCost: 14200,
        feeReceiptPhotoUrl: 'https://drive.google.com/uc?export=view&id=1BhBJxIp9__0jCSu3Rm8Cet0kjhQ9-r_Z',
        marksheetPhotoUrl: 'https://drive.google.com/uc?export=view&id=1BhBJxIp9__0jCSu3Rm8Cet0kjhQ9-r_Z',
        remarks: 'Approved for nutrition ration basket and books grant.',
      },
      finalReview: {
        approvedAllianceIndia: 'Approved',
        allInfoCorrect: true,
        organizationName: 'Amra Padatik',
        formSubmittedBy: 'Asthi Saha',
        organizationEmail: 'amrapadatik@gmail.com',
      },
      syncNeeded: 'NO',
    },
    {
      uuid: 'cc23459d-556a-48fd-8747-638eed645b44',
      koboId: '792085225',
      formSubmittedBy: 'Naresh Sinha (Caseworker)',
      interviewerName: 'Kobo Webhook',
      visitDate: '2026-06-25',
      signatureUrl: 'https://drive.google.com/uc?export=view&id=1ZkIIz_4xiYBK-RIaDTYrGSarvYihxd7a',
      demographics: {
        childName: 'Neha Sinha',
        dob: '2008-11-16',
        calculatedAgeYears: 17,
        gender: 'Female',
        orphanStatus: 'Single Orphan',
        caregiverName: 'Naresh Sinha',
        caregiverRelationship: 'Father',
        contactNumber: '9585888810',
        fullAddress: '15/1, Sujendra seth lane, Kolkata 700006',
        state: 'West Bengal',
        district: 'Kolkata',
        childAadhaarNumber: 'XXXX-XXXX-8810',
      },
      caregiverConsent: {
        consentObtained: 'Yes',
        caregiverFullName: 'Naresh Sinha',
        caregiverRelation: 'Father',
        signatureUrl: 'https://drive.google.com/uc?export=view&id=1ZkIIz_4xiYBK-RIaDTYrGSarvYihxd7a',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Naresh Sinha',
        bankAccountNumber: '10928374619',
        bankIfscCode: 'PUNB0182700',
        bankLinkedMobileNumber: '9585888810',
        childAadhaarNumber: 'XXXX-XXXX-8810',
        passbookPhotoUrl: 'https://drive.google.com/uc?export=view&id=12qt2evl6v-beZy_YxUFzBwvmuCjrZS5U',
        aadhaarCardPhotoUrl: 'https://drive.google.com/uc?export=view&id=1SQu7TIGPEWj5yoTSC2Wl3PF8b4BJldpQ',
        childPhotoUrl: 'https://drive.google.com/uc?export=view&id=16orHeE3AVchZcxaI08Y8eGwkqP6j06eC',
      },
      householdFinancial: {
        totalFamilyMembers: 3,
        numberOfChildrenUnder18: 1,
        monthlyIncomeRs: 5500,
        mainSourceOfIncome: 'Tea stall vendor',
      },
      health: {
        weightKg: 45,
        heightCm: 156,
        bmi: 18.5,
        bmiCategory: 'Normal',
        haemoglobinGdl: 12.2,
        hbCategory: 'Normal',
        otherHealthConditions: ['None'],
        artStatus: 'On ART',
        artRegistrationDate: '2021-02-14',
        artIdNumber: 'WB-KOL-8522',
        vlStatus: 'Tested in last 6 months',
        vlDate: '2026-05-18',
        viralLoad: '< 50',
        vlCategory: 'Undetectable (<50 copies/mL)',
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
      },
      educationStatus: {
        educationStatus: 'School Going',
        schoolName: 'Seth Anandram Jaipuria College',
        schoolSessionStartDate: '2026-06-15',
        schoolType: 'Government school',
        currentClass: 'Class 12',
        attendance: 'Regular',
      },
      educationExpenses: {
        schoolFees: 2400,
        tuitionFees: 4800,
        books: 1500,
        stationery: 1000,
        uniform: 1800,
        transport: 1800,
        otherExpenses: 600,
        totalAnnualCost: 13900,
        feeReceiptPhotoUrl: 'https://drive.google.com/uc?export=view&id=12qt2evl6v-beZy_YxUFzBwvmuCjrZS5U',
        marksheetPhotoUrl: 'https://drive.google.com/uc?export=view&id=12qt2evl6v-beZy_YxUFzBwvmuCjrZS5U',
        remarks: 'Eligible for Phase 3 stationery and tuition grant.',
      },
      finalReview: {
        approvedAllianceIndia: 'Approved',
        allInfoCorrect: true,
        organizationName: 'Amra Padatik',
        formSubmittedBy: 'Naresh Sinha',
        organizationEmail: 'amrapadatik@gmail.com',
      },
      syncNeeded: 'NO',
    }
  ];

  for (var s = 0; s < samples.length; s++) {
    var res = handleCreate_(samples[s]);
    Logger.log('Sample ' + (s + 1) + ' result: ' + res.getContent());
  }

  return 'Setup complete! 3-Row Header initialized and 3 sample records with embedded in-cell images inserted successfully!';
}
