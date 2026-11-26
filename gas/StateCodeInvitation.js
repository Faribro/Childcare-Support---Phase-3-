/**
 * Google Sheets "Staff Access" -> "State Code Invitation" Module
 *
 * Security Invariants:
 * - Numeric 3-digit LGD state code shown in the modal is strictly informational
 *   (convenience display only — NEVER grants access, replaces OTP, or assigns scopes).
 * - Never trusts client HTML form for sender identity: resolves active user directly
 *   via Session.getActiveUser().getEmail() and FAILS CLOSED if empty (zero fallback
 *   to Session.getEffectiveUser()).
 * - Authenticates to Next.js bridge endpoint using dedicated Script Property
 *   SHEET_INVITATION_BRIDGE_SECRET (never stored in HTML, cells, or repo; never reuses
 *   WEBHOOK_SECRET).
 * - One-time invitation code NEVER returns to the Sheet script, UI modal, toast, logs,
 *   or any cell.
 * - Logs non-secret attempt metadata to "Invitation Log" tab (neutralized against CSV/formula injection).
 */

var INVITATION_LOG_TAB_NAME = 'Invitation Log';
var INVITATION_LOG_HEADERS = [
  'Timestamp (IST)',
  'Sender Email',
  'Recipient Name',
  'Recipient Email',
  'State',
  'Status',
  'Detail / Remaining Mail Quota'
];

