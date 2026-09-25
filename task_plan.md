# Task Plan: Editorial Notebook Landing Page for Alliance India PWA

## Project Information
- **Repository**: `Faribro/Childcare-Support---Phase-3-`
- **Target Branch**: `feat/landing-page-editorial-notebook-experience`
- **Base Commit**: `337bcecd0d7e3ff5305ce3fc47c8e177b8e730d2` (PR #46 squash-merged)
- **Status**: Implementation Complete & Verified

## Goal
Build an unforgettable, human, handcrafted, and editorial "Field Notebook of Possibility" public landing page for India HIV/AIDS Alliance Child Nutrition & Support PWA. The landing page establishes immediate trust, explains the 6-section assessment workflow with dignity and clarity, and smoothly channels staff into the core `/app` workspace without slowing down or destabilizing the offline PWA.

---

## Phase Breakdown

### Phase 0: Repository Safety & Baseline Verification
- [x] Check out latest `main` (`337bcecd0d7e3ff5305ce3fc47c8e177b8e730d2`)
- [x] Run `npm ci` (0 errors)
- [x] Run `npm run typecheck` (0 errors)
- [x] Run `npm run lint` (0 errors)
- [x] Run `npm test` (39/39 test files, 542/542 tests passing)
- [x] Run `npm run build` (13/13 static pages, 0 errors)
- [x] Create branch `feat/landing-page-editorial-notebook-experience`

### Phase 1: Deep Reference Audit
- [x] Browser study of 4 primary websites (1440px and 390px viewports):
  - [x] `https://www.mosbyfiles.com/cases/mary-colter` (archival case files, layering)
  - [x] `https://malprince.tilda.ws/en` (editorial pacing, typography)
  - [x] `https://www.mr-pandas-psychologically-safe-portfolio.com/` (playful micro-interactions)
  - [x] `https://www.aardvarkbookclub.com/` (content density, scannability, CTA rhythm)
- [x] Study 6 GitHub design and engineering repositories:
  - [x] `VoltAgent/awesome-design-md`
  - [x] `nextlevelbuilder/ui-ux-pro-max-skill`
  - [x] `nateherkai/scroll-craft`
  - [x] `agiwhitelist/auteur`
  - [x] `PaulleDemon/awesome-landing-pages`
  - [x] `PageAI-Pro/page-ui`
- [x] Document all findings and transferable principles in `docs/landing-page-reference-audit.md`

### Phase 2: Creative Synthesis & Direction Selection
- [x] Formulate 3 distinct original concepts in `docs/landing-page-concepts.md`
- [x] Select primary direction: "The Field Notebook of Possibility"
- [x] Define color tokens, typography hierarchy, paper/notebook materiality, and component inventory

### Phase 3: Content Architecture & Semantic Wireframe
- [x] Audit existing `src/app/page.tsx` dependencies (PWA install hook, standalone check)
- [x] Build 9-section semantic HTML structure:
  1. [x] Hero: "Every child's story deserves a clearer picture." (Open Field App CTA)
  2. [x] Why it matters: Whole-child snapshot (Nutrition, Education, Household)
  3. [x] How it works: 3-step field rhythm (Record, Save Offline, Sync)
  4. [x] Built for real field conditions: Low connectivity, battery conservation, IndexedDB
  5. [x] Designed with care: Guiding principles, data dignity, privacy
  6. [x] Experience preview: Sanitized field UI mockups (zero real beneficiary data)
  7. [x] Field FAQ: Accessible accordion for frontline staff questions
  8. [x] Final Call to Action: Prominent "Open Field App" repeat CTA
  9. [x] Institutional Footer: Alliance India identity, PWA version
- [x] Ensure full progressive enhancement: 100% complete without JS

### Phase 4: Visual System, Materiality & Motion Enhancement
- [x] Implement warm ivory paper canvas with subtle CSS grain/grid-line accents
- [x] Add original SVG support-path illustrations and handcrafted pure CSS/SVG device mockups
- [x] Implement CSS transform/opacity motion with strict `@media (prefers-reduced-motion)` override

### Phase 5: Verification, Automated Testing & Quality Gates
- [x] Add automated test suite (`src/test/landing-page-editorial.test.tsx`):
  - [x] CTA routes safely to `/app`
  - [x] Secondary CTA scrolls to `#how-it-works`
  - [x] Landmark hierarchy (`header`, `main`, `footer`, `nav`) in semantic order
  - [x] Mobile 390px touch targets ($>=44\text{px}$) and responsiveness
  - [x] Keyboard navigation and focus rings (`:focus-visible`)
  - [x] Accordion ARIA `aria-expanded` and keyboard toggle
  - [x] `prefers-reduced-motion` compliance
  - [x] Zero interference with `/app` bundle or offline service worker
- [x] Run full quality gates: `npm run typecheck`, `npm run lint`, `npm test` (554/554 tests passing), `npm run build` (13/13 static pages generated)
- [x] Prepare and open PR `feat(landing): create editorial notebook experience for Alliance India field app` (do NOT merge)

---

## Non-Regression Policy
- Zero alterations to `/app`, `/assessment/*`, or `/supervisor/*` routes.
- Zero alterations to `public/sw.js` (service worker), Dexie database schema, or Google Sheets contracts.
- Preserved PWA standalone auto-launch (`isStandalone ? router.replace('/app') : null`).
