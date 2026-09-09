# Mobile Route & Component Hardening Matrix
## Childcare Support — Phase 3 PWA

**Baseline Commit**: `5f75e8c9a5a7bcb10f2c9b27ae3d37fa6f8e4415`  
**Date**: September 9, 2026  
**Document Purpose**: Component-level mapping of intended mobile behaviors, current status, priorities, and test verification strategies.

---

## 1. Page Route Inventory & Mobile Specifications

| Route Path | Primary Context | Intended Mobile Behavior (< 768px) | Current Status | Issues Identified | Priority | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`/`** (Landing) | Public Mobile & Desktop | Download-only showcase; zero horizontal overflow; step selector navigable via 48px touch chevrons; responsive guide images. | Partially Hardened | Step buttons need touch padding; screenshot images need responsive attributes. | High | Route |
| **`/app`** (Workspace) | Mobile Phone (Caseworker) | Native app dashboard; quick actions for "New Intake", "Sync Centre", and "Drafts"; readable stats at 320px. | Needs Polish | Action cards stack awkwardly on small screens; stat badges wrap. | High | Route |
| **`/assessment/new`** | Mobile Phone (Caseworker) | Single-column form flow; compact stepper ("Step X of 8"); 16px inputs (no iOS zoom); sticky bottom bar with safe-area padding. | In Hardening | Multi-column grid on small screens; 14px inputs causing iOS zoom. | Critical | Route |
| **`/assessment/draft/[draftId]`** | Mobile Phone (Caseworker) | Identical mobile-first stepper flow as `/assessment/new`; resumes saved offline state seamlessly. | In Hardening | Multi-column grid on small screens; needs 1-col collapse. | Critical | Route |
| **`/assessment/draft/[draftId]/review`** | Mobile Phone (Caseworker) | 1-column key-value summary card list; collapsible review sections; thumb-friendly submit button. | Needs Polish | Tables wrap awkwardly at 320px. | High | Route |
| **`/assessment/record/[submissionId]/receipt`**| Mobile Phone / Beneficiary | Mobile-readable official confirmation receipt; full-width action buttons; QR code centered. | Good | Print button needs full width and safe area on mobile. | Medium | Route |
| **`/assessment/sync`** | Mobile Phone (Caseworker) | Card list for synced/queued assessments; clear status badges (icon + text); full-width retry buttons. | In Hardening | 8-column HTML table forces horizontal scrolling on phones. | Critical | Route |
| **`/assessment/drafts`** | Mobile Phone (Caseworker) | Touch-friendly list of saved offline drafts with timestamp, child name, and resume/delete actions. | Good | Target sizes for delete icon button < 44px. | Medium | Route |
| **`/assessment/record/[submissionId]`** | Mobile Phone (Caseworker) | Read-only details view; responsive card sections matching the intake schema. | Good | Document preview links need 48px tap targets. | Medium | Route |
| **`/assessment/record/[submissionId]/edit`** | Mobile Phone (Caseworker) | 1-column edit layout; prominent amendment reason field; OCC conflict resolution modal full-width. | In Hardening | 2-column layout forces narrow inputs; modal cramped at 320px. | Critical | Route |
| **`/supervisor`** | Tablet & Laptop | Mobile triage view with key performance indicators; non-blocking "Best viewed on larger screen" notice. | Needs Polish | Desktop-oriented dashboard layout. | High | Route |
| **`/supervisor/assessments`** | Tablet & Laptop | Responsive card list below 768px; full data table on desktop; filters wrapped in mobile drawer. | In Hardening | Wide table unreadable on phone screens without horiz scroll. | Critical | Route |
| **`/supervisor/assessments/[submissionId]`** | Tablet & Laptop | Beneficiary audit sheet; document verification viewer; decision actions stacked on mobile. | Good | Document viewer needs touch-friendly modal. | Medium | Route |
| **`/supervisor/linelist`** | Tablet & Laptop | Tabular export sheet; mobile card fallback with quick export trigger. | Needs Polish | Desktop table layout. | Medium | Route |
| **`/supervisor/analytics`** | Tablet & Laptop | Stacked mobile chart cards; touch tooltips; non-hover data readouts. | Needs Polish | Charts overflow at 320px. | Medium | Route |
| **`/supervisor/gis`** | Tablet & Laptop | Touch-friendly map controls; fallback message when WebGL is unavailable. | Needs Polish | Map controls overlap at 320px. | Low | Route |