var CANONICAL_STATE_INVITATION_CATALOG = [
  { canonicalName: 'Andhra Pradesh', lgdCode: '28', lgdNumericCode: '028', isoCode: 'AP', aliases: ['AP', 'STATE-AP'] },
  { canonicalName: 'Arunachal Pradesh', lgdCode: '12', lgdNumericCode: '012', isoCode: 'AR', aliases: ['AR', 'STATE-AR'] },
  { canonicalName: 'Assam', lgdCode: '18', lgdNumericCode: '018', isoCode: 'AS', aliases: ['AS', 'STATE-AS'] },
  { canonicalName: 'Bihar', lgdCode: '10', lgdNumericCode: '010', isoCode: 'BR', aliases: ['BR', 'STATE-BR'] },
  { canonicalName: 'Chhattisgarh', lgdCode: '22', lgdNumericCode: '022', isoCode: 'CG', aliases: ['CT', 'STATE-CT', 'CG', 'STATE-CG'] },
  { canonicalName: 'Delhi', lgdCode: '07', lgdNumericCode: '007', isoCode: 'DL', aliases: ['DL', 'STATE-DL', 'NCT OF DELHI'] },
  { canonicalName: 'Goa', lgdCode: '30', lgdNumericCode: '030', isoCode: 'GA', aliases: ['GA', 'STATE-GA'] },
  { canonicalName: 'Gujarat', lgdCode: '24', lgdNumericCode: '024', isoCode: 'GJ', aliases: ['GJ', 'STATE-GJ'] },
  { canonicalName: 'Haryana', lgdCode: '06', lgdNumericCode: '006', isoCode: 'HR', aliases: ['HR', 'STATE-HR'] },
  { canonicalName: 'Himachal Pradesh', lgdCode: '02', lgdNumericCode: '002', isoCode: 'HP', aliases: ['HP', 'STATE-HP'] },
  { canonicalName: 'Jharkhand', lgdCode: '20', lgdNumericCode: '020', isoCode: 'JH', aliases: ['JH', 'STATE-JH'] },
  { canonicalName: 'Karnataka', lgdCode: '29', lgdNumericCode: '029', isoCode: 'KA', aliases: ['KA', 'STATE-KA'] },
  { canonicalName: 'Kerala', lgdCode: '32', lgdNumericCode: '032', isoCode: 'KL', aliases: ['KL', 'STATE-KL'] },
  { canonicalName: 'Madhya Pradesh', lgdCode: '23', lgdNumericCode: '023', isoCode: 'MP', aliases: ['MP', 'STATE-MP'] },
  { canonicalName: 'Maharashtra', lgdCode: '27', lgdNumericCode: '027', isoCode: 'MH', aliases: ['MH', 'STATE-MH'] },
  { canonicalName: 'Manipur', lgdCode: '14', lgdNumericCode: '014', isoCode: 'MN', aliases: ['MN', 'STATE-MN'] },
  { canonicalName: 'Meghalaya', lgdCode: '17', lgdNumericCode: '017', isoCode: 'ML', aliases: ['ML', 'STATE-ML'] },
  { canonicalName: 'Mizoram', lgdCode: '15', lgdNumericCode: '015', isoCode: 'MZ', aliases: ['MZ', 'STATE-MZ'] },
  { canonicalName: 'Nagaland', lgdCode: '13', lgdNumericCode: '013', isoCode: 'NL', aliases: ['NL', 'STATE-NL'] },
  { canonicalName: 'Odisha', lgdCode: '21', lgdNumericCode: '021', isoCode: 'OD', aliases: ['OD', 'STATE-OD', 'OR', 'ORISSA'] },
  { canonicalName: 'Punjab', lgdCode: '03', lgdNumericCode: '003', isoCode: 'PB', aliases: ['PB', 'STATE-PB'] },
  { canonicalName: 'Rajasthan', lgdCode: '08', lgdNumericCode: '008', isoCode: 'RJ', aliases: ['RJ', 'STATE-RJ'] },
  { canonicalName: 'Sikkim', lgdCode: '11', lgdNumericCode: '011', isoCode: 'SK', aliases: ['SK', 'STATE-SK'] },
  { canonicalName: 'Tamil Nadu', lgdCode: '33', lgdNumericCode: '033', isoCode: 'TN', aliases: ['TN', 'STATE-TN'] },
  { canonicalName: 'Telangana', lgdCode: '36', lgdNumericCode: '036', isoCode: 'TS', aliases: ['TG', 'STATE-TG', 'TS', 'STATE-TS'] },
  { canonicalName: 'Tripura', lgdCode: '16', lgdNumericCode: '016', isoCode: 'TR', aliases: ['TR', 'STATE-TR'] },
  { canonicalName: 'Uttar Pradesh', lgdCode: '09', lgdNumericCode: '009', isoCode: 'UP', aliases: ['UP', 'STATE-UP'] },
  { canonicalName: 'Uttarakhand', lgdCode: '05', lgdNumericCode: '005', isoCode: 'UK', aliases: ['UK', 'STATE-UK'] },
  { canonicalName: 'West Bengal', lgdCode: '19', lgdNumericCode: '019', isoCode: 'WB', aliases: ['WB', 'STATE-WB'] },
  { canonicalName: 'Andaman and Nicobar Islands', lgdCode: '35', lgdNumericCode: '035', isoCode: 'AN', aliases: ['AN', 'STATE-AN'] },
  { canonicalName: 'Chandigarh', lgdCode: '04', lgdNumericCode: '004', isoCode: 'CH', aliases: ['CH', 'STATE-CH'] },
  { canonicalName: 'Dadra and Nagar Haveli and Daman and Diu', lgdCode: '38', lgdNumericCode: '038', isoCode: 'DD', aliases: ['DD', 'STATE-DD', 'DN', 'DNHDD'] },
  { canonicalName: 'Jammu and Kashmir', lgdCode: '01', lgdNumericCode: '001', isoCode: 'JK', aliases: ['JK', 'STATE-JK'] },
  { canonicalName: 'Ladakh', lgdCode: '37', lgdNumericCode: '037', isoCode: 'LA', aliases: ['LA', 'STATE-LA'] },
  { canonicalName: 'Lakshadweep', lgdCode: '31', lgdNumericCode: '031', isoCode: 'LD', aliases: ['LD', 'STATE-LD'] },
  { canonicalName: 'Puducherry', lgdCode: '34', lgdNumericCode: '034', isoCode: 'PY', aliases: ['PY', 'STATE-PY'] }
];

