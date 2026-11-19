# Dignified Field Intake Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the landing page interactive filing navigator (`src/components/landing/ExperiencePreview.tsx`) into a complete 10-step, category-aware field intake preview and operational guide based on the verified specification.

**Architecture:** Refactor `ExperiencePreview.tsx` to host a 10-step case filing system with an interactive category filter (All, Education, Nutrition, HIV-Related) demonstrating conditional field display. Complement the filing folder with three dignified lifecycle guidance cards detailing post-submission review, draft persistence, and email OTP session recovery.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS, Lucide React, Vitest, Testing Library.

---

### Task 1: Write Unit & Editorial Regression Tests for 10-Step Intake Preview

**Files:**
- Create: `src/test/landing-intake-preview.test.tsx`
- Modify: `src/test/landing-page-editorial.test.tsx`

**Step 1: Write the failing tests**
Write tests covering:
1. Section heading rendering: `"A dignified, transparent field intake."` and privacy reassurance copy.
2. Rendering of all 10 step tabs (`/01` to `/10`) with their exact titles.
3. Category filter switching (verifying conditional applicability of Steps 4–9 when switching between Education, Nutrition, HIV-related, and All).
4. Rendering of the 3 operational lifecycle sections:
   - "What happens after submission"
   - "If the caseworker needs to stop"
   - "If the caseworker logs out"

**Step 2: Run test to verify it fails**
```bash
npm test src/test/landing-intake-preview.test.tsx
```
*Expected:* FAIL with missing steps and text.

**Step 3: Commit initial test harness**
```bash
git add src/test/landing-intake-preview.test.tsx
git commit -m "test(landing): add test specification for 10-step dignified intake preview"
```

---

### Task 2: Define 10-Step Data Model & Sample Records

**Files:**
- Modify: `src/components/landing/ExperiencePreview.tsx`

**Step 1: Update TypeScript Types**
Add support for category applicability tags (`SupportCategory[]`), step sequence, and conditional guidance notes:
```typescript
export type IntakeCategory = 'all' | 'education' | 'nutrition' | 'hiv_support';

export interface IntakeStepData {
  id: string;
  number: string;
  stepNumber: number;
  name: string;
  badge: string;
  tabColor: string;
  activeColor: string;
  summary: string;
  applicableCategories: IntakeCategory[];
  conditionalNote?: string;
  sanitizedFields: { label: string; value: string; note?: string }[];
  highlight: string;
  polaroid: {
    title: string;
    caption: string;
    rotation: string;
    badge: string;
    icon: React.ElementType;
  };
}
```

**Step 2: Author 10 Step Datasets**
Populate the 10 steps exactly matching the specification:
1. **Step 1: Choose the support needed** (Categories: Education, Nutrition, HIV-related, All).
2. **Step 2: Take consent** (Caregiver consent explanation, date of visit, basic child details).
3. **Step 3: Enter child and caregiver details** (Child name, DOB, age, gender, caregiver name/relationship/contact, address, state/district).
4. **Step 4: Add family and income details** (Conditional on education/nutrition: total household members, children count, monthly income, income source).
5. **Step 5: Add health information** (Conditional on nutrition: weight, height, haemoglobin; conditional on HIV: ART status, ART registration, viral load).
6. **Step 6: Add education details** (Conditional on education: enrolled, school name & type, class, attendance, expenses, document uploads).
7. **Step 7: Add nutrition details** (Conditional on nutrition: appetite, meals/day, signs of malnutrition).
8. **Step 8: Add HIV-related details** (Conditional on HIV: ART status, registration date & ID, viral load status & date, clinical info).
9. **Step 9: Add bank details for support** (Conditional on education/nutrition: account holder, account number, IFSC, bank phone, passbook/Aadhaar uploads).
10. **Step 10: Review and submit** (Caseworker profile organization name & email auto-attached, review confirmation, submit).

**Step 3: Run tests to verify progress**
```bash
npm test src/test/landing-intake-preview.test.tsx
```

---

### Task 3: Build the Interactive Category Filter & Tabbed Folder Navigator

**Files:**
- Modify: `src/components/landing/ExperiencePreview.tsx`

**Step 1: Implement Interactive Category Pills**
Add category filter chips above the folder tabs:
- `All Categories (10 Steps)`
- `Education Support (8 Steps)`
- `Nutrition Support (8 Steps)`
- `HIV-Related Support (7 Steps)`

When a user selects a category, tabs dynamically show active vs. non-applicable states with clear indicators, or filter the navigable list while maintaining smooth scroll and index boundaries.

**Step 2: Implement Smooth Folder Navigation & Keyboard Accessibility**
- Support previous/next buttons and left/right keyboard arrows.
- Ensure the cotton-ruled paper sheet, red margin rule, and tilted polaroid card dynamically display the active step's specimen.

**Step 3: Run tests and verify**
```bash
npm test src/test/landing-intake-preview.test.tsx
```

---

### Task 4: Implement Operational Lifecycle Guidance Cards

**Files:**
- Modify: `src/components/landing/ExperiencePreview.tsx`

**Step 1: Build the 3 Post-Intake Lifecycle Cards**
Render 3 tactile notebook-styled cards beneath the interactive folder:
1. **What happens after submission:**
   - Record securely saved with cryptographic payload verification.
   - Immediate sharing with State Team for eligibility review.
   - Review progression to stage two (e.g., bank documentation collection).
2. **If the caseworker needs to stop:**
   - One-tap draft saving to local IndexedDB.
   - Return and resume at any time.
   - Proactive logout safety check alerting caseworker to review and sync unsaved drafts first.
3. **If the caseworker logs out:**
   - Passwordless email OTP re-authentication.
   - Instant access to historical submitted records and active drafts.

**Step 2: Verify Responsive Layout & Semantic HTML**
- Ensure clean stacking on mobile (<640px) and a balanced 3-column grid on desktop (≥1024px).
- Verify landmark accessibility and high-contrast color tokens.

**Step 3: Run tests**
```bash
npm test src/test/landing-intake-preview.test.tsx
```

---

### Task 5: Full Suite Verification & Build Validation

**Files:**
- Verify: Entire repository in `Childcare-Main-Verify`

**Step 1: Run Full Landing Test Suite**
```bash
npm test src/test/landing
```
*Expected:* All tests passing.

**Step 2: Run TypeScript Check**
```bash
npm run typecheck
```
*Expected:* Exit code 0, 0 errors.

**Step 3: Run Next.js Production Build**
```bash
npm run build
```
*Expected:* Exit code 0, all static and dynamic pages compiled.

**Step 4: Run Native Client Build**
```bash
npm run build:native-client
```
*Expected:* Exit code 0, Vite native client bundle built successfully.

**Step 5: Inspect Git Status**
```bash
git status --short
```
*Expected:* Only `ExperiencePreview.tsx` and relevant test files modified.

---

### Execution Handoff

Plan complete and saved to `docs/plans/2026-11-19-dignified-field-intake-preview.md`. Two execution options:

1. **Subagent-Driven (this session)** — Dispatch focused subagents per task with review checkpoints between tasks for fast iteration.
2. **Parallel Session (separate)** — Run execution in a dedicated session with review checkpoints.
