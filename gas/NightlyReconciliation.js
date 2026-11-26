/**
 * Nightly Google Sheets Mirror Reconciliation Worker (Google Apps Script)
 *
 * Truth & Deletion Model:
 * - Firestore is the single source of truth; the Sheet is a derived mirror.
 * - Nightly reconciliation runs under LockService with a 4.5-minute resumable cursor.
 * - Feature-flagged OFF by default: requires Script Property `RECONCILE_ENABLED` (or
 *   `SHEET_RECONCILE_ENABLED`) === 'true'.
 * - Uses dedicated `SHEET_RECONCILE_SECRET` (never reuses `WEBHOOK_SECRET`).
 * - Sheet-only rows missing from Firestore (active and Trash) are moved to the
 *   "Quarantine" tab with full snapshot JSON — never auto-deleted.
 * - Soft-deleted Firestore rows move minimal metadata to the hidden "Trash" tab and
 *   trash Drive asset folders (`setTrashed(true)`), keeping recovery intact.
 * - Mass-deletion / mass-quarantine circuit breaker aborts BEFORE any destructive write
 *   when threshold is breached or snapshot appears truncated.
 */

var RECONCILE_TIMEZONE = 'Asia/Kolkata';
var RECONCILE_HOUR_IST = 23;
var RECONCILE_DEFAULT_BUDGET_MS = 270000; // 4.5 minutes out of GAS 6-min execution limit
var RECONCILE_DEFAULT_PAGE_SIZE = 200;
var RECONCILE_CONTINUATION_DELAY_MS = 60000;
var RECONCILE_HANDLER_NAME = 'runNightlySheetReconciliation';
var RECONCILE_CURSOR_PROP = 'RECONCILE_CURSOR_JSON';
var RECONCILE_CONTINUE_TRIGGER_PROP = 'RECONCILE_CONTINUATION_TRIGGER_ID';
var RECONCILE_TOTAL_COLUMNS = 83;
var RECONCILE_QUARANTINE_TAB = 'Quarantine';
var RECONCILE_LOG_TAB = 'Reconcile Run Log';
var RECONCILE_DEFAULT_MAX_DESTRUCTIVE_RATIO = 0.20;
var RECONCILE_DEFAULT_MIN_DESTRUCTIVE_COUNT = 5;

var RECONCILE_DOC_COL_INDICES = {
  5: true,  // Col 6: Signature / Thumb Impression
  24: true, // Col 25: Passbook Front Page Link
  25: true, // Col 26: Aadhaar Card Link
  26: true, // Col 27: Passport Size Photo Link
  63: true, // Col 64: School Fee Receipt Link
  64: true  // Col 65: Marksheet Photo Link
};

var RECONCILE_DOC_SLOT_LABELS = {
  5: 'Caregiver Signature',
  24: 'Passbook',
  25: 'Aadhaar',
  26: 'Child Photo',
  63: 'Fee Receipt',
  64: 'Marksheet'
};

var RECONCILE_OPERATIONAL_SHEET_IDS = [
  '1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA',
  '1YORdIKiIdSILyOekMJ5BCO5WCujoZ87U7H65x88HKkM'
];

function isReconcileFeatureEnabled_(props) {
  if (!props) return false;
  var flagPrimary = props.getProperty('RECONCILE_ENABLED');
  var flagAlt = props.getProperty('SHEET_RECONCILE_ENABLED');
  if (String(flagPrimary || '').trim().toLowerCase() === 'false') return false;
  if (String(flagAlt || '').trim().toLowerCase() === 'false') return false;
  return (
    String(flagPrimary || '').trim().toLowerCase() === 'true' ||
    String(flagAlt || '').trim().toLowerCase() === 'true'
  );
}

function validateReconcileConfig_(props) {
  var appBaseUrl = String((props && props.getProperty('APP_BASE_URL')) || '').trim().replace(/\/+$/, '');
  var reconcileSecret = String((props && props.getProperty('SHEET_RECONCILE_SECRET')) || '').trim();
  var webhookSecret = String((props && props.getProperty('WEBHOOK_SECRET')) || '').trim();
  var appEnv = String((props && props.getProperty('APP_ENV')) || 'production').trim().toLowerCase();

  if (!appBaseUrl || appBaseUrl.indexOf('https://') !== 0) {
    return { valid: false, code: 'INVALID_APP_BASE_URL', message: 'APP_BASE_URL must be configured as an HTTPS URL.' };
  }
  if (!reconcileSecret || reconcileSecret.length < 16) {
    return { valid: false, code: 'RECONCILE_SECRET_NOT_CONFIGURED', message: 'Dedicated SHEET_RECONCILE_SECRET (>=16 chars) is required.' };
  }
  if (webhookSecret && reconcileSecret === webhookSecret) {
    return { valid: false, code: 'SECRET_REUSE_FORBIDDEN', message: 'SHEET_RECONCILE_SECRET must never reuse WEBHOOK_SECRET.' };
  }

  // Cross-environment isolation guard
  var isStagingUrl = appBaseUrl.toLowerCase().indexOf('staging') !== -1 || appBaseUrl.toLowerCase().indexOf('dev') !== -1;
  var spreadsheetId = '';
  try {
    spreadsheetId = typeof getTargetSpreadsheetId_ === 'function'
      ? getTargetSpreadsheetId_()
      : String((props && props.getProperty('TARGET_SPREADSHEET_ID')) || '').trim();
  } catch (e) {
    spreadsheetId = String((props && props.getProperty('TARGET_SPREADSHEET_ID')) || '').trim();
  }
  var isOpSheet = RECONCILE_OPERATIONAL_SHEET_IDS.indexOf(spreadsheetId) !== -1;
  if ((appEnv === 'staging' || isStagingUrl) && isOpSheet) {
    return {
      valid: false,
      code: 'CROSS_ENV_ISOLATION_VIOLATION',
      message: 'Refusing staging/dev APP_BASE_URL reconciliation against operational production spreadsheet.'
    };
  }

  return {
    valid: true,
    appBaseUrl: appBaseUrl,
    reconcileSecret: reconcileSecret,
    appEnv: appEnv
  };
}

function extractCanonicalDriveIdForHash_(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  var s = String(rawValue).trim();
  if (!s) return '';
  var lower = s.toLowerCase();
  if (lower.indexOf('drive:') === 0) {
    var existing = s.slice(6).trim();
    if (/^[a-zA-Z0-9_-]{8,}$/.test(existing)) return 'drive:' + existing;
  }
  var pathMatch = s.match(/\/file\/d\/([a-zA-Z0-9_-]{8,})/i) || s.match(/\/d\/([a-zA-Z0-9_-]{8,})/i);
  if (pathMatch && pathMatch[1]) return 'drive:' + pathMatch[1];
  var idParam = s.match(/[?&]id=([a-zA-Z0-9_-]{8,})/i);
  if (idParam && idParam[1]) return 'drive:' + idParam[1];
  return '';
}

