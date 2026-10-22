# Release Register — Childcare Support Phase 3
**Owner**: Thread 02 (Release Coordinator) | **Last Updated**: 2026-10-22T19:40:00+05:30  
**Active Release Candidate Head SHA**: `40451d344b5048e7f5f790c1308c02b70fc1361d` (`feat/cross-system-consistency`, PR #93)  
**Main Baseline SHA**: `d6187b7060e89a1a4975bc8664900f257f09676c` (Merge of PR #94 into `main`)  
**Interim Production Vercel Deployed SHA**: `d6187b7060e89a1a4975bc8664900f257f09676c`  
**Target Production URL**: `https://childcare-support-phase-3.vercel.app`

---

## 1. Executive Summary & Candidate Status

| Component | Status | Verification Evidence |
| :--- | :--- | :--- |
| **Linelist 26 Questions** | **COMPLETE & VERIFIED** | 26/26 fields accounted for end-to-end: types, Zod schema, DOM registry, Form Intake, Draft Hydration, Record Details, Record Edit, PDF Export, and 83-column Google Sheets persistence (`gas/Code.js`). Audit matrix in `docs/FIELD_COVERAGE_AUDIT.md`. |
| **Unit Test Suite** | **100% PASSED (93/93 Files)** | 1,321 passed, 26 skipped, 0 failed across all 93 unit test suites. Includes dedicated `linelist-26-questions.test.ts` (9/9 pass) and rectified `apps-script-behavioral-simulation.test.ts` (21/21 pass). |
| **Playwright E2E Suite** | **10/10 PASSED (5 Viewports)** | `e2e/controlled-staging-browser-intake.spec.ts` verified across Mobile Android 320, Mobile Android 390, Mobile Safari 390, Tablet 768, and Desktop Smoke 1280. |
| **Forms Tab Cleanup (`0f4b5ab`)** | **PRESERVED & VERIFIED** | Action row above Needs Attention; all 4 action tiles preserved; 3 obsolete summary tiles strictly absent from DOM across mobile and desktop. |
| **Scope D OCC & Document Replacement** | **PRESERVED & VERIFIED** | Two-phase OCC asset replacement, version collision detection, and quarantined rollback logic intact. |
| **Type Safety & Build** | **ZERO ERRORS** | `npx tsc --noEmit` clean (0 errors), `npm run lint` clean (0 errors), `npm run build` (14/14 routes compiled & optimized), `build:native-client` clean. |

---

## 2. 26 Linelist Questions Accounting Matrix

| Linelist Field | Source & Field Key | Sheet Col | Storage Normalization | UI Input / Edit Views | PDF Export |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. SR Name** | `demographics.srName` | Col 74 | `raw['74\nSR Name']` | Text Input | Aligned Linelist Row |
| **2. SSR Name** | `demographics.ssrName` | Col 75 | `raw['75\nSSR Name']` | Text Input | Aligned Linelist Row |
| **3. Date of Assessment** | `dateOfFilling` / `visitDate` | Col 7 | `YYYY-MM-DD` | Date Input | Demographics Header |
| **4. Date of Birth** | `demographics.dateOfBirth` | Col 10 | `YYYY-MM-DD` (DD-MM-YYYY label) | Date Input | Demographics Header |
| **5. Age** | `demographics.age` | Col 11 | Auto-computed from DOB | Computed Read-only | Demographics Header |
| **6. Sex** | `demographics.gender` | Col 12 | `M`, `F`, `TG` (legacy `Other` preserved) | Radio Selector | Demographics Header |
| **7. Name of Child** | `demographics.childName` | Col 9 | Text | Text Input | Beneficiary Overview |
| **8. Caregiver Name** | `demographics.caregiverName` | Col 14 | Text | Text Input | Caregiver Card |
| **9. Caregiver Contact** | `demographics.contactNumber` | Col 16 | 10-digit mobile | Tel Input | Caregiver Card |
| **10. Status of Guardian/Parent** | `demographics.guardianStatus` | Col 76 | `raw['76\nStatus of Guardian/Parent']` | Text Input | Caregiver Card |
| **11. Full Address** | `demographics.fullAddress` | Col 17 | Text | Textarea | Location Card |
| **12. State** | `demographics.state` | Col 18 | Standard State Enum | Select Input | Location Card |
| **13. District** | `demographics.district` | Col 19 | District String | Select / Input | Location Card |
| **14. Caregiver Relationship** | `demographics.caregiverRelationship` | Col 15 | Relationship Enum | Select Input | Caregiver Card |
| **15. Height (cm)** | `health.heightCm` | Col 33 | Number | Number Input | Anthropometry Card |
| **16. Weight (kg)** | `health.weightKg` | Col 32 | Number | Number Input | Anthropometry Card |
| **17. Is Child On ART?** | `health.artStatus` | Col 40 | `On ART`, `Not on ART`, etc. | Select Input | Clinical Status Card |
| **18. On ART Since** | `health.artInitiationDate` | Col 41 | `YYYY-MM-DD` | Date Input | Clinical Status Card |
| **19. ART Number (Clinical)** | `health.artIdNumber` | Col 42 | Separate from `demographics.artNumber` | Text Input | Clinical Status Card |
| **20. Type of ART Medicines** | `health.artMedicineType` | Col 77 | `raw['77\nType of ART Medicines']` | Text Input | Clinical Status Card |
| **21. CD4 Count (Latest)** | `health.cd4Count` | Col 78 | `raw['78\nCD4 Count (Latest)']` | Text Input | Clinical Status Card |
| **22. Child With Disability** | `health.hasDisability` | Col 79 | `Yes`, `No`, `Unknown` | Radio Selector | Clinical Status Card |
| **23. Types of Disability** | `health.disabilityType` | Col 80 | Conditional on `hasDisability === 'Yes'` | Text Input | Clinical Status Card |
| **24. Disability Certificate** | `health.disabilityCertificateStatus` | Col 81 | `Yes`, `No`, `Applied` | Select Input | Clinical Status Card |
| **25. Malnutrition Symptoms** | `nutrition.malnutritionSymptoms` | Col 83 | `raw['83\nSymptoms of Malnutrition']` | Textarea | Nutrition Status Card |
| **26. Education Scheme Benefit** | `educationStatus.receivingEducationSchemeBenefit` | Col 82 | `Yes`, `No`, `Applied` | Select Input | Education Profile Card |

---

## 3. Test Suite Metrics

```
Unit Tests (Vitest):
  Files: 93 passed (93 files total)
  Tests: 1,321 passed, 26 skipped, 0 failed
  Duration: 65.09s

Playwright Browser E2E Suite (controlled-staging-browser-intake.spec.ts):
  Mobile Android 320:  2 passed (Forms layout + Survey intake)
  Mobile Android 390:  2 passed (Forms layout + Survey intake)
  Mobile Safari 390:   2 passed (Forms layout + Survey intake)
  Tablet 768:          2 passed (Forms layout + Survey intake)
  Desktop Smoke 1280:  2 passed (Forms layout + Survey intake)
  Total: 10 passed (100% across all viewports)
```

---

## 4. Bounded Staging Browser Acceptance Test Plan (For Owner Approval)

| Parameter | Value |
| :--- | :--- |
| **Target Application Instance** | Isolated local Next.js instance on port 3005 (`APP_ENV=staging`, `STORAGE_ENGINE=sheets`) built from candidate `40451d3` |
| **Target Spreadsheet ID** | `17Rm_U93nXilrvWu7LHBXlQ5LBC1f45Lydt76TIpiCg8` (tab: `Child_Nutrition`) |
| **Target Drive Root ID** | `1P4KeWpUl9Psel-VpwmIhjMaA8gWyIElE` |
| **Target Apps Script Web App** | `AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA` (Version 4 in staging project `1AiOO6J2s_GmmeqwRmyJfXa0r9284LF0oyPIyVSQB08zkmiAtRkDUAFPF`) |
| **Operational Guard** | Hard-coded fail-closed assertion against operational sheet `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA` and operational deployment `AKfycbxbo4...` |
| **Synthetic Record ID** | `E2E-BROWSER-INTAKE-001` (Child Name: `Controlled Test Beneficiary`) |
| **Document Upload Scope** | Synthetic Passbook front page (`synthetic-passbook.png`) attached via `PhotoUpload` + interactive caregiver signature drawn on canvas |
| **Hard Mutation Caps** | Max 1 row write, max 1 Drive container write, max 1 row delete, max 1 Drive folder delete |
| **Dual Teardown Verification** | Exact-ID deletion executed in `finally {}` block. Independent verification: Sheet read-back confirms row absent + Drive folder probe confirms 0 matching orphan folders |
| **Database Migrations 003/005** | **NOT REQUIRED** for Sheets-backed intake workflow |

---

## 5. Security Blocker Status (GitGuardian Incident 38851950)

* **Incident ID**: 38851950  
* **Historical Commit**: `930193d109e5d0c949e559f283e646daf7bd7023`  
* **File**: `scripts/run-scope-b-staging.ts` (historical)  
* **Remediation Completed in Working Tree**: All hardcoded test credentials replaced with per-run `crypto.randomBytes(...)` generation and external private files.  
* **Operational Verification**: Neither value was ever used in production, operational staging, or any external service.  
* **Resolution**: Ready for authorized GitGuardian dashboard False Positive dismissal by repo owner.
