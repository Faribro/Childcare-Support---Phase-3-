# Sync Request & Server Response Contract Specification

**Version**: v3.1.0-contract  
**Status**: Authoritative Standard  
**Target Application**: India HIV/AIDS Alliance Childcare Support PWA  

---

## 1. Overview

This document defines the strict, bidirectional client-server synchronization contract between the offline-first Childcare Support PWA and the backend API gateway (`/api/submissions`).

The contract enforces:
1. Complete schema validation via Zod without leaking raw beneficiary data in error payloads.
2. Optimistic Concurrency Control (OCC) using standard HTTP `If-Match` headers.
3. Mutation idempotency using `Idempotency-Key`.
4. Clear separation between full-document creation (`POST`) and allowlisted partial updates (`PATCH`).
5. Terminal failure classification for 4xx client errors to completely prevent infinite retry loops.

---

## 2. Endpoints & Operations

### 2.1 CREATE (New Assessment Submission)

Used when submitting an initial field screening assessment or new beneficiary intake.

- **Method**: `POST`
- **URL**: `/api/submissions`
- **Headers**:
  | Header Name | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `Content-Type` | `string` | **Yes** | Must be `application/json` |
  | `Idempotency-Key` | `string` | **Yes** | Client UUID or deterministic key `create-{uuid}` |
  | `X-Request-Id` | `string` | Optional | Client tracing ID |

- **Request Body**:
  Must be a complete, validated `CompleteSubmissionPayload` conforming to `completeSubmissionSchema`.
  Local Dexie persistence metadata (`id`, `stepIndex`, `syncStatus`, `syncNeeded`, `syncedAt`, `syncError`) is strictly stripped before dispatch.
  ```json
  {
    "uuid": "c56a4180-65aa-42ec-a945-5fd21dec0538",
    "clientSubmissionId": "c56a4180-65aa-42ec-a945-5fd21dec0538",
    "interviewerName": "Caseworker Name",
    "demographics": {
      "artNumber": "DL-SOU-101122-01",
      "childName": "Beneficiary Child",
      "dob": "2020-01-01",
      "gender": "Male",
      "caregiverName": "Caregiver Parent",
      "caregiverRelationship": "Mother",
      "caregiverPhone": "9876543210",
      "district": "South Delhi"
    },
    "household": {
      "orphanStatus": "None",
      "primaryCaregiverOccupation": "Daily wage",
      "monthlyHouseholdIncome": 7500,
      "numberOfSiblings": 2
    },
    "health": {
      "heightCm": 95,
      "weightKg": 13.5,
      "muacMm": 130,
      "bilateralPittingOedema": false
    },
    "nutrition": {
      "appetite": "Good",
      "mealsPerDay": 3
    },
    "education": {
      "schoolEnrolled": true,
      "schoolType": "Government",
      "schoolGrade": "Class 1"
    },
    "bankDetails": {
      "accountHolderName": "Caregiver Parent",
      "accountNumber": "123456789012",
      "ifscCode": "SBIN0001234",
      "bankName": "State Bank of India",
      "passbookPhotoCaptured": true
    },
    "declaration": {
      "consentAcknowledged": true,
      "caseworkerName": "Caseworker Name",
      "declarationDate": "2026-09-08"
    }
  }
  ```

---

### 2.2 UPDATE (Revision / Follow-up Assessment)

Used when editing, appending follow-up clinical measurements, or updating caregiver/bank records.

- **Method**: `PATCH`
- **URL**: `/api/submissions/{remoteSubmissionId}`
  *(Note: `{remoteSubmissionId}` can be the remote ID assigned by the server, or the canonical reference ID / client UUID).*
- **Headers**:
  | Header Name | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `Content-Type` | `string` | **Yes** | Must be `application/json` |
  | `If-Match` | `string` | **Yes** | Canonical OCC version in HTTP entity-tag format: `"<expectedVersion>"` (e.g. `"1"`) |
  | `Idempotency-Key` | `string` | **Yes** | Deterministic key `update-{id}-{expectedVersion}` |
  | `X-Request-Id` | `string` | Optional | Client tracing ID |

