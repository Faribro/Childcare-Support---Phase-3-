# Architectural & Operational Findings: Landing Page & Core PWA

## Current Landing Page Architecture (`src/app/page.tsx`)
- **Size & Role**: Currently an 1162-line client component (`'use client'`).
- **Core Integrations to Retain**:
  - `usePwaInstall` hook integration (`canInstall`, `isInstalled`, `isStandalone`, `installApp`, `showIosInstallGuide`).
  - Standalone redirect: When `isStandalone === true`, automatically calls `router.replace('/app')` so users running installed PWA directly enter the field workspace.
  - Install Banner / Button: Triggers browser PWA install prompt.
  - Navigation Link to `/app`: Directly navigates to the authenticated/local field workspace.
- **Areas to Overhaul**:
  - Current page layout uses generic SaaS cards and repetitive tracks.
  - Needs transformation into the editorial "Field Notebook of Possibility" aesthetic: warm ivory paper, notebook margins, archival tabs, stamped badges, handcrafted SVGs, and dignified storytelling.

## Design Constraints & Non-Negotiables
- **No Copyrighted Assets**: Do NOT save or commit external screenshots, SVGs, or typography from reference sites.
- **Privacy & Dignity**: No real child names, beneficiary IDs, ART numbers, or medical terms on the public landing page. Use dignified placeholder illustrations.
- **Progressive Enhancement**: Critical content, narrative, and "Open Field App" CTA must render in plain semantic HTML/CSS even if JavaScript fails.
- **Reduced Motion**: All animations must be gated behind `@media (prefers-reduced-motion: no-preference)`.
- **Zero Core App Regressions**: Do not touch `/app`, service workers, IndexedDB, validation schemas, or sync adapters.

## Reference Target Insights
- **Mary Colter**: Archival case files, tabbed indexing, intentional reading rhythm.
- **Mal Prince**: Typographic hierarchy, clean pacing, respectful human presence.
- **Mr. Panda**: Interactive discovery micro-moments without confusing navigational gimmicks.
- **Aardvark Book Club**: High information density rendered warm, legible, and scannable with clear CTA anchors.
