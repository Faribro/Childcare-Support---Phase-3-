# Google Sheets API v4 Advanced Operations & Schema Governance

## 1. Overview & Architecture

Google Apps Script standard Spreadsheet Service (`SpreadsheetApp`) operates via high-level DOM-like abstractions that introduce latency and quota overhead during bulk reads and linelist formatting. By enabling the **Google Sheets API v4 Advanced Service** (`Sheets`), the system achieves:
- **Sub-Second Bulk Range Fetching**: Single-call retrieval of row values and formulas via `Sheets.Spreadsheets.Values.get()`.
- **Low Quota Consumption**: Direct protocol buffers to Google Sheets backend, remaining well within the free-tier rate limits (300 requests/minute/user).
- **Graceful Resilient Fallback**: Every Advanced Service call is wrapped in a conditional check (`typeof Sheets !== 'undefined'`) with automatic fallback to `SpreadsheetApp` if the container environment lacks Advanced Services.

---

## 2. The 73-Column Rectified Linelist Schema

The production Google Sheet (`Child_Nutrition`) is organized as a 3-row header linelist:
- **Row 1 (38px)**: Institutional Dark Navy Banner (`#1B365D`) with white bold text (`CHILD HIV CARE & NUTRITION LINELIST`) merged across columns B to BU.
- **Row 2 (12px)**: White spacing row (`#FFFFFF`) separating title from column headers.
- **Row 3 (90px)**: 73 numbered, category-color-coded column headers with text wrapping, middle vertical alignment, and centered text.
- **Rows 4+ (60px)**: Beneficiary assessment data rows with alternating zebra striping (`#FFFFFF` / `#F8FAFC`).

### Pastel Category Organization

| Category | Columns | Background Fill | Functional Area |
| :--- | :---: | :---: | :--- |
| **Intake, Revision & Consent** | 1–8 | `#D9E2F3` (Pale Blue) | Unique ID, Revision Number, Submission Time, Consent, Signature |
| **Child Demographics & Residence** | 9–19 | `#E2EFDA` (Pale Green) | Child Name, DOB, Age, Gender, Orphan Status, Caregiver, Address |
| **Banking & KYC Documents** | 20–27 | `#FFF2CC` (Pale Yellow) | Bank Details, Aadhaar, Passbook Link, Photo Link |
| **Household & Socio-Economic** | 28–31 | `#EDEDED` (Pale Gray) | Members, No. of Children, Monthly Income, Source |
| **Health, ART & Clinical** | 32–46 | `#FCE4D6` (Pale Salmon) | Weight, Height, BMI, Hb, ART Status & ID, Viral Load |
| **Nutrition & Habits** | 47–48 | `#E2EFDA` (Pale Green) | Appetite, Meals per Day |
| **Education Status** | 49–55 | `#D9E2F3` (Pale Blue) | Enrolment, School Name, Class, Attendance |
| **Education Expenses & Docs** | 56–66 | `#FFF2CC` (Pale Yellow) | Fees, Tuition, Books, Uniform, Receipt & Marksheet Links |
| **Programme Governance & Audit**| 67–73 | `#D9E2F3` (Pale Blue) | Alliance Approval, Review Confirmed, CBO Details, Last Updated |

---

## 3. Schema Validation & Audit Engine

### Schema Validation Function: `getValidatedSheetSchema_()`
Performs verification of header row 3 against the canonical 73-column array:
```javascript
function getValidatedSheetSchema_() {
  // 1. Attempts Sheets.Spreadsheets.Values.get('Child_Nutrition!A3:BU3')
  // 2. Falls back to sheet.getRange(3, 1, 1, 73).getValues()[0]
  // 3. Verifies each column matches expected text (normalized for spacing and newlines)
  // 4. Returns { valid, totalColumns, expectedColumns: 73, matchedColumns, missingHeaders, mismatches, advancedServiceUsed }
}
```

### Deep Audit Function: `schemaAudit_()`
Runs diagnostic checks across dimensions, row counts, freeze panes, and category formatting, accessible directly from the Apps Script administrative menu or via authenticated API call (`action: "schemaAudit"`).

---

## 4. Supervisor DTO Redaction & Read Models

To comply with the Digital Personal Data Protection (DPDP) Act and HIPAA healthcare data protection standards, `listSubmissions_()` applies strict redactions for bulk list queries:

1. **Bank Account Numbers**: Masked to `XXXX-XXXX-1234` (preserving only the last 4 digits for verification).
2. **Aadhaar Numbers**: Masked to `XXXX-XXXX-1234`.
3. **Caregiver & Bank Contact**: Masked to `******1234`.
4. **Document Attachment Slots**: Large Base64 data URLs or raw formula strings are replaced by lightweight boolean presence flags:
   - `hasSignature`: boolean
   - `hasPassbook`: boolean
   - `hasAadhaar`: boolean
   - `hasChildPhoto`: boolean
   - `hasFeeReceipt`: boolean
   - `hasMarksheet`: boolean

Full unredacted document links and clinical details are accessible only when querying single records via authenticated `readSubmission_(remoteSubmissionId)` with appropriate supervisor credentials.

---

## 5. Protected Ranges & Linelist Governance

To prevent accidental formula overwrites or unauthorized manual edits in the Google Sheet:
- **Header Rows 1–3**: Protected against structural modifications.
- **Columns 1 & 2 (`Unique ID`, `Revision Number`)**: Protected system columns; can only be modified via automated Apps Script lock transactions.
- **Columns 67, 68 & 73 (`Approved Alliance India`, `Review Confirmed`, `Last Updated`)**: Protected governance columns restricted to authorized institutional supervisors.

Verified programmatically via `setupOrVerifyProtectedRanges_()` and the custom menu item **Verify Protected Columns**.
