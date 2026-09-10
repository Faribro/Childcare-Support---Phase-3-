# Root-Cause Diagnostic: Supervisor Read Model & Upstream Pipeline Failure

**Document Version:** 1.0.0-READ-MODEL-DIAGNOSTIC  
**Target Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Target Branch:** `fix/supervisor-live-read-models`  
**Investigating Engineers:** Principal Next.js, Google Apps Script, Google Sheets, PWA Cache, and Integration-Debugging Engineers  
**Target Operational Sheet ID:** `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA` (gid=0) — *Read-Only Reference, Shielded*  
**Apps Script Deployment ID:** `AKfycbxbo4ErI10K505h1qMIY8HY7bo-gQU2Gw6c8NSZ3Py6aOTVAsjeK28OPsxilyHjgmTL`  
**Date:** 2026-09-10  
**Classification:** Official / Restricted — Architectural Diagnostic Report  

---

## 1. Executive Summary & Defect Statement

The central Google Sheet titled **“CHILD HIV CARE & NUTRITION LINELIST”** contains multiple synthetic submitted survey rows. However, when navigating to any supervisor read surface in the Childcare Support Phase 3 PWA:

1. **Beneficiary Linelist (`/supervisor/assessments`)**:
   - Renders **“No Survey Records Found”**.
   - Export CSV button displays count **0**.
   - Data table is completely empty.
2. **Overview & Surveillance (`/supervisor`)**:
   - Total Evaluated displays **0**.
   - All aggregate metric cards (Severe Underweight, Unsuppressed VL, Grants) display **0**.
3. **Clinical Analytics (`/supervisor/analytics`)**:
   - Evaluated Sample Size displays **N = 0**.
   - All D3/SVG distribution charts display **“No data”**.

Rather than treating these symptoms as isolated UI defects, a full end-to-end trace of the data pipeline—from Google Sheets through Google Apps Script, the server-side canonical adapter, Next.js API route handlers, client fetch hooks, down to component state machines—was executed.

### Authoritative Root-Cause Findings

1. **Upstream Deployment Version Mismatch (Empirically Verified)**:
   Direct HTTP probe of the deployed Google Apps Script Web App (`AKfy...TL`) with `{ action: 'list', secret: '...' }` returned:
   ```json
   HTTP 200 OK
   {
     "status": "error",
     "code": 400,
     "message": "Unsupported action: list"
   }
   ```
   The deployed Google Apps Script Web App is running an older Phase 1/Phase 2 script that lacks the `list`, `read`, and `schema` actions implemented in the repository's `gas/Code.js`.
2. **Server-Side Gateway Translation**:
   `canonicalSubmissionAdapter.ts:528` converts the Apps Script error response into an `HTTP 502 UPSTREAM_FAILURE` (`code: 400, message: "Unsupported action: list"`).
3. **Client Silent Error Suppression (Critical UI Flaw)**:
   In all three supervisor pages (`/supervisor`, `/supervisor/assessments`, `/supervisor/analytics`), data fetching logic evaluated `if (res.ok) { ... }`. When the API returned `502`, the response was silently ignored, leaving local component state initialized to `[]`.
   The components then rendered their default empty-dataset UI (“No Survey Records Found”, Total = 0), completely concealing the underlying upstream infrastructure failure.
4. **Local Development / Test Store Disconnection**:
   In local development (`NEXT_PUBLIC_APP_ENV=development`), `canonicalSubmissionAdapter.isConfigured()` returned `false` because `E2E_STAGING_ENABLED !== 'true'`. The adapter fell back to `MockSheetStore`, whose in-memory `recordsByRemoteId` Map starts empty. Developers viewing a populated Google Sheet were served from an empty mock store.
5. **Absence of Shared Supervisor Data Layer**:
   No unified data hook or cache existed. Each supervisor screen independently executed its own `fetch('/api/submissions')` with duplicated, divergent data mapping and zero shared error state.
6. **Positional Header Parsing in GAS `handleList_`**:
   `gas/Code.js:1128` mapped cells using positional array indexing `rec[COLUMN_HEADERS[c]] = ...` rather than dynamic header matching (`ctx.colMap`), creating severe fragility if columns are rearranged or inserted.

---

