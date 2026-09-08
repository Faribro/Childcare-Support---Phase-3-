/**
 * Google Apps Script Backend Adapter
 * Childcare Support — Phase 3: Children Nutrition & Education Support Form
 * Project ID: 1yXEgElXFb0Fb_CzTlQ8TDvRUuEYmq5dady7ialsqMnkAU1XX5SPJW8P3
 * Target Sheet ID: 1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA
 */

var TARGET_SPREADSHEET_ID = '1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA';
var PRIMARY_SHEET_NAME = 'Child_Nutrition';
var HEADER_ROW_INDEX = 3;
var LOCK_TIMEOUT_MS = 30000;

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'ok',
      service: 'childcare-apps-script-bridge',
      version: '3.0.0',
      timestamp: new Date().toISOString(),
    })
  ).setMimeType(ContentService.MimeType.JSON);
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

    var submissionUuid = payload.uuid || payload._uuid;
    if (!submissionUuid) {
      return errorResponse_('Missing required field: uuid.', 422);
    }

    var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(PRIMARY_SHEET_NAME);
    if (!sheet) {
      // Fallback to first sheet if primary name not yet migrated
      sheet = ss.getSheets()[0];
    }

    // Dynamic header resolution
    var headerRow = sheet
      .getRange(HEADER_ROW_INDEX, 1, 1, sheet.getLastColumn() || 50)
      .getValues()[0];
    var colMap = {};
    for (var i = 0; i < headerRow.length; i++) {
      var h = String(headerRow[i]).trim().toLowerCase();
      if (h) {
        colMap[h] = i + 1;
      }
    }

    // Idempotency Check: Search Column 1 (or _uuid column) for existing UUID
    var lastRow = sheet.getLastRow();
    var uuidCol = colMap['_uuid'] || 1;
    if (lastRow >= HEADER_ROW_INDEX + 1) {
      var existingUuids = sheet
        .getRange(HEADER_ROW_INDEX + 1, uuidCol, lastRow - HEADER_ROW_INDEX, 1)
        .getValues();
      for (var r = 0; r < existingUuids.length; r++) {
        if (String(existingUuids[r][0]).trim() === String(submissionUuid).trim()) {
          var existingRow = HEADER_ROW_INDEX + 1 + r;
          return ContentService.createTextOutput(
            JSON.stringify({
              status: 'success',
              acknowledged: true,
              uuid: submissionUuid,
              rowNumber: existingRow,
              idempotencyNote: 'Duplicate submission recognized. Existing row confirmed.',
            })
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // Prepare row array matching discovered headers
    var totalCols = Math.max(sheet.getLastColumn(), 30);
    var newRow = new Array(totalCols);
    for (var k = 0; k < totalCols; k++) {
      newRow[k] = '';
    }

    function setField(colKey, val) {
      var normalizedKey = String(colKey).trim().toLowerCase();
      if (colMap[normalizedKey]) {
        newRow[colMap[normalizedKey] - 1] = val !== undefined && val !== null ? val : '';
      }
    }

    // Map canonical fields
    setField('_uuid', submissionUuid);
    setField('timestamp', new Date().toISOString());
    setField('interviewer_name', payload.interviewerName || '');
    setField('art_number', payload.artNumber || '');
    setField('child_name', payload.childName || '');
    setField('dob', payload.dob || '');
    setField('calculated_age', payload.calculatedAge || '');
    setField('gender', payload.gender || '');
    setField('caregiver_name', payload.caregiverName || '');
    setField('caregiver_phone', payload.caregiverPhone || '');
    setField('orphan_status', payload.orphanStatus || '');
    setField('height_cm', payload.heightCm || '');
    setField('weight_kg', payload.weightKg || '');
    setField('muac_mm', payload.muacMm || '');
    setField('bmi_z_score', payload.bmiZScore || '');
    setField('nutrition_status', payload.nutritionStatus || '');
    setField('school_enrolled', payload.schoolEnrolled || '');
    setField('school_grade', payload.schoolGrade || '');
    setField('grant_recommended', payload.grantRecommended || '');
    setField('bank_account_number', payload.bankAccountNumber || '');
    setField('ifsc_code', payload.ifscCode || '');
    setField('sync_state', 'SYNCED');

    // Atomic append
    sheet.appendRow(newRow);
    var appendedRow = sheet.getLastRow();

    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        acknowledged: true,
        uuid: submissionUuid,
        rowNumber: appendedRow,
        timestamp: new Date().toISOString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return errorResponse_('Internal Apps Script Error: ' + err.toString(), 500);
  } finally {
    lock.releaseLock();
  }
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
