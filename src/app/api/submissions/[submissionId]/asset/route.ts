import { NextRequest, NextResponse } from 'next/server';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import {
  resolveUserAccessScope,
  isStateAuthorized,
  isDistrictAuthorized,
  logSecurityEvent,
} from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const ASSET_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
};

export async function POST(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const requestId = `req-asset-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const scope = await resolveUserAccessScope(req);
    if (!scope.isVerified) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: 'Unverified caller denied on POST /api/submissions/[submissionId]/asset',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Authentication required to upload or update submission assets.',
          requestId,
        },
        { status: 401, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (scope.role !== 'ADMIN') {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: `Caller role '${scope.role}' forbidden to upload assets under Model A read-only evaluation policy`,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Asset upload is restricted to verified Administrator role. State Evaluation and Leadership users have read-only evaluation access.',
          requestId,
        },
        { status: 403, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON body' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const { docType, fileData, documentOperationId, expectedVersion, expectedCurrentCellStateHash } = rawBody || {};

    if (!docType || typeof docType !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required field: docType' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (!fileData || typeof fileData !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required field: fileData' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (expectedVersion === undefined || expectedVersion === null || typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing or invalid required field: expectedVersion (must be positive integer)' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (!expectedCurrentCellStateHash || typeof expectedCurrentCellStateHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(expectedCurrentCellStateHash.trim())) {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing or invalid required field: expectedCurrentCellStateHash (must be 64-character hex SHA-256 hash)' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    // When caller does not have global wildcard scope, verify the target submission belongs to their authorized scope
    if (!scope.allowedStates.includes('*') || !scope.allowedDistricts.includes('*')) {
      const existing = await canonicalSubmissionAdapter.getSubmission(submissionId, 'supervisor');
      if (existing.status === 'success' && existing.data) {
        const recordState = existing.data.state || existing.data['18\nState'] || existing.data.demographics?.state || 'Maharashtra';
        const recordDistrict = existing.data.district || existing.data['19\nDistrict'] || existing.data.demographics?.district || undefined;
        if (!isStateAuthorized(scope, recordState) || (recordDistrict && !isDistrictAuthorized(scope, recordState, recordDistrict))) {
          logSecurityEvent({
            actor: scope.userId,
            actorRole: scope.role,
            eventType: 'SCOPE_VIOLATION',
            outcome: 'DENY',
            targetResource: submissionId,
            scope: `state=${recordState},district=${recordDistrict || ''}`,
            details: 'Caller forbidden to update asset outside authorized geographic scope',
          });
          return NextResponse.json(
            {
              status: 'error',
              code: 'FORBIDDEN_SCOPE',
              message: `Access denied to update assets for records in state "${recordState}".`,
              requestId,
            },
            { status: 403, headers: ASSET_NO_STORE_HEADERS }
          );
        }
      }
    }

    const result = await canonicalSubmissionAdapter.updateAsset({
      submissionId,
      docType,
      fileData,
      documentOperationId,
      expectedVersion,
      expectedCurrentCellStateHash,
      requestId,
    });

    if (result.status === 'error' || result.status === 'conflict') {
      return NextResponse.json(
        {
          status: result.status,
          code: result.code || (result.status === 'conflict' ? 'OCC_CONFLICT' : 'UPSTREAM_FAILURE'),
          message: result.message || 'Failed to update asset',
          requestId,
        },
        { status: result.statusCode || (result.status === 'conflict' ? 409 : 500) }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        acknowledged: true,
        submissionId: result.remoteSubmissionId || submissionId,
        uniqueId: result.uniqueId || submissionId,
        docType: result.docType || docType,
        cellFormula: result.cellFormula,
        assetStatus: result.assetStatus || 'UPLOADED',
        updatedAt: result.updatedAt,
        requestId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('POST /api/submissions/[submissionId]/asset error:', err?.message || 'Unknown error');
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error', requestId },
      { status: 500 }
    );
  }
}

/**
 * GET /api/submissions/[submissionId]/asset?docType=<type>
 *
 * Authenticated document streaming and visual preview endpoint.
 * Serves verified and uploaded attachments (images, PDFs, SVGs) for authorized roles:
 * ADMIN, LEADERSHIP, and STATE_REVIEWER (within authorized geographic scope).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const submissionId = params.submissionId;
  if (!submissionId) {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
      { status: 400, headers: ASSET_NO_STORE_HEADERS }
    );
  }

  const scope = await resolveUserAccessScope(req);
  if (!scope.isVerified) {
    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'AUTH_FAILURE',
      outcome: 'DENY',
      targetResource: submissionId,
      details: 'Unauthenticated caller denied on GET /api/submissions/[submissionId]/asset',
    });
    return NextResponse.json(
      {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Authentication required to view document attachments.',
      },
      { status: 401, headers: ASSET_NO_STORE_HEADERS }
    );
  }

  // Extract requested document type
  const { searchParams } = new URL(req.url);
  const rawDocType = (searchParams.get('docType') || searchParams.get('type') || '').trim();

  // Canonical document field mapping
  const docTypeMap: Record<string, string[]> = {
    passbookPhoto: ['passbookPhotoUrl', 'passbook_photo_url', '25\nPassbook Front Page Link', 'Passbook Front Page Link'],
    passbook: ['passbookPhotoUrl', 'passbook_photo_url', '25\nPassbook Front Page Link', 'Passbook Front Page Link'],
    aadhaarCardPhoto: ['aadhaarCardPhotoUrl', 'aadhaar_card_photo_url', '26\nAadhaar Card Link', 'Aadhaar Card Link'],
    aadhaar: ['aadhaarCardPhotoUrl', 'aadhaar_card_photo_url', '26\nAadhaar Card Link', 'Aadhaar Card Link'],
    childPhoto: ['childPhotoUrl', 'child_photo_url', '27\nPassport Size Photo Link', 'Passport Size Photo Link'],
    photo: ['childPhotoUrl', 'child_photo_url', '27\nPassport Size Photo Link', 'Passport Size Photo Link'],
    feeReceiptPhoto: ['feeReceiptPhotoUrl', 'fee_receipt_photo_url', '64\nSchool Fee Receipt Link', 'School Fee Receipt Link'],
    feeReceipt: ['feeReceiptPhotoUrl', 'fee_receipt_photo_url', '64\nSchool Fee Receipt Link', 'School Fee Receipt Link'],
    marksheetPhoto: ['marksheetPhotoUrl', 'marksheet_photo_url', '65\nMarksheet Photo Link', 'Marksheet Photo Link'],
    marksheet: ['marksheetPhotoUrl', 'marksheet_photo_url', '65\nMarksheet Photo Link', 'Marksheet Photo Link'],
    caregiverSignature: ['signatureDataUrl', 'signature_data_url', '6\nSignature /\nThumb Impression', '6\nSignature / Thumb Impression', '72\nSignature Link', 'Signature Link'],
    signature: ['signatureDataUrl', 'signature_data_url', '6\nSignature /\nThumb Impression', '6\nSignature / Thumb Impression', '72\nSignature Link', 'Signature Link'],
  };

  const lookupFields = docTypeMap[rawDocType];
  if (!lookupFields) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'INVALID_DOC_TYPE',
        message: 'Invalid or unsupported document type. Supported: passbookPhoto, aadhaarCardPhoto, childPhoto, feeReceiptPhoto, marksheetPhoto, caregiverSignature.',
      },
      { status: 400, headers: ASSET_NO_STORE_HEADERS }
    );
  }

  // Retrieve raw record using caseworker role so internal attachment references are not stripped
  const result = await canonicalSubmissionAdapter.getSubmission(submissionId, 'caseworker');
  if (result.status === 'error' || !result.data) {
    return NextResponse.json(
      {
        status: 'error',
        code: result.code || 'NOT_FOUND',
        message: result.message || `Record ${submissionId} not found`,
      },
      { status: result.statusCode || 404, headers: ASSET_NO_STORE_HEADERS }
    );
  }

  const record = result.data;

  // Geographic scope enforcement
  const recordState = record.state || record['18\nState'] || record.demographics?.state || 'Maharashtra';
  const recordDistrict = record.district || record['19\nDistrict'] || record.demographics?.district || undefined;

  if (!isStateAuthorized(scope, recordState) || (recordDistrict && !isDistrictAuthorized(scope, recordState, recordDistrict))) {
    logSecurityEvent({
      actor: scope.userId,
      actorRole: scope.role,
      eventType: 'SCOPE_VIOLATION',
      outcome: 'DENY',
      targetResource: `${submissionId}:${rawDocType}`,
      scope: `state=${recordState},district=${recordDistrict || ''}`,
      details: 'Caller forbidden to access document attachment outside authorized geographic scope',
    });
    return NextResponse.json(
      {
        status: 'error',
        code: 'FORBIDDEN_SCOPE',
        message: `Access denied to records and documents in state "${recordState}".`,
      },
      { status: 403, headers: ASSET_NO_STORE_HEADERS }
    );
  }

  // Find document value across mapped fields and nested structures
  let docValue: any = null;
  for (const field of lookupFields) {
    if (record[field]) {
      docValue = record[field];
      break;
    }
  }

  // Check nested payload objects if not found at root
  if (!docValue) {
    const banking = record.bankingAndKyc || record.bankDetails;
    const edu = record.educationExpenses || record.education;
    const consent = record.caregiverConsent || record.consent;

    if (rawDocType.includes('passbook') && banking?.passbookPhotoUrl) docValue = banking.passbookPhotoUrl;
    else if (rawDocType.includes('aadhaar') && banking?.aadhaarCardPhotoUrl) docValue = banking.aadhaarCardPhotoUrl;
    else if ((rawDocType.includes('childPhoto') || rawDocType.includes('photo')) && banking?.childPhotoUrl) docValue = banking.childPhotoUrl;
    else if (rawDocType.includes('feeReceipt') && edu?.feeReceiptPhotoUrl) docValue = edu.feeReceiptPhotoUrl;
    else if (rawDocType.includes('marksheet') && edu?.marksheetPhotoUrl) docValue = edu.marksheetPhotoUrl;
    else if (rawDocType.includes('signature') && consent?.signatureDataUrl) docValue = consent.signatureDataUrl;
  }

  // Handle case where document is missing or placeholder
  const trimmedDoc = typeof docValue === 'string' ? docValue.trim() : '';
  if (
    !docValue ||
    docValue === 'Restricted Document' ||
    docValue === '—' ||
    docValue === '-' ||
    trimmedDoc === 'DATA_URL_STORED_PENDING_AUTH' ||
    trimmedDoc.toLowerCase() === 'data_url_stored_pending_auth'
  ) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'DOCUMENT_NOT_FOUND',
        message: `No ${rawDocType} document is attached to this assessment record.`,
      },
      { status: 404, headers: ASSET_NO_STORE_HEADERS }
    );
  }

  logSecurityEvent({
    actor: scope.userId,
    actorRole: scope.role,
    eventType: 'RECORD_ACCESSED',
    outcome: 'ALLOW',
    targetResource: `${submissionId}:${rawDocType}`,
    details: `Document ${rawDocType} served to ${scope.name} (${scope.role})`,
  });

  let targetRef = typeof docValue === 'string' ? docValue.trim() : JSON.stringify(docValue);

  // Unwrap formula if stored as =HYPERLINK("...", "...")
  if (targetRef.startsWith('=')) {
    const urlMatch = targetRef.match(/=HYPERLINK\(\s*["']([^"']+)["']/i);
    if (urlMatch && urlMatch[1].trim()) {
      targetRef = urlMatch[1].trim();
    }
  }

  // 1. Handle SVG Data URL
  if (targetRef.startsWith('data:image/svg+xml')) {
    const commaIndex = targetRef.indexOf(',');
    const encodedSvg = commaIndex !== -1 ? targetRef.substring(commaIndex + 1) : '';
    const svgText = targetRef.includes(';base64,')
      ? Buffer.from(encodedSvg, 'base64').toString('utf8')
      : decodeURIComponent(encodedSvg);

    return new Response(svgText, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(svgText, 'utf8')),
        'Content-Disposition': `inline; filename="${rawDocType}.svg"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        ...ASSET_NO_STORE_HEADERS,
      },
    });
  }

  // 2. Handle Binary Image Data URLs (PNG, JPEG, WebP, GIF)
  if (targetRef.startsWith('data:image/')) {
    const mimeMatch = targetRef.match(/^data:(image\/[a-zA-Z0-9\+\-\.]+)(;charset=[^;]+)?(;base64)?,(.+)$/i);
    if (mimeMatch) {
      const mime = mimeMatch[1].toLowerCase();
      const isBase64 = Boolean(mimeMatch[3]);
      const rawData = mimeMatch[4];
      const buffer = isBase64 ? Buffer.from(rawData, 'base64') : Buffer.from(decodeURIComponent(rawData), 'utf8');
      const ext = ALLOWED_MIME_TYPES[mime] || mime.split('/')[1] || 'png';
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(buffer.length),
          'Content-Disposition': `inline; filename="${rawDocType}.${ext}"`,
          'X-Content-Type-Options': 'nosniff',
          ...ASSET_NO_STORE_HEADERS,
        },
      });
    }
  }

  // 3. Handle PDF Data URL
  if (targetRef.startsWith('data:application/pdf')) {
    const commaIndex = targetRef.indexOf(',');
    const base64Data = commaIndex !== -1 ? targetRef.substring(commaIndex + 1) : targetRef;
    const isBase64 = targetRef.substring(0, commaIndex !== -1 ? commaIndex : undefined).includes(';base64');
    const buffer = isBase64 ? Buffer.from(base64Data, 'base64') : Buffer.from(decodeURIComponent(base64Data), 'utf8');
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename="${rawDocType}.pdf"`,
        'X-Content-Type-Options': 'nosniff',
        ...ASSET_NO_STORE_HEADERS,
      },
    });
  }

  // 4. Handle Raw SVG text starting with <svg
  if (targetRef.trim().startsWith('<svg')) {
    const svgTrimmed = targetRef.trim();
    return new Response(svgTrimmed, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(svgTrimmed, 'utf8')),
        'Content-Disposition': `inline; filename="${rawDocType}.svg"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        ...ASSET_NO_STORE_HEADERS,
      },
    });
  }

  // 5. Handle Tigris / S3 private protocol URI (e.g. asset://, storage://, s3://, urn:asset:)
  if (
    targetRef.startsWith('asset://') ||
    targetRef.startsWith('storage://') ||
    targetRef.startsWith('s3://') ||
    targetRef.startsWith('urn:asset:')
  ) {
    const bucket = process.env.S3_BUCKET_NAME || process.env.TIGRIS_BUCKET;
    const hasS3Config = Boolean(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      bucket
    );

    if (!hasS3Config) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'STORAGE_UNCONFIGURED',
          message: 'Document preview unavailable: Private Tigris/S3 object storage is not configured (missing AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, or S3_BUCKET_NAME/TIGRIS_BUCKET).',
          prerequisite: 'Configure Tigris/S3 credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME or TIGRIS_BUCKET) in server environment.',
        },
        { status: 503, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: process.env.AWS_REGION || 'auto',
        endpoint: process.env.AWS_ENDPOINT_URL_S3,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      let key = targetRef.replace(/^(asset|storage|s3|urn:asset):\/\/?/, '');
      if (bucket && key.startsWith(`${bucket}/`)) {
        key = key.substring(bucket.length + 1);
      }

      const s3Res = await s3.send(new GetObjectCommand({ Bucket: bucket!, Key: key }));
      if (!s3Res.Body) {
        return NextResponse.json(
          {
            status: 'error',
            code: 'STORAGE_EMPTY',
            message: 'Document preview unavailable: Object is empty in storage.',
          },
          { status: 404, headers: ASSET_NO_STORE_HEADERS }
        );
      }

      const bytes = await s3Res.Body.transformToByteArray();
      const contentType = s3Res.ContentType || 'application/octet-stream';
      const ext = ALLOWED_MIME_TYPES[contentType] || contentType.split('/')[1] || 'bin';

      return new Response(Buffer.from(bytes), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(bytes.length),
          'Content-Disposition': `inline; filename="${rawDocType}.${ext}"`,
          'X-Content-Type-Options': 'nosniff',
          ...ASSET_NO_STORE_HEADERS,
        },
      });
    } catch (err: any) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'STORAGE_RETRIEVAL_FAILED',
          message: `Document preview unavailable: Failed to retrieve object from private storage (${err?.message || 'Storage error'}).`,
          prerequisite: 'Verify S3/Tigris bucket name and object key exist.',
        },
        { status: 502, headers: ASSET_NO_STORE_HEADERS }
      );
    }
  }

  // 6. Handle HTTP/HTTPS URLs (e.g. from Google Drive or remote storage)
  if (targetRef.startsWith('http://') || targetRef.startsWith('https://')) {
    return await fetchTrustedRemoteAsset(targetRef, rawDocType);
  }

  // 7. Unsupported / Missing document reference format
  return NextResponse.json(
    {
      status: 'error',
      code: 'DOCUMENT_UNAVAILABLE',
      message: `Document preview unavailable: The attached document reference ("${targetRef.substring(0, 40)}") does not contain retrievable document bytes or a supported storage URL.`,
      prerequisite: 'A valid uploaded document (image or PDF) is required.',
    },
    { status: 404, headers: ASSET_NO_STORE_HEADERS }
  );
}

