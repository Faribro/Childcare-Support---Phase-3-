# Mobile-First Experience Document (MFED)
## Childcare Support — Phase 3: Children Nutrition & Education Support Form PWA

**Document Version:** 1.0.0-MOBILE-SPEC  
**Classification:** Official / Restricted — Design & Engineering Specification  
**Target Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Target Viewports:** Mobile-First Baseline: **320px–480px** (CSS pixels); Progressive Enhancements: **768px** (Tablet), **1024px** (Desktop), **1280px+** (Supervisor Workstation)  
**Primary Field Hardware:** Low- to Mid-Range Android Smartphones (2GB–4GB RAM, Android 10–14, Chrome Mobile)  
**Author:** Staff Mobile Product Designer, Accessibility Specialist & Senior Frontend Engineer (Antigravity)  
**Status:** Under Design System Ratification & Engineering Review  

---

## Executive Summary & Design Mandate

The Phase 3 Progressive Web Application (PWA) for **India HIV/AIDS Alliance** is built for real-world frontline field operations. Caseworkers, outreach workers, and clinical field enumerators register vulnerable children, evaluate acute malnutrition (SAM/MAM), verify school attendance, and process educational support grants directly in high-burden communities, rural hamlets, and ART centre waiting rooms.

Field caseworkers do not operate in air-conditioned offices with high-speed fibre connections and 27-inch 4K monitors. They operate:
- In direct outdoor sunlight with severe screen glare.
- In rural or urban settlement areas with intermittent 2G/3G or non-existent cellular coverage.
- One-handed while holding physical clinical linelists, paper growth charts, or mid-upper arm circumference (MUAC) tapes.
- On low-cost Android smartphones with limited RAM (2GB–3GB), modest processors, and cracked or smudged touchscreens.
- Under time pressure where accidental phone lock, incoming phone calls, background app kills, or battery depletion must **never** result in data loss.

This document establishes the binding, non-negotiable engineering and UX contract for the mobile experience. **Mobile usability at 320px CSS width is the release gate.** Desktop interfaces are treated as progressive supervisory enhancements.

---

## 1. Mobile-First Strategy & Hierarchy of User Needs

### 1.1 Persona Operational Environments

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               OPERATIONAL REALITY COMPARISON MATRIX                                    │
├─────────────────────────┬───────────────────────────────────────┬──────────────────────────────────────┤
│ Operational Dimension   │ Frontline Field Enumerator (Mobile)   │ Programme Supervisor (Tablet/Desktop)│
├─────────────────────────┼───────────────────────────────────────┼──────────────────────────────────────┤
│ **Physical Device**     │ Low/Mid-tier Android phone (5.5"–6.5")│ 10" Android/iPad tablet or PC laptop │
│ **Viewport Width**      │ 320px – 412px (CSS pixels)            │ 768px – 1920px (CSS pixels)          │
│ **Network Reliability** │ Intermittent, packet loss, offline    │ Stable office WiFi or 4G broadband   │
│ **Ambient Lighting**    │ Harsh tropical sunlight to dim shacks │ Controlled indoor office lighting    │
│ **Interaction Posture** │ One-handed thumb use, standing/moving │ Two-handed typing, mouse & keyboard  │
│ **Session Context**     │ 5–15 min per child assessment         │ 1–3 hour audit and review sessions   │
│ **Primary Focus**       │ Rapid, error-free field data intake   │ Line-list audit, analytics, export   │
└─────────────────────────┴───────────────────────────────────────┴──────────────────────────────────────┘
```

### 1.2 Hierarchy of Mobile Frontline Needs

To guarantee field efficacy, engineering decisions must strictly respect this hierarchy of needs:

```
                  ┌─────────────────────────────────────┐
                  │    5. Advanced Analytics & D3       │  <-- Progressive Enhancement
                  ├─────────────────────────────────────┤
                  │    4. Transparent Queue & Sync      │
                  ├─────────────────────────────────────┤
                  │    3. Ergonomic Speed & Touch Target│
                  ├─────────────────────────────────────┤
                  │    2. Sunlight Legibility & Contrast│
                  ├─────────────────────────────────────┤
                  │    1. Zero Data Loss & Offline Form │  <-- Absolute Baseline Foundation
                  └─────────────────────────────────────┘
```

1. **Zero Data Loss (Baseline Non-Negotiable):** A caseworker’s typed input must never vanish due to an incoming call, screen lock, browser crash, or dead battery. Every keystroke is debounced into local IndexedDB within 400ms.
2. **Sunlight Legibility & High Contrast:** Forms must remain readable under intense outdoor midday sun without requiring caseworkers to squint or seek shade.
3. **Ergonomic Speed & Touch Accuracy:** All critical buttons and input targets must comfortably fit adult thumbs (minimum 44×44px, standard 48×48px) with generous spacing to eliminate mis-taps.
4. **Transparent Offline & Sync Feedback:** The user must always know whether the application is working offline, if their draft is safe, and the exact state of queued uploads.
5. **Supervisor Analytics & Line-List Audits:** Rich D3 data visualizations and dense multi-column tabular line-lists are progressively enabled on screens $\ge 768$px and $\ge 1024$px.

### 1.3 Core Workflow Taxonomy

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   WORKFLOW ACCESS MATRIX BY VIEWPORT                                   │
├─────────────────────────────────────┬─────────────────┬─────────────────┬──────────────────────────────┤
│ Workflow                            │ Mobile (320px+) │ Desktop (1024px)│ Interface Adaptation Pattern │
├─────────────────────────────────────┼─────────────────┼─────────────────┼──────────────────────────────┤
│ **Beneficiary Lookup & Triage**     │ Primary         │ Secondary       │ Full-width debounced cards   │
│ **6-Step Assessment Wizard**        │ Primary (Core)  │ Secondary       │ Single-column stacked cards  │
│ **Debounced Autosave Drafts**       │ Primary         │ Secondary       │ Vertical cards with progress │
│ **Sync Centre & Outbox Recovery**   │ Primary         │ Secondary       │ Bottom drawer / stacked list │
│ **Receipt & Submission Summary**    │ Primary         │ Secondary       │ Vertical receipt card / print│
│ **Supervisor Line-List Table**      │ Card Fallback   │ Primary (Full)  │ Stacked summary cards $\to$ Grid│
│ **Malnutrition D3 Visualisations**  │ Simplified Bar  │ Primary (Full)  │ Vertical ratio tiles $\to$ SVG│
│ **Bulk CSV / Linelist Export**      │ Hidden / Notice │ Primary (Full)  │ Redirected to Supervisor mode│
└─────────────────────────────────────┴─────────────────┴─────────────────┴──────────────────────────────┘
```

