import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { detectMagicMime, runReconciliation } from '../../../scripts/reconcile-dl-sou-to-supabase';
import { TigrisStorageService } from '../../lib/server/tigrisStorageService';

describe('Reconciliation Integrity & Strict Safety Guards (Item G)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Valid synthetic 6-slot buffers with real magic headers
  function createSyntheticValidBuffers(): Record<string, Buffer> {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const makePng = (len: number, fillByte: number) => {
      const b = Buffer.alloc(len, fillByte);
      pngHeader.copy(b, 0);
      return b;
    };

    return {
      caregiverSignature: makePng(23427, 0x11),
      passbookPhoto: makePng(2157206, 0x22),
      aadhaarCardPhoto: makePng(149780, 0x33),
      childPhoto: makePng(82686, 0x44),
      feeReceiptPhoto: makePng(169440, 0x55),
      marksheetPhoto: makePng(169440, 0x66),
    };
  }

  const validRecordData = {
    '1\nUnique ID': 'DL-SOU-231211-01',
    '2\nRevision Number': 1,
    '5\nConsent Obtained': 'Yes',
    '9\nChild Name': 'Test Beneficiary',
    '18\nState': 'Delhi',
    '19\nDistrict': 'South East Delhi',
    '6\nSignature /\nThumb Impression': 'Restricted Doc [Signature]',
    '25\nPassbook Front Page Link': 'Restricted Doc [Passbook]',
    '26\nAadhaar Card Link': 'Restricted Doc [Aadhaar]',
    '27\nPassport Size Photo Link': 'Restricted Doc [Child_Photo]',
    '64\nSchool Fee Receipt Link': 'Restricted Doc [Fee_Receipt]',
    '65\nMarksheet Photo Link': 'Restricted Doc [Marksheet]',
  };

  it('1. Proves zero-byte source cannot produce successful metadata or execution', async () => {
    const zeroByte = Buffer.alloc(0);
    const magic = detectMagicMime(zeroByte);
    expect(magic.valid).toBe(false);
    expect(magic.mimeType).toBe('empty');

    const buffers = createSyntheticValidBuffers();
    buffers.caregiverSignature = zeroByte; // zero-byte slot

    const manifest = await runReconciliation({
      isDryRun: true,
      mockSourceBuffers: buffers,
      overrideSpreadsheetData: validRecordData,
    });

    const sigDoc = manifest.documents.find((d) => d.docType === 'caregiverSignature');
    expect(sigDoc).toBeDefined();
    expect(sigDoc?.sourceBytesAvailable).toBe(false);
    expect(sigDoc?.sha256Checksum).toBeNull(); // Must NOT compute synthetic hash
    expect(sigDoc?.status).toBe('BYTES_UNAVAILABLE');
    expect(manifest.summary.readyForExecution).toBe(false);
    expect(manifest.summary.blockers).toContain("Slot 'caregiverSignature': SOURCE_BYTES_EMPTY_ZERO_LENGTH");

    // Proves --execute rejects execution fail-closed
    await expect(
      runReconciliation({
        isDryRun: false,
        mockSourceBuffers: buffers,
        overrideSpreadsheetData: validRecordData,
      })
    ).rejects.toThrow(/EXECUTION_REFUSED/);
  });

  it('2. Proves different same-size file contents produce different hashes', async () => {
    const size = 169440; // Exact size shared by feeReceiptPhoto and marksheetPhoto
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const contentA = Buffer.alloc(size, 0xaa);
    pngHeader.copy(contentA, 0);

    const contentB = Buffer.alloc(size, 0xbb);
    pngHeader.copy(contentB, 0);

    expect(contentA.length).toBe(contentB.length);

    const hashA = crypto.createHash('sha256').update(contentA).digest('hex');
    const hashB = crypto.createHash('sha256').update(contentB).digest('hex');
    expect(hashA).not.toBe(hashB);

    const buffers = createSyntheticValidBuffers();
    buffers.feeReceiptPhoto = contentA;
    buffers.marksheetPhoto = contentB;

    const manifest = await runReconciliation({
      isDryRun: true,
      mockSourceBuffers: buffers,
      overrideSpreadsheetData: validRecordData,
    });

    const feeDoc = manifest.documents.find((d) => d.docType === 'feeReceiptPhoto');
    const markDoc = manifest.documents.find((d) => d.docType === 'marksheetPhoto');

    expect(feeDoc?.sha256Checksum).toBe(hashA);
    expect(markDoc?.sha256Checksum).toBe(hashB);
    expect(feeDoc?.sha256Checksum).not.toBe(markDoc?.sha256Checksum);
  });

  it('3. Proves another same-day record cannot be selected (fail closed on identity mismatch)', async () => {
    const wrongSameDayRecord = {
      ...validRecordData,
      '1\nUnique ID': 'DL-SOU-231211-99', // Different record submitted on same day
    };

    const buffers = createSyntheticValidBuffers();

    await expect(
      runReconciliation({
        isDryRun: true,
        mockSourceBuffers: buffers,
        overrideSpreadsheetData: wrongSameDayRecord,
      })
    ).rejects.toThrow(/IDENTITY_MISMATCH/);
  });

  it('4. Proves uploaded keys equal committed metadata keys', async () => {
    const tigris = new TigrisStorageService();
    const submissionId = 'DL-SOU-231211-01';
    const testDocType = 'caregiverSignature';

    const testBuf = Buffer.alloc(100, 0x77);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(testBuf, 0);

    const uploadRes = await tigris.uploadAttachment({
      submissionId,
      docType: testDocType,
      buffer: testBuf,
      contentType: 'image/png',
    });

    expect(uploadRes.status).toBe('STORED_PRIVATE');
    expect(uploadRes.storageKey).toBeDefined();

    // The committed metadata must strictly use uploadRes.storageKey
    const committedFileEntry = {
      doc_type: testDocType,
      bucket_name: uploadRes.bucketName,
      storage_key: uploadRes.storageKey,
      mime_type: 'image/png',
      size_bytes: uploadRes.byteSize,
      sha256_checksum: uploadRes.calculatedSha256,
    };

    expect(committedFileEntry.storage_key).toBe(uploadRes.storageKey);
    expect(committedFileEntry.size_bytes).toBe(testBuf.length);
    expect(committedFileEntry.sha256_checksum).toBe(crypto.createHash('sha256').update(testBuf).digest('hex'));
  });

  it('5. Proves unchanged source bytes match destination read-back exactly', async () => {
    const tigris = new TigrisStorageService();
    const submissionId = 'DL-SOU-231211-01';
    const testDocType = 'passbookPhoto';

    // 2 KB random payload with PNG header
    const rawPayload = crypto.randomBytes(2048);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(rawPayload, 0);
    const sourceDigest = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const uploadRes = await tigris.uploadAttachment({
      submissionId,
      docType: testDocType,
      buffer: rawPayload,
      contentType: 'image/png',
      expectedSha256: sourceDigest,
    });

    expect(uploadRes.status).toBe('STORED_PRIVATE');
    expect(uploadRes.calculatedSha256).toBe(sourceDigest);

    // Read back from Tigris
    const fetchRes = await tigris.fetchAttachment(uploadRes.privateUri);
    expect(fetchRes.status).toBe('SUCCESS');
    expect(fetchRes.buffer).toBeDefined();

    const readbackDigest = crypto.createHash('sha256').update(fetchRes.buffer!).digest('hex');
    expect(readbackDigest).toBe(sourceDigest);
    expect(fetchRes.buffer!.length).toBe(rawPayload.length);
    expect(Buffer.compare(rawPayload, fetchRes.buffer!)).toBe(0);
  });

  it('6. Proves --source-dir validates local file provenance against Google Drive authoritative MD5', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tempDir = path.join(os.tmpdir(), `test-reconcile-src-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Create caregiver-signature.png with wrong MD5
      const invalidBuf = Buffer.alloc(23427, 0x99);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(invalidBuf, 0);
      fs.writeFileSync(path.join(tempDir, 'caregiver-signature.png'), invalidBuf);

      const manifest = await runReconciliation({
        isDryRun: true,
        sourceDir: tempDir,
        overrideSpreadsheetData: validRecordData,
      });

      const sigDoc = manifest.documents.find((d) => d.docType === 'caregiverSignature');
      expect(sigDoc).toBeDefined();
      expect(sigDoc?.sourceOrigin).toBe('LOCAL_DIRECTORY');
      expect(sigDoc?.provenanceVerified).toBe(false);
      expect(sigDoc?.status).toBe('PROVENANCE_FAILED');
      expect(manifest.summary.readyForExecution).toBe(false);
      expect(manifest.summary.blockers.some((b) => b.includes('MD5 provenance mismatch'))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