const TRUSTED_DOMAINS = [
  'drive.google.com',
  'docs.google.com',
  'storage.googleapis.com',
  'googleusercontent.com',
];

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

function isPrivateOrLoopbackIp(hostname: string): boolean {
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (hostname === '0.0.0.0') return true;
  if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) return true;
  return false;
}

function isDomainAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // In test environment, allow localhost / 127.0.0.1 for synthetic mock servers
  if (process.env.NODE_ENV === 'test' && (lower === 'localhost' || lower === '127.0.0.1')) {
    return true;
  }

  // Deny private IP addresses
  if (isPrivateOrLoopbackIp(lower)) {
    return false;
  }

  // Exact match on trusted domains
  if (TRUSTED_DOMAINS.includes(lower)) {
    return true;
  }

  // Google User Content subdomains (e.g. lh3.googleusercontent.com)
  if (lower.endsWith('.googleusercontent.com')) {
    return true;
  }

  // Tigris / Fly object storage endpoints
  if (lower.endsWith('.tigris.dev') || lower.endsWith('.fly.storage.tigris.dev')) {
    return true;
  }

  // AWS S3 endpoints
  if (lower.endsWith('.amazonaws.com')) {
    return true;
  }

  // Custom allowed domains from environment if configured
  if (process.env.ALLOWED_ASSET_DOMAINS) {
    const customAllowed = process.env.ALLOWED_ASSET_DOMAINS.split(',').map((d) => d.trim().toLowerCase());
    if (customAllowed.includes(lower) || customAllowed.some((d) => lower.endsWith(`.${d}`))) {
      return true;
    }
  }

  return false;
}

function normalizeRemoteAssetUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.toLowerCase() === 'drive.google.com') {
      let fileId = parsed.searchParams.get('id');
      if (!fileId) {
        const fileMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileMatch) {
          fileId = fileMatch[1];
        }
      }
      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      }
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

async function fetchTrustedRemoteAsset(
  initialUrl: string,
  rawDocType: string
): Promise<Response> {
  let currentUrl = normalizeRemoteAssetUrl(initialUrl);

  for (let hop = 0; hop < 4; hop++) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      return NextResponse.json(
        {
          status: 'error',
          code: 'MALFORMED_URL',
          message: 'Document preview unavailable: Malformed upstream storage URL.',
        },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    // Protocol check
    if (parsedUrl.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && parsedUrl.protocol === 'http:')) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'INSECURE_PROTOCOL',
          message: 'Document preview unavailable: Storage URL must use HTTPS.',
        },
        { status: 403, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    // Domain and SSRF check
    if (!isDomainAllowed(parsedUrl.hostname)) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNTRUSTED_REMOTE_HOST',
          message: `Document preview unavailable: Domain "${parsedUrl.hostname}" is not in the trusted storage allowlist.`,
          prerequisite: 'Upstream documents must reside on trusted Google Drive or Tigris/S3 storage.',
        },
        { status: 403, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let res: globalThis.Response;
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Alliance-Childcare-PWA-AssetStreamer/3.0',
          Accept: 'image/jpeg,image/png,image/webp,image/svg+xml,application/pdf;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err?.name === 'AbortError';
      return NextResponse.json(
        {
          status: 'error',
          code: isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FETCH_FAILED',
          message: isTimeout
            ? 'Document preview unavailable: Timed out waiting for upstream storage response (8000ms).'
            : `Document preview unavailable: Could not reach upstream storage (${err?.message || 'Network error'}).`,
          prerequisite: 'Upstream storage server must be reachable.',
        },
        { status: isTimeout ? 504 : 502, headers: ASSET_NO_STORE_HEADERS }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle redirects manually to enforce SSRF checks on every hop
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        return NextResponse.json(
          {
            status: 'error',
            code: 'INVALID_REDIRECT',
            message: 'Document preview unavailable: Upstream redirect contained no Location header.',
          },
          { status: 502, headers: ASSET_NO_STORE_HEADERS }
        );
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UPSTREAM_FILE_UNAVAILABLE',
          message: `Document preview unavailable: Upstream storage responded with HTTP ${res.status}.`,
          prerequisite: 'Verify file exists in remote storage and appropriate permissions are granted.',
        },
        { status: res.status >= 500 ? 502 : res.status, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    // Validate Content-Type
    const rawContentType = (res.headers.get('Content-Type') || '').toLowerCase();
    const cleanContentType = rawContentType.split(';')[0].trim();

    if (cleanContentType === 'text/html') {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UPSTREAM_AUTH_REQUIRED',
          message: 'Document preview unavailable: Upstream storage returned HTML or login page instead of document bytes.',
          prerequisite: 'Google Drive service account or S3 credentials required to access private document links.',
        },
        { status: 502, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const matchedExt = ALLOWED_MIME_TYPES[cleanContentType];
    if (!matchedExt) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: `Document preview unavailable: Upstream file content type "${cleanContentType}" is not a supported document format (allowed: JPEG, PNG, WebP, SVG, PDF).`,
          prerequisite: 'Documents must be uploaded as image or PDF files.',
        },
        { status: 415, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    // Size limit check
    const contentLength = res.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > 15 * 1024 * 1024) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'ASSET_TOO_LARGE',
          message: 'Document preview unavailable: Remote document exceeds the maximum 15MB size limit.',
        },
        { status: 413, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > 15 * 1024 * 1024) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'ASSET_TOO_LARGE',
          message: 'Document preview unavailable: Remote document exceeds the maximum 15MB size limit.',
        },
        { status: 413, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': cleanContentType,
      'Content-Length': String(buffer.length),
      'Content-Disposition': `inline; filename="${rawDocType}.${matchedExt}"`,
      'X-Content-Type-Options': 'nosniff',
      ...ASSET_NO_STORE_HEADERS,
    };

    if (cleanContentType === 'image/svg+xml') {
      headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    }

    return new Response(buffer, {
      status: 200,
      headers,
    });
  }

  return NextResponse.json(
    {
      status: 'error',
      code: 'TOO_MANY_REDIRECTS',
      message: 'Document preview unavailable: Exceeded maximum allowed redirects (3).',
    },
    { status: 502, headers: ASSET_NO_STORE_HEADERS }
  );
}

