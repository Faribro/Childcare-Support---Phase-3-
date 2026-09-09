# Mobile Design System & Compatibility Contract

**Document Version:** 3.0.0  
**Status:** Canonical Release Standard  
**Target Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Primary Users:** ASHAs, Anganwadi frontline health workers, field coordinators (low- to mid-range Android devices under high daylight & intermittent connectivity).  
**Secondary Users:** Clinical supervisors & program managers (tablets & desktop laptops).  

---

## 1. Responsive Viewport & Breakpoint Architecture

The application is built strictly **mobile-first**, beginning at 320 CSS pixels and progressively enhancing across the following standardized breakpoints:

| Breakpoint | CSS Width | Target Device Class | Primary Layout Behavior |
|---|---|---|---|
| **xs (compact)** | `320px – 359px` | Ultra-compact devices (iPhone SE 1st gen, budget Android) | Single column, compact headers, 12px gutters, zero horizontal overflow. |
| **sm (mobile standard)** | `360px – 479px` | Standard smartphones (Pixel, Galaxy, Redmi, iPhone 12/13/14/15) | Single column, standard card gutters (16px), full-width action buttons. |
| **md (tablet portrait)** | `480px – 767px` | Large phones, phablets, small foldables | Single to dual-column collapse, expanded cards. |
| **lg (tablet landscape)** | `768px – 1023px` | iPad Mini, Android tablets, surface devices | Multi-column forms (2–3 cols), linelist data table, top desktop navigation. |
| **xl (desktop)** | `1024px+` | Laptops, supervisor workstations | Full linelist grid, sidebar/drawer views, administrative GIS analytics. |

### Layout Tokens
- **Horizontal Mobile Gutters:** `px-3` (12px) on ≤359px; `px-4` (16px) on 360px–767px; `px-6` to `px-8` on ≥768px.
- **Content Max-Widths:** Forms capped at `max-w-5xl` (64rem); linelist/supervisor capped at `max-w-7xl` (80rem).
- **Zero Horizontal Overflow Rule:** Every root container and card must satisfy `scrollWidth <= clientWidth`. Global `overflow-x: hidden` on body is prohibited as a mask for broken internal layouts.
- **Break-Words Rule:** Identifiers, Aadhaar references, and multilingual strings use `.break-words-anywhere` (`overflow-wrap: anywhere; word-break: break-word`).
- **Dynamic Viewport Unit:** Uses `min-h-[100dvh]` to eliminate mobile browser URL bar jump / virtual keyboard calculation bugs.

---

## 2. Safe Area Insets & App Shell Contract

### Edge-to-Edge Navigation
- The root document `<body>` has zero artificial safe-area top padding, allowing headers and navigation surfaces to sit flush against the hardware bezel or notch.
- **Top Headers:** Use `pt-safe` / `env(safe-area-inset-top, 0px)` to provide intrinsic clearance for front-facing camera cutouts and dynamic islands.
- **Sticky Bottom Action Bars:** Fixed floating bottom bars (e.g. Save Draft & Submit Survey in assessment wizard) use `pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]` so hardware home indicators and Android gesture navigation bars never cover interactive touch buttons.
- **Scroll Margin & Clearance:** Main scrollable containers hosting bottom action bars enforce `pb-32 sm:pb-24` clearance to ensure the lowest form input can be scrolled completely into view above the fixed bar.

---

## 3. Typography & iOS Auto-Zoom Prevention

### iOS Safari 16px Mandate
Any `<input>`, `<select>`, or `<textarea>` element with a computed `font-size` below 16px triggers automatic screen zoom on iOS Safari, causing severe field disorientation and requiring manual pinching to reset.

- **Global Enforcement:**
  ```css
  @media screen and (max-width: 768px) {
    input[type="text"],
    input[type="number"],
    input[type="date"],
    input[type="email"],
    input[type="tel"],
    input[type="search"],
    input[type="password"],
    select,
    textarea {
      font-size: 16px !important;
      line-height: 1.5 !important;
    }
  }
  ```