---

## 2. Device, Browser, Network & Environmental Support Matrix

### 2.1 Hardware & Browser Compatibility

Rather than relying on generic consumer market statistics, the target specification addresses the verified hardware tier distributed to NGO community health workers and peer field teams across India.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     DEVICE & BROWSER SUPPORT MATRIX                                    │
├───────────────────┬──────────────────────┬──────────────────────┬──────────────────────────────────────┤
│ Device Tier       │ Specifications       │ Supported Browsers   │ Technical Constraints & Mitigations  │
├───────────────────┼──────────────────────┼──────────────────────┼──────────────────────────────────────┤
│ **Low-End Android**│ 2GB–3GB RAM,         │ Chrome Mobile 100+,  │ Strict memory budget (<50MB heap).   │
│ (Primary Target)  │ Quad/Octa-core 1.6GHz│ Samsung Internet 18+,│ Virtualized lists for long queues.   │
│                   │ Android 10 Go to 13  │ Edge Mobile          │ Service Worker Cache-First shell.    │
├───────────────────┼──────────────────────┼──────────────────────┼──────────────────────────────────────┤
│ **Mid-End Android**│ 4GB–6GB RAM,         │ Chrome Mobile (all), │ Standard responsive baseline. 60fps  │
│                   │ Modern 2.0GHz+ SoC   │ Firefox Mobile       │ animations disabled if low battery.  │
├───────────────────┼──────────────────────┼──────────────────────┼──────────────────────────────────────┤
│ **iOS / iPadOS**  │ iPhone SE (2nd/3rd), │ Mobile Safari 16.4+  │ Handle WebKit 50MB quota cap & 7-day │
│ (Outreach Staff)  │ iPhone 11–15, iPads  │ (iOS PWA engine)     │ cache eviction. Warn if non-installed│
├───────────────────┼──────────────────────┼──────────────────────┼──────────────────────────────────────┤
│ **Field Tablets** │ 8"–11" Android / iPad│ Chrome / Safari      │ Adaptive 2-column form card grid.    │
├───────────────────┼──────────────────────┼──────────────────────┼──────────────────────────────────────┤
│ **Supervisor PC** │ Windows 10/11, macOS,│ Chrome, Edge, Safari,│ Full screen data grid, D3 analytics, │
│                   │ Linux Desktop        │ Firefox Desktop      │ multi-filter line-list export.       │
└───────────────────┴──────────────────────┴──────────────────────┴──────────────────────────────────────┘
```

### 2.2 Network Degradation & Recovery Profiles

Field staff encounter four distinct network states throughout a working day. The application must adapt deterministically without modal blockers:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    NETWORK DEGRADATION BEHAVIOUR MATRIX                                │
├───────────────────────┬──────────────────────┬─────────────────────────────────────────────────────────┤
│ Network State         │ Technical Profile    │ Application Behaviour & UI Manifestation                │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **1. Connected (4G)** │ RTT < 100ms,         │ Direct API transmission. Immediate acknowledgment.      │
│                       │ Bandwidth > 5 Mbps   │ Status indicator shows subtle green dot "Online".       │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **2. Slow / Flaky 3G**│ RTT 800ms–2500ms,    │ Requests capped at 10s timeout. If timeout expires,     │
│                       │ Bandwidth < 250 Kbps,│ payload is transparently placed in Dexie `syncQueue`.   │
│                       │ High packet jitter   │ UI notifies: "Saved to device • Sync queued".           │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **3. Intermittent**   │ Connections drop and │ SyncEngine pauses active network calls immediately on   │
│                       │ reconnect frequently │ `offline` event. Queued items wait for stable signal.   │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **4. Full Offline**   │ Complete airplane or │ Zero network fetch attempts. 100% of app shell, local   │
│                       │ zero coverage area   │ lookups, autosave, and validation execute in IndexedDB. │
│                       │                      │ Persistent non-blocking amber pill: "Working Offline".  │
└───────────────────────┴──────────────────────┴─────────────────────────────────────────────────────────┘
```

### 2.3 Environmental Realities & Physical Hazards

1. **Intense Tropical Sunlight & Screen Glare:**
   - Dark mode is strictly disabled for field forms (dark interfaces turn into black mirrors outdoors).
   - High-contrast pure black text (`#0F172A`) against pure white (`#FFFFFF`) or pale off-white (`#F8FAFC`).
   - Essential input borders use `#94A3B8` (Slate-400), exceeding WCAG 3:1 non-text contrast.
2. **Moisture, Grease & Dirty Screens:**
   - Active tap targets use generous bounding boxes with a minimum 8px margin of separation to prevent accidental adjacent activation.
3. **Shared Family or Community Devices:**
   - No sensitive child HIV disclosure data in unauthenticated cached views.
   - Masked Aadhaar (`XXXX-XXXX-1234`) and obscured clinical diagnosis codes.
   - Configurable 15-minute inactivity auto-lock.

---

## 3. Responsive Breakpoint & Layout Contract

### 3.1 Strict Breakpoint Specifications

