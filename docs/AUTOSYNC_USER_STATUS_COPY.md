# Truthful User Status & Copy Specification

## 1. Core Principles
1. **Never Confuse Local with Cloud**: A record saved to device storage (IndexedDB) must NEVER use wording like "Survey recorded!" or green success checkmarks that imply completion on central Google Sheets.
2. **Clear Separation of Concerns**:
   - Section 1: **"On this device (Waiting to send)"** for outbox records.
   - Section 2: **"Submitted records"** for confirmed canonical records verified by the server/Google Sheets bridge.
3. **Actionable Feedback**: When errors occur, tell the caseworker *what happened* and *what action is required* without exposing backend internals, stack traces, API keys, Sheet IDs, or Drive URLs.

---

## 2. Submission Confirmation Copy Matrix

| Context | User State | Primary Banner Copy | Sub-text / Supporting Copy | Visual Styling |
|---|---|---|---|---|
| **Online Immediate Send In-Flight** | `SYNCING` | *"Saved to this device. Sending now…"* | *"Transmitting assessment to central Google Sheets..."* | Blue/Indigo banner with spinner |
| **Server Acknowledged Success** | `SYNCED` | *"Submitted successfully"* | *"Reference: {artNumber} • Confirmed by server at {time}"* | Emerald/Green banner with check icon |
| **Device Offline at Submit** | `QUEUED` / `OFFLINE` | *"Saved to this device. It will send automatically when you are connected."* | *"Reference: {artNumber} • Stored safely offline."* | Amber banner with offline cloud icon |
| **Network Error / Timeout / 5xx** | `FAILED_RETRYABLE` | *"Saved to this device. We could not send it yet and will try again."* | *"Next retry scheduled in {minutes}m. You can also tap 'Sync Now'."* | Amber banner with clock/retry icon |
| **Validation / Client Rejection (4xx)** | `FAILED_FINAL` | *"This record needs attention before it can be sent."* | *"{actionableFieldMessage}. Tap 'Edit' to update required information."* | Rose/Red banner with alert icon |
| **Concurrency Conflict (409)** | `NEEDS_REVIEW` | *"This record was updated elsewhere. Review the changes before sending again."* | *"A newer version (v{remoteVersion}) exists on the server."* | Purple banner with git/merge icon |

---

## 3. Status Chips & Visual Indicators

| Chip Label | Technical State | Background | Border | Text | Icon |
|---|---|---|---|---|---|
| **`Local`** | `QUEUED` / `FINALIZED_LOCAL` | `bg-amber-50` | `border-amber-200` | `text-amber-800` | Clock |
| **`Sending`** | `SYNCING` | `bg-sky-50` | `border-sky-200` | `text-sky-800` | Spinner (pulsing) |
| **`Submitted`** | `SYNCED` | `bg-emerald-50` | `border-emerald-200` | `text-emerald-800` | CheckCircle2 |
| **`Needs attention`**| `FAILED_FINAL` | `bg-rose-50` | `border-rose-200` | `text-rose-800` | AlertCircle |
| **`Conflict`** | `NEEDS_REVIEW` | `bg-purple-50` | `border-purple-200` | `text-purple-800` | AlertTriangle |

---

## 4. Submitted Surveys & Sync Centre Screens

1. **Header Counters**:
   - `Waiting to Send (N)`: Counts items where `status !== 'synced'`.
   - `Submitted (M)`: Counts items verified by server / Google Sheets.
2. **Action Bar**:
   - High-visibility **"Sync now"** button with connection indicator (Online / Offline).
   - Shows time of last sync attempt and result summary.
3. **Data Protection**:
   - Aadhaar numbers display strictly masked: `XXXX-XXXX-1234`.
   - Bank accounts display strictly masked: `XXXX-XXXX-5678`.
   - Zero raw secrets, webhook tokens, or Sheet IDs exposed in client-facing DOM or network inspector payloads.
