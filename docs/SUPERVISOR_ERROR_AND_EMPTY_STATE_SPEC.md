# UI Specification: Supervisor Error, Loading & Empty States

**Document Version:** 1.0.0-UI-STATE-SPEC  
**Target Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Target Branch:** `fix/supervisor-live-read-models`  
**Author:** Principal Full-Stack & UX Reliability Engineer  
**Classification:** Official / Restricted  

---

## 1. Principles of Truthful State Presentation

1. **Zero Silent Fallback**: An API error (HTTP 401, 403, 500, 502, 503, 504), network disconnect, or schema mismatch must **NEVER** be converted into an empty record array (`[]`) or default to "0 records found".
2. **Explicit User Communication**: The user interface must distinctly differentiate between:
   - In-flight network activity (`loading`).
   - Upstream connectivity or authorization failures (`error`).
   - A central database that has zero recorded assessments (`confirmed_empty`).
   - A populated database whose active filters exclude all rows (`filtered_empty`).
   - A verified, populated dataset (`success`).
3. **No False "Real-Time" Claims**: Data is refreshed on user demand or bounded poll cycles. Do not claim data is updated "in real-time" without active SSE/WebSocket infrastructure. Show explicit "Last refreshed at HH:MM:SS".
4. **Actionable Recovery**: Every failure state must provide immediate, non-destructive recovery actions (**Retry**, **Refresh**).
5. **Disabled Exports on Failure**: The **Export CSV** action must be disabled when records fail to load, with clear tooltips indicating export is unavailable until data is loaded.

---

## 2. State Specification Matrix

| State Identifier | Trigger Condition | Visual Component | Mandatory Primary Copy | Secondary / Action Copy | Available Actions | Export CSV State |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`LOADING`** | Initial load or manual refresh in-flight | Spinner / Shimmer | `"Loading submitted records…"` | `"Connecting to secure central records bridge"` | None (Cancel disabled) | Disabled (Loading...) |
| **`ERROR`** | `res.ok === false` (502, 503, 500, 401) or network error | `AlertTriangle` banner with rose border | `"Records could not be loaded. Check connection and try again."` | Specific safe message (e.g. `"Central database bridge unavailable"` or `"Unauthorized session"`) | **[Retry Connection]** **[Refresh]** | Disabled (Unavailable) |
| **`EMPTY_CONFIRMED`** | HTTP 200 with `records.length === 0` and no filters | `Inbox` / `CheckCircle2` card | `"No submitted records yet."` | `"Intake assessments submitted by field caseworkers will appear here."` | **[Refresh]** **[New Intake]** | Disabled (0 records) |
| **`FILTERED_EMPTY`** | HTTP 200 with `records.length > 0` but `filtered.length === 0` | `Filter` icon card | `"No records match the current filters."` | `"Showing 0 of {total} records. Try adjusting or clearing search terms."` | **[Clear all filters]** | Disabled (0 matching) |
| **`SUCCESS`** | HTTP 200 with `filtered.length > 0` | Data Table / Card Grid | Table rendered | `"Showing {filtered} of {total} records • Last refreshed at {timestamp}"` | **[Refresh]** **[Export CSV]** | Enabled with count |

---

## 3. UI Implementation Details by Surface

### 3.1 Beneficiary Linelist (`/supervisor/assessments`)
- **Header Ribbon**:
  - Replace deceptive real-time text with:
    `"Beneficiary Linelist • Last refreshed: {lastRefreshedFormatted}"`
  - Refresh button includes loading spinner when active: `<RefreshCw className={isLoading ? "animate-spin" : ""} />`.
- **Export CSV Button**:
  - When `status === 'error'`: Render `<Button disabled>Export CSV (Unavailable)</Button>`.
  - When `status === 'loading'`: Render `<Button disabled>Loading...</Button>`.
  - When `status === 'success'`: Render `<Button>Export CSV <Badge>{filteredData.length}</Badge></Button>`.
- **Error State Banner**:
  - Displayed inside the table boundary replacing table rows:
    ```tsx
    <div className="py-16 text-center space-y-3">
      <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
      <h4 className="text-sm font-bold text-slate-800">Records could not be loaded. Check connection and try again.</h4>
      <p className="text-xs text-slate-500 max-w-sm mx-auto">{errorMessage}</p>
      <div className="flex items-center justify-center gap-2 pt-2">
        <Button variant="primary" size="sm" onClick={retry}>Retry</Button>
        <Button variant="secondary" size="sm" onClick={refresh}>Refresh</Button>
      </div>
    </div>
    ```

### 3.2 Overview & Surveillance (`/supervisor`)
- **Metric Cards (Total Evaluated, Severe Underweight, Unsuppressed, Grants)**:
  - When `status === 'loading'`: Render subtle pulse skeleton `<div className="h-8 w-16 bg-slate-100 animate-pulse rounded" />`.
  - When `status === 'error'`: Render `"—"` in metrics with a discrete alert banner:
    `"⚠ Unable to load central surveillance metrics. [Retry]"`
  - When `status === 'success'`: Render exact calculated aggregates.

### 3.3 Clinical Analytics (`/supervisor/analytics`)
- **Distribution Charts & Sample Size `N`**:
  - When `status === 'error'`: Display:
    `"Clinical records could not be loaded. [Retry]"`
  - When `status === 'empty'`: Display:
    `"No clinical records available for analytics."`
  - Charts only render when valid data points exist ($N > 0$).

---
*End of UI State Specification*
