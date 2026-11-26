import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as reconcileSnapshotRoute } from '@/app/api/workers/reconcile-snapshot/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { FirestoreSubmissionAdapter } from '@/lib/server/firestoreSubmissionAdapter';
import { computeSubmissionRowHash } from '@/lib/server/submissionRowHash';

describe('GET /api/workers/reconcile-snapshot Suite', () => {
  const savedFlag = process.env.RECONCILIATION_SNAPSHOT_ENABLED;
  const savedReconcileSecret = process.env.SHEET_RECONCILE_SECRET;
  const savedWebhookSecret = process.env.WEBHOOK_SECRET;
  const savedDataEngine = process.env.DATA_ENGINE;

  const validReconcileSecret = 'reconcile_dedicated_secret_32_chars_min_alpha_99';
  let fsAdapter: FirestoreSubmissionAdapter;

  beforeEach(async () => {
    process.env.DATA_ENGINE = 'firestore';
    process.env.RECONCILIATION_SNAPSHOT_ENABLED = 'true';
    process.env.SHEET_RECONCILE_SECRET = validReconcileSecret;
    process.env.WEBHOOK_SECRET = 'webhook_secret_must_never_unlock_reconcile_32_chars';

    fsAdapter = new FirestoreSubmissionAdapter({
      appEnv: 'development',
      databaseId: '(default)',
    });
    canonicalSubmissionAdapter.setFirestoreAdapter(fsAdapter);

    // Seed out of lexicographical order to verify strict ID-sorted keyset pagination
    for (const entry of [
      { id: 'rec-c-003', childName: 'C Child', state: 'Maharashtra', district: 'Pune' },
      { id: 'rec-a-001', childName: 'A Child', state: 'Delhi', district: 'South Delhi' },
      { id: 'rec-b-002', childName: 'B Child', state: 'West Bengal', district: 'Kolkata' },
    ]) {
      await fsAdapter.createSubmission({
        payload: {
          clientSubmissionId: entry.id,
          uniqueId: entry.id,
          demographics: {
            childName: entry.childName,
            state: entry.state,
            district: entry.district,
            contactNumber: '9876543210',
          },
          state: entry.state,
          district: entry.district,
        } as any,
        idempotencyKey: `idem-${entry.id}`,
        requestId: `req-${entry.id}`,
      });
    }

    // Soft-delete rec-b-002 so snapshot captures active + tombstone records
    await fsAdapter.deleteSubmission('rec-b-002', {
      actorId: 'lead@allianceindia.org',
      actorName: 'Lead Admin',
      actorRole: 'LEADERSHIP',
      reason: 'Confirmed duplicate entry',
    });
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.RECONCILIATION_SNAPSHOT_ENABLED;
    else process.env.RECONCILIATION_SNAPSHOT_ENABLED = savedFlag;
    if (savedReconcileSecret === undefined) delete process.env.SHEET_RECONCILE_SECRET;
    else process.env.SHEET_RECONCILE_SECRET = savedReconcileSecret;
    if (savedWebhookSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = savedWebhookSecret;
    if (savedDataEngine === undefined) delete process.env.DATA_ENGINE;
    else process.env.DATA_ENGINE = savedDataEngine;
  });

  it('fails closed with 503 FEATURE_DISABLED when RECONCILIATION_SNAPSHOT_ENABLED is unset or false', async () => {
    delete process.env.RECONCILIATION_SNAPSHOT_ENABLED;
    const res1 = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot', {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(res1.status).toBe(503);
    expect((await res1.json()).code).toBe('FEATURE_DISABLED');

    process.env.RECONCILIATION_SNAPSHOT_ENABLED = 'false';
    const res2 = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot', {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(res2.status).toBe(503);
    expect((await res2.json()).code).toBe('FEATURE_DISABLED');
  });

  it('requires dedicated SHEET_RECONCILE_SECRET and rejects WEBHOOK_SECRET or invalid tokens', async () => {
    delete process.env.SHEET_RECONCILE_SECRET;
    const noConfigRes = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot', {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(noConfigRes.status).toBe(503);
    expect((await noConfigRes.json()).code).toBe('RECONCILE_SECRET_NOT_CONFIGURED');

    process.env.SHEET_RECONCILE_SECRET = validReconcileSecret;

    const missingRes = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot')
    );
    expect(missingRes.status).toBe(401);

    // Must never reuse WEBHOOK_SECRET
    const webhookRes = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot', {
        headers: { 'X-Reconcile-Secret': process.env.WEBHOOK_SECRET! },
      })
    );
    expect(webhookRes.status).toBe(401);
  });

  it('paginates keyset snapshots strictly in sorted ID order, omits PII, and includes tombstones', async () => {
    const page1Res = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?limit=2', {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(page1Res.status).toBe(200);
    const page1 = await page1Res.json();
    expect(page1.items.map((x: any) => x.id)).toEqual(['rec-a-001', 'rec-b-002']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextAfterId).toBe('rec-b-002');

    // Assert tombstone fields preserved & PII omitted
    const tombstone = page1.items[1];
    expect(tombstone.isDeleted).toBe(true);
    expect(tombstone.deletedBy).toBe('lead@allianceindia.org');
    expect(tombstone.deleteReason).toBe('Confirmed duplicate entry');
    expect(tombstone.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tombstone.rowVersion).toBeGreaterThanOrEqual(2);
    expect(tombstone.childName).toBeUndefined();
    expect(tombstone.contactNumber).toBeUndefined();
    expect(tombstone.payload).toBeUndefined();

    const page2Res = await reconcileSnapshotRoute(
      new NextRequest(`http://localhost:3000/api/workers/reconcile-snapshot?limit=2&afterId=${encodeURIComponent(page1.nextAfterId)}`, {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(page2Res.status).toBe(200);
    const page2 = await page2Res.json();
    expect(page2.items.map((x: any) => x.id)).toEqual(['rec-c-003']);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextAfterId).toBeNull();
  });

  it('computes lazy fallback rowHash for pre-migration Firestore docs lacking rowHash', async () => {
    const legacyDoc = {
      id: 'rec-d-legacy',
      uniqueId: 'rec-d-legacy',
      clientSubmissionId: 'rec-d-legacy',
      version: 3,
      revisionNumber: 3,
      state: 'Assam',
      payload: {
        demographics: {
          childName: 'Legacy Assam Child',
          state: 'Assam',
          district: 'Kamrup',
        },
      },
    };
    const mockDb = {
      collection: () => ({
        get: async () => ({
          docs: [{ id: 'rec-d-legacy', data: () => legacyDoc }],
        }),
      }),
    };
    const legacyAdapter = new FirestoreSubmissionAdapter({
      appEnv: 'development',
      databaseId: '(default)',
      mockDb,
    });
    canonicalSubmissionAdapter.setFirestoreAdapter(legacyAdapter);

    const res = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot', {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].rowVersion).toBe(3);
    expect(body.items[0].rowHash).toBe(computeSubmissionRowHash(legacyDoc));
  });

  it('supports on-demand mode=record for missing/mismatched Sheet repair and returns 404 for unknown ID', async () => {
    const okRes = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?mode=record&submissionId=rec-c-003', {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.record.id).toBe('rec-c-003');
    expect(okJson.record.payload.demographics.childName).toBe('C Child');
    expect(okJson.record.doc.childName).toBe('C Child');
    expect(okJson.record.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const missingIdRes = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?mode=record', {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(missingIdRes.status).toBe(400);

    const notFoundRes = await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?mode=record&submissionId=does-not-exist', {
        headers: { 'X-Reconcile-Secret': validReconcileSecret },
      })
    );
    expect(notFoundRes.status).toBe(404);
  });
});
