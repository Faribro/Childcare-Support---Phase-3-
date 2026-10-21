import { DocType, TigrisStorageResult } from './types';

export interface StorageOptions {
  readonly bucketName?: string;
  readonly simulateFailure?: boolean;
}

export class TigrisStorageAdapter {
  private readonly bucketName: string;
  private readonly storageStore: Map<string, { bytes: Buffer; mimeType: string }>;
  private simulateFailure: boolean;

  constructor(options?: StorageOptions) {
    this.bucketName = options?.bucketName || process.env.S3_BUCKET_NAME || 'alliance-childcare-private-dossiers';
    this.storageStore = new Map();
    this.simulateFailure = options?.simulateFailure || false;
  }

  public setSimulateFailure(fail: boolean): void {
    this.simulateFailure = fail;
  }

  public getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    };
    return map[mimeType.toLowerCase()] || 'bin';
  }

  /**
   * Uploads verified media to private Tigris/S3 storage.
   * Path: asset://${submissionId}/${docType}/${checksum}.${ext}
   */
  public async uploadDocument(
    submissionId: string,
    docType: DocType,
    mimeType: string,
    byteSize: number,
    sha256Checksum: string,
    rawBytes?: Buffer
  ): Promise<TigrisStorageResult> {
    if (this.simulateFailure) {
      return {
        success: false,
        error: 'Tigris/S3 storage connection error: Remote service unavailable (simulated storage failure).',
      };
    }

    const ext = this.getExtension(mimeType);
    const key = `submissions/${submissionId}/${docType}/${sha256Checksum}.${ext}`;
    const storageUri = `asset://${this.bucketName}/${key}`;

    const contentBuffer = rawBytes || Buffer.alloc(byteSize, 0);
    this.storageStore.set(storageUri, { bytes: contentBuffer, mimeType });

    return {
      success: true,
      storageUri,
      bucket: this.bucketName,
      key,
      byteSize,
      sha256Checksum,
    };
  }

  /**
   * Checks whether a document object exists in storage by URI.
   */
  public hasDocument(storageUri: string): boolean {
    return this.storageStore.has(storageUri);
  }

  /**
   * Deletes a document from storage (used in rollback/cleanup).
   */
  public async deleteDocument(storageUri: string): Promise<boolean> {
    return this.storageStore.delete(storageUri);
  }
}