## 2. Layer-by-Layer Read Path Trace

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   END-TO-END READ PATH TRACE                                     │
├────────────────────────────────┬────────────────────────────────┬────────────────────────────────┤
│ Pipeline Layer                 │ Implementation File / Symbol   │ Observed Behavior / Diagnosis  │
├────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ 1. Google Sheets Linelist      │ Sheet: "Child_Nutrition" /     │ Contains synthetic test rows   │
│                                │ "CHILD HIV CARE & NUTRITION"   │ (Rows 4+). Row 3 has headers.  │
├────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ 2. Google Apps Script Web App  │ Deployment `AKfy...TL`         │ ✖ REJECTS `action: 'list'` with│
│                                │ (`doPost(e)`)                  │ 400 "Unsupported action: list".│
├────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ 3. Canonical Submission Adapter│ `canonicalSubmissionAdapter.ts`│ ✖ Returns status: 'error',     │
│                                │ `listSubmissions()`            │ statusCode: 502, code: 400.    │
├────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ 4. Next.js API Gateway         │ `src/app/api/submissions/`     │ ✖ Returns HTTP 502             │
│                                │ `route.ts (GET)`               │ `{status: 'error', code: 400}` │
├────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ 5. Client Data Fetching        │ 3 Disjoint `useEffect()` calls │ ✖ `res.ok === false` ignored.  │
│                                │ across supervisor pages        │ Sets `data = []`. No error UI. │
├────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ 6. Supervisor Linelist UI      │ `assessments/page.tsx:804`     │ ✖ Renders "No Survey Records   │
│                                │                                │ Found", Export CSV count = 0.  │
├────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ 7. Overview & Surveillance UI  │ `supervisor/page.tsx:47`       │ ✖ Renders Total Evaluated = 0. │
├────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ 8. Clinical Analytics UI       │ `analytics/page.tsx:49`        │ ✖ Renders Sample Size N = 0.   │
└────────────────────────────────┴────────────────────────────────┴────────────────────────────────┘
```

### Layer 1: Google Sheet Storage
- **Tab Name Resolution:** The operational sheet contains the primary tab `Child_Nutrition` with header row 3. In `gas/Code.js:581`, `getSheetAndColMap_` attempts:
  `ss.getSheetByName(PRIMARY_SHEET_NAME) || ss.getSheetByName('Sheet1') || ss.getSheets()[0]`.
  If a sheet was copied or created with title `"CHILD HIV CARE & NUTRITION LINELIST"`, tab matching could select the wrong index if not explicitly checked.
- **Header Parsing:** `ensureHeaders_` defines 73 columns. Data begins at Row 4.

### Layer 2: Google Apps Script Web App (`gas/Code.js`)
- **Probed Target:** `https://script.google.com/macros/s/AKfycbxbo4ErI10K505h1qMIY8HY7bo-gQU2Gw6c8NSZ3Py6aOTVAsjeK28OPsxilyHjgmTL/exec`
- **Empirical Test Results:**
  - `POST { action: 'schema' }` -> `HTTP 200 { status: 'error', code: 400, message: 'Unsupported action: schema' }`
  - `POST { action: 'read' }`   -> `HTTP 200 { status: 'error', code: 400, message: 'Unsupported action: read' }`
  - `POST { action: 'list' }`   -> `HTTP 200 { status: 'error', code: 400, message: 'Unsupported action: list' }`
- **Finding:** The external cloud deployment does not have the Phase 3 backend code. It only recognizes the legacy create action.

### Layer 3: Server Canonical Submission Adapter (`src/lib/server/canonicalSubmissionAdapter.ts`)
- **Configuration Logic (`isConfigured()`):**
  ```typescript
  if (
    process.env.E2E_STAGING_ENABLED !== 'true' &&
    (process.env.NODE_ENV === 'test' ||
      process.env.NEXT_PUBLIC_APP_ENV === 'development' ||
      process.env.E2E_ALLOW_LOCAL_MOCK === 'true')
  ) {
    return false;
  }
  ```
  In local development (`NEXT_PUBLIC_APP_ENV=development`), `isConfigured()` returns `false`, causing the adapter to bypass Apps Script entirely and query `MockSheetStore`.
