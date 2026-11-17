# Assessment Question & Support Category Mapping
**Document Version:** 1.0.0 (Phase 3 Needs-Based Assessment Architecture)  
**Target Branch:** `gcp-migration`  
**Scope:** Intake Form Single Source of Truth (`formRules.ts`, `submissionSchema.ts`, `gas/Code.js`)

---

## 1. Executive Summary & Objective

The objective of the Needs-Based Assessment Form is to **reduce field caseworker data-entry fatigue** by conditionally displaying only the form sections and questions pertinent to the assistance requested (Education, Nutrition, or HIV-related support), while strictly maintaining:
1. Zero regressions on existing validated assessments and legacy records.
2. Complete integrity of the **83-column Google Sheet linelist contract** (`Child_Nutrition_Phase3_Linelist`).
3. Google Drive / GCS structured folder hierarchies (`State -> SSR -> Child Unique ID`).
4. Full backward compatibility with offline IndexedDB drafts.
5. Strict segregation between field-worker intake and post-approval bank document workflows.

---

## 2. Support Categories & Applicability Matrix

### 2.1 The 3 Support Categories & Select-All Helper
| Category Identifier | User-Facing Label | Domain Purpose |
| :--- | :--- | :--- |
| `education` | **Education** | School enrolment, tuition, books, uniform, scheme benefits, fee receipts |
| `nutrition` | **Nutrition** | Anthropometry (weight/height/BMI), appetite, meals, malnutrition symptoms |
| `hiv_support` | **HIV-related support** | ART status, regimen, CD4, viral load suppression, clinical follow-up |
| *(UI Control only)* | **All categories** | Select-all / deselect-all toggle. **Never persisted as a raw category value.** |

### 2.2 Section Applicability Matrix
| Section Key | Section Title | Always Common | Education | Nutrition | HIV Support | Applicable When Selected |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `sec-consent` | 01. Caregiver Consent | **YES** | - | - | - | **Always visible** |
| `sec-child` | 02. Child Demographics | **YES** | - | - | - | **Always visible** |
| `sec-banking` | 03. Banking & KYC | **YES** | - | - | - | **Always visible** *(optional at intake)* |
| `sec-household` | 04. Household & Financial | **YES** | - | - | - | **Always visible** |
| `sec-health` | 05. Health & Clinical | No | - | **YES\*** | **YES** | Selected: `nutrition` OR `hiv_support` |
| `sec-nutrition` | 06. Nutrition Habits | No | - | **YES** | - | Selected: `nutrition` |
| `sec-education` | 07. Education Status | No | **YES** | - | - | Selected: `education` |
| `sec-expenses` | 08. Education Expenses & Proofs | No | **YES** | - | - | Selected: `education` |
| `sec-review` | 09. Final Review & Confirmation | **YES** | - | - | - | **Always visible** |

*\*Note on Section 05 (Health & Clinical) under Nutrition-only:*  
When `nutrition` is selected without `hiv_support`, anthropometric fields (`weightKg`, `heightCm`, `haemoglobinGdl`) are required for BMI & nutritional classification, but HIV/ART fields (`artStatus`, `vlStatus`, `cd4Count`, `artMedicineType`) are suppressed.

---

## 3. Comprehensive Field-by-Field Inventory & Category Mapping

### Section 1: Caregiver Consent & Attestation (Common / Always Required)
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `caregiverConsent.consentProvided` | Caregiver Consent | Common | No | Required (`true`) | Col 5 | - | None |
| `caregiverConsent.signatureDataUrl` | Caregiver Signature / Thumb | Common | No | Required | Col 6 | `Signature` | None |
| `caregiverConsent.caregiverName` | Caregiver Name for Consent | Common | No | Required (>=2 chars) | Col 14 | - | None |
| `caregiverConsent.caregiverRelationship` | Caregiver Relationship | Common | No | Required | Col 15 | - | None |

---