The application uses an uncompromising mobile-first CSS architecture. Media queries apply progressive enhancement upwards (`min-width`), never degrading desktop layouts downwards (`max-width`).

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       BREAKPOINT CONTRACT TABLE                                        │
├───────────────────┬──────────────┬──────────────┬──────────────┬───────────────────────────────────────┤
│ Breakpoint Tier   │ Viewport W   │ Gutters (X)  │ Max Container│ Layout & Navigation Structure         │
├───────────────────┼──────────────┼──────────────┼──────────────┼───────────────────────────────────────┤
│ **Mobile Narrow** │ 320px–374px  │ 12px         │ 100%         │ Single-column; compact masthead;      │
│ (Baseline Target) │              │              │              │ stacked buttons; full-width inputs.   │
├───────────────────┼──────────────┼──────────────┼──────────────┼───────────────────────────────────────┤
│ **Mobile Regular**│ 375px–479px  │ 16px         │ 100%         │ Single-column; sticky bottom action   │
│                   │              │              │              │ bar; segmented progress bar.          │
├───────────────────┼──────────────┼──────────────┼──────────────┼───────────────────────────────────────┤
│ **Mobile Wide**   │ 480px–767px  │ 20px         │ 540px        │ Centered single-column card; compact  │
│ (Large phones)    │              │              │              │ horizontal button pairs.              │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────────────────────────────┤
│ **Tablet**        │ 768px–1023px │ 24px         │ 720px        │ 2-column input grid where logical;    │
│ (Portrait/Land.)  │              │              │              │ persistent top context bar.           │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────────────────────────────┤
│ **Desktop**       │ 1024px–1279px│ 32px         │ 980px        │ Split-screen review layout; full line-│
│                   │              │              │              │ list data table with sorting.         │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────────────────────────────┤
│ **Large Workst.** │ 1280px+      │ 40px         │ 1200px       │ Multi-column supervisor dashboard,    │
│                   │              │              │              │ interactive D3 flowcharts & analytics.│
└───────────────────┴──────────────┴──────────────┴──────────────┴──────────────────────────────────────┘
```

### 3.2 No-Horizontal-Overflow Guarantee

Horizontal scrolling on mobile forms causes user disorientation, hidden validation errors, and high drop-off rates.
**Rule:** At all viewports between 320px and 767px, horizontal page scroll is zero:

```css
/* Global Mobile Viewport Constraint */
html, body {
  max-width: 100vw;
  overflow-x: hidden;
  position: relative;
  -webkit-text-size-adjust: 100%;
}
```

Specific adaptations at 320px:
- **Long ART Registration Codes / UUIDs:** Wrapped with `break-all` or truncated with click-to-copy chips.
- **Form Tables:** Wide tables are completely prohibited on mobile screens. Tabular data transforms into vertical structured key-value cards.
- **Select Dropdowns:** Full-screen modal sheets or native bottom select pickers replace wide popover menus.
- **Receipts:** Multi-column summary tables convert to a vertical linear timeline receipt.

### 3.3 Safe-Area Inset Handling

Modern Android and iOS devices feature display notches, punch-hole cameras, and floating bottom gesture navigation bars. Layouts must respect dynamic system safe-areas:

```css
/* Safe-area insets for modern mobile viewports */
.safe-padding-top {
  padding-top: env(safe-area-inset-top, 0px);
}
.safe-padding-bottom {
  padding-bottom: env(safe-area-inset-bottom, 16px);
}
.sticky-bottom-bar {
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
```

---

## 4. Mobile Information Architecture & Navigation Model

### 4.1 Navigation Architecture Rationale

Desktop sidebars and nested horizontal menus fail on mobile field devices because they steal valuable vertical screen space and require complex multi-tap discovery.

The Phase 3 mobile navigation model uses a **Dual-Layer Focused Navigation Strategy**:
1. **Top Compact Institutional Masthead:** Displays organisation identity, active connectivity badge, and profile/sync trigger. Height is capped at 52px.
2. **Persistent Context Bar (During Active Assessment):** Pins the active child's ART ID and draft save status immediately below the masthead (36px).
3. **Bottom Sticky Action Bar:** Houses the primary forward/backward progression buttons within immediate thumb reach.
4. **No Multi-Tab Distraction During Data Entry:** When inside an active assessment form, general navigation tabs are hidden to maintain cognitive focus and prevent accidental tab abandonment.

### 4.2 Application Route Hierarchy & Mobile Flows

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 ROUTE HIERARCHY                                 │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
    / (Action Centre)                                    /supervisor (Auth Guard)
    ├─ Active Outreach Counter                           ├─ /linelist (Grid view)
    ├─ [Start New Assessment] CTA                        ├─ /analytics (D3 charts)
    ├─ Resume Saved Drafts Card (Count)                  └─ /export (CSV download)
    └─ Sync Queue Summary Badge
             │
             ├─────────────────────────────────────────┐
             ▼                                         ▼
    /assessment/new                           /assessment/drafts
    ├─ Step 1: Demographics                   ├─ Draft List (Sorted by edit)
    ├─ Step 2: Household & Socioeconomic      ├─ [Resume] $\to$ jumps to active step
    ├─ Step 3: Clinical & Nutrition (MAM/SAM) └─ [Delete] $\to$ confirmation sheet
    ├─ Step 4: Education & School Support
    ├─ Step 5: DBT Bank Details & Upload
    └─ Step 6: Review, Sign-off & Queue
             │
             ▼
    /assessment/receipt/[uuid]
    ├─ Unique Client UUID Stamp
    ├─ Submission Timestamp & Synced Status
    ├─ Summary Card (Read-only)
    └─ [New Assessment] / [Return to Home]
```

### 4.3 Back-Button Navigation Intercept & Draft Preservation

A frequent hazard on Android devices is the hardware "Back" button or swipe-from-edge gesture. In a standard web app, this navigates away and loses form state.

**Binding Behaviour Contract:**
- When inside `/assessment/new`, the browser history state is managed with `window.history.pushState`.
- If the caseworker presses hardware Back or swipe-navigates backwards:
  1. If on Step 2–6: Navigates back to the preceding step (e.g. Step 3 $\to$ Step 2) without reloading the page.
  2. If on Step 1: Triggers a native-styled bottom sheet dialog:
     - **Title:** "Exit to Home Screen?"
     - **Message:** "Your draft is safely saved on this device. You can resume this assessment anytime from the Drafts tab."
     - **Actions:** `[Keep Editing]` (Primary default) | `[Save & Exit to Home]` (Secondary neutral).
- Under **no circumstance** will navigation discard form entries without an explicit double-confirmation.

---

## 5. Complete Mobile Form Specification

### 5.1 Step 1 to 6 Form Density & Cognitive Chunking

Long, unbroken forms cause severe cognitive fatigue on small screens. The assessment is partitioned into 6 distinct, single-purpose steps:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  6-STEP MOBILE ASSESSMENT WIZARD                                       │
├──────┬──────────────────────┬─────────────────┬────────────────────────────────────────────────────────┤
│ Step │ Title                │ Field Count     │ Mobile Interaction Focus                               │
├──────┼──────────────────────┼─────────────────┼────────────────────────────────────────────────────────┤
│ **1**│ Child Demographics   │ 7 fields        │ ART ID lookup; masked Aadhaar; DOB date picker.        │
│ **2**│ Household & Family   │ 5 fields        │ Full-width segmented cards for orphanhood & caregiver. │
│ **3**│ Clinical & Nutrition │ 6 fields        │ Number pad inputs for Ht/Wt/MUAC; instant MAM/SAM card.│
│ **4**│ Education Support    │ 5 fields        │ Grade select sheet; attendance percentage slider/input.│
│ **5**│ DBT Bank & Documents │ 5 fields        │ IFSC uppercase alphanumeric; camera passbook capture.  │
│ **6**│ Review & Declaration │ 1 summary + sig │ Read-only verification cards; caseworker sign-off.     │
└──────┴──────────────────────┴─────────────────┴────────────────────────────────────────────────────────┘
```

### 5.2 Control Patterns & Touch Optimisations

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MOBILE CONTROL PATTERNS SPECIFICATION                                │
├───────────────────────┬──────────────────────┬─────────────────────────────────────────────────────────┤
│ Control Type          │ Mobile Target Size   │ Mobile Usability Implementation Pattern                 │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Text Input**        │ Min 48px height      │ Font-size strictly 16px (prevents iOS/Android autozoom).│
│                       │ Full width (100%)    │ Clear `X` button appears when text is entered.          │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Numeric Input**     │ Min 48px height      │ Uses `inputmode="decimal"` or `inputmode="numeric"`.    │
│ (Weight, Height, MUAC)│ Right-aligned units  │ Large numeric keypad opens directly; no alphabet shift. │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Single Select**     │ Min 48px trigger     │ For $\le 4$ options: Full-width segmented radio cards.  │
│ (Gender, Orphanhood)  │ Full width           │ For $> 4$ options: Full-screen mobile bottom sheet list │
│                       │                      │ with live search filter (never tiny dropdown popovers). │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Radio / Checkbox**  │ Min 52px card height │ Native 16px boxes replaced with full-width tactile      │
│                       │ Padding 12px 16px    │ cards. Tap anywhere on card activates. Active state:   │
│                       │                      │ 2px Indigo border (`#1E3A8A`) + subtle blue background. │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Date of Birth**     │ Segmented 3-box or   │ Direct 3-part day/month/year inputs with auto-advance   │
│                       │ Native Date Picker   │ OR native calendar picker constrained to valid ages.   │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Document Camera**   │ Min 56px action tile │ Direct HTML file input with `capture="environment"`.    │
│                       │ With preview chip    │ Client-side image compression to $< 200$ KB before save.│
└───────────────────────┴──────────────────────┴─────────────────────────────────────────────────────────┘
```

### 5.3 Keyboard Focus & Viewport Resizing Flow

A major source of broken mobile forms is the software virtual keyboard (Gboard, Samsung Keyboard, iOS Keyboard) covering the active input or fixed buttons:

```
                  ┌──────────────────────────────┐
                  │ Top Masthead                 │
                  ├──────────────────────────────┤
                  │ Form Input (Focused)         │  <-- Scrolled to upper 30% of viewport
                  ├──────────────────────────────┤
                  │                              │
                  │   [ VIRTUAL KEYBOARD ]       │  <-- Occupies lower 45%–55% of screen
                  │   (Gboard / Samsung / iOS)   │
                  │                              │
                  └──────────────────────────────┘
```

**Technical Enforcement Contract:**
1. **`scrollIntoView` with Scroll Margin:** Every form input has CSS `scroll-margin-top: 80px`. When focused, JavaScript smoothly scrolls the container so the label, input, and helper text sit comfortably above the virtual keyboard.
2. **Dynamic Sticky Bar Anchoring:** The bottom action bar monitors the `window.visualViewport` API. When the keyboard opens, the sticky action bar converts to standard static document flow or docks smoothly above the keyboard to prevent covering active fields.
3. **`enterkeyhint="next"`:** All non-terminal text inputs specify `enterkeyhint="next"` to allow the user to advance directly between fields without manual dismissal of the keyboard. Terminal inputs specify `enterkeyhint="done"`.

### 5.4 Conditional Logic & Instant Clinical Triage Alerts

Field workers should not be overwhelmed with irrelevant questions.
- **Conditional Education Fields:** If the child is not enrolled in school, standard, attendance, and fee questions are hidden.
- **Instant Malnutrition Triage (Step 3):**
  When height, weight, and age are entered, the system calculates BMI-for-age and MUAC classification locally in real-time. If Severe Acute Malnutrition (SAM) or Moderate Acute Malnutrition (MAM) is detected, an accessible clinical alert card appears immediately below the measurement block:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ CLINICAL NUTRITION ASSESSMENT RESULT                         │
├─────────────────────────────────────────────────────────────────┤
│ Child Status: SEVERE ACUTE MALNUTRITION (SAM)                   │
│ • Calculated BMI-for-Age: < -3 Z-score                          │
│ • MUAC: 112 mm (Red Zone: < 115 mm)                             │
│                                                                 │
│ ACTION REQUIRED:                                                │
│ 1. Prioritise for immediate supplementary nutrition support.    │
│ 2. Refer to nearest Nutrition Rehabilitation Centre (NRC).      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Thumb-Zone & Ergonomics Rules

### 6.1 Physical Reachability Zones on Mobile Devices

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ONE-HANDED THUMB REACH ZONES                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────────────────────────────────┐                                   │
│   │ [RED ZONE: HARD TO REACH]               │  <-- Read-only title, sync pill,  │
│   │ Top 20% of screen                       │      profile icon. NO primary CTAs│
│   ├─────────────────────────────────────────┤                                   │
│   │                                         │                                   │
│   │ [YELLOW ZONE: STRETCH REACH]            │  <-- Form labels, helper text,    │
│   │ Middle 35% of screen                    │      secondary option cards.      │
│   │                                         │                                   │
│   ├─────────────────────────────────────────┤                                   │
│   │                                         │                                   │
│   │ [GREEN ZONE: NATURAL THUMB REACH]       │  <-- Active input fields, radio   │
│   │ Lower 45% of screen                     │      cards, and PRIMARY ACTION BAR│
│   │                                         │                                   │
│   └─────────────────────────────────────────┘                                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Action Placement Contract

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       ACTION PLACEMENT RULES                                           │
├───────────────────────┬──────────────────────┬─────────────────────────────────────────────────────────┤
│ Action Intent         │ Ergonomic Placement  │ Visual Style & Size Specification                       │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Primary Forward**   │ Bottom Bar (Right or │ Full-width (or 65% split). Min 48px height. Solid Navy  │
│ (`Next`, `Submit`)    │ Full Width)          │ (`#1E3A8A`) with crisp white bold text.                 │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Secondary Backward**│ Bottom Bar (Left)    │ 35% split or upper card button. Min 48px height.        │
│ (`Previous`, `Back`)  │                      │ White background with Slate-300 border and ink text.   │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Auxiliary Action**  │ Context Bar or Card  │ Subtle ghost button with icon. Text callout (`text-sm`).│
│ (`Save Draft & Exit`) │ Bottom Link          │ Generous 44px tap zone without dominant visual weight.  │
├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ **Destructive Action**│ Inside Confirmation  │ Full-width crimson button (`#BE123C`). Requires explicit│
│ (`Delete Draft`)      │ Bottom Sheet Only    │ confirmation modal sheet; never a single casual tap.   │
└───────────────────────┴──────────────────────┴─────────────────────────────────────────────────────────┘
```

### 6.3 Handedness Neutrality & Accidental Tap Prevention

- **Full-Width Action Buttons:** On screens $< 400$px, the primary action button spans the full width of the container (`w-full`), making it equally accessible to left-handed and right-handed thumbs.
- **Double-Submit Lockout:** Once the caseworker taps `[Queue Assessment for Sync]`:
  1. The button enters an immediate disabled state with a clean inline SVG spinner.
  2. The button label changes to `"Finalising Assessment..."`.
  3. Client-side double-tap events are swallowed at the event loop level.
  4. The unique RFC 4122 UUIDv4 is committed atomically to Dexie IndexedDB before transitioning to the receipt screen.

---

## 7. Offline, Autosave & Sync Mobile UX

### 7.1 Visual Status Hierarchy & Exact User-Facing Copy

To eliminate caseworker anxiety regarding whether their work is saved, the application uses precise, plain-language status indicators that avoid technical jargon (such as "HTTP 500", "IndexedDB", or "Sync Mutation Error").

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SYNC STATUS PRESENTATION TABLE                                      │
├───────────────────────┬──────────────────────┬─────────────────────────┬───────────────────────────────┤
│ System State          │ Status Pill Copy     │ Visual Hierarchy        │ Meaning to Caseworker         │
├───────────────────────┼──────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **Draft Saved**       │ "Saved locally"      │ Subtle Gray badge       │ Every keystroke safely stored │
│                       │                      │ Slate-600 with checkmark│ on this phone. Zero loss risk.│
├───────────────────────┼──────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **Active Typing**     │ "Saving..."          │ Gentle pulse dot        │ Input being written to local  │
│                       │                      │ Slate-400 font          │ IndexedDB (400ms debounce).   │
├───────────────────────┼──────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **Queued for Upload** │ "Queued for sync"    │ Solid Amber chip        │ Assessment complete. Waiting  │
│                       │                      │ Amber-700 on Amber-50   │ for internet or sync cycle.   │
├───────────────────────┼──────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **Syncing**           │ "Syncing now..."     │ Blue badge with         │ Actively transmitting payload │
│                       │                      │ rotating spinner        │ to central Google Sheets.     │
├───────────────────────┼──────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **Verified Synced**   │ "Synced to central"  │ Rich Emerald chip       │ Row successfully written and  │
│                       │                      │ Emerald-700 on Em-50    │ acknowledged by server.       │
├───────────────────────┼──────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **Network Failed**    │ "Sync paused"        │ Warm Amber/Rose chip    │ No network. Assessment safe on│
│                       │                      │ "Will retry automatically"│ phone. Will retry on reconnect│
├───────────────────────┼──────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **Supervisor Review** │ "Action needed"      │ Crimson alert card with │ Duplicate ART ID or conflict. │
│ (Conflict)            │                      │ detailed guidance       │ Requires supervisor sign-off. │
└───────────────────────┴──────────────────────┴─────────────────────────┴───────────────────────────────┘
```

### 7.2 Interruption Resilience & Relaunch Recovery

If the caseworker encounters any of the following field interruptions:
- The phone receives an incoming cellular call.
- The phone screen turns off / enters auto-lock.
- The browser tab is closed accidentally or purged by the Android OS due to low RAM.
- The battery drops to 0% and the phone shuts down.

**Recovery Contract:**
1. **On Relaunch:** The user opens the PWA from their home screen.
2. **Autosave Detection:** The application queries Dexie `drafts` table for the most recent un-submitted assessment.
3. **Banner Prompt:** An accessible high-contrast recovery card appears at the top of the home screen:
   ```
   ┌─────────────────────────────────────────────────────────────┐
   │ 📝 UNFINISHED ASSESSMENT DETECTED                           │
   ├─────────────────────────────────────────────────────────────┤
   │ Child: Rahul M. (ART ID: MH-PUN-0921)                       │
   │ Last edited: 8 minutes ago (Step 3: Clinical Nutrition)     │
   │                                                             │
   │ [Resume Assessment] (Primary)      [Dismiss Draft] (Ghost)  │
   └─────────────────────────────────────────────────────────────┘
   ```
4. **Resumption:** Tapping `[Resume Assessment]` restores the form directly to the exact step with 100% of previous input values intact.

---

## 8. Mobile-Specific Component Specifications

### 8.1 Component Architecture Overview

All mobile components adhere to strict accessibility, touch target, and visual contracts.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MOBILE COMPONENT INVENTORY TABLE                                     │
├───────────────────────────────┬──────────────────────────────────┬─────────────────────────────────────┤
│ Component Name                │ Primary Role                     │ Key Props & Behavioural Contracts   │
├───────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────┤
│ `MobileAppShell`              │ Top-level responsive container   │ Safe-area padding; viewport lock.   │
│ `CompactGovernmentMasthead`   │ Institutional brand header       │ Height 52px; logo + offline badge.  │
│ `MobileContextBar`            │ Active child info & draft status │ Height 36px; ART ID chip + save text│
│ `MobileFormStepper`           │ Step breadcrumb on mobile        │ Segmented 6-bar with step counter.  │
│ `QuestionShell`               │ Accessible form group container  │ Label, required mark, helper, error.│
│ `MobileRadioCardGroup`        │ Accessible full-width cards      │ Value, onChange, options, name.     │
│ `MobileSelectDrawer`          │ Mobile bottom sheet select list  │ Options, search filter, onSelect.   │
│ `BottomActionBar`             │ Sticky thumb-zone navigation     │ onNext, onPrev, isNextLoading, cta. │
│ `KeyboardAwareScrollWrapper`  │ Dynamic viewport scroll manager  │ Observes visualViewport; adjusts pad│
│ `MobileDialogSheet`           │ Bottom drawer modal replacement  │ isOpen, onClose, title, children.   │
│ `DraftCard`                   │ Saved draft card on mobile       │ draft, onResume, onDelete.          │
│ `ValidationSummary`           │ Top-of-step error list           │ errors, onFocusField.               │
│ `ReceiptView`                 │ Final submission verification    │ record, onPrint, onDone.            │
│ `OfflineFallback`             │ Offline empty state              │ retryAction, message.               │
└───────────────────────────────┴──────────────────────────────────┴─────────────────────────────────────┘
```

### 8.2 Detailed Component Contracts & Code Signatures

#### `MobileAppShell`
```typescript
interface MobileAppShellProps {
  children: React.ReactNode;
  activeContext?: {
    artId?: string;
    childName?: string;
    saveStatus?: 'saving' | 'saved' | 'queued' | 'synced' | 'failed';
  };
  hideBottomBar?: boolean;
}
```
- **A11y:** Contains landmark roles `<header>`, `<main id="main-content">`, and sticky navigation `<nav>`. Includes hidden Skip-to-Content link.
- **Visual:** Background `--color-canvas` (`#F8FAFC`). Full height `min-h-screen`.

#### `MobileFormStepper`
```typescript
interface MobileFormStepperProps {
  currentStep: number; // 1 to 6
  totalSteps: number;   // 6
  stepTitle: string;    // e.g. "Step 3: Clinical Nutrition"
  onStepClick?: (step: number) => void;
}
```
- **Visual:** 6 segmented horizontal bars (each 4px high) with 4px gap. Completed steps: solid `#1E3A8A`. Active step: solid `#2563EB`. Future steps: `#E2E8F0`.
- **Text:** `"Step 3 of 6: Clinical Nutrition"` in `text-xs font-semibold text-slate-700`.

#### `BottomActionBar`
```typescript
interface BottomActionBarProps {
  onNext: () => void;
  onPrev?: () => void;
  nextLabel?: string;
  prevLabel?: string;
  isSubmitting?: boolean;
  disableNext?: boolean;
  showSaveDraft?: boolean;
  onSaveDraft?: () => void;
}
```
- **Ergonomics:** Fixed to bottom viewport with `safe-padding-bottom`. Background `#FFFFFF` with top border `border-t border-slate-200` and crisp elevation `shadow-lg`.
- **Height:** Minimum 68px (excluding safe-area padding). Buttons have min-height 48px.

#### `MobileSelectDrawer`
```typescript
interface MobileSelectDrawerProps<T extends string | number> {
  isOpen: boolean;
  title: string;
  options: Array<{ value: T; label: string; description?: string }>;
  selectedValue?: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  searchable?: boolean;
}
```
- **Behaviour:** Slides smoothly up from the bottom occupying up to 80% of screen height. Contains sticky search input at top. Each option row has a 52px touch height with checkmark indicator for selected item.

---

## 9. Responsive Data-Display Patterns

### 9.1 The "Cards Over Tables" Rule

On mobile screens $< 768$px, standard multi-column data tables break user experience: columns get cropped, text wraps vertically into illegible single words, and horizontal scrolling hides vital status columns.

**Transformation Standard:** All tabular line-list items are transformed into structured key-value cards on mobile devices:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     MOBILE BENEFICIARY LINE-LIST CARD FORMAT                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [ART ID: MH-PUN-0842]                         [Status: SAM (Severe Acute)]      │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Child Name: Pooja Ramesh K. (Age: 7 yrs)                                        │
│ Caregiver: Sunita K. (Mother) • Contact: +91 98XXX X1234                        │
│ District: Pune | ART Centre: Sassoon General Hospital                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Nutrition Status: Weight: 14.2 kg | Height: 104 cm | MUAC: 114 mm               │
│ Education: Enrolled (Std 2) • Grant Recommended: ₹2,000                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Last Assessment: 04-Sep-2026                 [View Full Assessment >]           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Responsive Transition Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 DATA PRESENTATION TRANSITION MATRIX                                    │
├───────────────────────┬────────────────────────────┬───────────────────────────────────────────────────┤
│ Data Domain           │ Mobile (< 768px)           │ Tablet / Desktop (>= 768px)                       │
├───────────────────────┼────────────────────────────┼───────────────────────────────────────────────────┤
│ **Beneficiary Search**│ Stacked cards with direct  │ 2-column card grid or concise table view.         │
│                       │ action buttons.            │                                                   │
├───────────────────────┼────────────────────────────┼───────────────────────────────────────────────────┤
│ **Drafts List**       │ Stacked cards with step    │ Multi-column list with last modified date, author,│
│                       │ progress bar and resume.   │ and actions.                                      │
├───────────────────────┼────────────────────────────┼───────────────────────────────────────────────────┤
│ **Sync Queue Outbox** │ Stacked cards with status  │ Detailed data table with payload inspector and    │
│                       │ pill and manual retry CTA. │ raw transmission log drawer.                      │
├───────────────────────┼────────────────────────────┼───────────────────────────────────────────────────┤
│ **Supervisor Audits** │ Collapsible accordion cards│ Full virtualized data grid with multi-column      │
│                       │ with essential indicators. │ sorting, filtering, and direct CSV export.        │
└───────────────────────┴────────────────────────────┴───────────────────────────────────────────────────┘
```

---

## 10. Mobile Accessibility (WCAG 2.2 AA Compliance)

### 10.1 Accessibility Non-Negotiables

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      WCAG 2.2 AA COMPLIANCE GATES                                      │
├───────────────────────┬────────────────────┬───────────────────────────────────────────────────────────┤
│ Criterion             │ Threshold          │ Implementation Enforcement                                │
├───────────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
│ **Contrast (Text)**   │ Min 4.5:1          │ Primary text `#0F172A` on `#FFFFFF` gives 15.8:1 ratio.   │
│                       │ (Normal body text) │ Secondary text `#475569` gives 7.2:1 (well above 4.5:1).  │
├───────────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
│ **Contrast (Non-text)│ Min 3.0:1          │ Input borders `#94A3B8` gives 3.1:1 against white canvas. │
│                       │ (Borders & UI)     │ Focus outlines use `#2563EB` (3px thickness, 4.8:1).      │
├───────────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
│ **Touch Target Size** │ Min 44×44 CSS px   │ Core controls enforce 48×48 CSS px with 8px margin.       │
├───────────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
│ **Text Scaling**      │ Up to 200% Zoom    │ Layout flexes vertically without horizontal overflow or   │
│                       │                    │ overlapping buttons when system font size is doubled.     │
├───────────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
│ **Screen Reader**     │ TalkBack /         │ ARIA landmarks, `aria-live="polite"` for autosave notifications,│
│ **Announcements**     │ VoiceOver          │ `aria-describedby` for error text, `aria-invalid="true"`. │
├───────────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
│ **Reduced Motion**    │ User Preference    │ `@media (prefers-reduced-motion: reduce)` disables all     │
│                       │                    │ CSS transitions, drawer slides, and animated spinners.    │
└───────────────────────┴────────────────────┴───────────────────────────────────────────────────────────┘
```

### 10.2 Accessible Form Validation & Screen Reader Flow

When a caseworker attempts to proceed past an invalid step:
1. **Focus Management:** Focus is programmatically shifted to the `ValidationSummary` banner at the top of the form using `tabIndex={-1}` and `.focus()`.
2. **Screen Reader Announcement:** The banner contains `role="alert"` or `aria-live="assertive"`, announcing: `"Please correct 2 errors before continuing: Height is required, Date of birth cannot be in the future."`
3. **Interactive Links:** Each error item inside the banner is an interactive link that immediately shifts focus to the offending input.

---

## 11. Mobile Performance Budget & Hardware Constraints

### 11.1 Budget Allocation

Low-end Android devices have limited CPU single-thread performance and constrained RAM. Heavy JavaScript execution freezes the UI thread and causes dropped frames during typing.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       PERFORMANCE BUDGET TABLE                                         │
├───────────────────────────────────┬────────────────────┬───────────────────────────────────────────────┤
│ Metric / Resource                 │ Strict Budget Cap  │ Measurement & Enforcement Tool                │
├───────────────────────────────────┼────────────────────┼───────────────────────────────────────────────┤
│ **Total Initial JS (Gzip/Brotli)**│ $\le 180$ KB       │ `@next/bundle-analyzer` in CI pipeline.       │
│ **Total Initial CSS**             │ $\le 30$ KB        │ Purged Tailwind output check in CI.           │
│ **First Contentful Paint (FCP)**  │ $< 1.8$ seconds    │ Lighthouse CI on 4x CPU slowdown + Slow 4G.   │
│ **Largest Contentful Paint (LCP)**│ $< 2.5$ seconds    │ Lighthouse CI mobile profile.                 │
│ **Interaction to Next Paint (INP)**$< 150$ ms          │ Chrome DevTools Performance Recording on typing│
│ **Cumulative Layout Shift (CLS)** │ $< 0.05$           │ Zero layout shift during font or image load.  │
│ **IndexedDB 400ms Autosave Write**│ $< 40$ ms execution│ Performance timer logs in dev environment.    │
│ **Offline Precache Bundle Total** │ $\le 1.5$ MB       │ Serwist build report.                         │
└───────────────────────────────────┴────────────────────┴───────────────────────────────────────────────┘
```

### 11.2 Memory Management & Battery Preservation

- **No Heavy Animation Loops:** No continuous CSS infinite spins or canvas particles that drain battery outdoors.
- **Image Compression in Web Worker:** Beneficiary passbook photos taken via mobile camera (often 5MB–12MB raw) are downscaled to max 1200px and compressed to $< 200$ KB JPEG using an off-thread canvas before storing in IndexedDB.

---

## 12. PWA, Install & Update Strategy on Mobile

### 12.1 Web App Manifest & Install Experience

```json
{
  "name": "Alliance Child Nutrition & Education Support",
  "short_name": "Child Nutrition",
  "description": "Offline-First Child Nutrition & Education Assessment Platform",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#F8FAFC",
  "theme_color": "#1E3A8A",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### 12.2 Polite Installation Banner (No Aggressive Prompts)

- **Do Not Harass:** The PWA never shows an aggressive full-screen modal demanding installation on first visit.
- **Contextual Value-Add Banner:** If `beforeinstallprompt` is fired, an unobtrusive banner appears on the dashboard:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │ 📲 INSTALL APP FOR FASTER OFFLINE FIELD USE                 │
  │ Add to your home screen to complete forms without internet. │
  │ [Install App]                                   [Dismiss]   │
  └─────────────────────────────────────────────────────────────┘
  ```

### 12.3 Update Lifecycle & Active Form Protection

**Crucial Safety Rule:** A Service Worker update must **NEVER** force-reload the page while a caseworker is actively completing an assessment!
- If a new version is detected via Serwist:
  - If user is inside `/assessment/new`: The update is queued silently. No prompt is shown.
  - If user is on `/` (Home Dashboard): A subtle top toast notifies: `"App update available • Tap to refresh"`.

---

## 13. Comprehensive Mobile Test Plan & Acceptance Gates

### 13.1 Playwright Mobile Emulation & Device Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       MOBILE TEST HARNESS MATRIX                                       │
├───────────────────────┬──────────────────────────┬─────────────────────────────────────────────────────┤
│ Test Scenario         │ Viewport / Device Profile│ Acceptance Criteria & Verification Method           │
├───────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────┤
│ **320px Overflow**    │ 320×568 (iPhone SE v1)   │ Playwright verifies `scrollWidth === clientWidth`   │
│                       │                          │ across all 6 wizard steps. Zero horizontal scroll.  │
├───────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────┤
│ **Virtual Keyboard**  │ 360×740 (Android Pixel)  │ Simulates viewport resize with keyboard open. Active│
│                       │ Height reduced by 50%    │ input remains visible and focused above keyboard.   │
├───────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────┤
│ **200% Font Zoom**    │ 375×667 @ 200% zoom      │ Playwright checks text nodes do not overlap and     │
│                       │                          │ buttons do not clip text labels.                    │
├───────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────┤
│ **Touch Target Size** │ Axe-Core Automated Audit │ 100% of interactive elements meet 44×44px minimum.  │
├───────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────┤
│ **Offline Dropout**   │ Context `offline: true`  │ Complete Steps 1–6 offline. Assert draft saved in   │
│                       │                          │ Dexie and status transitions to `Queued for sync`.  │
├───────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────┤
│ **Process Kill**      │ Mid-form page refresh /  │ Reopen page. Assert recovery prompt restores 100%   │
│ **Recovery**          │ simulated crash          │ of typed values in IndexedDB.                       │
├───────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────┤
│ **Network Jitter**    │ Slow 3G / 2000ms latency │ Form submission does not freeze. UI updates to      │
│                       │                          │ "Queued for sync" without unhandled promise errors. │
└───────────────────────┴──────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 14. Mobile-First Design QA Checklist

This checklist defines the objective pass/fail gates for every screen before it can be merged into the production branch:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     MOBILE-FIRST DESIGN QA CHECKLIST                                   │
├────┬──────────────────────────────────────────────────────────┬───────────┬────────────────────────────┤
│ #  │ Inspection Item                                          │ Standard  │ Pass / Fail Verification   │
├────┼──────────────────────────────────────────────────────────┼───────────┼────────────────────────────┤
│ 1  │ **Zero Horizontal Scroll at 320px Width**                │ Mandated  │ PASS: Page fits viewport.  │
│ 2  │ **Minimum Touch Target Size >= 44x44 CSS px**            │ Mandated  │ PASS: All controls 48px.   │
│ 3  │ **Editable Inputs Font Size >= 16px**                    │ Mandated  │ PASS: No browser autozoom. │
│ 4  │ **Text Scaling Up to 200% without Content Loss**         │ Mandated  │ PASS: Clean vertical wrap. │
│ 5  │ **Contrast Ratio >= 4.5:1 for Text, >= 3.0:1 for Borders**│ Mandated  │ PASS: High daylight ratio. │
│ 6  │ **Visible Focus Ring (3px high-contrast blue)**          │ Mandated  │ PASS: Focus visible.       │
│ 7  │ **Virtual Keyboard Does Not Obscure Active Input**       │ Mandated  │ PASS: ScrollIntoView OK.   │
│ 8  │ **Appropriate Inputmode (numeric/decimal/text)**         │ Mandated  │ PASS: Number pad on Ht/Wt. │
│ 9  │ **Sticky Bottom Action Bar Thumb Reachable**             │ Mandated  │ PASS: In Green Thumb Zone. │
│ 10 │ **Hardware Back Button Intercepts with Warning**         │ Mandated  │ PASS: No lost draft state. │
│ 11 │ **Autosave Debounce Saves to IndexedDB within 400ms**    │ Mandated  │ PASS: Verified in IndexedDB│
│ 12 │ **Offline Mode Permits 100% Form Completion**            │ Mandated  │ PASS: Works in Airplane.   │
│ 13 │ **Service Worker Update Does Not Disrupt Active Typing** │ Mandated  │ PASS: Silent update queue. │
│ 14 │ **No Alarmist Stigmatising Language on Screen**          │ Mandated  │ PASS: Calm clinical copy.  │
│ 15 │ **Aadhaar Numbers Displayed Masked (XXXX-XXXX-1234)**    │ Mandated  │ PASS: Data minimisation.   │
└────┴──────────────────────────────────────────────────────────┴───────────┴────────────────────────────┘
```

---

## 15. Ordered Implementation Plan (Mobile Foundations First)

Before building individual intake wizard form sections, these core mobile foundational components must be constructed and verified:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MOBILE FOUNDATIONS IMPLEMENTATION ORDER                              │
├───────┬──────────────────────┬─────────────────────────────────────────────────┬───────────────────────┤
│ Step  │ Foundation Ticket    │ Component / Deliverable                         │ Verification Gate     │
├───────┼──────────────────────┼─────────────────────────────────────────────────┼───────────────────────┤
│ **1** │ `TCK-M01` (Pre-Req)  │ `MobileAppShell` & `CompactGovernmentMasthead`   │ Viewport lock 320px;  │
│       │                      │ with safe-area insets and branding.             │ zero horizontal scroll│
├───────┼──────────────────────┼─────────────────────────────────────────────────┼───────────────────────┤
│ **2** │ `TCK-M02` (Pre-Req)  │ `KeyboardAwareScrollWrapper` & `BottomActionBar`│ Virtual keyboard test;│
│       │                      │ thumb-zone action container with safe-inset.    │ no input obstruction. │
├───────┼──────────────────────┼─────────────────────────────────────────────────┼───────────────────────┤
│ **3** │ `TCK-M03` (Pre-Req)  │ Accessible Mobile Form Control Atoms:           │ Touch target audit;   │
│       │                      │ `MobileInput`, `MobileRadioCard`, `SelectDrawer`│ inputmode verification│
├───────┼──────────────────────┼─────────────────────────────────────────────────┼───────────────────────┤
│ **4** │ `TCK-M04` (Pre-Req)  │ `MobileContextBar` & `SyncStatusPill`           │ Real-time IndexedDB   │
│       │                      │ with 400ms debounced autosave state listener.   │ status transitions.   │
├───────┼──────────────────────┼─────────────────────────────────────────────────┼───────────────────────┤
│ **5** │ `TCK-M05` (Feature)  │ Integrate Mobile Controls into Steps 1 to 3     │ 320px field assessment│
│       │                      │ (Demographics, Household, Clinical Nutrition).  │ flow with MAM/SAM card│
├───────┼──────────────────────┼─────────────────────────────────────────────────┼───────────────────────┤
│ **6** │ `TCK-M06` (Feature)  │ Integrate Mobile Controls into Steps 4 to 6     │ Camera compression &  │
│       │                      │ (Education, Bank Details, Review & Declaration) │ local finalisation.   │
└───────┴──────────────────────┴─────────────────────────────────────────────────┴───────────────────────┘
```

---

## 16. Mobile-First Approval Checklist & Blocking Decisions

### Mobile-First Approval Checklist
- [x] Uncompromising 320px CSS width baseline established with zero horizontal scroll.
- [x] Primary field workflow explicitly segregated from supervisory workstation analytics.
- [x] All interactive controls adhere to 44×44px minimum (48px standard) touch bounding boxes.
- [x] Virtual keyboard obstruction solved via `visualViewport` observer and scroll margins.
- [x] Text input font size locked at 16px minimum to prevent mobile browser auto-zooming.
- [x] High daylight contrast verified for outdoor field clinics.
- [x] Plain-language, non-jargon offline and sync states defined.
- [x] Tabular line-lists converted to structured vertical cards for mobile viewports.
- [x] Service Worker updates guaranteed non-disruptive during active form entry.

### Blocking Decisions Before Implementation
1. **Target Google Sheet Discovery Gate (`TCK-004`)**: Verification script `scripts/verify-target-sheet.ts` must ratify the primary sheet tab name (`Child_Nutrition` vs `Master`) and header row index on target sheet `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA` before any live write tests are executed.
2. **Review & Ratification of this MFED Specification**: No application form UI components will be coded until this mobile experience document is formally reviewed and ratified.