function getStateCodeInvitationCatalog_() {
  return CANONICAL_STATE_INVITATION_CATALOG.slice();
}

function resolveCanonicalStateEntryGas_(rawState) {
  if (!rawState || typeof rawState !== 'string') return null;
  var upper = rawState.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!upper) return null;
  for (var i = 0; i < CANONICAL_STATE_INVITATION_CATALOG.length; i++) {
    var entry = CANONICAL_STATE_INVITATION_CATALOG[i];
    if (entry.canonicalName.toUpperCase() === upper) return entry;
    if (entry.isoCode.toUpperCase() === upper) return entry;
    for (var j = 0; j < entry.aliases.length; j++) {
      if (entry.aliases[j].toUpperCase() === upper) return entry;
    }
  }
  return null;
}

/**
 * Resolves the active clicking administrator email strictly via Session.getActiveUser().
 * NEVER falls back to Session.getEffectiveUser() so non-admin users cannot inherit
 * the Sheet owner's identity.
 */
function getActiveInvitationSenderEmail_() {
  try {
    if (typeof Session !== 'undefined' && Session && typeof Session.getActiveUser === 'function') {
      var user = Session.getActiveUser();
      var email = user && typeof user.getEmail === 'function' ? user.getEmail() : '';
      var clean = email ? String(email).trim().toLowerCase() : '';
      if (clean && clean.indexOf('@') !== -1) {
        return clean;
      }
    }
  } catch (err) {
    Logger.log('Session.getActiveUser resolution error: ' + err);
  }
  return '';
}

function getInvitationBridgeConfig_() {
  var props = PropertiesService.getScriptProperties();
  var appBaseUrl = props ? String(props.getProperty('APP_BASE_URL') || '').trim().replace(/\/+$/, '') : '';
  var bridgeSecret = props ? String(props.getProperty('SHEET_INVITATION_BRIDGE_SECRET') || '').trim() : '';
  var appEnv = props ? String(props.getProperty('APP_ENV') || '').trim().toLowerCase() : '';

  if (!appBaseUrl || !bridgeSecret) {
    return {
      valid: false,
      error: 'Bridge not configured: APP_BASE_URL and SHEET_INVITATION_BRIDGE_SECRET must be set in Script Properties.'
    };
  }

  if (appBaseUrl.indexOf('https://') !== 0 && appBaseUrl.indexOf('http://localhost') !== 0) {
    return {
      valid: false,
      error: 'Invalid APP_BASE_URL configuration: HTTPS endpoint is required.'
    };
  }

  // Prevent staging Sheets from hitting production or production Sheets from hitting staging
  if (appEnv === 'staging' && appBaseUrl.indexOf('childcare.allianceindia.org') !== -1) {
    return {
      valid: false,
      error: 'Environment isolation error: staging script cannot call production APP_BASE_URL.'
    };
  }
  if (appEnv === 'production' && appBaseUrl.indexOf('csc-staging') !== -1) {
    return {
      valid: false,
      error: 'Environment isolation error: production script cannot call staging APP_BASE_URL.'
    };
  }

  return {
    valid: true,
    appBaseUrl: appBaseUrl,
    bridgeSecret: bridgeSecret
  };
}

function sanitizeSheetCellText_(raw) {
  var s = raw === null || raw === undefined ? '' : String(raw).replace(/[\r\n\t]+/g, ' ').trim();
  if (/^[=+\-@]/.test(s)) {
    return "'" + s;
  }
  return s;
}

function formatTimestampIst_(date) {
  var d = date || new Date();
  try {
    if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.formatDate === 'function') {
      return Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss') + ' IST';
    }
  } catch (err) {}
  return new Date(d.getTime() + 330 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' IST';
}

