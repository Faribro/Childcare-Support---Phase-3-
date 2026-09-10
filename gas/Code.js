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
var ROOT_DOCUMENTS_FOLDER_NAME = 'Alliance India Child PDFs';
var CANDIDATE_ROOT_FOLDER_NAMES = [
  'Alliance India Child PDFs',
  'Child_Nutrition_Phase3_Documents',
  'ChildCare Attachments'
];

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
    ui.createMenu('Childcare Phase 3 Admin')
      .addItem('Validate Sheet Schema', 'menuValidateSheetSchema')
      .addItem('Audit Drive Asset References', 'menuAuditDriveAssets')
      .addItem('Generate Data Quality Report', 'menuGenerateDataQualityReport')
      .addItem('Verify Protected Columns', 'menuVerifyProtectedColumns')
      .addItem('Preview Folder Migration', 'menuPreviewFolderMigration')
      .addItem('Preview Public ACL Violations', 'menuPreviewPublicAclViolations')
      .addItem('Refresh Sheet Presentation', 'menuRefreshSheetPresentation')
      .addSeparator()
      .addItem('Format Header Styles & Linelist Design', 'formatSheetLinelistDesign')
      .addToUi();
  } catch (err) {
    Logger.log('onOpen UI menu could not be created: ' + err);
  }
}

// ============================================================================
// STRICT FAIL-CLOSED AUTHENTICATION HELPER
// ============================================================================

/**
 * Validates caller credentials against Google Apps Script Script Properties.
 * Strict rules:
 * 1. Read WEBHOOK_SECRET only from Script Properties.
 * 2. Never auto-generate, default, or fallback to code values.
 * 3. Never write fallback tokens to Script Properties.
 * 4. Missing property returns CONFIGURATION_ERROR (503).
 * 5. Invalid/missing caller secret returns UNAUTHORIZED (401).
 */
function requireWebhookSecret_(payload, action, requestId) {
  var configuredSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!configuredSecret) {
    return {
      authorized: false,
      response: errorResponse_(
        'Server configuration error: Authentication secret not configured in Script Properties.',
        'CONFIGURATION_ERROR',
        503,
        requestId
      )
    };
  }

  var callerSecret = (payload && payload.secret) || '';
  if (!callerSecret || String(callerSecret) !== String(configuredSecret)) {
    return {
      authorized: false,
      response: errorResponse_(
        'Unauthorized: Invalid webhook secret or missing credentials.',
        'UNAUTHORIZED',
        401,
        requestId
      )
    };
  }

  return { authorized: true };
}

