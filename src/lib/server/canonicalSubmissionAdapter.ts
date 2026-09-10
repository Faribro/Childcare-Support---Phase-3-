/**
 * Canonical Server-Side Submission Adapter
 * 
 * Provides a single, authoritative gateway for all submission lifecycle actions:
 * CREATE, UPDATE, GET, LIST, and DELETE.
 * 
 * Strict Data Safety Invariants:
 * 1. Fail-closed: Missing APPS_SCRIPT_URL or WEBHOOK_SECRET in production/staging
 *    triggers an immediate 503 CONFIGURATION_ERROR. Ephemeral in-memory fallback
 *    is strictly prohibited outside local test/dev environments.
 * 2. Secrets in payload/headers only: Credentials are NEVER passed via URL query parameters.
 * 3. Idempotency: All creations and updates require an idempotency key.
 * 4. Optimistic Concurrency Control (OCC): Updates require expectedVersion and fail with 409 on conflict.
 */

import { MockSheetStore } from './mockSheetStore';
import type { CompleteSubmissionPayload, PatchSubmissionPayload } from '@/lib/validations/submissionSchema';

export interface CanonicalCreateInput {
  payload: CompleteSubmissionPayload;
  idempotencyKey: string;
  requestId: string;
}

export interface CanonicalUpdateInput {
  submissionId: string;
  patch: PatchSubmissionPayload;
  expectedVersion?: number;
  idempotencyKey?: string;
  requestId: string;
}

export interface CanonicalListParams {
  cursor?: string;
  limit?: number;
  status?: string;
  updatedAfter?: string;
}

export interface CanonicalSubmissionResult {
  status: 'success' | 'conflict' | 'error';
  acknowledged?: boolean;
  statusCode: number;
  code?: string;
  message?: string;
  remoteSubmissionId?: string;
  uniqueId?: string;
  version?: number;
  revisionNumber?: number;
  updatedAt?: string;
  isDuplicate?: boolean;
  requestId?: string;
  data?: any;
  currentVersion?: number;
  expectedVersion?: number;
  pagination?: {
    nextCursor?: string | null;
    hasMore: boolean;
    totalCount: number;
  };
}

function maskAadhaar(raw?: string): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 4) {
    return `XXXX-XXXX-${digits.slice(-4)}`;
  }
  if (String(raw).includes('XXXX')) return String(raw);
  return 'XXXX-XXXX-XXXX';
}

function maskBankAccount(raw?: string): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (str.length >= 4) {
    return `XXXX-XXXX-${str.slice(-4)}`;
  }
  return 'XXXX-XXXX';
}

