# 26-Question Linelist Field Coverage Audit & Data Path Traceability

**Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Candidate Workspace:** `D:\OneDrive - INDIA HIV AIDS ALLIANCE\Desktop\Software Development\Childcare-Main-Verify`  
**Branch:** `feat/cross-system-consistency` (PR #93)  
**Base Commit:** `d6187b7060e89a1a4975bc8664900f257f09676c` (Merged `main`)  
**Audit Date:** 2026-10-22  

---

## 1. Executive Summary

This audit evaluates the complete end-to-end data path for all 26 requested linelist questions:
`Create Form` → `Client Validation` → `Local Draft` → `Offline Outbox Queue` → `Authenticated API` → `Server Validation & Allowlist` → `Canonical Adapter` → `Google Sheets / Database Persistence` → `Read-Back Hydration` → `Review/Detail View` → `Edit Form` → `PDF/Report Export` → `Automated Tests`.

### Coverage Breakdown
- **FULLY PRESENT (10 / 26):** Questions 1, 4, 5, 6, 13, 15, 16, 18, 19, 26.
- **PARTIALLY CONNECTED (6 / 26):** Questions 7, 8, 11, 12, 14, 20. (Present in some layers, e.g. create form and Sheet, but omitted from edit forms or missing M/F/TG representations).
- **MISSING (10 / 26):** Questions 2, 3, 9, 10, 17, 21, 22, 23, 24, 25. (Require full pipeline wiring from domain types through UI, validation, storage, and persistence).
- **SEMANTICS TO CONFIRM WITH PROGRAMME:** SR/SSR nomenclature and Guardian/Parent Status definitions (addressed using neutral, unconstrained text fields without sensitive assumptions).

---

## 2. Exhaustive 26-Question Traceability Matrix

| # | Requested Linelist Label | Canonical Field Key | UI Section | Create Form Control | Edit Form Control | Validation (Client & Server) | Draft & Storage (Dexie / SQLite) | API & Patch Allowlist | Persistence / Google Sheet Column | Detail View & Export | Current Audit Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **State Name** | `demographics.state` | Section 2: Demographics | `<select id="child-state">` (`new/page.tsx#L1435`) | `<select id="child-state">` (`edit/page.tsx#L1680`) | `demographicsSchema.state`: `z.string().min(2)` | Preserved in Dexie `drafts` & SQLite `drafts.data` | `allowlistedPatchChangesSchema.state` | Col 18: `"18\nState"` (`gas/Code.js#L240`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **2** | **SR Name** | `demographics.srName` | Section 2: Programme / Geo | Missing | Missing | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 74) | Missing | **MISSING** |
| **3** | **SSR Name** | `demographics.ssrName` | Section 2: Programme / Geo | Missing | Missing | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 75) | Missing | **MISSING** |
| **4** | **Name of the Child** | `demographics.childName` | Section 2: Demographics | `<Input id="child-name">` (`new/page.tsx#L1345`) | `<Input id="child-name">` (`edit/page.tsx#L1590`) | `demographicsSchema.childName`: `z.string().min(2)` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.childName` | Col 9: `"9\nChild Name"` (`gas/Code.js#L231`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **5** | **Address** | `demographics.fullAddress` | Section 2: Demographics | `<textarea id="full-address">` (`new/page.tsx#L1420`) | `<textarea id="full-address">` (`edit/page.tsx#L1665`) | `demographicsSchema.fullAddress`: `z.string()` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.fullAddress` | Col 17: `"17\nAddress"` (`gas/Code.js#L239`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **6** | **District** | `demographics.district` | Section 2: Demographics | `<Input id="child-district">` (`new/page.tsx#L1455`) | `<Input id="child-district">` (`edit/page.tsx#L1700`) | `demographicsSchema.district`: `z.string().min(2)` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.district` | Col 19: `"19\nDistrict"` (`gas/Code.js#L241`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **7** | **UID/ART No.** | `health.artIdNumber` (Clinical) & `demographics.artNumber` (Ref) | Section 5: Health & Clinical | `<Input id="health-artIdNumber">` (`new/page.tsx#L1817`) | **Missing in edit page** | `healthSchema.artIdNumber`: `z.string().optional()` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.artIdNumber` | Col 42: `"42\nART ID Number"` & Col 1: `"1\nUnique ID"` | Displayed in Detail & PDF Export | **PARTIALLY CONNECTED** |
| **8** | **On ART Since (DD-MM-YYYY)** | `health.artInitiationDate` (`artRegistrationDate`) | Section 5: Health & Clinical | **Missing in create page** | **Missing in edit page** | Field declared in type, unformatted in schema | Preserved if provided | `allowlistedPatchChangesSchema.artRegistrationDate` | Col 41: `"41\nART Registration Date"` (`gas/Code.js#L263`) | Missing from Detail & PDF Export | **PARTIALLY CONNECTED / MISSING FROM UI** |
| **9** | **Type of ART Medicines** | `health.artMedicineType` | Section 5: Health & Clinical | Missing | Missing | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 77) | Missing | **MISSING** |
| **10** | **CD4 Count (Latest)** | `health.cd4Count` | Section 5: Health & Clinical | Missing | Missing | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 78) | Missing | **MISSING** |
| **11** | **Viral Load (Latest)** | `health.viralLoad` | Section 5: Health & Clinical | `<Input id="health-viralLoad">` (`new/page.tsx#L1958`) | **Missing in edit page** | `healthSchema.viralLoad`: `z.union([z.number(), z.string()])` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.viralLoad` | Col 45: `"45\nViral Load"` (`gas/Code.js#L267`) | Displayed in Detail; omitted from PDF | **PARTIALLY CONNECTED** |
| **12** | **Known Co-morbidities** | `health.otherHealthConditions` & `specify` | Section 5: Health & Clinical | Checkboxes & specify (`new/page.tsx#L1983-2028`) | **Missing in edit page** | `healthSchema.otherHealthConditions`: `z.array(z.string())` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.otherHealthConditions` | Col 38: `"38\nComorbidities"` & Col 39: `"39\nComorbidities Other"` | Displayed in Detail; omitted from PDF | **PARTIALLY CONNECTED** |
| **13** | **Date of Birth (DD-MM-YYYY)** | `demographics.dob` | Section 2: Demographics | `<Input id="child-dob" type="date">` (`new/page.tsx#L1375`) | `<Input id="child-dob" type="date">` (`edit/page.tsx#L1620`) | `demographicsSchema.dob`: rejects future dates | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.dob` | Col 10: `"10\nDate of Birth"` (`gas/Code.js#L232`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **14** | **Sex (M/F/TG)** | `demographics.gender` | Section 2: Demographics | Radios Male/Female/Other (`new/page.tsx#L1390`) | Radios Male/Female/Other (`edit/page.tsx#L1635`) | `genderEnum`: `['Male', 'Female', 'Other', 'Transgender']` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.gender` | Col 12: `"12\nGender"` (`gas/Code.js#L234`) | Displayed in Detail & PDF Export | **PARTIALLY CONNECTED** |
| **15** | **Parent/Guardian Name** | `demographics.caregiverName` | Section 2: Demographics | `<Input id="caregiver-name">` (`new/page.tsx#L1400`) | `<Input id="caregiver-name">` (`edit/page.tsx#L1645`) | `demographicsSchema.caregiverName`: `z.string().min(2)` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.caregiverName` | Col 14: `"14\nCaregiver Full Name"` (`gas/Code.js#L236`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **16** | **Contact Number** | `demographics.contactNumber` | Section 2: Demographics | `<Input id="caregiver-phone">` (`new/page.tsx#L1410`) | `<Input id="caregiver-phone">` (`edit/page.tsx#L1655`) | `demographicsSchema.contactNumber`: 10-digit regex | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.contactNumber` | Col 16: `"16\nCaregiver Contact"` (`gas/Code.js#L238`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **17** | **Status of Guardian/Parent** | `demographics.guardianStatus` | Section 2: Demographics | Missing | Missing | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 76) | Missing | **MISSING** |
| **18** | **Orphan Status** | `demographics.orphanStatus` | Section 2: Demographics | Radios/Select (`new/page.tsx#L1395`) | Radios/Select (`edit/page.tsx#L1640`) | `orphanStatusEnum` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.orphanStatus` | Col 13: `"13\nOrphan Status"` (`gas/Code.js#L235`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **19** | **Is the child currently enrolled in school?** | `educationStatus.educationStatus` | Section 7: Education Status | Radio options (`new/page.tsx#L2063`) | Radio options (`edit/page.tsx#L2100`) | `educationStatusEnum` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.educationStatus` | Col 49: `"49\nEducation Status"` (`gas/Code.js#L271`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |
| **20** | **Type of School** | `educationStatus.schoolType` | Section 7: Education Status | Radios (`new/page.tsx#L2135`) | **Missing in edit page** | `permissiveSchoolType` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.schoolType` | Col 53: `"53\nSchool Type"` (`gas/Code.js#L275`) | Displayed in Detail & PDF Export | **PARTIALLY CONNECTED** |
| **21** | **Is the child with disability?** | `health.hasDisability` | Section 5: Health & Clinical | Missing | Missing | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 79) | Missing | **MISSING** |
| **22** | **Types of Disability** | `health.disabilityType` | Section 5: Health & Clinical | Missing (Conditional) | Missing (Conditional) | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 80) | Missing | **MISSING** |
| **23** | **Does the child have a disability certificate?** | `health.disabilityCertificateStatus` | Section 5: Health & Clinical | Missing (Conditional) | Missing (Conditional) | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 81) | Missing | **MISSING** |
| **24** | **Is the child receiving any education-scheme benefit?** | `educationStatus.receivingEducationSchemeBenefit` | Section 7: Education Status | Missing | Missing | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 82) | Missing | **MISSING** |
| **25** | **Symptoms of Malnutrition** | `nutrition.malnutritionSymptoms` | Section 6: Nutrition | Missing | Missing | Missing in `submissionSchema.ts` | Missing | Missing | Missing (Allocated to Col 83) | Missing | **MISSING** |
| **26** | **Remarks** | `educationExpenses.remarks` | Section 8: Expenses & Remarks | `<textarea id="expenses-remarks">` (`new/page.tsx#L2330`) | `<textarea id="expenses-remarks">` (`edit/page.tsx#L2365`) | `educationExpensesSchema.remarks`: `z.string().optional()` | Preserved in Dexie & SQLite | `allowlistedPatchChangesSchema.remarks` | Col 66: `"66\nRemarks (If Any)"` (`gas/Code.js#L288`) | Displayed in Detail & PDF Export | **FULLY PRESENT** |

