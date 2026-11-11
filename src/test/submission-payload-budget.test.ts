import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as handlePostSubmission } from '@/app/api/submissions/route';
import { buildCreateRequest, RequestBuilderError } from '@/lib/sync/requestBuilders';
import { calculateTargetDimensions } from '@/lib/utils/imageCompression';
import type { SyncQueueItem } from '@/types/domain';

describe('Submission Payload Budget & Client-Side Compression Guard (3 MB)', () => {
  describe('1. calculateTargetDimensions', () => {
    it('scales down 4032x3024 smartphone photo to max 1280px on longest side', () => {
      const dimensions = calculateTargetDimensions(4032, 3024, 1280);
      expect(dimensions.width).toBe(1280);
      expect(dimensions.height).toBe(960);
      expect(Math.max(dimensions.width, dimensions.height)).toBeLessThanOrEqual(1280);
    });

    it('scales down tall portrait photo 3000x4000 to max 1280px', () => {
      const dimensions = calculateTargetDimensions(3000, 4000, 1280);
      expect(dimensions.height).toBe(1280);
      expect(dimensions.width).toBe(960);
      expect(Math.max(dimensions.width, dimensions.height)).toBeLessThanOrEqual(1280);
    });

    it('preserves dimensions already smaller than max 1280px', () => {
      const dimensions = calculateTargetDimensions(800, 600, 1280);
      expect(dimensions.width).toBe(800);
      expect(dimensions.height).toBe(600);
    });
  });

  describe('2. buildCreateRequest 3 MB payload budget', () => {
    const validBaseRecord: any = {
      uuid: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      clientSubmissionId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      interviewerName: 'Ramesh Field Worker',
      demographics: {
        artNumber: 'MH-PUN-2026-001',
        childName: 'Aarav Kumar',
        dob: '2015-05-10',
        gender: 'Male',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Sunita Kumar',
        caregiverRelationship: 'Mother',
        state: 'Maharashtra',
        district: 'Pune',
      },
      health: {
        weightKg: 24,
        heightCm: 122,
        haemoglobinGdl: 12.5,
        viralLoad: 0,
        artStatus: 'Active',
      },
      caregiverConsent: {
        consentProvided: true,
        consentVersion: 'v1.0-2026',
        caregiverName: 'Sunita Kumar',
        consentCapturedAt: new Date().toISOString(),
        signatureRequired: true,
        signatureStatus: 'CAPTURED_LOCAL',
        signatureDataUrl: 'data:image/png;base64,mockSignatureBytes',
      },
      finalReview: {
        allInfoCorrect: true,
        organizationName: 'Alliance India',
        formSubmittedBy: 'Ramesh Field Worker',
      },
    };

    it('accepts typical submission within 3 MB payload limit', () => {
      const queueItem: SyncQueueItem = {
        id: 1,
        submissionUuid: validBaseRecord.uuid,
        idempotencyKey: 'idem-1',
        operationType: 'CREATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: validBaseRecord,
      };

      const req = buildCreateRequest(queueItem);
      expect(req.url).toBe('/api/submissions');
      expect(req.method).toBe('POST');
      expect(req.headers['Idempotency-Key']).toBeDefined();
    });

    it('rejects oversized payload exceeding 3 MB with PAYLOAD_TOO_LARGE code', () => {
      // Simulate uncompressed 3.5 MB photo attachment
      const oversizedPhotoData = 'data:image/jpeg;base64,' + 'A'.repeat(3.5 * 1024 * 1024);
      const oversizedRecord = {
        ...validBaseRecord,
        educationExpenses: {
          feeReceiptPhotoUrl: oversizedPhotoData,
        },
      };

      const queueItem: SyncQueueItem = {
        id: 2,
        submissionUuid: oversizedRecord.uuid,
        idempotencyKey: 'idem-2',
        operationType: 'CREATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: oversizedRecord,
      };

      expect(() => buildCreateRequest(queueItem)).toThrowError(RequestBuilderError);
      try {
        buildCreateRequest(queueItem);
      } catch (err: any) {
        expect(err.code).toBe('PAYLOAD_TOO_LARGE');
        expect(err.isTerminal).toBe(false); // allows retry
        expect(err.message).toMatch(/exceeds the 3 MB platform budget/i);
      }
    });
  });

  describe('3. POST /api/submissions Server-Side 3 MB Enforcer', () => {
    it('returns HTTP 413 with PAYLOAD_TOO_LARGE when Content-Length exceeds 3 MB', async () => {
      const oversizedBytes = 3.2 * 1024 * 1024; // 3.2 MB
      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-idemp-oversized',
          'Content-Length': String(oversizedBytes),
        },
        body: JSON.stringify({ dummy: 'payload' }),
      });

      const res = await handlePostSubmission(req);
      expect(res.status).toBe(413);

      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.code).toBe('PAYLOAD_TOO_LARGE');
      expect(json.message).toContain('exceeds the 3 MB platform budget');
      expect(json.limitBytes).toBe(3 * 1024 * 1024);
    });
  });
});