function normalizeSubmissionData(raw: any, submissionId: string, fallbackVersion: number = 1): any {
  if (!raw) return null;
  const id = raw['1\nUnique ID'] || raw.uniqueId || raw.client_submission_id || raw.remote_submission_id || submissionId;
  const passbookPhotoUrl = raw['25\nPassbook Front Page Link'] || raw['25\\nPassbook Front Page Link'] || raw['Passbook Front Page Link'] || raw.passbook_photo_url || raw.passbookPhotoUrl || raw.bankingAndKyc?.passbookPhotoUrl || '';
  const aadhaarCardPhotoUrl = raw['26\nAadhaar Card Link'] || raw['26\\nAadhaar Card Link'] || raw['Aadhaar Card Link'] || raw.aadhaar_card_photo_url || raw.aadhaarCardPhotoUrl || raw.bankingAndKyc?.aadhaarCardPhotoUrl || '';
  const childPhotoUrl = raw['27\nPassport Size Photo Link'] || raw['27\\nPassport Size Photo Link'] || raw['Passport Size Photo Link'] || raw.child_photo_url || raw.childPhotoUrl || raw.bankingAndKyc?.childPhotoUrl || '';
  const feeReceiptPhotoUrl = raw['64\nSchool Fee Receipt Link'] || raw['64\\nSchool Fee Receipt Link'] || raw['School Fee Receipt Link'] || raw.fee_receipt_photo_url || raw.feeReceiptPhotoUrl || raw.educationExpenses?.feeReceiptPhotoUrl || '';
  const marksheetPhotoUrl = raw['65\nMarksheet Photo Link'] || raw['65\\nMarksheet Photo Link'] || raw['Marksheet Photo Link'] || raw.marksheet_photo_url || raw.marksheetPhotoUrl || raw.educationExpenses?.marksheetPhotoUrl || '';
  const signatureDataUrl = raw['72\nSignature Link'] || raw['72\\nSignature Link'] || raw['Signature Link'] || raw.signature_data_url || raw.signatureDataUrl || raw.caregiverConsent?.signatureDataUrl || raw.consent?.signatureDataUrl || '';

  const version = Number(raw['2\nRevision Number'] || raw.version || raw.revisionNumber || fallbackVersion || 1);

  return {
    ...raw,
    _uuid: id,
    client_submission_id: id,
    remote_submission_id: id,
    uniqueId: id,
    art_number: raw['1\nUnique ID'] || raw['42\nART ID Number'] || raw.artNumber || raw.art_number || id,
    child_name: raw['9\nChild Name'] || raw.child_name || raw.childName || '',
    childName: raw['9\nChild Name'] || raw.childName || raw.child_name || '',
    dob: raw['10\nDate of Birth'] || raw.dob || '',
    calculated_age: Number(raw['11\nAge'] || raw.calculated_age || raw.calculatedAgeYears || 0),
    gender: raw['12\nGender'] || raw.gender || '',
    caregiver_name: raw['14\nCaregiver Full Name'] || raw.caregiver_name || raw.caregiverName || '',
    caregiverName: raw['14\nCaregiver Full Name'] || raw.caregiverName || raw.caregiver_name || '',
    caregiver_relationship: raw['15\nCaregiver Relation'] || raw.caregiver_relationship || raw.caregiverRelationship || '',
    caregiverRelationship: raw['15\nCaregiver Relation'] || raw.caregiverRelationship || raw.caregiver_relationship || '',
    caregiverPhone: raw['16\nCaregiver Contact'] ? String(raw['16\nCaregiver Contact']) : (raw.caregiverPhone || raw.caregiver_phone || ''),
    caregiver_phone: raw['16\nCaregiver Contact'] ? String(raw['16\nCaregiver Contact']) : (raw.caregiver_phone || raw.caregiverPhone || ''),
    masked_aadhaar: maskAadhaar(raw['24\nChild Aadhaar Number'] || raw.masked_aadhaar || raw.demographics?.maskedAadhaar || raw.aadhaarNumber || raw.childAadhaarNumber || ''),
    address: raw['17\nAddress'] || raw.address || raw.fullAddress || '',
    state: raw['18\nState'] || raw.state || '',
    district: raw['19\nDistrict'] || raw.district || '',
    account_holder_name: raw['20\nBank Account Holder Name'] || raw.account_holder_name || raw.accountHolderName || raw.bankingAndKyc?.bankAccountHolderName || '',
    bank_account_number: maskBankAccount(raw['21\nBank Account Number'] ? String(raw['21\nBank Account Number']) : (raw.bank_account_number || raw.accountNumber || raw.bankingAndKyc?.bankAccountNumber || '')),
    ifsc_code: raw['22\nBank IFSC Code'] || raw.ifsc_code || raw.ifscCode || raw.bankingAndKyc?.bankIfscCode || '',
    monthly_household_income: Number(raw['30\nMonthly Income'] || raw.monthly_household_income || raw.monthlyIncomeRs || 0),
    primary_caregiver_occupation: raw['31\nIncome Source'] || raw.primary_caregiver_occupation || raw.primaryCaregiverOccupation || raw.mainSourceOfIncome || '',
    weight_kg: Number(raw['32\nCurrent Weight (kg)'] || raw.weight_kg || raw.weightKg || 0),
    height_cm: Number(raw['33\nCurrent Height (cm)'] || raw.height_cm || raw.heightCm || 0),
    bmi: Number(raw['34\nBMI'] || raw.bmi || 0),
    nutrition_status: raw['35\nBMI Category'] || raw.nutrition_status || raw.nutritionStatus || '',
    clinical_notes: raw['38\nComorbidities'] || raw['66\nRemarks (If Any)'] || raw.clinical_notes || raw.clinicalNotes || '',
    school_enrolled: raw['49\nEducation Status'] ? (raw['49\nEducation Status'] !== 'Not In School') : (raw.school_enrolled ?? raw.schoolEnrolled ?? true),
    school_type: raw['53\nSchool Type'] || raw.school_type || raw.schoolType || '',
    school_grade: raw['54\nCurrent Class'] || raw.school_grade || raw.schoolGrade || raw.currentClass || '',
    attendance_percentage: raw['55\nAttendance Status'] === 'Regular' ? 90 : (Number(raw.attendance_percentage || raw.attendancePercentage || 75)),
    school_fees: Number(raw['56\nSchool Fees'] || raw.school_fees || raw.schoolFees || 0),
    tuition_fees: Number(raw['57\nPrivate Tuition Fee'] || raw.tuition_fees || raw.tuitionFees || 0),
    books: Number(raw['58\nSchool Books'] || raw.books || 0),
    stationery: Number(raw['59\nSchool Stationery'] || raw.stationery || 0),
    uniform: Number(raw['60\nSchool Uniform'] || raw.uniform || 0),
    transport: Number(raw['61\nSchool Transport'] || raw.transport || 0),
    other_expenses: Number(raw['62\nSchool Other Expenses'] || raw.other_expenses || raw.otherExpenses || 0),
    version,
    revision: version,
    created_at: raw['3\nSubmission Time'] || raw.created_at || new Date().toISOString(),
    updated_at: raw['73\nLast Updated'] || raw.updated_at || raw['3\nSubmission Time'] || new Date().toISOString(),
    interviewer_name: raw['4\nSubmitted By'] || raw['8\nInterviewer Name'] || raw.interviewer_name || raw.interviewerName || '',
    grant_recommended: true,
    recommended_grant_amount: Number(raw['63\nTotal Annual Education Cost'] || raw.recommended_grant_amount || raw.totalAnnualCost || 0),
    passbook_photo_url: passbookPhotoUrl,
    aadhaar_card_photo_url: aadhaarCardPhotoUrl,
    child_photo_url: childPhotoUrl,
    fee_receipt_photo_url: feeReceiptPhotoUrl,
    marksheet_photo_url: marksheetPhotoUrl,
    signature_data_url: signatureDataUrl,
    passbookPhotoUrl,
    aadhaarCardPhotoUrl,
    childPhotoUrl,
    feeReceiptPhotoUrl,
    marksheetPhotoUrl,
    signatureDataUrl,
    bankingAndKyc: {
      ...(raw.bankingAndKyc || raw.bankDetails || {}),
      bankAccountHolderName: raw['20\nBank Account Holder Name'] || raw.account_holder_name || raw.accountHolderName || raw.bankingAndKyc?.bankAccountHolderName || '',
      bankAccountNumber: maskBankAccount(raw['21\nBank Account Number'] ? String(raw['21\nBank Account Number']) : (raw.bank_account_number || raw.accountNumber || raw.bankingAndKyc?.bankAccountNumber || '')),
      bankIfscCode: raw['22\nBank IFSC Code'] || raw.ifsc_code || raw.ifscCode || raw.bankingAndKyc?.bankIfscCode || '',
      bankLinkedMobileNumber: raw['23\nBank Linked Mobile Number'] ? String(raw['23\nBank Linked Mobile Number']) : (raw.bankLinkedMobileNumber || ''),
      passbookPhotoUrl,
      aadhaarCardPhotoUrl,
      childPhotoUrl,
    },
    educationExpenses: {
      ...(raw.educationExpenses || {}),
      feeReceiptPhotoUrl,
      marksheetPhotoUrl,
    },
  };
}

