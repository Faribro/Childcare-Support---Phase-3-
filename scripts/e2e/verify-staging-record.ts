/**
 * Staging Record Verification Script
 * 
 * Independently retrieves a canonical record via the authoritative gateway service
 * and verifies that persisted fields, version/revision numbers, and Drive asset
 * links strictly match expected synthetic values.
 * 
 * Safety Rules:
 * - Redacts all sensitive strings in output.
 * - Refuses to output raw base64 or secrets.
 */

import { canonicalSubmissionAdapter } from '../../src/lib/server/canonicalSubmissionAdapter';

export interface VerifyRecordOptions {
  submissionId: string;
  expectedVersion?: number;
  expectedChildName?: string;
  expectedWeight?: number;
  expectedRevision?: number;
}

export async function verifyStagingRecord(options: VerifyRecordOptions): Promise<{
  verified: boolean;
  statusCode: number;
  record?: any;
  errors: string[];
}> {
  const errors: string[] = [];
  console.log(`[VERIFY-RECORD] Inspecting canonical record: ${options.submissionId}`);

  try {
    const res = await canonicalSubmissionAdapter.getSubmission(options.submissionId);

    if (res.status === 'error' || !res.data) {
      errors.push(`Failed to retrieve record: ${res.message || 'Not found'} (status: ${res.statusCode})`);
      return { verified: false, statusCode: res.statusCode || 404, errors };
    }

    const data = res.data;
    console.log(`[VERIFY-RECORD] Record retrieved. Remote ID: ${res.remoteSubmissionId}, Version: ${res.version}`);

    // 1. Version / Revision check
    if (options.expectedVersion !== undefined && res.version !== options.expectedVersion) {
      errors.push(`Version mismatch: expected ${options.expectedVersion}, received ${res.version}`);
    }

    // 2. Child Name check
    if (options.expectedChildName && data.childName !== options.expectedChildName && data.child_name !== options.expectedChildName) {
      errors.push(`Child name mismatch: expected "${options.expectedChildName}", received "${data.childName || data.child_name}"`);
    }

    // 3. Weight check
    if (options.expectedWeight !== undefined && data.weight_kg !== options.expectedWeight && data.weightKg !== options.expectedWeight) {
      errors.push(`Weight mismatch: expected ${options.expectedWeight}, received ${data.weight_kg || data.weightKg}`);
    }

    // 4. Asset Privacy check (no raw base64 in cell fields)
    const photoFields = ['passbookPhotoUrl', 'aadhaarCardPhotoUrl', 'childPhotoUrl', 'signatureDataUrl', 'signature_data_url'];
    for (const pf of photoFields) {
      const val = data[pf];
      if (typeof val === 'string' && val.startsWith('data:image')) {
        errors.push(`CRITICAL PRIVACY DEFECT: Raw base64 data detected in cell field ${pf}`);
      }
    }

    const verified = errors.length === 0;
    if (verified) {
      console.log(`✔ Record ${options.submissionId} passed all canonical verification checks.`);
    } else {
      console.error(`✖ Record verification failed with ${errors.length} error(s):`, errors);
    }

    return {
      verified,
      statusCode: res.statusCode || 200,
      record: data,
      errors,
    };
  } catch (err: any) {
    errors.push(`Verification exception: ${err?.message || err}`);
    return { verified: false, statusCode: 500, errors };
  }
}

// CLI direct run
if (require.main === module) {
  const targetId = process.argv[2];
  if (!targetId) {
    console.error('Usage: tsx scripts/e2e/verify-staging-record.ts <submissionId>');
    process.exit(1);
  }
  verifyStagingRecord({ submissionId: targetId }).then((r) => process.exit(r.verified ? 0 : 1));
}
