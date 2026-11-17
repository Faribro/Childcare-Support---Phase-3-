# Google Sheet Linelist Column Contract Reconciliation: 83 vs 85 Columns

**Document Version:** 1.0.0  
**Target Branch:** `gcp-migration`  
**Author:** Senior Systems Architect & Data Contract Engineering  
**Status:** Canonical Reconciliation Report  

---

## 1. Executive Summary

This report establishes the forensic truth regarding the column contract between the Next.js application, Google Apps Script (`gas/Code.js`), the Google Sheets linelist mirror (`Child_Nutrition_Phase3_Linelist`), and documentation reports.

### Key Finding:
The **true, active, and canonical contract is exactly 83 columns**.
There are **no columns 84 or 85** in any deployed Apps Script, application serializer, Firestore adapter, or automated test suite. The reference to "85 columns" in earlier documentation files (`MIGRATION.md`, `PHASE_D_REPORT.md`, and `RELEASE_GATES.md`) was an editorial documentation error (miscalculating $73 + 12 = 85$ instead of $73 + 10 = 83$), not an actual schema change or missing data fields.

---

## 2. Complete Ordered List of All 83 Canonical Columns

Below is the complete, ordered inventory of all 83 columns defined in `gas/Code.js` (lines 230–338) and tested in `src/test/apps-script-behavioral-simulation.test.ts` and `src/__tests__/linelist-26-questions.test.ts`:

