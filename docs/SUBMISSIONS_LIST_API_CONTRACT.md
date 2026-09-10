# GET /api/submissions API Contract & Gateway Hardening Specification

## Overview
The `/api/submissions` endpoint serves as the read-model gateway for supervisor dashboards, beneficiary surveillance linelists, and client-side sync reconciliation in the Child Nutrition Support PWA (Phase 3).

## Endpoint Definition
- **Method**: `GET`
- **Route**: `/api/submissions`
- **Dynamic Configuration**: `force-dynamic` (Server-rendered on demand, never statically cached)
- **Response Headers**:
  - `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`
  - `Pragma: no-cache`
  - `X-Request-Id: <unique-request-id>`

---

## Query Parameters

| Parameter | Type | Required | Default | Constraints / Validation | Description |
|---|---|---|---|---|---|
| `limit` | integer | No | 50 | Min: 1, Max: 100 | Number of records to return. Values > 100 are automatically clamped to 100. Non-numeric, negative, or 0 return `400 VALIDATION_ERROR`. |
| `cursor` | string | No | null | None | Pagination cursor for next page of records. |
| `status` | string | No | null | None | Filter by submission review/approval status. |
| `updatedAfter` | ISO string | No | null | ISO 8601 | Only return records modified after timestamp. |

---

## HTTP Status Codes & Error Mappings

| Status Code | Code String | Condition | Retryable |
|---|---|---|---|
| **200 OK** | N/A | Successful retrieval of linelist records | N/A |
| **400 Bad Request** | `VALIDATION_ERROR` | Malformed query parameters (e.g. non-numeric limit, limit <= 0) | `false` (Terminal) |
| **502 Bad Gateway** | `UPSTREAM_UNAVAILABLE` | Google Apps Script bridge is unreachable, times out, or returns an error (such as unsupported action) | `true` (Backoff) |
| **503 Service Unavailable** | `CONFIGURATION_ERROR` | Missing server-side credentials or bridge endpoint configuration | `false` |
| **500 Internal Error** | `INTERNAL_ERROR` | Unexpected server-side runtime exception | `true` |

> **Critical Safety Invariant**: Upstream bridge errors from Google Apps Script (including `code: 400 Unsupported action: list`) are explicitly mapped to **`502 UPSTREAM_UNAVAILABLE`** and NEVER passed through as HTTP 400. Client applications halt retries on HTTP 400, so masking an upstream outage as a 400 client error caused diagnostic paralysis and false client assumptions.

---

## Response Schemas

### 1. Success Response (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "records": [
      {
        "id": "DL-SOU-101122-01",
        "timestamp": "2026-09-08T10:30:00.000Z",
        "demographics": {
          "artNumber": "DL-SOU-101122-01",
          "childName": "Rohit Yadav",
          "age": 7,
          "gender": "Male",
          "district": "South Delhi",
          "state": "Delhi"
        },
        "version": 3
      }
    ],
    "total": 1,
    "nextCursor": null,
    "sourceUpdatedAt": "2026-09-10T12:00:00.000Z"
  },
  "items": [ /* Backwards-compatible duplicate of data.records */ ],
  "pagination": {
    "totalCount": 1,
    "limit": 50,
    "offset": 0,
    "hasMore": false,
    "nextCursor": null
  },
  "requestId": "req-list-xyz-1234"
}
```

### 2. Validation Error Response (`400 Bad Request`)
```json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Query parameter \"limit\" must be a positive integer between 1 and 100.",
  "requestId": "req-list-xyz-1234",
  "retryable": false
}
```

### 3. Upstream Bridge Error Response (`502 Bad Gateway`)
```json
{
  "status": "error",
  "code": "UPSTREAM_UNAVAILABLE",
  "message": "Upstream spreadsheet bridge does not support list action: Unsupported action: list",
  "requestId": "req-list-xyz-1234",
  "retryable": true
}
```

---

## Data Privacy & Confidentiality Invariants
1. **Zero Secret Leakage**: Response payloads and headers NEVER include Google Apps Script tokens, Google Drive API tokens, sheet URLs, or system secrets.
2. **PII Masking**: Raw Aadhaar numbers and raw bank account numbers are redacted (`XXXX-XXXX-1234`) before being included in the client-facing read model.
3. **Fail-Closed Verification**: The gateway rejects unauthenticated requests and halts on configuration gaps in production.
