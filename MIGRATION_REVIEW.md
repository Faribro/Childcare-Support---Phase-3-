# Supabase Core Schema Foundation — Security Audit & Migration Review (`MIGRATION_REVIEW.md`)

> [!IMPORTANT]
> **Explicit Non-Execution & Data Safety Statement**
> - **No production or remote database migration has been applied.**
> - **No remote Supabase project schema, table, policy, or secret has been created or modified.**
> - **No real beneficiary data has been imported, moved, queried, or deleted.**
> - **No Tigris object storage bucket or production environment configuration has been modified.**
> - All verification and schema validation tests in this branch operate strictly against local static SQL contracts and synthetic test fixtures.

---

## 1. Source-of-Truth Decision

| Layer | Role in Phase 3 Architecture | Write Path | Read Path | Failure Mode |
| :--- | :--- | :--- | :--- | :--- |
| **Supabase PostgreSQL** (`public.submissions`, `public.submission_files`, `public.audit_events`) | **Canonical Structured-Data Source of Truth** | Synchronous ACID transaction from Next.js API routes (`/api/submit`, `/api/submissions/[id]`, `/api/submissions/[id]/asset`) | Primary read source for `/api/submissions`, `/api/submissions/summary`, `/api/submissions/[id]`, and `/api/submissions/[id]/export` | Hard fail-closed if database transaction fails; client retains encrypted IndexedDB offline draft for retry |
| **Tigris S3 Object Storage** (`childcare-support-phase3-private`) | **Canonical Private Binary Store** (signatures, Aadhaar proof, ART cards, supporting docs) | Streamed via server-side API route after SHA-256 & `cell_state_hash` OCC verification; metadata recorded in `public.submission_files` | Authenticated, scope-checked server-side streaming proxy (`/api/submissions/[id]/asset?docType=...`); never directly public | Upload rejected if OCC hash mismatches or bucket write fails |
| **Google Sheets** (`Child_Nutrition`, `_Asset_Containers`, `Audit_Log`) | **Asynchronous Reporting Mirror Only** | Populated asynchronously via `public.sheets_mirror_jobs` outbox worker calling Google Apps Script (`WEBHOOK_SECRET`) | **Never used as an authorization source**; legacy read fallback only during dual-read cutover window | Outbox retries with exponential backoff (`QUEUED` -> `FAILED` -> `DEAD_LETTER`) without blocking field submissions |

---

## 2. Audit of Draft PR #73 (`3649dcc55e302e0ff73703f0e609dffe2b808e9e`)

### a. Approved Mappings
- **4-Table Core Topology**: Separating `public.submissions` (structured assessment + `form_payload` JSONB), `public.submission_files` (private Tigris object metadata), `public.sheets_mirror_jobs` (asynchronous reporting outbox), and `public.audit_events` (immutable audit trail) cleanly decouples field writes from Google Apps Script latency.
- **Hybrid Relational + JSONB Pattern**: Promoting frequently filtered/aggregated attributes (`unique_id`, `state`, `district`, `block`, `village`, `child_name`, `dob`, `age_years`, `age_months`, `gender`, `aadhaar_last4`, `orphan_status`, `caregiver_name`, `caregiver_relationship`, `caregiver_phone`, `monthly_income`, `muac_cm`, `bmi`, `z_score`, `nutritional_status`, `status`, `version`) to typed columns while storing the complete 8-step `SubmissionFormData` in `form_payload JSONB` preserves fast SQL filtering alongside lossless 73-column reconstruction.
- **Aadhaar Minimization**: Restricting `aadhaar_last4` to `^\d{4}$` and never persisting full 12-digit Aadhaar numbers aligns with DPDP Act data-minimization rules.

### b. Missing Fields or Tables Identified in Draft PR #73 (Corrected in This Branch)
1. **Programme Scope (`programme_id`)**: Draft PR #73 lacked a `programme_id` column on `public.submissions`, preventing RLS and server queries from constraining `FIELD_USER` access by assigned programme (`programme_id TEXT NOT NULL DEFAULT 'alliance-childcare-phase3'`).
2. **Column 48 Collision (`meals_per_day` vs `edit_reason`)**: In `gas/Code.js`, Column 48 is `"48\nMeals per Day"` (`nutritionHabits.mealsPerDay`), whereas supervisor OCC edits pass `editReason`. Draft PR #73 omitted both columns from `public.submissions`. We added explicit `meals_per_day INTEGER` (Col 48) and `edit_reason TEXT` columns so OCC edits never overwrite nutrition data.
3. **Clinical, Anthropometry, and Grant Columns**: Added `weight_kg` (Col 33), `height_cm` (Col 34), `haemoglobin_gdl` (Col 40), `hb_category` (Col 41), `viral_load` (Col 45), `vl_category` (Col 46), `total_required_support` (Step 8), `grant_recommended`, and `recommended_grant_amount` to `public.submissions` for direct SQL aggregation.
4. **Asset OCC Hash (`cell_state_hash`)**: Added `cell_state_hash` (`^[a-fA-F0-9]{64}$`) to both `public.submissions` and `public.submission_files` to back `expectedCurrentCellStateHash` in `POST /api/submissions/[submissionId]/asset`.

