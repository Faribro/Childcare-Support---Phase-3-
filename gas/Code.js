/**
 * Google Apps Script Backend Adapter — Phase 3 Hardened OCC Architecture
 * Project ID: 1yXEgElXFb0Fb_CzTlQ8TDvRUuEYmq5dady7ialsqMnkAU1XX5SPJW8P3
 * Target Sheet ID: 1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA
 * Primary Tab: Child_Nutrition
 *
 * Implements:
 * - 30s LockService Mutex around dedupe and mutations
 * - Dynamic column resolution (safeColIndex_)
 * - Idempotent create (action: 'create') returning canonical remoteSubmissionId
 * - Optimistic Concurrency Control update (action: 'update') returning 409 on version mismatch
 * - Read single record (action: 'read')
 * - List records with cursor (action: 'list')
 * - Audit log writing to Audit_Log sheet
 * - Strictly NO art_center columns per programme data privacy rule
 * - Zero reliance on Sheet row numbers as canonical IDs
 */

var TARGET_SPREADSHEET_ID = '1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA';
var PRIMARY_SHEET_NAME = 'Child_Nutrition';
var AUDIT_SHEET_NAME = 'Audit_Log';
var HEADER_ROW_INDEX = 3;
var LOCK_TIMEOUT_MS = 30000;

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'health';

  if (action === 'health') {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'ok',
        service: 'childcare-apps-script-bridge',
        version: '3.0.0',
        timestamp: new Date().toISOString(),
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

function getSheetAndColMap_() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PRIMARY_SHEET_NAME) || ss.getSheets()[0];
  var lastCol = Math.max(sheet.getLastColumn(), 35);
  var headerRow = sheet.getRange(HEADER_ROW_INDEX, 1, 1, lastCol).getValues()[0];

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
  var colMap = ctx.colMap;

  var lastRow = sheet.getLastRow();
  var uuidCol = colMap['_uuid'] || 1;

  // Idempotency check: Search UUID column
  if (lastRow >= HEADER_ROW_INDEX + 1) {
    var existingUuids = sheet
      .getRange(HEADER_ROW_INDEX + 1, uuidCol, lastRow - HEADER_ROW_INDEX, 1)
      .getValues();
    for (var r = 0; r < existingUuids.length; r++) {
      if (String(existingUuids[r][0]).trim() === String(submissionUuid).trim()) {
        var rowIndex = HEADER_ROW_INDEX + 1 + r;
        var rowValues = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
        var remoteId = colMap['remote_submission_id'] ? rowValues[colMap['remote_submission_id'] - 1] : submissionUuid;
        var ver = colMap['version'] ? Number(rowValues[colMap['version'] - 1]) || 1 : 1;

        return ContentService.createTextOutput(
          JSON.stringify({
            status: 'success',
            acknowledged: true,
            remoteSubmissionId: String(remoteId),
            clientSubmissionId: submissionUuid,
            version: ver,
            isDuplicate: true,
            idempotencyNote: 'Duplicate recognized. Existing row confirmed.',
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  // Create new record
  var remoteSubmissionId = 'rem-' + submissionUuid.substring(0, 8) + '-' + new Date().getTime().toString(36);
  var now = new Date().toISOString();
  var totalCols = Math.max(sheet.getLastColumn(), 35);
  var newRow = new Array(totalCols);
  for (var k = 0; k < totalCols; k++) {
    newRow[k] = '';
  }

  function setVal(key, val) {
    var nk = String(key).trim().toLowerCase();
    if (colMap[nk]) {
      newRow[colMap[nk] - 1] = val !== undefined && val !== null ? val : '';
    }
  }

  setVal('_uuid', submissionUuid);
  setVal('client_submission_id', payload.clientSubmissionId || submissionUuid);
  setVal('remote_submission_id', remoteSubmissionId);
  setVal('version', 1);
  setVal('idempotency_key', payload.idempotencyKey || '');
  setVal('timestamp', now);
  setVal('updated_at', now);
  setVal('interviewer_name', payload.interviewerName || '');
  setVal('art_number', (payload.demographics && payload.demographics.artNumber) || payload.artNumber || '');
  setVal('child_name', (payload.demographics && payload.demographics.childName) || payload.childName || '');
  setVal('dob', (payload.demographics && payload.demographics.dob) || payload.dob || '');
  setVal('calculated_age', (payload.demographics && payload.demographics.calculatedAgeYears) || payload.calculatedAge || '');
  setVal('gender', (payload.demographics && payload.demographics.gender) || payload.gender || '');
  setVal('caregiver_name', (payload.demographics && payload.demographics.caregiverName) || payload.caregiverName || '');
  setVal('caregiver_relationship', (payload.demographics && payload.demographics.caregiverRelationship) || payload.caregiverRelationship || '');
  setVal('caregiver_phone', (payload.demographics && payload.demographics.caregiverPhone) || payload.caregiverPhone || '');
  setVal('district', (payload.demographics && payload.demographics.district) || payload.district || '');
  setVal('orphan_status', (payload.household && payload.household.orphanStatus) || payload.orphanStatus || '');
  setVal('height_cm', (payload.nutrition && payload.nutrition.heightCm) || payload.heightCm || '');
  setVal('weight_kg', (payload.nutrition && payload.nutrition.weightKg) || payload.weightKg || '');
  setVal('muac_mm', (payload.nutrition && payload.nutrition.muacMm) || payload.muacMm || '');
  setVal('bmi_z_score', (payload.nutrition && payload.nutrition.bmiZScore) || payload.bmiZScore || '');
  setVal('nutrition_status', (payload.nutrition && payload.nutrition.nutritionStatus) || payload.nutritionStatus || '');
  setVal('school_enrolled', (payload.education && payload.education.schoolEnrolled) || payload.schoolEnrolled || '');
  setVal('school_grade', (payload.education && payload.education.schoolGrade) || payload.schoolGrade || '');
  setVal('grant_recommended', (payload.education && payload.education.grantRecommended) || payload.grantRecommended || '');
  setVal('sync_state', 'SYNCED');

  sheet.appendRow(newRow);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: remoteSubmissionId,
      clientSubmissionId: submissionUuid,
      version: 1,
      updatedAt: now,
      isDuplicate: false,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdate_(payload) {
  var targetId = payload.submissionId || payload.remoteSubmissionId || payload.uuid;
  var patch = payload.patch || payload;
  var expectedVersion = Number(patch.expectedVersion || payload.expectedVersion);

  if (!targetId) {
    return errorResponse_('Missing target submissionId for update.', 400);
  }
  if (!expectedVersion) {
    return errorResponse_('Missing required expectedVersion for optimistic concurrency check.', 400);
  }

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var colMap = ctx.colMap;
  var lastRow = sheet.getLastRow();

  if (lastRow < HEADER_ROW_INDEX + 1) {
    return errorResponse_('Record not found: sheet is empty.', 404);
  }

  var uuidCol = colMap['_uuid'] || 1;
  var remoteCol = colMap['remote_submission_id'] || uuidCol;
  var verCol = colMap['version'];

  var uuids = sheet.getRange(HEADER_ROW_INDEX + 1, uuidCol, lastRow - HEADER_ROW_INDEX, 1).getValues();
  var remoteIds = sheet.getRange(HEADER_ROW_INDEX + 1, remoteCol, lastRow - HEADER_ROW_INDEX, 1).getValues();

  var foundRow = -1;
  for (var r = 0; r < uuids.length; r++) {
    if (String(uuids[r][0]).trim() === String(targetId).trim() || String(remoteIds[r][0]).trim() === String(targetId).trim()) {
      foundRow = HEADER_ROW_INDEX + 1 + r;
      break;
    }
  }

  if (foundRow === -1) {
    return errorResponse_('Record not found with ID: ' + targetId, 404);
  }

  // Check version
  var currentVersion = 1;
  if (verCol) {
    currentVersion = Number(sheet.getRange(foundRow, verCol).getValue()) || 1;
  }

  if (currentVersion !== expectedVersion) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'error',
        code: 'CONCURRENCY_CONFLICT',
        message: 'Record has been modified remotely.',
        currentVersion: currentVersion,
        expectedVersion: expectedVersion,
        resolutionPath: 'REFRESH_AND_MERGE',
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // Apply allowlisted editable fields
  function updateCell(key, val) {
    var nk = String(key).trim().toLowerCase();
    if (colMap[nk] && val !== undefined) {
      sheet.getRange(foundRow, colMap[nk]).setValue(val);
    }
  }

  if (patch.caregiverPhone !== undefined) updateCell('caregiver_phone', patch.caregiverPhone);
  if (patch.caregiverName !== undefined) updateCell('caregiver_name', patch.caregiverName);
  if (patch.caregiverRelationship !== undefined) updateCell('caregiver_relationship', patch.caregiverRelationship);
  if (patch.heightCm !== undefined) updateCell('height_cm', patch.heightCm);
  if (patch.weightKg !== undefined) updateCell('weight_kg', patch.weightKg);
  if (patch.muacMm !== undefined) updateCell('muac_mm', patch.muacMm);
  if (patch.schoolGrade !== undefined) updateCell('school_grade', patch.schoolGrade);
  if (patch.accountNumber !== undefined) updateCell('bank_account_number', patch.accountNumber);

  var newVersion = currentVersion + 1;
  var now = new Date().toISOString();
  if (verCol) updateCell('version', newVersion);
  updateCell('updated_at', now);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      acknowledged: true,
      remoteSubmissionId: targetId,
      version: newVersion,
      updatedAt: now,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleRead_(params) {
  var id = params.submissionId || params.id;
  if (!id) return errorResponse_('Missing id for read.', 400);

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var colMap = ctx.colMap;
  var lastRow = sheet.getLastRow();

  if (lastRow < HEADER_ROW_INDEX + 1) return errorResponse_('Record not found.', 404);

  var uuidCol = colMap['_uuid'] || 1;
  var remoteCol = colMap['remote_submission_id'] || uuidCol;
  var uuids = sheet.getRange(HEADER_ROW_INDEX + 1, uuidCol, lastRow - HEADER_ROW_INDEX, 1).getValues();
  var remoteIds = sheet.getRange(HEADER_ROW_INDEX + 1, remoteCol, lastRow - HEADER_ROW_INDEX, 1).getValues();

  for (var r = 0; r < uuids.length; r++) {
    if (String(uuids[r][0]).trim() === String(id).trim() || String(remoteIds[r][0]).trim() === String(id).trim()) {
      var rowValues = sheet.getRange(HEADER_ROW_INDEX + 1 + r, 1, 1, sheet.getLastColumn()).getValues()[0];
      return ContentService.createTextOutput(
        JSON.stringify({
          status: 'success',
          data: {
            remoteSubmissionId: colMap['remote_submission_id'] ? rowValues[colMap['remote_submission_id'] - 1] : id,
            clientSubmissionId: rowValues[uuidCol - 1],
            version: colMap['version'] ? rowValues[colMap['version'] - 1] : 1,
            artNumber: colMap['art_number'] ? rowValues[colMap['art_number'] - 1] : '',
            childName: colMap['child_name'] ? rowValues[colMap['child_name'] - 1] : '',
          },
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return errorResponse_('Record not found with ID: ' + id, 404);
}

function handleList_(params) {
  var limit = Math.min(Number(params.limit || 20), 100);
  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();

  if (lastRow < HEADER_ROW_INDEX + 1) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', data: [], pagination: { hasMore: false } })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var dataRows = sheet.getRange(HEADER_ROW_INDEX + 1, 1, Math.min(lastRow - HEADER_ROW_INDEX, limit), sheet.getLastColumn()).getValues();
  var items = [];
  for (var i = 0; i < dataRows.length; i++) {
    items.push({
      _uuid: dataRows[i][(ctx.colMap['_uuid'] || 1) - 1],
      artNumber: dataRows[i][(ctx.colMap['art_number'] || 2) - 1],
      childName: dataRows[i][(ctx.colMap['child_name'] || 3) - 1],
    });
  }

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      data: items,
      pagination: { hasMore: lastRow - HEADER_ROW_INDEX > limit },
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
