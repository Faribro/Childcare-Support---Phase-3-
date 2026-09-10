# Supervisor Read Model & Data Contract Specification

**Document Version:** 1.0.0-READ-CONTRACT  
**Target Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Target Branch:** `fix/supervisor-live-read-models`  
**Specification Owner:** Principal Integration & Data Contract Architect  
**Classification:** Official / Restricted  

---

## 1. Scope and Architectural Objectives

This document formalizes the canonical data contract across the entire read path of the Childcare Support Phase 3 PWA:
1. Google Sheets Linelist (73-column rectified layout).
2. Google Apps Script Web App (`action: 'list'`).
3. Server-Side Canonical Submission Adapter (`canonicalSubmissionAdapter.ts`).
4. Next.js API Gateway (`GET /api/submissions`).
5. Shared Client Data Hook (`src/hooks/useSupervisorData.ts`).
6. Supervisor Presentation Surfaces:
   - Overview & Surveillance Dashboard (`/supervisor`)
   - Beneficiary Linelist (`/supervisor/assessments`)
   - Clinical Analytics (`/supervisor/analytics`)

---

## 2. API Contract: `GET /api/submissions`

### 2.1 Request Parameters
| Query Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `cursor` | string (optional) | `undefined` | Opaque pagination cursor (canonical ID or timestamp) |
| `limit` | integer (optional)| `50` (max 100) | Number of records to return |
| `status` | string (optional) | `undefined` | Filter by sync status (`SYNCED`, `QUEUED`) |
| `updatedAfter` | string (optional)| `undefined` | ISO 8601 timestamp filter for incremental sync |

### 2.2 Success Response Envelope (HTTP 200)
```json
{
  "status": "success",
  "data": {
    "records": [
      {
        "id": "WB-KOL-081200-01",
        "remoteSubmissionId": "WB-KOL-081200-01",
        "artNumber": "WB-KOL-7920",
        "childName": "Rohit Yadav",
        "dateOfBirth": "2010-04-14",
        "age": 16,
        "gender": "Male",
        "district": "Kolkata",
        "state": "West Bengal",
        "orphanStatus": "Both parents alive",
        "schoolEnrolled": true,
        "schoolType": "Government school",
        "schoolGrade": "Class 11",
        "attendancePercentage": 75,
        "weightKg": 48.0,
        "heightCm": 160.0,
        "bmi": 18.8,
        "bmiCategory": "Normal",
        "viralLoad": "< 50",
        "vlCategory": "Undetectable (<50 copies/mL)",
        "hemoglobin": "13.0",
        "hbCategory": "Normal",
        "grantAmount": 18000,
        "approvedStatus": "Approved",
        "isApproved": true,
        "syncState": "SYNCED",
        "version": 1,
        "createdAt": "2026-06-25T10:00:00.000Z",
        "updatedAt": "2026-06-25T10:00:00.000Z",
        "documentStatus": {
          "isComplete": true,
          "totalRequired": 6,
          "uploadedCount": 6,
          "pendingDocs": [],
          "uploadedDocs": [
            "Bank Passbook Front Page",
            "Aadhaar Card",
            "Child Beneficiary Photo",
            "Caregiver Signature",
            "School Fee Receipt",
            "Academic Marksheet"
          ]
        }
      }
    ],
    "total": 1,
    "nextCursor": null,
    "sourceUpdatedAt": "2026-09-10T11:20:00.000Z"
  },
  "requestId": "req-1788950000000-abcd"
}
```

### 2.3 Error Response Envelope (HTTP 4xx / 5xx)
```json
{
  "status": "error",
  "code": "UPSTREAM_UNAVAILABLE | UNAUTHENTICATED | FORBIDDEN | CONFIGURATION_ERROR | SHEET_SCHEMA_MISMATCH | MAPPING_ERROR | INTERNAL_ERROR",
  "message": "User-safe error description without credentials or raw sheet data",
  "requestId": "req-1788950000000-abcd",
  "retryable": true
}
```

### 2.4 Error Code Taxonomy
| Code | HTTP Status | Meaning | Retryable |
| :--- | :--- | :--- | :--- |
| `CONFIGURATION_ERROR` | 503 | `APPS_SCRIPT_URL` or `WEBHOOK_SECRET` missing in staging/production | false |
| `UPSTREAM_UNAVAILABLE` | 502 / 504 | Google Apps Script or Google Sheets unreachable / timed out | true |
| `UNAUTHENTICATED` | 401 | Shared webhook secret rejected by central bridge | false |
| `FORBIDDEN` | 403 | IP or role unauthorized for assessment access | false |
| `SHEET_SCHEMA_MISMATCH` | 502 | Required 73-column headers missing in target Sheet | false |
| `MAPPING_ERROR` | 500 | Record structure corrupted or unparseable | false |
| `INTERNAL_ERROR` | 500 | Unhandled server exception | true |

### 2.5 Cache-Control Policy
- Header: `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`
- Prevents intermediate proxies, Next.js route caches, and Service Workers from caching empty or error responses as valid datasets.

---

## 3. Google Apps Script Contract (`action: 'list'`)

### 3.1 Request Payload (POST)
```json
{
  "action": "list",
  "cursor": 4,
  "limit": 100,
  "status": "all",
  "secret": "<WEBHOOK_SECRET>"
}
```

### 3.2 Dynamic Header Mapping Rules
1. `getSheetAndColMap_` dynamically scans:
   - Tab named `'Child_Nutrition'`
   - Tab named `'CHILD HIV CARE & NUTRITION LINELIST'`
   - Tab named `'Child Nutrition'`
   - Tab named `'Master'`
   - Any tab whose Row 3 (or Row 1) contains cell value `"Unique ID"` or `"1\nUnique ID"`.
2. Column mapping is constructed by reading the header row and normalizing header names:
   - Trim whitespace.
   - Strip leading index prefix (e.g. `1\n` -> `unique id`).
   - Store both raw key and sanitized lowercase key.
3. If critical identifier columns (`Unique ID`, `Child Name`, `Revision Number`) are absent from the resolved tab, Apps Script returns:
   ```json
   {
     "status": "error",
     "code": "SHEET_SCHEMA_MISMATCH",
     "message": "Target sheet missing mandatory Linelist headers: Unique ID"
   }
   ```
4. Data row cells are extracted using `colMap` lookups, guaranteeing immunity to column order changes.

---

## 4. Shared Client Hook Contract (`useSupervisorData`)

### 4.1 State Interface
```typescript
export type SupervisorDataStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface SupervisorDataState {
  status: SupervisorDataStatus;
  records: SupervisorRecord[];
  total: number;
  lastRefreshed: Date | null;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
}
```

### 4.2 State Transition Matrix
```
[idle] ──(mount)──► [loading] ───(API success & total > 0)──► [success]
                        │    └───(API success & total == 0)─► [empty]
                        └────────(API failure / 5xx)─────────► [error]
                                                                  │
                                      [loading] ◄───(retry/refresh)┘
```

---
*End of Data Contract*
