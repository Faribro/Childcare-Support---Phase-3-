# Audit Evidence: Quality Commands & Test Suite Output

**Audit Baseline**: Commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Audit Date**: September 9, 2026  
**Environment**: Windows 11, Node.js v20+, Next.js 14.2.24  

---

## 1. `npm ci` / `npm install`
Status: **PASSED (Pre-installed)**
- Lockfile: `package-lock.json` present and synchronized.
- Zero dependency installation errors.

---

## 2. `npm run lint`
Command: `next lint`  
Status: **PASSED WITH 8 WARNINGS** (Exit Code: 0)

```text
./src/app/assessment/new/page.tsx
203:6  Warning: React Hook useEffect has a missing dependency: 'loadBeneficiaryDraft'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./src/app/assessment/record/[submissionId]/edit/page.tsx
526:6  Warning: React Hook useEffect has a missing dependency: 'loadSubmissionRecord'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./src/components/assessment/PhotoUpload.tsx
114:15  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost, depending on your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
150:17  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost, depending on your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
177:15  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost, depending on your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./src/components/supervisor/SubmissionViewModal.tsx
203:19  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost, depending on your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
215:19  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost, depending on your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
247:19  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost, depending on your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules
```

**Evaluation**:
- Stale closures in `useEffect` for draft and record loaders represent medium regression risk for state sync.
- 6 unoptimized `<img>` tags on document and signature previews degrade LCP and memory when handling heavy Base64 data URLs.

---

## 3. `npm run typecheck`
Command: `tsc --noEmit`  
Status: **PASSED (0 Errors)** (Exit Code: 0)

TypeScript compiler verified clean type compatibility across entire `src/` hierarchy without any implicit `any` violations.

---

## 4. `npm run test:run`
Status: **FAILED — MISSING SCRIPT QUALITY GATE** (Exit Code: 1)

```text
npm error Missing script: "test:run"
npm error 
npm error To see a list of scripts, run:
npm error   npm run
```

**Evaluation**:
- CI workflow `.github/workflows/ci.yml` line 29 calls `npm test`, but standard release automation documentation specified `npm run test:run`. A missing script causes pipeline failure if invoked by standardized CI or release orchestrators.

---

## 5. `npm test` (Unit and Integration Suite)
Command: `vitest run`  
Status: **PASSED (6 test files, 36/36 tests green)** (Exit Code: 0)

```text
 RUN  v2.1.9 D:/OneDrive - INDIA HIV AIDS ALLIANCE/Desktop/Tasks/Task - Child Nutrition PWA - Phase 3

 ✓ src/test/unit/components/FormInput.test.tsx (4 tests) 165ms
 ✓ src/test/integration/supervisor-analytics.test.ts (6 tests) 10ms
 ✓ src/test/unit/validations/submissionSchema.test.ts (6 tests) 14ms
 ✓ src/test/integration/submission-lifecycle.test.ts (4 tests) 24ms
 ✓ src/test/integration/submissions-api.test.ts (9 tests) 31ms
 ✓ src/test/integration/sync-queue.test.ts (7 tests) 17ms

 Test Files  6 passed (6)
      Tests  36 passed (36)
   Start at  17:42:04
   Duration  2.41s (transform 373ms, setup 0ms, collect 741ms, tests 261ms, environment 1.63s, prepare 403ms)
```

**Coverage and Depth Assessment**:
- Existing tests cover:
  - Basic field rendering and error display in `FormInput`
  - High-level cohort aggregation in `supervisor-analytics`
  - Positive/negative validation on basic child demographics in `submissionSchema`
  - Local Dexie `draftRepository` create/update in `submission-lifecycle`
  - In-memory `MockSheetStore` CRUD in `submissions-api`
  - Basic Dexie queue enqueue/markSynced in `sync-queue`
