# Mobile QA Release Checklist & Verification Protocol

**Project:** Childcare Support — Phase 3 PWA  
**Sprint:** Mobile Experience Hardening (`feature/mobile-app-experience-hardening`)  
**Baseline Commit:** `5f75e8c9a5a7bcb10f2c9b27ae3d37fa6f8e4415`  
**Quality Gate Status:** PASSED (Ready for Pre-Release Mobile QA)

---

## 1. Viewport & Device Support Matrix

| Target Class | Viewport (CSS px) | Hardware Profile | Browser Engine | Expected Result | Verified State |
|---|---|---|---|---|---|
| **Ultra-Compact Mobile** | 320 × 568 | iPhone SE (1st gen) / Budget Android | WebKit / Blink | Zero horizontal overflow; single col collapse | PASS |
| **Standard Android** | 360 × 800 | Samsung Galaxy A-series, Redmi | Android Chrome (Blink) | 48px touch targets; fluent thumb typing | PASS |
| **Mid-Tier Android** | 390 × 844 | Google Pixel 5 / 6a / 7a | Android Chrome (Blink) | Edge-to-edge layout, clear signature | PASS |
| **Standard iOS** | 390 × 844 | iPhone 12 / 13 / 14 / 15 | iOS Safari (WebKit) | 16px inputs; NO auto-zoom; safe areas | PASS |
| **Large Android** | 412 × 915 | Samsung Galaxy S23 / OnePlus | Android Chrome (Blink) | Card layouts comfortably spaced | PASS |
| **Small Tablet** | 768 × 1024 | iPad Mini / Galaxy Tab A | Safari / Chrome | 2-column forms; responsive table | PASS |
| **Desktop / Laptop** | 1280 × 800 | Windows / macOS Laptop | Chrome / Edge / Safari | Full linelist table; analytics dashboard | PASS |

---

## 2. Objective Route-by-Route Verification Checklist

### A. Public Landing Page (`/`)
- [x] **Zero Page Overflow:** `document.documentElement.scrollWidth <= window.innerWidth` across 320px, 360px, 390px, 412px.
- [x] **Touch Target Sizing:** Header download button, hero CTA button, step track controls, and carousel pills meet ≥44×44px.
- [x] **Step Guidance Accessibility:** Previous/Next step navigation buttons satisfy 44px touch targets.
- [x] **Images & Assets:** Guide screenshots scale responsively within aspect-ratio containers without distorting or clipping text.
- [x] **Standalone Mode Redirection:** Auto-redirects to `/app` workspace when opened in installed PWA standalone mode.

### B. Field Workspace (`/app`)
- [x] **Header & Navigation:** App shell displays sync indicators and role status clearly without wrapping defects.
- [x] **Interactive Garden Playground:** Includes accessible Play/Pause toggle with 44px touch target; pauses automatically under `prefers-reduced-motion`.
- [x] **Quick Action Card:** Primary "Start New Survey" button and status chips easily reachable with thumb on mobile screens.
- [x] **Draft Resumption:** Draft list items stack vertically on mobile with 44px resume and delete buttons.

### C. Assessment Intake Wizard (`/assessment/new` & `/assessment/draft/[id]`)
- [x] **Top Return Link:** Obvious return link with 44px touch target navigating back to `/app` with accessible label.
- [x] **Single-Column Grid Collapse:** All form sections collapse to 1 column below 768px (`grid-cols-1`).
- [x] **iOS Auto-Zoom Prevention:** Form inputs, selects, and textareas enforce `font-size: 16px !important` on mobile.
- [x] **Digital Signature Canvas:**
  - `touch-action: none` applied strictly to canvas element.
  - No accidental page scroll while drawing signature.
  - Clear and Save buttons satisfy ≥48px minimum target requirement.
  - Clear button includes non-destructive confirmation dialog.
  - Explanatory text describes approved alternative consent protocol (verbal audio or thumbprint).
- [x] **Document & Photo Upload:**
  - Camera capture triggered via `capture="environment"`.
  - Accessible `<button>` trigger replacing inaccessible clickable `<div>`.
  - Stored thumbnail with 44px delete button.
- [x] **Sticky Bottom Action Bar:**
  - Padded with `pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]` so device home bars never cover buttons.
  - Main container padding (`pb-32`) prevents lowest input fields from being hidden behind the bar.

### D. Sync Centre (`/assessment/sync`)
- [x] **Mobile Card Layout:** Tables transform into key-value cards with prominent child name, ART number, and status badge.
- [x] **Touch-Friendly Controls:** "View", "Edit", and "History" buttons satisfy 44px touch target requirement.
- [x] **Search & Date Filters:** Single-column stacked search inputs with 16px fonts and 44px clear filter trigger.
- [x] **Submission View Modal:** Accessible 44px close button, full-width scrollable container, and 44px footer actions.

### E. Existing Record Revision (`/assessment/record/[id]/edit`)
- [x] **Concurrency Conflict (OCC 409) Banner:** Clear error explanation with 44px reload button.
- [x] **Document Replacement:** PhotoUpload buttons allow fieldworkers to easily replace unreadable passbook or Aadhaar photos.
- [x] **Revision Actions:** Mobile-friendly stacked footer buttons for Cancel and Submit Revision (v+1).

### F. Supervisor Linelist (`/supervisor/assessments`)
- [x] **Mobile Cards:** Renders clean assessment cards on mobile viewports (<768px) with quick approval toggles.
- [x] **Desktop Linelist Table:** Kept for tablet/desktop viewports (≥768px) with horizontal scroll container.

---

## 3. Physical Device Testing Protocol (Manual QA Steps)

1. **Bright Daylight Visibility:** Check contrast of form inputs and badges in outdoor sunlight (contrast ratio ≥ 4.5:1 verified).
2. **One-Handed Thumb Sweep:** Verify primary buttons (Save Draft, Next Step, Submit) fall comfortably within thumb reach on 390px/412px devices.
3. **Software Keyboard Test:** Open virtual keyboard in demographic and clinical inputs; verify focused field remains visible and sticky bottom bar adjusts without breaking.
4. **Airplane Mode Test:** Enable Airplane mode on phone; fill an assessment, sign, attach photo, save draft, submit to local queue, and verify sync upon reconnecting.
