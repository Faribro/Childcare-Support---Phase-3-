/**
 * Google Apps Script Backend Adapter — Phase 3 Rectified Linelist Architecture
 * Target Sheet ID: 1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA
 *
 * Implements:
 * - 73-Column Schema with "1\nUnique ID" and "2\nRevision Number"
 * - Auto-incrementing Revision Number (1 on create, 2, 3... on each OCC update)
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

// Exact 73 Rectified Column Headers (Number on top + newline)
var COLUMN_HEADERS = [
  "1\nUnique ID",
  "2\nRevision Number",
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

// Document Columns with 1-based indexing in the 73-column schema
var DOC_COLUMNS = {
  SIGNATURE: 6,
  PASSBOOK: 25,
  AADHAAR: 26,
  CHILD_PHOTO: 27,
  FEE_RECEIPT: 64,
  MARKSHEET: 65
};

// Pastel Category Background Fills matching the reference sheet
var HEADER_CATEGORIES = [
  { start: 1, end: 8, color: '#D9E2F3' },   // Intake, Revision & Consent (Pale Blue)
  { start: 9, end: 19, color: '#E2EFDA' },  // Child Demographics & Residence (Pale Green)
  { start: 20, end: 27, color: '#FFF2CC' }, // Banking & KYC Documents (Pale Yellow)
  { start: 28, end: 31, color: '#EDEDED' }, // Household & Socio-Economic (Pale Gray)
  { start: 32, end: 46, color: '#FCE4D6' }, // Health, ART & Clinical (Pale Salmon/Rose)
  { start: 47, end: 48, color: '#E2EFDA' }, // Nutrition & Habits (Pale Green)
  { start: 49, end: 55, color: '#D9E2F3' }, // Education Status (Pale Blue)
  { start: 56, end: 66, color: '#FFF2CC' }, // Education Expenses & Documents (Pale Orange)
  { start: 67, end: 73, color: '#D9E2F3' }  // Programme Governance & Audit (Pale Blue/Slate)
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
      .addItem('Clear All Data Rows (Preserve Headers)', 'clearAllDataRows')
      .addItem('Setup Clean 73-Column Linelist (Empty)', 'setupCleanSheet')
      .addItem('Setup 73 Rectified Headers & Insert Samples', 'runSetupAndInsertSampleRows')
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

  // Enforce fail-closed authentication for all data operations
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!expectedSecret) {
    return errorResponse_('Configuration Error: WEBHOOK_SECRET not configured in Script Properties.', 503);
  }
  var providedSecret = e && e.parameter && e.parameter.secret;
  if (providedSecret !== expectedSecret) {
    return errorResponse_('Unauthorized: Invalid webhook secret.', 401);
  }

  if (action === 'setup') {
    var result = runSetupAndInsertSampleRows();
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', message: result })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'setupClean') {
    var cleanResult = setupCleanSheet();
    return ContentService.createTextOutput(
      JSON.stringify(cleanResult)
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'clear' || action === 'clearData') {
    var clearResult = clearAllDataRows();
    return ContentService.createTextOutput(
      JSON.stringify(clearResult)
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

    // Fail-closed webhook secret authentication
    var expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!expectedSecret) {
      return errorResponse_('Configuration Error: WEBHOOK_SECRET not configured in Script Properties.', 503);
    }
    var providedSecret = (payload && payload.secret) || (e.parameter && e.parameter.secret);
    if (providedSecret !== expectedSecret) {
      return errorResponse_('Unauthorized: Invalid webhook secret.', 401);
    }

    var action = payload.action || 'create';

    if (action === 'create') {
      return handleCreate_(payload);
    }

    if (action === 'update') {
      return handleUpdate_(payload);
    }

    if (action === 'read') {
      return handleRead_(payload);
    }

    if (action === 'list') {
      return handleList_(payload);
    }

    if (action === 'delete') {
      return handleDelete_(payload);
    }

    if (action === 'clear' || action === 'clearData') {
      var clearPostResult = clearAllDataRows();
      return ContentService.createTextOutput(
        JSON.stringify(clearPostResult)
      ).setMimeType(ContentService.MimeType.JSON);
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

    // Merge B1:BU1 (Columns 2 to 73)
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

    // --- ROW 3: Rectified 73 Headers ---
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
    } else if (i === 2) { // Revision Number
      sheet.setColumnWidth(i, 80);
    } else if (i === 9 || i === 14) { // Child Name / Caregiver Name
      sheet.setColumnWidth(i, 150);
    } else if (i === 17) { // Address
      sheet.setColumnWidth(i, 220);
    } else if (i === 51) { // School Name
      sheet.setColumnWidth(i, 180);
    } else if (i === 66) { // Remarks
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
    // Create folder with default restricted domain/owner ACLs (Public link sharing disabled)
    var root = DriveApp.createFolder(ROOT_DOCUMENTS_FOLDER_NAME);
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

    // 3. Create brand new child folder with restricted inheritance (Public link sharing disabled)
    var newFolder = rootFolder.createFolder(expectedFolderName);
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

      // Create file with default private inheritance (Public link sharing disabled)
      var newFile = childFolder ? childFolder.createFile(blob) : DriveApp.createFile(blob);
      var fileId = newFile.getId();

      // Return opaque, authenticated Google Workspace file link (requires authorized institutional login)
      var restrictedViewUrl = 'https://drive.google.com/file/d/' + fileId + '/view';
      return '=HYPERLINK("' + restrictedViewUrl + '", "Restricted Doc [' + docPrefix + ']")';
    } catch (driveErr) {
      Logger.log('DriveApp upload exception: ' + driveErr);
      return 'DATA_URL_STORED_PENDING_AUTH';
    }
  }

  // Handle Google Drive Link
  var driveId = extractDriveId_(val);
  if (driveId) {
    var restrictedViewUrl = 'https://drive.google.com/file/d/' + driveId + '/view';
    return '=HYPERLINK("' + restrictedViewUrl + '", "Restricted Document")';
  }

  // Handle standard web image URL - sanitize to avoid embedding public URLs
  if (val.indexOf('http://') === 0 || val.indexOf('https://') === 0) {
    return '=HYPERLINK("' + val + '", "External Document Reference")';
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
        var currentRev = parseInt(existingRow[1], 10) || 1;
        return ContentService.createTextOutput(
          JSON.stringify({
            status: 'success',
            acknowledged: true,
            remoteSubmissionId: String(existingRow[0]),
            clientSubmissionId: uniqueId,
            uniqueId: String(existingRow[0]),
            revisionNumber: currentRev,
            version: currentRev,
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

  // Build the 73-value array matching COLUMN_HEADERS 1-to-1
  var row = new Array(COLUMN_HEADERS.length);

  row[0] = uniqueId; // 1 Unique ID
  row[1] = 1;        // 2 Revision Number (Initial creation is Rev 1)
  row[2] = payload.submissionTime || payload.createdAt || now; // 3 Submission Time
  row[3] = f.formSubmittedBy || payload.formSubmittedBy || payload.interviewerName || ''; // 4 Submitted By
  row[4] = (payload.consent && (payload.consent.agreeToParticipate || payload.consent.consentGiven)) ||
           payload.consentObtained === 'Yes' ? 'Yes' : 'No'; // 5 Consent Obtained

  // 6 Signature / Thumb Impression — In-cell embedded formula
  var sigVal = payload.signatureDataUrl || (payload.consent && payload.consent.signatureDataUrl) ||
               (payload.caregiverConsent && payload.caregiverConsent.signatureDataUrl) ||
               payload.signatureUrl || (payload.caregiverConsent && payload.caregiverConsent.signatureUrl) ||
               payload.signatureStatus || '';
  row[5] = sigVal ? processDocumentUpload_(sigVal, childFolder, 'Signature', uniqueId) : 'CAPTURED_LOCAL';

  row[6] = d.dateOfFilling || payload.visitDate || now.split('T')[0]; // 7 Visit Date
  row[7] = payload.interviewerName || f.formSubmittedBy || ''; // 8 Interviewer Name
  row[8] = childName; // 9 Child Name
  row[9] = d.dob || payload.dob || ''; // 10 Date of Birth
  row[10] = d.calculatedAgeYears !== undefined ? d.calculatedAgeYears : (payload.age || ''); // 11 Age
  row[11] = d.gender || payload.gender || 'Male'; // 12 Gender
  row[12] = d.orphanStatus || payload.orphanStatus || ''; // 13 Orphan Status
  row[13] = d.caregiverName || payload.caregiverFullName || payload.caregiverName || ''; // 14 Caregiver Full Name
  row[14] = d.caregiverRelationship || payload.caregiverRelation || ''; // 15 Caregiver Relation
  row[15] = d.contactNumber || d.caregiverPhone || payload.caregiverContact || ''; // 16 Caregiver Contact
  row[16] = d.fullAddress || payload.address || ''; // 17 Address
  row[17] = d.state || payload.state || 'Maharashtra'; // 18 State
  row[18] = d.district || payload.district || 'Pune'; // 19 District
  row[19] = b.bankAccountHolderName || b.accountHolderName || payload.bankAccountHolderName || ''; // 20 Bank Account Holder Name
  row[20] = b.bankAccountNumber || b.accountNumber || payload.bankAccountNumber || ''; // 21 Bank Account Number
  row[21] = b.bankIfscCode || b.ifscCode || payload.bankIfscCode || ''; // 22 Bank IFSC Code
  row[22] = b.bankLinkedMobileNumber || payload.bankLinkedMobileNumber || ''; // 23 Bank Linked Mobile Number
  row[23] = b.childAadhaarNumber || d.childAadhaarNumber || payload.childAadhaarNumber || ''; // 24 Child Aadhaar Number

  // KYC Image Links (Cols 25, 26, 27) — In-cell embedded formulas
  row[24] = processDocumentUpload_(b.passbookPhotoUrl || d.passbookPhotoUrl || payload.passbookFrontPageLink || payload.passbookPhotoUrl, childFolder, 'Passbook', uniqueId);
  row[25] = processDocumentUpload_(b.aadhaarCardPhotoUrl || d.aadhaarCardPhotoUrl || payload.aadhaarCardLink || payload.aadhaarCardPhotoUrl, childFolder, 'Aadhaar', uniqueId);
  row[26] = processDocumentUpload_(b.childPhotoUrl || d.childPhotoUrl || payload.passportSizePhotoLink || payload.childPhotoUrl, childFolder, 'Child_Photo', uniqueId);

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

  // Education Photo Links (Cols 64, 65) — In-cell embedded formulas
  row[63] = processDocumentUpload_(exp.feeReceiptPhotoUrl || e.feeReceiptPhotoUrl || payload.feeReceiptPhotoUrl || payload.schoolFeeReceiptLink, childFolder, 'Fee_Receipt', uniqueId);
  row[64] = processDocumentUpload_(exp.marksheetPhotoUrl || e.marksheetPhotoUrl || payload.marksheetPhotoUrl || payload.marksheetPhotoLink, childFolder, 'Marksheet', uniqueId);

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
      remoteSubmissionId: uniqueId,
      clientSubmissionId: uniqueId,
      uniqueId: uniqueId,
      revisionNumber: 1,
      version: 1,
      rowNumber: newRowIndex,
      totalColumns: COLUMN_HEADERS.length,
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

  if (payload.patch && typeof payload.patch === 'object') {
    for (var pk in payload.patch) {
      if (payload.patch.hasOwnProperty(pk) && !payload.hasOwnProperty(pk)) {
        payload[pk] = payload.patch[pk];
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

  // OCC Version & Revision Check
  var currentRevision = 1;
  var rawRev = sheet.getRange(foundRow, 2).getValue();
  if (rawRev) {
    currentRevision = parseInt(rawRev, 10) || 1;
  }

  var expectedRev = payload.expectedRevision !== undefined ? payload.expectedRevision :
                   (payload.expectedVersion !== undefined ? payload.expectedVersion : payload.baseVersion);

  // Idempotency check: If an update retry arrives where currentRevision equals expectedRev + 1
  // and the payload has an idempotencyKey / requestId that was already applied, return existing revision without bumping.
  var updateIdempotencyKey = payload.idempotencyKey || payload.requestId;
  var lastUpdatedTime = sheet.getRange(foundRow, 73).getValue();
  if (expectedRev !== undefined && currentRevision === (expectedRev + 1) && updateIdempotencyKey) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        acknowledged: true,
        remoteSubmissionId: targetId,
        uniqueId: targetId,
        revisionNumber: currentRevision,
        version: currentRevision,
        rowNumber: foundRow,
        updatedAt: lastUpdatedTime || new Date().toISOString(),
        isDuplicate: true,
        idempotencyNote: 'Idempotent update retry recognized. Existing revision returned.',
        requestId: payload.requestId || '',
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (expectedRev !== undefined && currentRevision > expectedRev) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'error',
        code: 'OCC_CONFLICT',
        message: 'Concurrent modification conflict. Sheet has newer revision ' + currentRevision + ' (expected ' + expectedRev + ')',
        currentRevision: currentRevision,
        currentVersion: currentRevision,
        expectedRevision: expectedRev,
        expectedVersion: expectedRev,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // Increment Revision Number on Column 2
  var nextRevision = currentRevision + 1;
  sheet.getRange(foundRow, 2).setValue(nextRevision);

  var childName = payload.childName || (payload.demographics && payload.demographics.childName) || existingRow[8] || '';
  var childFolder = getOrCreateChildFolder_(childName, targetId);

  // Mappings shifted by +1 for 73-column layout
  var allowedDirectMap = {
    childName: 9,
    dob: 10,
    age: 11,
    gender: 12,
    orphanStatus: 13,
    caregiverName: 14,
    caregiverFullName: 14,
    caregiverRelationship: 15,
    caregiverRelation: 15,
    contactNumber: 16,
    caregiverPhone: 16,
    caregiverContact: 16,
    fullAddress: 17,
    address: 17,
    state: 18,
    district: 19,
    bankAccountHolderName: 20,
    bankAccountNumber: 21,
    bankIfscCode: 22,
    bankLinkedMobileNumber: 23,
    childAadhaarNumber: 24,
    totalFamilyMembers: 28,
    householdMembers: 28,
    numberOfChildrenUnder18: 29,
    noOfChildren: 29,
    monthlyIncomeRs: 30,
    monthlyIncome: 30,
    mainSourceOfIncome: 31,
    incomeSource: 31,
    weightKg: 32,
    currentWeightKg: 32,
    heightCm: 33,
    currentHeightCm: 33,
    bmi: 34,
    bmiCategory: 35,
    haemoglobinGdl: 36,
    hemoglobinGdl: 36,
    hbCategory: 37,
    comorbidities: 38,
    comorbiditiesOther: 39,
    artStatus: 40,
    artRegistrationDate: 41,
    artIdNumber: 42,
    vlStatus: 43,
    vlDate: 44,
    viralLoad: 45,
    vlCategory: 46,
    appetite: 47,
    mealsPerDay: 48,
    educationStatus: 49,
    educationStatusSpecify: 50,
    schoolName: 51,
    schoolSessionStartDate: 52,
    schoolType: 53,
    currentClass: 54,
    attendance: 55,
    attendanceStatus: 55,
    schoolFees: 56,
    tuitionFees: 57,
    privateTuitionFee: 57,
    books: 58,
    schoolBooks: 58,
    stationery: 59,
    schoolStationery: 59,
    uniform: 60,
    schoolUniform: 60,
    transport: 61,
    schoolTransport: 61,
    otherExpenses: 62,
    schoolOtherExpenses: 62,
    totalAnnualCost: 63,
    totalAnnualEducationCost: 63,
    remarks: 66,
    approvedAllianceIndia: 67,
    reviewConfirmed: 68,
    organizationName: 69,
    formSubmittedBy: 70,
    organizationEmail: 71,
    syncNeeded: 72
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
    if (d.childName !== undefined) sheet.getRange(foundRow, 9).setValue(d.childName);
    if (d.dob !== undefined) sheet.getRange(foundRow, 10).setValue(d.dob);
    if (d.calculatedAgeYears !== undefined) sheet.getRange(foundRow, 11).setValue(d.calculatedAgeYears);
    if (d.gender !== undefined) sheet.getRange(foundRow, 12).setValue(d.gender);
    if (d.orphanStatus !== undefined) sheet.getRange(foundRow, 13).setValue(d.orphanStatus);
    if (d.caregiverName !== undefined) sheet.getRange(foundRow, 14).setValue(d.caregiverName);
    if (d.caregiverRelationship !== undefined) sheet.getRange(foundRow, 15).setValue(d.caregiverRelationship);
    if (d.contactNumber !== undefined) sheet.getRange(foundRow, 16).setValue(d.contactNumber);
    if (d.fullAddress !== undefined) sheet.getRange(foundRow, 17).setValue(d.fullAddress);
    if (d.state !== undefined) sheet.getRange(foundRow, 18).setValue(d.state);
    if (d.district !== undefined) sheet.getRange(foundRow, 19).setValue(d.district);
    if (d.childAadhaarNumber !== undefined) sheet.getRange(foundRow, 24).setValue(d.childAadhaarNumber);
  }

  var b = payload.bankingAndKyc || payload.bankDetails || payload.caregiverHousehold;
  if (b) {
    if (b.bankAccountHolderName !== undefined) sheet.getRange(foundRow, 20).setValue(b.bankAccountHolderName);
    if (b.bankAccountNumber !== undefined) sheet.getRange(foundRow, 21).setValue(b.bankAccountNumber);
    if (b.bankIfscCode !== undefined) sheet.getRange(foundRow, 22).setValue(b.bankIfscCode);
    if (b.bankLinkedMobileNumber !== undefined) sheet.getRange(foundRow, 23).setValue(b.bankLinkedMobileNumber);
    if (b.childAadhaarNumber !== undefined) sheet.getRange(foundRow, 24).setValue(b.childAadhaarNumber);
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

  // Update Last Updated column (Col 73)
  var now = new Date().toISOString();
  sheet.getRange(foundRow, 73).setValue(now);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: targetId,
      uniqueId: targetId,
      revisionNumber: nextRevision,
      version: nextRevision,
      rowNumber: foundRow,
      updatedAt: now,
      requestId: payload.requestId || ('req-' + Utilities.getUuid()),
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
        JSON.stringify({
          status: 'success',
          data: record,
          rowNumber: rowIndex,
          uniqueId: values[0],
          revisionNumber: values[1],
        })
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
    r[1] = 1; // Revision Number 1
    r[2] = now;
    r[3] = s.submittedBy;
    r[4] = s.consent;
    r[5] = processDocumentUpload_(PLACEHOLDER_DOCS.SIGNATURE, childFolder, 'Signature', s.uniqueId);
    r[6] = s.visitDate;
    r[7] = 'Field Caseworker';
    r[8] = s.childName;
    r[9] = s.dob;
    r[10] = s.age;
    r[11] = s.gender;
    r[12] = s.orphanStatus;
    r[13] = s.caregiverName;
    r[14] = s.caregiverRelation;
    r[15] = s.caregiverContact;
    r[16] = s.address;
    r[17] = s.state;
    r[18] = s.district;
    r[19] = s.accountHolder;
    r[20] = s.accountNo;
    r[21] = s.ifsc;
    r[22] = s.bankMobile;
    r[23] = s.aadhaarNo;
    r[24] = processDocumentUpload_(PLACEHOLDER_DOCS.PASSBOOK, childFolder, 'Passbook', s.uniqueId);
    r[25] = processDocumentUpload_(PLACEHOLDER_DOCS.AADHAAR, childFolder, 'Aadhaar', s.uniqueId);
    r[26] = processDocumentUpload_(PLACEHOLDER_DOCS.CHILD_PHOTO, childFolder, 'Child_Photo', s.uniqueId);
    r[27] = s.familyMembers;
    r[28] = s.children;
    r[29] = s.monthlyIncome;
    r[30] = s.incomeSource;
    r[31] = s.weight;
    r[32] = s.height;
    r[33] = s.bmi;
    r[34] = s.bmiCat;
    r[35] = s.hb;
    r[36] = s.hbCat;
    r[37] = s.comorbidities;
    r[38] = s.comorbiditiesOther;
    r[39] = s.artStatus;
    r[40] = s.artRegDate;
    r[41] = s.artId;
    r[42] = s.vlStatus;
    r[43] = s.vlDate;
    r[44] = s.vlCopies;
    r[45] = s.vlCat;
    r[46] = s.appetite;
    r[47] = s.meals;
    r[48] = s.eduStatus;
    r[49] = s.eduOther;
    r[50] = s.schoolName;
    r[51] = s.sessionStart;
    r[52] = s.schoolType;
    r[53] = s.currentClass;
    r[54] = s.attendance;
    r[55] = s.fees;
    r[56] = s.tuition;
    r[57] = s.books;
    r[58] = s.stationery;
    r[59] = s.uniform;
    r[60] = s.transport;
    r[61] = s.other;
    r[62] = s.totalCost;
    r[63] = processDocumentUpload_(PLACEHOLDER_DOCS.FEE_RECEIPT, childFolder, 'Fee_Receipt', s.uniqueId);
    r[64] = processDocumentUpload_(PLACEHOLDER_DOCS.MARKSHEET, childFolder, 'Marksheet', s.uniqueId);
    r[65] = s.remarks;
    r[66] = s.approval;
    r[67] = 'Yes';
    r[68] = s.cbo;
    r[69] = s.submitter;
    r[70] = s.email;
    r[71] = 'NO';
    r[72] = now;

    sheet.appendRow(r);
    var rowIdx = sheet.getLastRow();
    formatDataRow_(sheet, rowIdx);
  }

  return 'Successfully configured 73-column linelist with Revision Number, Drive child-namewise folders and in-cell images.';
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

function clearAllDataRows() {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();
  var count = 0;
  if (lastRow >= 4) {
    count = lastRow - 3;
    sheet.deleteRows(4, count);
  }
  return {
    status: 'success',
    message: 'Successfully purged ' + count + ' data row(s). 73-column headers preserved.',
    deletedCount: count,
    remainingRows: sheet.getLastRow(),
  };
}

function setupCleanSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  }
  var sheet = ss.getSheetByName(PRIMARY_SHEET_NAME) || ss.getSheets()[0];
  sheet.setName(PRIMARY_SHEET_NAME);

  // Clear existing content and initialize fresh 3-row layout without dummy rows
  sheet.clear();
  ensureHeaders_(sheet);

  return {
    status: 'success',
    message: 'Successfully initialized clean 73-column linelist with 0 data rows.',
    totalRows: sheet.getLastRow(),
  };
}

function handleDelete_(payload) {
  var targetId = payload.uniqueId || payload.artNumber || payload.uuid || payload.submissionId || payload.remoteSubmissionId;
  if (!targetId) {
    return errorResponse_('Missing uniqueId or submissionId for deletion.', 400);
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

  sheet.deleteRow(foundRow);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      message: 'Record ' + targetId + ' deleted successfully from sheet.',
      deletedId: targetId,
      deletedRow: foundRow,
      remainingRows: sheet.getLastRow() - 3,
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
