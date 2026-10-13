# Google Sheets "passwords" Tab: Metadata Specification

## 1. Architectural Purpose & Boundaries

The `passwords` tab in the central Google Spreadsheet is an **asynchronous reporting metadata mirror**.

### Critical Security Boundaries
1. **NOT A PASSWORD VAULT**: The tab is strictly for tracking metadata (state assignments, versions, delivery references, and rotation status).
2. **NEVER USED FOR AUTHENTICATION**: The PWA backend never reads this tab to verify credentials or authorize requests. All authentication occurs against Supabase (or server credential registry).
3. **ZERO SECRETS STORED**: Under no circumstance may plaintext passwords, password hashes, salts, peppers, session tokens, or service-role keys be written to this tab.
4. **NOT A CONFIDENTIALITY BOUNDARY**: Marking a tab as "hidden" or "protected" in Google Sheets provides operational tidiness, but is **not** a security boundary against anyone with Sheet access. Sheet sharing settings dictate who can view this metadata.
5. **FAIL-SAFE DECOUPLING**: If Google Sheets is offline, experiencing quota exhaustion, or if this tab is modified or removed, user authentication in the PWA is completely unaffected.

---

## 2. Tab Configuration & Schema

- **Tab Name**: `passwords` (lowercase, exact match)
- **Column Count**: 13 columns

### Column Definitions

| Col Index | Header Title | Type / Format | Allowed Values / Example | Purpose / Description |
| :---: | :--- | :--- | :--- | :--- |
| **A** | `Access ID` | String | `STATE-MH`, `LEADERSHIP-ALL` | Public, non-secret access identifier |
| **B** | `Display Name` | String | `Maharashtra State Evaluation` | Human-readable credential name |
| **C** | `Access Type` | Enum | `STATE_EVALUATION`, `LEADERSHIP_EVALUATION`, `ADMIN` | Functional classification |
| **D** | `State` | String | `Maharashtra`, `ALL` | Associated Indian State scope |
| **E** | `Programme Scope` | String | `alliance-childcare-phase3` | Programme portfolio scope identifier |
| **F** | `Evaluation Permission` | String | `State-Scoped Read-Only (Maharashtra)` | Human description of granted scope |
| **G** | `Active` | Boolean / Enum | `TRUE`, `FALSE` | Operational activity flag |
| **H** | `Credential Version` | Integer | `1`, `2`, `3` | Incremented on rotation |
| **I** | `Created At` | ISO Timestamp | `2026-10-13T10:00:00.000Z` | Initial provisioning timestamp |
| **J** | `Last Rotated At` | ISO Timestamp | `2026-10-13T10:00:00.000Z` or `—` | Most recent rotation timestamp |
| **K** | `Provisioning Status` | Enum | `PROVISIONED`, `PENDING_DELIVERY`, `DELIVERED`, `ROTATED`, `DEACTIVATED` | Delivery lifecycle status |
| **L** | `Credential Delivery Reference` | URI String | `vault://alliance-pm/childcare-pwa/eval-mh` | Reference to secure password manager item |
| **M** | `Notes` | String | `Shared state evaluation team credential` | Administrative context and notes |

---

## 3. Formatting & Layout Requirements

1. **Header Row (Row 1)**:
   - Font: Semi-bold / Bold, 10 pt white text.
   - Background Color: Deep Teal (`#146059`).
   - Row Freeze: Row 1 frozen so headers remain visible during scrolling.
2. **Column Widths**:
   - `Access ID`: 140 px
   - `Display Name`: 220 px
   - `Access Type`: 160 px
   - `State`: 140 px
   - `Programme Scope`: 180 px
   - `Evaluation Permission`: 200 px
   - `Active`: 80 px
   - `Credential Version`: 130 px
   - `Created At`: 190 px
   - `Last Rotated At`: 190 px
   - `Provisioning Status`: 150 px
   - `Credential Delivery Reference`: 240 px
   - `Notes`: 260 px
3. **Data Rows**:
   - Text Wrap: Enabled for `Notes` and `Evaluation Permission`.
   - Alternating Colors: White (`#FFFFFF`) and very light teal (`#F3F8F7`).
   - Timestamps: ISO 8601 UTC format.
4. **Data Validation Dropdowns**:
   - `Access Type`: `STATE_EVALUATION`, `LEADERSHIP_EVALUATION`, `ADMIN`
   - `Active`: `TRUE`, `FALSE`
   - `Provisioning Status`: `PROVISIONED`, `PENDING_DELIVERY`, `DELIVERED`, `ROTATED`, `DEACTIVATED`
5. **Sheet Visibility**:
   - Tab marked as `hidden: true` by default in Google Sheets API configuration.
   - Protected range on columns A through L restricted to administrative maintainers.