- **Readability Hierarchy:**
  - Screen Titles: `text-lg sm:text-xl font-bold` (18px/20px)
  - Section Headings: `text-sm sm:text-base font-bold` (14px/16px)
  - Field Labels: `text-xs sm:text-sm font-bold` (12px/14px) with high contrast (`text-slate-900` / `text-slate-800`)
  - Helper & Guidance Text: `text-[11px] text-slate-500`
  - Error Warnings: `text-xs font-semibold text-rose-700`

---

## 4. Touch Target Standards (WCAG 2.2 AA)

- **Standard Minimum Target:** All interactive controls (buttons, links, icon toggles, radio/checkbox labels, clear buttons) must measure at least **44 × 44 CSS pixels** (`.touch-target-44`).
- **Primary Field Action Target:** High-frequency field interactions (Save Draft, Submit Survey, Capture Photo, Clear Signature) must measure at least **48 × 48 CSS pixels** (`.touch-target-48`).
- **Touch Spacing:** Interactive controls maintain a minimum of 8px physical spacing to eliminate accidental mis-taps under daylight or one-handed thumb use.

---

## 5. Form-Wizard & Mobile Input Patterns

1. **Single-Column Collapse:** Below 768px, all field grids collapse strictly to `grid-cols-1`. Multi-column inputs (`grid-cols-2` or `grid-cols-3`) are reserved solely for viewports `sm:` (≥640px) or `md:` (≥768px) where sufficient width prevents horizontal cramping.
2. **Accessible Labels:** Every form control is programmatically associated with its label via explicit `htmlFor` / `id` matching.
3. **Semantic Mobile Keyboards:**
   - Numeric clinical entries (Weight, Height, Age, Meals): `inputMode="decimal"` or `inputMode="numeric"`
   - Phone numbers: `type="tel"`, `inputMode="tel"`
   - Emails: `type="email"`, `autoCapitalize="none"`
   - Dates: Touch-friendly native date controls or accessible picker
4. **Caregiver Digital Signature:**
   - Canvas enforces `touch-action: none` to prevent accidental page scrolling during signing.
   - Clear button features a non-destructive confirmation dialog (`showClearConfirm`).
   - Clear and Save action buttons satisfy the 48px minimum target requirement.
   - Includes accessible explanatory guidance for alternate consent methods (verbal recording / thumb impression) if caregiver is unable to provide digital touch signature.
5. **Photo / Document Capture:**
   - Uses native `capture="environment"` to invoke camera capture directly on mobile devices.
   - Clean preview container with instant removal button and clear status indicator ("Document Captured").
   - Semantic `<button>` triggers with 44px minimum target sizes.

---

## 6. Responsive Tables vs Mobile Cards

- **Desktop Tables:** Linelist tables (`/supervisor/assessments`) and multi-column grids are conditionally rendered only at `md:` (≥768px).
- **Mobile Card Transformation:** On screens `<768px`, data records automatically transform into high-density touch cards featuring:
  - Prominent child name and ART reference ID chip.
  - Nutritional & clinical status badges (BMI, Viral Load, Haemoglobin).
  - Clear icon + text status indicators (never colour alone).
  - Touch-friendly 44px action buttons ("View", "Edit", "History").

---

## 7. Performance & Reduced-Motion Protocol

- **Mobile Animation Throttling:** Multi-layered CSS breathing box-shadow animations (`neonPulse`) are disabled on `<768px` viewports to protect battery life and prevent frame drops on entry-level Android chipsets.
- **`prefers-reduced-motion` Enforcement:**
  - Custom animations (spider thread drop, pulse waves, liquid wave heart, confetti) are disabled immediately when reduced motion is preferred.
  - The miniature interactive garden playground automatically starts in a paused state and provides an accessible toggle (`Play` / `Pause`) with a 44px touch target.
  - Decorative animations are strictly forbidden inside active data entry workflows.