- **Critical Test Gaps**:
  - Zero tests for offline edit sync (`UPDATE` operation in `syncQueueRepository` → API endpoint mapping)
  - Zero tests for Google Apps Script payload serialization (`gas/Code.js`)
  - Zero tests for document replacement logic and old file trashing
  - Zero tests for signature canvas touch interactions and base64 parsing
  - Zero tests for location permission denials and fallback geocoding
  - Zero browser-based accessibility tests (axe-core / Pa11y)

---

## 6. `npm run test:coverage`
Command: `vitest run --coverage`  
Status: **FAILED — MISSING COVERAGE RUNTIME DEPENDENCY** (Exit Code: 1)

```text
 RUN  v2.1.9 D:/OneDrive - INDIA HIV AIDS ALLIANCE/Desktop/Tasks/Task - Child Nutrition PWA - Phase 3

MISSING DEPENDENCY
Cannot find dependency '@vitest/coverage-v8'

? Do you want to install @vitest/coverage-v8? › (y/N)
npm error Lifecycle script `test:coverage` failed with error:
npm error Error: command failed
npm error   in workspace: childcare-support-phase-3@3.0.0
```

**Evaluation**:
- Automated code coverage measurement cannot run in CI or pre-commit without interactive user intervention because `@vitest/coverage-v8` was not added to `devDependencies` in `package.json`.

---

## 7. `npm run test:e2e`
Status: **FAILED — MISSING SCRIPT AND MISSING TOOLING** (Exit Code: 1)

```text
npm error Missing script: "test:e2e"
npm error 
npm error To see a list of scripts, run:
npm error   npm run
```

**Evaluation**:
- The project documentation and `README.md` claim: "Testing: Vitest 2, Playwright E2E, Testing Library".
- However, `@playwright/test` is neither installed in `package.json` nor configured (`playwright.config.ts` does not exist).
- Zero automated end-to-end browser journeys exist.

---

## 8. `npm run build`
Command: `next build`  
Status: **PASSED (Production bundle built in 15.6s)** (Exit Code: 0)

```text
▲ Next.js 14.2.24
- Environments: .env

  Linting and checking validity of types ...
  Creating an optimized production build ...
✓ Compiled successfully
  Collecting page data ...
  Generating static pages (13/13) ...
✓ Generating static pages (13/13)
  Finalizing page optimization ...
  Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    21.9 kB         110 kB
├ ○ /_not-found                          873 B            89 kB
├ ○ /api/health                          0 B                0 B
├ ○ /api/reference-data                  0 B                0 B
├ ○ /api/submissions                     0 B                0 B
├ ○ /api/submissions/[submissionId]      0 B                0 B
├ ○ /api/submissions/[submissionId]/history 0 B             0 B
├ ○ /api/sync                            0 B                0 B
├ ○ /assessment/draft/[draftId]          23.6 kB         144 kB
├ ○ /assessment/draft/[draftId]/review   23.9 kB         144 kB
├ ○ /assessment/drafts                   2.89 kB         123 kB
├ ○ /assessment/new                      23.6 kB         144 kB
├ ○ /assessment/record/[submissionId]    23.7 kB         144 kB
├ ○ /assessment/record/[submissionId]/edit 27.6 kB       148 kB
├ ○ /assessment/sync                     3.96 kB         124 kB
└ ○ /supervisor                          44.9 kB         165 kB
+ First Load JS shared by all            88.1 kB
  ├ chunks/23-8cfb4cf17fb57d47.js        31.6 kB
  ├ chunks/fd9d1056-b072836c0a0cbf74.js  53.6 kB
  ├ chunks/main-app-223d6a45749f1fdc.js  221 B
  └ chunks/webpack-f36dfa4f0da994b7.js   2.73 kB

○  (Static)  prerendered as static content
```

**Bundle Analysis**:
- All 13 page routes are generated as static shells (`○ Static`).
- Assessment form chunks (`new`, `draft/[draftId]`, `record/[submissionId]/edit`) bundle at ~144 kB – 148 kB First Load JS.
- Supervisor dashboard bundles D3.js and weighs 165 kB First Load JS.
- Shared initial bundle is 88.1 kB.
- No critical build-time syntax or import failures.