/**
 * PUT /api/submissions/[submissionId]/asset
 *
 * Two-phase commit document replacement endpoint with OCC revision guard.
 * Replaces an existing document slot, increments record revision, and preserves
 * historical assets in the container revision folder as SUPERSEDED.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const requestId = `req-replace-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const scope = await resolveUserAccessScope(req);
    if (!scope.isVerified) {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: 'Unverified caller denied on PUT /api/submissions/[submissionId]/asset',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Authentication required to replace submission assets.',
          requestId,
        },
        { status: 401, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    if (scope.role !== 'ADMIN') {
      logSecurityEvent({
        actor: scope.userId,
        actorRole: scope.role,
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        targetResource: submissionId,
        details: `Caller role '${scope.role}' forbidden to replace assets under Model A policy`,
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Asset replacement is restricted to verified Administrator role.',
          requestId,
        },
        { status: 403, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON body' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const { docType, slotPrefix, fileData, fileDataUrl, expectedRevision, expectedVersion, simulatePointerMismatch } = rawBody || {};

    const targetDocType = docType || slotPrefix;
    if (!targetDocType || typeof targetDocType !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required field: docType or slotPrefix' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const targetFileData = fileData || fileDataUrl;
    if (!targetFileData || typeof targetFileData !== 'string') {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required field: fileData or fileDataUrl' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    const targetRevision = expectedRevision !== undefined ? expectedRevision : expectedVersion;
    if (targetRevision === undefined || targetRevision === null || typeof targetRevision !== 'number' || !Number.isInteger(targetRevision) || targetRevision < 1) {
      return NextResponse.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing or invalid required field: expectedRevision (must be positive integer)' },
        { status: 400, headers: ASSET_NO_STORE_HEADERS }
      );
    }

    // Verify geographic scope if not wildcard
    if (!scope.allowedStates.includes('*') || !scope.allowedDistricts.includes('*')) {
      const existing = await canonicalSubmissionAdapter.getSubmission(submissionId, 'supervisor');
      if (existing.status === 'success' && existing.data) {
        const recordState = existing.data.state || existing.data['18\nState'] || existing.data.demographics?.state || 'Maharashtra';
        const recordDistrict = existing.data.district || existing.data['19\nDistrict'] || existing.data.demographics?.district || undefined;
        if (!isStateAuthorized(scope, recordState) || (recordDistrict && !isDistrictAuthorized(scope, recordState, recordDistrict))) {
          logSecurityEvent({
            actor: scope.userId,
            actorRole: scope.role,
            eventType: 'SCOPE_VIOLATION',
            outcome: 'DENY',
            targetResource: submissionId,
            scope: `state=${recordState},district=${recordDistrict || ''}`,
            details: 'Caller forbidden to replace asset outside authorized geographic scope',
          });
          return NextResponse.json(
            {
              status: 'error',
              code: 'FORBIDDEN_SCOPE',
              message: `Access denied to replace assets for records in state "${recordState}".`,
              requestId,
            },
            { status: 403, headers: ASSET_NO_STORE_HEADERS }
          );
        }
      }
    }

    const result = await canonicalSubmissionAdapter.replaceAsset({
      submissionId,
      docType: targetDocType,
      fileData: targetFileData,
      expectedRevision: targetRevision,
      requestId,
      simulatePointerMismatch: !!simulatePointerMismatch,
    });

    if (result.status === 'error' || result.status === 'conflict') {
      return NextResponse.json(
        {
          status: result.status,
          code: result.code || (result.status === 'conflict' ? 'OCC_CONFLICT' : 'UPSTREAM_FAILURE'),
          message: result.message || 'Failed to replace asset',
          requestId,
        },
        { status: result.statusCode || (result.status === 'conflict' ? 409 : 500), headers: ASSET_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        acknowledged: true,
        submissionId: result.remoteSubmissionId || submissionId,
        uniqueId: result.uniqueId || submissionId,
        slotPrefix: result.docType || targetDocType,
        docType: result.docType || targetDocType,
        cellFormula: result.cellFormula,
        newFileId: (result as any).newFileId,
        previousFileId: (result as any).previousFileId,
        newRevision: result.version || result.revisionNumber,
        revisionNumber: result.version || result.revisionNumber,
        oldAssetStatus: (result as any).oldAssetStatus || 'SUPERSEDED',
        updatedAt: result.updatedAt,
        requestId,
      },
      { status: 200, headers: ASSET_NO_STORE_HEADERS }
    );
  } catch (err: any) {
    console.error('PUT /api/submissions/[submissionId]/asset error:', err?.message || 'Unknown error');
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error', requestId },
      { status: 500, headers: ASSET_NO_STORE_HEADERS }
    );
  }
}