---

## 2. Reusable Shared Component Inventory

| Component Path | Component Name | Intended Mobile Behavior | Current Status | Issues | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `src/components/layout/AppShell.tsx` | `AppShell` | Safe-area padding, mobile container limits (`max-w-full overflow-x-hidden`), keyboard-safe layout. | Good | Need safe-area classes for iOS. | High |
| `src/components/layout/CompactMasthead.tsx` | `CompactMasthead` | Mobile logo sizing, touch-safe connectivity indicator, 44px sync button with badge. | Good | Missing mobile drawer/menu toggle for direct navigation. | High |
| `src/components/layout/MobileContextBar.tsx` | `MobileContextBar` | Compact 36px bar displaying child name, ART number, and device save status. | Good | Verified functional at 320px. | Passed |
| `src/components/ui/Button.tsx` | `Button` | Minimum 44×44px touch target; full-width mobile option (`w-full`); loading spinner; disabled styling. | Good | Ensure `min-h-[44px]` on all variants. | Critical |
| `src/components/ui/Input.tsx` | `Input` | 16px mobile font-size (`text-base`); clear focus ring; appropriate `inputMode` and `enterKeyHint`. | Needs Polish | Font size was 14px (`text-sm`), triggering iOS zoom. | Critical |
| `src/components/ui/Select.tsx` | `Select` | 16px mobile font-size; 44px height; touch-friendly arrow. | Needs Polish | Font size was 14px (`text-sm`). | Critical |
| `src/components/ui/PhotoUpload.tsx` | `PhotoUpload` | Touch-safe file picker; camera option; clear upload progress; privacy-safe preview modal. | Good | Tap target for remove button was ~28px. | High |
| `src/components/forms/CaregiverConsentSignature.tsx` | `CaregiverConsentSignature` | Canvas with `touch-action: none`; prevents page scroll during signing; 48px clear/save buttons. | In Hardening | Canvas allowed vertical page scroll during finger drawing. | Critical |
| `src/components/forms/LocationPicker.tsx` | `LocationPicker` | Explicit "Capture Location" button; loading spinner; coarse geocoding fallback; no overconfident claims. | Good | Needs 48px button target. | High |
| `src/components/wizard/StepWizard.tsx` | `StepWizard` | Mobile stepper ("Step X of Y"); 1-column step container; sticky bottom actions with safe-area padding. | In Hardening | Bottom actions clipped on iPhone home indicator. | Critical |
| `src/components/sync/SubmissionViewModal.tsx` | `SubmissionViewModal` | Fullscreen mobile sheet; scrollable document previews; readable typography at 320px. | Good | Needs 16px padding on mobile. | Medium |
| `src/components/supervisor/AssessmentCard.tsx` | `AssessmentCard` | Mobile card representation of assessment record replacing tabular rows. | Needs Creation | Table was rendered directly. | High |

---

## 3. Implementation Plan & Gate Requirements

1. **Phase 2 (Foundations)**:
   - Apply 16px input font enforcement in `src/app/globals.css`.
   - Add safe-area utility classes (`pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`).
   - Add touch target utilities (`touch-target`, `touch-target-48`).
   - Add `prefers-reduced-motion` overrides and mobile performance shadow optimizations.
2. **Phase 3 (Form Wizard & Signature Pad)**:
   - Update `CaregiverConsentSignature.tsx` with `touch-action: none` on canvas and confirmation on Clear.
   - Update form inputs across `StepWizard.tsx`, `new/page.tsx`, `draft/[draftId]/page.tsx`, and `edit/page.tsx` with single-column responsive collapse (`grid-cols-1 md:grid-cols-2`).
3. **Phase 4 (Route Refinements & Card Views)**:
   - Transform `/assessment/sync` table into mobile card view below `md:`.
   - Transform `/supervisor/assessments` into mobile card view below `md:`.
   - Update `CompactMasthead.tsx` and `AppShell.tsx` for mobile navigation.
4. **Phase 5 (PWA & Manifest)**:
   - Ensure viewport meta tag includes `viewport-fit=cover`.
5. **Phase 6 (Testing & Quality Gates)**:
   - Configure Playwright E2E tests for mobile viewports (320px, 390px, 768px, desktop).
   - Execute test suites and document outcomes.