function normalizeReconcileCell_(colIdx, val, formula) {
  if (RECONCILE_DOC_COL_INDICES[colIdx]) {
    var fDrive = formula ? extractCanonicalDriveIdForHash_(formula) : '';
    if (fDrive) return fDrive;
    var vDrive = extractCanonicalDriveIdForHash_(val);
    if (vDrive) return vDrive;
  }

  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '' : val.toISOString();
  }
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') {
    if (!isFinite(val)) return '';
    return String(val);
  }
  if (Array.isArray(val)) {
    return val.map(function (v) { return String(v).trim(); }).filter(Boolean).join(', ');
  }
  return String(val).replace(/\r\n/g, '\n').trim();
}

function sha256HexGas_(utf8String) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, utf8String, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var byteVal = digest[i];
    if (byteVal < 0) byteVal += 256;
    var byteHex = byteVal.toString(16);
    if (byteHex.length === 1) hex += '0';
    hex += byteHex;
  }
  return hex;
}

/**
 * Computes canonical SHA-256 hash over an 83-column Sheet row matching
 * `computeSheetCellsRowHash` in src/lib/server/submissionRowHash.ts byte-for-byte.
 */
function computeGasSheetCellsRowHash_(cells, formulas, isDeleted, deletedAt) {
  var columns = [];
  for (var i = 0; i < RECONCILE_TOTAL_COLUMNS; i++) {
    var cellVal = cells && i < cells.length ? cells[i] : '';
    var formulaVal = formulas && i < formulas.length ? formulas[i] : '';
    columns.push(normalizeReconcileCell_(i, cellVal, formulaVal));
  }
  var canonicalPayload = JSON.stringify({
    v: 1,
    isDeleted: Boolean(isDeleted),
    deletedAt: deletedAt ? String(deletedAt) : null,
    columns: columns
  });
  return sha256HexGas_(canonicalPayload);
}

function getOrCreateQuarantineSheet_(ss) {
  var sheet = ss.getSheetByName(RECONCILE_QUARANTINE_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(RECONCILE_QUARANTINE_TAB);
    sheet.getRange(1, 1, 1, 5).setValues([[
      'Submission ID',
      'State',
      'Quarantined At',
      'Reason',
      'Row Snapshot JSON'
    ]]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  return sheet;
}

function appendQuarantineRow_(ss, entry) {
  var qSheet = getOrCreateQuarantineSheet_(ss);
  var nextRow = Math.max(qSheet.getLastRow() + 1, 2);
  qSheet.getRange(nextRow, 1, 1, 5).setValues([[
    String(entry.id || ''),
    String(entry.state || ''),
    String(entry.capturedAt || new Date().toISOString()),
    String(entry.reason || 'MISSING_IN_FIRESTORE'),
    JSON.stringify(entry.snapshot || [])
  ]]);
}

function getOrCreateReconcileLogSheet_(ss) {
  var sheet = ss.getSheetByName(RECONCILE_LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(RECONCILE_LOG_TAB);
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Run ID',
      'Started At (UTC)',
      'Duration (ms)',
      'Status',
      'DB Scanned',
      'Sheet Scanned',
      'Matched',
      'Inserted',
      'Updated',
      'Soft Deleted',
      'Quarantined',
      'Details / Errors'
    ]]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
  }
  return sheet;
}

function appendReconcileRunLog_(ss, logEntry) {
  try {
    if (!ss) return;
    var logSheet = getOrCreateReconcileLogSheet_(ss);
    var nextRow = Math.max(logSheet.getLastRow() + 1, 2);
    var stats = logEntry.stats || {};
    logSheet.getRange(nextRow, 1, 1, 12).setValues([[
      String(logEntry.runId || ''),
      String(logEntry.startedAtIso || ''),
      Number(logEntry.durationMs || 0),
      String(logEntry.status || ''),
      Number(stats.scannedDb || 0),
      Number(stats.scannedSheet || 0),
      Number(stats.matched || 0),
      Number(stats.inserted || 0),
      Number(stats.updated || 0),
      Number(stats.softDeleted || 0),
      Number(stats.quarantined || 0),
      String(logEntry.details || '')
    ]]);
  } catch (err) {
    Logger.log('Failed appending Reconcile Run Log: ' + err);
  }
}

