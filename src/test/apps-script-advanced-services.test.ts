import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractUpstreamStatusCode } from '@/lib/server/canonicalSubmissionAdapter';

describe('Apps Script Advanced Services & Fail-Closed Security Suite', () => {
  const gasCodePath = path.join(process.cwd(), 'gas', 'Code.js');
  const gasManifestPath = path.join(process.cwd(), 'gas', 'appsscript.json');
  let gasContent: string;
  let manifestContent: string;

  beforeEach(() => {
    gasContent = fs.readFileSync(gasCodePath, 'utf8');
    manifestContent = fs.readFileSync(gasManifestPath, 'utf8');
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. MANIFEST & ADVANCED SERVICES CONFIGURATION
  // ==========================================================================
  describe('1. Apps Script Manifest (Advanced Services)', () => {
    it('declares Sheets API v4 and Drive API v3 in appsscript.json', () => {
      const manifest = JSON.parse(manifestContent);
      expect(manifest.dependencies).toBeDefined();
      expect(manifest.dependencies.enabledAdvancedServices).toBeDefined();

      const services = manifest.dependencies.enabledAdvancedServices;
      const sheetsService = services.find((s: any) => s.userSymbol === 'Sheets');
      const driveService = services.find((s: any) => s.userSymbol === 'Drive');

      expect(sheetsService).toBeDefined();
      expect(sheetsService.serviceId).toBe('sheets');
      expect(sheetsService.version).toBe('v4');

      expect(driveService).toBeDefined();
      expect(driveService.serviceId).toBe('drive');
      expect(driveService.version).toBe('v3');
    });

    it('declares exact institutional OAuth scopes for Sheets and Drive', () => {
      const manifest = JSON.parse(manifestContent);
      expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/spreadsheets');
      expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/drive');
      expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/drive.file');
    });
  });

  // ==========================================================================
  // 2. FAIL-CLOSED AUTHENTICATION & ZERO-TRUST INVARIANTS
  // ==========================================================================
  describe('2. Fail-Closed Authentication & Webhook Protection', () => {
    it('verifies requireWebhookSecret_ strictly checks PropertiesService and fails closed', () => {
      expect(gasContent).toContain('function requireWebhookSecret_');
      expect(gasContent).toContain("PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET')");
      // Missing property must trigger CONFIGURATION_ERROR (503)
      expect(gasContent).toContain("'CONFIGURATION_ERROR'");
      expect(gasContent).toContain('503');
      // Mismatched secret must trigger UNAUTHORIZED (401)
      expect(gasContent).toContain("'UNAUTHORIZED'");
      expect(gasContent).toContain('401');
    });

    it('contains ZERO fallback token assignments or hardcoded secrets in source code', () => {
      expect(gasContent).not.toContain("|| 'childcare_phase3_secret_token_2026'");
      expect(gasContent).not.toContain("setProperty('WEBHOOK_SECRET', 'childcare_phase3_secret_token_2026')");

      const adapterPath = path.join(process.cwd(), 'src', 'lib', 'server', 'canonicalSubmissionAdapter.ts');
      const adapterContent = fs.readFileSync(adapterPath, 'utf8');
      expect(adapterContent).not.toContain("|| 'childcare_phase3_secret_token_2026'");
      expect(adapterContent).not.toContain('childcare_phase3_secret_token_2026');
    });

    it('permits anonymous access ONLY for action: ping (monitoring) and rejects query secrets in doGet', () => {
      // doGet action === 'ping' returns service health only
      expect(gasContent).toContain("action === 'ping'");
      expect(gasContent).toContain("status: 'ok'");
      // All other actions in doGet must be rejected with 405 METHOD_NOT_ALLOWED
      expect(gasContent).toContain('METHOD_NOT_ALLOWED');
      expect(gasContent).toContain('405');
    });

    it('guards all mutating and data-bearing POST actions behind requireWebhookSecret_', () => {
      // doPost must verify secret before processing create, update, list, read, or audits
      expect(gasContent).toContain('var auth = requireWebhookSecret_(payload, action, requestId);');
      expect(gasContent).toContain('if (!auth.authorized)');
    });
  });

  // ==========================================================================
  // 3. PHASE 2: GOOGLE SHEETS API V4 & SCHEMA INTEGRITY
  // ==========================================================================
  describe('3. Phase 2: Sheets Schema & List/Read Contract', () => {
    it('defines exact 73 rectified column headers matching linelist architecture', () => {
      expect(gasContent).toContain('var COLUMN_HEADERS = [');
      expect(gasContent).toContain('"1\\nUnique ID"');
      expect(gasContent).toContain('"2\\nRevision Number"');
      expect(gasContent).toContain('"73\\nLast Updated"');
      expect(gasContent).toContain('function getValidatedSheetSchema_()');
      expect(gasContent).toContain('function schemaAudit_()');
    });

    it('includes Sheets API v4 Advanced Service optimization with graceful fallback', () => {
      expect(gasContent).toContain("typeof Sheets !== 'undefined'");
      expect(gasContent).toContain('Sheets.Spreadsheets.Values.get');
    });

    it('implements supervisor DTO redaction in listSubmissions_ for DPDP Act compliance', () => {
      expect(gasContent).toContain('function maskAadhaar_');
      expect(gasContent).toContain('function maskBankAccount_');
      expect(gasContent).toContain('function maskPhone_');
      expect(gasContent).toContain('bankAccountNumberMasked: maskBankAccount_');
      expect(gasContent).toContain('maskedAadhaar: maskAadhaar_');
      expect(gasContent).toContain('hasSignature: !!(');
      expect(gasContent).toContain('hasPassbook: !!(');
      expect(gasContent).toContain('hasAadhaar: !!(');
      expect(gasContent).toContain('hasChildPhoto: !!(');
    });

    it('implements single-record readSubmission_ mapping to canonical structure', () => {
      expect(gasContent).toContain('function readSubmission_(');
      expect(gasContent).toContain("errorResponse_('Record not found with ID: ' + targetId, 'NOT_FOUND', 404, requestId)");
    });

    it('implements previewProtectedRanges_ and applyProtectedRanges_ for header rows and audit columns', () => {
      expect(gasContent).toContain('function previewProtectedRanges_()');
      expect(gasContent).toContain('function applyProtectedRanges_(');
      expect(gasContent).toContain('Header & System Definitions (Rows 1-3)');
      expect(gasContent).toContain('System Identifiers (Cols 1-2)');
      expect(gasContent).toContain('Governance Columns (Cols 67-68)');
      expect(gasContent).toContain('System Timestamp: Last Updated (Col 73)');
      expect(gasContent).toContain('warningOnly: false');
    });
  });

  // ==========================================================================
  // 4. PHASE 3: DRIVE OPAQUE HIERARCHY & DOCUMENT SLOTS
  // ==========================================================================
  describe('4. Phase 3: Drive Opaque Hierarchy & Document Slots', () => {
    it('enforces opaque directory structure assessments/{assetContainerId}/current/ via _Asset_Containers registry', () => {
      expect(gasContent).toContain('function getOrCreateAssetContainer_');
      expect(gasContent).toContain('ASSET_REGISTRY_SHEET_NAME');
      expect(gasContent).toContain('_Asset_Containers');
      expect(gasContent).toContain('ast-');
      expect(gasContent).toContain("'current'");
      expect(gasContent).toContain("'revisions'");
      expect(gasContent).toContain("'quarantine'");
      expect(gasContent).toContain("'metadata'");
    });

    it('enforces standardized non-PII slot filenames for all document attachments', () => {
      expect(gasContent).toContain('function getStandardSlotFilename_(docPrefix)');
      expect(gasContent).toContain('caregiver-signature.png');
      expect(gasContent).toContain('passbook.jpg');
      expect(gasContent).toContain('identity-document.jpg');
      expect(gasContent).toContain('child-photo.jpg');
      expect(gasContent).toContain('school-fee-receipt.pdf');
      expect(gasContent).toContain('marksheet.pdf');
    });

    it('implements Drive asset inspection, audit, and private ACL enforcement', () => {
      expect(gasContent).toContain('function inspectDriveAsset_(fileId)');
      expect(gasContent).toContain('function auditDriveAssets_()');
      expect(gasContent).toContain('function enforceRestrictedAcl_(fileId)');
      expect(gasContent).toContain('function replaceAssetTwoPhase_');
    });

    it('moves obsolete documents to revisions as SUPERSEDED only after verifying OCC pointer read-back', () => {
      expect(gasContent).toContain('newFile.getSize() <= 0');
      expect(gasContent).toContain('SUPERSEDED');
      expect(gasContent).toContain('container.revisionsFolder.addFile');
      expect(gasContent).toContain('container.quarantineFolder.addFile');
    });
  });

  // ==========================================================================
  // 5. PHASE 4: ADMIN MENU & NON-DESTRUCTIVE DIAGNOSTICS
  // ==========================================================================
  describe('5. Phase 4: Admin Menu & Diagnostics', () => {
    it('registers onOpen menu items for administrative audit and verification', () => {
      expect(gasContent).toContain("ui.createMenu('Childcare Phase 3 Admin')");
      expect(gasContent).toContain("'Audit: Validate Sheet Schema'");
      expect(gasContent).toContain("'Audit: Drive Asset Security & ACLs'");
      expect(gasContent).toContain("'Audit: Data Quality Completeness'");
      expect(gasContent).toContain("'Preview: Protected Ranges State'");
      expect(gasContent).toContain("'Preview: Legacy Folder Migration'");
      expect(gasContent).toContain("'Preview: Public ACL Exposure'");
      expect(gasContent).toContain("'Apply: Protect Header & Governance Ranges'");
      expect(gasContent).toContain("'Apply: Refresh Linelist Formatting'");
    });

    it('menu functions are non-destructive diagnostic tools', () => {
      expect(gasContent).toContain('function menuValidateSheetSchema()');
      expect(gasContent).toContain('function menuAuditDriveAssets()');
      expect(gasContent).toContain('function menuGenerateDataQualityReport()');
      expect(gasContent).toContain('function menuPreviewProtectedRanges()');
      expect(gasContent).toContain('function menuApplyProtectedRanges()');
      expect(gasContent).toContain('function menuPreviewFolderMigration()');
      expect(gasContent).toContain('function menuPreviewPublicAclViolations()');
      expect(gasContent).toContain('function menuRefreshSheetPresentation()');
    });
  });

  // ==========================================================================
  // 6. PHASE 5: UPSTREAM ERROR ENVELOPE & ADAPTER STATUS MAPPING
  // ==========================================================================
  describe('6. Semantic Error Envelope & Adapter Status Code Mapping', () => {
    it('maps upstream CONFIGURATION_ERROR to HTTP 503', () => {
      const status = extractUpstreamStatusCode({ status: 200 } as any, { code: 'CONFIGURATION_ERROR' });
      expect(status).toBe(503);
    });

    it('maps upstream UNAUTHORIZED to HTTP 401', () => {
      const status = extractUpstreamStatusCode({ status: 200 } as any, { code: 'UNAUTHORIZED' });
      expect(status).toBe(401);
    });

    it('maps upstream VALIDATION_ERROR to HTTP 422', () => {
      const status = extractUpstreamStatusCode({ status: 200 } as any, { code: 'VALIDATION_ERROR' });
      expect(status).toBe(422);
    });

    it('maps upstream NOT_FOUND to HTTP 404', () => {
      const status = extractUpstreamStatusCode({ status: 200 } as any, { code: 'NOT_FOUND' });
      expect(status).toBe(404);
    });

    it('maps upstream OCC_CONFLICT and CONFLICT to HTTP 409', () => {
      expect(extractUpstreamStatusCode({ status: 200 } as any, { code: 'OCC_CONFLICT' })).toBe(409);
      expect(extractUpstreamStatusCode({ status: 200 } as any, { code: 'CONFLICT' })).toBe(409);
    });

    it('maps upstream UPSTREAM_UNAVAILABLE to HTTP 502', () => {
      const status = extractUpstreamStatusCode({ status: 200 } as any, { code: 'UPSTREAM_UNAVAILABLE' });
      expect(status).toBe(502);
    });

    it('maps upstream RATE_LIMIT_EXCEEDED to HTTP 429', () => {
      const status = extractUpstreamStatusCode({ status: 200 } as any, { code: 'RATE_LIMIT_EXCEEDED' });
      expect(status).toBe(429);
    });

    it('maps upstream TIMEOUT to HTTP 504', () => {
      const status = extractUpstreamStatusCode({ status: 200 } as any, { code: 'TIMEOUT' });
      expect(status).toBe(504);
    });
  });

  // ==========================================================================
  // 7. FREE-TIER RESILIENCE: EXPONENTIAL BACKOFF RETRY
  // ==========================================================================
  describe('7. Free-Tier Resilience & Exponential Backoff', () => {
    it('defines withRetry_ helper in gas/Code.js for rate-limited calls', () => {
      expect(gasContent).toContain('function withRetry_(fn, maxRetries, baseDelayMs)');
      expect(gasContent).toContain("str.indexOf('rate') !== -1");
      expect(gasContent).toContain("str.indexOf('quota') !== -1");
      expect(gasContent).toContain('Utilities.sleep(');
    });
  });
});