function getOrCreateInvitationLogSheet_(ss) {
  var logSheet = ss.getSheetByName(INVITATION_LOG_TAB_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(INVITATION_LOG_TAB_NAME);
    logSheet.getRange(1, 1, 1, INVITATION_LOG_HEADERS.length).setValues([INVITATION_LOG_HEADERS]);
    if (typeof logSheet.setFrozenRows === 'function') {
      logSheet.setFrozenRows(1);
    }
  } else if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1, 1, 1, INVITATION_LOG_HEADERS.length).setValues([INVITATION_LOG_HEADERS]);
    if (typeof logSheet.setFrozenRows === 'function') {
      logSheet.setFrozenRows(1);
    }
  }
  return logSheet;
}

function appendInvitationLogRow_(ss, entry) {
  try {
    if (!ss) return;
    var logSheet = getOrCreateInvitationLogSheet_(ss);
    // Zero plaintext invite codes or secrets ever written to the log tab
    logSheet.appendRow([
      formatTimestampIst_(new Date()),
      sanitizeSheetCellText_(entry.senderEmail || 'UNIDENTIFIED'),
      sanitizeSheetCellText_(entry.recipientName || ''),
      sanitizeSheetCellText_(entry.recipientEmail || ''),
      sanitizeSheetCellText_(entry.state || ''),
      sanitizeSheetCellText_(entry.status || ''),
      sanitizeSheetCellText_(entry.detail || '')
    ]);
  } catch (err) {
    Logger.log('Failed to write Invitation Log row: ' + err);
  }
}

function showSheetToast_(ss, message) {
  try {
    if (ss && typeof ss.toast === 'function') {
      ss.toast(String(message || ''), 'State Code Invitation', 8);
    }
  } catch (err) {
    Logger.log('Spreadsheet toast failed: ' + err);
  }
}

function menuOpenStateCodeInvitation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var template = HtmlService.createTemplateFromFile('StateInvitationDialog');
  template.stateCatalogJson = JSON.stringify(getStateCodeInvitationCatalog_().map(function(s) {
    return {
      canonicalName: s.canonicalName,
      lgdNumericCode: s.lgdNumericCode,
      isoCode: s.isoCode
    };
  }));
  var activeSender = getActiveInvitationSenderEmail_();
  template.activeSenderHint = activeSender || '';

  var html = template.evaluate()
    .setWidth(440)
    .setHeight(560);
  ui.showModalDialog(html, 'State Code Invitation');
}

/**
 * Server handler invoked from StateInvitationDialog.html via google.script.run.
 * Validates sender identity, inputs, and bridge secret; never exposes or logs invite codes.
 */