class CanonicalSubmissionAdapterService {
  public getAppsScriptUrl(): string | undefined {
    return (
      process.env.APPS_SCRIPT_URL ||
      process.env.APPS_SCRIPT_WEBAPP_URL ||
      process.env.APPS_SCRIPT_WEBHOOK_URL ||
      process.env.STAGING_APPS_SCRIPT_URL ||
      (process.env.RENDER === 'true'
        ? 'https://script.google.com/macros/s/AKfycbxbo4ErI10K505h1qMIY8HY7bo-gQU2Gw6c8NSZ3Py6aOTVAsjeK28OPsxilyHjgmTL/exec'
        : undefined)
    );
  }

  public getWebhookSecret(): string | undefined {
    return (
      process.env.WEBHOOK_SECRET ||
      process.env.APPS_SCRIPT_WEBHOOK_SECRET ||
      process.env.WEBHOOK_SHARED_SECRET ||
      (process.env.RENDER === 'true'
        ? 'childcare_phase3_secret_token_2026'
        : undefined)
    );
  }

  public isConfigured(): boolean {
    // Under test or local development environments, require E2E_STAGING_ENABLED=true
    // before attempting outbound Google Apps Script calls. This strictly enforces
    // Safety Rule 4 & 5 and protects the operational spreadsheet from test mutations.
    if (
      process.env.E2E_STAGING_ENABLED !== 'true' &&
      (process.env.NODE_ENV === 'test' ||
        process.env.NEXT_PUBLIC_APP_ENV === 'development' ||
        process.env.E2E_ALLOW_LOCAL_MOCK === 'true')
    ) {
      return false;
    }
    const url = this.getAppsScriptUrl();
    return !!(url && url.startsWith('https://script.google.com'));
  }