- **Mock Store Isolation:** In-memory `recordsByRemoteId` is empty upon server start, returning `[]` to the client.
- **Error Propagation:** When `isConfigured()` is `true` (e.g. on Render), Apps Script's 400 response is received and converted to `502 UPSTREAM_FAILURE`.

### Layer 4: Next.js API Gateway (`src/app/api/submissions/route.ts`)
- `GET /api/submissions` receives `statusCode: 502` from `canonicalSubmissionAdapter` and sends `NextResponse.json({ status: 'error', code: 'UPSTREAM_FAILURE', message: '...' }, { status: 502 })`.
- **Defect in Contract:** It does not provide the required standardized envelope:
  ```json
  {
    "status": "error",
    "code": "UPSTREAM_UNAVAILABLE",
    "message": "User-safe diagnostic message",
    "requestId": "req-...",
    "retryable": true
  }
  ```

### Layer 5: Client-Side Fetch & State Handling
- In `src/app/supervisor/assessments/page.tsx`:
  ```typescript
  const fetchSubmissions = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/submissions?limit=100');
      if (res.ok) {
        // Only executes if 200-299!
        const json = await res.json();
        ...
        setData(mapped);
      }
      // If 502, does NOTHING!
    } catch (err) {
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };
  ```
- **Consequence:** `data` remains empty `[]`. `isLoading` becomes `false`. The component is tricked into treating a server outage as an empty survey dataset.

### Layer 6: UI Presentation Layers
- **Linelist:** Evaluates `filteredData.length === 0` and unconditionally renders `<AlertCircle /> No Survey Records Found`. Export CSV button renders count `0`.
- **Overview:** Evaluates `records.length` (0) and displays `0` for Total Evaluated, Active Beneficiaries, and Nutrition alerts.
- **Analytics:** Evaluates `records.length` (0) and displays `N = 0` with blank charts.

---

## 3. Comprehensive Remediation Strategy

1. **Create Shared Supervisor Data Layer (`src/hooks/useSupervisorData.ts`)**:
   - Provide a single, authoritative hook that fetches `/api/submissions?limit=100` once.
   - Maintain explicit lifecycle states:
     - `loading`: `"Loading submitted records…"`
     - `error`: `"Records could not be loaded. Check connection and try again."` with explicit **Retry** and **Refresh** actions.
     - `empty`: `"No submitted records yet."`
     - `filtered_empty`: `"No records match the current filters."` with **Clear filters**.
     - `success`: Loaded records with record count and `lastRefreshed` timestamp.
   - Expose identical mapped canonical records to Overview, Linelist, and Analytics, ensuring mathematical consistency.
2. **Harden `gas/Code.js` Dynamic Header & Tab Resolution**:
   - Resilient tab detection: check `Child_Nutrition`, `CHILD HIV CARE & NUTRITION LINELIST`, `Child Nutrition`, and scan all sheets for header `"Unique ID"`.
   - Dynamic header mapping: in `handleList_`, resolve column names from Row 3 `colMap` rather than fixed array indices `COLUMN_HEADERS[c]`.
   - Prevent row-number derivation: extract canonical `_uuid` / `Unique ID`.
3. **Harden Server Canonical Adapter & API Gateway**:
   - Standardize API response envelope:
     ```json
     {
       "status": "success",
       "data": {
         "records": [...],
         "total": number,
         "nextCursor": null,
         "sourceUpdatedAt": "..."
       },
       "requestId": "..."
     }
     ```
   - Standardize error envelope:
     ```json
     {
       "status": "error",
       "code": "UPSTREAM_UNAVAILABLE",
       "message": "User-safe error description",
       "requestId": "...",
       "retryable": true
     }
     ```
   - In local dev/test mode when Apps Script returns `Unsupported action: list`, fail with structured error or provide verified synthetic staging records so local development displays truthful data.
   - Enforce `no-store` headers on `/api/submissions` to prevent browser/SW caching of failed responses.
4. **Update Supervisor UI Components**:
   - Refactor `src/app/supervisor/page.tsx`, `src/app/supervisor/assessments/page.tsx`, and `src/app/supervisor/analytics/page.tsx` to consume `useSupervisorData`.
   - Remove deceptive “in real-time” copy; replace with truthful “Last refreshed: HH:MM:SS” and manual refresh buttons.
   - Disable CSV export when record load fails.

---
*End of Root-Cause Diagnostic*
