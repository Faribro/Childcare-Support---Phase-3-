import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  PersistentWebhookHandoffQueue,
} from '@/lib/server/webhookHandoffContract';
import {
  PersistentFileIdempotencyStore,
} from '@/lib/server/reportingEmailDelivery';

describe('Queue Concurrency, Leases, and Recovery Suite (Task 1 & 2)', () => {
  const testQueuePath = path.join(process.cwd(), '.cache', 'test_concurrency_queue.json');
  const testIdempotencyPath = path.join(process.cwd(), '.cache', 'test_email_idempotency.json');
  let queue: PersistentWebhookHandoffQueue;

  beforeEach(async () => {
    // Ensure clean state
    if (fs.existsSync(testQueuePath)) fs.unlinkSync(testQueuePath);
    if (fs.existsSync(testIdempotencyPath)) fs.unlinkSync(testIdempotencyPath);
    queue = new PersistentWebhookHandoffQueue({ filePath: testQueuePath });
    await queue.clear();
  });

  afterEach(async () => {
    if (fs.existsSync(testQueuePath)) fs.unlinkSync(testQueuePath);
    if (fs.existsSync(testIdempotencyPath)) fs.unlinkSync(testIdempotencyPath);
  });

  describe('1. Production Fail-Closed Storage Guards', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('fails closed when PersistentWebhookHandoffQueue is instantiated in production without explicit local flag', () => {
      process.env.NODE_ENV = 'production';
      expect(() => {
        new PersistentWebhookHandoffQueue({ filePath: testQueuePath });
      }).toThrowError(/STORAGE_UNCONFIGURED.*strictly LOCAL_DEVELOPMENT_ONLY/);
    });

    it('allows PersistentWebhookHandoffQueue in production if explicitly configured for local filesystem simulation', () => {
      process.env.NODE_ENV = 'production';
      expect(() => {
        const q = new PersistentWebhookHandoffQueue({
          filePath: testQueuePath,
          allowLocalFilesystemInProduction: true,
        });
        expect(q.storageType).toBe('LOCAL_DEVELOPMENT_ONLY');
      }).not.toThrow();
    });

    it('fails closed when PersistentFileIdempotencyStore is instantiated in production without explicit local flag', () => {
      process.env.NODE_ENV = 'production';
      expect(() => {
        new PersistentFileIdempotencyStore({ filePath: testIdempotencyPath });
      }).toThrowError(/STORAGE_UNCONFIGURED.*strictly LOCAL_DEVELOPMENT_ONLY/);
    });

    it('allows PersistentFileIdempotencyStore in production if explicitly configured for local filesystem simulation', () => {
      process.env.NODE_ENV = 'production';
      expect(() => {
        const s = new PersistentFileIdempotencyStore({
          filePath: testIdempotencyPath,
          allowLocalFilesystemInProduction: true,
        });
        expect(s.storageType).toBe('LOCAL_DEVELOPMENT_ONLY');
      }).not.toThrow();
    });
  });

  describe('2. Concurrent Worker Job Claiming', () => {
    it('guarantees disjoint job assignment between two concurrent workers with zero double-claims', async () => {
      // Enqueue 10 synthetic jobs
      for (let i = 1; i <= 10; i++) {
        await queue.enqueue({
          correlationId: `corr-${i}`,
          mediaId: `media-concurrent-${i}`,
          mimeType: 'image/jpeg',
          uploadToken: `UPLOAD_TOKEN_${i}`,
          sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
          isSynthetic: true,
        });
      }

      expect(await queue.getPendingCount()).toBe(10);

      // Launch 10 concurrent claim requests across two worker IDs
      const workerAClaims: string[] = [];
      const workerBClaims: string[] = [];

      const claimPromises = Array.from({ length: 10 }).map(async (_, idx) => {
        const workerId = idx % 2 === 0 ? 'worker-alpha' : 'worker-beta';
        const job = await queue.claimNext(workerId, 10000);
        if (job) {
          if (workerId === 'worker-alpha') {
            workerAClaims.push(job.mediaId);
          } else {
            workerBClaims.push(job.mediaId);
          }
        }
      });

      await Promise.all(claimPromises);

      // Verify all 10 jobs were claimed
      expect(workerAClaims.length + workerBClaims.length).toBe(10);

      // Verify completely disjoint set (no double claiming)
      const overlap = workerAClaims.filter((id) => workerBClaims.includes(id));
      expect(overlap).toEqual([]);

      // No pending jobs remaining
      expect(await queue.getPendingCount()).toBe(0);
    });
  });

  describe('3. Lease Expiration and Stale Worker Recovery', () => {
    it('allows a second worker to reclaim an abandoned job after lease expiry', async () => {
      await queue.enqueue({
        correlationId: 'corr-lease-test',
        mediaId: 'media-stale-001',
        mimeType: 'application/pdf',
        uploadToken: 'UPLOAD_TOKEN_LEASE',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });

      // Worker 1 claims with very short lease (30ms)
      const jobWorker1 = await queue.claimNext('worker-crashed', 30);
      expect(jobWorker1).not.toBeNull();
      expect(jobWorker1?.mediaId).toBe('media-stale-001');

      // Immediate attempt by worker 2 before lease expiry returns null
      const immediateWorker2 = await queue.claimNext('worker-active', 10000);
      expect(immediateWorker2).toBeNull();

      // Wait 40ms for lease to expire
      await new Promise((r) => setTimeout(r, 45));

      // Worker 2 should now successfully reclaim the expired job
      const recoveredJob = await queue.claimNext('worker-active', 10000);
      expect(recoveredJob).not.toBeNull();
      expect(recoveredJob?.mediaId).toBe('media-stale-001');

      // Worker 2 acknowledges the job
      const ackSuccess = await queue.acknowledge(recoveredJob!.eventId, 'worker-active');
      expect(ackSuccess).toBe(true);

      // Job is processed and removed
      expect(await queue.getPendingCount()).toBe(0);
    });

    it('supports explicit lease renewal by the active worker before expiration', async () => {
      await queue.enqueue({
        correlationId: 'corr-extend',
        mediaId: 'media-extend-001',
        mimeType: 'image/png',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });

      const job = await queue.claimNext('worker-slow', 50);
      expect(job).not.toBeNull();

      // Extend lease by 500ms
      const extended = await queue.extendLease(job!.eventId, 'worker-slow', 500);
      expect(extended).toBe(true);

      // Another worker attempting claim at 60ms is rejected because lease was extended
      await new Promise((r) => setTimeout(r, 60));
      const competitorClaim = await queue.claimNext('worker-competitor', 1000);
      expect(competitorClaim).toBeNull();

      // Unauthorized worker cannot extend someone else's lease
      const unauthorizedExtend = await queue.extendLease(job!.eventId, 'worker-imposter', 500);
      expect(unauthorizedExtend).toBe(false);
    });
  });

  describe('4. Retry Limits & Dead Letter Queueing', () => {
    it('moves a job to DEAD_LETTER after exceeding maxAttempts (at-least-once ceiling)', async () => {
      // Enqueue job with maxAttempts = 2
      await queue.enqueue(
        {
          correlationId: 'corr-retry-limit',
          mediaId: 'media-poison-001',
          mimeType: 'image/jpeg',
          sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
          isSynthetic: true,
        },
        2
      );

      // Attempt 1: Claim and fail
      const attempt1 = await queue.claimNext('worker-1', 10000);
      expect(attempt1).not.toBeNull();
      const fail1 = await queue.failJob(attempt1!.eventId, 'worker-1', 'Simulated corruption on download', true);
      expect(fail1.deadLetter).toBe(false);
      expect(fail1.attempts).toBe(1);

      // Attempt 2: Claim and fail
      const attempt2 = await queue.claimNext('worker-1', 10000);
      expect(attempt2).not.toBeNull();
      const fail2 = await queue.failJob(attempt2!.eventId, 'worker-1', 'Simulated corruption second time', true);
      expect(fail2.deadLetter).toBe(true);
      expect(fail2.attempts).toBe(2);

      // Job is dead-lettered; next claim finds nothing
      const attempt3 = await queue.claimNext('worker-1', 10000);
      expect(attempt3).toBeNull();
      expect(await queue.getPendingCount()).toBe(0);
      expect(await queue.getDeadLetterCount()).toBe(1);
    });
  });

  describe('5. Process Restart Recovery', () => {
    it('restores queue state and pending jobs from disk when recreated', async () => {
      await queue.enqueue({
        correlationId: 'corr-restart',
        mediaId: 'media-restart-001',
        mimeType: 'image/jpeg',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });

      // Simulate process termination and reboot with a fresh queue instance pointing to same file
      const rebootedQueue = new PersistentWebhookHandoffQueue({ filePath: testQueuePath });
      expect(await rebootedQueue.getPendingCount()).toBe(1);

      const claimed = await rebootedQueue.claimNext('worker-after-reboot', 10000);
      expect(claimed).not.toBeNull();
      expect(claimed?.mediaId).toBe('media-restart-001');

      await rebootedQueue.acknowledge(claimed!.eventId, 'worker-after-reboot');
      expect(await rebootedQueue.getPendingCount()).toBe(0);
    });
  });
});
