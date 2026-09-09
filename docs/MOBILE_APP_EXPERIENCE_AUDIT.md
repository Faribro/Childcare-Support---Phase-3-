# Mobile App Experience Audit
## Childcare Support — Phase 3 PWA

**Baseline Commit**: `5f75e8c9a5a7bcb10f2c9b27ae3d37fa6f8e4415`  
**Audit Date**: September 9, 2026  
**Auditor Lead**: Principal Mobile Frontend Engineer & Accessibility Specialist  
**Target Devices**: Low- and Mid-Range Android Phones (4G/3G, Daylight), Apple iPhones (iOS 16-18 Safari/PWA), Field Tablets (768px-1024px)  

---

## 1. Executive Summary & Viewport Scope

This audit evaluates the mobile experience of the Childcare Support PWA across eight standardized viewports to transition the application from a "shrunk desktop web application" into an "app-native field tool".

### Evaluated Viewport Matrix

| Viewport Category | Dimensions (CSS px) | Typical Reference Device | Primary User Role |
| :--- | :--- | :--- | :--- |
| **Ultra-Compact** | 320 × 568 | iPhone SE (1st gen), JioPhone Next, budget Android | Field Caseworker |
| **Android Budget** | 360 × 800 | Samsung Galaxy A03/A14, Xiaomi Redmi 9A | Field Caseworker |
| **Standard iOS** | 375 × 667 | iPhone SE (2nd/3rd gen), iPhone 8 | Field Caseworker |
| **Modern iOS** | 390 × 844 | iPhone 12/13/14/15, 16 Pro | Field Caseworker |
| **Large Android** | 412 × 915 | Google Pixel 7/8, Samsung Galaxy S22/S23+ | Field Caseworker |
| **Compact Tablet** | 768 × 1024 | iPad Mini, Samsung Galaxy Tab A7 Lite | Field Supervisor |
| **Full Tablet** | 1024 × 768 | iPad 10th Gen (Landscape), Lenovo M10 | Field Supervisor |
| **Desktop Reference**| 1280 × 800 | Laptop / Regional Desk Station | State Director / M&E |

---

## 2. Baseline Audit Findings by Category

### A. Viewport & Horizontal Overflow (Zero-Overflow Policy)
- **ISSUE-MOB-01 (320px - 390px)**: The horizontal step pill navigation on the public landing page `/` overflowed the page container prior to the recent chevron buttons. On sub-routes (`/assessment/new`, `/assessment/record/[id]/edit`), multi-column grids (`grid-cols-2`, `grid-cols-3`) forced inputs below their minimum usable widths at 320px–375px.
- **ISSUE-MOB-02 (320px)**: Long beneficiary identifiers (`MH-PUN-2026-000000000001`), UUIDs, and Aadhaar masks lacked `overflow-wrap: anywhere` or `break-words`, causing container boundary breach on 320px screens.
- **ISSUE-MOB-03 (Tables on Mobile)**: `/assessment/sync` and `/supervisor/assessments` rendered `<table>` elements that clipped columns or forced wide horizontal pan gestures on screens < 768px.

### B. Typography & iOS Auto-Zoom Prevention (WCAG 1.4.4 / iOS Safari)
- **ISSUE-MOB-04 (16px Input Rule)**: Several input controls, date pickers, and select elements used `text-xs` (12px) or `text-sm` (14px). When tapped in iOS Safari, this triggered unwanted automatic viewport zoom, requiring users to manually pinch-to-unzoom on every form step.
- **ISSUE-MOB-05 (Contrast & Readability)**: Muted helper text (`text-slate-400`, `text-ink-400`) failed WCAG 2.2 AA 4.5:1 minimum contrast under bright sunlight conditions on budget LCD displays.
- **ISSUE-MOB-06 (Stepper Text Clipping)**: Stepper indicators displayed lengthy titles (e.g., "Step 1 of 8: Child Demographics & Residence Information"), wrapping across 3+ lines and consuming 30% of vertical screen estate at 320px.

### C. Touch Target Ergonomics & Tap Targets (WCAG 2.5.5 / 2.5.8)
- **ISSUE-MOB-07 (Sub-44px Touch Targets)**: 
  - Date picker clear buttons and calendar icon triggers measured ~28×28px.
  - Radio button / checkbox touch areas were restricted to native 16×16px boxes instead of wrapping entire card labels in a 48px target.
  - Pagination navigation pills and chevron controls measured 32×32px.
  - Icon-only buttons lacked `min-h-[44px] min-w-[44px]` touch targets.
- **ISSUE-MOB-08 (Bottom Action Bar Thumb Reach)**: Bottom navigation buttons ("Save Draft", "Next Step") lacked fixed thumb-reachable ergonomics on tall 20:9 aspect-ratio Android devices (412×915px).

### D. Safe Area Insets & Software Keyboard Obstruction
- **ISSUE-MOB-09 (Safe-Area Insets)**: Sticky bottom action bars on iPhone X+ and modern Android gesture navigation clipped against the home indicator bar due to missing `env(safe-area-inset-bottom)`.
- **ISSUE-MOB-10 (Software Keyboard Clashing)**: On Android Chrome and iOS Safari, opening the software keyboard obscured the active input and covered the "Next" button, requiring redundant manual scrolling.

