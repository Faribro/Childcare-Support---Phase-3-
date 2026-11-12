# Training Accounts & Sample Records (`TRAINING` Dataset)

> **Safety Rule:** All training accounts, scripts, and sample submissions below are strictly labelled **`TRAINING`** and must NEVER touch real beneficiary data or production operational spreadsheets.

---

## 1. Test Account Roles & Sign-In Pattern for Training

Use **staging/preview test credentials** or synthetic demo mode (`E2E_ALLOW_LOCAL_MOCK=true` on local, or your designated training/staging credentials configured in Vercel Preview/Staging env vars—never share real operational passwords in git):

| Label | Role | Scope | Intended Training Exercise |
|---|---|---|---|
| `TRAINING_CASEWORKER_MH` | Field Staff / State Evaluator (`STATE_REVIEWER` / `FIELD_USER`) | State: `Maharashtra`, District: `Pune` | Fill new assessment, test GPS + PIN auto-fill, offline queue, Pendings document upload |
| `TRAINING_CASEWORKER_WB` | Field Staff | State: `West Bengal`, District: `Kolkata` | Verify state isolation & Pin Code `700001` lookup |
| `TRAINING_SUPERVISOR_DL` | State Supervisor / Approver | State: `Delhi`, District: `South Delhi` | Review submitted `TRAINING-*` rows, verify missing doc & bank details filters |

### Password / Auth Setup Note
Set training credentials strictly in Staging/Preview environment variables (never committed to source code) or use `/api/auth/state-team/register` against a staging registration invite before the session, and revoke/deactivate the test credentials after the session ends.

---

## 2. Clean `TRAINING` Sample Records (Safe Deletable Prefixes)

Every sample record uses `TRN-` / `TRAINING-` prefixes in `artNumber`, `childName`, `caregiverName`, `interviewerName`, and `remarks` so they can be identified and deleted cleanly after training:

| Sample # | ART / Ref ID | Child Name | District / State / PIN | Document Proof Type Used |
|---|---|---|---|---|
| 1 | `TRN-MH-001` | `TRAINING Child Aarav` | `Pune, Maharashtra (411001)` | Small JPEG sample receipt (`<= 2.5MB`) + Remarks `"TRAINING sample receipt"` |
| 2 | `TRN-MH-002` | `TRAINING Child Diya` | `Mumbai, Maharashtra (400001)` | Remarks-only proof: `"TRAINING fee receipt pending from school"` (tests no-photo path) |
| 3 | `TRN-DL-003` | `TRAINING Child Kabir` | `New Delhi, Delhi (110001)` | `noPhoneAvailable: true` + alternate contact + Marksheet sample PNG |
| 4 | `TRN-WB-004` | `TRAINING Child Ananya` | `Kolkata, West Bengal (700001)` | Offline mode test (`Waiting to send` -> reconnect -> verify auto-sync) |

---

## 3. Automated Generator & Cleanup Helper
See `scripts/training-dataset-helper.mjs`:
- **Generate local/staging sample payloads:** `node scripts/training-dataset-helper.mjs print`
- **Verify zero accidental real-data overlap:** Every generated UUID/ART starts with deterministic `TRN-` / `TRAINING` markers.
- **Post-Training Cleanup (Supabase staging/test DB):**
  Delete only records tagged with `TRAINING` / `TRN-`:
  ```sql
  -- Inspect first (READ-ONLY CHECK):
  SELECT id, unique_id, child_name, created_at
  FROM public.submissions
  WHERE child_name LIKE 'TRAINING%'
     OR form_payload->'demographics'->>'artNumber' LIKE 'TRN-%';

  -- Cleanup mirror jobs + files + submissions for TRAINING test rows only:
  DELETE FROM public.sheets_mirror_jobs
  WHERE submission_id IN (
    SELECT id FROM public.submissions
    WHERE child_name LIKE 'TRAINING%'
       OR form_payload->'demographics'->>'artNumber' LIKE 'TRN-%'
  );

  DELETE FROM public.submission_files
  WHERE submission_id IN (
    SELECT id FROM public.submissions
    WHERE child_name LIKE 'TRAINING%'
       OR form_payload->'demographics'->>'artNumber' LIKE 'TRN-%'
  );

  DELETE FROM public.submissions
  WHERE child_name LIKE 'TRAINING%'
     OR form_payload->'demographics'->>'artNumber' LIKE 'TRN-%';
  ```
- **Browser Cleanup on Training Devices:** After trainees confirm `Waiting to send = 0`, clear site data on loaner phones before handing devices out next time.