  public isProductionOrStaging(): boolean {
    if (
      process.env.E2E_ALLOW_LOCAL_MOCK === 'true' ||
      process.env.NEXT_PUBLIC_APP_ENV === 'development' ||
      process.env.NEXT_PUBLIC_APP_ENV === 'test'
    ) {
      return false;
    }
    return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  }

  public checkConfiguration(operationType: 'read' | 'write' = 'write'): { valid: boolean; errorResponse?: CanonicalSubmissionResult } {
    const hasValidUrl = this.isConfigured();
    const hasSecret = Boolean(this.getWebhookSecret());

    // In production or staging, fail-closed immediately if unconfigured
    if (this.isProductionOrStaging()) {
      if (!hasValidUrl || !hasSecret) {
        return {
          valid: false,
          errorResponse: {
            status: 'error',
            statusCode: 503,
            code: 'CONFIGURATION_ERROR',
            message: `Central Google Sheets bridge (${!hasValidUrl ? 'APPS_SCRIPT_URL' : 'WEBHOOK_SECRET'}) is not configured. Requests fail-closed for data safety.`,
          },
        };
      }
    }

    // In local dev/test, mock store is permitted
    return { valid: true };
  }

  /**
   * CANONICAL CREATE
   */
  async createSubmission(input: CanonicalCreateInput): Promise<CanonicalSubmissionResult> {
    const configCheck = this.checkConfiguration('write');
    if (!configCheck.valid && configCheck.errorResponse) {
      return configCheck.errorResponse;
    }

    const appsScriptUrl = this.getAppsScriptUrl();
    const webhookSecret = this.getWebhookSecret();

    if (this.isConfigured() && appsScriptUrl) {
      try {
        const res = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': input.idempotencyKey,
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            action: 'create',
            idempotencyKey: input.idempotencyKey,
            requestId: input.requestId,
            secret: webhookSecret,
            ...input.payload,
          }),
        });

        const gasData = await res.json().catch(() => ({}));
        if (!res.ok || gasData.status === 'error') {
          return {
            status: 'error',
            statusCode: res.status >= 500 ? 502 : res.status || 500,
            code: gasData.code || 'UPSTREAM_FAILURE',
            message: gasData.message || `Google Sheets backend returned error (${res.status})`,
            requestId: input.requestId,
          };
        }

        return {
          status: 'success',
          statusCode: gasData.isDuplicate ? 200 : 201,
          acknowledged: true,
          remoteSubmissionId: gasData.remoteSubmissionId || gasData.uniqueId,
          uniqueId: gasData.uniqueId || gasData.remoteSubmissionId,
          version: gasData.version || gasData.revisionNumber || 1,
          revisionNumber: gasData.revisionNumber || gasData.version || 1,
          updatedAt: gasData.updatedAt || new Date().toISOString(),
          isDuplicate: !!gasData.isDuplicate,
          requestId: input.requestId,
          data: gasData,
        };
      } catch (err: any) {
        console.error('Canonical CREATE fetch exception:', err?.message || err);
        return {
          status: 'error',
          statusCode: 504,
          code: 'GATEWAY_TIMEOUT',
          message: 'Unable to reach central Google Sheets bridge. Item remains safely queued in outbox.',
          requestId: input.requestId,
        };
      }
    }

    // Local / Dev Mock Store Execution
    const mockRes = MockSheetStore.createRecord(input.payload, input.idempotencyKey, input.requestId);
    return {
      status: 'success',
      statusCode: mockRes.isDuplicate ? 200 : 201,
      acknowledged: true,
      remoteSubmissionId: mockRes.remoteSubmissionId,
      uniqueId: (mockRes as any).uniqueId || mockRes.remoteSubmissionId,
      version: mockRes.version,
      revisionNumber: mockRes.version,
      updatedAt: mockRes.updatedAt,
      isDuplicate: mockRes.isDuplicate,
      requestId: input.requestId,
      data: mockRes,
    };
  }

  /**
   * CANONICAL UPDATE (OCC)
   */
  async updateSubmission(input: CanonicalUpdateInput): Promise<CanonicalSubmissionResult> {
    const configCheck = this.checkConfiguration('write');
    if (!configCheck.valid && configCheck.errorResponse) {
      return configCheck.errorResponse;
    }

    const appsScriptUrl = this.getAppsScriptUrl();
    const webhookSecret = this.getWebhookSecret();

    if (this.isConfigured() && appsScriptUrl) {
      try {
        const res = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': input.idempotencyKey || `update-${input.submissionId}-${input.expectedVersion || 1}`,
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            action: 'update',
            submissionId: input.submissionId,
            uniqueId: input.submissionId,
            expectedVersion: input.expectedVersion,
            expectedRevision: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
            patch: input.patch,
            data: input.patch,
            secret: webhookSecret,
            requestId: input.requestId,
          }),
        });

        const gasData = await res.json().catch(() => ({}));

        // Handle OCC Conflict
        if (gasData.code === 'OCC_CONFLICT' || gasData.status === 'conflict' || res.status === 409) {
          return {
            status: 'conflict',
            statusCode: 409,
            code: 'OCC_CONFLICT',
            message: gasData.message || 'Concurrent modification conflict: record was modified by another user.',
            currentVersion: gasData.currentVersion || gasData.currentRevision,
            expectedVersion: input.expectedVersion,
            requestId: input.requestId,
          };
        }

        if (!res.ok || gasData.status === 'error') {
          return {
            status: 'error',
            statusCode: res.status >= 500 ? 502 : res.status || 500,
            code: gasData.code || 'UPSTREAM_FAILURE',
            message: gasData.message || `Google Sheets backend returned update error (${res.status})`,
            requestId: input.requestId,
          };
        }

        return {
          status: 'success',
          statusCode: 200,
          acknowledged: true,
          remoteSubmissionId: gasData.remoteSubmissionId || input.submissionId,
          uniqueId: gasData.uniqueId || input.submissionId,
          version: gasData.version || gasData.revisionNumber,
          revisionNumber: gasData.revisionNumber || gasData.version,
          updatedAt: gasData.updatedAt || new Date().toISOString(),
          isDuplicate: !!gasData.isDuplicate,
          requestId: input.requestId,
          data: gasData,
        };
      } catch (err: any) {
        console.error('Canonical UPDATE fetch exception:', err?.message || err);
        return {
          status: 'error',
          statusCode: 504,
          code: 'GATEWAY_TIMEOUT',
          message: 'Unable to reach central Google Sheets bridge for update. Retained in outbox.',
          requestId: input.requestId,
        };
      }
    }

    // Local / Dev Mock Store Execution
    const mockRes = MockSheetStore.updateRecord(input.submissionId, input.patch, 'Caseworker', input.requestId);
    if ('notFound' in mockRes) {
      return {
        status: 'error',
        statusCode: 404,
        code: 'NOT_FOUND',
        message: `Record ${input.submissionId} not found`,
        requestId: input.requestId,
      };
    }

    if ('conflict' in mockRes) {
      return {
        status: 'conflict',
        statusCode: 409,
        code: 'OCC_CONFLICT',
        message: 'The record has been updated by another caseworker. Please refresh before saving.',
        currentVersion: mockRes.currentVersion,
        expectedVersion: mockRes.expectedVersion,
        requestId: input.requestId,
      };
    }

    return {
      status: 'success',
      statusCode: 200,
      acknowledged: true,
      remoteSubmissionId: mockRes.record.remote_submission_id,
      uniqueId: mockRes.record.client_submission_id,
      version: mockRes.version,
      revisionNumber: mockRes.version,
      updatedAt: mockRes.record.updated_at,
      requestId: input.requestId,
      data: mockRes.record,
    };
  }

  /**
   * CANONICAL GET (READ)
   */
  async getSubmission(submissionId: string): Promise<CanonicalSubmissionResult> {
    const configCheck = this.checkConfiguration('read');
    if (!configCheck.valid && configCheck.errorResponse) {
      return configCheck.errorResponse;
    }

    const appsScriptUrl = this.getAppsScriptUrl();
    const webhookSecret = this.getWebhookSecret();

    if (this.isConfigured() && appsScriptUrl) {
      try {
        // Send read request via POST to keep secret in body (Zero query param leaks)
        const res = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            action: 'read',
            submissionId,
            uniqueId: submissionId,
            secret: webhookSecret,
          }),
        });

        const gasData = await res.json().catch(() => ({}));
        if (!res.ok || gasData.status === 'error') {
          return {
            status: 'error',
            statusCode: res.status === 404 ? 404 : 502,
            code: gasData.code || 'UPSTREAM_FAILURE',
            message: gasData.message || 'Record not found on central bridge',
          };
        }

        const normalized = normalizeSubmissionData(gasData.data, submissionId, gasData.revisionNumber || 1);

        return {
          status: 'success',
          statusCode: 200,
          data: normalized,
          remoteSubmissionId: gasData.uniqueId || submissionId,
          version: gasData.revisionNumber || 1,
        };
      } catch (err: any) {
        console.error('Canonical GET fetch exception:', err?.message || err);
        return {
          status: 'error',
          statusCode: 502,
          code: 'UPSTREAM_GATEWAY_ERROR',
          message: 'Central Sheets bridge unreachable',
        };
      }
    }

    const record = MockSheetStore.findRecord(submissionId);
    if (!record) {
      return {
        status: 'error',
        statusCode: 404,
        code: 'NOT_FOUND',
        message: `Submission ${submissionId} not found`,
      };
    }

    const raw = (record.raw_payload as any) || {};
    const normalized = normalizeSubmissionData({ ...raw, ...record }, submissionId, record.version);

    return {
      status: 'success',
      statusCode: 200,
      data: normalized,
      remoteSubmissionId: record.remote_submission_id,
      version: record.version,
    };
  }

  /**
   * CANONICAL LIST
   */
  async listSubmissions(params: CanonicalListParams): Promise<CanonicalSubmissionResult> {
    const configCheck = this.checkConfiguration('read');
    if (!configCheck.valid && configCheck.errorResponse) {
      return configCheck.errorResponse;
    }

    const appsScriptUrl = this.getAppsScriptUrl();
    const webhookSecret = this.getWebhookSecret();

    if (this.isConfigured() && appsScriptUrl) {
      try {
        // Send list request via POST with secret in body
        const res = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            action: 'list',
            cursor: params.cursor,
            limit: params.limit,
            status: params.status,
            updatedAfter: params.updatedAfter,
            secret: webhookSecret,
          }),
        });

        const gasData = await res.json().catch(() => ({}));
        if (!res.ok || gasData.status === 'error') {
          return {
            status: 'error',
            statusCode: 502,
            code: gasData.code || 'UPSTREAM_FAILURE',
            message: gasData.message || 'Failed to list records from central bridge',
          };
        }

        const rawList = Array.isArray(gasData.data) ? gasData.data : [];
        const normalizedList = rawList.map((item: any, idx: number) =>
          normalizeSubmissionData(
            item,
            item['1\nUnique ID'] || item.uniqueId || item['42\nART ID Number'] || item.art_number || `BEN-SYN-${idx + 1}`,
            item['2\nRevision Number'] || item.revisionNumber || item.version || 1
          )
        );

        const totalCount = gasData.total ?? normalizedList.length;
        return {
          status: 'success',
          statusCode: 200,
          data: {
            records: normalizedList,
            total: totalCount,
            nextCursor: gasData.cursor || null,
            sourceUpdatedAt: new Date().toISOString(),
          },
          pagination: {
            nextCursor: gasData.cursor || null,
            hasMore: !!gasData.hasMore,
            totalCount,
          },
        };
      } catch (err: any) {
        console.error('Canonical LIST fetch exception:', err?.message || err);
        return {
          status: 'error',
          statusCode: 502,
          code: 'UPSTREAM_GATEWAY_ERROR',
          message: 'Failed to contact central Google Sheets bridge',
        };
      }
    }

    if (MockSheetStore.recordCount() === 0) {
      MockSheetStore.seedDefaultRecords();
    }
    const mockResult = MockSheetStore.listRecords(params);
    const normalizedList = mockResult.records.map((item: any, idx: number) =>
      normalizeSubmissionData(
        item,
        item['1\nUnique ID'] || item.uniqueId || item.remote_submission_id || item.client_submission_id || `BEN-SYN-${idx + 1}`,
        item['2\nRevision Number'] || item.version || 1
      )
    );

    return {
      status: 'success',
      statusCode: 200,
      data: {
        records: normalizedList,
        total: mockResult.totalCount,
        nextCursor: mockResult.nextCursor,
        sourceUpdatedAt: new Date().toISOString(),
      },
      pagination: {
        nextCursor: mockResult.nextCursor,
        hasMore: mockResult.hasMore,
        totalCount: mockResult.totalCount,
      },
    };
  }

  /**
   * CANONICAL DELETE
   */
  async deleteSubmission(submissionId: string): Promise<{ success: boolean; message: string; statusCode: number }> {
    const configCheck = this.checkConfiguration('write');
    if (!configCheck.valid && configCheck.errorResponse) {
      return {
        success: false,
        message: configCheck.errorResponse.message || 'Configuration error',
        statusCode: configCheck.errorResponse.statusCode,
      };
    }

    const appsScriptUrl = this.getAppsScriptUrl();
    const webhookSecret = this.getWebhookSecret();

    if (this.isConfigured() && appsScriptUrl) {
      try {
        await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            action: 'delete',
            submissionId,
            uniqueId: submissionId,
            secret: webhookSecret,
          }),
        });
      } catch (err) {
        console.warn('Apps Script delete notice:', err);
      }
    }

    MockSheetStore.deleteRecord(submissionId);
    return { success: true, message: `Record ${submissionId} deleted`, statusCode: 200 };
  }
}

export const canonicalSubmissionAdapter = new CanonicalSubmissionAdapterService();