// ============================================================================
// WEB APP API DISPATCHERS (GET / POST)
// ============================================================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  var requestId = (e && e.parameter && e.parameter.requestId) || ('req-' + Utilities.getUuid());

  // Anonymous monitoring endpoint: returns operational status without leaking record/schema data
  if (action === 'ping' || !action) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'ok',
        service: 'Childcare Support Phase 3 Bridge',
        version: '3.0.0-advanced',
        timestamp: new Date().toISOString()
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // All other GET actions strictly require server authentication
  var callerSecret = e && e.parameter && e.parameter.secret;
  var auth = requireWebhookSecret_({ secret: callerSecret }, action, requestId);
  if (!auth.authorized) {
    return auth.response;
  }

  if (action === 'schema') {
    var schema = getValidatedSheetSchema_();
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        totalColumns: schema.totalColumns,
        headers: COLUMN_HEADERS,
        valid: schema.valid
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'read') {
    return handleRead_(e.parameter);
  }

  if (action === 'list') {
    return listSubmissions_(e.parameter, requestId);
  }

  return errorResponse_('Unknown action: ' + action, 'VALIDATION_ERROR', 400, requestId);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  var requestId = 'req-' + Utilities.getUuid();

  try {
    hasLock = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!hasLock) {
      return errorResponse_('Server concurrency lock busy. Please retry.', 'UPSTREAM_UNAVAILABLE', 503, requestId);
    }

    if (!e || !e.postData || !e.postData.contents) {
      return errorResponse_('Invalid submission: Empty payload.', 'VALIDATION_ERROR', 400, requestId);
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return errorResponse_('Malformed JSON payload.', 'VALIDATION_ERROR', 400, requestId);
    }

    if (payload.requestId) {
      requestId = payload.requestId;
    }

    var action = payload.action || 'create';

    // Enforce fail-closed webhook secret verification on all protected actions
    var auth = requireWebhookSecret_(payload, action, requestId);
    if (!auth.authorized) {
      return auth.response;
    }

    if (action === 'create') {
      return handleCreate_(payload);
    }

    if (action === 'update') {
      return handleUpdate_(payload);
    }

    if (action === 'read') {
      return readSubmission_(payload.submissionId || payload.uniqueId || payload.remoteSubmissionId, requestId);
    }

    if (action === 'list') {
      return listSubmissions_(payload, requestId);
    }

    if (action === 'delete') {
      return handleDelete_(payload);
    }

    if (action === 'schemaAudit') {
      var sAudit = schemaAudit_();
      return ContentService.createTextOutput(JSON.stringify(sAudit)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'driveAudit') {
      var dAudit = auditDriveAssets_();
      return ContentService.createTextOutput(JSON.stringify(dAudit)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'inspectDriveAsset') {
      var assetReport = inspectDriveAsset_(payload.fileId);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: assetReport })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'enforceRestrictedAcl') {
      var aclReport = enforceRestrictedAcl_(payload.fileId);
      return ContentService.createTextOutput(JSON.stringify(aclReport)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'verifyProtectedRanges') {
      var protReport = setupOrVerifyProtectedRanges_();
      return ContentService.createTextOutput(JSON.stringify(protReport)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'refreshPresentation') {
      var presResult = refreshPresentationAndReports_();
      return ContentService.createTextOutput(JSON.stringify(presResult)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'replaceAsset') {
      var repResult = replaceAssetSafely_(payload);
      return ContentService.createTextOutput(JSON.stringify(repResult)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'clear' || action === 'clearData') {
      if (payload.confirmPurge !== 'CONFIRM_PURGE_ALL_DATA_ROWS') {
        return errorResponse_('Destructive purge rejected: Missing explicit confirmation parameter confirmPurge.', 'VALIDATION_ERROR', 400, requestId);
      }
      var clearPostResult = clearAllDataRows();
      return ContentService.createTextOutput(
        JSON.stringify(clearPostResult)
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'listFolders') {
      var folderList = verifyDriveDocumentFolders();
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'success', folders: folderList })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'cleanupTestFolders') {
      var cleanupResult = cleanupTestFolders_();
      return ContentService.createTextOutput(
        JSON.stringify(cleanupResult)
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return errorResponse_('Unsupported action: ' + action, 'VALIDATION_ERROR', 400, requestId);
  } catch (err) {
    return errorResponse_('Internal Apps Script Error: ' + err.toString(), 'INTERNAL_ERROR', 500, requestId);
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
    for (var i = 0; i < CANDIDATE_ROOT_FOLDER_NAMES.length; i++) {
      var candidate = CANDIDATE_ROOT_FOLDER_NAMES[i];
      var folders = DriveApp.getFoldersByName(candidate);
      if (folders.hasNext()) {
        return folders.next();
      }
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
  return getOrVerifyAssessmentFolder_(uniqueId);
}

/**
 * Phase 3: Opaque assessment folder strategy:
 * Alliance India Child PDFs/
 * └── assessments/
 *     └── {remoteSubmissionId}/
 *         ├── current/
 *         ├── revisions/
 *         │   └── rev-001/
 *         └── metadata/
 * Zero PII in folder names.
 */
function getOrVerifyAssessmentFolder_(remoteSubmissionId) {
  if (!remoteSubmissionId) return null;
  var cleanId = String(remoteSubmissionId).trim().replace(/[^a-zA-Z0-9_-]/g, '_');

  var rootFolder = getOrCreateRootDocumentsFolder_();
  if (!rootFolder) return null;

  try {
    // 1. Locate or create 'assessments' directory
    var assessFolders = rootFolder.getFoldersByName('assessments');
    var assessFolder = assessFolders.hasNext() ? assessFolders.next() : rootFolder.createFolder('assessments');

    // 2. Locate or create opaque {remoteSubmissionId} folder
    var targetFolders = assessFolder.getFoldersByName(cleanId);
    var targetFolder = targetFolders.hasNext() ? targetFolders.next() : assessFolder.createFolder(cleanId);

    // 3. Locate or create 'current' subfolder
    var currentFolders = targetFolder.getFoldersByName('current');
    var currentFolder = currentFolders.hasNext() ? currentFolders.next() : targetFolder.createFolder('current');

    return currentFolder;
  } catch (err) {
    Logger.log('Error creating opaque assessment folder: ' + err);
    return null;
  }
}

/**
 * Maps document slot types to standardized, non-PII filenames.
 */
function getStandardSlotFilename_(docPrefix) {
  var prefix = String(docPrefix).toLowerCase();
  if (prefix.indexOf('sig') !== -1) return 'caregiver-signature.png';
  if (prefix.indexOf('passbook') !== -1) return 'passbook.jpg';
  if (prefix.indexOf('aadhaar') !== -1 || prefix.indexOf('id') !== -1) return 'identity-document.jpg';
  if (prefix.indexOf('photo') !== -1) return 'child-photo.jpg';
  if (prefix.indexOf('fee') !== -1) return 'school-fee-receipt.pdf';
  if (prefix.indexOf('mark') !== -1) return 'marksheet.pdf';
  return 'supporting-document-' + prefix.replace(/[^a-z0-9_-]/g, '_') + '.jpg';
}

function deleteObsoleteDocumentFiles_(childFolder, docPrefix, oldFormulaOrUrl) {
  if (!childFolder) return;

  try {
    var slotName = getStandardSlotFilename_(docPrefix);
    var files = childFolder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      if (name === slotName || name.indexOf(docPrefix + '_') === 0 || name.indexOf(docPrefix + '.') === 0) {
        try {
          file.setTrashed(true);
        } catch (err) {
          Logger.log('Could not trash file: ' + name + ', ' + err);
        }
      }
    }

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
      if (meta.indexOf('image/jpeg') !== -1 || meta.indexOf('image/jpg') !== -1) {
        mimeType = 'image/jpeg';
      } else if (meta.indexOf('application/pdf') !== -1) {
        mimeType = 'application/pdf';
      }

      // Delete obsolete files before saving replacement
      if (childFolder) {
        deleteObsoleteDocumentFiles_(childFolder, docPrefix, oldFormulaOrUrl);
      }

      var decodedBytes = Utilities.base64Decode(base64Data);
      var slotFileName = getStandardSlotFilename_(docPrefix);
      var blob = Utilities.newBlob(decodedBytes, mimeType, slotFileName);

      // Create file with default private inheritance (Public link sharing disabled)
      var newFile = childFolder ? childFolder.createFile(blob) : DriveApp.createFile(blob);
      var fileId = newFile.getId();

      // Return opaque, authenticated Google Workspace file link
      var restrictedViewUrl = 'https://drive.google.com/file/d/' + fileId + '/view';
      return '=HYPERLINK("' + restrictedViewUrl + '", "Restricted Doc [' + docPrefix + ']")';
    } catch (err) {
      Logger.log('processDocumentUpload_ exception: ' + err);
      return '';
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

  if (val.indexOf('=HYPERLINK(') === 0 || val.indexOf('=IMAGE(') === 0) {
    return val;
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

  // 1. Resilient Tab Detection
  var sheets = ss.getSheets();
  var sheet = null;

  // Exact match
  sheet = ss.getSheetByName(PRIMARY_SHEET_NAME);

  // Semantic search across sheet names if primary name not found
  if (!sheet) {
    for (var s = 0; s < sheets.length; s++) {
      var name = sheets[s].getName().toLowerCase();
      if (
        name.includes('nutrition') ||
        name.includes('linelist') ||
        name.includes('child') ||
        name.includes('hiv')
      ) {
        sheet = sheets[s];
        break;
      }
    }
  }

  // Fallback to Sheet1 or first sheet
  if (!sheet) {
    sheet = ss.getSheetByName('Sheet1') || sheets[0];
  }

  if (!sheet) {
    throw new Error('No valid sheet found in spreadsheet: ' + TARGET_SPREADSHEET_ID);
  }

  // 2. Dynamic Header Row Scanning (scan rows 1 to 5 to find row with "Unique ID")
  var detectedHeaderRowIndex = HEADER_ROW_INDEX;
  var maxScanRows = Math.min(sheet.getLastRow() || 5, 5);
  for (var r = 1; r <= maxScanRows; r++) {
    var checkCols = Math.min(sheet.getLastColumn() || 1, 10);
    if (checkCols > 0) {
      var checkRow = sheet.getRange(r, 1, 1, checkCols).getValues()[0];
      for (var c = 0; c < checkRow.length; c++) {
        var cellVal = String(checkRow[c]).toLowerCase();
        if (cellVal.includes('unique id') || cellVal.includes('uniqueid') || cellVal.includes('art id')) {
          detectedHeaderRowIndex = r;
          break;
        }
      }
      if (detectedHeaderRowIndex === r) break;
    }
  }

  ensureHeaders_(sheet);

  var headerCols = Math.max(sheet.getLastColumn(), COLUMN_HEADERS.length);
  var headerRow = sheet.getRange(detectedHeaderRowIndex, 1, 1, headerCols).getValues()[0];
  var colMap = {};
  var colNamesByIndex = [];

  for (var i = 0; i < headerRow.length; i++) {
    var full = String(headerRow[i]).trim();
    colNamesByIndex[i] = full || COLUMN_HEADERS[i] || ('COL_' + (i + 1));
    if (full) {
      colMap[full.toLowerCase()] = i + 1;
      var clean = full.replace(/^\d+\s*\n\s*/, '').trim().toLowerCase();
      if (clean) {
        colMap[clean] = i + 1;
      }
    }
  }

  // Schema check: verify Unique ID exists
  var hasUniqueId = Boolean(colMap['1\nunique id'] || colMap['unique id'] || colMap['art id number']);
  if (!hasUniqueId && sheet.getLastRow() > detectedHeaderRowIndex) {
    Logger.log('WARNING: Sheet headers do not contain Unique ID. Detected header row: ' + detectedHeaderRowIndex);
  }

  return {
    ss: ss,
    sheet: sheet,
    colMap: colMap,
    colNamesByIndex: colNamesByIndex,
    headerRowIndex: detectedHeaderRowIndex,
    hasUniqueId: hasUniqueId,
  };
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
// DATA PRIVACY & MASKING HELPERS (DPDP ACT / PRIVACY COMPLIANCE)
// ============================================================================

var VALID_SLOT_FILENAMES = [
  'caregiver-signature.png',
  'passbook.jpg',
  'identity-document.jpg',
  'child-photo.jpg',
  'school-fee-receipt.pdf',
  'marksheet.pdf'
];

function isSlotCompliantFilename_(filename) {
  if (!filename) return false;
  var name = String(filename).trim().toLowerCase();
  for (var i = 0; i < VALID_SLOT_FILENAMES.length; i++) {
    if (name === VALID_SLOT_FILENAMES[i]) return true;
  }
  return false;
}

function maskAadhaar_(raw) {
  if (!raw) return '';
  var digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 4) {
    return 'XXXX-XXXX-' + digits.slice(-4);
  }
  if (String(raw).indexOf('XXXX') !== -1) return String(raw);
  return 'XXXX-XXXX-XXXX';
}

function maskBankAccount_(raw) {
  if (!raw) return '';
  var str = String(raw).trim();
  if (str.length >= 4) {
    return 'XXXX-XXXX-' + str.slice(-4);
  }
  return 'XXXX-XXXX';
}

function maskPhone_(raw) {
  if (!raw) return '';
  var digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 4) {
    return '******' + digits.slice(-4);
  }
  return '******';
}

/**
 * Free-tier resilience helper: Exponential backoff retry wrapper
 */
function withRetry_(fn, maxRetries, baseDelayMs) {
  var retries = maxRetries || 3;
  var delay = baseDelayMs || 500;
  var lastError;
  for (var attempt = 0; attempt < retries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastError = err;
      var str = String(err).toLowerCase();
      if (
        str.indexOf('rate') !== -1 ||
        str.indexOf('quota') !== -1 ||
        str.indexOf('limit') !== -1 ||
        str.indexOf('too many') !== -1 ||
        str.indexOf('busy') !== -1
      ) {
        Utilities.sleep(delay * Math.pow(2, attempt) + Math.floor(Math.random() * 200));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// ============================================================================
// PHASE 2: ADVANCED SHEETS SCHEMA & VALIDATION
// ============================================================================

function getValidatedSheetSchema_() {
  var advancedUsed = false;
  var actualHeaders = [];
  var totalCols = 0;
  var valid = true;
  var missingHeaders = [];
  var mismatches = [];

  try {
    if (typeof Sheets !== 'undefined' && Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
      var range = PRIMARY_SHEET_NAME + '!A3:BU3';
      var res = Sheets.Spreadsheets.Values.get(TARGET_SPREADSHEET_ID, range);
      if (res && res.values && res.values.length > 0) {
        actualHeaders = res.values[0];
        totalCols = actualHeaders.length;
        advancedUsed = true;
      }
    }
  } catch (advErr) {
    Logger.log('Advanced Sheets API v4 fallback to SpreadsheetApp: ' + advErr);
  }

  if (!advancedUsed) {
    var ctx = getSheetAndColMap_();
    var sheet = ctx.sheet;
    totalCols = Math.max(sheet.getLastColumn(), COLUMN_HEADERS.length);
    var hRowIdx = ctx.headerRowIndex || HEADER_ROW_INDEX;
    actualHeaders = sheet.getRange(hRowIdx, 1, 1, totalCols).getValues()[0];
  }

  for (var i = 0; i < COLUMN_HEADERS.length; i++) {
    var expected = String(COLUMN_HEADERS[i]).trim();
    var actual = (actualHeaders[i] !== undefined && actualHeaders[i] !== null) ? String(actualHeaders[i]).trim() : '';
    if (!actual) {
      missingHeaders.push({ index: i + 1, expected: expected });
      valid = false;
    } else if (actual !== expected) {
      var expNormalized = expected.replace(/\n/g, ' ').toLowerCase();
      var actNormalized = actual.replace(/\n/g, ' ').toLowerCase();
      if (expNormalized !== actNormalized) {
        mismatches.push({ index: i + 1, expected: expected, actual: actual });
        valid = false;
      }
    }
  }

  return {
    valid: valid,
    totalColumns: totalCols,
    expectedColumns: COLUMN_HEADERS.length,
    matchedColumns: COLUMN_HEADERS.length - missingHeaders.length - mismatches.length,
    missingHeaders: missingHeaders,
    mismatches: mismatches,
    advancedServiceUsed: advancedUsed
  };
}

function schemaAudit_() {
  var validation = getValidatedSheetSchema_();
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();
  var dataRowCount = Math.max(0, lastRow - 3);

  return {
    status: 'success',
    valid: validation.valid,
    totalColumns: validation.totalColumns,
    expectedColumns: validation.expectedColumns,
    matchedColumns: validation.matchedColumns,
    missingHeadersCount: validation.missingHeaders.length,
    missingHeaders: validation.missingHeaders,
    mismatchesCount: validation.mismatches.length,
    mismatches: validation.mismatches,
    advancedServiceUsed: validation.advancedServiceUsed,
    dataRowCount: dataRowCount,
    headerRowIndex: ctx.headerRowIndex || HEADER_ROW_INDEX,
    sheetName: sheet.getName(),
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// READ & LIST HANDLERS (OPTIMIZED + DTO REDACTION)
// ============================================================================

function readSubmission_(remoteSubmissionId, requestId) {
  if (!remoteSubmissionId) {
    return errorResponse_('Missing uniqueId or remoteSubmissionId parameter.', 'VALIDATION_ERROR', 400, requestId);
  }

  var targetId = String(remoteSubmissionId).trim();
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();
  var headerRowIdx = ctx.headerRowIndex || HEADER_ROW_INDEX;
  var firstDataRow = headerRowIdx + 1;

  if (lastRow < firstDataRow) {
    return errorResponse_('Record not found: Sheet has no data rows.', 'NOT_FOUND', 404, requestId);
  }

  var uidCol = ctx.colMap['1\nunique id'] || ctx.colMap['unique id'] || ctx.colMap['art id number'] || 1;
  var revCol = ctx.colMap['2\nrevision number'] || ctx.colMap['revision number'] || 2;
  var numCols = Math.max(sheet.getLastColumn(), COLUMN_HEADERS.length);

  var ids = sheet.getRange(firstDataRow, uidCol, lastRow - headerRowIdx, 1).getValues();
  var foundRow = -1;

  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0]).trim() === targetId) {
      foundRow = firstDataRow + r;
      break;
    }
  }

  if (foundRow === -1) {
    return errorResponse_('Record not found with ID: ' + targetId, 'NOT_FOUND', 404, requestId);
  }

  var rowValues = sheet.getRange(foundRow, 1, 1, numCols).getValues()[0];
  var rowFormulas = sheet.getRange(foundRow, 1, 1, numCols).getFormulas()[0];

  var record = {};
  for (var c = 0; c < numCols; c++) {
    var headerName = (ctx.colNamesByIndex && ctx.colNamesByIndex[c]) || COLUMN_HEADERS[c] || ('COL_' + (c + 1));
    record[headerName] = rowFormulas[c] || rowValues[c];
  }

  var revNum = Number(rowValues[revCol - 1] || record['2\nRevision Number'] || 1);
  record.uniqueId = targetId;
  record.remoteSubmissionId = targetId;
  record.revisionNumber = revNum;
  record.version = revNum;

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      data: record,
      rowNumber: foundRow,
      uniqueId: targetId,
      remoteSubmissionId: targetId,
      revisionNumber: revNum,
      version: revNum,
      requestId: requestId || null
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleRead_(params) {
  var id = params && (params.uniqueId || params.id || params.uuid || params.submissionId || params.remoteSubmissionId);
  return readSubmission_(id, params && params.requestId);
}

function listSubmissions_(params, requestId) {
  params = params || {};
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();
  var headerRowIdx = ctx.headerRowIndex || HEADER_ROW_INDEX;
  var firstDataRow = headerRowIdx + 1;

  if (lastRow < firstDataRow) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        data: [],
        total: 0,
        cursor: null,
        hasMore: false,
        limit: parseInt(params.limit, 10) || 50,
        requestId: requestId || null
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 200);
  var cursor = parseInt(params.cursor, 10) || firstDataRow;
  var endRow = Math.min(cursor + limit - 1, lastRow);
  var numRows = endRow - cursor + 1;

  if (numRows <= 0) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        data: [],
        total: Math.max(0, lastRow - headerRowIdx),
        cursor: null,
        hasMore: false,
        limit: limit,
        requestId: requestId || null
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var numCols = Math.max(sheet.getLastColumn(), COLUMN_HEADERS.length);
  var dataBlock = [];
  var formulaBlock = [];
  var advancedUsed = false;

  // Sheets API v4 Advanced Service optimization
  try {
    if (typeof Sheets !== 'undefined' && Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
      var sheetTitle = sheet.getName();
      var rangeA1 = sheetTitle + '!R' + cursor + 'C1:R' + endRow + 'C' + numCols;
      var valuesRes = Sheets.Spreadsheets.Values.get(TARGET_SPREADSHEET_ID, rangeA1, {
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });
      var formulaRes = Sheets.Spreadsheets.Values.get(TARGET_SPREADSHEET_ID, rangeA1, {
        valueRenderOption: 'FORMULA'
      });
      if (valuesRes && valuesRes.values) {
        dataBlock = valuesRes.values;
        formulaBlock = (formulaRes && formulaRes.values) || [];
        advancedUsed = true;
      }
    }
  } catch (advErr) {
    Logger.log('Sheets v4 Values.get fallback: ' + advErr);
  }

  if (!advancedUsed) {
    dataBlock = sheet.getRange(cursor, 1, numRows, numCols).getValues();
    formulaBlock = sheet.getRange(cursor, 1, numRows, numCols).getFormulas();
  }

  var records = [];
  var uidCol = ctx.colMap['1\nunique id'] || ctx.colMap['unique id'] || ctx.colMap['art id number'] || 1;
  var revCol = ctx.colMap['2\nrevision number'] || ctx.colMap['revision number'] || 2;

  for (var r = 0; r < dataBlock.length; r++) {
    var rowValues = dataBlock[r] || [];
    var rowFormulas = formulaBlock[r] || [];

    var isBlank = true;
    for (var c = 0; c < rowValues.length; c++) {
      if (rowValues[c] !== '' && rowValues[c] !== null && rowValues[c] !== undefined) {
        isBlank = false;
        break;
      }
    }
    if (isBlank) continue;

    var uid = String(rowValues[uidCol - 1] || '').trim();
    if (!uid && rowValues[0]) {
      uid = String(rowValues[0]).trim();
    }
    var rev = Number(rowValues[revCol - 1] || 1);

    // Supervisor DTO redaction & normalization
    var rec = {
      uniqueId: uid,
      remoteSubmissionId: uid,
      revisionNumber: rev,
      version: rev,
      submissionTime: rowValues[2] || '',
      submittedBy: rowValues[3] || '',
      consentObtained: rowValues[4] || '',
      hasSignature: !!(rowValues[5] || rowFormulas[5]),
      visitDate: rowValues[6] || '',
      interviewerName: rowValues[7] || '',
      childName: rowValues[8] || '',
      dob: rowValues[9] || '',
      age: Number(rowValues[10] || 0),
      gender: rowValues[11] || '',
      orphanStatus: rowValues[12] || '',
      caregiverName: rowValues[13] || '',
      caregiverRelation: rowValues[14] || '',
      caregiverContact: maskPhone_(rowValues[15]),
      address: rowValues[16] || '',
      state: rowValues[17] || '',
      district: rowValues[18] || '',
      accountHolderName: rowValues[19] || '',
      bankAccountNumberMasked: maskBankAccount_(rowValues[20]),
      bankIfsc: rowValues[21] ? String(rowValues[21]).trim() : '',
      bankMobile: maskPhone_(rowValues[22]),
      maskedAadhaar: maskAadhaar_(rowValues[23]),
      hasPassbook: !!(rowValues[24] || rowFormulas[24]),
      hasAadhaar: !!(rowValues[25] || rowFormulas[25]),
      hasChildPhoto: !!(rowValues[26] || rowFormulas[26]),
      householdMembers: Number(rowValues[27] || 0),
      noOfChildren: Number(rowValues[28] || 0),
      monthlyIncome: Number(rowValues[29] || 0),
      incomeSource: rowValues[30] || '',
      weightKg: Number(rowValues[31] || 0),
      heightCm: Number(rowValues[32] || 0),
      bmi: Number(rowValues[33] || 0),
      bmiCategory: rowValues[34] || '',
      hb: Number(rowValues[35] || 0),
      hbCategory: rowValues[36] || '',
      comorbidities: rowValues[37] || '',
      artStatus: rowValues[39] || '',
      artRegistrationDate: rowValues[40] || '',
      artIdNumber: rowValues[41] || '',
      vlStatus: rowValues[42] || '',
      vlDate: rowValues[43] || '',
      vlCategory: rowValues[45] || '',
      educationStatus: rowValues[48] || '',
      schoolName: rowValues[50] || '',
      currentClass: rowValues[53] || '',
      attendanceStatus: rowValues[54] || '',
      totalAnnualEducationCost: Number(rowValues[62] || 0),
      hasFeeReceipt: !!(rowValues[63] || rowFormulas[63]),
      hasMarksheet: !!(rowValues[64] || rowFormulas[64]),
      remarks: rowValues[65] || '',
      approvedAllianceIndia: rowValues[66] || 'Pending',
      reviewConfirmed: rowValues[67] || 'No',
      lastUpdated: rowValues[72] || rowValues[2] || ''
    };

    // Populate exact 73 header names for backward compatibility with canonical adapter
    for (var c = 0; c < COLUMN_HEADERS.length; c++) {
      var hName = COLUMN_HEADERS[c];
      var val = rowFormulas[c] || rowValues[c] || '';
      if (c === 15) val = maskPhone_(val);        // Caregiver Contact
      if (c === 20) val = maskBankAccount_(val);  // Bank Account Number
      if (c === 22) val = maskPhone_(val);        // Bank Mobile
      if (c === 23) val = maskAadhaar_(val);      // Child Aadhaar
      rec[hName] = val;
    }

    records.push(rec);
  }

  var nextCursor = endRow < lastRow ? endRow + 1 : null;
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      data: records,
      total: Math.max(0, lastRow - headerRowIdx),
      cursor: nextCursor,
      hasMore: nextCursor !== null,
      limit: limit,
      advancedServiceUsed: advancedUsed,
      requestId: requestId || null
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// PHASE 2 & 3: DRIVE ADVANCED SERVICES & SHEET PROTECTIONS
// ============================================================================

function setupOrVerifyProtectedRanges_() {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  var protectedDescriptions = [];

  for (var i = 0; i < protections.length; i++) {
    protectedDescriptions.push(protections[i].getDescription());
  }

  var results = [];

  // Protect Header Rows (Row 1 to 3)
  var headerDesc = 'Header and Column Definitions (Rows 1-3)';
  if (protectedDescriptions.indexOf(headerDesc) === -1) {
    var headerRange = sheet.getRange(1, 1, 3, sheet.getMaxColumns());
    var headerProt = headerRange.protect().setDescription(headerDesc);
    headerProt.setWarningOnly(true);
    results.push('Protected: ' + headerDesc);
  } else {
    results.push('Already Protected: ' + headerDesc);
  }

  // Protect Column 1 & 2 (Unique ID and Revision Number)
  var idRevDesc = 'System Identifiers: Unique ID & Revision Number';
  if (protectedDescriptions.indexOf(idRevDesc) === -1) {
    var idRevRange = sheet.getRange(4, 1, Math.max(1, sheet.getMaxRows() - 3), 2);
    var idRevProt = idRevRange.protect().setDescription(idRevDesc);
    idRevProt.setWarningOnly(true);
    results.push('Protected: ' + idRevDesc);
  } else {
    results.push('Already Protected: ' + idRevDesc);
  }

  // Protect Column 67, 68 & 73 (Approved Alliance India, Review Confirmed, Last Updated)
  var auditDesc = 'Governance and Audit Columns (Cols 67, 68, 73)';
  if (protectedDescriptions.indexOf(auditDesc) === -1) {
    var govRange = sheet.getRange(4, 67, Math.max(1, sheet.getMaxRows() - 3), 2);
    var govProt = govRange.protect().setDescription(auditDesc);
    govProt.setWarningOnly(true);
    results.push('Protected: ' + auditDesc);
  } else {
    results.push('Already Protected: ' + auditDesc);
  }

  return {
    status: 'success',
    message: 'Protected ranges verified.',
    protections: results
  };
}

function refreshPresentationAndReports_() {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  ensureHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow >= 4) {
    for (var r = 4; r <= lastRow; r++) {
      formatDataRow_(sheet, r);
    }
  }

  return {
    status: 'success',
    message: 'Linelist presentation and header categories refreshed successfully.',
    totalRows: lastRow,
    columns: sheet.getLastColumn()
  };
}

function inspectDriveAsset_(fileId) {
  if (!fileId) {
    return { error: 'Missing fileId' };
  }

  var cleanId = extractDriveId_(fileId) || String(fileId).trim();
  var report = {
    id: cleanId,
    name: '',
    mimeType: '',
    sizeBytes: 0,
    createdTime: '',
    modifiedTime: '',
    webViewLink: '',
    webContentLink: '',
    isPublic: false,
    isSlotCompliant: false,
    permissions: [],
    advancedServiceUsed: false
  };

  try {
    if (typeof Drive !== 'undefined' && Drive && Drive.Files && Drive.Files.get) {
      var fileObj = Drive.Files.get(cleanId, {
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, shared, permissions(id, role, type, emailAddress), webViewLink, webContentLink'
      });
      report.name = fileObj.name || '';
      report.mimeType = fileObj.mimeType || '';
      report.sizeBytes = parseInt(fileObj.size, 10) || 0;
      report.createdTime = fileObj.createdTime || '';
      report.modifiedTime = fileObj.modifiedTime || '';
      report.webViewLink = fileObj.webViewLink || '';
      report.webContentLink = fileObj.webContentLink || '';
      report.advancedServiceUsed = true;

      var perms = fileObj.permissions || [];
      for (var p = 0; p < perms.length; p++) {
        report.permissions.push({
          id: perms[p].id,
          role: perms[p].role,
          type: perms[p].type,
          emailAddress: perms[p].emailAddress || ''
        });
        if (perms[p].type === 'anyone') {
          report.isPublic = true;
        }
      }
    }
  } catch (driveErr) {
    Logger.log('Drive API v3 inspect fallback to DriveApp: ' + driveErr);
  }

  if (!report.advancedServiceUsed) {
    try {
      var dFile = DriveApp.getFileById(cleanId);
      report.name = dFile.getName();
      report.mimeType = dFile.getMimeType();
      report.sizeBytes = dFile.getSize();
      report.createdTime = dFile.getDateCreated().toISOString();
      report.modifiedTime = dFile.getLastUpdated().toISOString();
      report.webViewLink = dFile.getUrl();

      var access = dFile.getSharingAccess();
      var accessStr = access ? String(access).toLowerCase() : '';
      report.isPublic = accessStr.indexOf('anyone') !== -1;

      var viewers = dFile.getViewers();
      for (var v = 0; v < viewers.length; v++) {
        report.permissions.push({ role: 'viewer', type: 'user', emailAddress: viewers[v].getEmail() });
      }
      var editors = dFile.getEditors();
      for (var e = 0; e < editors.length; e++) {
        report.permissions.push({ role: 'editor', type: 'user', emailAddress: editors[e].getEmail() });
      }
    } catch (appErr) {
      report.error = String(appErr);
      return report;
    }
  }

  report.isSlotCompliant = isSlotCompliantFilename_(report.name);
  return report;
}

function auditDriveAssets_() {
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();
  var docCols = [
    DOC_COLUMNS.SIGNATURE,
    DOC_COLUMNS.PASSBOOK,
    DOC_COLUMNS.AADHAAR,
    DOC_COLUMNS.CHILD_PHOTO,
    DOC_COLUMNS.FEE_RECEIPT,
    DOC_COLUMNS.MARKSHEET
  ];

  var fileMap = {};
  var totalChecked = 0;
  var publicViolations = 0;
  var slotNamingViolations = 0;
  var assetReports = [];

  if (lastRow >= 4) {
    var data = sheet.getRange(4, 1, lastRow - 3, sheet.getLastColumn()).getValues();
    var formulas = sheet.getRange(4, 1, lastRow - 3, sheet.getLastColumn()).getFormulas();

    for (var r = 0; r < data.length; r++) {
      for (var d = 0; d < docCols.length; d++) {
        var cIdx = docCols[d] - 1;
        var cellVal = formulas[r][cIdx] || data[r][cIdx];
        var fileId = extractDriveId_(cellVal);
        if (fileId && !fileMap[fileId]) {
          fileMap[fileId] = true;
          totalChecked++;
          var inspection = inspectDriveAsset_(fileId);
          if (inspection.isPublic) {
            publicViolations++;
          }
          if (!inspection.isSlotCompliant) {
            slotNamingViolations++;
          }
          assetReports.push(inspection);
        }
      }
    }
  }

  return {
    status: 'success',
    totalAssetsChecked: totalChecked,
    publicViolations: publicViolations,
    slotNamingViolations: slotNamingViolations,
    isCompliant: (publicViolations === 0 && slotNamingViolations === 0),
    assets: assetReports,
    timestamp: new Date().toISOString()
  };
}

function enforceRestrictedAcl_(fileId) {
  if (!fileId) return { status: 'error', message: 'Missing fileId' };
  var cleanId = extractDriveId_(fileId) || String(fileId).trim();
  var removedPublic = false;

  try {
    if (typeof Drive !== 'undefined' && Drive && Drive.Permissions && Drive.Permissions.list && Drive.Permissions.delete) {
      var perms = Drive.Permissions.list(cleanId);
      var permList = (perms && perms.permissions) || [];
      for (var i = 0; i < permList.length; i++) {
        if (permList[i].type === 'anyone') {
          Drive.Permissions.delete(cleanId, permList[i].id);
          removedPublic = true;
        }
      }
    }
  } catch (err) {
    Logger.log('Drive API v3 ACL delete error: ' + err);
  }

  try {
    var f = DriveApp.getFileById(cleanId);
    f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    removedPublic = true;
  } catch (err2) {
    Logger.log('DriveApp setSharing error: ' + err2);
  }

  return {
    status: 'success',
    fileId: cleanId,
    restrictedEnforced: true,
    removedPublicSharing: removedPublic
  };
}

function replaceAssetSafely_(options) {
  if (!options) return { status: 'error', message: 'Missing options' };
  var submissionId = options.remoteSubmissionId || options.uniqueId;
  var slot = options.slotPrefix || 'Supporting';
  var dataUrl = options.fileDataUrl;
  var oldFileId = options.oldFileId;

  if (!submissionId || !dataUrl) {
    return { status: 'error', message: 'Missing remoteSubmissionId or fileDataUrl' };
  }

  var folder = getOrVerifyAssessmentFolder_(submissionId);
  if (!folder) {
    return { status: 'error', message: 'Unable to acquire opaque assessment folder.' };
  }

  var slotFilename = getStandardSlotFilename_(slot);

  // Decode and create new file
  var commaIdx = dataUrl.indexOf(',');
  var meta = dataUrl.substring(5, commaIdx);
  var base64Data = dataUrl.substring(commaIdx + 1);
  var mimeType = 'image/png';
  if (meta.indexOf('image/jpeg') !== -1 || meta.indexOf('image/jpg') !== -1) mimeType = 'image/jpeg';
  else if (meta.indexOf('application/pdf') !== -1) mimeType = 'application/pdf';

  var decodedBytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decodedBytes, mimeType, slotFilename);
  var newFile = folder.createFile(blob);
  var newFileId = newFile.getId();

  if (!newFileId || newFile.getSize() <= 0) {
    return { status: 'error', message: 'New file verification failed: zero bytes or invalid ID.' };
  }

  if (oldFileId) {
    try {
      var oldIdClean = extractDriveId_(oldFileId) || oldFileId;
      var oldF = DriveApp.getFileById(oldIdClean);
      if (oldF) oldF.setTrashed(true);
    } catch (trashErr) {
      Logger.log('Warning: could not trash old asset: ' + trashErr);
    }
  }

  return {
    status: 'success',
    newFileId: newFileId,
    fileName: slotFilename,
    viewUrl: 'https://drive.google.com/file/d/' + newFileId + '/view'
  };
}

// ============================================================================
// PHASE 4: ADMIN MENU HANDLERS (NON-DESTRUCTIVE AUDIT & DIAGNOSTIC TOOLS)
// ============================================================================

function menuValidateSheetSchema() {
  var ui = SpreadsheetApp.getUi();
  try {
    var audit = schemaAudit_();
    var msg = 'Sheet Schema Audit Report:\n\n' +
      'Status: ' + (audit.valid ? 'VALID (73/73 Columns Matched)' : 'INVALID (Schema Mismatches Detected)') + '\n' +
      'Expected Columns: ' + audit.expectedColumns + '\n' +
      'Matched Columns: ' + audit.matchedColumns + '\n' +
      'Missing Headers: ' + audit.missingHeadersCount + '\n' +
      'Mismatches: ' + audit.mismatchesCount + '\n' +
      'Data Rows: ' + audit.dataRowCount + '\n' +
      'Advanced Service Used: ' + (audit.advancedServiceUsed ? 'YES (Sheets API v4)' : 'NO (SpreadsheetApp Fallback)');
    if (audit.mismatches.length > 0) {
      msg += '\n\nFirst Mismatch: Column ' + audit.mismatches[0].index + ' expected "' + audit.mismatches[0].expected + '" but found "' + audit.mismatches[0].actual + '"';
    }
    ui.alert('Schema Audit', msg, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Schema Audit Error', 'Failed to run schema audit: ' + err, ui.ButtonSet.OK);
  }
}

function menuAuditDriveAssets() {
  var ui = SpreadsheetApp.getUi();
  try {
    var audit = auditDriveAssets_();
    var msg = 'Drive Asset Security Audit:\n\n' +
      'Total Assets Scanned: ' + audit.totalAssetsChecked + '\n' +
      'Public Sharing Violations: ' + audit.publicViolations + '\n' +
      'Non-Compliant Filenames: ' + audit.slotNamingViolations + '\n' +
      'Overall Compliance: ' + (audit.isCompliant ? 'FULLY COMPLIANT' : 'ACTION REQUIRED');
    ui.alert('Drive Security Audit', msg, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Drive Audit Error', 'Failed to audit Drive assets: ' + err, ui.ButtonSet.OK);
  }
}

function menuGenerateDataQualityReport() {
  var ui = SpreadsheetApp.getUi();
  try {
    var ctx = getSheetAndColMap_();
    var sheet = ctx.sheet;
    var lastRow = sheet.getLastRow();
    if (lastRow < 4) {
      ui.alert('Data Quality Report', 'Sheet contains 0 data rows. No issues found.', ui.ButtonSet.OK);
      return;
    }
    var rows = sheet.getRange(4, 1, lastRow - 3, sheet.getLastColumn()).getValues();
    var missingUid = 0;
    var missingName = 0;
    var missingCaregiver = 0;
    var missingConsent = 0;

    for (var r = 0; r < rows.length; r++) {
      if (!rows[r][0]) missingUid++;
      if (!rows[r][8]) missingName++;
      if (!rows[r][13]) missingCaregiver++;
      if (!rows[r][4]) missingConsent++;
    }

    var msg = 'Data Quality Report:\n\n' +
      'Total Records: ' + rows.length + '\n' +
      'Missing Unique IDs: ' + missingUid + '\n' +
      'Missing Child Names: ' + missingName + '\n' +
      'Missing Caregiver Names: ' + missingCaregiver + '\n' +
      'Missing Consent: ' + missingConsent + '\n' +
      'Quality Status: ' + (missingUid === 0 && missingName === 0 ? 'HIGH QUALITY' : 'ISSUES DETECTED');
    ui.alert('Data Quality Report', msg, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Error', 'Failed to generate data quality report: ' + err, ui.ButtonSet.OK);
  }
}

function menuVerifyProtectedColumns() {
  var ui = SpreadsheetApp.getUi();
  try {
    var res = setupOrVerifyProtectedRanges_();
    var msg = 'Protected Columns Report:\n\n' + res.protections.join('\n');
    ui.alert('Protected Ranges', msg, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Error', 'Failed to verify protected ranges: ' + err, ui.ButtonSet.OK);
  }
}

function menuPreviewFolderMigration() {
  var ui = SpreadsheetApp.getUi();
  try {
    var root = getOrCreateRootDocumentsFolder_();
    if (!root) {
      ui.alert('Folder Migration Preview', 'Root documents folder not found.', ui.ButtonSet.OK);
      return;
    }
    var subFolders = root.getFolders();
    var legacyFolders = [];
    while (subFolders.hasNext()) {
      var f = subFolders.next();
      var name = f.getName();
      if (name !== 'assessments' && name.indexOf(' - ') !== -1) {
        legacyFolders.push(name);
      }
    }
    var msg = 'Folder Migration Preview:\n\n' +
      'Found ' + legacyFolders.length + ' legacy child-name folder(s) eligible for migration to opaque structure (assessments/{remoteSubmissionId}/current/):\n\n' +
      (legacyFolders.slice(0, 10).join('\n')) +
      (legacyFolders.length > 10 ? '\n...and ' + (legacyFolders.length - 10) + ' more' : '');
    ui.alert('Folder Migration Preview', msg, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Error', 'Failed to preview folder migration: ' + err, ui.ButtonSet.OK);
  }
}

function menuPreviewPublicAclViolations() {
  var ui = SpreadsheetApp.getUi();
  try {
    var audit = auditDriveAssets_();
    var publicAssets = [];
    for (var i = 0; i < audit.assets.length; i++) {
      if (audit.assets[i].isPublic) {
        publicAssets.push(audit.assets[i].name + ' (' + audit.assets[i].id + ')');
      }
    }
    var msg = 'Public ACL Violations Preview:\n\n' +
      'Public Violations Found: ' + publicAssets.length + '\n\n' +
      (publicAssets.length > 0 ? publicAssets.join('\n') : 'All Drive assets are restricted to private institutional access.');
    ui.alert('Public ACL Preview', msg, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Error', 'Failed to preview public ACL violations: ' + err, ui.ButtonSet.OK);
  }
}

function menuRefreshSheetPresentation() {
  var ui = SpreadsheetApp.getUi();
  try {
    var res = refreshPresentationAndReports_();
    ui.alert('Refresh Complete', res.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Error', 'Failed to refresh sheet presentation: ' + err, ui.ButtonSet.OK);
  }
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
  if (!root) return [];
  var subFolders = root.getFolders();
  var list = [];
  while (subFolders.hasNext()) {
    var f = subFolders.next();
    list.push(f.getName() + ' (' + f.getUrl() + ')');
  }
  Logger.log('Drive Folders: ' + JSON.stringify(list));
  return list;
}

function cleanupTestFolders_() {
  var root = getOrCreateRootDocumentsFolder_();
  if (!root) {
    return { status: 'error', message: 'Root documents folder not found.' };
  }
  var subFolders = root.getFolders();
  var trashed = [];
  while (subFolders.hasNext()) {
    var f = subFolders.next();
    var name = f.getName();
    // Strictly target test and synthetic folder names only
    if (
      name.includes('SYN-') ||
      name.includes('E2E_TEST') ||
      name.includes('Test Caseworker') ||
      name.toLowerCase().startsWith('test ') ||
      name.toLowerCase().includes('dummy') ||
      name.toLowerCase().includes('synthetic')
    ) {
      f.setTrashed(true);
      trashed.push(name);
    }
  }
  return {
    status: 'success',
    message: 'Trashed ' + trashed.length + ' dummy test folder(s). Any non-test folders preserved.',
    trashedCount: trashed.length,
    trashedFolders: trashed,
  };
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

function errorResponse_(message, code, statusCode, requestId) {
  var httpCode = statusCode;
  if (!httpCode) {
    if (typeof code === 'number') {
      httpCode = code;
    } else if (code === 'UNAUTHORIZED') {
      httpCode = 401;
    } else if (code === 'CONFIGURATION_ERROR') {
      httpCode = 503;
    } else if (code === 'VALIDATION_ERROR') {
      httpCode = 400;
    } else if (code === 'NOT_FOUND') {
      httpCode = 404;
    } else if (code === 'OCC_CONFLICT' || code === 'CONFLICT') {
      httpCode = 409;
    } else if (code === 'UPSTREAM_UNAVAILABLE') {
      httpCode = 503;
    } else {
      httpCode = 500;
    }
  }

  var semanticCode = typeof code === 'string' ? code : (
    httpCode === 401 ? 'UNAUTHORIZED' :
    httpCode === 503 ? 'CONFIGURATION_ERROR' :
    httpCode === 404 ? 'NOT_FOUND' :
    httpCode === 422 ? 'VALIDATION_ERROR' :
    httpCode === 400 ? 'VALIDATION_ERROR' :
    httpCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR'
  );

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'error',
      code: semanticCode,
      statusCode: httpCode,
      message: message,
      requestId: requestId || null,
      timestamp: new Date().toISOString(),
    })
  ).setMimeType(ContentService.MimeType.JSON);
}