### Section 2: Child Demographics & Geography (Common / Always Required)
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `demographics.artNumber` | Unique / Reference ID | Common | No | Auto-generated / Required | Col 1 | - | None |
| `demographics.dateOfFilling` | Date of Assessment | Common | No | Auto / ISO Date | Col 7 | - | None |
| `demographics.interviewerName` | Interviewer Name | Common | No | Required | Col 8 | - | None |
| `demographics.childName` | Child Full Name | Common | No | Required (>=2 chars) | Col 9 | - | None |
| `demographics.dob` | Date of Birth | Common | No | Required (past date) | Col 10 | - | None |
| `demographics.calculatedAgeYears` | Age (Years) | Common | No | Calculated from DOB | Col 11 | - | None |
| `demographics.gender` | Child Gender | Common | No | Required | Col 12 | - | None |
| `demographics.orphanStatus` | Orphan Status | Common | No | Required | Col 13 | - | **Owner Decision Required:** Is Orphan Status strictly common or indicative of HIV vulnerability? (Proposed: Common) |
| `demographics.contactNumber` | Caregiver Mobile Number | Common | No | Required (10-digit Indian) | Col 16 | - | None |
| `demographics.noPhoneAvailable` | No Phone Available Flag | Common | No | Optional boolean | - | - | None |
| `demographics.alternateContactNumber` | Alternate Contact | Common | No | Optional | - | - | None |
| `demographics.residenceType` | Type of Residence | Common | No | Optional | - | - | None |
| `demographics.fullAddress` | Full Address | Common | No | Required (>=3 chars) | Col 17 | - | None |
| `demographics.state` | State / UT | Common | No | Required | Col 18 | - | None |
| `demographics.district` | District | Common | No | Required (Combobox + Other) | Col 19 | - | None |
| `demographics.pinCode` | PIN Code | Common | No | Optional / 6 digits | - | - | None |
| `demographics.childAadhaarNumber` | Child Aadhaar Number | Common | No | Optional at intake | Col 24 | - | None |
| `demographics.srName` | State Sub-Recipient (SR) | Common | No | Populated from profile | Col 74 | - | None |
| `demographics.ssrName` | SSR Name | Common | No | Populated from profile | Col 75 | - | None |
| `demographics.guardianStatus` | Status of Guardian/Parent | Common | No | Optional | Col 76 | - | None |

---

### Section 3: Banking & KYC (Common / Optional at Intake)
*Collected at intake if available, but not blocking. Required post-approval before disbursement.*
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `bankingAndKyc.bankAccountHolderName` | Account Holder Name | Common | No | Optional at intake | Col 20 | - | None |
| `bankingAndKyc.bankAccountNumber` | Account Number | Common | No | Optional at intake | Col 21 | - | None |
| `bankingAndKyc.bankIfscCode` | IFSC Code | Common | No | Optional at intake | Col 22 | - | None |
| `bankingAndKyc.bankLinkedMobileNumber` | Bank Mobile | Common | No | Optional at intake | Col 23 | - | None |
| `bankingAndKyc.passbookPhotoUrl` | Passbook Front Page | Common | No | Optional at intake | Col 25 | `Passbook` | None |
| `bankingAndKyc.aadhaarCardPhotoUrl` | Aadhaar Card | Common | No | Optional at intake | Col 26 | `Aadhaar` | None |
| `bankingAndKyc.childPhotoUrl` | Beneficiary Photo | Common | No | Optional at intake | Col 27 | `Child_Photo` | None |

---

### Section 4: Household & Socio-Economic (Common / Always Required)
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `householdFinancial.totalFamilyMembers` | Total Family Members | Common | No | Required (>=1) | Col 28 | - | None |
| `householdFinancial.numberOfChildrenUnder18` | Children Under 18 | Common | No | Required (>=0) | Col 29 | - | None |
| `householdFinancial.monthlyIncomeRs` | Monthly Household Income | Common | No | Required (>=0) | Col 30 | - | None |
| `householdFinancial.mainSourceOfIncome` | Primary Source of Income | Common | No | Required | Col 31 | - | None |

---

