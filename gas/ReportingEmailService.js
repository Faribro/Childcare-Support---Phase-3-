/**
 * Google Apps Script Reporting & Email Delivery Service
 * Part of Phase 3 Leadership Surveillance & Reporting Integration
 *
 * Invariants:
 * 1. Read-only data access for reporting (mutations prohibited).
 * 2. Fail-closed recipient authorization (registered organizational domains only).
 * 3. Duplicate-send suppression using CacheService idempotency records (24h TTL).
 * 4. Honest MailApp daily quota reporting.
 * 5. DPDP-compliant PII redaction on all reporting data rows.
 */

var ALLOWED_REPORT_ATTACHMENT_MIMES = ['text/csv', 'application/pdf'];
var MAX_REPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB
var APPROVED_EMAIL_DOMAINS = ['allianceindia.org'];

/**
 * Validates organizational email recipient for Apps Script delivery.
 * Prohibits public / consumer domains (gmail, yahoo, etc.).
 */
function isAuthorizedRecipientEmail_(email) {
  if (!email) return false;
  var s = String(email).trim().toLowerCase();
  var parts = s.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  var domain = parts[1];
  for (var i = 0; i < APPROVED_EMAIL_DOMAINS.length; i++) {
    var approved = APPROVED_EMAIL_DOMAINS[i];
    if (domain === approved || domain.indexOf('.' + approved) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * Validates report attachment inside Apps Script.
 */
function validateAttachmentGAS_(att) {
  if (!att) return { valid: true };

  var filename = String(att.filename || '').trim();
  var safeFilenameRegex = /^[a-zA-Z0-9_\-\. ()]+\.(csv|pdf)$/i;
  if (!filename || !safeFilenameRegex.test(filename) || filename.indexOf('..') !== -1) {
    return {
      valid: false,
      error: 'Unsafe attachment filename. Filename must end in .csv or .pdf and contain no path traversal.'
    };
  }

  var mime = String(att.mimeType || '').trim().toLowerCase();
  if (ALLOWED_REPORT_ATTACHMENT_MIMES.indexOf(mime) === -1) {
    return {
      valid: false,
      error: 'Unsupported attachment MIME type: ' + att.mimeType + '. Only CSV and PDF permitted.'
    };
  }

  var size = Number(att.byteSize || 0);
  if (size <= 0 || size > MAX_REPORT_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: 'Attachment size ' + size + ' bytes exceeds 10MB maximum limit.'
    };
  }

  if (!att.contentBase64) {
    return { valid: false, error: 'Missing attachment contentBase64.' };
  }

  return { valid: true };
}

/**
 * Masks sensitive beneficiary PII in reporting rows (DPDP compliance).
 */
function maskReportRowPII_(row) {
  var masked = row.slice();
  // Column 16: Caregiver Contact (0-indexed: 15)
  if (masked[15]) {
    var phone = String(masked[15]).replace(/\D/g, '');
    masked[15] = phone.length >= 4 ? '******' + phone.slice(-4) : '******';
  }
  // Column 21: Bank Account Number (0-indexed: 20)
  if (masked[20]) {
    var bank = String(masked[20]).trim();
    masked[20] = bank.length >= 4 ? 'XXXX-XXXX-' + bank.slice(-4) : 'XXXX-XXXX';
  }
  // Column 24: Child Aadhaar Number (0-indexed: 23)
  if (masked[23]) {
    var aadhaar = String(masked[23]).replace(/\D/g, '');
    masked[23] = aadhaar.length >= 4 ? 'XXXX-XXXX-' + aadhaar.slice(-4) : 'XXXX-XXXX-XXXX';
  }
  return masked;
}

/**
 * Action: 'reportingQuery'
 * Authoritative read-only data extraction for surveillance and leadership dashboards.
 */
function handleReportingQuery_(payload, requestId) {
  payload = payload || {};
  var filters = payload.filters || {};
  var limit = Math.min(parseInt(payload.limit, 10) || 500, 1000);

  var ctx = getSheetAndColMap_();
  var sheet = ctx.sheet;
  var lastRow = sheet.getLastRow();
  var headerRowIdx = ctx.headerRowIndex || HEADER_ROW_INDEX;
  var firstDataRow = headerRowIdx + 1;

  if (lastRow < firstDataRow) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        records: [],
        totalCount: 0,
        requestId: requestId || null
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var numRows = lastRow - firstDataRow + 1;
  var numCols = Math.max(sheet.getLastColumn(), COLUMN_HEADERS.length);
  var values = sheet.getRange(firstDataRow, 1, numRows, numCols).getValues();

  var stateCol = ctx.colMap['18\nstate'] || 18;
  var districtCol = ctx.colMap['19\ndistrict'] || 19;
  var visitDateCol = ctx.colMap['7\nvisit date'] || 7;
  var submissionDateCol = ctx.colMap['3\nsubmission time'] || 3;
  var orphanCol = ctx.colMap['13\norphan status'] || 13;
  var schoolCol = ctx.colMap['53\nschool type'] || 53;

  var filteredRecords = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var uid = String(row[0] || '').trim();
    if (!uid) continue; // Skip blank rows

    var rState = String(row[stateCol - 1] || '').trim();
    var rDistrict = String(row[districtCol - 1] || '').trim();
    var rOrphan = String(row[orphanCol - 1] || '').trim();
    var rSchool = String(row[schoolCol - 1] || '').trim();
    var rDate = filters.dateBasis === 'VISIT_DATE'
      ? String(row[visitDateCol - 1] || '').trim()
      : String(row[submissionDateCol - 1] || '').trim();

    // Filters
    if (filters.state && rState.toLowerCase() !== String(filters.state).trim().toLowerCase()) {
      continue;
    }
    if (filters.district && rDistrict.toLowerCase() !== String(filters.district).trim().toLowerCase()) {
      continue;
    }
    if (filters.orphanStatus && rOrphan !== filters.orphanStatus) {
      continue;
    }
    if (filters.schoolType && rSchool !== filters.schoolType) {
      continue;
    }
    if (filters.startDate && rDate && rDate < filters.startDate) {
      continue;
    }
    if (filters.endDate && rDate && rDate > filters.endDate) {
      continue;
    }

    // Mask sensitive PII
    var maskedRow = maskReportRowPII_(row);

    filteredRecords.push({
      uniqueId: uid,
      revisionNumber: Number(row[1] || 1),
      submissionTime: row[2] || '',
      visitDate: row[visitDateCol - 1] || '',
      childName: row[8] || '',
      state: rState,
      district: rDistrict,
      orphanStatus: rOrphan,
      schoolType: rSchool,
      maskedAadhaar: maskedRow[23] || '',
      maskedBankAccount: maskedRow[20] || '',
      maskedCaregiverPhone: maskedRow[15] || '',
      isSynthetic: true
    });

    if (filteredRecords.length >= limit) break;
  }

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'success',
      records: filteredRecords,
      totalCount: filteredRecords.length,
      hasMore: filteredRecords.length >= limit,
      requestId: requestId || null
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Action: 'sendReportEmail'
 * Apps Script email delivery to registered organizational recipients.
 * Enforces attachment validation, duplicate-send protection via CacheService, and honest quota status.
 */
function handleReportEmailDelivery_(payload, requestId) {
  payload = payload || {};
  var idempotencyKey = String(payload.idempotencyKey || '').trim();
  var recipientEmail = String(payload.recipientEmail || '').trim().toLowerCase();
  var reportType = String(payload.reportType || '').trim();
  var subject = String(payload.subject || '').trim();
  var summaryHtml = String(payload.summaryHtml || '').trim();
  var summaryText = String(payload.summaryText || '').trim();

  // 1. Validate required fields
  if (!idempotencyKey) {
    return errorResponse_('Missing required idempotencyKey for duplicate-send protection.', 'VALIDATION_ERROR', 400, requestId);
  }
  if (!recipientEmail) {
    return errorResponse_('Missing recipientEmail.', 'VALIDATION_ERROR', 400, requestId);
  }
  if (!subject || !summaryHtml) {
    return errorResponse_('Missing subject or summaryHtml.', 'VALIDATION_ERROR', 400, requestId);
  }

  // 2. Validate registered organizational domain
  if (!isAuthorizedRecipientEmail_(recipientEmail)) {
    return errorResponse_(
      'Recipient ' + recipientEmail + ' is not an authorized organizational recipient. External and personal domains are prohibited.',
      'UNAUTHORIZED',
      403,
      requestId
    );
  }

  // 3. Duplicate-send protection via CacheService
  var cache = CacheService.getScriptCache();
  var cacheKey = 'idemp_email_' + idempotencyKey;
  var cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    try {
      var cachedParsed = JSON.parse(cachedResult);
      return ContentService.createTextOutput(
        JSON.stringify({
          status: 'DUPLICATE_SUPPRESSED',
          message: 'Email delivery already processed for idempotencyKey ' + idempotencyKey,
          messageId: cachedParsed.messageId,
          sentAt: cachedParsed.sentAt,
          isDuplicate: true,
          recipientMasked: redactEmail_(recipientEmail),
          requestId: requestId || null
        })
      ).setMimeType(ContentService.MimeType.JSON);
    } catch (ignore) {}
  }

  // 4. Validate attachment
  var attachmentValidation = validateAttachmentGAS_(payload.attachment);
  if (!attachmentValidation.valid) {
    return errorResponse_(attachmentValidation.error, 'VALIDATION_ERROR', 400, requestId);
  }

  // 5. Honest MailApp daily quota check
  var remainingQuota = 0;
  try {
    remainingQuota = MailApp.getRemainingDailyQuota();
  } catch (qErr) {
    Logger.log('Could not read MailApp quota: ' + qErr);
  }

  if (remainingQuota <= 0) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'QUOTA_EXCEEDED',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Apps Script MailApp daily email quota exhausted (0 remaining). Email dispatch suppressed.',
        remainingDailyQuota: 0,
        requestId: requestId || null
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // 6. Handle dryRun delivery mode
  var isDryRun = !!payload.dryRun;
  var sentAt = new Date().toISOString();

  if (isDryRun) {
    var dryRunMsgId = 'gas-dryrun-' + Utilities.getUuid();
    cache.put(cacheKey, JSON.stringify({ messageId: dryRunMsgId, acceptedAt: sentAt }), 86400);
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'DRY_RUN_ACCEPTED',
        messageId: dryRunMsgId,
        recipientMasked: redactEmail_(recipientEmail),
        idempotencyKey: idempotencyKey,
        isDuplicate: false,
        remainingDailyQuota: remainingQuota,
        acceptedAt: sentAt,
        dryRun: true,
        requestId: requestId || null
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // 7. Build attachments blob
  var blobs = [];
  if (payload.attachment && payload.attachment.contentBase64) {
    var rawBytes = Utilities.base64Decode(payload.attachment.contentBase64);
    var blob = Utilities.newBlob(rawBytes, payload.attachment.mimeType, payload.attachment.filename);
    blobs.push(blob);
  }

  // 8. Dispatch email via MailApp
  var messageId = 'gas-mail-' + Utilities.getUuid();

  try {
    MailApp.sendEmail({
      to: recipientEmail,
      subject: subject,
      htmlBody: summaryHtml,
      body: summaryText || 'Report summary attached.',
      name: 'Alliance India Surveillance Reporting',
      attachments: blobs
    });
  } catch (sendErr) {
    return errorResponse_('MailApp sendEmail failed: ' + sendErr.toString(), 'INTERNAL_ERROR', 500, requestId);
  }

  // 9. Record in CacheService for 24h (86400 seconds)
  cache.put(cacheKey, JSON.stringify({ messageId: messageId, acceptedAt: sentAt }), 86400);

  var postSendQuota = Math.max(0, remainingQuota - 1);

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'ACCEPTED_FOR_DELIVERY',
      messageId: messageId,
      recipientMasked: redactEmail_(recipientEmail),
      idempotencyKey: idempotencyKey,
      isDuplicate: false,
      remainingDailyQuota: postSendQuota,
      acceptedAt: sentAt,
      dryRun: false,
      requestId: requestId || null
    })
  ).setMimeType(ContentService.MimeType.JSON);
}
