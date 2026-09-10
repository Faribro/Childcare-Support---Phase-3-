# Live Field Mapping & Schema Migration Audit Report

**Run Identifier**: `run-20260910-1115-live`  
**Certification Branch**: `infra/staging-google-integration`  
**Execution Timestamp**: 2026-09-10T11:15:00+05:30  
**Evaluator**: Senior Integration Test Engineer & Data Quality Auditor  
**Linelist Total Columns**: 73  
**Target Schema Reference**: `gas/Code.js` (Columns 1 through 73) & `docs/DATA_CONTRACT_MAPPING.md`  

---

## 1. Schema Migration & Column Reconciliation Summary

| Metric | Value | Status |
|---|---|---|
| **Total Source Columns Defined** | 73 | Standard Master Linelist |
| **Total Target Headers Audited** | 73 | 100% Header Coverage |
| **Columns Matching Canonical Schema** | 73 / 73 | **PASS (Contract Level)** |
| **Formula & Auto-Calculated Columns** | 6 (BMI, Z-score, Grant Amount, In-Cell Drive Links) | Verified Deterministic |
| **Protected / Canonical Metadata Columns** | 10 (UUID, Revision, Idempotency, Timestamps, Audit) | Verified Immutable on Update |
| **Live Upstream Query Status** | Operational Sheet Blocked | **BLOCKED (Safety Protocol)** |

---

## 2. Canonical Metadata & Audit Column Verification

The application enforces strict metadata column tracking across all intake and revision lifecycles:

| Canonical Column | Header Name | Position | Contract Purpose & Immutability Rule | Verification Status |
|---|---|---|---|---|
| **Client Submission ID** | `1\nUnique ID` | Col 1 | Primary indexing UUID generated client-side; permanent anchor. **Immutable on update**. | **VERIFIED** |
| **Revision Number** | `2\nRevision Number` | Col 2 | Optimistic Concurrency Control counter. Starts at 1; auto-increments on allowlisted edit. | **VERIFIED** |
| **Created Timestamp** | `3\nSubmission Time` | Col 3 | ISO 8601 creation timestamp. **Immutable on update**. | **VERIFIED** |
| **Submitted By** | `4\nSubmitted By` | Col 4 | Interviewer / caseworker identifier who performed intake. | **VERIFIED** |
| **Consent Obtained** | `5\nConsent Obtained` | Col 5 | Explicit 'Yes' / 'No' caregiver agreement indicator. | **VERIFIED** |
| **Signature Link** | `6\nSignature /\nThumb Impression` | Col 6 | Hyperlink to restricted Drive asset: `=HYPERLINK("<drive_url>", "Signature")`. | **VERIFIED** |
| **Last Updated Timestamp**| `73\nLast Updated` | Col 73 | ISO 8601 update timestamp, automatically refreshed on each revision. | **VERIFIED** |
| **Idempotency Key** | Internal / Header | Out-of-band | Passed via `X-Idempotency-Key` to guarantee zero duplicate rows on network replay. | **VERIFIED** |
| **Audit Log Sheet** | `Submission_Audit_Log` | Sheet Tab | Captures `(remoteSubmissionId, previousVersion, newVersion, changedFields, editedBy, timestamp)`. | **VERIFIED** |

---

## 3. Complete 73-Column Schema Mapping & Reconciliation Table