### Section 5: Health & Clinical (Conditional: Nutrition & HIV-Related Support)
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `health.weightKg` | Current Weight (kg) | Nutrition / HIV | **YES** | Required if Nutrition or HIV (1-150 kg) | Col 32 | - | Shared by Nutrition & Clinical |
| `health.heightCm` | Current Height (cm) | Nutrition / HIV | **YES** | Required if Nutrition or HIV (1-220 cm) | Col 33 | - | Shared by Nutrition & Clinical |
| `health.bmi` | BMI | Nutrition / HIV | **YES** | Calculated | Col 34 | - | None |
| `health.bmiCategory` | BMI Category | Nutrition / HIV | **YES** | Calculated WHO Z-score | Col 35 | - | None |
| `health.haemoglobinGdl` | Hemoglobin (g/dL) | Nutrition / HIV | **YES** | Optional (1-25 g/dL) | Col 36 | - | Shared by Nutrition & Clinical |
| `health.hbCategory` | Hb Category | Nutrition / HIV | **YES** | Calculated | Col 37 | - | None |
| `health.otherHealthConditions` | Comorbidities | HIV Support | No | Optional | Col 38 | - | None |
| `health.otherHealthConditionSpecify` | Comorbidities (Other) | HIV Support | No | Conditional | Col 39 | - | None |
| `health.artStatus` | ART Status | HIV Support | No | Required if HIV-support | Col 40 | - | **Owner Decision:** For Education-only assessments, ART status is suppressed to prevent forced HIV disclosure. |
| `health.artRegistrationDate` | ART Registration Date | HIV Support | No | Optional | Col 41 | - | None |
| `health.artInitiationDate` | On ART Since | HIV Support | No | Required if On ART | Col 41 | - | None |
| `health.artIdNumber` | Clinical ART ID | HIV Support | No | Required if On ART | Col 42 | - | None |
| `health.vlStatus` | Viral Load Status | HIV Support | No | Required if HIV-support | Col 43 | - | None |
| `health.vlDate` | Viral Load Date | HIV Support | No | Required if Suppressed/Unsuppressed | Col 44 | - | None |
| `health.viralLoad` | Viral Load Count | HIV Support | No | Required if Suppressed/Unsuppressed | Col 45 | - | None |
| `health.vlCategory` | VL Category | HIV Support | No | Calculated Policy | Col 46 | - | None |
| `health.artMedicineType` | Type of ART Medicines | HIV Support | No | Required if on regimen | Col 77 | - | None |
| `health.currentlyOnArt` | Currently Taking ART | HIV Support | No | Required if Transferred In | - | - | None |
| `health.cd4Count` | CD4 Count (Latest) | HIV Support | No | Optional | Col 78 | - | None |
| `health.hasDisability` | Is Child with Disability | HIV Support | No | Required if HIV-support | Col 79 | - | **Owner Decision Required:** Should Disability be Common or HIV-only? (Proposed: HIV-support, or Common if cross-disability aid is envisioned) |
| `health.disabilityType` | Type of Disability | HIV Support | No | Required if Disability === Yes | Col 80 | - | None |
| `health.disabilityCertificateStatus` | Disability Certificate | HIV Support | No | Required if Disability === Yes | Col 81 | - | None |

---

### Section 6: Nutrition Habits (Conditional: Nutrition Only)
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `nutrition.appetite` | Child Appetite | Nutrition | No | Required if Nutrition | Col 47 | - | None |
| `nutrition.mealsPerDay` | Meals per Day | Nutrition | No | Required (1-10) if Nutrition | Col 48 | - | None |
| `nutrition.malnutritionSymptoms` | Malnutrition Symptoms | Nutrition | No | Optional string | Col 83 | - | None |

---

### Section 7: Education Status (Conditional: Education Only)
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `educationStatus.educationStatus` | Education Status | Education | No | Required if Education | Col 49 | - | None |
| `educationStatus.educationStatusSpecify`| Education Status (Other) | Education | No | Required if Status === Other | Col 50 | - | None |
| `educationStatus.schoolName` | School Name | Education | No | Required if enrolled | Col 51 | - | None |
| `educationStatus.schoolSessionStartDate`| Session Start Date | Education | No | Optional | Col 52 | - | None |
| `educationStatus.schoolType` | School Type | Education | No | Required if enrolled | Col 53 | - | None |
| `educationStatus.currentClass` | Current Class / Grade | Education | No | Required if enrolled | Col 54 | - | None |
| `educationStatus.currentClassSpecify` | Specified Class / Course | Education | No | Required if Class === Other | - | - | None |
| `educationStatus.attendance` | Attendance Regularity | Education | No | Required if enrolled | Col 55 | - | None |
| `educationStatus.receivingEducationSchemeBenefit` | Scheme Benefit Received | Education | No | Required if Education | Col 82 | - | None |
| `educationStatus.educationSchemeName` | Scheme Name | Education | No | Required if Benefit === Yes/Applied | - | - | None |
| `educationStatus.educationSchemeNameSpecify`| Specified Scheme Name | Education | No | Required if Other / State Scheme | - | - | None |

---

### Section 8: Education Expenses & Document Proofs (Conditional: Education Only)
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `educationExpenses.schoolFees` | School Fees (₹) | Education | No | Numeric (>=0) | Col 56 | - | None |
| `educationExpenses.tuitionFees` | Private Tuition Fee (₹) | Education | No | Numeric (>=0) | Col 57 | - | None |
| `educationExpenses.books` | School Books (₹) | Education | No | Numeric (>=0) | Col 58 | - | None |
| `educationExpenses.stationery` | School Stationery (₹) | Education | No | Numeric (>=0) | Col 59 | - | None |
| `educationExpenses.uniform` | School Uniform (₹) | Education | No | Numeric (>=0) | Col 60 | - | None |
| `educationExpenses.transport` | School Transport (₹) | Education | No | Numeric (>=0) | Col 61 | - | None |
| `educationExpenses.otherExpenses` | Other Expenses (₹) | Education | No | Numeric (>=0) | Col 62 | - | None |
| `educationExpenses.totalAnnualCost` | Total Annual Cost (₹) | Education | No | Auto-calculated | Col 63 | - | None |
| `educationExpenses.feeReceiptPhotoUrl` | School Fee Receipt Link | Education | No | Required if enrolled (or marksheet/remarks) | Col 64 | `Fee_Receipt` | None |
| `educationExpenses.marksheetPhotoUrl` | Marksheet Photo Link | Education | No | Alternative to fee receipt | Col 65 | `Marksheet` | None |
| `educationExpenses.remarks` | Remarks / Justification | Education | No | Required if neither receipt nor marksheet | Col 66 | - | None |
| `educationSupportRequired.*` | Breakdown of Support Needed | Education | No | Optional breakdown | - | - | None |