- **Request Body**:
  Enclosed within a canonical `{ changes }` envelope containing only allowlisted, editable fields:
  ```json
  {
    "changes": {
      "editReason": "Corrected school enrollment status",
      "childName": "Beneficiary Child Updated",
      "monthlyIncomeRs": 8500,
      "educationStatus": "Currently going to school",
      "schoolName": "Govt Boys Senior Secondary School",
      "currentClass": "Class 2",
      "mealsPerDay": 3
    }
  }
  ```

  **Strict Invariants**:
  1. Protected system keys (`uuid`, `id`, `clientSubmissionId`, `remoteSubmissionId`, `createdAt`, `syncStatus`, `idempotencyKey`) are stripped and disallowed in `changes`.
  2. Nested form sections from local Dexie storage (`educationStatus: { schoolName: ... }`) are automatically flattened into scalar patch properties before validation.
  3. `expectedVersion` precondition is sent canonically via HTTP `If-Match: "<expectedVersion>"`. For backwards compatibility, the server also accepts `expectedVersion` in the JSON body. If both `If-Match` and body `expectedVersion` are provided and disagree, the server returns HTTP 400 `PRECONDITION_MISMATCH`. If missing or `< 1`, the server responds with HTTP 422 `VALIDATION_ERROR`.

---

## 2.3 System Diagnostics & Health Endpoints

### 2.3.1 Public Liveness (`GET /api/health`)
Used by hosting platforms (Render, load balancers, container probes) for minimal liveness verification.
- **Privacy Enforcement**: Emits only `{ status: 'ok', service: 'childcare-support-phase-3', version: '3.0.0', timestamp, uptimeSeconds }`.
- Never reveals adapter mode, build commit SHA, environment markers, or upstream URLs to unauthenticated callers.

### 2.3.2 Restricted Readiness Diagnostics (`GET /api/ready`)
Used for staging diagnostics and runtime configuration verification.
- In production (`NODE_ENV=production`), requires authentication via `Authorization: Bearer <DIAGNOSTICS_SECRET>` or `x-diagnostics-token`.
- Returns `{ status: 'ok', ready: true, adapterMode, buildCommitSha, apiContractVersion, appEnvironmentMarker, timestamp, uptimeSeconds }`.

## 3. Server Response Envelope Specifications

### 3.1 Success Response (HTTP 200 / 201)

Returned on successful completion of CREATE or UPDATE.

```json
{
  "status": "success",
  "acknowledged": true,
  "data": {
    "remoteSubmissionId": "rem-c56a4180-ky78z1",
    "clientSubmissionId": "c56a4180-65aa-42ec-a945-5fd21dec0538",
    "version": 2,
    "updatedAt": "2026-09-10T12:00:00.000Z",
    "syncStatus": "SYNCED"
  },
  "remoteSubmissionId": "rem-c56a4180-ky78z1",
  "version": 2,
  "updatedAt": "2026-09-10T12:00:00.000Z",
  "requestId": "req-l01a-8b9f"
}
```

The PWA client verifies `acknowledged !== false && Boolean(data.remoteSubmissionId)` before marking the local record `synced`.

---

### 3.2 Validation Error Response (HTTP 422)

Returned when client payload violates Zod schema constraints, OCC constraints, or contains unprocessable values.

```json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "The record needs correction before it can be sent.",
  "details": {
    "fields": [
      {
        "field": "expectedVersion",
        "path": "expectedVersion",
        "issue": "expectedVersion is required and must be a positive integer",
        "code": "invalid_type"
      }
    ]
  },
  "requestId": "req-l01a-422f"
}
```

**Privacy Guarantee**: Error payloads never echo back the submitted beneficiary PII, bank account numbers, or signature assets. Only field paths and error classification codes are emitted.

---

### 3.3 Concurrency Conflict Response (HTTP 409)

Returned when `expectedVersion` does not match current server revision.

```json
{
  "status": "error",
  "code": "CONCURRENCY_CONFLICT",
  "message": "The record has been updated by another caseworker. Please refresh before saving.",
  "currentVersion": 3,
  "expectedVersion": 1,
  "resolutionPath": "REFRESH_AND_MERGE",
  "requestId": "req-l01a-409c"
}
```

The PWA outbox halts automatic retries on HTTP 409, marks the record `conflict`, and prompts the user for manual three-way merge review.

---

### 3.4 Upstream / Transient Failure Response (HTTP 500 / 502 / 503)

Returned on network timeouts, Google Apps Script rate limits, or transient gateway failures.

```json
{
  "status": "error",
  "code": "UPSTREAM_UNAVAILABLE",
  "message": "Upstream Google Apps Script service temporarily unreachable",
  "requestId": "req-l01a-503t",
  "retryable": true
}
```

The PWA schedules exponential backoff with full jitter for retryable errors.
