# Audit Evidence: Critical Findings & Defect Reproduction

**Audit Baseline**: Commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Date**: September 9, 2026  

---

## Defect 1: Silent Data Loss on Offline Record Amendments (BLOCKER)

### Code Evidence
1. In `src/app/assessment/record/[submissionId]/edit/page.tsx:791`:
```typescript
await syncQueueRepository.enqueue({
  clientUuid: submission.clientUuid,
  uniqueId: submission.uniqueId,
  data: submissionData,
  operationType: 'UPDATE', // Enqueued as UPDATE!
  retryCount: 0,
  syncStatus: 'pending'
});
```

2. In `src/app/assessment/sync/page.tsx:117`:
```typescript
const handleSyncAll = async () => {
  for (const item of pendingItems) {
    // BUG: Always calls POST /api/submissions regardless of operationType!
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.data)
    });
    const result = await res.json();
    if (res.ok) {
      await syncQueueRepository.markSynced(item.id, result.remoteSubmissionId);
    }
  }
};
```

3. In `src/app/api/submissions/route.ts:50` and `gas/Code.js:712`:
- When `POST /api/submissions` receives a payload with an existing `clientUuid` or `uniqueId`, the server logic detects an existing record and returns:
  `{ status: 'success', isDuplicate: true, acknowledged: true }`
- **Crucial flaw**: It does NOT mutate or update the existing row with the amended data.
- The client receives `res.ok === true`, assumes the update succeeded, and executes `syncQueueRepository.markSynced(item.id)`.

### Impact & Reproduction
- **Result**: An offline field worker corrects an inaccurate date of birth, updates nutritional status, or replaces an unreadable child document while in the field. When they reconnect and tap "Sync All", the sync center reports **"All Records Synchronized Successfully"**. In reality, **the server discarded all amendments**. The central linelist retains the old, inaccurate data.

---

## Defect 2: Public Drive Sharing of Sensitive Documents & Caregiver Signatures (BLOCKER)

### Code Evidence
In `gas/Code.js`:
- Line 383 (Root Folder Creation):
```javascript
root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
```
- Line 498 (Uploaded Beneficiary File Creation):
```javascript
newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
```

### Impact & Reproduction
- **Result**: Every child photograph, bank passbook scan, Aadhaar card photo, and caregiver consent signature uploaded through Google Apps Script is made accessible to **ANYONE ON THE INTERNET WITH THE URL**.
- **Privacy Violation**: Violates basic data protection, DPDP Act guidelines, and public-health confidentiality standards. If a link is indexed or intercepted, sensitive medical/HIV beneficiary PII is exposed.

---

## Defect 3: Broken Batch Sync Endpoint (CRITICAL)

### Code Evidence
In `src/app/api/sync/route.ts`:
- Line 62:
```javascript
const created = mockSheetStore.create(item.data);
```
- Line 87:
```javascript
const updated = mockSheetStore.update(targetId, item.data);
```
- **Crucial flaw**: `src/app/api/sync/route.ts` has **no code path** to forward records to `process.env.APPS_SCRIPT_URL`. It exclusively writes to the ephemeral in-memory `mockSheetStore`.
- If a client were to use `/api/sync`, no record would ever reach Google Sheets.

---

## Defect 4: Shared Webhook Secret Leaked via Query Parameter & GAS Auth Bypass (HIGH)

### Code Evidence
1. In `src/app/api/submissions/route.ts:26` and `[submissionId]/route.ts:28`:
```typescript
const gasUrl = new URL(process.env.APPS_SCRIPT_URL);
gasUrl.searchParams.set('secret', webhookSecret);
```
- Placing credentials in query parameters causes them to be logged in plain text in access logs, reverse proxies, and browser histories.

2. In `gas/Code.js:226-232`:
```javascript
var configuredSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
if (configuredSecret && payload.secret !== configuredSecret) {
  return errorResponse_('Unauthorized: Invalid webhook secret', 401);
}
```
- If an administrator creates a new deployment without initializing `WEBHOOK_SECRET` in Script Properties, `configuredSecret` is `null` or empty string. The conditional check `if (configuredSecret && ...)` evaluates to `false` and **authenticates all incoming mutations without any credentials**.
- Furthermore, in `doGet` (lines 191-218), there is **zero authentication or secret checking**, meaning any anonymous user who finds the Apps Script web app URL can list all beneficiary data.

---

## Defect 5: Optional Consent and Signature Schema Bypass (HIGH)

### Code Evidence
In `src/lib/validations/submissionSchema.ts`:
- Lines 332-345:
```typescript
caregiverConsent: z.object({
  consentGiven: z.boolean(),
  caregiverName: z.string(),
  relationship: z.string(),
  signatureDate: z.string(),
  signatureDataUrl: z.string().optional()
}).optional(),
```
- The backend API validator (`submissionSchema`) marks the entire `caregiverConsent` block as `.optional()`.
- An automated API client or malicious actor can submit complete child assessments without caregiver consent, caregiver name, or signature.