function fetchSnapshotWithRetry_(url, secret) {
  var attempt = 0;
  var lastErr = null;
  while (attempt < 3) {
    try {
      var res = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        headers: {
          'X-Reconcile-Secret': secret,
          'Accept': 'application/json'
        }
      });
      var code = res.getResponseCode();
      var text = res.getContentText() || '{}';
      var parsed = JSON.parse(text);
      if (code >= 200 && code < 300 && parsed && parsed.status === 'success') {
        return parsed;
      }
      if (code === 401 || code === 403 || code === 404 || code === 400) {
        throw new Error('HTTP_' + code + ': ' + (parsed.code || parsed.message || 'Snapshot request rejected'));
      }
      lastErr = new Error('HTTP_' + code + ': ' + (parsed.message || 'Transient snapshot error'));
    } catch (e) {
      if (String(e.message || e).indexOf('HTTP_40') === 0) throw e;
      lastErr = e;
    }
    attempt++;
    if (attempt < 3 && typeof Utilities !== 'undefined' && typeof Utilities.sleep === 'function') {
      Utilities.sleep(400 * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr || new Error('Snapshot request failed');
}

function formatCellValueForLinelist_(colIdx, rawVal) {
  if (rawVal === null || rawVal === undefined) return '';
  var s = String(rawVal);
  if (RECONCILE_DOC_COL_INDICES[colIdx]) {
    var trimmed = s.trim();
    if (!trimmed) return 'Not Submitted';
    if (trimmed.indexOf('data:') === 0 || trimmed.indexOf(';base64,') !== -1) {
      return '[Document Pending Drive Upload]';
    }
    if (trimmed.indexOf('=HYPERLINK(') === 0 || trimmed.indexOf('=IMAGE(') === 0) {
      return trimmed;
    }
    var driveId = extractCanonicalDriveIdForHash_(trimmed);
    if (driveId) {
      var rawId = driveId.slice(6);
      var slotLabel = RECONCILE_DOC_SLOT_LABELS[colIdx] || 'Document';
      return '=HYPERLINK("https://drive.google.com/file/d/' + rawId + '/view", "Restricted Doc [' + slotLabel + ']")';
    }
    return trimmed;
  }
  if (s.indexOf('data:') === 0 || s.indexOf(';base64,') !== -1) {
    return '[Document Pending Drive Upload]';
  }
  return rawVal;
}

function buildLinelistRowFromReconcileRecord_(record) {
  if (!record || typeof record !== 'object') {
    var emptyRow = [];
    for (var z = 0; z < RECONCILE_TOTAL_COLUMNS; z++) emptyRow.push('');
    return emptyRow;
  }
  if (Array.isArray(record.canonicalRowValues) && record.canonicalRowValues.length === RECONCILE_TOTAL_COLUMNS) {
    var formatted = [];
    for (var c = 0; c < RECONCILE_TOTAL_COLUMNS; c++) {
      formatted.push(formatCellValueForLinelist_(c, record.canonicalRowValues[c]));
    }
    return formatted;
  }

  var doc = record.doc && typeof record.doc === 'object' ? record.doc : record;
  var p = record.payload && typeof record.payload === 'object'
    ? record.payload
    : (doc.payload && typeof doc.payload === 'object' ? doc.payload : doc);
  var d = p.demographics && typeof p.demographics === 'object' ? p.demographics : (doc.demographics || {});
  var hf = p.householdFinancial && typeof p.householdFinancial === 'object' ? p.householdFinancial : (doc.householdFinancial || {});
  var h = p.health && typeof p.health === 'object' ? p.health : (doc.health || {});
  var n = p.nutrition && typeof p.nutrition === 'object' ? p.nutrition : (doc.nutrition || {});
  var e = p.educationStatus && typeof p.educationStatus === 'object' ? p.educationStatus : (doc.educationStatus || {});
  var exp = p.educationExpenses && typeof p.educationExpenses === 'object' ? p.educationExpenses : (doc.educationExpenses || {});
  var b = p.bankingAndKyc && typeof p.bankingAndKyc === 'object' ? p.bankingAndKyc : (doc.bankingAndKyc || {});
  var f = p.finalReview && typeof p.finalReview === 'object' ? p.finalReview : (doc.finalReview || {});
  var cc = p.caregiverConsent && typeof p.caregiverConsent === 'object' ? p.caregiverConsent : (doc.caregiverConsent || {});
  var cs = p.consent && typeof p.consent === 'object' ? p.consent : (doc.consent || {});

  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }
  function numOrZero(val) {
    if (val === undefined || val === null || val === '') return '0';
    var nVal = Number(val);
    return isNaN(nVal) ? '0' : String(nVal);
  }

  var consentGiven = Boolean(
    cs.agreeToParticipate || cs.consentGiven || cc.consentProvided || cc.consentGiven ||
    p.consentGiven || p.agreeToParticipate || p.consentProvided || doc.consentGiven ||
    String(doc['5\nConsent Obtained'] || '').toLowerCase() === 'yes'
  );
  var sigRaw = pick(doc.signatureDataUrl, p.signatureDataUrl, cs.signatureDataUrl, cc.signatureDataUrl, doc.signatureUrl, p.signatureUrl, doc['6\nSignature /\nThumb Impression']);
  var sigCell = sigRaw ? String(sigRaw).trim() : (consentGiven ? 'CAPTURED_LOCAL' : 'Not Submitted');

  var row = [];
  for (var i = 0; i < RECONCILE_TOTAL_COLUMNS; i++) row.push('');

  row[0] = pick(record.uniqueId, doc.uniqueId, p.uniqueId, doc['1\nUnique ID'], doc['1\nUnique Identifier'], doc.art_number, p.artNumber, d.artNumber, doc.clientSubmissionId, doc.id);
  row[1] = pick(record.revisionNumber, doc.revisionNumber, doc.version, doc['2\nRevision Number'], 1);
  row[2] = pick(record.submissionTime, doc.submissionTime, p.submissionTime, doc.createdAt, doc.created_at, doc['3\nSubmission Time']);
  row[3] = pick(f.formSubmittedBy, p.formSubmittedBy, doc.submittedBy, p.interviewerName, doc.interviewer_name, doc['4\nSubmitted By']);
  row[4] = consentGiven ? 'Yes' : 'No';
  row[5] = sigCell;
  row[6] = pick(p.visitDate, doc.visitDate, d.dateOfFilling, doc['7\nVisit Date']);
  row[7] = pick(p.interviewerName, f.formSubmittedBy, doc.interviewer_name, doc['8\nInterviewer Name']);
  row[8] = pick(doc.childName, p.childName, d.childName, doc.child_name, doc['9\nChild Name']);
  row[9] = pick(p.dob, doc.dob, d.dob, doc['10\nDate of Birth']);
  row[10] = pick(p.age, p.calculatedAgeYears, doc.age, d.calculatedAgeYears, doc.calculated_age, doc['11\nAge']);
  row[11] = pick(p.gender, doc.gender, d.gender, doc['12\nGender']);
  row[12] = pick(p.orphanStatus, d.orphanStatus, doc.orphan_status, doc['13\nOrphan Status']);
  row[13] = pick(p.caregiverFullName, p.caregiverName, doc.caregiverName, d.caregiverName, doc.caregiver_name, doc['14\nCaregiver Full Name']);
  row[14] = pick(p.caregiverRelation, p.caregiverRelationship, d.caregiverRelationship, doc.caregiver_relationship, doc['15\nCaregiver Relation']);
  row[15] = pick(p.caregiverContact, p.caregiverPhone, doc.caregiverPhone, d.contactNumber, d.caregiverPhone, doc['16\nCaregiver Contact']);
  row[16] = pick(p.address, doc.address, d.fullAddress, doc['17\nAddress']);
  row[17] = pick(doc.state, p.state, d.state, doc['18\nState']);
  row[18] = pick(doc.district, p.district, d.district, doc['19\nDistrict']);
  row[19] = pick(p.bankAccountHolderName, p.accountHolderName, b.bankAccountHolderName, b.accountHolderName, doc.account_holder_name, doc['20\nBank Account Holder Name']);
  row[20] = pick(p.bankAccountNumber, p.bankAccountNo, b.bankAccountNumber, b.accountNumber, doc.bank_account_number, doc['21\nBank Account Number']);
  row[21] = pick(p.bankIfscCode, p.bankIfsc, p.ifsc, p.ifscCode, b.bankIfscCode, b.ifscCode, doc.ifsc_code, doc['22\nBank IFSC Code']);
  row[22] = pick(p.bankLinkedMobileNumber, p.bankMobile, b.bankLinkedMobileNumber, doc['23\nBank Linked Mobile Number']);
  row[23] = pick(p.childAadhaarNumber, d.childAadhaarNumber, b.childAadhaarNumber, doc.masked_aadhaar, doc['24\nChild Aadhaar Number']);
  row[24] = pick(doc.passbookPhotoUrl, p.passbookPhotoUrl, p.passbookFrontPageLink, b.passbookPhotoUrl, d.passbookPhotoUrl, doc.passbook_photo_url, doc['25\nPassbook Front Page Link']) || 'Not Submitted';
  row[25] = pick(doc.aadhaarCardPhotoUrl, p.aadhaarCardPhotoUrl, p.aadhaarCardLink, b.aadhaarCardPhotoUrl, d.aadhaarCardPhotoUrl, doc.aadhaar_card_photo_url, doc['26\nAadhaar Card Link']) || 'Not Submitted';
  row[26] = pick(doc.childPhotoUrl, p.childPhotoUrl, p.passportSizePhotoLink, b.childPhotoUrl, b.passportSizePhotoUrl, d.childPhotoUrl, d.passportSizePhotoUrl, doc.child_photo_url, doc['27\nPassport Size Photo Link']) || 'Not Submitted';
  row[27] = pick(p.householdMembers, hf.totalFamilyMembers, doc['28\nHousehold Members']);
  row[28] = pick(p.noOfChildren, p.numberOfSiblings, hf.numberOfChildrenUnder18, doc.number_of_siblings, doc['29\nNo of Children']);
  row[29] = pick(p.monthlyIncome, p.monthlyHouseholdIncome, hf.monthlyIncomeRs, doc.monthly_household_income, doc['30\nMonthly Income']);
  row[30] = pick(p.incomeSource, p.primaryCaregiverOccupation, hf.mainSourceOfIncome, doc.primary_caregiver_occupation, doc['31\nIncome Source']);
  row[31] = pick(p.currentWeightKg, p.weightKg, doc.weightKg, h.weightKg, n.weightKg, doc.weight_kg, doc['32\nCurrent Weight (kg)']);
  row[32] = pick(p.currentHeightCm, p.heightCm, doc.heightCm, h.heightCm, n.heightCm, doc.height_cm, doc['33\nCurrent Height (cm)']);
  row[33] = pick(p.bmi, doc.bmi, h.bmi, n.bmi, doc['34\nBMI']);
  row[34] = pick(p.bmiCategory, p.nutritionStatus, doc.nutrition_status, h.bmiCategory, h.nutritionStatus, n.nutritionStatus, doc['35\nBMI Category']);
  row[35] = pick(p.hemoglobinGdl, p.hb, h.haemoglobinGdl, doc['36\nHemoglobin (g/dL)']);
  row[36] = pick(p.hbCategory, h.hbCategory, doc['37\nHb Category']);
  row[37] = pick(p.comorbidities, h.otherHealthConditions, doc['38\nComorbidities']);
  row[38] = pick(p.comorbiditiesOther, h.otherHealthConditionSpecify, doc['39\nComorbidities Other']);
  row[39] = pick(doc.artStatus, p.artStatus, h.artStatus, doc['40\nART Status']);
  row[40] = pick(p.artRegistrationDate, p.artInitiationDate, h.artInitiationDate, h.artRegistrationDate, doc['41\nART Registration Date']);
  row[41] = pick(p.artIdNumber, h.artIdNumber, doc.art_number, doc['42\nART ID Number']);
  row[42] = pick(doc.vlStatus, p.vlStatus, h.vlStatus, doc['43\nVL Status']);
  row[43] = pick(p.vlDate, h.vlDate, doc['44\nVL Date']);
  row[44] = pick(p.viralLoad, h.viralLoad, doc['45\nViral Load']);
  row[45] = pick(p.vlCategory, h.vlCategory, doc['46\nVL Category']);
  row[46] = pick(p.appetite, n.appetite, doc['47\nAppetite']);
  row[47] = pick(p.mealsPerDay, n.mealsPerDay, doc['48\nMeals per Day']);
  row[48] = pick(p.educationStatus, e.educationStatus, doc['49\nEducation Status']);
  row[49] = pick(p.educationStatusOther, e.educationStatusSpecify, doc['50\nEducation Status Other']);
  row[50] = pick(p.schoolName, e.schoolName, doc['51\nSchool Name']);
  row[51] = pick(p.schoolSessionStartDate, e.schoolSessionStartDate, doc['52\nSchool Session Start Date']);
  row[52] = pick(p.schoolType, e.schoolType, doc.school_type, doc['53\nSchool Type']);
  row[53] = pick(p.currentClass, p.schoolGrade, e.currentClass, doc.school_grade, doc['54\nCurrent Class']);
  row[54] = pick(doc.attendanceStatus, p.attendanceStatus, e.attendance, doc['55\nAttendance Status']);
  row[55] = numOrZero(p.schoolFees !== undefined ? p.schoolFees : (exp.schoolFees !== undefined ? exp.schoolFees : doc['56\nSchool Fees']));
  row[56] = numOrZero(p.tuitionFees !== undefined ? p.tuitionFees : (exp.tuitionFees !== undefined ? exp.tuitionFees : doc['57\nPrivate Tuition Fee']));
  row[57] = numOrZero(p.books !== undefined ? p.books : (exp.books !== undefined ? exp.books : doc['58\nSchool Books']));
  row[58] = numOrZero(p.stationery !== undefined ? p.stationery : (exp.stationery !== undefined ? exp.stationery : doc['59\nSchool Stationery']));
  row[59] = numOrZero(p.uniform !== undefined ? p.uniform : (exp.uniform !== undefined ? exp.uniform : doc['60\nSchool Uniform']));
  row[60] = numOrZero(p.transport !== undefined ? p.transport : (exp.transport !== undefined ? exp.transport : doc['61\nSchool Transport']));
  row[61] = numOrZero(p.otherExpenses !== undefined ? p.otherExpenses : (exp.otherExpenses !== undefined ? exp.otherExpenses : doc['62\nSchool Other Expenses']));
  row[62] = numOrZero(p.totalAnnualEducationCost !== undefined ? p.totalAnnualEducationCost : (exp.totalAnnualCost !== undefined ? exp.totalAnnualCost : (doc.recommended_grant_amount !== undefined ? doc.recommended_grant_amount : doc['63\nTotal Annual Education Cost'])));
  row[63] = pick(doc.feeReceiptPhotoUrl, p.feeReceiptPhotoUrl, p.schoolFeeReceiptLink, exp.feeReceiptPhotoUrl, e.feeReceiptPhotoUrl, doc.fee_receipt_photo_url, doc['64\nSchool Fee Receipt Link']) || 'Not Submitted';
  row[64] = pick(doc.marksheetPhotoUrl, p.marksheetPhotoUrl, p.marksheetPhotoLink, exp.marksheetPhotoUrl, e.marksheetPhotoUrl, doc.marksheet_photo_url, doc['65\nMarksheet Photo Link']) || 'Not Submitted';
  row[65] = pick(p.remarks, exp.remarks, doc['66\nRemarks (If Any)']);
  row[66] = pick(doc.approvedAllianceIndia, p.approvedAllianceIndia, f.approvedAllianceIndia, doc.approved_alliance_india, doc['67\nApproved Alliance India']);
  row[67] = (f.allInfoCorrect || p.reviewConfirmed || doc['68\nReview Confirmed'] === 'Yes') ? 'Yes' : 'No';
  row[68] = pick(p.organizationName, f.organizationName, doc['69\nOrganization Name']);
  row[69] = pick(p.formSubmittedBy, f.formSubmittedBy, doc.submittedBy, p.interviewerName, doc['70\nForm Submitted By']);
  row[70] = pick(p.organizationEmail, f.organizationEmail, doc['71\nOrganization Email']);
  row[71] = pick(p.syncNeeded, doc['72\nSync Needed']);
  row[72] = pick(record.updatedAt, doc.updatedAt, p.updatedAt, doc.updated_at, doc['73\nLast Updated']);
  row[73] = pick(d.srName, p.srName, doc.srName, doc['74\nSR Name']);
  row[74] = pick(d.ssrName, p.ssrName, doc.ssrName, doc['75\nSSR Name']);
  row[75] = pick(d.guardianStatus, p.guardianStatus, doc['76\nStatus of Guardian/Parent']);
  row[76] = pick(h.artMedicineType, p.artMedicineType, doc['77\nType of ART Medicines']);
  row[77] = pick(h.cd4Count, p.cd4Count, doc['78\nCD4 Count (Latest)']);
  row[78] = pick(h.hasDisability, p.hasDisability, doc['79\nIs Child With Disability']);
  row[79] = pick(h.disabilityType, p.disabilityType, doc['80\nTypes of Disability']);
  row[80] = pick(h.disabilityCertificateStatus, p.disabilityCertificateStatus, doc['81\nDisability Certificate']);
  row[81] = pick(e.receivingEducationSchemeBenefit, p.receivingEducationSchemeBenefit, doc['82\nEducation Scheme Benefit']);
  row[82] = pick(n.malnutritionSymptoms, p.malnutritionSymptoms, doc['83\nSymptoms of Malnutrition']);

  var out = [];
  for (var idx = 0; idx < RECONCILE_TOTAL_COLUMNS; idx++) {
    out.push(formatCellValueForLinelist_(idx, row[idx]));
  }
  return out;
}