### c. Incorrect or Ambiguous Mappings Identified in Draft PR #73 (Corrected in This Branch)
1. **Col 1 (`1\nUnique ID`) vs Col 42 (`42\nART ID Number`)**: Draft PR #73's report conflated `demographics.artNumber` with Col 1 (`1\nUnique ID`). In canonical production data, Col 1 is the system-generated beneficiary record ID (`unique_id`, e.g., `MH-PUN-081200-02`), while `art_number` maps to `demographics.artNumber` / Col 42 (`42\nART ID Number`).
2. **`client_submission_id` Type**: Draft PR #73 typed `client_submission_id` as `UUID NOT NULL`, which rejects reconciled legacy IDs (such as `MH-PUN-081200-02`). Changed to `TEXT NOT NULL UNIQUE` so both UUID v4 client keys and canonical record IDs are supported idempotently.
3. **Col 5 (`5\nConsent Obtained`)**: Added explicit `consent_provided BOOLEAN NOT NULL DEFAULT true CHECK (consent_provided = true)` on `public.submissions` so database constraints reject any unconsented write.
4. **Col 68 (`68\nReview Confirmed`)**: Changed `review_confirmed` from `TEXT` to `BOOLEAN NOT NULL DEFAULT false` to match `finalReview.reviewConfirmed` (`z.boolean().optional()`) in `src/lib/validations/submissionSchema.ts`.
5. **`target_sheet_name` Default**: Draft PR #73 defaulted `target_sheet_name` to `'Assessment_Linelist'`. In `gas/Code.js`, the canonical tab names are `'Child_Nutrition'`, `'_Asset_Containers'`, and `'Audit_Log'`. Updated `target_sheet_name` default to `'Child_Nutrition'` with a `CHECK` constraint permitting only those three canonical sheet names.

### d. Authorization / RLS Risks Identified in Draft PR #73 (Corrected in This Branch)
1. **`FIELD_USER` Missing District & Programme Scope in RLS**: Draft PR #73 allowed `FIELD_USER` to `SELECT` any row matching `(auth.jwt() -> 'allowedStates') ? state`, ignoring `allowedDistricts` and `programme_id`. Fixed via `public.jwt_has_state(state) AND public.jwt_has_district(district) AND public.jwt_has_programme(programme_id)`.
2. **Role Name Mismatch in `UPDATE` Policy**: Draft PR #73 checked `'caseworker'` instead of `'FIELD_USER'` in `authenticated_update_submissions`, and omitted district/programme checks. Fixed to use canonical roles (`FIELD_USER`, `STATE_REVIEWER`, `LEADERSHIP`, `ADMIN`).
3. **Missing `isVerified` Enforcement**: Added `public.jwt_is_verified()` across all policies so unverified tokens (`isVerified: false`) are denied even if a role claim is present.
4. **Over-Permissive Grants on `submission_files`**: Draft PR #73 granted `UPDATE, DELETE` on `public.submission_files` to `authenticated` without corresponding RLS policies. Revoked `UPDATE, DELETE` on `submission_files` from `authenticated` and restricted `DELETE` on `public.submissions` strictly to `ADMIN` and `LEADERSHIP`.

### e. Data-Integrity Risks Identified in Draft PR #73 (Corrected in This Branch)
- Added `trg_submissions_enforce_occ` trigger (`public.tg_enforce_submissions_occ()`) to enforce monotonic `version = OLD.version + 1` on domain updates (`SQLSTATE '40001'`).
- Added `trg_submissions_set_updated_at`, `trg_submission_files_set_updated_at`, and `trg_sheets_mirror_jobs_set_updated_at` triggers so `updated_at` is always server-maintained.
- Added `chk_submissions_orphan_status` and `chk_submissions_caregiver_phone` (`^\d{10}$`) constraints matching `submissionSchema.ts`.
- Added `uq_submission_files_submission_doc UNIQUE (submission_id, doc_type)` so each document slot per submission has a deterministic canonical row.

### f. Sync and Idempotency Concerns (Corrected in This Branch)
- **Transactional Outbox Guarantee**: Added `trg_submissions_enqueue_sheets_mirror` (`public.tg_enqueue_sheets_mirror_job()`) so every `INSERT` or version-incrementing `UPDATE` on `public.submissions` atomically enqueues an idempotent `UPSERT_ROW:<unique_id>:v<version>` job in `public.sheets_mirror_jobs` within the same PostgreSQL transaction.
- **Worker Lease & Dead-Letter Handling**: Added `locked_at`, `locked_by`, and `sheet_row` to `public.sheets_mirror_jobs` to prevent concurrent workers from double-pushing the same row to Google Apps Script, transitioning exhausted jobs (`attempt_count >= max_attempts`) to `DEAD_LETTER` and `submissions.sync_status = 'DEAD_LETTER'`.

