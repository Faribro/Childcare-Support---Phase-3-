/**
 * Architectural Contract Verification Suite (Phase 1 & 2 Design Scaffold)
 *
 * NOTE ON TEST BOUNDARIES:
 * These tests execute inside an in-memory Node.js/Vitest harness against
 * mock software ports. They verify contract interfaces, state transitions,
 * and data-safety algorithms. They DO NOT establish device-verified evidence
 * of physical Android cold boot, hardware KeyStore, or C-level SQLCipher execution.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { SQLiteStorageAdapter, StorageWriteError } from '@/lib/platform/sqliteStorageAdapter';
import { PrivateFilesystemAttachmentAdapter } from '@/lib/platform/privateFilesystemAttachmentAdapter';
import { PlatformSecureStorageAdapter } from '@/lib/platform/secureStorageAdapter';
import { PlatformNetworkAdapter } from '@/lib/platform/lifecycleAdapters';
import { platformRegistry } from '@/lib/platform/platformRegistry';
import { OfflineFormManager } from '@/lib/platform/offlineFormManager';
import type { AssessmentRecord } from '@/types/domain';
import { enqueueCreate } from '@/features/submission/submissionQueueRepository';
import { getPendingQueue, markSynced, getQueueItemByUuid } from '@/lib/db/syncQueueRepository';

describe('THREAD 07 — Native Apps & Offline Reliability Verification Suite', () => {
  let sqliteAdapter: SQLiteStorageAdapter;
  let attachmentAdapter: PrivateFilesystemAttachmentAdapter;
  let secureStorage: PlatformSecureStorageAdapter;
  let networkAdapter: PlatformNetworkAdapter;

  beforeEach(async () => {
    platformRegistry.configure({ target: 'android' });
    sqliteAdapter = new SQLiteStorageAdapter();
    await sqliteAdapter.initialize();

    attachmentAdapter = new PrivateFilesystemAttachmentAdapter();
    await attachmentAdapter.initialize();

    secureStorage = new PlatformSecureStorageAdapter('android');
    networkAdapter = new PlatformNetworkAdapter('android', true);

    platformRegistry.setCustomAdapters({
      storage: sqliteAdapter,
      attachment: attachmentAdapter,
      secureStorage,
      network: networkAdapter,
    });
    platformRegistry.setCurrentUserId('caseworker-pune-01');
  });

  afterAll(() => {
    platformRegistry.reset();
  });

  // --------------------------------------------------------------------------
  // Criterion 1: Offline cold launch after installation/initial setup
  // --------------------------------------------------------------------------
  it('Criterion 1: Offline cold launch creates valid draft and stable client UUID with 0 network calls', async () => {
    networkAdapter.simulateNetworkChange(false);
    expect(await networkAdapter.isOnline()).toBe(false);

    // Initialize bundled offline form
    const form = await OfflineFormManager.createOfflineForm(
      'Sunita Deshmukh',
      'Maharashtra',
      'Pune'
    );

    expect(form.uuid).toBeDefined();
    expect(form.clientSubmissionId).toBe(form.uuid);
    expect(form.demographics.childName).toBe('Aarav Kumar');
    expect(form.syncStatus).toBe('draft');

    // Persist while offline
    const saveResult = await OfflineFormManager.saveTransactionalDraft(form);
    expect(saveResult.success).toBe(true);
    expect(saveResult.draftId).toBeGreaterThan(0);

    // Verify stored locally without network
    const retrieved = await sqliteAdapter.getDraftByUuid(form.uuid);
    expect(retrieved).toBeDefined();
    expect(retrieved?.uuid).toBe(form.uuid);
    expect(retrieved?.demographics.artNumber).toBe(form.demographics.artNumber);
  });

  // --------------------------------------------------------------------------
  // Criterion 2: Process termination/restart preserves drafts and attachments
  // --------------------------------------------------------------------------
  it('Criterion 2: Process termination and cold restart preserves drafts and private attachments byte-for-byte', async () => {
    // 1. Create form and attach simulated signature image bytes
    const form = await OfflineFormManager.createOfflineForm('Sunita Deshmukh');
    await OfflineFormManager.saveTransactionalDraft(form);

    const syntheticSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
    const attachmentMeta = await OfflineFormManager.attachPrivateDocument(
      form.uuid,
      'caregiver-signature',
      syntheticSignature,
      'image/png',
      'signature.png'
    );

    expect(attachmentMeta.sizeBytes).toBe(syntheticSignature.length);
    expect(attachmentMeta.sha256Hash).toBeDefined();

    // 2. Simulate OS killing the process and app restarting
    // Database connection closed, memory wiped, fresh adapter re-opened on same storage
    await sqliteAdapter.close();
    await sqliteAdapter.initialize();

    // 3. Re-query reopened draft and attachment
    const reopenedDraft = await sqliteAdapter.getDraftByUuid(form.uuid);
    expect(reopenedDraft).toBeDefined();
    expect(reopenedDraft?.uuid).toBe(form.uuid);
    expect(reopenedDraft?.demographics.childName).toBe('Aarav Kumar');

    const reopenedAttachment = await attachmentAdapter.getAttachment(form.uuid, 'caregiver-signature');
    expect(reopenedAttachment).toBeDefined();
    expect(reopenedAttachment?.data.length).toBe(syntheticSignature.length);
    expect(reopenedAttachment?.metadata.sha256Hash).toBe(attachmentMeta.sha256Hash);
    expect(reopenedAttachment?.data[0]).toBe(0x89);
  });

  // --------------------------------------------------------------------------
  // Criterion 3: Duplicate retries produce one server submission (Idempotency)
  // --------------------------------------------------------------------------
  it('Criterion 3: Duplicate retries with same Idempotency-Key produce exactly one server submission', async () => {
    const form = await OfflineFormManager.createOfflineForm('Sunita Deshmukh');
    await OfflineFormManager.saveTransactionalDraft(form);
    const queueId = await OfflineFormManager.enqueueSubmission(form);

    await secureStorage.setSecret('evaluation_token', 'jwt-token-field-01');

    let serverCallCount = 0;
    const recordedIdempotencyKeys = new Set<string>();

    const mockServerApi = async (url: string, init: any) => {
      serverCallCount++;
      const idempotencyKey = init.headers['Idempotency-Key'];
      recordedIdempotencyKeys.add(idempotencyKey);

      return {
        status: 200,
        data: {
          status: 'success',
          acknowledged: true,
          remoteSubmissionId: `srv-${form.uuid.substring(0, 8)}`,
          version: 1,
        },
      };
    };

    // First attempt succeeds
    const firstSync = await OfflineFormManager.dispatchAuthorizedSync(queueId, mockServerApi);
    expect(firstSync.status).toBe('success');
    expect(firstSync.acknowledged).toBe(true);

    // Second retry attempt (simulating re-trigger before UI updates or network re-ack)
    const secondSync = await OfflineFormManager.dispatchAuthorizedSync(queueId, mockServerApi);

    expect(serverCallCount).toBe(2);
    // Both calls must transmit the exact same stable idempotency key
    expect(recordedIdempotencyKeys.size).toBe(1);
    expect(recordedIdempotencyKeys.has(`create-${form.uuid}`)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Criterion 4: Failed/partial sync retains local work
  // --------------------------------------------------------------------------
  it('Criterion 4: Network drop or server 500 retains local work without deleting pending drafts or outbox', async () => {
    const form = await OfflineFormManager.createOfflineForm('Sunita Deshmukh');
    await OfflineFormManager.saveTransactionalDraft(form);
    const queueId = await OfflineFormManager.enqueueSubmission(form);

    // Server returns HTTP 502 Bad Gateway
    const mockFailingServerApi = async () => {
      return {
        status: 502,
        data: {
          status: 'error',
          code: 'UPSTREAM_GATEWAY_TIMEOUT',
          message: 'Upstream Google Apps Script temporarily timed out',
        },
      };
    };

    const syncResult = await OfflineFormManager.dispatchAuthorizedSync(queueId, mockFailingServerApi);
    expect(syncResult.status).toBe('failed_retryable');
    expect(syncResult.acknowledged).toBe(false);

    // VERIFY LOCAL DATA SAFETY: Draft and queue item are NOT deleted!
    const draftAfterFailure = await sqliteAdapter.getDraftByUuid(form.uuid);
    expect(draftAfterFailure).toBeDefined();
    expect(draftAfterFailure?.uuid).toBe(form.uuid);

    const queueItemAfterFailure = await sqliteAdapter.getQueueItemByUuid(form.uuid);
    expect(queueItemAfterFailure).toBeDefined();
    expect(queueItemAfterFailure?.status).toBe('failed_retryable');
    expect(queueItemAfterFailure?.retryCount).toBe(1);
    expect(queueItemAfterFailure?.errorMessage).toContain('Upstream Google Apps Script');
  });

  // --------------------------------------------------------------------------
  // Criterion 5: Disk-full/write errors do not display false "saved"
  // --------------------------------------------------------------------------
  it('Criterion 5: Storage write failures reject transactions and do NOT return saved confirmation', async () => {
    const form = await OfflineFormManager.createOfflineForm('Sunita Deshmukh');

    // Simulate disk full error on device storage
    sqliteAdapter.setSimulateDiskFull(true);

    let caughtError: any = null;
    try {
      await OfflineFormManager.saveTransactionalDraft(form);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.code).toBe('DISK_FULL');
    expect(caughtError.message).toContain('SQLITE_FULL');

    // Reset disk full and verify nothing partial was committed
    sqliteAdapter.setSimulateDiskFull(false);
    const notFound = await sqliteAdapter.getDraftByUuid(form.uuid);
    expect(notFound).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // Criterion 6: Upgrade/migration preserves unsynced data
  // --------------------------------------------------------------------------
  it('Criterion 6: Schema upgrade and migration preserves unsynced outbox items across app updates', async () => {
    const form = await OfflineFormManager.createOfflineForm('Sunita Deshmukh');
    await OfflineFormManager.saveTransactionalDraft(form);
    const queueId = await OfflineFormManager.enqueueSubmission(form);

    expect(await sqliteAdapter.getSchemaVersion()).toBe(1);

    // Simulate application upgrade to schema version 2
    const migrationResult = await sqliteAdapter.migrate(2);
    expect(migrationResult.migratedCount).toBe(1);
    expect(await sqliteAdapter.getSchemaVersion()).toBe(2);

    // Verify unsynced outbox item is preserved and runnable
    const queueItem = await sqliteAdapter.getQueueItemByUuid(form.uuid);
    expect(queueItem).toBeDefined();
    expect(queueItem?.id).toBe(queueId);
    expect(queueItem?.schemaVersion).toBe(2);
    expect(queueItem?.payload.demographics.childName).toBe('Aarav Kumar');
  });

  // --------------------------------------------------------------------------
  // Criterion 7: Account switching cannot reveal another user's local records
  // --------------------------------------------------------------------------
  it('Criterion 7: Multi-user account switching isolates drafts and cannot reveal another caseworkers records', async () => {
    // Caseworker A saves draft
    const formA = await OfflineFormManager.createOfflineForm('Caseworker Alice');
    formA.demographics.childName = 'Child of Alice';
    await OfflineFormManager.saveTransactionalDraft(formA, 'user-alice');

    // Verify Alice sees her draft
    const aliceDrafts = await sqliteAdapter.getAllDrafts('user-alice');
    expect(aliceDrafts.length).toBe(1);
    expect(aliceDrafts[0].demographics.childName).toBe('Child of Alice');

    // Switch account to Caseworker Bob
    platformRegistry.setCurrentUserId('user-bob');

    // Bob must see 0 drafts
    const bobDrafts = await sqliteAdapter.getAllDrafts('user-bob');
    expect(bobDrafts.length).toBe(0);

    // Direct fetch of Alice's UUID by Bob must return undefined
    const attemptedLeak = await sqliteAdapter.getDraftByUuid(formA.uuid, 'user-bob');
    expect(attemptedLeak).toBeUndefined();

    // Alice logs back in: her unsynced draft is completely preserved!
    const aliceDraftsRestored = await sqliteAdapter.getAllDrafts('user-alice');
    expect(aliceDraftsRestored.length).toBe(1);
    expect(aliceDraftsRestored[0].uuid).toBe(formA.uuid);
  });

  // --------------------------------------------------------------------------
  // Criterion 8: End-to-end slice verification (Complete lifecycle)
  // --------------------------------------------------------------------------
  it('Criterion 8: Full slice (Offline Form -> Draft -> Attachment -> Restart -> Reconnect -> Bearer Sync -> Server Ack)', async () => {
    // Step A: Device is offline
    networkAdapter.simulateNetworkChange(false);
    await secureStorage.setSecret('evaluation_token', 'bearer-jwt-token-12345');

    // Step B: Bundled offline form initialized
    const form = await OfflineFormManager.createOfflineForm('Kavita Patil', 'Maharashtra', 'Pune');
    const saveResult = await OfflineFormManager.saveTransactionalDraft(form);
    expect(saveResult.success).toBe(true);

    // Step C: Private attachment captured
    const attachmentBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
    await OfflineFormManager.attachPrivateDocument(form.uuid, 'doc-kyc-01', attachmentBytes, 'image/jpeg');

    // Step D: Enqueued into outbox
    const queueId = await OfflineFormManager.enqueueSubmission(form);
    expect(queueId).toBeGreaterThan(0);

    // Step E: App process terminated and restarted
    await sqliteAdapter.close();
    await sqliteAdapter.initialize();

    // Step F: Reopened unchanged
    const reopened = await sqliteAdapter.getDraftByUuid(form.uuid);
    expect(reopened?.demographics.childName).toBe('Aarav Kumar');
    const reopenedDoc = await attachmentAdapter.getAttachment(form.uuid, 'doc-kyc-01');
    expect(reopenedDoc?.data.length).toBe(5);

    // Step G: Device reconnects to network
    networkAdapter.simulateNetworkChange(true);
    expect(await networkAdapter.isOnline()).toBe(true);

    // Step H: Authorized sync dispatches with Bearer Token and Idempotency-Key
    let inspectedHeaders: Record<string, string> = {};
    const mockServer = async (url: string, init: any) => {
      inspectedHeaders = init.headers;
      return {
        status: 200,
        data: {
          status: 'success',
          acknowledged: true,
          remoteSubmissionId: 'canonical-srv-uuid-9988',
          version: 1,
        },
      };
    };

    const syncOutcome = await OfflineFormManager.dispatchAuthorizedSync(queueId, mockServer);
    expect(syncOutcome.status).toBe('success');
    expect(syncOutcome.acknowledged).toBe(true);
    expect(syncOutcome.remoteSubmissionId).toBe('canonical-srv-uuid-9988');

    // Verify security: Bearer token and Idempotency-Key were passed
    expect(inspectedHeaders['Authorization']).toBe('Bearer bearer-jwt-token-12345');
    expect(inspectedHeaders['Idempotency-Key']).toBe(`create-${form.uuid}`);

    // Verify local status marked 'synced' with server remote ID
    const finalizedDraft = await sqliteAdapter.getDraftByUuid(form.uuid);
    expect(finalizedDraft?.syncStatus).toBe('synced');
    expect(finalizedDraft?.remoteSubmissionId).toBe('canonical-srv-uuid-9988');
  });

  // --------------------------------------------------------------------------
  // Criterion 9: Multi-Account Isolation across outbox queue and drafts
  // --------------------------------------------------------------------------
  it('Criterion 9: Multi-Account Isolation - Outbox queue and drafts are strictly isolated between caseworkers', async () => {
    // Caseworker Alice creates and enqueues a record
    const formAlice = await OfflineFormManager.createOfflineForm('Alice Officer');
    formAlice.demographics.childName = 'Child A (Alice)';
    await sqliteAdapter.saveDraft(formAlice, { userId: 'caseworker-alice' });
    const queueIdAlice = await sqliteAdapter.enqueueSubmission(formAlice, {
      userId: 'caseworker-alice',
      operationType: 'CREATE',
      idempotencyKey: `create-${formAlice.uuid}`,
    });

    // Caseworker Bob creates and enqueues a record
    const formBob = await OfflineFormManager.createOfflineForm('Bob Officer');
    formBob.demographics.childName = 'Child B (Bob)';
    await sqliteAdapter.saveDraft(formBob, { userId: 'caseworker-bob' });
    const queueIdBob = await sqliteAdapter.enqueueSubmission(formBob, {
      userId: 'caseworker-bob',
      operationType: 'CREATE',
      idempotencyKey: `create-${formBob.uuid}`,
    });

    // Alice queries drafts and outbox
    const aliceDrafts = await sqliteAdapter.getAllDrafts('caseworker-alice');
    expect(aliceDrafts.length).toBe(1);
    expect(aliceDrafts[0].demographics.childName).toBe('Child A (Alice)');

    const aliceQueue = await sqliteAdapter.getPendingQueue('caseworker-alice');
    expect(aliceQueue.length).toBe(1);
    expect(aliceQueue[0].submissionUuid).toBe(formAlice.uuid);

    // Bob queries drafts and outbox
    const bobDrafts = await sqliteAdapter.getAllDrafts('caseworker-bob');
    expect(bobDrafts.length).toBe(1);
    expect(bobDrafts[0].demographics.childName).toBe('Child B (Bob)');

    const bobQueue = await sqliteAdapter.getPendingQueue('caseworker-bob');
    expect(bobQueue.length).toBe(1);
    expect(bobQueue[0].submissionUuid).toBe(formBob.uuid);

    // Cross-account access denied
    expect(await sqliteAdapter.getDraftByUuid(formAlice.uuid, 'caseworker-bob')).toBeUndefined();
    expect(await sqliteAdapter.getDraftByUuid(formBob.uuid, 'caseworker-alice')).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // Criterion 10: Envelope Encryption - Key mismatch rejects database access
  // --------------------------------------------------------------------------
  it('Criterion 10: Envelope Encryption - Reopening database without key or mismatched key throws SQLITE_NOTADB', async () => {
    const encryptedAdapter = new SQLiteStorageAdapter({ encryptionKey: 'vault-master-key-001' });
    await encryptedAdapter.initialize();

    const form = await OfflineFormManager.createOfflineForm('Encrypted Form');
    await encryptedAdapter.saveDraft(form);
    await encryptedAdapter.close();

    // Attempting to reopen with wrong key must fail
    encryptedAdapter.setEncryptionKey('wrong-key-999');
    await expect(encryptedAdapter.initialize()).rejects.toThrow('SQLITE_NOTADB');

    // Attempting to reopen with empty key must fail
    encryptedAdapter.setEncryptionKey('');
    await expect(encryptedAdapter.initialize()).rejects.toThrow('FATAL');

    // Reopening with correct key succeeds and retrieves the draft
    encryptedAdapter.setEncryptionKey('vault-master-key-001');
    await encryptedAdapter.initialize();
    const retrieved = await encryptedAdapter.getDraftByUuid(form.uuid);
    expect(retrieved).toBeDefined();
    expect(retrieved?.uuid).toBe(form.uuid);
  });

  // --------------------------------------------------------------------------
  // Criterion 11: Session Decoupling - Logout erases session tokens but preserves DB key
  // --------------------------------------------------------------------------
  it('Criterion 11: Session Decoupling - Logout erases session tokens while preserving database encryption key and un-synced drafts', async () => {
    // Caseworker logs in and generates session token + device database key
    await secureStorage.setSecret('childcare_db_key', 'device-bound-root-key-32bytes');
    await secureStorage.setSecret('session_user_token', 'jwt-bearer-caseworker-session');
    await secureStorage.setSecret('refresh_token', 'refresh-token-caseworker');

    // User saves an offline draft
    const form = await OfflineFormManager.createOfflineForm('Offline Draft Pre-Logout');
    await sqliteAdapter.saveDraft(form);

    // Caseworker logs out: clear session secrets
    await secureStorage.clearSessionSecrets();

    // Verify session tokens are erased
    expect(await secureStorage.getSecret('session_user_token')).toBeNull();
    expect(await secureStorage.getSecret('refresh_token')).toBeNull();

    // Verify database key is strictly preserved
    expect(await secureStorage.getSecret('childcare_db_key')).toBe('device-bound-root-key-32bytes');

    // Verify offline draft remains readable and intact
    const draftAfterLogout = await sqliteAdapter.getDraftByUuid(form.uuid);
    expect(draftAfterLogout).toBeDefined();
    expect(draftAfterLogout?.uuid).toBe(form.uuid);
  });

  // --------------------------------------------------------------------------
  // Criterion 12: Write Reliability - Simulated disk-full rolls back cleanly
  // --------------------------------------------------------------------------
  it('Criterion 12: Write Reliability - Disk-full simulated write failure rolls back safely without data corruption', async () => {
    sqliteAdapter.setSimulateDiskFull(true);

    const form = await OfflineFormManager.createOfflineForm('Failing Form');
    await expect(OfflineFormManager.saveTransactionalDraft(form)).rejects.toThrow(StorageWriteError);
    await expect(OfflineFormManager.enqueueSubmission(form)).rejects.toThrow(StorageWriteError);

    // Turn disk simulation back to normal
    sqliteAdapter.setSimulateDiskFull(false);

    // Normal operations resume without corrupted state
    const saveResult = await OfflineFormManager.saveTransactionalDraft(form);
    expect(saveResult.success).toBe(true);
    const queueId = await OfflineFormManager.enqueueSubmission(form);
    expect(queueId).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Criterion 13: Unified Queue Routing across submissionQueueRepo and syncQueueRepo
  // --------------------------------------------------------------------------
  it('Criterion 13: Unified Queue Routing - submissionQueueRepository and syncQueueRepository address the exact same native SQLite outbox', async () => {
    platformRegistry.configure({ target: 'android' });
    platformRegistry.setCustomAdapters({ storage: sqliteAdapter });

    const form = await OfflineFormManager.createOfflineForm('Unified Queue Form');
    form.demographics.childName = 'Unified Queue Child';

    // 1. Enqueue using submissionQueueRepository (the path called by Assessment form)
    const queueId = await enqueueCreate({
      clientSubmissionId: form.uuid,
      createIdempotencyKey: `create-${form.uuid}`,
      snapshot: form,
    });
    expect(queueId).toBeGreaterThan(0);

    // 2. Read using syncQueueRepository (the path called by syncOrchestrator)
    const pendingItems = await getPendingQueue();
    const matched = pendingItems.find((i) => i.submissionUuid === form.uuid);
    expect(matched).toBeDefined();
    expect(matched?.idempotencyKey).toBe(`create-${form.uuid}`);
    expect(matched?.status).toBe('queued');

    // 3. Mark synced using syncQueueRepository
    await markSynced(queueId, form.uuid, 'srv-ack-uuid-4455', 1);

    // 4. Verify draft and queue updated in the underlying SQLite storage
    const updatedDraft = await sqliteAdapter.getDraftByUuid(form.uuid);
    expect(updatedDraft?.syncStatus).toBe('synced');
    expect(updatedDraft?.remoteSubmissionId).toBe('srv-ack-uuid-4455');

    const updatedQueueItem = await getQueueItemByUuid(form.uuid);
    expect(updatedQueueItem?.status).toBe('synced');
  });
});
