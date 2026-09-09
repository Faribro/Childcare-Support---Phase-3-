# UX & UI Refinement Backlog
## Childcare Support — Phase 3 PWA

**Audit Baseline**: Commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Date**: September 9, 2026  

---

## 1. Must Fix Before Launch (Release Blockers & Critical Usability)

### [UX-MUST-01] Deceptive Sync Success Notification on Offline Edits
- **Current Problem**: In `/assessment/sync`, tapping "Sync All" on offline record updates reports a green "Synced" toast and removes the item from the pending queue, even though the server dropped the changes due to calling `POST` instead of `PUT`.
- **Design Principle**: Truth in UI Signals & Transparency. The UI must never claim data is saved or synchronized unless the server has affirmatively committed the mutation.
- **Exact Screen / Component**: `/assessment/sync/page.tsx` (`handleSyncAll` and sync status cards).
- **Proposed Change**: Update sync handler to route `operationType === 'UPDATE'` to `PUT /api/submissions/[id]`. Show distinct status indicators: `Syncing Update...`, `Updated to Revision X`, or `Conflict Detected`.
- **Accessibility Effect**: Clear screen-reader announcement (`aria-live="polite"`) of genuine update status.
- **Performance Effect**: Eliminates false sync retries.
- **Mobile Effect**: Gives field workers accurate operational certainty before closing the app.
- **Priority**: Must Fix Before Launch | **Effort**: 2 Days
- **Acceptance Criteria**: Syncing an amended record verifies version increment on server; failure to update highlights item in amber with "Update Failed — Server Retained Prior Version".

---

### [UX-MUST-02] Caregiver Signature Canvas Sizing & Clear Button Ergonomics
- **Current Problem**: In `/assessment/draft/[draftId]/review`, the signature canvas in `CaregiverSignaturePad.tsx` can become unresponsive or clip strokes when scrolled on small 320px viewport devices.
- **Design Principle**: Thumb-Friendly Interaction & Accessibility. Signature pads must maintain a minimum 48px touch target for actions and prevent document scroll while drawing.
- **Exact Screen / Component**: `src/components/assessment/CaregiverSignaturePad.tsx`.
- **Proposed Change**: Apply `touch-action: none` to canvas container during drawing; increase "Clear Signature" button target to 48x48px with high-contrast border.
- **Accessibility Effect**: Explicit instructions and high contrast outline for visually impaired caregivers.
- **Performance Effect**: Prevents unnecessary canvas re-renders and eliminates multi-touch scroll conflicts.
- **Mobile Effect**: Smooth signing experience on 320px–360px Android devices.
- **Priority**: Must Fix Before Launch | **Effort**: 1 Day
- **Acceptance Criteria**: Caregiver can draw signature without triggering page scroll; "Clear" button resets canvas cleanly with 48px minimum touch area.

---

### [UX-MUST-03] Mandatory Consent Validation Indication in Intake Form
- **Current Problem**: In `/assessment/draft/[draftId]/review`, if the caregiver consent checkbox is not ticked, the submit button is disabled without a visible explanatory warning or error callout.
- **Design Principle**: Form Progression & Clear Error Recovery. Never disable a primary submission button without explaining why it cannot be clicked.
- **Exact Screen / Component**: `src/app/assessment/draft/[draftId]/review/page.tsx`.
- **Proposed Change**: Replace disabled button with active button that triggers an inline alert banner ("Caregiver consent and signature are required before submitting") and scrolls to the consent section if incomplete.
- **Accessibility Effect**: Avoids WCAG 2.1 disabled-control trap where screen readers cannot explain why an action is blocked.
- **Performance Effect**: Zero impact.
- **Mobile Effect**: Greatly reduces field worker confusion when assisting caregivers.
- **Priority**: Must Fix Before Launch | **Effort**: 0.5 Day
- **Acceptance Criteria**: Tapping submit without consent surfaces a high-contrast alert box focusing on the consent checklist.

---

## 2. Should Fix Before Launch (High-Value Ergonomic Refinements)

