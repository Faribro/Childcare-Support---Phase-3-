# Childcare Support — Phase 3: Children Nutrition & Education Support Form PWA

**India HIV/AIDS Alliance**  
**Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Deployment Platform:** Render Web Service (Node.js 20 LTS Runtime, Next.js 14 App Router)  
**Target Google Sheet ID:** `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA`  
**Target Apps Script Project ID:** `1yXEgElXFb0Fb_CzTlQ8TDvRUuEYmq5dady7ialsqMnkAU1XX5SPJW8P3`

---

## 🌟 Overview & Operational Context

Childcare Support Phase 3 is an offline-first Progressive Web Application (PWA) tailored for frontline healthcare workers, outreach coordinators, and supervisors. It digitises the 6-step intake, clinical anthropometric assessment (MAM/SAM classification), educational support verification, and direct-benefit-transfer (DBT) grant disbursement for children affected by HIV/AIDS.

### Core Non-Negotiables
1. **Zero Data Loss**: 400ms debounced autosave to local Dexie.js IndexedDB. Interrupted phone calls or dead batteries never discard work.
2. **Mobile-First at 320px Baseline**: Fully interactive and readable in harsh daylight on 320px–480px Android devices. Zero horizontal scrolling.
3. **Data Minimisation & Dignity**: Aadhaar numbers masked (`XXXX-XXXX-1234`), zero plaintext HIV stigma codes in client URLs or notifications.
4. **Idempotent Central Sync**: Every submission carries an immutable RFC 4122 UUIDv4. Retrying over flaky network connections never creates duplicate sheet rows.

---

## 🏗️ Architecture & Technology Stack

- **Framework**: Next.js 14 (App Router, Server Actions, API Routes)
- **Language**: TypeScript 5.5+ (Strict mode, zero implicit `any`)
- **Offline Storage**: Dexie.js v4 (IndexedDB)
- **PWA Service Worker**: Serwist (`@serwist/next`) with Cache-First app shell
- **Validation**: React Hook Form 7 + Zod 3
- **Styling**: Tailwind CSS v3 (White-Premium Institutional Palette, 48px touch targets)
- **Visualisation**: D3.js v7 (Supervisor malnutrition cohort distribution charts)
- **Testing**: Vitest 2, Playwright E2E, Testing Library

---

## 🚀 Getting Started Locally

```bash
# 1. Install dependencies
npm install

# 2. Run TypeScript static typecheck
npm run typecheck

# 3. Run Vitest unit & API tests
npm test

# 4. Start local development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## 📡 Deployment to Render

The application is configured to deploy as a standard Node.js Web Service on Render via `render.yaml`.
- Health Check Probe: `GET /api/health`
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