function upsertLinelistRowFromReconcile_(sheet, record) {
  var rowVals = buildLinelistRowFromReconcileRecord_(record);
  var targetId = String(rowVals[0] || record.uniqueId || record.id || '').trim();
  if (!targetId) return -1;

  var lastRow = sheet.getLastRow();
  var foundRow = -1;
  if (lastRow >= 4) {
    var existingIds = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
    for (var r = 0; r < existingIds.length; r++) {
      if (String(existingIds[r][0]).trim() === targetId) {
        foundRow = 4 + r;
        break;
      }
    }
  }

  var targetRow = foundRow !== -1 ? foundRow : Math.max(lastRow + 1, 4);
  sheet.getRange(targetRow, 1, 1, RECONCILE_TOTAL_COLUMNS).setValues([rowVals]);
  if (typeof formatDataRow_ === 'function') {
    try { formatDataRow_(sheet, targetRow); } catch (e) {}
  }
  return targetRow;
}

function deleteContinuationTriggerOnly_(props) {
  if (!props || typeof ScriptApp === 'undefined') return;
  var contId = props.getProperty(RECONCILE_CONTINUE_TRIGGER_PROP);
  if (!contId) return;
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i] && typeof triggers[i].getUniqueId === 'function' && String(triggers[i].getUniqueId()) === String(contId)) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  } catch (err) {
    Logger.log('Could not cleanup continuation trigger ' + contId + ': ' + err);
  }
  props.deleteProperty(RECONCILE_CONTINUE_TRIGGER_PROP);
}

