/**
 * Full Cross-System Consistency Integration Test Suite
 *
 * Verifies end-to-end consistency across all five destinations:
 * 1. Supabase PostgreSQL (`public.submissions`, `public.submission_files`, `public.sheets_mirror_jobs`)
 * 2. Tigris Private S3 Storage (`childcare-assets` bucket)
 * 3. Google Sheets Destination 1 (`Child_Nutrition` linelist)
 * 4. Google Sheets Destination 2 (`_Asset_Containers` registry)
 * 5. Google Drive (`Alliance India Child PDFs/<ChildName> - <UniqueID>`)
 *
 * Scenarios tested:
 * - Scenario 1: Offline submission -> reconnection -> all required destinations
 * - Scenario 2: Targeted edit -> existing destination records updated (monotonic OCC, zero duplicates)
 * - Scenario 3: Document replacement -> both storage references reconciled
 * - Scenario 4: One destination unavailable -> visible pending state -> safe retry
 * - Scenario 5: Stale edit from a second device -> explicit conflict handling (HTTP 409)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  TigrisStorageService,
  UploadAttachmentResult,
} from '@/lib/server/tigrisStorageService';
import {
  SheetsMirrorWorker,
  InMemorySheetsMirrorRepository,
  GatewayClient,
} from '@/lib/server/sheetsMirrorWorker';
import {
  SupabaseSubmissionAdapter,
  StoredSubmissionRecord,
  StoredFileRecord,
} from '@/lib/server/supabaseSubmissionAdapter';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

describe('Full Cross-System Consistency — 5-Destination Lifecycle', () => {
  let mockS3Objects: Map<string, { body: Buffer; contentType: string }>;
  let mockDriveFiles: Map<string, { fileId: string; filename: string; folder: string; body: Buffer }>;
  let mockSheetRows: Map<string, Record<string, any>>;
  let mockAssetRegistry: Map<string, { remoteSubmissionId: string; assetContainerId: string; folderName: string }>;
  let mockAuditLog: Array<Record<string, any>>;

  let fakeS3Client: any;
  let tigrisService: TigrisStorageService;
  let mirrorRepo: InMemorySheetsMirrorRepository;
  let supabaseAdapter: SupabaseSubmissionAdapter;
  let mockGatewayClient: GatewayClient;

  // Track gateway availability for outage simulation
  let gatewayOnline: boolean;

  const SAMPLE_BASE64_JPEG =
    'data:image/jpeg;base64,' +
    Buffer.from('JFIF-SAMPLE-IMAGE-BINARY-REPRESENTING-CHILD-PASSBOOK').toString('base64');
  const REPLACEMENT_BASE64_JPEG =
    'data:image/jpeg;base64,' +
    Buffer.from('JFIF-REPLACEMENT-UPDATED-PASSBOOK-IMAGE-BINARY').toString('base64');

  beforeEach(() => {
    mockS3Objects = new Map();
    mockDriveFiles = new Map();
    mockSheetRows = new Map();
    mockAssetRegistry = new Map();
    mockAuditLog = [];
    gatewayOnline = true;

    // In-memory S3 Client for Tigris
    fakeS3Client = {
      send: vi.fn(async (command: any) => {
        const cmdName = command.constructor.name;
        if (cmdName === 'PutObjectCommand') {
          const key = `${command.input.Bucket}/${command.input.Key}`;
          mockS3Objects.set(key, {
            body: command.input.Body,
            contentType: command.input.ContentType,
          });
          return { $metadata: { httpStatusCode: 200 } };
        }
        if (cmdName === 'GetObjectCommand') {
          const key = `${command.input.Bucket}/${command.input.Key}`;
          const found = mockS3Objects.get(key);
          if (!found) {
            const err: any = new Error('NoSuchKey');
            err.name = 'NoSuchKey';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return {
            Body: { transformToByteArray: async () => new Uint8Array(found.body) },
            ContentType: found.contentType,
            $metadata: { httpStatusCode: 200 },
          };
        }
        return { $metadata: { httpStatusCode: 200 } };
      }),
    };

    tigrisService = new TigrisStorageService(
      {
        bucketName: 'childcare-assets',
        region: 'sin',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'https://fly.storage.tigris.dev',
      },
      fakeS3Client
    );

    mirrorRepo = new InMemorySheetsMirrorRepository();
    supabaseAdapter = new SupabaseSubmissionAdapter(tigrisService, mirrorRepo);
    canonicalSubmissionAdapter.setSupabaseAdapter(supabaseAdapter);

    // Mock Google Apps Script Gateway simulating Google Sheets and Google Drive
    mockGatewayClient = {
      callGateway: async (payload: Record<string, any>) => {
        if (!gatewayOnline) {
          return {
            status: 'error',
            statusCode: 503,
            message: 'Upstream gateway temporarily unavailable: 503 Service Unavailable',
          };
        }

        const action = payload.action;

        if (action === 'create' || action === 'update') {
          const data = payload.payload || payload;
          const uniqueId = payload.uniqueId || data.uniqueId;
          const childName = data.demographics?.childName || data.childName || 'Child';

          // Simulate OCC verification for update
          if (action === 'update' && payload.expectedVersion !== undefined) {
            const existing = mockSheetRows.get(uniqueId);
            if (existing && existing.revision !== payload.expectedVersion) {
              return {
                status: 'conflict',
                statusCode: 409,
                message: `Version mismatch: expected ${payload.expectedVersion} but sheet has ${existing.revision}`,
                currentVersion: existing.revision,
              };
            }
          }

          // Simulate Google Drive storage for documents
          const folderName = `${childName} - ${uniqueId}`;
          const passbookVal = data.bankingAndKyc?.passbookPhotoUrl;
          if (passbookVal && passbookVal.startsWith('data:')) {
            const fileId = `drive-file-${uniqueId}-passbook-${Date.now()}`;
            mockDriveFiles.set(fileId, {
              fileId,
              filename: `Passbook_${uniqueId}.jpg`,
              folder: folderName,
              body: Buffer.from(passbookVal.split(',')[1], 'base64'),
            });
            // Map in Destination 2: _Asset_Containers
            mockAssetRegistry.set(uniqueId, {
              remoteSubmissionId: uniqueId,
              assetContainerId: `container-${uniqueId}`,
              folderName,
            });
          }

          // Destination 1: Child_Nutrition linelist update
          const existing = mockSheetRows.get(uniqueId);
          const revision = action === 'update' ? (existing ? existing.revision + 1 : 2) : 1;
          const rowNum = existing ? existing.rowNumber : mockSheetRows.size + 4;

          mockSheetRows.set(uniqueId, {
            rowNumber: rowNum,
            uniqueId,
            revision,
            status: data.status || 'Submitted',
            childName,
            state: data.location?.state || data.state || 'Maharashtra',
            district: data.location?.district || data.district || 'Pune',
            passbookLink: `=HYPERLINK("https://drive.google.com/open?id=mock-passbook-${uniqueId}", "Restricted Doc [passbook]")`,
            lastUpdated: new Date().toISOString(),
          });

          mockAuditLog.push({
            action,
            uniqueId,
            revision,
            timestamp: new Date().toISOString(),
          });

          return {
            status: 'success',
            statusCode: action === 'create' ? 201 : 200,
            resolvedRow: rowNum,
            currentVersion: revision,
            message: 'Row successfully synchronized to Google Sheets and Drive',
          };
        }

        if (action === 'updateAsset') {
          const targetId = payload.submissionId || payload.uniqueId;
          const existingRow = mockSheetRows.get(targetId);
          if (!existingRow) {
            return {
              status: 'error',
              statusCode: 404,
              message: `Record not found with ID: ${targetId}`,
            };
          }

          // OCC Version check
          if (payload.expectedVersion !== undefined && payload.expectedVersion !== existingRow.revision) {
            return {
              status: 'conflict',
              statusCode: 409,
              message: `Version mismatch on sheet: expected ${payload.expectedVersion} but current is ${existingRow.revision}`,
              currentVersion: existingRow.revision,
            };
          }

          // Drive file update
          const driveFileId = `drive-replaced-${targetId}-${payload.docType}-${Date.now()}`;
          mockDriveFiles.set(driveFileId, {
            fileId: driveFileId,
            filename: `${payload.docType}_${targetId}.jpg`,
            folder: `Folder - ${targetId}`,
            body: Buffer.from(payload.fileData.split(',')[1], 'base64'),
          });

          // Update Sheet row cell
          existingRow.revision++;
          existingRow.passbookLink = `=HYPERLINK("https://drive.google.com/open?id=${driveFileId}", "Restricted Doc [${payload.docType}]")`;
          existingRow.lastUpdated = new Date().toISOString();
          mockSheetRows.set(targetId, existingRow);

          mockAuditLog.push({
            action: 'updateAsset',
            uniqueId: targetId,
            docType: payload.docType,
            newFileId: driveFileId,
            revision: existingRow.revision,
          });

          return {
            status: 'success',
            statusCode: 200,
            resolvedRow: existingRow.rowNumber,
            currentVersion: existingRow.revision,
            message: 'Document replaced successfully in Drive and Sheet updated',
          };
        }

        return { status: 'error', statusCode: 400, message: `Unsupported action: ${action}` };
      },
    };
  });

  // ===========================================================================
  // SCENARIO 1: Offline submission -> reconnection -> all 5 required destinations
  // ===========================================================================
  it('Scenario 1: offline submission upon sync appears in Supabase, Tigris, both Sheets, and Drive', async () => {
    process.env.STORAGE_ENGINE = 'supabase';

    const testSubmissionId = `MH-PUN-${Date.now()}-01`;
    const intakePayload: any = {
      uniqueId: testSubmissionId,
      demographics: {
        childName: 'Aarav Patil',
        dob: '2016-04-12',
        gender: 'Male',
        aadhaarNumber: 'XXXX-XXXX-1234',
        orphanStatus: 'Single Orphan (Mother Alive)',
      },
      location: {
        state: 'Maharashtra',
        district: 'Pune',
        block: 'Haveli',
        village: 'Hadapsar',
      },
      household: {
        caregiverName: 'Sunita Patil',
        relationshipToChild: 'Mother',
        caregiverContact: '9876543210',
        monthlyIncomeRs: 12000,
      },
      healthAndNutrition: {
        weightKg: 24.5,
        heightCm: 122,
        muacCm: 14.2,
        bmi: 16.46,
        nutritionStatus: 'Normal',
      },
      bankingAndKyc: {
        passbookPhotoUrl: SAMPLE_BASE64_JPEG,
      },
      caregiverConsent: {
        consentProvided: true,
      },
    };

    // 1. Submit through canonicalSubmissionAdapter (simulating sync completion)
    const result = await canonicalSubmissionAdapter.createSubmission({
      payload: intakePayload,
      idempotencyKey: `sync-${testSubmissionId}`,
      requestId: `req-sync-${testSubmissionId}`,
    });

    expect(result.status).toBe('success');
    expect(result.statusCode).toBe(201);
    expect(result.uniqueId).toBe(testSubmissionId);
    expect(result.assetStatus).toBe('UPLOADED');

    // --- Destination 1: Supabase Database (public.submissions) ---
    const records = supabaseAdapter.getRecords();
    const stored = records.get(testSubmissionId);
    expect(stored).toBeDefined();
    expect(stored?.unique_id).toBe(testSubmissionId);
    expect(stored?.child_name).toBe('Aarav Patil');
    expect(stored?.state).toBe('Maharashtra');
    expect(stored?.district).toBe('Pune');
    expect(stored?.version).toBe(1);
    expect(stored?.status).toBe('Submitted');
    expect(stored?.sync_status).toBe('SYNCED');

    // --- Destination 2: Tigris Object Storage (childcare-assets) ---
    const files = supabaseAdapter.getFiles(testSubmissionId);
    expect(files.length).toBe(1);
    const passbookFile = files[0];
    expect(passbookFile.doc_type).toBe('passbookPhoto');
    expect(passbookFile.bucket_name).toBe('childcare-assets');
    expect(passbookFile.storage_key).toContain(testSubmissionId);
    expect(passbookFile.is_restricted_doc).toBe(true);

    // Verify binary exists in S3 mock
    const s3Key = `childcare-assets/${passbookFile.storage_key}`;
    expect(mockS3Objects.has(s3Key)).toBe(true);
    const s3Item = mockS3Objects.get(s3Key);
    expect(s3Item?.contentType).toBe('image/jpeg');

    // --- Drain Outbox Mirror Queue ---
    const drainSummary = await supabaseAdapter.drainMirrorQueue(mockGatewayClient);
    expect(drainSummary.processed).toBe(1);
    expect(drainSummary.completed).toBe(1);
    expect(drainSummary.failed).toBe(0);

    // --- Destination 3: Google Sheets Destination 1 (Child_Nutrition Linelist) ---
    const sheetRow = mockSheetRows.get(testSubmissionId);
    expect(sheetRow).toBeDefined();
    expect(sheetRow?.uniqueId).toBe(testSubmissionId);
    expect(sheetRow?.childName).toBe('Aarav Patil');
    expect(sheetRow?.revision).toBe(1);
    expect(sheetRow?.passbookLink).toContain('=HYPERLINK');

    // --- Destination 4: Google Sheets Destination 2 (_Asset_Containers Registry) ---
    const registryEntry = mockAssetRegistry.get(testSubmissionId);
    expect(registryEntry).toBeDefined();
    expect(registryEntry?.remoteSubmissionId).toBe(testSubmissionId);
    expect(registryEntry?.folderName).toBe(`Aarav Patil - ${testSubmissionId}`);

    // --- Destination 5: Google Drive (<ChildName> - <UniqueID>) ---
    expect(mockDriveFiles.size).toBe(1);
    const driveEntry = Array.from(mockDriveFiles.values())[0];
    expect(driveEntry.folder).toBe(`Aarav Patil - ${testSubmissionId}`);
    expect(driveEntry.filename).toContain('Passbook');
    expect(driveEntry.body.length).toBeGreaterThan(0);
  });

  // ===========================================================================
  // SCENARIO 2: Targeted edit -> existing destination records updated (no dupes)
  // ===========================================================================
  it('Scenario 2: targeted edit updates existing records, increments OCC version, preserves fields, and produces zero duplicates', async () => {
    process.env.STORAGE_ENGINE = 'supabase';

    const testSubmissionId = `MH-PUN-${Date.now()}-02`;
    await canonicalSubmissionAdapter.createSubmission({
      payload: {
        uniqueId: testSubmissionId,
        demographics: { childName: 'Priya Sharma', dob: '2017-08-19', gender: 'Female' },
        location: { state: 'Maharashtra', district: 'Pune' },
        household: { caregiverName: 'Ramesh Sharma', caregiverContact: '9123456789' },
        bankingAndKyc: { passbookPhotoUrl: SAMPLE_BASE64_JPEG },
        caregiverConsent: { consentProvided: true },
      } as any,
      idempotencyKey: `sync-${testSubmissionId}`,
      requestId: `req-create-${testSubmissionId}`,
    });

    await supabaseAdapter.drainMirrorQueue(mockGatewayClient);
    const initialRowCount = mockSheetRows.size;
    expect(mockSheetRows.get(testSubmissionId)?.revision).toBe(1);

    // Apply targeted edit: Approval decision = 'Approved'
    const editResult = await canonicalSubmissionAdapter.updateSubmission({
      submissionId: testSubmissionId,
      expectedVersion: 1,
      patch: {
        approval: { decision: 'Approved', comments: 'Verified by State Supervisor' },
      } as any,
      requestId: `req-edit-${testSubmissionId}`,
    });

    expect(editResult.status).toBe('success');
    expect(editResult.statusCode).toBe(200);
    expect(editResult.version).toBe(2);
    expect(editResult.submissionStatus).toBe('Approved');

    // Drain mirror update
    await supabaseAdapter.drainMirrorQueue(mockGatewayClient);

    // Verify Supabase update
    const updatedRecord = supabaseAdapter.getRecords().get(testSubmissionId);
    expect(updatedRecord?.version).toBe(2);
    expect(updatedRecord?.status).toBe('Approved');
    expect(updatedRecord?.child_name).toBe('Priya Sharma'); // Unrelated field preserved

    // Verify Sheet update
    const updatedSheetRow = mockSheetRows.get(testSubmissionId);
    expect(updatedSheetRow?.revision).toBe(2);
    expect(updatedSheetRow?.status).toBe('Approved');

    // Invariant: Zero duplicate rows created
    expect(mockSheetRows.size).toBe(initialRowCount);
  });

  // ===========================================================================
  // SCENARIO 3: Document replacement -> both storage references reconciled
  // ===========================================================================
  it('Scenario 3: document replacement reconciles Tigris and Google Drive storage references', async () => {
    process.env.STORAGE_ENGINE = 'supabase';

    const testSubmissionId = `MH-PUN-${Date.now()}-03`;
    await canonicalSubmissionAdapter.createSubmission({
      payload: {
        uniqueId: testSubmissionId,
        demographics: { childName: 'Vikram Jadhav' },
        location: { state: 'Maharashtra', district: 'Pune' },
        bankingAndKyc: { passbookPhotoUrl: SAMPLE_BASE64_JPEG },
        caregiverConsent: { consentProvided: true },
      } as any,
      idempotencyKey: `create-${testSubmissionId}`,
      requestId: `req-init-${testSubmissionId}`,
    });

    await supabaseAdapter.drainMirrorQueue(mockGatewayClient);

    const initialFiles = supabaseAdapter.getFiles(testSubmissionId);
    const initialCellHash = initialFiles[0].cell_state_hash;
    const initialS3KeyCount = mockS3Objects.size;
    const initialDriveFileCount = mockDriveFiles.size;

    // Call updateAsset via canonicalSubmissionAdapter
    const updateAssetResult = await canonicalSubmissionAdapter.updateAsset({
      submissionId: testSubmissionId,
      docType: 'passbookPhoto',
      fileData: REPLACEMENT_BASE64_JPEG,
      expectedVersion: 1,
      expectedCurrentCellStateHash: initialCellHash,
      requestId: `req-asset-replace-${testSubmissionId}`,
    });

    expect(updateAssetResult.status).toBe('success');
    expect(updateAssetResult.statusCode).toBe(200);
    expect(updateAssetResult.version).toBe(2);
    expect(updateAssetResult.assetStatus).toBe('UPLOADED');

    // Drain mirror queue to propagate document replacement to Google Sheets and Drive
    const drainResult = await supabaseAdapter.drainMirrorQueue(mockGatewayClient);
    expect(drainResult.completed).toBe(1);

    // Verify Supabase metadata updated
    const updatedFiles = supabaseAdapter.getFiles(testSubmissionId);
    const newFile = updatedFiles.find((f) => f.doc_type === 'passbookPhoto');
    expect(newFile).toBeDefined();
    expect(newFile?.cell_state_hash).not.toBe(initialCellHash);

    // Verify Tigris S3 has replacement binary content at deterministic key
    const s3Item = mockS3Objects.get(`childcare-assets/${newFile?.storage_key}`);
    expect(s3Item).toBeDefined();
    expect(s3Item?.body.toString()).toContain('REPLACEMENT-UPDATED-PASSBOOK');

    // Verify Google Drive has new replacement file
    expect(mockDriveFiles.size).toBe(initialDriveFileCount + 1);

    // Verify Sheet cell formula updated
    const sheetRow = mockSheetRows.get(testSubmissionId);
    expect(sheetRow?.revision).toBe(2);
    expect(sheetRow?.passbookLink).toContain('drive-replaced');
  });

  // ===========================================================================
  // SCENARIO 4: One destination unavailable -> visible pending state -> safe retry
  // ===========================================================================
  it('Scenario 4: when downstream destination is unavailable, enters pending/retryable state and recovers on retry', async () => {
    process.env.STORAGE_ENGINE = 'supabase';

    const testSubmissionId = `MH-PUN-${Date.now()}-04`;

    // Simulate downstream Google Apps Script gateway outage
    gatewayOnline = false;

    const createRes = await canonicalSubmissionAdapter.createSubmission({
      payload: {
        uniqueId: testSubmissionId,
        demographics: { childName: 'Neha Deshmukh' },
        location: { state: 'Maharashtra', district: 'Pune' },
        bankingAndKyc: { passbookPhotoUrl: SAMPLE_BASE64_JPEG },
        caregiverConsent: { consentProvided: true },
      } as any,
      idempotencyKey: `create-outage-${testSubmissionId}`,
      requestId: `req-outage-${testSubmissionId}`,
    });

    // Supabase and Tigris accepted the intake
    expect(createRes.status).toBe('success');
    expect(supabaseAdapter.getRecords().has(testSubmissionId)).toBe(true);

    // Outbox queue attempted drain during outage
    const failedDrain = await supabaseAdapter.drainMirrorQueue(mockGatewayClient);
    expect(failedDrain.processed).toBe(1);
    expect(failedDrain.failed).toBe(1);
    expect(failedDrain.completed).toBe(0);

    // Verify visible pending state in queue
    const pendingCount = await mirrorRepo.getPendingCount();
    expect(pendingCount).toBe(1);

    // Sheets does not have the record yet
    expect(mockSheetRows.has(testSubmissionId)).toBe(false);

    // Now restore downstream gateway and retry
    gatewayOnline = true;
    const retryDrain = await supabaseAdapter.drainMirrorQueue(mockGatewayClient);
    expect(retryDrain.processed).toBe(1);
    expect(retryDrain.completed).toBe(1);

    // Verify destination now has the synchronized record
    expect(mockSheetRows.has(testSubmissionId)).toBe(true);
    expect(mockSheetRows.get(testSubmissionId)?.childName).toBe('Neha Deshmukh');
    expect(await mirrorRepo.getPendingCount()).toBe(0);
  });

  // ===========================================================================
  // SCENARIO 5: Stale edit from second device -> explicit conflict handling
  // ===========================================================================
  it('Scenario 5: rejects stale edit from second device with HTTP 409 and protects existing destination state', async () => {
    process.env.STORAGE_ENGINE = 'supabase';

    const testSubmissionId = `MH-PUN-${Date.now()}-05`;
    await canonicalSubmissionAdapter.createSubmission({
      payload: {
        uniqueId: testSubmissionId,
        demographics: { childName: 'Karan Joshi' },
        location: { state: 'Maharashtra', district: 'Pune' },
        caregiverConsent: { consentProvided: true },
      } as any,
      idempotencyKey: `create-${testSubmissionId}`,
      requestId: `req-init-${testSubmissionId}`,
    });

    // Device A updates record to version 2
    const updateResA = await canonicalSubmissionAdapter.updateSubmission({
      submissionId: testSubmissionId,
      expectedVersion: 1,
      patch: { status: 'Approved' } as any,
      requestId: `req-devA-${testSubmissionId}`,
    });
    expect(updateResA.status).toBe('success');
    expect(updateResA.version).toBe(2);

    // Device B attempts update with stale expectedVersion = 1
    const staleUpdateResB = await canonicalSubmissionAdapter.updateSubmission({
      submissionId: testSubmissionId,
      expectedVersion: 1, // Stale! Current is 2
      patch: { status: 'Rejected' } as any,
      requestId: `req-devB-stale-${testSubmissionId}`,
    });

    expect(staleUpdateResB.status).toBe('conflict');
    expect(staleUpdateResB.statusCode).toBe(409);
    expect(staleUpdateResB.code).toBe('CONCURRENCY_CONFLICT');
    expect(staleUpdateResB.currentVersion).toBe(2);

    // Verify record in Supabase remains 'Approved' at version 2
    const record = supabaseAdapter.getRecords().get(testSubmissionId);
    expect(record?.version).toBe(2);
    expect(record?.status).toBe('Approved');
  });
});