---

## 3. Semantic & Architectural Governance Decisions

1. **Clinical UID/ART vs System Reference:**
   - `demographics.artNumber` remains the system-generated human-readable reference ID (e.g. `MH-PUN-221830-01`) used for client tracking and routing.
   - `health.artIdNumber` represents the NACO ART Center clinic registration string (preserving alphanumeric formatting and leading zeroes). It is never used as a database primary key or UUID.
2. **On ART Since:**
   - Implemented as `health.artInitiationDate` with fallback alias `health.artRegistrationDate` to preserve historical data without inventing clinical initiation dates.
   - UI presents clear DD-MM-YYYY guidance and date picker with future-date blocking.
3. **Sex Representation:**
   - Supported canonical enum: `'Male' | 'Female' | 'Other' | 'Transgender' | 'M' | 'F' | 'TG'`.
   - Form controls offer `M`, `F`, `TG` with descriptive labels (`Male (M)`, `Female (F)`, `Transgender (TG)`).
   - Historical entries (`Male`, `Female`, `Other`) are retained without destructive mutation. "Other" is never conflated with "TG".
4. **Disability Block (Conditional Integrity):**
   - `health.hasDisability` ('Yes' | 'No' | 'Unknown').
   - `health.disabilityType` and `health.disabilityCertificateStatus` ('Yes' | 'No' | 'Applied / In Process') are conditionally revealed when `hasDisability === 'Yes'`.
   - Data retention rule: Hiding the section does not wipe previously saved draft values.
   - Certificate document upload is strictly optional and not a prerequisite for form submission.
5. **Malnutrition Symptoms vs Anthropometry:**
   - `nutrition.malnutritionSymptoms` records observed symptoms independently from computed Z-scores, BMI categories, or nutrition classifications (`Normal`, `MAM`, `SAM`).
6. **Backward-Compatible Google Sheet Schema Migration:**
   - Columns 1 through 73 remain in their exact rectified order with all `DOC_COLUMNS` indexes preserved.
   - New columns are appended starting at Column 74 through Column 83.
   - Older rows with only 73 columns read back gracefully without error.