### Base Phase 3 Schema: Columns 1 through 73 (Preserved from Phase 2)
| # | Column Header Name | Domain / Purpose | Document Slot Index |
| :-: | :--- | :--- | :--- |
| **1** | `1\nUnique ID` | Child system-generated reference ID | - |
| **2** | `2\nRevision Number` | Monotonically increasing revision counter | - |
| **3** | `3\nSubmission Time` | ISO timestamp of submission | - |
| **4** | `4\nSubmitted By` | Caseworker / User ID | - |
| **5** | `5\nConsent Obtained` | Caregiver consent boolean | - |
| **6** | `6\nSignature /\nThumb Impression` | Caregiver signature document link / formula | `DOC_COLUMNS.SIGNATURE: 6` |
| **7** | `7\nVisit Date` | Assessment visit date | - |
| **8** | `8\nInterviewer Name` | Field worker interviewer name | - |
| **9** | `9\nChild Name` | Beneficiary child full name | - |
| **10** | `10\nDate of Birth` | Child date of birth | - |
| **11** | `11\nAge` | Child age in years | - |
| **12** | `12\nGender` | Child gender | - |
| **13** | `13\nOrphan Status` | Single / Double / Non-orphan status | - |
| **14** | `14\nCaregiver Full Name` | Caregiver primary name | - |
| **15** | `15\nCaregiver Relation` | Caregiver relationship to child | - |
| **16** | `16\nCaregiver Contact` | Caregiver mobile number | - |
| **17** | `17\nAddress` | Residential address | - |
| **18** | `18\nState` | Administrative State | - |
| **19** | `19\nDistrict` | Administrative District | - |
| **20** | `20\nBank Account Holder Name` | Bank account holder name | - |
| **21** | `21\nBank Account Number` | Bank account number | - |
| **22** | `22\nBank IFSC Code` | Bank branch IFSC code | - |
| **23** | `23\nBank Linked Mobile Number` | Bank linked mobile number | - |
| **24** | `24\nChild Aadhaar Number` | Child 12-digit Aadhaar number | - |
| **25** | `25\nPassbook Front Page Link` | Passbook photo document link / formula | `DOC_COLUMNS.PASSBOOK: 25` |
| **26** | `26\nAadhaar Card Link` | Aadhaar scan document link / formula | `DOC_COLUMNS.AADHAAR: 26` |
| **27** | `27\nPassport Size Photo Link` | Child photo document link / formula | `DOC_COLUMNS.CHILD_PHOTO: 27` |
| **28** | `28\nHousehold Members` | Total household count | - |
| **29** | `29\nNo of Children` | Number of children in household | - |
| **30** | `30\nMonthly Income` | Household monthly income (₹) | - |
| **31** | `31\nIncome Source` | Primary income source | - |
| **32** | `32\nCurrent Weight (kg)` | Anthropometric weight | - |
| **33** | `33\nCurrent Height (cm)` | Anthropometric height | - |
| **34** | `34\nBMI` | Calculated BMI | - |
| **35** | `35\nBMI Category` | WHO BMI category | - |
| **36** | `36\nHemoglobin (g/dL)` | Clinical hemoglobin level | - |
| **37** | `37\nHb Category` | Anemia severity category | - |
| **38** | `38\nComorbidities` | Known medical conditions list | - |
| **39** | `39\nComorbidities Other` | Specified comorbidities | - |
| **40** | `40\nART Status` | Antiretroviral therapy status | - |
| **41** | `41\nART Registration Date` | Date registered for ART | - |
| **42** | `42\nART ID Number` | Clinical ART clinic registration ID | - |
| **43** | `43\nVL Status` | Viral load test status | - |
| **44** | `44\nVL Date` | Latest viral load test date | - |
| **45** | `45\nViral Load` | Viral load count (copies/mL) | - |
| **46** | `46\nVL Category` | Viral load suppression category | - |
| **47** | `47\nAppetite` | Child appetite level | - |
| **48** | `48\nMeals per Day` | Daily meal frequency | - |
| **49** | `49\nEducation Status` | Enrolment status | - |
| **50** | `50\nEducation Status Other` | Specified education status | - |
| **51** | `51\nSchool Name` | Enrolled educational institution | - |
| **52** | `52\nSchool Session Start Date` | Academic session start date | - |
| **53** | `53\nSchool Type` | Government / Private / Aided | - |
| **54** | `54\nCurrent Class` | Enrolled standard/grade | - |
| **55** | `55\nAttendance Status` | School attendance regular/irregular | - |
| **56** | `56\nSchool Fees` | Annual school tuition fees (₹) | - |
| **57** | `57\nPrivate Tuition Fee` | Private coaching fees (₹) | - |
| **58** | `58\nSchool Books` | Books expense (₹) | - |
| **59** | `59\nSchool Stationery` | Stationery expense (₹) | - |
| **60** | `60\nSchool Uniform` | Uniform expense (₹) | - |
| **61** | `61\nSchool Transport` | School transport expense (₹) | - |
| **62** | `62\nSchool Other Expenses` | Other academic expenses (₹) | - |
| **63** | `63\nTotal Annual Education Cost`| Sum of all educational costs (₹) | - |
| **64** | `64\nSchool Fee Receipt Link` | Fee receipt document link / formula | `DOC_COLUMNS.FEE_RECEIPT: 64` |
| **65** | `65\nMarksheet Photo Link` | Marksheet document link / formula | `DOC_COLUMNS.MARKSHEET: 65` |
| **66** | `66\nRemarks (If Any)` | Additional caseworker remarks | - |
| **67** | `67\nApproved Alliance India` | Leadership grant approval decision | - |
| **68** | `68\nReview Confirmed` | Intake verification confirmation | - |
| **69** | `69\nOrganization Name` | Partner organization name | - |
| **70** | `70\nForm Submitted By` | Submitting worker name | - |
| **71** | `71\nOrganization Email` | Partner email | - |
| **72** | `72\nSync Needed` | Central synchronization flag | - |
| **73** | `73\nLast Updated` | Row update timestamp | - |

---