### [UX-SHD-01] Compressed WebP Visuals & Category Filter for Landing Operations Manual
- **Current Problem**: The landing page (`/`) embeds 11 uncompressed PNG screenshots (1.07 MB total), causing high bandwidth usage and long scroll length on budget mobile devices.
- **Design Principle**: Content Density & Responsive Framing. Visual guides should be fast-loading and categorized.
- **Exact Screen / Component**: `src/app/page.tsx` (`OperationalGuide` section) and `public/images/guide/*.png`.
- **Proposed Change**: Convert PNGs to WebP format (<250 KB total); introduce a 4-tab filter ("Intake Flow", "Clinical & MUAC", "Edits & Replacements", "Sync & Offline") so workers can quickly view relevant workflow steps.
- **Accessibility Effect**: Descriptive `alt` attributes on all step screenshots; keyboard navigable tabs.
- **Performance Effect**: Reduces image payload by ~75% (~800 KB saved), boosting LCP on 3G networks.
- **Mobile Effect**: Prevents infinite vertical scroll fatigue on mobile screens.
- **Priority**: Should Fix Before Launch | **Effort**: 1.5 Days
- **Acceptance Criteria**: Total image transfer <300 KB; tabs filter steps instantaneously without layout shift.

---

### [UX-SHD-02] Location Acquisition UX & Accuracy Feedback
- **Current Problem**: When fetching GPS location in `src/components/assessment/LocationPicker.tsx`, the UI displays a spinner with text "fetching...", but does not communicate GPS accuracy radius or provide a timeout fallback if indoors.
- **Design Principle**: Honest Feedback & Resilience. Mobile location tools must display precision estimates (e.g., "±12m accuracy") and allow manual confirmation if GPS signal is degraded.
- **Exact Screen / Component**: `src/components/assessment/LocationPicker.tsx`.
- **Proposed Change**: Show real-time accuracy radius pill (`Accurate to ±X meters`); provide a "Retry GPS" button and clear fallback notice if indoors.
- **Accessibility Effect**: Announce location resolution status to assistive tech.
- **Performance Effect**: Clean up watchPosition listener on unmount.
- **Mobile Effect**: Health workers understand whether they need to step outdoors for satellite lock.
- **Priority**: Should Fix Before Launch | **Effort**: 1 Day
- **Acceptance Criteria**: Displays accuracy radius; timeout after 15 seconds prompts user to retry or proceed.

---

### [UX-SHD-03] Replace Raw `<img>` with Next.js `<Image />` in Submission Modal
- **Current Problem**: `src/components/supervisor/SubmissionViewModal.tsx` and `PhotoUpload.tsx` use unoptimized `<img>` tags, flagged by ESLint.
- **Design Principle**: Image Treatment & Memory Restraint.
- **Exact Screen / Component**: `SubmissionViewModal.tsx` lines 203, 215, 247.
- **Proposed Change**: Migrate to `next/image` with responsive `sizes` and proper width/height containment.
- **Accessibility Effect**: Fixes missing explicit aspect ratios and provides descriptive `alt` tags.
- **Performance Effect**: Prevents layout reflow and decreases image memory pressure during modal viewing.
- **Mobile Effect**: Faster modal transitions on 2GB RAM phones.
- **Priority**: Should Fix Before Launch | **Effort**: 0.5 Day
- **Acceptance Criteria**: Zero `@next/next/no-img-element` lint warnings; images load smoothly.

---

## 3. Post-Launch Polish (Design Craft & Micro-Interactions)

### [UX-POL-01] D3 Malnutrition Chart Interactive Tooltips on Touch
- **Current Problem**: In `/supervisor`, malnutrition cohort bar charts rely on desktop hover states for exact case count tooltips.
- **Design Principle**: Mobile-First & Touch-First. All chart data points must be inspectable on touch tap.
- **Exact Screen / Component**: `src/components/supervisor/MalnutritionDistributionChart.tsx`.
- **Proposed Change**: Add tap-to-select interaction that persists tooltip data below the chart on mobile.
- **Accessibility Effect**: Accessible tabular data alternative for all chart views.
- **Priority**: Post-Launch Polish | **Effort**: 1 Day
- **Acceptance Criteria**: Tapping a chart bar highlights the segment and displays exact cohort metrics.

---

### [UX-POL-02] Server Component Migration for Landing Page
- **Current Problem**: `src/app/page.tsx` is completely client-rendered (`"use client"`), bundling 21.9 kB of unnecessary hydration code.
- **Design Principle**: Minimal First-Load JS.
- **Exact Screen / Component**: `src/app/page.tsx`.
- **Proposed Change**: Split landing page into static Server Component shell and client-side PWA install button.
- **Priority**: Post-Launch Polish | **Effort**: 1 Day
- **Acceptance Criteria**: Initial landing paint requires 0 kB of custom client React state.
