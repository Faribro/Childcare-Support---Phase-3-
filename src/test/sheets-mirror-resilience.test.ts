import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FirestoreSubmissionAdapter } from '@/lib/server/firestoreSubmissionAdapter';
import { CloudLogger } from '@/lib/server/cloudLogger';

describe('Reliability Review: Sheets Mirror Resilience & Structured Cloud Logging', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Sheets Mirror Resilience with 60 Concurrent Submissions', () => {
    it('handles 60 concurrent submissions during Apps Script failure without losing records, enqueuing retries', async () => {
      // Setup failing gateway
      const mockGateway = {
        callGateway: vi.fn().mockRejectedValue(new Error('Apps Script 504 Gateway Timeout')),
      };

      const adapter = new FirestoreSubmissionAdapter({
        projectId: 'cs-p3-production',
        databaseId: 'staging',
        gatewayClient: mockGateway,
      });

      // Prepare 60 concurrent submission payloads
      const submissions = Array.from({ length: 60 }, (_, i) => ({
        clientSubmissionId: `sub-concurrency-${i + 1}`,
        idempotencyKey: `idem-key-${i + 1}`,
        payload: {
          clientSubmissionId: `sub-concurrency-${i + 1}`,
          interviewerName: `Worker ${i + 1}`,
          submissionTime: new Date().toISOString(),
          state: 'Maharashtra',
          district: 'Pune',
          demographics: {
            childName: `Child ${i + 1}`,
            state: 'Maharashtra',
            district: 'Pune',
          },
        } as any,
      }));

      // Execute 60 submissions concurrently
      const results = await Promise.all(
        submissions.map((sub) => adapter.createSubmission(sub))
      );

      // Verify all 60 succeeded in primary store (resilience against secondary failure)
      expect(results.length).toBe(60);
      for (const res of results) {
        expect(res.status).toBe('success');
        expect(res.statusCode).toBe(200);
      }

      // Verify all 60 records are durable in mock submissions store
      for (let i = 1; i <= 60; i++) {
        const found = await adapter.getSubmission(`sub-concurrency-${i}`, 'SUPERVISOR');
        expect(found).not.toBeNull();
        expect(found.mirrorStatus).toBe('PENDING_SHEET_SYNC');
        expect(found.status).toBe('SUBMITTED');
      }

      // Now simulate Apps Script recovery
      mockGateway.callGateway.mockResolvedValue({
        status: 'success',
        statusCode: 200,
        resolvedRow: 100,
      });

      // Drain retry queue with future timestamp so pending backoff is satisfied
      const futureTime = new Date(Date.now() + 3600000).toISOString();
      const drainSummary = await adapter.drainSheetsMirrorRetryQueue(100, futureTime);
      expect(drainSummary.processed).toBe(60);
      expect(drainSummary.succeeded).toBe(60);
      expect(drainSummary.failed).toBe(0);

      // Verify records are now updated to SYNCED
      for (let i = 1; i <= 60; i++) {
        const found = await adapter.getSubmission(`sub-concurrency-${i}`, 'SUPERVISOR');
        expect(found.mirrorStatus).toBe('SYNCED');
        expect(found.sheetRowNumber).toBe(100);
      }
    });

    it('transitions repeatedly failing jobs to DEAD_LETTER status after 5 failed attempts', async () => {
      const mockGateway = {
        callGateway: vi.fn().mockRejectedValue(new Error('Permanent Sheets schema rejection')),
      };

      const adapter = new FirestoreSubmissionAdapter({
        projectId: 'cs-p3-production',
        databaseId: 'staging',
        gatewayClient: mockGateway,
      });

      await adapter.createSubmission({
        clientSubmissionId: 'sub-dead-letter-test',
        idempotencyKey: 'idem-dead-letter',
        payload: {
          clientSubmissionId: 'sub-dead-letter-test',
          interviewerName: 'Worker DL',
          submissionTime: new Date().toISOString(),
          state: 'Maharashtra',
          district: 'Pune',
        } as any,
      });

      // Drain 5 times with future timestamps to exhaust retries
      for (let attempt = 0; attempt < 5; attempt++) {
        const futureTime = new Date(Date.now() + (attempt + 1) * 3600000).toISOString();
        await adapter.drainSheetsMirrorRetryQueue(10, futureTime);
      }

      const retryDoc = (adapter as any).mockRetryQueue.get('sub-dead-letter-test');
      expect(retryDoc).toBeDefined();
      expect(retryDoc.status).toBe('DEAD_LETTER');
      expect(retryDoc.retryCount).toBeGreaterThanOrEqual(5);
    });

    it('enforces client offline submission idempotency using clientSubmissionId', async () => {
      const mockGateway = {
        callGateway: vi.fn().mockResolvedValue({ status: 'success', statusCode: 200, resolvedRow: 42 }),
      };

      const adapter = new FirestoreSubmissionAdapter({
        projectId: 'cs-p3-production',
        databaseId: 'staging',
        gatewayClient: mockGateway,
      });

      const firstCall = await adapter.createSubmission({
        clientSubmissionId: 'sub-idempotent-unique-01',
        idempotencyKey: 'idem-first',
        payload: {
          clientSubmissionId: 'sub-idempotent-unique-01',
          interviewerName: 'Worker Alpha',
          submissionTime: new Date().toISOString(),
          state: 'Maharashtra',
          district: 'Pune',
          demographics: { childName: 'Original Child Record' },
        } as any,
      });

      expect(firstCall.status).toBe('success');
      expect(firstCall.acknowledged).toBe(true);

      // Re-submit identical clientSubmissionId (offline client replay)
      const secondCall = await adapter.createSubmission({
        clientSubmissionId: 'sub-idempotent-unique-01',
        idempotencyKey: 'idem-second',
        payload: {
          clientSubmissionId: 'sub-idempotent-unique-01',
          interviewerName: 'Worker Alpha',
          submissionTime: new Date().toISOString(),
          state: 'Maharashtra',
          district: 'Pune',
          demographics: { childName: 'Modified Child Name (should be rejected/ignored)' },
        } as any,
      });

      // Must acknowledge cleanly without duplicate row creation
      expect(secondCall.status).toBe('success');
      expect(secondCall.acknowledged).toBe(true);

      // Record retains original identity
      const record = await adapter.getSubmission('sub-idempotent-unique-01', 'SUPERVISOR');
      expect(record.childName || record.demographics?.childName).toBe('Original Child Record');
    });
  });

  describe('2. Structured Cloud Logging (CloudLogger)', () => {
    it('emits structured JSON with GCP Cloud Logging severity and sanitized context', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // 1. Auth failure
      const entry1 = CloudLogger.authFailure('Invalid credentials provided', {
        username: 'state-mh',
        password: 'rawPasswordPlainText123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI...',
      });

      expect(entry1.severity).toBe('WARNING');
      expect(entry1.eventType).toBe('AUTH_FAILURE');
      expect(entry1.context?.password).toBe('[REDACTED]');
      expect(entry1.context?.token).toBe('[REDACTED]');
      expect(entry1.context?.username).toBe('state-mh');
      expect(warnSpy).toHaveBeenCalled();

      // 2. Lockout
      const entry2 = CloudLogger.lockout('Account locked due to 5 failed attempts', {
        credentialId: 'state-mh',
        ip: '192.168.1.1',
        aadhaarNumber: '123456789012',
      });
      expect(entry2.severity).toBe('WARNING');
      expect(entry2.eventType).toBe('LOCKOUT');
      expect(entry2.context?.aadhaarNumber).toBe('[REDACTED]');

      // 3. Mirror failure
      const entry3 = CloudLogger.mirrorFailure('Apps Script sync timeout after 3 retries', {
        submissionId: 'sub-1234',
        error: 'ETIMEDOUT',
      });
      expect(entry3.severity).toBe('ERROR');
      expect(entry3.eventType).toBe('MIRROR_FAILURE');
      expect(errorSpy).toHaveBeenCalled();

      // 4. Signed URL issued
      const entry4 = CloudLogger.signedUrlIssued('V4 signed upload URL issued', {
        submissionId: 'sub-1234',
        docType: 'child_photo',
        bucket: 'cs-p3-childcare-staging',
      });
      expect(entry4.severity).toBe('INFO');
      expect(entry4.eventType).toBe('SIGNED_URL_ISSUED');
      expect(infoSpy).toHaveBeenCalled();
    });
  });
});