### Extended Phase 3 Linelist Questions: Columns 74 through 83
| # | Column Header Name | Domain / Purpose | Key in Serializer / Payload |
| :-: | :--- | :--- | :--- |
| **74** | `74\nSR Name` | Principal Recipient (SR) Organization | `srName` / `demographics.srName` |
| **75** | `75\nSSR Name` | Sub-Sub Recipient (SSR) Organization | `ssrName` / `demographics.ssrName` |
| **76** | `76\nStatus of Guardian/Parent` | Parental survival/clinical status | `guardianStatus` / `demographics.guardianStatus` |
| **77** | `77\nType of ART Medicines` | 1st line, 2nd line, or pediatric regimen | `artMedicineType` / `health.artMedicineType` |
| **78** | `78\nCD4 Count (Latest)` | Latest CD4 laboratory count | `cd4Count` / `health.cd4Count` |
| **79** | `79\nIs Child With Disability` | Disability screening (Yes/No/Unknown) | `hasDisability` / `health.hasDisability` |
| **80** | `80\nTypes of Disability` | Disability categories (locomotor, etc.) | `disabilityType` / `health.disabilityType` |
| **81** | `81\nDisability Certificate` | Government certificate status | `disabilityCertificateStatus` |
| **82** | `82\nEducation Scheme Benefit` | Government scholarship / scheme status | `receivingEducationSchemeBenefit` |
| **83** | `83\nSymptoms of Malnutrition` | Observable clinical malnutrition markers | `malnutritionSymptoms` |

---

## 3. Forensic Codebase Evidence

1. **`gas/Code.js` (Lines 230–338):**
   ```javascript
   var COLUMN_HEADERS = [
     "1\nUnique ID",
     ...
     "73\nLast Updated",
     "74\nSR Name",
     "75\nSSR Name",
     "76\nStatus of Guardian/Parent",
     "77\nType of ART Medicines",
     "78\nCD4 Count (Latest)",
     "79\nIs Child With Disability",
     "80\nTypes of Disability",
     "81\nDisability Certificate",
     "82\nEducation Scheme Benefit",
     "83\nSymptoms of Malnutrition"
   ];
   // COLUMN_HEADERS.length === 83
   ```
2. **`src/__tests__/linelist-26-questions.test.ts` (Lines 271–298):**
   ```typescript
   it('verifies gas/Code.js extends COLUMN_HEADERS to 83 columns while preserving columns 1-73 exactly', () => {
     expect(gasCode).toContain('"74\\nSR Name"');
     ...
     expect(gasCode).toContain('"83\\nSymptoms of Malnutrition"');
     expect(gasCode).toContain('"1\\nUnique ID"');
     expect(gasCode).toContain('"73\\nLast Updated"');
   });
   ```
3. **`src/test/apps-script-behavioral-simulation.test.ts` (Lines 119–130):**
   Asserts the exact array of 83 headers and tests sheet initialization with `new Array(83).fill('')`.
4. **`src/lib/server/canonicalSubmissionAdapter.ts` (Lines 183 & 210):**
   Column 83 (`raw['83\nSymptoms of Malnutrition']`) is mapped as the final linelist column.

---

## 4. Discrepancy Root Cause

In early Phase 3 documentation (`docs/gcp-migration/MIGRATION.md`, `PHASE_D_REPORT.md`, `RELEASE_GATES.md`), the phrase "all 85 columns populated" was used in prose descriptions. 
This was a human counting error ($73 + 12 = 85$ was assumed, whereas exactly 10 fields were added: $73 + 10 = 83$). 
No application code, Apps Script release, or test fixture ever implemented columns 84 or 85.

---

## 5. Impact Analysis

- **Phase 2 Legacy Compatibility:**  
  Columns 1 through 73 remain in identical ordinal order, preserving exact byte-for-byte fidelity with historical records and document formulas. Zero risk to Phase 2 data.
- **Phase 3 Staging & Production:**  
  The Google Sheet mirror and Apps Script deployment have been operating on 83 columns since PR #75.
- **Needs-Based Assessment Form:**  
  Needs-based category selection does NOT alter the 83-column contract. Any question that is not applicable to a selected category is mirrored as a blank cell `""` (or `0` for numeric expense sums), exactly matching standard Apps Script empty-value semantics.

---

## 6. Action Plan for Reconciliation

1. **Canonical Recognition:** Officially record the contract as **83 columns**.
2. **Documentation Correction:** Reconcile `docs/gcp-migration/MIGRATION.md`, `PHASE_D_REPORT.md`, and `RELEASE_GATES.md` to reference 83 columns instead of 85.
3. **Zero Mutation to Live Sheet:** Confirm that no columns need to be added or deleted on the live staging or production Google Sheets.
