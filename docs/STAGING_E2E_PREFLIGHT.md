# Staging E2E Preflight Gate & Environmental Audit

**Document Version:** 1.0.0-PREFLIGHT  
**Branch:** `test/staging-e2e-data-lifecycle-certification`  
**Execution Timestamp:** 2026-09-09T18:25:00+05:30  
**Evaluator:** Principal QA Automation Engineer & Security Integration Auditor  
**Audit Baseline:** Commit `146ba44` (Mobile Hardening Sprint) on top of `5f75e8c` (Data Safety Release Blockers)  

---

## 1. Environment Identity & Target Asset Audit

To prevent accidental data corruption or leakage of test records into active clinical operations, all tests must pass the Environmental Identity Gate before any write or mutation operation is initiated.

```
+-----------------------------------------------------------------------------------------------+
|                               ENVIRONMENTAL IDENTITY PREFLIGHT                                |
+-----------------------------------+--------------------+------------------------+-------------+
| Dimension                         | Configured Value   | Expected Staging State | Gate Status |
+-----------------------------------+--------------------+------------------------+-------------+
| NODE_ENV / App Environment        | development        | staging                | FAIL        |
| E2E_STAGING_ENABLED               | Unset / False      | true                   | FAIL        |
| Target Operational Spreadsheet ID | 1tg1RO...kbXfA     | Dedicated Staging ID   | FAIL        |
| Target Apps Script Project ID     | 1yXEgE...SPJW8P3   | Dedicated Staging ID   | FAIL        |
| Staging Google Drive Folder       | Unprovisioned      | Restricted Folder ID   | FAIL        |
| Fail-Closed Production Gate       | Enforced in Code   | Enforced in Code       | PASS        |
| Secret Transmission Hygiene       | Body / Header Only | Body / Header Only     | PASS        |
+-----------------------------------+--------------------+------------------------+-------------+
```

### Critical Environmental Findings:
1. **Target Spreadsheet Overlap**:
   - `docs/02_TECHNICAL_ARCHITECTURE_DOCUMENT.md` and `docs/DATA_CONTRACT_MAPPING.md` document spreadsheet `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA` as the **Target Operational Database**.
   - Current local configuration references this exact operational asset.
   - **Preflight Ruling**: In accordance with **Strict Safety Rule 5**, writing synthetic test rows directly into the operational database is **STRICTLY PROHIBITED**. A separate staging spreadsheet with its own independent Google Apps Script deployment must be provisioned before live cloud mutations may occur.
2. **Missing `E2E_STAGING_ENABLED` Flag**:
   - The environment variable `E2E_STAGING_ENABLED` is currently unset or false.
   - All staging-bound mutation scripts must fail closed and refuse execution until this safety gate is explicitly configured.

---

## 2. Schema Alignment & 73-Column Linelist Analysis

The canonical linelist is governed by the 73-column schema defined in `gas/Code.js` and validated at runtime by `completeSubmissionSchema` and `patchSubmissionSchema`.

### 2.1 Core Schema Mapping Synthesis