### g. Tigris Object-Storage Concerns (Corrected in This Branch)
- `public.submission_files` stores **only** `bucket_name`, private `storage_key`, `mime_type`, `size_bytes`, `sha256_checksum`, and `cell_state_hash`.
- Added `chk_submission_files_no_signed_url_in_key` (`storage_key !~* '(https?://|X-Amz-Signature|AWSAccessKeyId)'`) so presigned URLs or credentials can never be stored in `storage_key`.
- Added `is_restricted_doc BOOLEAN NOT NULL DEFAULT true CHECK (is_restricted_doc = true)` and `sanitized_sheet_label TEXT GENERATED ALWAYS AS ('Restricted Doc [' || doc_type || ']') STORED`.

### h. Google Sheets Reporting-Mirror Concerns (Corrected in This Branch)
- Added `chk_sheets_mirror_payload_sanitized` on `public.sheets_mirror_jobs` (`payload_snapshot::text !~* '(X-Amz-Signature|childcare-support-phase3-private|s3\.amazonaws\.com|fly\.storage\.tigris\.dev)'`) so raw Tigris object keys or presigned URLs are rejected at the database constraint level before they can ever be sent to Google Sheets.
- Preserved `_Asset_Containers` and `"Restricted Doc [<docType>]"` labels in `tg_enqueue_sheets_mirror_job()`.