function scheduleContinuationTrigger_(props) {
  deleteContinuationTriggerOnly_(props);
  if (typeof ScriptApp === 'undefined') return null;
  var current = ScriptApp.getProjectTriggers();
  if (current && current.length >= 19) {
    Logger.log('Trigger budget guard: refusing continuation trigger when total triggers=' + current.length);
    return null;
  }
  var trig = ScriptApp.newTrigger(RECONCILE_HANDLER_NAME)
    .timeBased()
    .after(RECONCILE_CONTINUATION_DELAY_MS)
    .create();
  if (trig && typeof trig.getUniqueId === 'function') {
    props.setProperty(RECONCILE_CONTINUE_TRIGGER_PROP, String(trig.getUniqueId()));
  }
  return trig;
}

function removeNightlyReconciliationTriggers() {
  if (typeof ScriptApp === 'undefined') return 0;
  var removed = 0;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    if (t && typeof t.getHandlerFunction === 'function' && t.getHandlerFunction() === RECONCILE_HANDLER_NAME) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  }
  try {
    var props = PropertiesService.getScriptProperties();
    if (props) props.deleteProperty(RECONCILE_CONTINUE_TRIGGER_PROP);
  } catch (e) {}
  return removed;
}

/**
 * Installs a single daily time-driven trigger around 23:00 Asia/Kolkata.
 * Cleans up any existing reconciliation triggers first to stay well below GAS 20-trigger limit.
 */
function installNightlyReconciliationTrigger(options) {
  var opts = options || {};
  var props = PropertiesService.getScriptProperties();
  if (!opts.force && !isReconcileFeatureEnabled_(props)) {
    return {
      installed: false,
      status: 'DISABLED',
      message: 'RECONCILE_ENABLED is not true; trigger not installed (pass { force: true } only during approved rollout).'
    };
  }
  removeNightlyReconciliationTriggers();
  var current = ScriptApp.getProjectTriggers();
  if (current && current.length >= 19) {
    return {
      installed: false,
      status: 'TRIGGER_LIMIT_REACHED',
      message: 'Existing trigger count (' + current.length + ') is too close to the 20-trigger Apps Script quota.'
    };
  }
  var trigger = ScriptApp.newTrigger(RECONCILE_HANDLER_NAME)
    .timeBased()
    .everyDays(1)
    .atHour(RECONCILE_HOUR_IST)
    .nearMinute(0)
    .inTimezone(RECONCILE_TIMEZONE)
    .create();

  return {
    installed: true,
    status: 'INSTALLED',
    triggerId: trigger && typeof trigger.getUniqueId === 'function' ? trigger.getUniqueId() : null,
    schedule: 'Daily ~23:00 ' + RECONCILE_TIMEZONE
  };
}