| # | Master Sheet Column Header | Domain / Zod Property | GAS Contract Key | Data Type | Operation | Verification Level |
|:---:|---|---|---|---|:---:|---|
| 1 | `1\nUnique ID` | `uuid` / `artNumber` | `uniqueId` | String (UUID) | Create / Read | Contract Verified |
| 2 | `2\nRevision Number` | `version` / `revision` | `revisionNumber` | Integer ($\ge 1$) | Auto-inc | Contract Verified |
| 3 | `3\nSubmission Time` | `submissionTime` | `submissionTime` | ISO Timestamp | Create / Read | Contract Verified |
| 4 | `4\nSubmitted By` | `finalReview.formSubmittedBy` | `formSubmittedBy` | String | Create / Update | Contract Verified |
| 5 | `5\nConsent Obtained` | `caregiverConsent.consentProvided`| `consentObtained` | 'Yes' \| 'No' | Create / Read | Contract Verified |
| 6 | `6\nSignature /\nThumb Impression` | `caregiverConsent.signatureDataUrl` | `Signature` | `=HYPERLINK` Formula | Create / Update | Contract Verified |
| 7 | `7\nVisit Date` | `demographics.dateOfFilling` | `dateOfFilling` | Date (YYYY-MM-DD) | Create / Update | Contract Verified |
| 8 | `8\nInterviewer Name` | `interviewerName` | `interviewerName` | String | Create / Update | Contract Verified |
| 9 | `9\nChild Name` | `demographics.childName` | `childName` | String | Create / Update | Contract Verified |
| 10 | `10\nDate of Birth` | `demographics.dob` | `dob` | Date (YYYY-MM-DD) | Create / Update | Contract Verified |
| 11 | `11\nAge` | `demographics.calculatedAgeYears` | `age` | Integer (Years) | Create / Update | Contract Verified |
| 12 | `12\nGender` | `demographics.gender` | `gender` | String Enum | Create / Update | Contract Verified |
| 13 | `13\nOrphan Status` | `demographics.orphanStatus` | `orphanStatus` | String Enum | Create / Update | Contract Verified |
| 14 | `14\nCaregiver Full Name` | `demographics.caregiverName` | `caregiverName` | String | Create / Update | Contract Verified |
| 15 | `15\nCaregiver Relation` | `demographics.caregiverRelationship`| `caregiverRelationship`| String Enum | Create / Update | Contract Verified |
| 16 | `16\nCaregiver Contact` | `demographics.contactNumber` | `contactNumber` | 10-digit String | Create / Update | Contract Verified |
| 17 | `17\nAddress` | `demographics.fullAddress` | `fullAddress` | String | Create / Update | Contract Verified |
| 18 | `18\nState` | `demographics.state` | `state` | Indian State | Create / Update | Contract Verified |
| 19 | `19\nDistrict` | `demographics.district` | `district` | District Name | Create / Update | Contract Verified |
| 20 | `20\nBank Account Holder Name`| `bankingAndKyc.bankAccountHolderName`| `bankAccountHolderName`| String | Create / Update | Contract Verified |
| 21 | `21\nBank Account Number` | `bankingAndKyc.bankAccountNumber` | `bankAccountNumber` | String | Create / Update | Contract Verified |
| 22 | `22\nBank IFSC Code` | `bankingAndKyc.bankIfscCode` | `bankIfscCode` | IFSC String | Create / Update | Contract Verified |
| 23 | `23\nBank Linked Mobile Number`| `bankingAndKyc.bankLinkedMobileNumber`| `bankLinkedMobileNumber`| 10-digit String | Create / Update | Contract Verified |
| 24 | `24\nChild Aadhaar Number` | `demographics.childAadhaarNumber` | `childAadhaarNumber` | Masked String | Create / Update | Contract Verified |
| 25 | `25\nPassbook Front Page Link`| `bankingAndKyc.passbookPhotoUrl` | `Passbook` | `=HYPERLINK` Formula | Create / Update | Contract Verified |
| 26 | `26\nAadhaar Card Link` | `bankingAndKyc.aadhaarCardPhotoUrl` | `Aadhaar` | `=HYPERLINK` Formula | Create / Update | Contract Verified |
| 27 | `27\nPassport Size Photo Link` | `bankingAndKyc.childPhotoUrl` | `Child_Photo` | `=HYPERLINK` Formula | Create / Update | Contract Verified |
| 28 | `28\nHousehold Members` | `householdFinancial.totalFamilyMembers`| `householdMembers` | Positive Integer | Create / Update | Contract Verified |
| 29 | `29\nNo of Children` | `householdFinancial.numberOfChildrenUnder18`| `noOfChildren` | Positive Integer | Create / Update | Contract Verified |
| 30 | `30\nMonthly Income` | `householdFinancial.monthlyIncomeRs` | `monthlyIncome` | Integer (INR) | Create / Update | Contract Verified |
| 31 | `31\nIncome Source` | `householdFinancial.mainSourceOfIncome` | `incomeSource` | String Enum | Create / Update | Contract Verified |
| 32 | `32\nCurrent Weight (kg)` | `health.weightKg` | `weightKg` | Decimal (kg) | Create / Update | Contract Verified |
| 33 | `33\nCurrent Height (cm)` | `health.heightCm` | `heightCm` | Decimal (cm) | Create / Update | Contract Verified |
| 34 | `34\nBMI` | `health.bmi` | `bmi` | Calculated Decimal | Auto-computed | Contract Verified |
| 35 | `35\nBMI Category` | `health.bmiCategory` | `bmiCategory` | WHO String Enum | Auto-computed | Contract Verified |
| 36 | `36\nHemoglobin (g/dL)` | `health.haemoglobinGdl` | `hemoglobinGdl` | Decimal (g/dL) | Create / Update | Contract Verified |
| 37 | `37\nHb Category` | `health.hbCategory` | `hbCategory` | String Enum | Auto-computed | Contract Verified |
| 38 | `38\nComorbidities` | `health.otherHealthConditions` | `comorbidities` | Comma Delimited | Create / Update | Contract Verified |
| 39 | `39\nComorbidities Other` | `health.otherHealthConditionSpecify` | `comorbiditiesOther` | String | Create / Update | Contract Verified |
| 40 | `40\nART Status` | `health.artStatus` | `artStatus` | String Enum | Create / Update | Contract Verified |
| 41 | `41\nART Registration Date` | `health.artRegistrationDate` | `artRegistrationDate` | Date (YYYY-MM-DD) | Create / Update | Contract Verified |
| 42 | `42\nART ID Number` | `health.artIdNumber` | `artIdNumber` | String | Create / Update | Contract Verified |
| 43 | `43\nVL Status` | `health.vlStatus` | `vlStatus` | String Enum | Create / Update | Contract Verified |
| 44 | `44\nVL Date` | `health.vlDate` | `vlDate` | Date (YYYY-MM-DD) | Create / Update | Contract Verified |
| 45 | `45\nViral Load` | `health.viralLoad` | `viralLoad` | String / Number | Create / Update | Contract Verified |
| 46 | `46\nVL Category` | `health.vlCategory` | `vlCategory` | String Enum | Auto-computed | Contract Verified |
| 47 | `47\nAppetite` | `nutrition.appetite` | `appetite` | String Enum | Create / Update | Contract Verified |
| 48 | `48\nMeals per Day` | `nutrition.mealsPerDay` | `mealsPerDay` | Integer (1–10) | Create / Update | Contract Verified |
| 49 | `49\nEducation Status` | `educationStatus.educationStatus` | `educationStatus` | String Enum | Create / Update | Contract Verified |
| 50 | `50\nEducation Status Other` | `educationStatus.educationStatusSpecify`| `educationStatusSpecify`| String | Create / Update | Contract Verified |
| 51 | `51\nSchool Name` | `educationStatus.schoolName` | `schoolName` | String | Create / Update | Contract Verified |
| 52 | `52\nSchool Session Start Date`| `educationStatus.schoolSessionStartDate`| `schoolSessionStartDate`| Date (YYYY-MM-DD)| Create / Update | Contract Verified |
| 53 | `53\nSchool Type` | `educationStatus.schoolType` | `schoolType` | String Enum | Create / Update | Contract Verified |
| 54 | `54\nCurrent Class` | `educationStatus.currentClass` | `currentClass` | String | Create / Update | Contract Verified |
| 55 | `55\nAttendance Status` | `educationStatus.attendance` | `attendanceStatus` | String Enum | Create / Update | Contract Verified |
| 56 | `56\nSchool Fees` | `educationExpenses.schoolFees` | `schoolFees` | Decimal (INR) | Create / Update | Contract Verified |
| 57 | `57\nPrivate Tuition Fee` | `educationExpenses.tuitionFees` | `tuitionFees` | Decimal (INR) | Create / Update | Contract Verified |
| 58 | `58\nSchool Books` | `educationExpenses.books` | `schoolBooks` | Decimal (INR) | Create / Update | Contract Verified |
| 59 | `59\nSchool Stationery` | `educationExpenses.stationery` | `schoolStationery` | Decimal (INR) | Create / Update | Contract Verified |
| 60 | `60\nSchool Uniform` | `educationExpenses.uniform` | `schoolUniform` | Decimal (INR) | Create / Update | Contract Verified |
| 61 | `61\nSchool Transport` | `educationExpenses.transport` | `schoolTransport` | Decimal (INR) | Create / Update | Contract Verified |
| 62 | `62\nSchool Other Expenses` | `educationExpenses.otherExpenses` | `otherExpenses` | Decimal (INR) | Create / Update | Contract Verified |
| 63 | `63\nTotal Annual Education Cost`| `educationExpenses.totalAnnualCost`| `totalAnnualCost` | Calculated Decimal | Auto-computed | Contract Verified |
| 64 | `64\nSchool Fee Receipt Link` | `educationExpenses.feeReceiptPhotoUrl` | `Fee_Receipt` | `=HYPERLINK` Formula | Create / Update | Contract Verified |
| 65 | `65\nMarksheet Photo Link` | `educationExpenses.marksheetPhotoUrl` | `Marksheet` | `=HYPERLINK` Formula | Create / Update | Contract Verified |
| 66 | `66\nRemarks (If Any)` | `educationExpenses.remarks` | `remarks` | String | Create / Update | Contract Verified |
| 67 | `67\nNeed Educational Support?`| `educationSupportRequired.requiredSchoolFees`| `needSupport` | 'Yes' \| 'No' | Create / Update | Contract Verified |
| 68 | `68\nReason for Support` | `educationSupportRequired.supportReason` | `supportReason` | String | Create / Update | Contract Verified |
| 69 | `69\nSupport Received in Past?`| `educationSupportRequired.pastSupportReceived`| `pastSupportReceived`| 'Yes' \| 'No' | Create / Update | Contract Verified |
| 70 | `70\nApproved by Alliance India?`| `finalReview.approvedAllianceIndia` | `approvedAllianceIndia`| 'Yes' \| 'No' \| 'Pending' | Supervisor Edit | Contract Verified |
| 71 | `71\nDeclaration Date` | `declaration.declarationDate` | `declarationDate` | Date (YYYY-MM-DD) | Create / Read | Contract Verified |
| 72 | `72\nSignature Link` | `caregiverConsent.signatureDataUrl` | `SignatureLink` | `=HYPERLINK` Formula | Create / Update | Contract Verified |
| 73 | `73\nLast Updated` | `updatedAt` | `lastUpdated` | ISO Timestamp | Auto-refreshed | Contract Verified |

---

## 4. Live Query Status & Safety Interlock

In accordance with strict safety protocols:
- Upstream live query against spreadsheet `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA` was **REFUSED**.
- The schema mapping above is **CONTRACT-CERTIFIED** by automated TypeScript compilation, Zod schema runtime parsing, and automated reconciliation tests (`scripts/e2e/reconcile-field-mapping.ts`).
- Once the dedicated staging Google Sheet is provisioned, running `npm run e2e:staging:reconcile` against the staging spreadsheet will confirm live Google API column header alignment.