function submitStateCodeInvitation(formData) {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}

  var lock = typeof LockService !== 'undefined' && LockService ? LockService.getScriptLock() : null;
  var hasLock = false;

  try {
    if (lock) {
      hasLock = lock.tryLock(15000);
      if (!hasLock) {
        var busyMsg = 'Another invitation request is currently in progress. Please wait a few seconds and retry.';
        showSheetToast_(ss, busyMsg);
        return { ok: false, status: 'BUSY', message: busyMsg };
      }
    }

    var senderEmail = getActiveInvitationSenderEmail_();
    var recipientName = formData && typeof formData.recipientName === 'string'
      ? formData.recipientName.replace(/[\r\n\t]+/g, ' ').trim()
      : '';
    var recipientEmail = formData && typeof formData.recipientEmail === 'string'
      ? formData.recipientEmail.trim().toLowerCase()
      : '';
    var rawState = formData && typeof formData.assignedState === 'string'
      ? formData.assignedState.trim()
      : '';
    var resolvedState = resolveCanonicalStateEntryGas_(rawState);

    if (!senderEmail) {
      var unauthMsg = 'Unable to verify your signed-in Google account email (Session.getActiveUser() returned empty). Only authorised administrators with one-time script authorisation in a verified domain/account can send invitations.';
      appendInvitationLogRow_(ss, {
        senderEmail: 'UNIDENTIFIED',
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        state: resolvedState ? resolvedState.canonicalName : rawState,
        status: 'DENIED_UNIDENTIFIED_SENDER',
        detail: 'Empty Session.getActiveUser() email'
      });
      showSheetToast_(ss, unauthMsg);
      return { ok: false, status: 'DENIED_UNIDENTIFIED_SENDER', message: unauthMsg };
    }

    if (!recipientName || recipientName.length < 2 || recipientName.length > 120) {
      var nameErr = 'Recipient name must be between 2 and 120 characters.';
      appendInvitationLogRow_(ss, {
        senderEmail: senderEmail,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        state: resolvedState ? resolvedState.canonicalName : rawState,
        status: 'VALIDATION_ERROR',
        detail: nameErr
      });
      showSheetToast_(ss, nameErr);
      return { ok: false, status: 'VALIDATION_ERROR', message: nameErr };
    }

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      var emailErr = 'Please enter a valid recipient work email address.';
      appendInvitationLogRow_(ss, {
        senderEmail: senderEmail,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        state: resolvedState ? resolvedState.canonicalName : rawState,
        status: 'VALIDATION_ERROR',
        detail: emailErr
      });
      showSheetToast_(ss, emailErr);
      return { ok: false, status: 'VALIDATION_ERROR', message: emailErr };
    }

    if (!resolvedState) {
      var stateErr = 'Please select a valid State or Union Territory from the list.';
      appendInvitationLogRow_(ss, {
        senderEmail: senderEmail,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        state: rawState,
        status: 'VALIDATION_ERROR',
        detail: stateErr
      });
      showSheetToast_(ss, stateErr);
      return { ok: false, status: 'VALIDATION_ERROR', message: stateErr };
    }

    var bridgeConfig = getInvitationBridgeConfig_();
    if (!bridgeConfig.valid) {
      appendInvitationLogRow_(ss, {
        senderEmail: senderEmail,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        state: resolvedState.canonicalName,
        status: 'CONFIG_ERROR',
        detail: bridgeConfig.error
      });
      showSheetToast_(ss, bridgeConfig.error);
      return { ok: false, status: 'CONFIG_ERROR', message: bridgeConfig.error };
    }

    var endpointUrl = bridgeConfig.appBaseUrl + '/api/admin/state-team-invitations/sheet-bridge';
    var res = UrlFetchApp.fetch(endpointUrl, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        'X-Invitation-Bridge-Secret': bridgeConfig.bridgeSecret
      },
      payload: JSON.stringify({
        actorEmail: senderEmail,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        assignedState: resolvedState.canonicalName
      })
    });

    var statusCode = res.getResponseCode();
    var bodyText = res.getContentText() || '';
    var data = {};
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch (parseErr) {}

    if (statusCode < 200 || statusCode >= 300 || data.status !== 'success') {
      var errMsg = (data && data.error) ? String(data.error) : ('Server rejected request (HTTP ' + statusCode + ').');
      var failStatus = (data && data.code) ? String(data.code) : ('HTTP_' + statusCode);
      appendInvitationLogRow_(ss, {
        senderEmail: senderEmail,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        state: resolvedState.canonicalName,
        status: failStatus,
        detail: errMsg
      });
      showSheetToast_(ss, errMsg);
      return {
        ok: false,
        status: failStatus,
        message: errMsg
      };
    }

    var quotaNote = (typeof data.remainingDailyQuota === 'number')
      ? ('Remaining MailApp daily quota: ' + data.remainingDailyQuota)
      : 'Dispatched via app email gateway';

    var successMsg = 'Invitation emailed to ' + recipientEmail + ' for ' + resolvedState.canonicalName + '. ' + quotaNote + '.';

    appendInvitationLogRow_(ss, {
      senderEmail: senderEmail,
      recipientName: recipientName,
      recipientEmail: recipientEmail,
      state: resolvedState.canonicalName,
      status: 'SENT',
      detail: quotaNote
    });

    showSheetToast_(ss, successMsg);

    return {
      ok: true,
      status: 'SENT',
      message: successMsg,
      assignedState: resolvedState.canonicalName,
      lgdNumericCode: resolvedState.lgdNumericCode,
      remainingDailyQuota: typeof data.remainingDailyQuota === 'number' ? data.remainingDailyQuota : null,
      adminNotifiedCount: typeof data.adminNotifiedCount === 'number' ? data.adminNotifiedCount : null
    };
  } catch (err) {
    var unexpectedErr = 'Unexpected error while sending invitation. Please retry or check logs.';
    Logger.log('submitStateCodeInvitation failure: ' + (err && err.message ? err.message : err));
    appendInvitationLogRow_(ss, {
      senderEmail: getActiveInvitationSenderEmail_() || 'UNKNOWN',
      recipientName: formData && formData.recipientName,
      recipientEmail: formData && formData.recipientEmail,
      state: formData && formData.assignedState,
      status: 'INTERNAL_ERROR',
      detail: 'Apps Script execution exception'
    });
    showSheetToast_(ss, unexpectedErr);
    return { ok: false, status: 'INTERNAL_ERROR', message: unexpectedErr };
  } finally {
    if (lock && hasLock) {
      try { lock.releaseLock(); } catch (rErr) {}
    }
  }
}