function sendReconcileSummaryEmail_(props, report) {
  try {
    if (typeof MailApp === 'undefined') return false;
    var rawRecipients = String((props && (props.getProperty('RECONCILE_ALERT_EMAILS') || props.getProperty('ADMIN_EMAILS'))) || '').trim();
    if (!rawRecipients) return false;
    var remainingQuota = typeof MailApp.getRemainingDailyQuota === 'function' ? MailApp.getRemainingDailyQuota() : 100;
    if (remainingQuota < 5) return false;

    var isAlert = report.status === 'CIRCUIT_BREAKER_ABORT' || report.status === 'FAILED';
    var subjectPrefix = isAlert ? '[ALERT][ACTION REQUIRED] ' : '[Nightly Mirror] ';
    var subject = subjectPrefix + 'Sheet Reconciliation ' + report.status + ' (' + report.runId + ')';
    var stats = report.stats || {};
    var body = [
      'Childcare Support — Nightly Sheet Mirror Reconciliation Report',
      'Status: ' + report.status,
      'Run ID: ' + report.runId,
      'Started: ' + report.startedAtIso,
      'Duration (ms): ' + report.durationMs,
      '',
      'Aggregate Counts (zero PII included):',
      '- DB Records Scanned: ' + (stats.scannedDb || 0),
      '- Sheet Rows Scanned: ' + (stats.scannedSheet || 0),
      '- Hash Matched: ' + (stats.matched || 0),
      '- Inserted (DB -> Sheet): ' + (stats.inserted || 0),
      '- Updated (Hash Repair): ' + (stats.updated || 0),
      '- Soft Deleted (-> Trash tab): ' + (stats.softDeleted || 0),
      '- Quarantined (-> Quarantine tab): ' + (stats.quarantined || 0),
      '',
      report.details ? ('Details: ' + report.details) : ''
    ].join('\n');

    var list = rawRecipients.split(',').map(function (e) { return e.trim(); }).filter(Boolean);
    for (var i = 0; i < list.length; i++) {
      MailApp.sendEmail({
        to: list[i],
        subject: subject,
        body: body,
        name: 'Alliance Childcare Nightly Reconciler'
      });
    }
    return true;
  } catch (mailErr) {
    Logger.log('Failed sending reconciliation summary email: ' + mailErr);
    return false;
  }
}

function readSortedSheetEntries_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 4) return { rawCount: 0, entries: [], duplicates: [] };

  var rowCount = lastRow - 3;
  var numCols = Math.min(Math.max(sheet.getLastColumn(), 1), RECONCILE_TOTAL_COLUMNS);
  var values = sheet.getRange(4, 1, rowCount, numCols).getValues();
  var formulas = [];
  if (typeof sheet.getRange(4, 1, rowCount, numCols).getFormulas === 'function') {
    formulas = sheet.getRange(4, 1, rowCount, numCols).getFormulas();
  }

  var entries = [];
  for (var r = 0; r < values.length; r++) {
    var rowCells = values[r] || [];
    var rowFormulas = formulas[r] || [];
    while (rowCells.length < RECONCILE_TOTAL_COLUMNS) rowCells.push('');
    var id = String(rowCells[0] || '').trim();
    if (!id) continue;
    var rowHash = computeGasSheetCellsRowHash_(rowCells, rowFormulas, false, null);
    entries.push({
      id: id,
      rowIndex: 4 + r,
      rowHash: rowHash,
      cells: rowCells
    });
  }

  entries.sort(function (a, b) {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return a.rowIndex - b.rowIndex;
  });

  // Separate duplicate IDs on the Sheet cleanly (first row reconciled; extras flagged for Quarantine)
  var deduped = [];
  var duplicates = [];
  for (var i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].id === entries[i - 1].id) {
      duplicates.push({
        id: entries[i].id,
        state: String(entries[i].cells[17] || '').trim(),
        rowIndex: entries[i].rowIndex,
        reason: 'DUPLICATE_SHEET_ROW',
        snapshot: entries[i].cells
      });
    } else {
      deduped.push(entries[i]);
    }
  }

  return { rawCount: rowCount, entries: deduped, duplicates: duplicates };
}

function trashDriveFolderForReconcile_(ss, cleanTargetId, reason) {
  try {
    if (typeof getOrCreateAssetRegistrySheet_ !== 'function' || typeof DriveApp === 'undefined') return '';
    var registrySheet = getOrCreateAssetRegistrySheet_(ss);
    if (!registrySheet || registrySheet.getLastRow() < 2) return '';
    var regData = registrySheet.getRange(2, 1, registrySheet.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < regData.length; i++) {
      if (String(regData[i][0]).trim() === cleanTargetId) {
        var fid = String(regData[i][2]).trim();
        if (fid) {
          var folder = DriveApp.getFolderById(fid);
          if (folder && typeof folder.setTrashed === 'function') {
            folder.setTrashed(true);
          }
          return fid;
        }
      }
    }
  } catch (err) {
    Logger.log('Drive trash error for ' + cleanTargetId + ': ' + err);
  }
  return '';
}

/**
 * Resumable nightly reconciliation entry point.
 * Accepts optional `{ nowMs, budgetMs, pageSize }` overrides for deterministic testing.
 */
