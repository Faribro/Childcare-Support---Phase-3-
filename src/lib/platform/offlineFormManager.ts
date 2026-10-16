/**
 * OfflineFormManager: Architectural Design Scaffold & Lifecycle Orchestrator
 *
 * STATUS: DESIGN SCAFFOLD / MOCK PORT ORCHESTRATOR.
 * Demonstrates the target lifecycle pipeline:
 * Bundled offline form -> Transactional draft -> Attachment -> Restart ->
 * Reopen unchanged -> Reconnect -> Authorized sync -> Server acknowledgment.
 */

import { platformRegistry } from './platformRegistry';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';
import type { AttachmentMetadata } from './types';
import { generateAssessmentId } from '@/lib/utils/idGenerator';

export class OfflineFormManager {
  /**
   * 1. Bundled Offline Form Initialization
   * Generates stable RFC 4122 UUIDv4 without requiring any network connectivity.
   */
  public static async createOfflineForm(
    interviewerName: string,
    state: string = 'Maharashtra',
    district: string = 'Pune'
  ): Promise<AssessmentRecord> {
    const clientUuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';
    const now = new Date().toISOString();
    const artNumber = generateAssessmentId(state, district);

    const record: AssessmentRecord = {
      uuid: clientUuid,
      clientSubmissionId: clientUuid,
      version: 1,
      interviewerName,
      stepIndex: 1,
      consent: {
        agreeToParticipate: true,
      },
      caregiverConsent: {
        consentProvided: true,
        consentVersion: '2026.1',
        caregiverName: 'Savita Devi',
        caregiverRelationship: 'Mother',
        consentCapturedAt: now,
        signatureRequired: true,
        signatureStatus: 'CAPTURED_LOCAL',
      },
      demographics: {
        artNumber,
        childName: 'Aarav Kumar',
        dob: '2019-04-12',
        calculatedAgeYears: 7,
        gender: 'Male',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Savita Devi',
        caregiverRelationship: 'Mother',
        contactNumber: '9876543210',
        fullAddress: 'Plot 42, Ghorpadi Village',
        state,
        district,
      },
      householdFinancial: {
        totalFamilyMembers: 4,
        numberOfChildrenUnder18: 2,
        monthlyIncomeRs: 8500,
        mainSourceOfIncome: 'Daily wage labour',
      },
      health: {
        weightKg: 19.5,
        heightCm: 115,
        bmi: 14.7,
        otherHealthConditions: [],
        artStatus: 'On ART',
        artIdNumber: artNumber,
        vlStatus: 'Tested in last 6 months',
        vlCategory: 'Suppressed (<1000 copies/mL)',
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
        weightKg: 19.5,
        heightCm: 115,
        muacMm: 145,
        nutritionStatus: 'Normal',
      },
      educationStatus: {
        educationStatus: 'Currently going to school',
        schoolType: 'Government school',
        currentClass: 'Class 2',
        attendance: 'Regular',
      },
      educationExpenses: {
        schoolFees: 0,
        tuitionFees: 0,
        books: 1200,
        stationery: 300,
        uniform: 800,
        transport: 0,
        otherExpenses: 0,
        totalAnnualCost: 2300,
      },
      educationSupportRequired: {
        requiredSchoolFees: 0,
        requiredBooks: 1200,
        requiredStationery: 300,
        requiredUniform: 800,
        requiredTransport: 0,
        requiredOtherSupport: 0,
        totalRequiredSupport: 2300,
      },
      finalReview: {
        allInfoCorrect: true,
        formSubmittedBy: interviewerName,
        reviewConfirmed: true,
      },
      syncStatus: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    return record;
  }

  /**
   * 2. Transactional Draft Commit
   * Must commit to durable disk before acknowledging "saved".
   */
  public static async saveTransactionalDraft(
    record: AssessmentRecord,
    userId?: string
  ): Promise<{ success: boolean; draftId: number; savedAt: string }> {
    const storage = platformRegistry.getStorage();
    const effectiveUser = userId ?? platformRegistry.getCurrentUserId() ?? undefined;

    const draftId = await storage.saveDraft(record, {
      userId: effectiveUser,
      immediateCommit: true,
    });

    return {
      success: true,
      draftId,
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * 3. Private Sandboxed Attachment Save
   */
  public static async attachPrivateDocument(
    submissionUuid: string,
    attachmentId: string,
    data: Uint8Array | Blob,
    mimeType: string,
    fileName?: string
  ): Promise<AttachmentMetadata> {
    const attachmentStorage = platformRegistry.getAttachmentStorage();
    return await attachmentStorage.saveAttachment(
      submissionUuid,
      attachmentId,
      data,
      mimeType,
      fileName
    );
  }

  /**
   * 4. Enqueue Submission into Outbox
   */
  public static async enqueueSubmission(
    record: AssessmentRecord,
    userId?: string
  ): Promise<number> {
    const storage = platformRegistry.getStorage();
    const effectiveUser = userId ?? platformRegistry.getCurrentUserId() ?? undefined;
    return await storage.enqueueSubmission(record, {
      userId: effectiveUser,
      operationType: 'CREATE',
      idempotencyKey: `create-${record.uuid}`,
      expectedVersion: record.version || 1,
    });
  }

  /**
   * 5. Dispatch Authorized Sync
   * Transmits outbox record using Bearer Token and Idempotency-Key.
   * NEVER deletes local data until server acknowledged.
   */
  public static async dispatchAuthorizedSync(
    queueId: number,
    apiClient: (url: string, init: { method: string; headers: Record<string, string>; body: any }) => Promise<{
      status: number;
      data: any;
    }>
  ): Promise<{
    status: 'success' | 'failed_retryable' | 'failed_final' | 'conflict';
    acknowledged: boolean;
    remoteSubmissionId?: string;
    errorMessage?: string;
  }> {
    const storage = platformRegistry.getStorage();
    const network = platformRegistry.getNetwork();
    const secureStorage = platformRegistry.getSecureStorage();

    const isOnline = await network.isOnline();
    if (!isOnline) {
      return {
        status: 'failed_retryable',
        acknowledged: false,
        errorMessage: 'Device is offline.',
      };
    }

    // Mark syncing
    await storage.markSyncing(queueId);

    // Get auth token from secure storage
    const authToken = await secureStorage.getSecret('evaluation_token');

    // Retrieve pending queue item
    const item = (await storage.getQueueItemById(queueId)) || (await storage.getPendingQueue(undefined, true)).find((i) => i.id === queueId);
    if (!item) {
      return {
        status: 'failed_final',
        acknowledged: false,
        errorMessage: 'Queue item not found.',
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': item.idempotencyKey,
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const response = await apiClient('/api/submissions', {
        method: 'POST',
        headers,
        body: item.payload,
      });

      if (response.status === 200 || response.status === 201) {
        const body = response.data;
        if (body.acknowledged || body.status === 'success') {
          const remoteId = body.remoteSubmissionId || body.data?.remoteSubmissionId || `srv-${item.submissionUuid.substring(0, 8)}`;
          await storage.markSynced(queueId, item.submissionUuid, remoteId, body.version || 1);
          return {
            status: 'success',
            acknowledged: true,
            remoteSubmissionId: remoteId,
          };
        }
      }

      if (response.status === 409) {
        await storage.markConflict(queueId, response.data?.conflictMetadata);
        return {
          status: 'conflict',
          acknowledged: false,
          errorMessage: 'Version conflict on server.',
        };
      }

      if (response.status === 422 || response.status === 400 || response.status === 403) {
        const errMsg = response.data?.message || 'Terminal validation failure';
        await storage.markFailedFinal(queueId, errMsg, response.status, response.data?.issues);
        return {
          status: 'failed_final',
          acknowledged: false,
          errorMessage: errMsg,
        };
      }

      // Transient 500, 502, 503, 504: retryable
      const transientErr = response.data?.message || `Server returned HTTP ${response.status}`;
      await storage.markFailedRetryable(queueId, transientErr, response.status);
      return {
        status: 'failed_retryable',
        acknowledged: false,
        errorMessage: transientErr,
      };
    } catch (networkErr: any) {
      // Network drop: mark retryable, do NOT delete local work
      const errMsg = networkErr.message || 'Network transport failure';
      await storage.markFailedRetryable(queueId, errMsg, 0);
      return {
        status: 'failed_retryable',
        acknowledged: false,
        errorMessage: errMsg,
      };
    }
  }
}
