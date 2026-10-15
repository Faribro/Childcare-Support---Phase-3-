import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {
  validateOrganizationalRecipient,
  validateReportAttachment,
  generateReportArtifact,
  maskEmailAddress,
  deliverReportingEmail,
  executeAuthorizedReportingQuery,
  MockReportingEmailTransport,
  MAX_ATTACHMENT_BYTES,
} from '@/lib/server/reportingEmailDelivery';
import type {
  ReportingEmailDeliveryRequest,
  ReportingQueryRequest,
  SourceFreshness,
} from '@/lib/server/reportingEmailContract';

describe('Reporting Email & Data Integration Suite', () => {
  let mockTransport: MockReportingEmailTransport;

  beforeEach(() => {
    mockTransport = new MockReportingEmailTransport();
  });

  describe('1. Organizational Recipient Allowlist & Domain Validation', () => {
    it('approves registered organizational recipient on @allianceindia.org', () => {
      const result = validateOrganizationalRecipient('reporting-lead@allianceindia.org');
      expect(result.valid).toBe(true);
      expect(result.recipient?.fullName).toBe('Programme Director');
      expect(result.recipient?.role).toBe('LEADERSHIP');
    });

    it('rejects consumer and external email domains fail-closed', () => {
      const forbiddenEmails = [
        'user@gmail.com',
        'director@yahoo.co.in',
        'auditor@hotmail.com',
        'external@random-corp.com',
      ];
      for (const email of forbiddenEmails) {
        const result = validateOrganizationalRecipient(email);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('is not an authorized organizational domain');
      }
    });

    it('rejects unregistered email even if on organizational domain', () => {
      const result = validateOrganizationalRecipient('unknown-stranger@allianceindia.org');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is not registered in the organizational recipient directory');
    });

    it('enforces geographic scope boundary on state lead recipients', () => {
      // Maharashtra state lead trying to send to MP state lead
      const mhScope = { permittedStates: ['Maharashtra'] };
      const result = validateOrganizationalRecipient('statelead-mp@allianceindia.org', mhScope);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Geographic authorization violation');
    });

    it('allows national leadership to send to state lead recipients', () => {
      const nationalScope = { permittedStates: ['*'] };
      const result = validateOrganizationalRecipient('statelead-mh@allianceindia.org', nationalScope);
      expect(result.valid).toBe(true);
    });

    it('masks recipient email addresses safely for logs and UI status', () => {
      expect(maskEmailAddress('reporting-lead@allianceindia.org')).toBe('r***d@allianceindia.org');
      expect(maskEmailAddress('a@b.com')).toBe('a*@b.com');
      expect(maskEmailAddress('')).toBe('***@***');
    });
  });

  describe('2. Attachment Validation & Integrity Verification', () => {
    it('approves valid CSV report attachment within size limit', () => {
      const csvContent = 'uniqueId,childName,orphanStatus,schoolType\nCH-01,Aarav,SINGLE_ORPHAN,GOVERNMENT_SCHOOL\n';
      const base64 = Buffer.from(csvContent).toString('base64');
      const sha256 = crypto.createHash('sha256').update(csvContent).digest('hex');

      const result = validateReportAttachment({
        filename: 'June_Orphan_Government_School_Cohort_2026.csv',
        mimeType: 'text/csv',
        contentBase64: base64,
        byteSize: Buffer.byteLength(csvContent),
        sha256,
      });

      expect(result.valid).toBe(true);
      expect(result.decodedBuffer).toBeDefined();
    });

    it('approves valid PDF report dossier attachment', () => {
      const dummyPdf = '%PDF-1.4\n%synthetic-pdf-stream\n%%EOF';
      const base64 = Buffer.from(dummyPdf).toString('base64');

      const result = validateReportAttachment({
        filename: 'National_Surveillance_Dossier_2026.pdf',
        mimeType: 'application/pdf',
        contentBase64: base64,
        byteSize: Buffer.byteLength(dummyPdf),
      });

      expect(result.valid).toBe(true);
    });

    it('rejects filename containing path traversal characters', () => {
      const content = 'a,b,c';
      const result = validateReportAttachment({
        filename: '../../etc/passwd.csv',
        mimeType: 'text/csv',
        contentBase64: Buffer.from(content).toString('base64'),
        byteSize: content.length,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsafe attachment filename');
    });

    it('rejects unsupported MIME types (e.g. spoofed extension or invalid MIME)', () => {
      const content = 'binary';
      const result = validateReportAttachment({
        filename: 'report.csv',
        mimeType: 'image/png' as any,
        contentBase64: Buffer.from(content).toString('base64'),
        byteSize: content.length,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported attachment MIME type');
    });

    it('rejects attachment exceeding 10MB limit', () => {
      const result = validateReportAttachment({
        filename: 'huge_export.csv',
        mimeType: 'text/csv',
        contentBase64: 'abc',
        byteSize: MAX_ATTACHMENT_BYTES + 1,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum permitted size');
    });

    it('rejects attachment when SHA-256 hash does not match content', () => {
      const content = 'actual_content';
      const badHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const result = validateReportAttachment({
        filename: 'tampered.csv',
        mimeType: 'text/csv',
        contentBase64: Buffer.from(content).toString('base64'),
        byteSize: content.length,
        sha256: badHash,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('SHA-256 checksum mismatch');
    });
  });

  describe('3. Report Artifact Handoff & Provenance Headers', () => {
    const dummyFreshness: SourceFreshness = {
      lastSyncedAt: '2026-10-15T18:00:00.000Z',
      sourceVersion: 'synthetic-bridge-v1.3.0',
      recordCount: 2,
      isSynthetic: true,
      upstreamOrigin: 'LOCAL_SYNTHETIC_FIXTURES',
    };

    const dummyRecords = [
      {
        uniqueId: 'CH-MH-01',
        state: 'Maharashtra',
        district: 'Pune',
        visitDate: '2026-06-12',
        submissionDate: '2026-06-12',
        age: 8,
        gender: 'M',
        orphanStatus: 'SINGLE_ORPHAN',
        schoolType: 'GOVERNMENT_SCHOOL',
        verificationStatus: 'APPROVED',
        maskedAadhaar: 'XXXX-XXXX-9012',
        maskedBankAccount: 'XXXX-XXXX-1098',
        maskedCaregiverPhone: '******3210',
        isSynthetic: true,
      },
    ];

    it('generates immutable report artifact with provenance headers and SHA-256 integrity', () => {
      const artifact = generateReportArtifact({
        title: 'June 2026 Single-Orphan Govt School Cohort',
        reportType: 'June_2026_Report.csv',
        records: dummyRecords,
        freshness: dummyFreshness,
        recordsExcludedMissingOrphanStatus: 1,
        recordsExcludedMissingSchool: 2,
      });

      expect(artifact.artifactId).toMatch(/^art-/);
      expect(artifact.mimeType).toBe('text/csv');
      expect(artifact.byteSize).toBeGreaterThan(0);
      expect(artifact.sha256).toHaveLength(64);

      // Verify provenance headers
      expect(artifact.contentPreviewText).toContain('# Report Title: June 2026 Single-Orphan Govt School Cohort');
      expect(artifact.contentPreviewText).toContain('# Source Origin: LOCAL_SYNTHETIC_FIXTURES');
      expect(artifact.contentPreviewText).toContain('# Evaluation Mode: SYNTHETIC_DATASET');
      expect(artifact.contentPreviewText).toContain('# Records Excluded Missing Orphan: 1');
      expect(artifact.contentPreviewText).toContain('# Records Excluded Missing School: 2');

      // Verify completeness metrics
      expect(artifact.completeness.totalMatched).toBe(1);
      expect(artifact.completeness.isComplete).toBe(false);
    });
  });

  describe('4. Duplicate-Send Protection & Honest Delivery Status', () => {
    it('executes dry-run delivery and returns DRY_RUN_ACCEPTED without live dispatch', async () => {
      const request: ReportingEmailDeliveryRequest = {
        idempotencyKey: `idemp-dryrun-${Date.now()}`,
        senderSecurityContext: {
          userId: 'user-leader-1',
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
        recipientEmail: 'reporting-lead@allianceindia.org',
        recipientName: 'Programme Director',
        reportType: 'JUNE_ORPHAN_GOV_SCHOOL_SURVEILLANCE',
        subject: 'June 2026 Surveillance Report: Single-Orphan in Govt Schools',
        summaryHtml: '<p>National Cohort: 42 Beneficiaries</p>',
        summaryText: 'National Cohort: 42 Beneficiaries',
        dryRun: true,
      };

      const result = await deliverReportingEmail(request, mockTransport);

      expect(result.status).toBe('DRY_RUN_ACCEPTED');
      expect(result.dryRun).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.messageId).toMatch(/^dryrun-msg-/);
      expect(mockTransport.sentMessages.length).toBe(0); // Assert zero external transport call
    });

    it('returns ACCEPTED_FOR_DELIVERY (not DELIVERED_TO_INBOX) when approved live transport is invoked', async () => {
      const request: ReportingEmailDeliveryRequest = {
        idempotencyKey: `idemp-live-${Date.now()}`,
        senderSecurityContext: {
          userId: 'user-leader-1',
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
        recipientEmail: 'reporting-lead@allianceindia.org',
        recipientName: 'Programme Director',
        reportType: 'JUNE_ORPHAN_GOV_SCHOOL_SURVEILLANCE',
        subject: 'June 2026 Surveillance Report',
        summaryHtml: '<p>Summary</p>',
        summaryText: 'Summary',
        dryRun: false, // Explicit live request
      };

      const result = await deliverReportingEmail(request, mockTransport);

      expect(result.status).toBe('ACCEPTED_FOR_DELIVERY');
      expect(result.dryRun).toBe(false);
      expect(result.status).not.toBe('DELIVERED_TO_INBOX'); // Invariant check: never claim inbox receipt
      expect(result.remainingDailyQuota).toBe(99);
      expect(mockTransport.sentMessages.length).toBe(1);
    });

    it('suppresses duplicate delivery with identical idempotencyKey', async () => {
      const sharedKey = `idemp-dup-key-${Date.now()}`;
      const request: ReportingEmailDeliveryRequest = {
        idempotencyKey: sharedKey,
        senderSecurityContext: {
          userId: 'user-leader-1',
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
        recipientEmail: 'reporting-lead@allianceindia.org',
        recipientName: 'Programme Director',
        reportType: 'JUNE_ORPHAN_GOV_SCHOOL_SURVEILLANCE',
        subject: 'June 2026 Surveillance Report',
        summaryHtml: '<p>Summary</p>',
        summaryText: 'Summary',
        dryRun: true,
      };

      // First dispatch
      const res1 = await deliverReportingEmail(request, mockTransport);
      expect(res1.status).toBe('DRY_RUN_ACCEPTED');

      // Immediate retry with identical key (network retry or re-click in WhatsApp UI)
      const res2 = await deliverReportingEmail(request, mockTransport);
      expect(res2.status).toBe('DUPLICATE_SUPPRESSED');
      expect(res2.isDuplicate).toBe(true);
      expect(res2.messageId).toBe(res1.messageId);
      expect(res2.acceptedAt).toBe(res1.acceptedAt);
    });

    it('reports QUOTA_EXCEEDED honestly when transport daily quota is 0', async () => {
      mockTransport.quotaRemaining = 0;

      const request: ReportingEmailDeliveryRequest = {
        idempotencyKey: `idemp-quota-${Date.now()}`,
        senderSecurityContext: {
          userId: 'user-leader-1',
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
        recipientEmail: 'reporting-lead@allianceindia.org',
        recipientName: 'Programme Director',
        reportType: 'NATIONAL_KPI_SUMMARY',
        subject: 'National KPI Summary',
        summaryHtml: '<p>KPIs</p>',
        summaryText: 'KPIs',
        dryRun: false,
      };

      const result = await deliverReportingEmail(request, mockTransport);
      expect(result.status).toBe('QUOTA_EXCEEDED');
      expect(result.remainingDailyQuota).toBe(0);
      expect(result.errorDetails).toContain('quota exhausted');
      expect(mockTransport.sentMessages.length).toBe(0);
    });

    it('rejects unauthorized recipient and records honest error status', async () => {
      const request: ReportingEmailDeliveryRequest = {
        idempotencyKey: `idemp-unauth-${Date.now()}`,
        senderSecurityContext: {
          userId: 'user-leader-1',
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
        recipientEmail: 'unauthorized-target@gmail.com',
        recipientName: 'External Leak Target',
        reportType: 'NATIONAL_KPI_SUMMARY',
        subject: 'Confidential Report',
        summaryHtml: '<p>Data</p>',
        summaryText: 'Data',
      };

      const result = await deliverReportingEmail(request, mockTransport);
      expect(result.status).toBe('REJECTED_UNAUTHORIZED_RECIPIENT');
      expect(result.errorDetails).toContain('is not an authorized organizational domain');
      expect(mockTransport.sentMessages.length).toBe(0);
    });
  });

  describe('5. Authorized Read-Only Reporting Data Adapter & Honesty Invariants', () => {
    const syntheticLinelistRows = [
      {
        uniqueId: 'CH-MH-01',
        state: 'Maharashtra',
        district: 'Pune',
        visitDate: '2026-06-12',
        submissionDate: '2026-06-12',
        age: 8,
        gender: 'M',
        orphanStatus: 'SINGLE_ORPHAN',
        schoolType: 'GOVERNMENT_SCHOOL',
        verificationStatus: 'APPROVED',
        childAadhaarNumber: '123456789012',
        bankAccountNumber: '987654321098',
        caregiverContact: '9876543210',
      },
      {
        uniqueId: 'CH-MP-02',
        state: 'Madhya Pradesh',
        district: 'Indore',
        visitDate: '2026-06-15',
        submissionDate: '2026-06-15',
        age: 10,
        gender: 'F',
        orphanStatus: 'SINGLE_ORPHAN',
        schoolType: 'GOVERNMENT_SCHOOL',
        verificationStatus: 'APPROVED',
        childAadhaarNumber: '555566667777',
        bankAccountNumber: '111122223333',
        caregiverContact: '9123456780',
      },
      {
        uniqueId: 'CH-MH-03',
        state: 'Maharashtra',
        district: 'Mumbai',
        visitDate: '2026-05-20', // May visit (should be excluded from June range)
        submissionDate: '2026-06-02',
        age: 7,
        gender: 'F',
        orphanStatus: 'DOUBLE_ORPHAN', // Double orphan (should be excluded from single orphan filter)
        schoolType: 'GOVERNMENT_SCHOOL',
        verificationStatus: 'APPROVED',
      },
    ];

    it('returns filtered and PII-masked records with honest synthetic provenance', () => {
      const queryReq: ReportingQueryRequest = {
        securityContext: {
          userId: 'national-lead',
          role: 'LEADERSHIP',
          permittedStates: ['*'],
        },
        filters: {
          dateBasis: 'VISIT_DATE',
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          orphanStatus: 'SINGLE_ORPHAN',
          schoolType: 'GOVERNMENT_SCHOOL',
        },
      };

      const res = executeAuthorizedReportingQuery(syntheticLinelistRows, queryReq, {
        upstreamOrigin: 'LOCAL_SYNTHETIC_FIXTURES',
        isSynthetic: true,
        lastSyncedAt: '2026-10-15T18:00:00.000Z',
      });

      expect(res.status).toBe('success');
      expect(res.records.length).toBe(2);
      expect(res.records[0].uniqueId).toBe('CH-MH-01');
      expect(res.records[1].uniqueId).toBe('CH-MP-02');

      // Assert DPDP PII masking
      expect(res.records[0].maskedAadhaar).toBe('XXXX-XXXX-9012');
      expect(res.records[0].maskedBankAccount).toBe('XXXX-XXXX-1098');
      expect(res.records[0].maskedCaregiverPhone).toBe('******3210');

      // Assert honest provenance
      expect(res.freshness.isSynthetic).toBe(true);
      expect(res.freshness.upstreamOrigin).toBe('LOCAL_SYNTHETIC_FIXTURES');
    });

    it('strictly confines state lead queries to permitted state boundaries', () => {
      const mhLeadQuery: ReportingQueryRequest = {
        securityContext: {
          userId: 'lead-mh',
          role: 'STATE_LEAD',
          permittedStates: ['Maharashtra'],
        },
        filters: {
          state: 'Maharashtra',
          dateBasis: 'VISIT_DATE',
        },
      };

      const res = executeAuthorizedReportingQuery(syntheticLinelistRows, mhLeadQuery, {
        upstreamOrigin: 'LOCAL_SYNTHETIC_FIXTURES',
        isSynthetic: true,
      });

      expect(res.status).toBe('success');
      expect(res.records.every((r) => r.state === 'Maharashtra')).toBe(true);
    });

    it('rejects state lead queries targeting other states with FORBIDDEN_SCOPE', () => {
      const mhLeadUnauthorizedQuery: ReportingQueryRequest = {
        securityContext: {
          userId: 'lead-mh',
          role: 'STATE_LEAD',
          permittedStates: ['Maharashtra'],
        },
        filters: {
          state: 'Madhya Pradesh',
          dateBasis: 'VISIT_DATE',
        },
      };

      const res = executeAuthorizedReportingQuery(syntheticLinelistRows, mhLeadUnauthorizedQuery, {
        upstreamOrigin: 'LOCAL_SYNTHETIC_FIXTURES',
        isSynthetic: true,
      });

      expect(res.status).toBe('error');
      expect(res.code).toBe('FORBIDDEN_SCOPE');
      expect(res.records.length).toBe(0);
    });
  });

  describe('6. Apps Script VM Simulation (ReportingEmailService.js)', () => {
    const gasReportingServicePath = path.join(process.cwd(), 'gas', 'ReportingEmailService.js');
    const gasReportingCode = fs.readFileSync(gasReportingServicePath, 'utf8');

    let sandbox: any;
    let mockMailAppSent: any[];
    let mockCacheData: Record<string, string>;
    let mockDailyQuota: number;

    beforeEach(() => {
      mockMailAppSent = [];
      mockCacheData = {};
      mockDailyQuota = 50;

      sandbox = {
        Logger: { log: vi.fn() },
        Utilities: {
          getUuid: () => `uuid-${Math.random().toString(36).substring(2, 9)}`,
          base64Decode: (b64: string) => Buffer.from(b64, 'base64'),
          newBlob: (bytes: Buffer, mime: string, name: string) => ({
            getBytes: () => bytes,
            getContentType: () => mime,
            getName: () => name,
          }),
        },
        MailApp: {
          getRemainingDailyQuota: () => mockDailyQuota,
          sendEmail: (params: any) => {
            mockMailAppSent.push(params);
            mockDailyQuota = Math.max(0, mockDailyQuota - 1);
          },
        },
        CacheService: {
          getScriptCache: () => ({
            get: (key: string) => mockCacheData[key] || null,
            put: (key: string, val: string) => {
              mockCacheData[key] = val;
            },
          }),
        },
        ContentService: {
          createTextOutput: (jsonStr: string) => ({
            setMimeType: () => ({
              getContent: () => jsonStr,
            }),
          }),
          MimeType: { JSON: 'application/json' },
        },
        redactEmail_: (e: string) => maskEmailAddress(e),
        errorResponse_: (msg: string, code: string, status: number, reqId?: string) => ({
          getContent: () => JSON.stringify({ status: 'error', code, statusCode: status, message: msg, requestId: reqId }),
        }),
      };

      vm.createContext(sandbox);
      vm.runInContext(gasReportingCode, sandbox);
    });

    it('handles dryRun mode in Apps Script and returns DRY_RUN_ACCEPTED without sending email', () => {
      const payload = {
        idempotencyKey: 'gas-dryrun-key-001',
        recipientEmail: 'reporting-lead@allianceindia.org',
        reportType: 'JUNE_ORPHAN_GOV_SCHOOL_SURVEILLANCE',
        subject: 'June 2026 Orphan Cohort Report',
        summaryHtml: '<h3>Cohort: 100</h3>',
        summaryText: 'Cohort: 100',
        dryRun: true,
      };

      const result = sandbox.handleReportEmailDelivery_(payload, 'req-001');
      const parsed = JSON.parse(result.getContent());

      expect(parsed.status).toBe('DRY_RUN_ACCEPTED');
      expect(parsed.dryRun).toBe(true);
      expect(parsed.messageId).toContain('gas-dryrun-');
      expect(mockMailAppSent.length).toBe(0); // Zero MailApp calls
    });

    it('dispatches live email in Apps Script and returns ACCEPTED_FOR_DELIVERY', () => {
      const csvData = 'id,name\n1,Test';
      const base64 = Buffer.from(csvData).toString('base64');

      const payload = {
        idempotencyKey: 'gas-live-key-002',
        recipientEmail: 'reporting-lead@allianceindia.org',
        reportType: 'JUNE_ORPHAN_GOV_SCHOOL_SURVEILLANCE',
        subject: 'June 2026 Orphan Cohort Report',
        summaryHtml: '<h3>Cohort: 100</h3>',
        summaryText: 'Cohort: 100',
        dryRun: false,
        attachment: {
          filename: 'report.csv',
          mimeType: 'text/csv',
          byteSize: csvData.length,
          contentBase64: base64,
        },
      };

      const result = sandbox.handleReportEmailDelivery_(payload, 'req-002');
      const parsed = JSON.parse(result.getContent());

      expect(parsed.status).toBe('ACCEPTED_FOR_DELIVERY');
      expect(parsed.isDuplicate).toBe(false);
      expect(parsed.messageId).toContain('gas-mail-');
      expect(mockMailAppSent.length).toBe(1);
      expect(mockMailAppSent[0].to).toBe('reporting-lead@allianceindia.org');
      expect(mockMailAppSent[0].attachments.length).toBe(1);
    });

    it('suppresses duplicate send in Apps Script via CacheService', () => {
      const payload = {
        idempotencyKey: 'gas-test-key-dup',
        recipientEmail: 'reporting-lead@allianceindia.org',
        subject: 'Report',
        summaryHtml: '<p>Report</p>',
        dryRun: true,
      };

      // First run
      const res1 = sandbox.handleReportEmailDelivery_(payload, 'req-dup-1');
      const parsed1 = JSON.parse(res1.getContent());
      expect(parsed1.status).toBe('DRY_RUN_ACCEPTED');

      // Second run with same idempotency key
      const res2 = sandbox.handleReportEmailDelivery_(payload, 'req-dup-2');
      const parsed2 = JSON.parse(res2.getContent());
      expect(parsed2.status).toBe('DUPLICATE_SUPPRESSED');
      expect(parsed2.isDuplicate).toBe(true);
      expect(parsed2.messageId).toBe(parsed1.messageId);
    });

    it('rejects external/consumer email domain in Apps Script fail-closed', () => {
      const payload = {
        idempotencyKey: 'gas-test-key-gmail',
        recipientEmail: 'leaker@gmail.com',
        subject: 'Report',
        summaryHtml: '<p>Report</p>',
      };

      const res = sandbox.handleReportEmailDelivery_(payload, 'req-gmail');
      const parsed = JSON.parse(res.getContent());
      expect(parsed.status).toBe('error');
      expect(parsed.code).toBe('UNAUTHORIZED');
      expect(parsed.statusCode).toBe(403);
      expect(mockMailAppSent.length).toBe(0);
    });

    it('reports QUOTA_EXCEEDED when Apps Script MailApp quota is zero', () => {
      mockDailyQuota = 0; // Simulate quota limit reached
      const payload = {
        idempotencyKey: 'gas-test-key-quota',
        recipientEmail: 'reporting-lead@allianceindia.org',
        subject: 'Report',
        summaryHtml: '<p>Report</p>',
        dryRun: false,
      };

      const res = sandbox.handleReportEmailDelivery_(payload, 'req-quota');
      const parsed = JSON.parse(res.getContent());
      expect(parsed.status).toBe('QUOTA_EXCEEDED');
      expect(parsed.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(parsed.remainingDailyQuota).toBe(0);
      expect(mockMailAppSent.length).toBe(0);
    });
  });
});
