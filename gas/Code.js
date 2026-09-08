/**
 * Google Apps Script Backend Adapter — Phase 3 Rectified Linelist Architecture
 * Target Sheet ID: 1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA
 *
 * Implements:
 * - 72-Column Schema with "1\nUnique ID" replacing obsolete Kobo UUID & Kobo ID
 * - Systematic Google Drive upload in child-namewise folders: "<ChildName> - <UniqueID>"
 * - Automated deletion/trashing of old document files upon updating or changing files
 * - In-cell embedded images with hover-to-copy & click-to-open links (=HYPERLINK(url, IMAGE(url)))
 * - 3-Row Header Linelist design (Row 1 Navy Banner + Row 2 Spacer + Row 3 Pastel Category Headers)
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
var ROOT_DOCUMENTS_FOLDER_NAME = 'Child_Nutrition_Phase3_Documents';

// Exact 72 Rectified Column Headers (Number on top + newline)
var COLUMN_HEADERS = [
  "1\nUnique ID",
  "2\nSubmission Time",
  "3\nSubmitted By",
  "4\nConsent Obtained",
  "5\nSignature /\nThumb Impression",
  "6\nVisit Date",
  "7\nInterviewer Name",
  "8\nChild Name",
  "9\nDate of Birth",
  "10\nAge",
  "11\nGender",
  "12\nOrphan Status",
  "13\nCaregiver Full Name",
  "14\nCaregiver Relation",
  "15\nCaregiver Contact",
  "16\nAddress",
  "17\nState",
  "18\nDistrict",
  "19\nBank Account Holder Name",
  "20\nBank Account Number",
  "21\nBank IFSC Code",
  "22\nBank Linked Mobile Number",
  "23\nChild Aadhaar Number",
  "24\nPassbook Front Page Link",
  "25\nAadhaar Card Link",
  "26\nPassport Size Photo Link",
  "27\nHousehold Members",
  "28\nNo of Children",
  "29\nMonthly Income",
  "30\nIncome Source",
  "31\nCurrent Weight (kg)",
  "32\nCurrent Height (cm)",
  "33\nBMI",
  "34\nBMI Category",
  "35\nHemoglobin (g/dL)",
  "36\nHb Category",
  "37\nComorbidities",
  "38\nComorbidities Other",
  "39\nART Status",
  "40\nART Registration Date",
  "41\nART ID Number",
  "42\nVL Status",
  "43\nVL Date",
  "44\nViral Load",
  "45\nVL Category",
  "46\nAppetite",
  "47\nMeals per Day",
  "48\nEducation Status",
  "49\nEducation Status Other",
  "50\nSchool Name",
  "51\nSchool Session Start Date",
  "52\nSchool Type",
  "53\nCurrent Class",
  "54\nAttendance Status",
  "55\nSchool Fees",
  "56\nPrivate Tuition Fee",
  "57\nSchool Books",
  "58\nSchool Stationery",
  "59\nSchool Uniform",
  "60\nSchool Transport",
  "61\nSchool Other Expenses",
  "62\nTotal Annual Education Cost",
  "63\nSchool Fee Receipt Link",
  "64\nMarksheet Photo Link",
  "65\nRemarks (If Any)",
  "66\nApproved Alliance India",
  "67\nReview Confirmed",
  "68\nOrganization Name",
  "69\nForm Submitted By",
  "70\nOrganization Email",
  "71\nSync Needed",
  "72\nLast Updated"
];

// Document Columns with 1-based indexing in the 72-column schema
var DOC_COLUMNS = {
  SIGNATURE: 5,
  PASSBOOK: 24,
  AADHAAR: 25,
  CHILD_PHOTO: 26,
  FEE_RECEIPT: 63,
  MARKSHEET: 64
};

// Pastel Category Background Fills matching the reference sheet
var HEADER_CATEGORIES = [
  { start: 1, end: 7, color: '#D9E2F3' },   // Intake & Consent (Pale Blue)
  { start: 8, end: 18, color: '#E2EFDA' },  // Child Demographics & Residence (Pale Green)
  { start: 19, end: 26, color: '#FFF2CC' }, // Banking & KYC Documents (Pale Yellow)
  { start: 27, end: 30, color: '#EDEDED' }, // Household & Socio-Economic (Pale Gray)
  { start: 31, end: 45, color: '#FCE4D6' }, // Health, ART & Clinical (Pale Salmon/Rose)
  { start: 46, end: 47, color: '#E2EFDA' }, // Nutrition & Habits (Pale Green)
  { start: 48, end: 54, color: '#D9E2F3' }, // Education Status (Pale Blue)
  { start: 55, end: 65, color: '#FFF2CC' }, // Education Expenses & Documents (Pale Orange)
  { start: 66, end: 72, color: '#D9E2F3' }  // Programme Governance & Audit (Pale Blue/Slate)
];

// Fallback image URLs for sample rows
var PLACEHOLDER_DOCS = {
  SIGNATURE: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=300&q=80',
  PASSBOOK: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=300&q=80',
  AADHAAR: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&q=80',
  CHILD_PHOTO: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=300&q=80',
  FEE_RECEIPT: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=300&q=80',
  MARKSHEET: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=300&q=80'
};

// ============================================================================
// ON OPEN & CUSTOM UI MENU
// ============================================================================

function onOpen(e) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('Child Nutrition PWA')
      .addItem('Setup 72 Rectified Headers & Insert Samples', 'runSetupAndInsertSampleRows')
      .addItem('Format Header Styles & In-Cell Images', 'formatSheetLinelistDesign')
      .addItem('Verify Google Drive Document Folders', 'verifyDriveDocumentFolders')
      .addToUi();
  } catch (err) {
    Logger.log('onOpen UI menu could not be created: ' + err);
  }
}

// ============================================================================
// WEB APP API DISPATCHERS (GET / POST)
// ============================================================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'read';

  if (action === 'schema') {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        totalColumns: COLUMN_HEADERS.length,
        headers: COLUMN_HEADERS,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'setup') {
    var result = runSetupAndInsertSampleRows();
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', message: result })
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
  var hasLock = false;
  try {
    hasLock = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!hasLock) {
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
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch (ignored) {}
    }
  }
}

// ============================================================================
// SHEET HEADER & LINELIST FORMATTING
// ============================================================================

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
    // --- ROW 1: Title Banner ---
    sheet.setRowHeight(1, 38);
    var bannerRange = sheet.getRange(1, 1, 1, COLUMN_HEADERS.length);
    bannerRange.setBackground('#1B365D');
    bannerRange.setFontColor('#FFFFFF');
    bannerRange.setFontSize(13);
    bannerRange.setFontWeight('bold');
    bannerRange.setVerticalAlignment('middle');

    // Merge B1:BT1 (Columns 2 to 72)
    var mergeRange = sheet.getRange(1, 2, 1, COLUMN_HEADERS.length - 1);
    try {
      mergeRange.merge();
      mergeRange.setValue(BANNER_TITLE);
      mergeRange.setHorizontalAlignment('left');
    } catch (mErr) {
      sheet.getRange(1, 1).setValue(BANNER_TITLE);
    }

    // --- ROW 2: Spacer ---
    sheet.setRowHeight(2, 12);
    var spacerRange = sheet.getRange(2, 1, 1, COLUMN_HEADERS.length);
    spacerRange.setBackground('#FFFFFF');

    // --- ROW 3: Rectified 72 Headers ---
    sheet.setRowHeight(3, 90);
    var headerRange = sheet.getRange(HEADER_ROW_INDEX, 1, 1, COLUMN_HEADERS.length);
    headerRange.setValues([COLUMN_HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(9.5);
    headerRange.setFontColor('#1E293B');
    headerRange.setWrap(true);
    headerRange.setVerticalAlignment('middle');
    headerRange.setHorizontalAlignment('center');

    // Apply Pastel Category Colors
    for (var c = 0; c < HEADER_CATEGORIES.length; c++) {
      var cat = HEADER_CATEGORIES[c];
      var count = cat.end - cat.start + 1;
      sheet.getRange(HEADER_ROW_INDEX, cat.start, 1, count).setBackground(cat.color);
    }

    // Borders on header row
    headerRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

    // Freeze 3 header rows
    sheet.setFrozenRows(3);

    // Apply column widths
    applyColumnWidths_(sheet);
  }
}

function applyColumnWidths_(sheet) {
  for (var i = 1; i <= COLUMN_HEADERS.length; i++) {
    // Image columns
    if (i === DOC_COLUMNS.SIGNATURE || i === DOC_COLUMNS.PASSBOOK || i === DOC_COLUMNS.AADHAAR ||
        i === DOC_COLUMNS.CHILD_PHOTO || i === DOC_COLUMNS.FEE_RECEIPT || i === DOC_COLUMNS.MARKSHEET) {
      sheet.setColumnWidth(i, 110);
    } else if (i === 1) { // Unique ID
      sheet.setColumnWidth(i, 160);
    } else if (i === 8 || i === 13) { // Child Name / Caregiver Name
      sheet.setColumnWidth(i, 150);
    } else if (i === 16) { // Address
      sheet.setColumnWidth(i, 220);
    } else if (i === 50) { // School Name
      sheet.setColumnWidth(i, 180);
    } else if (i === 65) { // Remarks
      sheet.setColumnWidth(i, 200);
    } else {
      sheet.setColumnWidth(i, 100);
    }
  }
}

// ============================================================================
// GOOGLE DRIVE SYSTEMATIC CHILD FOLDERS & CLEANUP
// ============================================================================

function getOrCreateRootDocumentsFolder_() {
  try {
    var folders = DriveApp.getFoldersByName(ROOT_DOCUMENTS_FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    }
    var root = DriveApp.createFolder(ROOT_DOCUMENTS_FOLDER_NAME);
    root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return root;
  } catch (err) {
    Logger.log('DriveApp root folder exception (pending authorization): ' + err);
    return null;
  }
}

function getOrCreateChildFolder_(childName, uniqueId) {
  try {
    var rootFolder = getOrCreateRootDocumentsFolder_();
    if (!rootFolder) return null;

    var safeName = (childName && String(childName).trim()) ? String(childName).trim() : 'Unnamed_Child';
    var safeId = (uniqueId && String(uniqueId).trim()) ? String(uniqueId).trim() : 'ID_' + Utilities.getUuid();
    var expectedFolderName = safeName + ' - ' + safeId;

    // 1. Search for existing folder with exact name
    var exactFolders = rootFolder.getFoldersByName(expectedFolderName);
    if (exactFolders.hasNext()) {
      return exactFolders.next();
    }

    // 2. Search for existing folder ending with " - " + safeId
    var subFolders = rootFolder.getFolders();
    var idSuffix = ' - ' + safeId;
    while (subFolders.hasNext()) {
      var folder = subFolders.next();
      var fname = folder.getName();
      if (fname.indexOf(idSuffix) !== -1 || fname === safeId) {
        if (fname !== expectedFolderName) {
          folder.setName(expectedFolderName);
        }
        return folder;
      }
    }

    // 3. Create brand new child folder
    var newFolder = rootFolder.createFolder(expectedFolderName);
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return newFolder;
  } catch (err) {
    Logger.log('DriveApp child folder exception: ' + err);
    return null;
  }
}

function deleteObsoleteDocumentFiles_(childFolder, docPrefix, oldFormulaOrUrl) {
  if (!childFolder) return;

  try {
    // Check prefix matches (e.g. "Signature_", "Passbook_")
    var files = childFolder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      if (name.indexOf(docPrefix + '_') === 0 || name.indexOf(docPrefix + '.') === 0) {
        try {
          file.setTrashed(true);
        } catch (err) {
          Logger.log('Could not trash file: ' + name + ', ' + err);
        }
      }
    }

    // Also check if oldFormulaOrUrl has a specific Drive File ID
    if (oldFormulaOrUrl) {
      var oldDriveId = extractDriveId_(oldFormulaOrUrl);
      if (oldDriveId) {
        try {
          var oldFile = DriveApp.getFileById(oldDriveId);
          if (oldFile) oldFile.setTrashed(true);
        } catch (err) {
          Logger.log('Could not trash old file by ID: ' + oldDriveId);
        }
      }
    }
  } catch (err) {
    Logger.log('Exception in deleteObsoleteDocumentFiles_: ' + err);
  }
}

function processDocumentUpload_(inputVal, childFolder, docPrefix, uniqueId, oldFormulaOrUrl) {
  if (!inputVal) return '';
  var val = String(inputVal).trim();
  if (!val) return '';

  // Handle Base64 Data URL
  if (val.indexOf('data:') === 0 && val.indexOf(';base64,') !== -1) {
    try {
      var commaIdx = val.indexOf(',');
      var meta = val.substring(5, commaIdx);
      var base64Data = val.substring(commaIdx + 1);

      var mimeType = 'image/png';
      var ext = '.png';
      if (meta.indexOf('image/jpeg') !== -1 || meta.indexOf('image/jpg') !== -1) {
        mimeType = 'image/jpeg';
        ext = '.jpg';
      } else if (meta.indexOf('application/pdf') !== -1) {
        mimeType = 'application/pdf';
        ext = '.pdf';
      }

      // Delete obsolete files before saving replacement
      if (childFolder) {
        deleteObsoleteDocumentFiles_(childFolder, docPrefix, oldFormulaOrUrl);
      }

      var decodedBytes = Utilities.base64Decode(base64Data);
      var timestamp = Utilities.formatDate(new Date(), 'GMT+5:30', 'yyyyMMdd_HHmmss');
      var fileName = docPrefix + '_' + timestamp + ext;
      var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

      var newFile = childFolder ? childFolder.createFile(blob) : DriveApp.createFile(blob);
      newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      var fileId = newFile.getId();
      var viewUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
      var thumbUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w150';
      return '=HYPERLINK("' + viewUrl + '", IMAGE("' + thumbUrl + '"))';
    } catch (driveErr) {
      Logger.log('DriveApp upload exception: ' + driveErr);
      return 'DATA_URL_STORED_PENDING_AUTH';
    }
  }

  // Handle Google Drive Link
  var driveId = extractDriveId_(val);
  if (driveId) {
    var viewUrl = 'https://drive.google.com/uc?export=view&id=' + driveId;
    var thumbUrl = 'https://drive.google.com/thumbnail?id=' + driveId + '&sz=w150';
    return '=HYPERLINK("' + viewUrl + '", IMAGE("' + thumbUrl + '"))';
  }

  // Handle standard web image URL
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

function formatDataRow_(sheet, rowIndex) {
  sheet.setRowHeight(rowIndex, 60);
  var rowRange = sheet.getRange(rowIndex, 1, 1, COLUMN_HEADERS.length);
  rowRange.setVerticalAlignment('middle');
  rowRange.setFontSize(10);

  if (rowIndex % 2 === 0) {
    rowRange.setBackground('#FFFFFF');
  } else {
    rowRange.setBackground('#F8FAFC');
  }

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

// ============================================================================
// CREATE & OCC UPDATE HANDLERS
// ============================================================================

function handleCreate_(payload) {
  if (payload.data && typeof payload.data === 'object') {
    for (var k in payload.data) {
      if (payload.data.hasOwnProperty(k) && !payload.hasOwnProperty(k)) {
        payload[k] = payload.data[k];
      }
    }
  }

  var d = payload.demographics || payload.childProfile || {};
  var h = payload.health || payload.clinicalAssessment || {};
  var n = payload.nutrition || (payload.clinicalAssessment && payload.clinicalAssessment.appetite ? payload.clinicalAssessment : {});
  var e = payload.educationStatus || payload.educationSupport || {};
  var exp = payload.educationExpenses || (payload.educationSupport && (payload.educationSupport.annualExpenses || payload.educationSupport)) || {};
  var b = payload.bankingAndKyc || payload.bankDetails || payload.caregiverHousehold || {};
  var f = payload.finalReview || payload.remarksReview || {};

  // Unique ID generated by the system (e.g. WB-KOL-081255-01 or client UUID)
  var uniqueId = payload.uniqueId || payload.artNumber || d.artNumber || payload.uuid || payload._uuid;
  if (!uniqueId) {
    return errorResponse_('Missing required field: uniqueId or uuid.', 422);
  }

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  // Idempotency check: Column 1 is Unique ID, data starts at row 4
  if (lastRow >= 4) {
    var existingIds = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
    for (var r = 0; r < existingIds.length; r++) {
      var rowId = String(existingIds[r][0]).trim();
      if (rowId === String(uniqueId).trim() || (payload.uuid && rowId === String(payload.uuid).trim())) {
        var rowIndex = 4 + r;
        var existingRow = sheet.getRange(rowIndex, 1, 1, COLUMN_HEADERS.length).getValues()[0];
        return ContentService.createTextOutput(
          JSON.stringify({
            status: 'success',
            acknowledged: true,
            remoteSubmissionId: String(existingRow[0]),
            clientSubmissionId: uniqueId,
            version: 1,
            isDuplicate: true,
            idempotencyNote: 'Duplicate recognized. Existing row confirmed in Sheet.',
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  var now = new Date().toISOString();
  var childName = d.childName || payload.childName || '';

  // Get or create dedicated child folder in Drive: "<ChildName> - <UniqueID>"
  var childFolder = getOrCreateChildFolder_(childName, uniqueId);

  // Build the 72-value array matching COLUMN_HEADERS 1-to-1
  var row = new Array(COLUMN_HEADERS.length);

  row[0] = uniqueId; // 1 Unique ID (Auto-Generated Assessment / Beneficiary ID)
  row[1] = payload.submissionTime || payload.createdAt || now; // 2 Submission Time
  row[2] = f.formSubmittedBy || payload.formSubmittedBy || payload.interviewerName || ''; // 3 Submitted By
  row[3] = (payload.consent && (payload.consent.agreeToParticipate || payload.consent.consentGiven)) ||
           payload.consentObtained === 'Yes' ? 'Yes' : 'No'; // 4 Consent Obtained

  // 5 Signature / Thumb Impression — Stored in child folder, formatted as in-cell formula
  var sigVal = payload.signatureDataUrl || (payload.consent && payload.consent.signatureDataUrl) ||
               (payload.caregiverConsent && payload.caregiverConsent.signatureDataUrl) ||
               payload.signatureUrl || (payload.caregiverConsent && payload.caregiverConsent.signatureUrl) ||
               payload.signatureStatus || '';
  row[4] = sigVal ? processDocumentUpload_(sigVal, childFolder, 'Signature', uniqueId) : 'CAPTURED_LOCAL';

  row[5] = d.dateOfFilling || payload.visitDate || now.split('T')[0]; // 6 Visit Date
  row[6] = payload.interviewerName || f.formSubmittedBy || ''; // 7 Interviewer Name
  row[7] = childName; // 8 Child Name
  row[8] = d.dob || payload.dob || ''; // 9 Date of Birth
  row[9] = d.calculatedAgeYears !== undefined ? d.calculatedAgeYears : (payload.age || ''); // 10 Age
  row[10] = d.gender || payload.gender || 'Male'; // 11 Gender
  row[11] = d.orphanStatus || payload.orphanStatus || ''; // 12 Orphan Status
  row[12] = d.caregiverName || payload.caregiverFullName || payload.caregiverName || ''; // 13 Caregiver Full Name
  row[13] = d.caregiverRelationship || payload.caregiverRelation || ''; // 14 Caregiver Relation
  row[14] = d.contactNumber || d.caregiverPhone || payload.caregiverContact || ''; // 15 Caregiver Contact
  row[15] = d.fullAddress || payload.address || ''; // 16 Address
  row[16] = d.state || payload.state || 'Maharashtra'; // 17 State
  row[17] = d.district || payload.district || 'Pune'; // 18 District
  row[18] = b.bankAccountHolderName || b.accountHolderName || payload.bankAccountHolderName || ''; // 19 Bank Account Holder Name
  row[19] = b.bankAccountNumber || b.accountNumber || payload.bankAccountNumber || ''; // 20 Bank Account Number
  row[20] = b.bankIfscCode || b.ifscCode || payload.bankIfscCode || ''; // 21 Bank IFSC Code
  row[21] = b.bankLinkedMobileNumber || payload.bankLinkedMobileNumber || ''; // 22 Bank Linked Mobile Number
  row[22] = b.childAadhaarNumber || d.childAadhaarNumber || payload.childAadhaarNumber || ''; // 23 Child Aadhaar Number

  // KYC Image Links (Cols 24, 25, 26) — Stored in child folder, formatted as in-cell formula
  row[23] = processDocumentUpload_(b.passbookPhotoUrl || d.passbookPhotoUrl || payload.passbookFrontPageLink || payload.passbookPhotoUrl, childFolder, 'Passbook', uniqueId);
  row[24] = processDocumentUpload_(b.aadhaarCardPhotoUrl || d.aadhaarCardPhotoUrl || payload.aadhaarCardLink || payload.aadhaarCardPhotoUrl, childFolder, 'Aadhaar', uniqueId);
  row[25] = processDocumentUpload_(b.childPhotoUrl || d.childPhotoUrl || payload.passportSizePhotoLink || payload.childPhotoUrl, childFolder, 'Child_Photo', uniqueId);

  row[26] = payload.householdFinancial ? payload.householdFinancial.totalFamilyMembers : (payload.householdMembers || 4); // 27 Household Members
  row[27] = payload.householdFinancial ? payload.householdFinancial.numberOfChildrenUnder18 : (payload.noOfChildren || 2); // 28 No of Children
  row[28] = payload.householdFinancial ? payload.householdFinancial.monthlyIncomeRs : (payload.monthlyIncome || 0); // 29 Monthly Income
  row[29] = payload.householdFinancial ? payload.householdFinancial.mainSourceOfIncome : (payload.incomeSource || 'Daily wage labour'); // 30 Income Source
  row[30] = h.weightKg || n.weightKg || payload.currentWeightKg || 0; // 31 Current Weight (kg)
  row[31] = h.heightCm || n.heightCm || payload.currentHeightCm || 0; // 32 Current Height (cm)
  row[32] = h.bmi || n.bmi || payload.bmi || 0; // 33 BMI
  row[33] = h.bmiCategory || payload.bmiCategory || (h.nutritionStatus || n.nutritionStatus || 'Normal'); // 34 BMI Category
  row[34] = h.haemoglobinGdl !== undefined ? h.haemoglobinGdl : (payload.hemoglobinGdl || ''); // 35 Hemoglobin (g/dL)
  row[35] = h.hbCategory || payload.hbCategory || 'Normal'; // 36 Hb Category
  row[36] = Array.isArray(h.otherHealthConditions) ? h.otherHealthConditions.join(', ') : (payload.comorbidities || ''); // 37 Comorbidities
  row[37] = h.otherHealthConditionSpecify || payload.comorbiditiesOther || ''; // 38 Comorbidities Other
  row[38] = h.artStatus || payload.artStatus || 'On ART'; // 39 ART Status
  row[39] = h.artRegistrationDate || payload.artRegistrationDate || ''; // 40 ART Registration Date
  row[40] = h.artIdNumber || payload.artIdNumber || ''; // 41 ART ID Number
  row[41] = h.vlStatus || payload.vlStatus || 'Tested in last 6 months'; // 42 VL Status
  row[42] = h.vlDate || payload.vlDate || ''; // 43 VL Date
  row[43] = h.viralLoad !== undefined ? String(h.viralLoad) : (payload.viralLoad || '< 50'); // 44 Viral Load
  row[44] = h.vlCategory || payload.vlCategory || 'Undetectable (<50 copies/mL)'; // 45 VL Category
  row[45] = n.appetite || payload.appetite || 'Good'; // 46 Appetite
  row[46] = n.mealsPerDay || payload.mealsPerDay || 3; // 47 Meals per Day
  row[47] = e.educationStatus || payload.educationStatus || 'Currently going to school'; // 48 Education Status
  row[48] = e.educationStatusSpecify || payload.educationStatusOther || ''; // 49 Education Status Other
  row[49] = e.schoolName || payload.schoolName || ''; // 50 School Name
  row[50] = e.schoolSessionStartDate || payload.schoolSessionStartDate || ''; // 51 School Session Start Date
  row[51] = e.schoolType || payload.schoolType || 'Government school'; // 52 School Type
  row[52] = e.currentClass || payload.currentClass || ''; // 53 Current Class
  row[53] = e.attendance || payload.attendanceStatus || 'Regular'; // 54 Attendance Status
  row[54] = Number(exp.schoolFees) || 0; // 55 School Fees
  row[55] = Number(exp.tuitionFees) || 0; // 56 Private Tuition Fee
  row[56] = Number(exp.books) || 0; // 57 School Books
  row[57] = Number(exp.stationery) || 0; // 58 School Stationery
  row[58] = Number(exp.uniform) || 0; // 59 School Uniform
  row[59] = Number(exp.transport) || 0; // 60 School Transport
  row[60] = Number(exp.otherExpenses) || 0; // 61 School Other Expenses
  row[61] = Number(exp.totalAnnualCost) || 0; // 62 Total Annual Education Cost

  // Education Photo Links (Cols 63, 64) — Stored in child folder, formatted as in-cell formula
  row[62] = processDocumentUpload_(exp.feeReceiptPhotoUrl || e.feeReceiptPhotoUrl || payload.feeReceiptPhotoUrl || payload.schoolFeeReceiptLink, childFolder, 'Fee_Receipt', uniqueId);
  row[63] = processDocumentUpload_(exp.marksheetPhotoUrl || e.marksheetPhotoUrl || payload.marksheetPhotoUrl || payload.marksheetPhotoLink, childFolder, 'Marksheet', uniqueId);

  row[64] = exp.remarks || payload.remarks || ''; // 65 Remarks (If Any)
  row[65] = f.approvedAllianceIndia || payload.approvedAllianceIndia || 'Pending'; // 66 Approved Alliance India
  row[66] = f.allInfoCorrect || payload.reviewConfirmed ? 'Yes' : 'No'; // 67 Review Confirmed
  row[67] = f.organizationName || payload.organizationName || 'India HIV/AIDS Alliance'; // 68 Organization Name
  row[68] = f.formSubmittedBy || payload.formSubmittedBy || payload.interviewerName || ''; // 69 Form Submitted By
  row[69] = f.organizationEmail || payload.organizationEmail || ''; // 70 Organization Email
  row[70] = payload.syncNeeded || 'NO'; // 71 Sync Needed
  row[71] = payload.updatedAt || now; // 72 Last Updated

  sheet.appendRow(row);
  var newRowIndex = sheet.getLastRow();
  formatDataRow_(sheet, newRowIndex);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: uniqueId,
      clientSubmissionId: uniqueId,
      uniqueId: uniqueId,
      rowNumber: newRowIndex,
      totalColumns: COLUMN_HEADERS.length,
      version: 1,
      updatedAt: now,
      isDuplicate: false,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdate_(payload) {
  if (payload.data && typeof payload.data === 'object') {
    for (var k in payload.data) {
      if (payload.data.hasOwnProperty(k) && !payload.hasOwnProperty(k)) {
        payload[k] = payload.data[k];
      }
    }
  }

  var targetId = payload.uniqueId || payload.artNumber || payload.uuid || payload.submissionId || payload.remoteSubmissionId;
  if (!targetId) {
    return errorResponse_('Missing uniqueId or uuid for update.', 400);
  }

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < 4) {
    return errorResponse_('Record not found: Sheet has no data rows.', 404);
  }

  var ids = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
  var foundRow = -1;

  for (var r = 0; r < ids.length; r++) {
    var existingId = String(ids[r][0]).trim();
    if (existingId === String(targetId).trim()) {
      foundRow = 4 + r;
      break;
    }
  }

  if (foundRow === -1) {
    return errorResponse_('Record not found with ID: ' + targetId, 404);
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
          message: 'Concurrent modification conflict. Sheet has newer version ' + sheetVersion,
          currentVersion: sheetVersion,
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  var childName = payload.childName || (payload.demographics && payload.demographics.childName) || existingRow[7] || '';
  var childFolder = getOrCreateChildFolder_(childName, targetId);

  var allowedDirectMap = {
    childName: 8,
    dob: 9,
    age: 10,
    gender: 11,
    orphanStatus: 12,
    caregiverName: 13,
    caregiverFullName: 13,
    caregiverRelationship: 14,
    caregiverRelation: 14,
    contactNumber: 15,
    caregiverPhone: 15,
    caregiverContact: 15,
    fullAddress: 16,
    address: 16,
    state: 17,
    district: 18,
    bankAccountHolderName: 19,
    bankAccountNumber: 20,
    bankIfscCode: 21,
    bankLinkedMobileNumber: 22,
    childAadhaarNumber: 23,
    totalFamilyMembers: 27,
    householdMembers: 27,
    numberOfChildrenUnder18: 28,
    noOfChildren: 28,
    monthlyIncomeRs: 29,
    monthlyIncome: 29,
    mainSourceOfIncome: 30,
    incomeSource: 30,
    weightKg: 31,
    currentWeightKg: 31,
    heightCm: 32,
    currentHeightCm: 32,
    bmi: 33,
    bmiCategory: 34,
    haemoglobinGdl: 35,
    hemoglobinGdl: 35,
    hbCategory: 36,
    comorbidities: 37,
    comorbiditiesOther: 38,
    artStatus: 39,
    artRegistrationDate: 40,
    artIdNumber: 41,
    vlStatus: 42,
    vlDate: 43,
    viralLoad: 44,
    vlCategory: 45,
    appetite: 46,
    mealsPerDay: 47,
    educationStatus: 48,
    educationStatusSpecify: 49,
    schoolName: 50,
    schoolSessionStartDate: 51,
    schoolType: 52,
    currentClass: 53,
    attendance: 54,
    attendanceStatus: 54,
    schoolFees: 55,
    tuitionFees: 56,
    privateTuitionFee: 56,
    books: 57,
    schoolBooks: 57,
    stationery: 58,
    schoolStationery: 58,
    uniform: 59,
    schoolUniform: 59,
    transport: 60,
    schoolTransport: 60,
    otherExpenses: 61,
    schoolOtherExpenses: 61,
    totalAnnualCost: 62,
    totalAnnualEducationCost: 62,
    remarks: 65,
    approvedAllianceIndia: 66,
    reviewConfirmed: 67,
    organizationName: 68,
    formSubmittedBy: 69,
    organizationEmail: 70,
    syncNeeded: 71
  };

  // Direct mutations
  for (var key in payload) {
    if (payload.hasOwnProperty(key)) {
      var colIdx = allowedDirectMap[key];
      if (colIdx && colIdx <= COLUMN_HEADERS.length) {
        var val = payload[key];
        if (Array.isArray(val)) val = val.join(', ');
        sheet.getRange(foundRow, colIdx).setValue(val);
      }
    }
  }

  // Nested mutations
  var d = payload.demographics || payload.childProfile;
  if (d) {
    if (d.childName !== undefined) sheet.getRange(foundRow, 8).setValue(d.childName);
    if (d.dob !== undefined) sheet.getRange(foundRow, 9).setValue(d.dob);
    if (d.calculatedAgeYears !== undefined) sheet.getRange(foundRow, 10).setValue(d.calculatedAgeYears);
    if (d.gender !== undefined) sheet.getRange(foundRow, 11).setValue(d.gender);
    if (d.orphanStatus !== undefined) sheet.getRange(foundRow, 12).setValue(d.orphanStatus);
    if (d.caregiverName !== undefined) sheet.getRange(foundRow, 13).setValue(d.caregiverName);
    if (d.caregiverRelationship !== undefined) sheet.getRange(foundRow, 14).setValue(d.caregiverRelationship);
    if (d.contactNumber !== undefined) sheet.getRange(foundRow, 15).setValue(d.contactNumber);
    if (d.fullAddress !== undefined) sheet.getRange(foundRow, 16).setValue(d.fullAddress);
    if (d.state !== undefined) sheet.getRange(foundRow, 17).setValue(d.state);
    if (d.district !== undefined) sheet.getRange(foundRow, 18).setValue(d.district);
    if (d.childAadhaarNumber !== undefined) sheet.getRange(foundRow, 23).setValue(d.childAadhaarNumber);
  }

  var b = payload.bankingAndKyc || payload.bankDetails || payload.caregiverHousehold;
  if (b) {
    if (b.bankAccountHolderName !== undefined) sheet.getRange(foundRow, 19).setValue(b.bankAccountHolderName);
    if (b.bankAccountNumber !== undefined) sheet.getRange(foundRow, 20).setValue(b.bankAccountNumber);
    if (b.bankIfscCode !== undefined) sheet.getRange(foundRow, 21).setValue(b.bankIfscCode);
    if (b.bankLinkedMobileNumber !== undefined) sheet.getRange(foundRow, 22).setValue(b.bankLinkedMobileNumber);
    if (b.childAadhaarNumber !== undefined) sheet.getRange(foundRow, 23).setValue(b.childAadhaarNumber);
  }

  // Document photo updates with obsolete file trashing
  if (payload.signatureDataUrl || (payload.consent && payload.consent.signatureDataUrl)) {
    var oldSig = sheet.getRange(foundRow, DOC_COLUMNS.SIGNATURE).getFormula() || sheet.getRange(foundRow, DOC_COLUMNS.SIGNATURE).getValue();
    var sigVal = payload.signatureDataUrl || payload.consent.signatureDataUrl;
    sheet.getRange(foundRow, DOC_COLUMNS.SIGNATURE).setValue(processDocumentUpload_(sigVal, childFolder, 'Signature', targetId, oldSig));
  }

  if (payload.passbookPhotoUrl || (b && b.passbookPhotoUrl)) {
    var oldPassbook = sheet.getRange(foundRow, DOC_COLUMNS.PASSBOOK).getFormula() || sheet.getRange(foundRow, DOC_COLUMNS.PASSBOOK).getValue();
    var pVal = payload.passbookPhotoUrl || b.passbookPhotoUrl;
    sheet.getRange(foundRow, DOC_COLUMNS.PASSBOOK).setValue(processDocumentUpload_(pVal, childFolder, 'Passbook', targetId, oldPassbook));
  }

  if (payload.aadhaarCardPhotoUrl || (b && b.aadhaarCardPhotoUrl)) {
    var oldAadhaar = sheet.getRange(foundRow, DOC_COLUMNS.AADHAAR).getFormula() || sheet.getRange(foundRow, DOC_COLUMNS.AADHAAR).getValue();
    var aVal = payload.aadhaarCardPhotoUrl || b.aadhaarCardPhotoUrl;
    sheet.getRange(foundRow, DOC_COLUMNS.AADHAAR).setValue(processDocumentUpload_(aVal, childFolder, 'Aadhaar', targetId, oldAadhaar));
  }

  if (payload.childPhotoUrl || (b && b.childPhotoUrl)) {
    var oldPhoto = sheet.getRange(foundRow, DOC_COLUMNS.CHILD_PHOTO).getFormula() || sheet.getRange(foundRow, DOC_COLUMNS.CHILD_PHOTO).getValue();
    var cVal = payload.childPhotoUrl || b.childPhotoUrl;
    sheet.getRange(foundRow, DOC_COLUMNS.CHILD_PHOTO).setValue(processDocumentUpload_(cVal, childFolder, 'Child_Photo', targetId, oldPhoto));
  }

  var exp = payload.educationExpenses || (payload.educationSupport && (payload.educationSupport.annualExpenses || payload.educationSupport));
  if (payload.feeReceiptPhotoUrl || (exp && exp.feeReceiptPhotoUrl)) {
    var oldFee = sheet.getRange(foundRow, DOC_COLUMNS.FEE_RECEIPT).getFormula() || sheet.getRange(foundRow, DOC_COLUMNS.FEE_RECEIPT).getValue();
    var fVal = payload.feeReceiptPhotoUrl || exp.feeReceiptPhotoUrl;
    sheet.getRange(foundRow, DOC_COLUMNS.FEE_RECEIPT).setValue(processDocumentUpload_(fVal, childFolder, 'Fee_Receipt', targetId, oldFee));
  }

  if (payload.marksheetPhotoUrl || (exp && exp.marksheetPhotoUrl)) {
    var oldMark = sheet.getRange(foundRow, DOC_COLUMNS.MARKSHEET).getFormula() || sheet.getRange(foundRow, DOC_COLUMNS.MARKSHEET).getValue();
    var mVal = payload.marksheetPhotoUrl || exp.marksheetPhotoUrl;
    sheet.getRange(foundRow, DOC_COLUMNS.MARKSHEET).setValue(processDocumentUpload_(mVal, childFolder, 'Marksheet', targetId, oldMark));
  }

  // Update Last Updated column
  var now = new Date().toISOString();
  sheet.getRange(foundRow, 72).setValue(now);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: targetId,
      uniqueId: targetId,
      rowNumber: foundRow,
      updatedAt: now,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// READ & LIST HANDLERS
// ============================================================================

function handleRead_(params) {
  var id = params.uniqueId || params.id || params.uuid || params.submissionId;
  if (!id) {
    return errorResponse_('Missing uniqueId or id parameter.', 400);
  }

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < 4) {
    return errorResponse_('Record not found.', 404);
  }

  var ids = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0]).trim() === String(id).trim()) {
      var rowIndex = 4 + r;
      var values = sheet.getRange(rowIndex, 1, 1, COLUMN_HEADERS.length).getValues()[0];
      var formulas = sheet.getRange(rowIndex, 1, 1, COLUMN_HEADERS.length).getFormulas()[0];
      var record = {};
      for (var c = 0; c < COLUMN_HEADERS.length; c++) {
        record[COLUMN_HEADERS[c]] = formulas[c] || values[c];
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'success', data: record, rowNumber: rowIndex })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return errorResponse_('Record not found with ID: ' + id, 404);
}

function handleList_(params) {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < 4) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', data: [], total: 0, cursor: null, hasMore: false })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var limit = parseInt(params.limit, 10) || 50;
  var cursor = parseInt(params.cursor, 10) || 4; // Start at Row 4
  var endRow = Math.min(cursor + limit - 1, lastRow);
  var numRows = endRow - cursor + 1;

  if (numRows <= 0) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', data: [], total: lastRow - 3, cursor: null, hasMore: false })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var dataBlock = sheet.getRange(cursor, 1, numRows, COLUMN_HEADERS.length).getValues();
  var formulaBlock = sheet.getRange(cursor, 1, numRows, COLUMN_HEADERS.length).getFormulas();
  var records = [];

  for (var r = 0; r < dataBlock.length; r++) {
    var rec = {};
    for (var c = 0; c < COLUMN_HEADERS.length; c++) {
      rec[COLUMN_HEADERS[c]] = formulaBlock[r][c] || dataBlock[r][c];
    }
    records.push(rec);
  }

  var nextCursor = endRow < lastRow ? endRow + 1 : null;
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      data: records,
      total: lastRow - 3,
      cursor: nextCursor,
      hasMore: nextCursor !== null,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// SAMPLE DATA & 1-CLICK SHEET SETUP
// ============================================================================

function runSetupAndInsertSampleRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  }
  var sheet = ss.getSheetByName(PRIMARY_SHEET_NAME) || ss.getSheets()[0];
  sheet.setName(PRIMARY_SHEET_NAME);

  // Clear existing content and initialize fresh 3-row layout
  sheet.clear();
  ensureHeaders_(sheet);

  // Sample real-world beneficiaries with generated IDs
  var samples = [
    {
      uniqueId: 'WB-KOL-081200-01',
      childName: 'Rohit Yadav',
      submittedBy: 'Juli Yadav',
      consent: 'Yes',
      visitDate: '2026-06-25',
      dob: '2010-04-14',
      age: 16,
      gender: 'Male',
      orphanStatus: 'Both Alive',
      caregiverName: 'Juli Yadav',
      caregiverRelation: 'Mother',
      caregiverContact: '9830192840',
      address: '15/1, Sujendra Seth Lane, Kolkata - 700006',
      state: 'West Bengal',
      district: 'Kolkata',
      accountHolder: 'Juli Yadav',
      accountNo: '30928172645',
      ifsc: 'SBIN0000166',
      bankMobile: '9830192840',
      aadhaarNo: 'XXXX-XXXX-2840',
      familyMembers: 5,
      children: 2,
      monthlyIncome: 8000,
      incomeSource: 'Domestic help & sewing',
      weight: 48,
      height: 160,
      bmi: 18.8,
      bmiCat: 'Normal',
      hb: 13.0,
      hbCat: 'Normal',
      comorbidities: 'None',
      comorbiditiesOther: '',
      artStatus: 'On ART',
      artRegDate: '2020-04-10',
      artId: 'WB-KOL-7920',
      vlStatus: 'Tested in last 6 months',
      vlDate: '2026-03-15',
      vlCopies: '< 50',
      vlCat: 'Undetectable (<50 copies/mL)',
      appetite: 'Reduced',
      meals: 3,
      eduStatus: 'School Going',
      eduOther: '',
      schoolName: 'S B Modern High School',
      sessionStart: '2026-06-15',
      schoolType: 'Government school',
      currentClass: 'Class 11',
      attendance: 'Irregular',
      fees: 2100,
      tuition: 7200,
      books: 1000,
      stationery: 1500,
      uniform: 2000,
      transport: 3200,
      other: 1000,
      totalCost: 18000,
      remarks: 'Phase 3 educational aid recommended. Low income family.',
      approval: 'Approved',
      cbo: 'Amra Padatik',
      submitter: 'Juli Yadav',
      email: 'amrapadatik@gmail.com'
    },
    {
      uniqueId: 'WB-KOL-081205-02',
      childName: 'Puja Saha',
      submittedBy: 'Asthi Saha',
      consent: 'Yes',
      visitDate: '2026-06-25',
      dob: '2008-11-01',
      age: 17,
      gender: 'Female',
      orphanStatus: 'Both Alive',
      caregiverName: 'Asthi Saha',
      caregiverRelation: 'Mother',
      caregiverContact: '9003684983',
      address: '15/1 Sujendra Seth lane, Kolkata - 700006',
      state: 'West Bengal',
      district: 'Kolkata',
      accountHolder: 'Asthi Saha',
      accountNo: '20491823901',
      ifsc: 'CBIN0281045',
      bankMobile: '9003684983',
      aadhaarNo: 'XXXX-XXXX-4983',
      familyMembers: 4,
      children: 2,
      monthlyIncome: 7500,
      incomeSource: 'Tailoring & Domestic work',
      weight: 42,
      height: 152,
      bmi: 18.2,
      bmiCat: 'Normal',
      hb: 11.8,
      hbCat: 'Mild Anemia',
      comorbidities: 'None',
      comorbiditiesOther: '',
      artStatus: 'On ART',
      artRegDate: '2019-08-22',
      artId: 'WB-KOL-8394',
      vlStatus: 'Tested in last 6 months',
      vlDate: '2026-04-10',
      vlCopies: '< 50',
      vlCat: 'Undetectable (<50 copies/mL)',
      appetite: 'Good',
      meals: 3,
      eduStatus: 'School Going',
      eduOther: '',
      schoolName: 'Kolkata Girls High School',
      sessionStart: '2026-06-15',
      schoolType: 'Government school',
      currentClass: 'Class 12',
      attendance: 'Regular',
      fees: 1800,
      tuition: 6000,
      books: 1200,
      stationery: 800,
      uniform: 1500,
      transport: 2400,
      other: 500,
      totalCost: 14200,
      remarks: 'Approved for nutrition ration basket and books grant.',
      approval: 'Approved',
      cbo: 'Amra Padatik',
      submitter: 'Asthi Saha',
      email: 'amrapadatik@gmail.com'
    },
    {
      uniqueId: 'WB-KOL-081210-03',
      childName: 'Neha Sinha',
      submittedBy: 'Naresh Sinha',
      consent: 'Yes',
      visitDate: '2026-06-25',
      dob: '2008-11-16',
      age: 17,
      gender: 'Female',
      orphanStatus: 'Single Orphan',
      caregiverName: 'Naresh Sinha',
      caregiverRelation: 'Father',
      caregiverContact: '9585888810',
      address: '15/1, Sujendra seth lane, Kolkata 700006',
      state: 'West Bengal',
      district: 'Kolkata',
      accountHolder: 'Naresh Sinha',
      accountNo: '10928374619',
      ifsc: 'PUNB0182700',
      bankMobile: '9585888810',
      aadhaarNo: 'XXXX-XXXX-8810',
      familyMembers: 3,
      children: 1,
      monthlyIncome: 5500,
      incomeSource: 'Tea stall vendor',
      weight: 45,
      height: 156,
      bmi: 18.5,
      bmiCat: 'Normal',
      hb: 12.2,
      hbCat: 'Normal',
      comorbidities: 'None',
      comorbiditiesOther: '',
      artStatus: 'On ART',
      artRegDate: '2021-02-14',
      artId: 'WB-KOL-8522',
      vlStatus: 'Tested in last 6 months',
      vlDate: '2026-05-18',
      vlCopies: '< 50',
      vlCat: 'Undetectable (<50 copies/mL)',
      appetite: 'Good',
      meals: 3,
      eduStatus: 'School Going',
      eduOther: '',
      schoolName: 'Seth Anandram Jaipuria College',
      sessionStart: '2026-06-15',
      schoolType: 'Government school',
      currentClass: 'Class 12',
      attendance: 'Regular',
      fees: 2400,
      tuition: 4800,
      books: 1500,
      stationery: 1000,
      uniform: 1800,
      transport: 1800,
      other: 600,
      totalCost: 13900,
      remarks: 'Eligible for Phase 3 stationery and tuition grant.',
      approval: 'Approved',
      cbo: 'Amra Padatik',
      submitter: 'Naresh Sinha',
      email: 'amrapadatik@gmail.com'
    }
  ];

  var now = new Date().toISOString();

  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    var childFolder = getOrCreateChildFolder_(s.childName, s.uniqueId);

    var r = new Array(COLUMN_HEADERS.length);
    r[0] = s.uniqueId;
    r[1] = now;
    r[2] = s.submittedBy;
    r[3] = s.consent;
    r[4] = processDocumentUpload_(PLACEHOLDER_DOCS.SIGNATURE, childFolder, 'Signature', s.uniqueId);
    r[5] = s.visitDate;
    r[6] = 'Field Caseworker';
    r[7] = s.childName;
    r[8] = s.dob;
    r[9] = s.age;
    r[10] = s.gender;
    r[11] = s.orphanStatus;
    r[12] = s.caregiverName;
    r[13] = s.caregiverRelation;
    r[14] = s.caregiverContact;
    r[15] = s.address;
    r[16] = s.state;
    r[17] = s.district;
    r[18] = s.accountHolder;
    r[19] = s.accountNo;
    r[20] = s.ifsc;
    r[21] = s.bankMobile;
    r[22] = s.aadhaarNo;
    r[23] = processDocumentUpload_(PLACEHOLDER_DOCS.PASSBOOK, childFolder, 'Passbook', s.uniqueId);
    r[24] = processDocumentUpload_(PLACEHOLDER_DOCS.AADHAAR, childFolder, 'Aadhaar', s.uniqueId);
    r[25] = processDocumentUpload_(PLACEHOLDER_DOCS.CHILD_PHOTO, childFolder, 'Child_Photo', s.uniqueId);
    r[26] = s.familyMembers;
    r[27] = s.children;
    r[28] = s.monthlyIncome;
    r[29] = s.incomeSource;
    r[30] = s.weight;
    r[31] = s.height;
    r[32] = s.bmi;
    r[33] = s.bmiCat;
    r[34] = s.hb;
    r[35] = s.hbCat;
    r[36] = s.comorbidities;
    r[37] = s.comorbiditiesOther;
    r[38] = s.artStatus;
    r[39] = s.artRegDate;
    r[40] = s.artId;
    r[41] = s.vlStatus;
    r[42] = s.vlDate;
    r[43] = s.vlCopies;
    r[44] = s.vlCat;
    r[45] = s.appetite;
    r[46] = s.meals;
    r[47] = s.eduStatus;
    r[48] = s.eduOther;
    r[49] = s.schoolName;
    r[50] = s.sessionStart;
    r[51] = s.schoolType;
    r[52] = s.currentClass;
    r[53] = s.attendance;
    r[54] = s.fees;
    r[55] = s.tuition;
    r[56] = s.books;
    r[57] = s.stationery;
    r[58] = s.uniform;
    r[59] = s.transport;
    r[60] = s.other;
    r[61] = s.totalCost;
    r[62] = processDocumentUpload_(PLACEHOLDER_DOCS.FEE_RECEIPT, childFolder, 'Fee_Receipt', s.uniqueId);
    r[63] = processDocumentUpload_(PLACEHOLDER_DOCS.MARKSHEET, childFolder, 'Marksheet', s.uniqueId);
    r[64] = s.remarks;
    r[65] = s.approval;
    r[66] = 'Yes';
    r[67] = s.cbo;
    r[68] = s.submitter;
    r[69] = s.email;
    r[70] = 'NO';
    r[71] = now;

    sheet.appendRow(r);
    var rowIdx = sheet.getLastRow();
    formatDataRow_(sheet, rowIdx);
  }

  return 'Successfully configured 72-column linelist with Drive child-namewise folders and in-cell images.';
}

function formatSheetLinelistDesign() {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  for (var r = 4; r <= lastRow; r++) {
    formatDataRow_(sheet, r);
  }
  return 'Linelist formatting complete.';
}

function verifyDriveDocumentFolders() {
  var root = getOrCreateRootDocumentsFolder_();
  var subFolders = root.getFolders();
  var list = [];
  while (subFolders.hasNext()) {
    var f = subFolders.next();
    list.push(f.getName() + ' (' + f.getUrl() + ')');
  }
  Logger.log('Drive Folders: ' + JSON.stringify(list));
  return list;
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
