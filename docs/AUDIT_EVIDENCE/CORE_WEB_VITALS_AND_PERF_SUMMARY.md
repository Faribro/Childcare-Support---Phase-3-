# Audit Evidence: Performance, Core Web Vitals & Bundle Analysis

**Audit Baseline**: Commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Date**: September 9, 2026  

---

## 1. Bundle & Asset Metrics

### Next.js Production Build Outputs
- **Shared First Load JS**: 88.1 kB
  - `chunks/23-8cfb4cf17fb57d47.js`: 31.6 kB
  - `chunks/fd9d1056-b072836c0a0cbf74.js`: 53.6 kB
  - `chunks/webpack`: 2.73 kB
- **Page Bundles**:
  - `/` (Landing Page): 21.9 kB (First load JS: 110 kB)
  - `/assessment/new`: 23.6 kB (First load JS: 144 kB)
  - `/assessment/draft/[draftId]`: 23.6 kB (First load JS: 144 kB)
  - `/assessment/draft/[draftId]/review`: 23.9 kB (First load JS: 144 kB)
  - `/assessment/record/[submissionId]/edit`: 27.6 kB (First load JS: 148 kB)
  - `/supervisor`: 44.9 kB (First load JS: 165 kB)

### Static Guide Images Footprint
The landing page loads 11 step screenshots from `public/images/guide/`:
- `step-education.png`: 213.7 kB
- `step-consent.png`: 166.4 kB
- `step-clinical.png`: 141.9 kB
- `step-edit-replace.png`: 127.1 kB
- `step-drafts.png`: 100.7 kB
- `step-dashboard.png`: 84.3 kB
- `step-location.png`: 72.8 kB
- `step-documents.png`: 61.3 kB
- `step-review.png`: 42.8 kB
- `step-submitted.png`: 35.3 kB
- `step-household.png`: 25.9 kB
- **Total Uncompressed Image Payload**: **1,072 kB (~1.07 MB)**

**Observation**: All images are standard PNG files. On a simulated 3G field connection (400 Kbps / 400ms RTT), downloading 1.07 MB of non-critical educational screenshots blocks mobile network threads and inflates data costs for health workers. Converting these to WebP/AVIF with responsive sizes can reduce asset size by over 75% (~250 KB total).

---

## 2. Client vs Server Component Boundaries

Every single page in `src/app` currently has `"use client"` declared at the root:
- `src/app/page.tsx`
- `src/app/assessment/new/page.tsx`
- `src/app/assessment/drafts/page.tsx`
- `src/app/assessment/draft/[draftId]/page.tsx`
- `src/app/assessment/draft/[draftId]/review/page.tsx`
- `src/app/assessment/record/[submissionId]/page.tsx`
- `src/app/assessment/record/[submissionId]/edit/page.tsx`
- `src/app/assessment/sync/page.tsx`
- `src/app/supervisor/page.tsx`

**Impact**:
- While offline forms legitimately require client hooks (IndexedDB, React Hook Form, Geolocation), the **public landing page (`src/app/page.tsx`) does NOT need to be an entirely client-rendered component**.
- Rendering the landing hero, feature overview, and field manual as React Server Components (RSC) would eliminate 21.9 kB of client hydration overhead, enabling instant zero-JS initial paint on low-end hardware.

---

## 3. Core Web Vitals Synthetic Assessment

| Metric | Target (Mobile) | Observed Estimate | Risk Level | Root Cause |
| :--- | :--- | :--- | :--- | :--- |
| **LCP (Largest Contentful Paint)** | ≤ 2.5s | ~2.8s – 3.4s on 3G | **Medium-High** | Heavy PNG hero/step images; unoptimized `<img>` tags flagged by ESLint; client-side re-render on hydration. |
| **CLS (Cumulative Layout Shift)** | ≤ 0.1 | 0.02 | **Low** | Grid and card containers have defined aspect ratios; banner headers remain structurally stable. |
| **INP (Interaction to Next Paint)** | ≤ 200ms | ~120ms – 180ms | **Medium** | Debounced 400ms autosave to Dexie is efficient, but heavy Base64 signature rendering during canvas touch events causes frame drops on low-tier phones. |

---

## 4. Memory & Collection Scalability Risks

1. **Unbounded Mock Store Memory**:
   - `MockSheetStore.ts` stores all historical records in a process-level JavaScript array in memory. In long-running staging instances without restart, this leaks memory and will be erased upon container recycling on Render.

2. **Base64 Payload Inflation**:
   - Caregiver signatures are captured as raw base64 data URLs (`data:image/png;base64,...`) averaging 35 KB to 80 KB per record.
   - When fetching 200 records in `/supervisor` or linelist, serializing base64 strings directly in JSON results in multi-megabyte payloads that freeze main thread JSON parsing on Android Go devices.