function runNightlySheetReconciliation(options) {
  var opts = options || {};
  var props = PropertiesService.getScriptProperties();

  if (!isReconcileFeatureEnabled_(props)) {
    return {
      status: 'DISABLED',
      message: 'Nightly reconciliation is disabled (RECONCILE_ENABLED != true).'
    };
  }

  var cfg = validateReconcileConfig_(props);
  if (!cfg.valid) {
    return {
      status: 'CONFIGURATION_ERROR',
      code: cfg.code,
      message: cfg.message
    };
  }

  var lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
  var hasLock = lock ? lock.tryLock(10000) : true;
  if (!hasLock) {
    return { status: 'LOCKED_SKIP', message: 'Another reconciliation instance already holds ScriptLock.' };
  }

  var nowFn = typeof opts.nowMs === 'function' ? opts.nowMs : function () { return Date.now(); };
  var startMs = nowFn();
  var budgetMs = Number(opts.budgetMs || (props.getProperty('RECONCILE_BUDGET_MS') || RECONCILE_DEFAULT_BUDGET_MS));
  var pageSize = Number(opts.pageSize || (props.getProperty('RECONCILE_PAGE_SIZE') || RECONCILE_DEFAULT_PAGE_SIZE));
  var maxDestructiveRatio = Number(props.getProperty('RECONCILE_MAX_DESTRUCTIVE_RATIO') || RECONCILE_DEFAULT_MAX_DESTRUCTIVE_RATIO);
  var minDestructiveCount = Number(props.getProperty('RECONCILE_MIN_DESTRUCTIVE_COUNT') || RECONCILE_DEFAULT_MIN_DESTRUCTIVE_COUNT);

  var ss = null;
  var state = null;

  try {
    // Clean up any one-off continuation trigger that invoked this slice
    deleteContinuationTriggerOnly_(props);

    var ctx = getSheetAndColMap_();
    ss = ctx.spreadsheet || getTargetSpreadsheet_();
    var sheet = ctx.sheet;
    var sheetScan = readSortedSheetEntries_(sheet);
    var sheetEntries = sheetScan.entries;

    var rawCursor = props.getProperty(RECONCILE_CURSOR_PROP);
    if (rawCursor) {
      state = JSON.parse(rawCursor);
      // Reset sheet pointers against current live sheet layout while keeping accumulated DB scan
      state.sheetPtr = state.sheetPtr || 0;
    } else {
      state = {
        runId: 'rec-' + new Date(startMs).toISOString().replace(/[:.]/g, '-'),
        startedAtIso: new Date(startMs).toISOString(),
        phase: 'SCAN',
        afterId: '',
        sheetPtr: 0,
        activeDbCount: 0,
        toInsert: [],
        toUpdate: [],
        toSoftDelete: [],
        toQuarantine: [],
        stats: {
          scannedDb: 0,
          scannedSheet: sheetEntries.length,
          matched: 0,
          inserted: 0,
          updated: 0,
          softDeleted: 0,
          quarantined: 0
        }
      };
      for (var d = 0; d < sheetScan.duplicates.length; d++) {
        state.toQuarantine.push(sheetScan.duplicates[d]);
      }
    }

    // Phase 1: Stream keyset-paginated snapshot sorted by ID and two-pointer diff against Sheet
    if (state.phase === 'SCAN') {
      while (true) {
        if (nowFn() - startMs >= budgetMs) {
          props.setProperty(RECONCILE_CURSOR_PROP, JSON.stringify(state));
          scheduleContinuationTrigger_(props);
          return {
            status: 'YIELDED_RESUMABLE',
            runId: state.runId,
            phase: state.phase,
            afterId: state.afterId,
            stats: state.stats
          };
        }

        var url = cfg.appBaseUrl + '/api/workers/reconcile-snapshot?limit=' + encodeURIComponent(String(pageSize)) +
          (state.afterId ? ('&afterId=' + encodeURIComponent(state.afterId)) : '');
        var page = fetchSnapshotWithRetry_(url, cfg.reconcileSecret);
        var items = Array.isArray(page.items) ? page.items : [];

        // Normalize items sorted ascending by comparison ID
        items.sort(function (a, b) {
          var idA = String(a.uniqueId || a.id || '').trim();
          var idB = String(b.uniqueId || b.id || '').trim();
          return idA < idB ? -1 : (idA > idB ? 1 : 0);
        });

        for (var p = 0; p < items.length; p++) {
          var dbItem = items[p];
          var dbId = String(dbItem.uniqueId || dbItem.id || '').trim();
          if (!dbId) continue;
          state.stats.scannedDb++;
          if (!dbItem.isDeleted) state.activeDbCount++;

          while (state.sheetPtr < sheetEntries.length && sheetEntries[state.sheetPtr].id < dbId) {
            var missingEntry = sheetEntries[state.sheetPtr];
            state.toQuarantine.push({
              id: missingEntry.id,
              state: String(missingEntry.cells[17] || '').trim(),
              rowIndex: missingEntry.rowIndex,
              reason: 'MISSING_IN_FIRESTORE',
              snapshot: missingEntry.cells
            });
            state.sheetPtr++;
          }

          if (state.sheetPtr < sheetEntries.length && sheetEntries[state.sheetPtr].id === dbId) {
            var matchEntry = sheetEntries[state.sheetPtr];
            if (dbItem.isDeleted) {
              state.toSoftDelete.push({
                id: dbId,
                state: String(dbItem.state || matchEntry.cells[17] || '').trim(),
                deletedAt: dbItem.deletedAt || new Date(nowFn()).toISOString(),
                deletedBy: dbItem.deletedBy || 'reconciler',
                reason: dbItem.deleteReason || 'Deleted in Firestore',
                rowIndex: matchEntry.rowIndex
              });
            } else if (matchEntry.rowHash === dbItem.rowHash) {
              state.stats.matched++;
            } else {
              state.toUpdate.push({ id: dbId, rowIndex: matchEntry.rowIndex });
            }
            state.sheetPtr++;
          } else {
            if (!dbItem.isDeleted) {
              state.toInsert.push({ id: dbId });
            } else {
              // Deleted in Firestore and already absent from active linelist: ensure Trash tab has metadata
              if (typeof upsertTrashRow_ === 'function') {
                upsertTrashRow_(ss, {
                  submissionId: dbId,
                  state: String(dbItem.state || '').trim(),
                  deletedAt: dbItem.deletedAt || new Date(nowFn()).toISOString(),
                  deletedBy: dbItem.deletedBy || 'app-user',
                  reason: dbItem.deleteReason || 'Tombstone backfilled by reconciler',
                  folderId: ''
                });
              }
            }
          }
        }

        if (!page.hasMore) {
          // Tail sheet rows after the final DB ID are unbacked by Firestore -> Quarantine queue
          while (state.sheetPtr < sheetEntries.length) {
            var tailEntry = sheetEntries[state.sheetPtr];
            state.toQuarantine.push({
              id: tailEntry.id,
              state: String(tailEntry.cells[17] || '').trim(),
              rowIndex: tailEntry.rowIndex,
              reason: 'MISSING_IN_FIRESTORE',
              snapshot: tailEntry.cells
            });
            state.sheetPtr++;
          }
          state.phase = 'CIRCUIT_CHECK';
          break;
        }

        state.afterId = String(page.nextAfterId || '');
        if (!state.afterId) {
          state.phase = 'CIRCUIT_CHECK';
          break;
        }
      }
    }

    // Phase 2: Mass-Deletion & Empty-Snapshot Circuit Breaker (BEFORE ANY destructive Sheet writes)
    if (state.phase === 'CIRCUIT_CHECK') {
      var pendingDestructive = state.toSoftDelete.length + state.toQuarantine.length;
      var sheetTotal = sheetEntries.length;
      var emptyDbAbort = state.activeDbCount === 0 && sheetTotal >= 3;
      var ratio = sheetTotal > 0 ? (pendingDestructive / sheetTotal) : 0;
      var massRatioAbort = pendingDestructive >= minDestructiveCount && ratio > maxDestructiveRatio;

      if (emptyDbAbort || massRatioAbort) {
        var abortReason = emptyDbAbort
          ? 'CIRCUIT_BREAKER: Firestore returned 0 active rows while Sheet contains ' + sheetTotal + ' rows.'
          : 'CIRCUIT_BREAKER: Destructive queue (' + pendingDestructive + '/' + sheetTotal + ' = ' + (ratio * 100).toFixed(1) + '%) exceeds ' + (maxDestructiveRatio * 100).toFixed(0) + '% threshold.';

        props.deleteProperty(RECONCILE_CURSOR_PROP);
        deleteContinuationTriggerOnly_(props);

        var abortReport = {
          runId: state.runId,
          startedAtIso: state.startedAtIso,
          durationMs: Math.max(0, nowFn() - startMs),
          status: 'CIRCUIT_BREAKER_ABORT',
          stats: state.stats,
          details: abortReason
        };
        appendReconcileRunLog_(ss, abortReport);
        sendReconcileSummaryEmail_(props, abortReport);
        return abortReport;
      }
      state.phase = 'APPLY';
    }

    // Phase 3: Apply Safe Inserts, Updates, Soft-Deletes (-> Trash), and Quarantines (-> Quarantine tab)
    if (state.phase === 'APPLY') {
      // 3a. Inserts + Updates (fetch full row only on delta)
      var repairs = [];
      for (var ii = 0; ii < state.toInsert.length; ii++) repairs.push(state.toInsert[ii].id);
      for (var ui = 0; ui < state.toUpdate.length; ui++) repairs.push(state.toUpdate[ui].id);

      var insertIdsMap = {};
      for (var im = 0; im < state.toInsert.length; im++) insertIdsMap[state.toInsert[im].id] = true;

      for (var rIdx = state.applyRepairIdx || 0; rIdx < repairs.length; rIdx++) {
        if (nowFn() - startMs >= budgetMs) {
          state.applyRepairIdx = rIdx;
          props.setProperty(RECONCILE_CURSOR_PROP, JSON.stringify(state));
          scheduleContinuationTrigger_(props);
          return {
            status: 'YIELDED_RESUMABLE',
            runId: state.runId,
            phase: 'APPLY',
            stats: state.stats
          };
        }
        var targetId = repairs[rIdx];
        var recUrl = cfg.appBaseUrl + '/api/workers/reconcile-snapshot?mode=record&submissionId=' + encodeURIComponent(targetId);
        var recRes = fetchSnapshotWithRetry_(recUrl, cfg.reconcileSecret);
        if (recRes && recRes.record) {
          upsertLinelistRowFromReconcile_(sheet, recRes.record);
          if (insertIdsMap[targetId]) {
            state.stats.inserted++;
          } else {
            state.stats.updated++;
          }
        }
      }

      // 3b. Quarantine rows: capture full row snapshot into "Quarantine" tab FIRST
      var removals = [];
      for (var qi = 0; qi < state.toQuarantine.length; qi++) {
        var qEntry = state.toQuarantine[qi];
        appendQuarantineRow_(ss, {
          id: qEntry.id,
          state: qEntry.state,
          capturedAt: new Date(nowFn()).toISOString(),
          reason: qEntry.reason,
          snapshot: qEntry.snapshot
        });
        state.stats.quarantined++;
        removals.push(qEntry);
      }

      // 3c. Soft-delete tombstones: write metadata into hidden "Trash" tab & trash Drive folder
      for (var si = 0; si < state.toSoftDelete.length; si++) {
        var sdEntry = state.toSoftDelete[si];
        var folderId = trashDriveFolderForReconcile_(ss, sdEntry.id, sdEntry.reason);
        if (typeof upsertTrashRow_ === 'function') {
          upsertTrashRow_(ss, {
            submissionId: sdEntry.id,
            state: sdEntry.state,
            deletedAt: sdEntry.deletedAt,
            deletedBy: sdEntry.deletedBy,
            reason: sdEntry.reason,
            folderId: folderId
          });
        }
        state.stats.softDeleted++;
        removals.push(sdEntry);
      }

      // 3d. Remove moved rows from active linelist bottom-to-top to keep earlier indices stable
      // Look up live rowIndex by ID because inserts above append at bottom cleanly while existing rows keep indices
      if (removals.length > 0) {
        var liveLastRow = sheet.getLastRow();
        var liveIds = liveLastRow >= 4 ? sheet.getRange(4, 1, liveLastRow - 3, 1).getValues() : [];
        var idToRows = {};
        for (var lr = 0; lr < liveIds.length; lr++) {
          var lid = String(liveIds[lr][0]).trim();
          if (!idToRows[lid]) idToRows[lid] = [];
          idToRows[lid].push(4 + lr);
        }
        var rowsToDelete = [];
        for (var rm = 0; rm < removals.length; rm++) {
          var rmItem = removals[rm];
          if (rmItem.reason === 'DUPLICATE_SHEET_ROW') {
            rowsToDelete.push(rmItem.rowIndex);
          } else {
            var candidateRows = idToRows[rmItem.id] || [];
            if (candidateRows.length > 0) rowsToDelete.push(candidateRows[0]);
          }
        }
        rowsToDelete.sort(function (a, b) { return b - a; });
        var prevDel = -1;
        for (var dr = 0; dr < rowsToDelete.length; dr++) {
          var delIdx = rowsToDelete[dr];
          if (delIdx >= 4 && delIdx !== prevDel) {
            if (typeof sheet.deleteRow === 'function') {
              sheet.deleteRow(delIdx);
            } else if (typeof sheet.deleteRows === 'function') {
              sheet.deleteRows(delIdx, 1);
            }
            prevDel = delIdx;
          }
        }
      }
    }

    props.deleteProperty(RECONCILE_CURSOR_PROP);
    deleteContinuationTriggerOnly_(props);

    var doneReport = {
      runId: state.runId,
      startedAtIso: state.startedAtIso,
      durationMs: Math.max(0, nowFn() - startMs),
      status: 'COMPLETED',
      stats: state.stats,
      details: 'Reconciled successfully'
    };
    appendReconcileRunLog_(ss, doneReport);
    sendReconcileSummaryEmail_(props, doneReport);
    return doneReport;
  } catch (err) {
    try { props.deleteProperty(RECONCILE_CURSOR_PROP); } catch (e) {}
    try { deleteContinuationTriggerOnly_(props); } catch (e) {}
    var errReport = {
      runId: state ? state.runId : ('rec-' + new Date(startMs).toISOString().replace(/[:.]/g, '-')),
      startedAtIso: state ? state.startedAtIso : new Date(startMs).toISOString(),
      durationMs: Math.max(0, nowFn() - startMs),
      status: 'FAILED',
      stats: state ? state.stats : { scannedDb: 0, scannedSheet: 0, matched: 0, inserted: 0, updated: 0, softDeleted: 0, quarantined: 0 },
      details: err && err.message ? err.message : String(err)
    };
    appendReconcileRunLog_(ss, errReport);
    sendReconcileSummaryEmail_(props, errReport);
    return errReport;
  } finally {
    if (hasLock && lock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}
