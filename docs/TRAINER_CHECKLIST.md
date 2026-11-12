# Trainer Checklist — Childcare Support Phase 3 Training Session

## Part A: Pre-Session Preparation Checklist

### 1. Environment & App Verification (Day Before & T-60 min)
- [ ] Verify target preview/training URL loads `/api/health` returning HTTP `200` with `"status": "ok"`.
- [ ] Confirm **only `TRAINING` test accounts and `TRAINING-*` sample data** are used during practice—never enter real beneficiary PII (real Aadhaar numbers, bank accounts, or child names) into training environments.
- [ ] Verify `/api/reference-data/state-srs` returns the State Sub-Recipient (SR) options for the training states.
- [ ] Test **1 complete end-to-end submission** with a small sample photo on both an Android phone and a laptop browser before trainees arrive.

### 2. Devices & Browser Readiness
- [ ] Confirm trainees use updated Chrome (Android) or Safari (iOS) with JavaScript and IndexedDB enabled (avoid Incognito/Private browsing mode, which wipes offline drafts on tab close).
- [ ] Verify GPS / Location Permission is enabled in phone Settings AND granted to the browser site.
- [ ] Confirm device storage has at least 500 MB free so camera photos and IndexedDB queues save reliably.
- [ ] Ask trainees to add the app to their Home Screen ("Install app" / PWA shortcut) if demonstrating offline usage.

### 3. Network & Contingency
- [ ] Test venue Wi-Fi throughput for 20–50 concurrent logins/submissions (remember login & submit routes allow clinic/training bursts from shared Wi-Fi NAT, but avoid rapid repeated taps).
- [ ] Have a mobile hotspot backup ready to demonstrate offline -> **Waiting to send** -> auto-sync recovery.

### 4. Accounts & Cleanup
- [ ] Share the `TRAINING` accounts listed in `docs/TRAINING_ACCOUNTS_AND_SAMPLES.md` (not real staff/leadership passwords).
- [ ] After training ends, run the cleanup steps in `docs/TRAINING_ACCOUNTS_AND_SAMPLES.md` and verify trainees sign out.

---

## Part B: Top 10 Common Staff Mistakes & Exact Solutions

| # | Common Mistake | What Happens | Solution to Teach |
|---|---|---|---|
| 1 | **Using Incognito / Private Browser Mode** | Drafts and **Waiting to send** forms disappear when browser closes. | Always use regular Chrome/Safari and install the PWA to Home Screen. |
| 2 | **Leaving Document Verification Proofs empty** | Form stays blocked on submit (needs receipt, marksheet, or 3+ char remarks). | Upload Fee Receipt OR Marksheet OR type a clear 3+ char note in **Remarks** (e.g., `"Pending from school"`). |
| 3 | **Trying to upload huge PDFs (> 2.5 MB)** | Server/client rejects PDF over 2.5 MB (`Photos` auto-compress, PDFs cannot be shrunk in-browser). | Use camera photos (auto-compressed to <= 2.5 MB) or export smaller PDFs (< 2.5 MB). |
| 4 | **Skipping Taluk / Mandal / Block review** | Pin code auto-fills District/State, but Taluk may need local check (tagged `"Please verify"`). | Always verify and correct **Taluk / Mandal / Block** before advancing. |
| 5 | **Entering an invalid or 3-digit PIN expecting auto-fill** | District & State only auto-fill for an exact valid 6-digit PIN match. | Type all 6 digits of the PIN code or use **Fetch Live Address**; pick District manually if needed. |
| 6 | **Blocking on weak indoor GPS** | Location accuracy > 100 m prompts confirmation indoors; staff think form is stuck. | Tap Fetch Live Address near a window/doorway, confirm > 100 m warning if needed, or fill address fields manually—GPS never blocks submission. |
| 7 | **Leaving Caregiver Mobile blank without ticking checkbox** | Validation fails on missing 10-digit phone (must start with 6–9). | Enter valid 10-digit Indian mobile number, OR tick **"No phone available"** and add an alternate contact if available. |
| 8 | **Clearing browser cache while "Waiting to send" > 0** | Locally queued offline submissions are permanently erased. | Always check that **Waiting to send** = `0` on the dashboard before clearing browser data or switching devices. |
| 9 | **Re-typing a new form instead of fixing a failed/pending item** | Creates duplicate work or leaves Pendings unresolved. | Use **Continue forms** for drafts, **View outbox** for sync errors, and **Pendings** (Missing documents / Bank details needed) to complete follow-ups. |
| 10 | **Using real child Aadhaar/photos during training** | Violates beneficiary privacy & mixes test rows with programme metrics. | Prefix every practice record with `TRAINING` and use sample placeholder receipts/notes only. |
