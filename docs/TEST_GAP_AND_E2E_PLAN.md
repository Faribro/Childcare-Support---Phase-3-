# Test Gap Analysis & End-to-End Test Plan
## Childcare Support — Phase 3 PWA

**Audit Baseline**: Commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Date**: September 9, 2026  
**Auditor Roles**: Principal Test Engineer & Offline Architect  

---

## 1. Inventory of Existing Tests & Execution Results

### Existing Vitest Test Suites
Six test suites exist in `src/test/` comprising 36 tests:

| Test File | Category | Tests | Status | Observed Test Assertions |
| :--- | :--- | :--- | :--- | :--- |
| `src/test/unit/components/FormInput.test.tsx` | Unit | 4 | **PASSED** | Label rendering, error message display, aria attributes, input change event |
| `src/test/integration/supervisor-analytics.test.ts` | Integration | 6 | **PASSED** | Cohort aggregation, MAM/SAM classification counts, age distribution stats |
| `src/test/unit/validations/submissionSchema.test.ts` | Unit | 6 | **PASSED** | Basic demographic field validation, MUAC numeric limits, positive/negative cases |
| `src/test/integration/submission-lifecycle.test.ts` | Integration | 4 | **PASSED** | Dexie `draftRepository` creation, partial field update, draft listing |
| `src/test/integration/submissions-api.test.ts` | Integration | 9 | **PASSED** | `MockSheetStore` create, read, update, list, duplicate UUID idempotency |
| `src/test/integration/sync-queue.test.ts` | Integration | 7 | **PASSED** | Dexie `syncQueueRepository` enqueue, markSynced, markFailed, retry counts |

---

## 2. Test Execution Commands & Status

- `npm test` (`vitest run`): **PASSED** (6 suites, 36/36 tests green in 2.41s).
- `npm run test:run`: **FAILED** (Script does not exist in `package.json`).
- `npm run test:coverage`: **FAILED** (`Cannot find dependency '@vitest/coverage-v8'`).
- `npm run test:e2e`: **FAILED** (Script and Playwright tooling are completely absent).

---

## 3. Critical Test Gaps

1. **Offline Edit Sync (`UPDATE` Operation)**:
   - Zero tests exist verifying that an item with `operationType === 'UPDATE'` in `syncQueueRepository` triggers a `PUT` request to `/api/submissions/[id]` with OCC headers.
   - This missing test allowed the blocker defect (`POST` called on edit, dropping all amended data) to go undetected.
2. **Google Apps Script Adapter Payload Mapping**:
   - Zero tests validate the 73-column mapping logic, row height formatting, or drive folder naming in `gas/Code.js`.
3. **Document Replacement & File Trashing**:
   - No test verifies that uploading a replacement document archives the old file ID and updates the linelist without silent file loss.
4. **Caregiver Signature Interaction**:
   - No unit or integration test validates `CaregiverSignaturePad` canvas drawing, clear functionality, or export of data URLs.
5. **Accessibility Automation**:
   - Zero automated tests for keyboard focus trapping in modals, screen reader announcements, or color contrast.

---

## 4. Required Vitest Unit & Integration Suites

To close these gaps prior to release, the following Vitest suites must be created:

### A. `src/test/integration/sync-dispatcher.test.ts`
- Test 1: `handleSyncAll` dispatches `POST /api/submissions` for `operationType === 'CREATE'`.
- Test 2: `handleSyncAll` dispatches `PUT /api/submissions/[uniqueId]` for `operationType === 'UPDATE'`.
- Test 3: Handles HTTP 409 Conflict when server version exceeds local expected version.
- Test 4: Does NOT mark item synced if server returns duplicate acknowledgment without update.

### B. `src/test/unit/validations/mandatoryConsent.test.ts`
- Test 1: Rejects submission payload when `caregiverConsent` is undefined.
- Test 2: Rejects submission when `caregiverConsent.consentGiven === false`.
- Test 3: Rejects submission when `caregiverConsent.signatureDataUrl` is empty string.
- Test 4: Accepts valid payload with complete caregiver signature and name.

### C. `src/test/integration/document-replacement.test.ts`
- Test 1: Emulates document update in OCC edit form.
- Test 2: Verifies audit sheet receives historical change record with previous document URL.

---