### i. Required Changes Before Migration Approval
All schema-level fixes identified in `b` through `h` have been incorporated into [`supabase/migrations/20261012170000_core_schema_foundation.sql`](file:///d:/OneDrive%20-%20INDIA%20HIV%20AIDS%20ALLIANCE/Desktop/Software%20Development/Childcare-Support-Phase-3%281%29/supabase/migrations/20261012170000_core_schema_foundation.sql). Before executing `supabase db push` against a remote project, the owner must approve the operational cutover decisions listed in Section 9.

---

## 3. Complete 73-Column Google Sheets (`Child_Nutrition`) & PWA to Supabase Mapping

Every single column in `gas/Code.js` (`EXPECTED_HEADERS`, Columns 1–73) is accounted for below:

| Sheet Col # | Canonical Sheet Header (`gas/Code.js`) | PWA Zod Path (`submissionSchema.ts`) | Supabase Table & Column | JSONB Path in `submissions.form_payload` | Mirror Sanitization / Notes |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | `1\nUnique ID` | Server-generated / `uniqueId` | `submissions.unique_id` | `$.uniqueId` | Canonical record ID (e.g. `MH-PUN-081200-02`) |
| **2** | `2\nTimestamp` | Server timestamp | `submissions.submitted_at` | `$.submittedAt` | ISO-8601 UTC timestamp |
| **3** | `3\nAssessment Date` | `location.assessmentDate` | `submissions.assessment_date` | `$.location.assessmentDate` | `DATE` |
| **4** | `4\nSubmitted By` | `location.submittedBy` | `submissions.submitted_by_email` | `$.location.submittedBy` | Authenticated user identifier |
| **5** | `5\nConsent Obtained` | `caregiverConsent.consentProvided` | `submissions.consent_provided` | `$.caregiverConsent.consentProvided` | Enforced `CHECK (consent_provided = true)`; mirrored as `'Yes'` |
| **6** | `6\nCaregiver Signature` | `caregiverConsent.caregiverSignature` | `submissions.caregiver_signature_ref` + `submission_files` (`doc_type='caregiverSignature'`) | `$.caregiverConsent.caregiverSignature` | Mirrored strictly as `'Restricted Doc [caregiverSignature]'` |
| **7** | `7\nVillage` | `location.village` | `submissions.village` | `$.location.village` | Indexed scope/location field |
| **8** | `8\nBlock` | `location.block` | `submissions.block` | `$.location.block` | Block / Taluka |
| **9** | `9\nDistrict` | `location.district` | `submissions.district` | `$.location.district` | Enforced in `FIELD_USER` RLS & API scope |
| **10** | `10\nState` | `location.state` | `submissions.state` | `$.location.state` | Enforced in `FIELD_USER` & `STATE_REVIEWER` RLS |
| **11** | `11\nChild Name` | `demographics.childName` | `submissions.child_name` | `$.demographics.childName` | Masked for `STATE_REVIEWER` unless full-PII policy enabled |
| **12** | `12\nDate of Birth` | `demographics.dob` | `submissions.dob` | `$.demographics.dob` | `DATE` |
| **13** | `13\nAge (Years)` | `demographics.ageYears` | `submissions.age_years` | `$.demographics.ageYears` | `INTEGER` (`0..25`) |
| **14** | `14\nAge (Months)` | `demographics.ageMonths` | `submissions.age_months` | `$.demographics.ageMonths` | `INTEGER` (`0..11`) |
| **15** | `15\nGender` | `demographics.gender` | `submissions.gender` | `$.demographics.gender` | `Male`, `Female`, `Other`, `Transgender` |
| **16** | `16\nAadhaar Last 4` | `demographics.aadhaarLast4` | `submissions.aadhaar_last4` | `$.demographics.aadhaarLast4` | Optional `^\d{4}$`; never full Aadhaar |
| **17** | `17\nOrphan Status` | `demographics.orphanStatus` | `submissions.orphan_status` | `$.demographics.orphanStatus` | Validated enum |
| **18** | `18\nDisability Status` | `demographics.disabilityStatus` | `submissions.form_payload` | `$.demographics.disabilityStatus` | `Yes` / `No` |
| **19** | `19\nType of Disability` | `demographics.disabilityType` | `submissions.form_payload` | `$.demographics.disabilityType` | Array / text in JSONB |
| **20** | `20\nDisability Percentage` | `demographics.disabilityPercentage` | `submissions.form_payload` | `$.demographics.disabilityPercentage` | Numeric (`0..100`) |
| **21** | `21\nCaregiver Name` | `household.caregiverName` | `submissions.caregiver_name` | `$.household.caregiverName` | Primary caregiver name |
| **22** | `22\nRelationship to Child` | `household.relationshipToChild` | `submissions.caregiver_relationship` | `$.household.relationshipToChild` | Relationship enum/text |
| **23** | `23\nPhone Number` | `household.phoneNumber` | `submissions.caregiver_phone` | `$.household.phoneNumber` | Enforced `^\d{10}$` |
| **24** | `24\nMarital Status` | `household.maritalStatus` | `submissions.form_payload` | `$.household.maritalStatus` | Household JSONB |
| **25** | `25\nCaregiver Education` | `household.caregiverEducation` | `submissions.form_payload` | `$.household.caregiverEducation` | Household JSONB |
| **26** | `26\nCaregiver Occupation` | `household.caregiverOccupation` | `submissions.form_payload` | `$.household.caregiverOccupation` | Household JSONB |
| **27** | `27\nTotal Household Members` | `household.totalHouseholdMembers` | `submissions.form_payload` | `$.household.totalHouseholdMembers` | Integer in JSONB |
| **28** | `28\nChildren (0-6 yrs)` | `household.children0to6` | `submissions.form_payload` | `$.household.children0to6` | Integer in JSONB |
| **29** | `29\nChildren (6-18 yrs)` | `household.children6to18` | `submissions.form_payload` | `$.household.children6to18` | Integer in JSONB |
| **30** | `30\nEarning Members` | `household.earningMembers` | `submissions.form_payload` | `$.household.earningMembers` | Integer in JSONB |
| **31** | `31\nMonthly Household Income` | `household.monthlyIncome` | `submissions.monthly_income` | `$.household.monthlyIncome` | `NUMERIC(12,2)` |
| **32** | `32\nBPL / Ration Card Type` | `household.rationCardType` | `submissions.form_payload` | `$.household.rationCardType` | Household JSONB |
| **33** | `33\nWeight (kg)` | `anthropometry.weightKg` | `submissions.weight_kg` | `$.anthropometry.weightKg` | `NUMERIC(5,2)` |
| **34** | `34\nHeight (cm)` | `anthropometry.heightCm` | `submissions.height_cm` | `$.anthropometry.heightCm` | `NUMERIC(5,2)` |
| **35** | `35\nMUAC (cm)` | `anthropometry.muacCm` | `submissions.muac_cm` | `$.anthropometry.muacCm` | `NUMERIC(5,2)` |
| **36** | `36\nBMI` | `anthropometry.bmi` | `submissions.bmi` | `$.anthropometry.bmi` | `NUMERIC(5,2)` |
| **37** | `37\nZ-Score (WHZ/BAZ)` | `anthropometry.zScore` | `submissions.z_score` | `$.anthropometry.zScore` | `NUMERIC(5,2)` |
| **38** | `38\nNutritional Status` | `anthropometry.nutritionalStatus` | `submissions.nutritional_status` | `$.anthropometry.nutritionalStatus` | `SAM`, `MAM`, `Normal`, etc. |
| **39** | `39\nBilateral Pitting Oedema` | `anthropometry.oedema` | `submissions.form_payload` | `$.anthropometry.oedema` | `Yes` / `No` |
| **40** | `40\nHaemoglobin (g/dL)` | `health.haemoglobin` | `submissions.haemoglobin_gdl` | `$.health.haemoglobin` | `NUMERIC(4,1)` |
| **41** | `41\nHb Category` | `health.hbCategory` | `submissions.hb_category` | `$.health.hbCategory` | Clinical anemia classification |
| **42** | `42\nART ID Number` | `demographics.artNumber` / `health.artIdNumber` | `submissions.art_number` | `$.demographics.artNumber` | Distinct from Col 1 (`unique_id`) |
| **43** | `43\nCurrent ART Regimen` | `health.artRegimen` | `submissions.form_payload` | `$.health.artRegimen` | Clinical JSONB |
| **44** | `44\nART Adherence (%)` | `health.artAdherence` | `submissions.form_payload` | `$.health.artAdherence` | Clinical JSONB |
| **45** | `45\nLast Viral Load` | `health.viralLoad` | `submissions.viral_load` | `$.health.viralLoad` | Promoted clinical column |
| **46** | `46\nVL Category` | `health.vlCategory` | `submissions.vl_category` | `$.health.vlCategory` | Suppressed / Unsuppressed / Unknown |
| **47** | `47\nOpportunistic Infections` | `health.opportunisticInfections` | `submissions.form_payload` | `$.health.opportunisticInfections` | Clinical JSONB |
| **48** | `48\nMeals per Day` | `nutritionHabits.mealsPerDay` | `submissions.meals_per_day` | `$.nutritionHabits.mealsPerDay` | Dedicated `INTEGER` column; decoupled from `edit_reason` |
| **49** | `49\nDietary Diversity Score` | `nutritionHabits.dietaryDiversityScore` | `submissions.form_payload` | `$.nutritionHabits.dietaryDiversityScore` | Nutrition JSONB |
| **50** | `50\nFood Security Status` | `nutritionHabits.foodSecurityStatus` | `submissions.form_payload` | `$.nutritionHabits.foodSecurityStatus` | Nutrition JSONB |
| **51** | `51\nTHR Received (ICDS)` | `nutritionHabits.thrReceived` | `submissions.form_payload` | `$.nutritionHabits.thrReceived` | Nutrition JSONB |
| **52** | `52\nMid-Day Meal Accessed` | `nutritionHabits.midDayMeal` | `submissions.form_payload` | `$.nutritionHabits.midDayMeal` | Nutrition JSONB |
| **53** | `53\nEnrolled in School/AWC` | `education.enrolledInSchool` | `submissions.form_payload` | `$.education.enrolledInSchool` | Education JSONB |
| **54** | `54\nSchool / Institution Type` | `education.schoolType` | `submissions.form_payload` | `$.education.schoolType` | Education JSONB |
| **55** | `55\nCurrent Grade / Class` | `education.currentGrade` | `submissions.form_payload` | `$.education.currentGrade` | Education JSONB |
| **56** | `56\nRegular Attendance` | `education.regularAttendance` | `submissions.form_payload` | `$.education.regularAttendance` | Education JSONB |
| **57** | `57\nReason for Dropout/Irregular` | `education.dropoutReason` | `submissions.form_payload` | `$.education.dropoutReason` | Education JSONB |
| **58** | `58\nExisting Govt Schemes` | `socialProtection.existingSchemes` | `submissions.form_payload` | `$.socialProtection.existingSchemes` | Social protection JSONB |
| **59** | `59\nScheme Details` | `socialProtection.schemeDetails` | `submissions.form_payload` | `$.socialProtection.schemeDetails` | Social protection JSONB |
| **60** | `60\nBank Account Available` | `socialProtection.bankAccountAvailable` | `submissions.form_payload` | `$.socialProtection.bankAccountAvailable` | Social protection JSONB |
| **61** | `61\nAccount Holder Type` | `socialProtection.accountHolderType` | `submissions.form_payload` | `$.socialProtection.accountHolderType` | Social protection JSONB |
| **62** | `62\nPriority Needs Identified` | `supportNeeds.priorityNeeds` | `submissions.form_payload` | `$.supportNeeds.priorityNeeds` | Support needs JSONB |
| **63** | `63\nImmediate Referral Made` | `supportNeeds.immediateReferral` | `submissions.form_payload` | `$.supportNeeds.immediateReferral` | Support needs JSONB |
| **64** | `64\nReferral Details` | `supportNeeds.referralDetails` | `submissions.form_payload` | `$.supportNeeds.referralDetails` | Support needs JSONB |
| **65** | `65\nSupporting Documents` | `documents.*` | `submission_files` (rows per `doc_type`) | `$.documents` | Mirrored to Sheets strictly as `'Restricted Doc [<docType>]'` |
| **66** | `66\nCaseworker Observations` | `finalReview.caseworkerObservations` | `submissions.form_payload` | `$.finalReview.caseworkerObservations` | Final review JSONB |
| **67** | `67\nRecommended Action Plan` | `finalReview.recommendedActionPlan` | `submissions.form_payload` | `$.finalReview.recommendedActionPlan` | Final review JSONB |
| **68** | `68\nReview Confirmed` | `finalReview.reviewConfirmed` | `submissions.review_confirmed` | `$.finalReview.reviewConfirmed` | `BOOLEAN` |
| **69** | `69\nWorkflow Status` | `status` | `submissions.status` | `$.status` | `PENDING_REVIEW`, `APPROVED`, etc. |
| **70** | `70\nSupervisor Remarks` | `reviewerNotes` | `submissions.reviewer_notes` | `$.reviewerNotes` | Supervisor review notes |
| **71** | `71\nVersion` | `version` | `submissions.version` | `$.version` | Monotonic OCC version (`>= 1`) |
| **72** | `72\nLast Updated At` | `updatedAt` | `submissions.updated_at` / `last_synced_at` | `$.updatedAt` | Server-maintained `TIMESTAMPTZ` |
| **73** | `73\nLast Updated By` | `lastUpdatedBy` | `submissions.last_updated_by` | `$.lastUpdatedBy` | Actor user ID / email |
| *(Ext)* | *(Programme Scope)* | Session `programmeId` | `submissions.programme_id` | `$.programmeId` | Constrains `FIELD_USER` scope |
| *(Ext)* | *(OCC Edit Reason)* | `PATCH` `editReason` | `submissions.edit_reason` | `$.editReason` | Decoupled from Col 48 (`meals_per_day`) |
| *(Ext)* | *(Education Support Total)* | `educationSupportRequired.totalRequiredSupport` | `submissions.total_required_support` | `$.educationSupportRequired.totalRequiredSupport` | `NUMERIC(10,2)` |

---

## 4. Role and Scope Matrix

| Caller / Role | `isVerified` | State Scope (`allowedStates`) | District Scope (`allowedDistricts`) | Programme Scope (`programme_id`) | List / Summary / Detail Read | Create / Update (`OCC`) | Hard Delete (`DELETE`) | Dossier Export / Asset Stream | PII Visibility |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Unauthenticated (`anonymous-field` / `anon`)** | `false` | `[]` | `[]` | None | **DENIED (`401 UNAUTHORIZED`)** | **DENIED (`401`)** | **DENIED (`401`)** | **DENIED (`401`)** | None (Zero upstream/DB reads) |
| **`FIELD_USER`** | `true` | Assigned state(s) only | Assigned district(s) only | Assigned programme (`alliance-childcare-phase3`) | Allowed **only** within matching `state` + `district` + `programme_id` (`403 FORBIDDEN_SCOPE` otherwise) | Allowed within assigned `state` + `district` + `programme_id` (while `status NOT IN ('APPROVED','ARCHIVED')`) | **DENIED (`403 FORBIDDEN_ROLE`)** | Allowed **only** within assigned `state` + `district` + `programme_id` | Full for records inside assigned district & programme |
| **`STATE_REVIEWER`** | `true` | Assigned state(s) only (cannot tamper with `?state=`) | `['*']` within assigned state | Assigned programme(s) | Allowed within assigned `state` (`403 FORBIDDEN_SCOPE` for other states) | Allowed within assigned `state` (review status, supervisor notes, OCC edits) | **DENIED (`403 FORBIDDEN_ROLE`)** | Allowed within assigned `state` | Masked in list/summary (`maskSensitiveId`, `maskPhoneNumber`); full in authorized review/export |
| **`LEADERSHIP`** | `true` | `['*']` or assigned multi-state list | `['*']` | `['*']` | Allowed across authorized states (auditable via `audit_events`) | Allowed with OCC version check | Allowed (audited) | Allowed (audited) | Full (audited) |
| **`ADMIN`** | `true` | `['*']` | `['*']` | `['*']` | Allowed across all states (audited) | Allowed with OCC version check | Allowed (audited) | Allowed (audited) | Full (audited) |

---

## 5. Row-Level Security (RLS) Policy Summary

All four tables enforce `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, with `REVOKE ALL ... FROM anon, PUBLIC`:

1. **`public.submissions`**:
   - `submissions_select_scoped`: Requires `public.jwt_is_verified() = true`. `ADMIN`/`LEADERSHIP`/`STATE_REVIEWER` require `public.jwt_has_state(state)`. `FIELD_USER` requires `public.jwt_has_state(state) AND public.jwt_has_district(district) AND public.jwt_has_programme(programme_id)`.
   - `submissions_insert_scoped`: Requires `public.jwt_is_verified() = true` and `consent_provided = true`. `FIELD_USER` must match `submitted_by_user_id = (auth.jwt() ->> 'sub')` and state/district/programme scope.
   - `submissions_update_scoped`: Enforces scope on both `USING` and `WITH CHECK`; `FIELD_USER` cannot update records once `status IN ('APPROVED', 'ARCHIVED')`. Trigger `trg_submissions_enforce_occ` enforces `NEW.version = OLD.version + 1`.
   - `submissions_delete_admin_only`: Restricts `DELETE` strictly to verified `ADMIN` and `LEADERSHIP` roles within state scope.
2. **`public.submission_files`**:
   - `submission_files_select_scoped`: Joins parent `public.submissions` row and enforces identical state/district/programme scope.
   - `submission_files_insert_scoped`: Requires `uploaded_by_user_id = (auth.jwt() ->> 'sub')`, `is_restricted_doc = true`, and parent submission scope match. `UPDATE` and `DELETE` are revoked from `authenticated`.
3. **`public.sheets_mirror_jobs`**:
   - Mutated only by `service_role` and the `SECURITY DEFINER` transactional outbox trigger `public.tg_enqueue_sheets_mirror_job()`.
   - `sheets_mirror_jobs_select_leadership`: Read-only queue inspection restricted to verified `ADMIN` and `LEADERSHIP`.
4. **`public.audit_events`**:
   - Append-only (`REVOKE UPDATE, DELETE ON public.audit_events FROM service_role, authenticated, anon`).
   - `audit_events_insert_self`: Allows authenticated users to append audit events where `actor_user_id = (auth.jwt() ->> 'sub')`.
   - `audit_events_select_supervisors`: Restricted to `ADMIN`, `LEADERSHIP`, and `STATE_REVIEWER` (for submissions in their state).

> [!NOTE]
> **Server-Side Next.js API Route Contract (`service_role` Dual Enforcement)**
> Because Next.js API routes authenticate callers via the HMAC-signed `evaluation_session_token` cookie (`resolveSessionScope(req)` in `src/lib/server/sessionService.ts`), server-side database queries must **always** pass explicit `.eq('programme_id', ...)` / `.in('state', ...)` / `.in('district', ...)` predicates derived from `resolveSessionScope(req)` **or** set `request.jwt.claims` on the transaction connection before executing queries. Client headers, query params, or `localStorage` are never trusted for scope.

---

## 6. Transactional Outbox & Google Sheets Sync Design

```mermaid
sequenceDiagram
    participant PWA as Authenticated PWA Client
    participant API as Next.js API Route
    participant PG as Supabase PostgreSQL
    participant Worker as Sheets Outbox Worker
    participant GAS as Google Apps Script (Child_Nutrition)

    PWA->>API: POST /api/submit or PATCH /api/submissions/[id]
    API->>API: resolveSessionScope(req) + Zod validation
    API->>PG: BEGIN; UPSERT public.submissions (version = v)
    PG->>PG: Trigger trg_submissions_enqueue_sheets_mirror
    PG->>PG: INSERT public.sheets_mirror_jobs (idempotency_key = UPSERT_ROW:id:v, sanitized payload)
    PG-->>API: COMMIT (200/201 returned immediately to PWA)
    Worker->>PG: Claim QUEUED/FAILED job (next_attempt_at <= NOW(), lease locked_at/locked_by)
    Worker->>GAS: POST sanitized 73-column row + WEBHOOK_SECRET
    alt GAS returns 200 OK
        Worker->>PG: Mark job COMPLETED, submissions.sync_status = 'SYNCED'
    else GAS timeout / 5xx
        Worker->>PG: Increment attempt_count, exponential backoff next_attempt_at
    else attempt_count >= max_attempts (5)
        Worker->>PG: Mark job DEAD_LETTER, submissions.sync_status = 'DEAD_LETTER', log SHEETS_SYNC_FAILED
    end
```

- **Idempotency**: Every outbox job carries `uq_sheets_mirror_jobs_idempotency` (`UPSERT_ROW:<unique_id>:v<version>`). Retries overwrite/reconcile the target row for `<unique_id>` at version `<version>` without creating duplicate rows in `Child_Nutrition`.
- **Failure Isolation**: Google Sheets downtime or Apps Script quota limits never fail or block the field worker's submission. Dead-lettered jobs surface in `/api/supervisor/diagnostics` for supervisor replay.

---

## 7. Tigris Private Object Storage Design

1. **Private-Only Bucket (`childcare-support-phase3-private`)**:
   - Public bucket access is disabled.
   - Objects are stored under deterministic private keys: `submissions/<submission_uuid>/<doc_type>/<sha256_checksum>.<ext>`.
2. **Atomic OCC Upload Gate**:
   - Before streaming an attachment to Tigris, `POST /api/submissions/[submissionId]/asset` verifies the caller's session scope (`FIELD_USER` state/district/programme or supervisor state) and checks `expectedCurrentCellStateHash` against `submissions.cell_state_hash`.
   - Upon upload completion, `public.submission_files` records the object metadata and updates `cell_state_hash`.
3. **Authorized Streaming Proxy**:
   - `GET /api/submissions/[submissionId]/asset?docType=...` re-verifies session scope on every request, emits a `FILE_ACCESSED` / `RECORD_ACCESSED` audit event, and streams bytes with `Cache-Control: private, no-store, no-cache, must-revalidate`.
   - Raw Tigris S3 URLs, presigned URLs, and access keys are never returned to the browser or written to Google Sheets.

---

## 8. Google Sheets Reporting-Mirror & `_Asset_Containers` Design

- **`Child_Nutrition` (73 Columns)**:
  - Receives structured assessment columns plus sanitized document labels (`"Restricted Doc [caregiverSignature]"`, `"Restricted Doc [aadhaarDoc]"`, etc.) enforced by `chk_sheets_mirror_payload_sanitized` and `tg_enqueue_sheets_mirror_job()`.
- **`_Asset_Containers`**:
  - Receives only non-sensitive container state hashes (`unique_id`, `doc_type`, `cell_state_hash`, `sanitized_sheet_label`, `updated_at`) for OCC reconciliation during the hybrid transition period — never raw `storage_key`s or signed URLs.
- **`Audit_Log`**:
  - Mirrors high-level governance milestones (`RECORD_CREATED`, `RECORD_UPDATED`, `STATUS_CHANGED`, `RECORD_EXPORTED`) without exposing session tokens or raw PII.

---

## 9. Rollback Plan

Because this migration only introduces new schema objects in Supabase and has **not** yet been applied to production:

1. **Pre-Cutover Rollback (Zero Data Impact)**:
   - Keep the Next.js production environment bound to the existing Google Apps Script backend (`APPS_SCRIPT_URL` + `WEBHOOK_SECRET`). No database rollback is required until the migration is applied.
2. **Post-Migration Schema Rollback (If Required on Staging/Dev)**:
   ```sql
   BEGIN;
   DROP TRIGGER IF EXISTS trg_submissions_enqueue_sheets_mirror ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submissions_enforce_occ ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submissions_set_updated_at ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submission_files_set_updated_at ON public.submission_files;
   DROP TRIGGER IF EXISTS trg_sheets_mirror_jobs_set_updated_at ON public.sheets_mirror_jobs;

   DROP FUNCTION IF EXISTS public.tg_enqueue_sheets_mirror_job();
   DROP FUNCTION IF EXISTS public.tg_enforce_submissions_occ();
   DROP FUNCTION IF EXISTS public.tg_set_updated_at();

   DROP TABLE IF EXISTS public.audit_events;
   DROP TABLE IF EXISTS public.sheets_mirror_jobs;
   DROP TABLE IF EXISTS public.submission_files;
   DROP TABLE IF EXISTS public.submissions;

   DROP FUNCTION IF EXISTS public.jwt_has_programme(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_has_district(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_has_state(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_role();
   DROP FUNCTION IF EXISTS public.jwt_is_verified();
   COMMIT;
   ```
3. **Dual-Write Cutover Rollback**:
   - During initial rollout, every submission accepted into `public.submissions` is mirrored to `Child_Nutrition` via `public.sheets_mirror_jobs`. If a regression occurs in the Supabase read path, a feature flag (`DATA_SOURCE_MODE=sheets_primary`) can immediately switch reads back to the up-to-date `Child_Nutrition` mirror without data loss.

---

## 10. Owner Approval Checklist Before Remote Migration

Before applying [`20261012170000_core_schema_foundation.sql`](file:///d:/OneDrive%20-%20INDIA%20HIV%20AIDS%20ALLIANCE/Desktop/Software%20Development/Childcare-Support-Phase-3%281%29/supabase/migrations/20261012170000_core_schema_foundation.sql) to any remote Supabase environment, please review and approve:

1. **Canonical Source-of-Truth Cutover**: Confirm Supabase PostgreSQL (`public.submissions`) as the primary system of record and Google Sheets (`Child_Nutrition`, `_Asset_Containers`, `Audit_Log`) as an asynchronous reporting mirror.
2. **Field User Scope Granularity**: Confirm that `FIELD_USER` accounts must be restricted to assigned `state` + `district` + `programme_id` (`alliance-childcare-phase3`), and that `FIELD_USER` and `STATE_REVIEWER` are prohibited from executing hard `DELETE` operations.
3. **Column 48 Separation**: Confirm that Sheet Column 48 (`48\nMeals per Day`) maps strictly to `submissions.meals_per_day`, while supervisor OCC edit reasons are stored in `submissions.edit_reason` and mirrored to `Audit_Log`.
4. **Sanitized Attachment Mirroring**: Confirm that Google Sheets (`Child_Nutrition` Cols 6 & 65) will receive only `"Restricted Doc [<docType>]"` labels and `_Asset_Containers` state hashes, while actual files remain private in Tigris (`childcare-support-phase3-private`).
5. **Production Vercel Redeploy (`df1b146`)**: Approve triggering a production Vercel deployment from `main` (`df1b146`) so the live alias `https://childcare-support-phase-3.vercel.app` serves the merged PR #72 + PR #74 security guards and binds the rotated `WEBHOOK_SECRET`.