### E. Touch Gestures & Signature Pad Safety
- **ISSUE-MOB-11 (Canvas Scroll Contention)**: The Caregiver Signature pad canvas lacked localized `touch-action: none`. When a caregiver attempted to sign with their finger or stylus, the entire web page scrolled vertically, corrupting the captured signature.
- **ISSUE-MOB-12 (Clear Signature Safety)**: The "Clear" signature action lacked a confirmation safeguard, allowing accidental thumb taps to permanently wipe a signed document.

### F. Performance, Battery & Motion Ergonomics
- **ISSUE-MOB-13 (Neon Animation Battery Drain)**: Continuous CSS breathing animations (`neonPulse 4s infinite`) with multi-layered box shadows (`0 0 40px 8px`) incurred 15–20% sustained CPU usage on low-end Mali/Adreno GPUs.
- **ISSUE-MOB-14 (Prefers-Reduced-Motion)**: Form pages did not honor `prefers-reduced-motion: reduce`, running pulsating wave animations and bouncing spider graphics while users were entering medical data.

---

## 3. Detailed Audit Matrix by Route

| Route | Primary Viewport Status | Critical Issues Detected | Proposed Action |
| :--- | :--- | :--- | :--- |
| **`/` (Landing)** | Acceptable (390px+), Fragile (320px) | Step scroll chevrons need touch padding; screenshot assets need responsive sizing. | Add 44px touch targets; optimize responsive image containers. |
| **`/app` (Workspace)** | Shrunk desktop look | Action cards stacked clumsily; sync badge clipped at 320px. | App-like card layout, large thumb tap targets. |
| **`/assessment/new`** | 2-col grids break at < 640px | Multi-column inputs, sub-16px font sizes, canvas scroll fighting. | Single-column collapse on mobile; 16px input fonts; `touch-action: none` on signature canvas. |
| **`/assessment/draft/[id]`** | 2-col grids break at < 640px | Same form-wizard constraints as `/assessment/new`. | Unify with responsive FormField and StepWizard components. |
| **`/assessment/draft/[id]/review`** | Multi-column summary tables | Data rows overflow 320px screen width. | Convert summary table to 1-column key-value cards. |
| **`/assessment/record/[id]/receipt`** | Good layout | Print button needs full width and safe area padding on mobile. | Ensure bottom print/share button is full-width with safe-area. |
| **`/assessment/sync`** | Table overflows < 768px | Dense table with 8 columns requires horizontal scroll. | Transform to mobile assessment card list below `md:`. |
| **`/assessment/record/[id]/edit`** | 2-col grids, 2000 lines | Sub-16px fonts, sticky bar obscuring fields, OCC conflict modal cramped. | Collapse to 1-column; full-width OCC resolution modal. |
| **`/supervisor/*`** | Desktop-first | Dense analytics charts and linelist table unreadable on 360px phones. | Implement mobile triage summary cards + non-blocking tablet notice. |

---

## 4. Mobile Support Matrix

| Platform / Browser | Support Tier | Certified Resolution Range | Key Verified Capabilities |
| :--- | :--- | :--- | :--- |
| **Android Chrome 100+** | **Tier 1 (Primary)** | 320px – 480px (Phones), 768px+ (Tablets) | Offline IndexedDB, Serwist Service Worker, Geolocation, Camera capture, PWA Add to Home Screen |
| **iOS Safari 16.4+** | **Tier 1 (Primary)** | 320px – 430px (iPhones), 768px+ (iPads) | Standalone PWA, Safe-area insets, Camera photo upload, Touch signature, 16px no-zoom inputs |
| **Samsung Internet** | **Tier 2 (Supported)**| 360px – 412px | Native PWA prompt, IndexedDB offline persistence |
| **Firefox Mobile** | **Tier 2 (Supported)**| 360px – 412px | Responsive layout, touch interactions |
| **Desktop Browsers** | **Tier 2 (Supervisor)**| 1024px – 2560px | Full linelist export, GIS MapLibre mapping, multi-column analytics |

---

## 5. Known Browser Limitations & Mitigations

1. **iOS Safari Automatic Zoom**:
   - *Limitation*: Inputs below 16px font-size trigger automatic zoom.
   - *Mitigation*: Global CSS rule enforces `font-size: 16px !important` for all input/select/textarea elements at `max-width: 768px`.
2. **iOS Standalone PWA Safe Areas**:
   - *Limitation*: Fixed headers and bottom bars can overlap with the Dynamic Island, notch, or home bar.
   - *Mitigation*: Comprehensive application of `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
3. **Canvas Drawing vs Page Scroll**:
   - *Limitation*: Touch events on an HTML5 `<canvas>` propagate to the document scroll unless explicitly captured.
   - *Mitigation*: Add `touch-action: none` inline on the signature canvas element and call `preventDefault()` on `touchmove`.
4. **Offline Background Sync on iOS**:
   - *Limitation*: iOS Safari does not support the Web Background Synchronization API (`sync` event).
   - *Mitigation*: Seamless foreground queue processing on window `online` event, route change, and manual "Sync Now" button.