/**
 * Fetches allowlisted Administrator contacts ({ id, name, email } — no job titles)
 * from /api/admin/leader-access/sheet-bridge via the configured bridge secret.
 */
function fetchAdminAccessContacts_(senderEmail, bridgeConfig) {
  var endpointUrl = bridgeConfig.appBaseUrl + '/api/admin/leader-access/sheet-bridge';
  var res = UrlFetchApp.fetch(endpointUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'X-Invitation-Bridge-Secret': bridgeConfig.bridgeSecret
    },
    payload: JSON.stringify({
      actorEmail: senderEmail,
      action: 'list'
    })
  });
  var statusCode = res.getResponseCode();
  var bodyText = res.getContentText() || '';
  var data = {};
  try {
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch (parseErr) {}

  if (statusCode < 200 || statusCode >= 300 || data.status !== 'success') {
    return {
      ok: false,
      error: (data && data.error) ? String(data.error) : ('Unable to load Administration contacts (HTTP ' + statusCode + ').')
    };
  }
  return {
    ok: true,
    administrators: Array.isArray(data.administrators) ? data.administrators : []
  };
}

function menuOpenAdminAccessModal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var template = HtmlService.createTemplateFromFile('AdminAccessDialog');
  var activeSender = getActiveInvitationSenderEmail_();
  var bridgeConfig = getInvitationBridgeConfig_();

  var contacts = [];
  var loadError = '';
  if (!activeSender) {
    loadError = 'Unable to verify your signed-in Google account email (Session.getActiveUser() returned empty).';
  } else if (!bridgeConfig.valid) {
    loadError = bridgeConfig.error;
  } else {
    try {
      var fetched = fetchAdminAccessContacts_(activeSender, bridgeConfig);
      if (fetched.ok) {
        contacts = fetched.administrators;
      } else {
        loadError = fetched.error;
      }
    } catch (err) {
      loadError = 'Unable to contact portal server to list allowlisted administrators.';
    }
  }

  template.adminContactsJson = JSON.stringify(contacts);
  template.activeSenderHint = activeSender || '';
  template.initialLoadErrorJson = JSON.stringify(loadError || '');

  var html = template.evaluate()
    .setWidth(440)
    .setHeight(430);
  ui.showModalDialog(html, 'Send Administration Access Code');
}

/**
 * Server handler invoked from AdminAccessDialog.html via google.script.run.
 * Requests server dispatch of the confidential ADMIN_PORTAL_ACCESS_CODE to the selected
 * allowlisted Administrator's stored email. Never stores or exposes the code in Sheet/GAS.
 */