## 5. Required Playwright End-to-End Test Plan

Add Playwright via `@playwright/test` and implement four core end-to-end user journeys:

### Journey 1: Complete New Intake & Online Sync (`tests/e2e/new-intake.spec.ts`)
```typescript
test('Field worker creates new assessment, captures signature, and syncs online', async ({ page }) => {
  await page.goto('/assessment/new');
  // Fill Demographics
  await page.fill('input[name="childName"]', 'Synthetic Child Demo');
  await page.fill('input[name="dob"]', '2020-05-15');
  await page.selectOption('select[name="gender"]', 'Female');
  // Fill Clinical
  await page.fill('input[name="weight"]', '12.5');
  await page.fill('input[name="height"]', '92.0');
  await page.fill('input[name="muac"]', '13.5');
  // Navigate to review
  await page.click('button:has-text("Review Assessment")');
  // Draw Caregiver Signature
  const canvas = page.locator('canvas');
  await canvas.dragTo(canvas, { sourcePosition: { x: 20, y: 20 }, targetPosition: { x: 100, y: 50 } });
  await page.check('input[type="checkbox"][name="consentGiven"]');
  // Submit
  await page.click('button:has-text("Submit Assessment")');
  await expect(page).toHaveURL(/\/assessment\/record\/.+/);
});
```

### Journey 2: Offline Intake & Recovery (`tests/e2e/offline-intake.spec.ts`)
1. Set browser context offline: `await context.setOffline(true)`.
2. Fill 4 steps of the assessment form.
3. Reload page `page.reload()`.
4. Verify draft re-hydrates from Dexie IndexedDB with all fields preserved.
5. Complete submission offline → verify record enters `/assessment/sync` as `pending`.
6. Restore network: `await context.setOffline(false)`.
7. Tap "Sync All" → verify status transitions to `synced` and server commits record.

### Journey 3: Offline Record Amendment & OCC Verification (`tests/e2e/offline-edit.spec.ts`)
1. Open submitted record `/assessment/record/[id]/edit`.
2. Set context offline: `await context.setOffline(true)`.
3. Amend child weight from `12.5` to `13.1` kg.
4. Tap "Save & Queue Update".
5. Navigate to `/assessment/sync`.
6. Restore network: `await context.setOffline(false)`.
7. Tap "Sync All".
8. **Verify assertion**: Server record reflects `weight: 13.1` and `revisionNumber: 2`.

### Journey 4: Supervisor Linelist & Modal Inspection (`tests/e2e/supervisor-view.spec.ts`)
1. Open `/supervisor`.
2. Verify D3 malnutrition charts render SVG bars.
3. Click a linelist row → verify `SubmissionViewModal` opens with correct child data, document links, and signature preview.

---

## 6. Accessibility & Visual Regression Strategy

### Automated Accessibility Audits (axe-core)
Incorporate `@axe-core/playwright` into the E2E suite:
- Every page (`/`, `/assessment/new`, `/assessment/drafts`, `/assessment/sync`, `/supervisor`) must run `checkA11y(page)` to enforce zero WCAG 2.1 AA violations.
- Verify color contrast on all form inputs and status badges meets the 4.5:1 ratio.
- Verify 48px minimum touch targets on all mobile buttons.

### Viewport Matrix
Test across 5 distinct mobile viewports:
- 320x568 (iPhone SE / budget Android baseline)
- 360x800 (Samsung Galaxy A-series standard)
- 390x844 (iPhone 14)
- 412x915 (Pixel 7)
- 768x1024 (iPad / Tablet supervisor view)

---

## 7. Staging Integration & Release Runbook

### Pre-Deployment Verification Checklist
1. `npm ci` succeeds cleanly with lockfile integrity.
2. `npm run lint` passes with 0 errors and 0 warnings.
3. `npm run typecheck` passes with 0 TypeScript errors.
4. `npm run test:run` executes all unit and integration tests green.
5. `npm run test:e2e` executes all Playwright journeys green against local mock and staging environments.
6. Staging Google Sheets test verifies:
   - Create record returns revision 1.
   - Edit record updates row and sets revision 2.
   - Duplicate submission triggers idempotent acknowledgment without duplicate row creation.
   - Drive files are stored with restricted permissions (zero `ANYONE_WITH_LINK`).