| Column # | Staging Sheet Header | Client Zod Key | GAS Mapping Key | Type / Format | Create | Update | Mapping Status |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| 1 | `1\nUnique ID` | `uuid` / `artNumber` | `uniqueId` | String (RFC 4122 UUID / ART ID) | Yes | Read-Only | **PASS** |
| 2 | `2\nRevision Number` | `version` / `revision` | `revisionNumber` | Positive Integer (1, 2, 3...) | Yes | Auto-inc | **PASS** |
| 3 | `3\nSubmission Time` | `submissionTime` | `submissionTime` | ISO 8601 Timestamp | Yes | Read-Only | **PASS** |
| 4 | `4\nSubmitted By` | `finalReview.formSubmittedBy` | `formSubmittedBy` | String | Yes | Yes | **PASS** |
| 5 | `5\nConsent Obtained` | `caregiverConsent.consentProvided` | `consentObtained` | 'Yes' \| 'No' | Yes | Read-Only | **PASS** |
| 6 | `6\nSignature /\nThumb Impression` | `caregiverConsent.signatureDataUrl` | `Signature` | In-cell Formula (`=HYPERLINK`) | Yes | Yes | **PASS** |
| 7 | `7\nVisit Date` | `demographics.dateOfFilling` | `dateOfFilling` | Date String (YYYY-MM-DD) | Yes | Yes | **PASS** |
| 8 | `8\nInterviewer Name` | `interviewerName` | `interviewerName` | String | Yes | Yes | **PASS** |
| 9 | `9\nChild Name` | `demographics.childName` | `childName` | String | Yes | Yes | **PASS** |
| 10 | `10\nDate of Birth` | `demographics.dob` | `dob` | Date String (YYYY-MM-DD) | Yes | Yes | **PASS** |
| 11 | `11\nAge` | `demographics.calculatedAgeYears` | `age` | Integer (Years) | Yes | Yes | **PASS** |
| 12 | `12\nGender` | `demographics.gender` | `gender` | 'Male' \| 'Female' \| 'Other' | Yes | Yes | **PASS** |
| 13 | `13\nOrphan Status` | `demographics.orphanStatus` | `orphanStatus` | String Enum | Yes | Yes | **PASS** |
| 14 | `14\nCaregiver Full Name` | `demographics.caregiverName` | `caregiverName` | String | Yes | Yes | **PASS** |
| 15 | `15\nCaregiver Relation` | `demographics.caregiverRelationship` | `caregiverRelationship`| String Enum | Yes | Yes | **PASS** |
| 16 | `16\nCaregiver Contact` | `demographics.contactNumber` | `contactNumber` | String (10-digit phone) | Yes | Yes | **PASS** |
| 17 | `17\nAddress` | `demographics.fullAddress` | `fullAddress` | String | Yes | Yes | **PASS** |
| 18 | `18\nState` | `demographics.state` | `state` | String (Indian State) | Yes | Yes | **PASS** |
| 19 | `19\nDistrict` | `demographics.district` | `district` | String (District Name) | Yes | Yes | **PASS** |
| 20 | `20\nBank Account Holder Name` | `bankingAndKyc.bankAccountHolderName` | `bankAccountHolderName`| String | Yes | Yes | **PASS** |
| 21 | `21\nBank Account Number` | `bankingAndKyc.bankAccountNumber` | `bankAccountNumber` | String (Account #) | Yes | Yes | **PASS** |
| 22 | `22\nBank IFSC Code` | `bankingAndKyc.bankIfscCode` | `bankIfscCode` | String (IFSC Code) | Yes | Yes | **PASS** |
| 23 | `23\nBank Linked Mobile Number` | `bankingAndKyc.bankLinkedMobileNumber` | `bankLinkedMobileNumber`| String (10-digit phone) | Yes | Yes | **PASS** |
| 24 | `24\nChild Aadhaar Number` | `demographics.childAadhaarNumber` | `childAadhaarNumber` | Masked String (`XXXX-XXXX-1234`)| Yes | Yes | **PASS** |
| 25 | `25\nPassbook Front Page Link` | `bankingAndKyc.passbookPhotoUrl` | `Passbook` | In-cell Formula (`=HYPERLINK`) | Yes | Yes | **PASS** |
| 26 | `26\nAadhaar Card Link` | `bankingAndKyc.aadhaarCardPhotoUrl` | `Aadhaar` | In-cell Formula (`=HYPERLINK`) | Yes | Yes | **PASS** |
| 27 | `27\nPassport Size Photo Link` | `bankingAndKyc.childPhotoUrl` | `Child_Photo` | In-cell Formula (`=HYPERLINK`) | Yes | Yes | **PASS** |
| 28 | `28\nHousehold Members` | `householdFinancial.totalFamilyMembers` | `householdMembers` | Positive Integer | Yes | Yes | **PASS** |
| 29 | `29\nNo of Children` | `householdFinancial.numberOfChildrenUnder18` | `noOfChildren` | Positive Integer | Yes | Yes | **PASS** |
| 30 | `30\nMonthly Income` | `householdFinancial.monthlyIncomeRs` | `monthlyIncome` | Positive Integer (INR) | Yes | Yes | **PASS** |
| 31 | `31\nIncome Source` | `householdFinancial.mainSourceOfIncome` | `incomeSource` | String Enum | Yes | Yes | **PASS** |
| 32 | `32\nCurrent Weight (kg)` | `health.weightKg` | `weightKg` | Decimal Number (kg) | Yes | Yes | **PASS** |
| 33 | `33\nCurrent Height (cm)` | `health.heightCm` | `heightCm` | Decimal Number (cm) | Yes | Yes | **PASS** |
| 34 | `34\nBMI` | `health.bmi` | `bmi` | Decimal Number | Yes | Calculated | **PASS** |
| 35 | `35\nBMI Category` | `health.bmiCategory` | `bmiCategory` | String Enum (WHO) | Yes | Calculated | **PASS** |
| 36 | `36\nHemoglobin (g/dL)` | `health.haemoglobinGdl` | `hemoglobinGdl` | Decimal Number (g/dL) | Yes | Yes | **PASS** |
| 37 | `37\nHb Category` | `health.hbCategory` | `hbCategory` | String Enum | Yes | Calculated | **PASS** |
| 38 | `38\nComorbidities` | `health.otherHealthConditions` | `comorbidities` | Comma-delimited String | Yes | Yes | **PASS** |
| 39 | `39\nComorbidities Other` | `health.otherHealthConditionSpecify` | `comorbiditiesOther` | String | Yes | Yes | **PASS** |
| 40 | `40\nART Status` | `health.artStatus` | `artStatus` | String Enum ('On ART'...) | Yes | Yes | **PASS** |
| 41 | `41\nART Registration Date` | `health.artRegistrationDate` | `artRegistrationDate` | Date String (YYYY-MM-DD) | Yes | Yes | **PASS** |
| 42 | `42\nART ID Number` | `health.artIdNumber` | `artIdNumber` | String | Yes | Yes | **PASS** |
| 43 | `43\nVL Status` | `health.vlStatus` | `vlStatus` | String Enum | Yes | Yes | **PASS** |
| 44 | `44\nVL Date` | `health.vlDate` | `vlDate` | Date String (YYYY-MM-DD) | Yes | Yes | **PASS** |
| 45 | `45\nViral Load` | `health.viralLoad` | `viralLoad` | String / Number | Yes | Yes | **PASS** |
| 46 | `46\nVL Category` | `health.vlCategory` | `vlCategory` | String Enum | Yes | Calculated | **PASS** |
| 47 | `47\nAppetite` | `nutrition.appetite` | `appetite` | 'Good' \| 'Reduced' \| 'Poor' | Yes | Yes | **PASS** |
| 48 | `48\nMeals per Day` | `nutrition.mealsPerDay` | `mealsPerDay` | Integer (1-10) | Yes | Yes | **PASS** |
| 49 | `49\nEducation Status` | `educationStatus.educationStatus` | `educationStatus` | String Enum | Yes | Yes | **PASS** |
| 50 | `50\nEducation Status Other` | `educationStatus.educationStatusSpecify` | `educationStatusSpecify`| String | Yes | Yes | **PASS** |
| 51 | `51\nSchool Name` | `educationStatus.schoolName` | `schoolName` | String | Yes | Yes | **PASS** |
| 52 | `52\nSchool Session Start Date`| `educationStatus.schoolSessionStartDate`| `schoolSessionStartDate`| Date String (YYYY-MM-DD) | Yes | Yes | **PASS** |
| 53 | `53\nSchool Type` | `educationStatus.schoolType` | `schoolType` | String Enum | Yes | Yes | **PASS** |
| 54 | `54\nCurrent Class` | `educationStatus.currentClass` | `currentClass` | String | Yes | Yes | **PASS** |
| 55 | `55\nAttendance Status` | `educationStatus.attendance` | `attendanceStatus` | 'Regular' \| 'Irregular' | Yes | Yes | **PASS** |
| 56 | `56\nSchool Fees` | `educationExpenses.schoolFees` | `schoolFees` | Positive Number (INR) | Yes | Yes | **PASS** |
| 57 | `57\nPrivate Tuition Fee` | `educationExpenses.tuitionFees` | `tuitionFees` | Positive Number (INR) | Yes | Yes | **PASS** |
| 58 | `58\nSchool Books` | `educationExpenses.books` | `books` | Positive Number (INR) | Yes | Yes | **PASS** |
| 59 | `59\nSchool Stationery` | `educationExpenses.stationery` | `stationery` | Positive Number (INR) | Yes | Yes | **PASS** |
| 60 | `60\nSchool Uniform` | `educationExpenses.uniform` | `uniform` | Positive Number (INR) | Yes | Yes | **PASS** |
| 61 | `61\nSchool Transport` | `educationExpenses.transport` | `transport` | Positive Number (INR) | Yes | Yes | **PASS** |
| 62 | `62\nSchool Other Expenses` | `educationExpenses.otherExpenses` | `otherExpenses` | Positive Number (INR) | Yes | Yes | **PASS** |
| 63 | `63\nTotal Annual Education Cost`| `educationExpenses.totalAnnualCost` | `totalAnnualCost` | Positive Number (INR) | Yes | Calculated | **PASS** |
| 64 | `64\nSchool Fee Receipt Link` | `educationExpenses.feeReceiptPhotoUrl` | `Fee_Receipt` | In-cell Formula (`=HYPERLINK`) | Yes | Yes | **PASS** |
| 65 | `65\nMarksheet Photo Link` | `educationExpenses.marksheetPhotoUrl` | `Marksheet` | In-cell Formula (`=HYPERLINK`) | Yes | Yes | **PASS** |
| 66 | `66\nRemarks (If Any)` | `educationExpenses.remarks` | `remarks` | String | Yes | Yes | **PASS** |
| 67 | `67\nApproved Alliance India` | `finalReview.approvedAllianceIndia` | `approvedAllianceIndia` | 'Pending' \| 'Approved' | Yes | Yes | **PASS** |
| 68 | `68\nReview Confirmed` | `finalReview.allInfoCorrect` | `reviewConfirmed` | 'Yes' \| 'No' | Yes | Yes | **PASS** |
| 69 | `69\nOrganization Name` | `finalReview.organizationName` | `organizationName` | String | Yes | Yes | **PASS** |
| 70 | `70\nForm Submitted By` | `finalReview.formSubmittedBy` | `formSubmittedBy` | String | Yes | Yes | **PASS** |
| 71 | `71\nOrganization Email` | `finalReview.organizationEmail` | `organizationEmail` | String (Email format) | Yes | Yes | **PASS** |
| 72 | `72\nSync Needed` | `syncNeeded` | `syncNeeded` | 'YES' \| 'NO' | Yes | Yes | **PASS** |
| 73 | `73\nLast Updated` | `updatedAt` | `lastUpdated` | ISO 8601 Timestamp | Yes | Auto-inc | **PASS** |

---

## 3. Security Configuration Preflight

```
+-----------------------------------------------------------------------------------------------+
|                               SECURITY CONFIGURATION AUDIT                                    |
+-----------------------------------+---------------------------------------------+-------------+
| Check                             | Verification Result                         | Gate Status |
+-----------------------------------+---------------------------------------------+-------------+
| Zero ANYONE_WITH_LINK Sharing     | gas/Code.js audited; zero public ACL calls  | PASS        |
| Drive Files Restricted to Domain  | Standard DriveApp inherited workspace ACLs  | PASS        |
| Webhook Secret in POST Body       | Credentials never passed in query strings   | PASS        |
| Fail-Closed 503 Gate              | canonicalSubmissionAdapter returns HTTP 503 | PASS        |
| In-Cell Raw Base64 Prevention     | Gas uploads binary; saves =HYPERLINK formula| PASS        |
| Consent Gate Enforcement          | caregiverConsentSchema requires consent=true| PASS        |
+-----------------------------------+---------------------------------------------+-------------+
```

---

## 4. Preflight Verdict & Operational Determination

> [!CAUTION]
> **STAGING PREFLIGHT VERDICT: BLOCKED FOR LIVE PRODUCTION SPREADSHEET MUTATION**  
> 
> While the code-level schema mappings, fail-closed handlers, and security contracts are 100% aligned, the environment is currently configured with the **Target Operational Database ID** (`1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA`).
> 
> Under **Strict Safety Rules 4 & 5**, live network write mutations against this sheet are **HALTED**. All E2E lifecycle and offline synchronization tests must execute in the verified, isolated local test environment. Live staging deployment requires formal provisioning of an isolated staging Google Sheet.