---

### Section 9: Governance & Final Review (Common / Always Required)
| Field Key | Label | Category | Multi-Cat? | Rule | Sheet Col | Doc Slot | Business Rule Uncertainty |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `finalReview.approvedAllianceIndia` | Programme Approval Status | Common | No | Defaults to `Pending` | Col 67 | - | None |
| `finalReview.allInfoCorrect` | Review Confirmed | Common | No | Required (`true`) | Col 68 | - | None |
| `finalReview.organizationName` | Organization Name | Common | No | Required | Col 69 | - | None |
| `finalReview.formSubmittedBy` | Form Submitted By | Common | No | Required (>=2 chars) | Col 70 | - | None |
| `finalReview.organizationEmail` | Organization Email | Common | No | Optional / Valid Email | Col 71 | - | None |
| `syncNeeded` | Sync Needed | Common | No | System | Col 72 | - | None |
| `updatedAt` | Last Updated | Common | No | System ISO Timestamp | Col 73 | - | None |

---

## 4. Impact Analysis & System Invariants

### 4.1 Client & Server Validation
- **Invariant:** Non-applicable fields are omitted from schema enforcement. A caseworker requesting Education support only is NEVER blocked by empty `artStatus` or empty `appetite`.
- **Server Guard:** The backend derives applicable fields from the submitted `supportCategories` array independently of the browser. Unknown category values or empty arrays are rejected with `400 Bad Request`.

### 4.2 Legacy Records & Backward Compatibility
- Assessments submitted prior to Schema Version 3 lack `supportCategories`.
- **Legacy Rule:** Records with `schemaVersion < 3` or missing `supportCategories` default to legacy mode (`categories = []`), where all sections remain visible and editable according to existing RBAC permissions. No mass backfill is performed without dry-run approval.

### 4.3 Google Sheet 83-Column Linelist Mirroring
- **Column Order:** Columns 1 through 83 remain strictly unchanged.
- **Empty-Value Handling:** Non-applicable fields for a specific submission are mirrored as empty cells `""` (or `0` for numeric expense sums), exactly matching existing Apps Script empty-value semantics. Unrelated columns are NEVER overwritten.

### 4.4 Google Drive & Storage Placement
- The established folder hierarchy `Alliance India Child PDFs -> [State] -> [SSR] -> [Child Unique ID]` is strictly preserved.
- Only documents relevant to the chosen categories (`Fee_Receipt` and `Marksheet` for Education; `Signature`, `Passbook`, `Aadhaar`, `Child_Photo` for KYC) are requested and archived.

### 4.5 State Team & Leadership Evaluation Portal
- State Reviewers and Leadership see the selected `supportCategories` badge on assessment detail cards.
- State-wide linelist totals count each multi-category submission as **one assessment**, avoiding double counting while allowing category-specific metric filtering.

---

## 5. Ambiguous Programme Rules — Owner Decision Required

1. **Child Disability (`hasDisability`):**  
   *Current Placement:* Health & Clinical (`sec-health`).  
   *Question:* Should disability status remain exclusive to HIV-related support, or should it be elevated to Section 2 (Common Demographics) so education and nutrition caseworkers can flag assistive device requirements?  
   *Recommendation:* Keep in Section 5 (Clinical) for now to minimize changes, pending owner decision.

2. **Orphan Status & Household Vulnerability:**  
   *Current Placement:* Common (`sec-child` and `sec-household`).  
   *Question:* Should `orphanStatus` and `monthlyIncomeRs` be requested for all beneficiaries?  
   *Recommendation:* Yes. Financial and parental vulnerability criteria govern eligibility across all Alliance India grant streams.

3. **Post-Submission Category Modifications:**  
   *Question:* Can a State Team reviewer or Field Caseworker add an additional support category (e.g., adding Nutrition to an approved Education grant)?  
   *Recommendation:* Adding or changing categories to an already-submitted/approved record should require an explicit Leadership re-evaluation rather than direct inline edit.