function submitAdminAccessDispatch(formData) {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}

  var lock = typeof LockService !== 'undefined' && LockService ? LockService.getScriptLock() : null;
  var hasLock = false;

  try {
    if (lock) {
      hasLock = lock.tryLock(15000);
      if (!hasLock) {
        var busyMsg = 'Another Staff Access request is in progress. Please wait a few seconds and retry.';
        showSheetToast_(ss, busyMsg);
        return { ok: false, status: 'BUSY', message: busyMsg };
      }
    }

    var senderEmail = getActiveInvitationSenderEmail_();
    var targetEmail = formData && typeof formData.targetEmail === 'string'
      ? formData.targetEmail.trim().toLowerCase()
      : '';
    var targetId = formData && typeof formData.targetId === 'string'
      ? formData.targetId.trim()
      : '';

    if (!senderEmail) {
      var unauthMsg = 'Unable to verify your signed-in Google account email (Session.getActiveUser() returned empty).';
      appendInvitationLogRow_(ss, {
        senderEmail: 'UNIDENTIFIED',
        recipientName: 'Administration',
        recipientEmail: targetEmail,
        state: 'ADMINISTRATION',
        status: 'DENIED_UNIDENTIFIED_SENDER',
        detail: 'Empty Session.getActiveUser() email'
      });
      showSheetToast_(ss, unauthMsg);
      return { ok: false, status: 'DENIED_UNIDENTIFIED_SENDER', message: unauthMsg };
    }

    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      var emailErr = 'Please select an authorised Programme Administrator.';
      showSheetToast_(ss, emailErr);
      return { ok: false, status: 'VALIDATION_ERROR', message: emailErr };
    }

    var bridgeConfig = getInvitationBridgeConfig_();
    if (!bridgeConfig.valid) {
      showSheetToast_(ss, bridgeConfig.error);
      return { ok: false, status: 'CONFIG_ERROR', message: bridgeConfig.error };
    }

    var endpointUrl = bridgeConfig.appBaseUrl + '/api/admin/leader-access/sheet-bridge';
    var res = UrlFetchApp.fetch(endpointUrl, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        'X-Invitation-Bridge-Secret': bridgeConfig.bridgeSecret
      },
      payload: JSON.stringify({
        actorEmail: senderEmail,
        action: 'send',
        targetEmail: targetEmail,
        targetId: targetId
      })
    });

    var statusCode = res.getResponseCode();
    var bodyText = res.getContentText() || '';
    var data = {};
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch (parseErr) {}

    if (statusCode < 200 || statusCode >= 300 || data.status !== 'success') {
      var errMsg = (data && data.error) ? String(data.error) : ('Server rejected request (HTTP ' + statusCode + ').');
      var failStatus = (data && data.code) ? String(data.code) : ('HTTP_' + statusCode);
      appendInvitationLogRow_(ss, {
        senderEmail: senderEmail,
        recipientName: data.recipientName || 'Administration',
        recipientEmail: targetEmail,
        state: 'ADMINISTRATION',
        status: failStatus,
        detail: errMsg
      });
      showSheetToast_(ss, errMsg);
      return { ok: false, status: failStatus, message: errMsg };
    }

    var successMsg = 'Administration access code dispatched to ' + (data.deliveredTo || targetEmail) + '.';
    appendInvitationLogRow_(ss, {
      senderEmail: senderEmail,
      recipientName: data.recipientName || 'Administration',
      recipientEmail: data.deliveredTo || targetEmail,
      state: 'ADMINISTRATION',
      status: 'ADMIN_CODE_SENT',
      detail: 'Dispatched via app email gateway (code not stored)'
    });
    showSheetToast_(ss, successMsg);

    return {
      ok: true,
      status: 'ADMIN_CODE_SENT',
      message: successMsg,
      deliveredTo: data.deliveredTo || targetEmail,
      recipientName: data.recipientName || ''
    };
  } catch (err) {
    var unexpectedErr = 'Unexpected error while dispatching Administration access code.';
    Logger.log('submitAdminAccessDispatch failure: ' + (err && err.message ? err.message : err));
    showSheetToast_(ss, unexpectedErr);
    return { ok: false, status: 'INTERNAL_ERROR', message: unexpectedErr };
  } finally {
    if (lock && hasLock) {
      try { lock.releaseLock(); } catch (rErr) {}
    }
  }
}
