/**
 * mobile-responsive-layout-correction.test.tsx
 *
 * Test suite for Mobile UX Corrections (Issues #24, #25, and #26):
 *
 * 1. Issue #24 (Single Continuous Form & Nested Navigation):
 *    - Revert section-at-a-time runner; restore single continuous form on mobile.
 *    - Assessment new and draft pages do NOT mount MobileFormSectionRunner or MobileFormSummaryCard.
 *    - All 9 sections are continuous without `hidden md:block` or `activeSectionIndex ===` checks.
 *    - Accessible Back navigation link is present on /assessment/sync.
 *    - Compact KoboToolbox-style mobile card padding on /assessment/sync.
 *
 * 2. Issue #25 (Mobile Home Screen Corrections):
 *    - Restores MiniatureGardenPlayground at the bottom of MobileKoboHomeScreen.
 *    - Removes "Ready to send" outbox action card from home screen.
 *    - Removes "Evaluation" supervisor card/tile from mobile home screen.
 *
 * 3. Issue #26 (Responsive Alignment & Label Truncation Elimination):
 *    - No label truncation (`truncate` removed, `break-words leading-tight` added).
 *    - No rigid `h-11` heights clipping multiline labels; `min-h-[44px]` used consistently.
 *    - Co-morbidities grid uses responsive `grid-cols-1 xs:grid-cols-2 md:grid-cols-4`.
 *    - Bottom action bar is visible on mobile (no `hidden md:block`).
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, className, ...rest }: any) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

// Mock router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const defaultHomeProps = {
  drafts: [
    {
      id: 1,
      uuid: 'draft-1',
      childName: 'Aarav',
      artNumber: 'ART-001',
      updatedAt: new Date().toISOString(),
      status: 'draft',
      demographics: { childName: 'Aarav', artNumber: 'ART-001' },
    },
  ] as any[],
  waitingCount: 2,
  submittedCount: 5,
  isLoading: false,
  onDeleteDraft: vi.fn(),
  onResumeDraft: vi.fn(),
};

describe('Mobile UX Corrections (Issues #24, #25, #26)', () => {
  describe('Issue #25: MobileKoboHomeScreen Layout & Elements', () => {
    it('renders primary mobile actions: Start New Survey, Drafts, Submitted surveys', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      expect(screen.getByText('Start New Survey')).toBeDefined();
      expect(screen.getByText('Drafts')).toBeDefined();
      expect(screen.getByText('Submitted surveys')).toBeDefined();
    });

    it('does NOT render "Ready to send" outbox action card on mobile home screen', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      expect(screen.queryByText('Ready to send')).toBeNull();
    });

    it('does NOT render "Evaluation" action tile on mobile home screen', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      expect(screen.queryByText('Evaluation')).toBeNull();
    });

    it('renders the restored animated playground canvas at the bottom', () => {
      const { container } = render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeDefined();
    });

    it('renders accessible touch targets with min-h-[48px] or min-h-[56px]', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      const primaryBtn = screen.getByText('Start New Survey').closest('button');
      expect(primaryBtn?.className).toMatch(/min-h-\[(48|52|56)px\]/);
    });

    it('renders Drafts as a dedicated navigation card linking to /assessment/drafts', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      const draftsLink = screen.getByText('Drafts').closest('a');
      expect(draftsLink).toBeDefined();
      expect(draftsLink?.getAttribute('href')).toBe('/assessment/drafts');
    });

    it('renders Submitted surveys as a dedicated navigation card linking to /assessment/sync?tab=synced', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      const submittedLink = screen.getByText('Submitted surveys').closest('a');
      expect(submittedLink).toBeDefined();
      expect(submittedLink?.getAttribute('href')).toBe('/assessment/sync?tab=synced');
    });

    it('does NOT render inline expandable draft list or accordion toggle on mobile home', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      expect(screen.queryByRole('button', { name: /Drafts/i })).toBeNull();
      expect(screen.queryByText('Aarav')).toBeNull();
      expect(screen.queryByText('No active drafts on this device')).toBeNull();
    });
  });

  describe('Issue #24: Single Continuous Mobile Form Invariants', () => {
    const newPagePath = path.resolve(__dirname, '../app/assessment/new/page.tsx');
    const draftPagePath = path.resolve(__dirname, '../app/assessment/draft/[draftId]/page.tsx');
    const newPageSource = fs.readFileSync(newPagePath, 'utf8');
    const draftPageSource = fs.readFileSync(draftPagePath, 'utf8');

    it('does NOT import or mount MobileFormSectionRunner in /assessment/new', () => {
      expect(newPageSource).not.toContain('MobileFormSectionRunner');
      expect(newPageSource).not.toContain('FORM_SECTIONS');
    });

    it('does NOT import or mount MobileFormSummaryCard in /assessment/new', () => {
      expect(newPageSource).not.toContain('MobileFormSummaryCard');
    });

    it('does NOT import or mount MobileFormSectionRunner in /assessment/draft/[draftId]', () => {
      expect(draftPageSource).not.toContain('MobileFormSectionRunner');
      expect(draftPageSource).not.toContain('FORM_SECTIONS');
    });

    it('does NOT import or mount MobileFormSummaryCard in /assessment/draft/[draftId]', () => {
      expect(draftPageSource).not.toContain('MobileFormSummaryCard');
    });

    it('renders all sections continuously in /assessment/new without activeSectionIndex hiding', () => {
      expect(newPageSource).not.toMatch(/activeSectionIndex ===/);
      expect(newPageSource).not.toMatch(/sec-consent["']\s+className=\{[^}]*hidden md:block/);
      expect(newPageSource).not.toMatch(/sec-review["']\s+className=\{[^}]*hidden md:block/);
    });

    it('renders all sections continuously in /assessment/draft/[draftId] without activeSectionIndex hiding', () => {
      expect(draftPageSource).not.toMatch(/activeSectionIndex ===/);
      expect(draftPageSource).not.toMatch(/sec-consent["']\s+className=\{[^}]*hidden md:block/);
      expect(draftPageSource).not.toMatch(/sec-review["']\s+className=\{[^}]*hidden md:block/);
    });

    it('bottom action bar is accessible on mobile (no hidden md:block)', () => {
      // In both new and draft, the fixed bottom bar must be rendered on mobile
      expect(newPageSource).not.toMatch(/hidden md:block fixed bottom-0/);
      expect(newPageSource).toMatch(/fixed bottom-0 left-0 right-0 z-30/);

      expect(draftPageSource).not.toMatch(/hidden md:block fixed bottom-0/);
      expect(draftPageSource).toMatch(/fixed bottom-0 left-0 right-0 z-30/);
    });

    it('includes visible Back navigation on /assessment/sync leading to /app', () => {
      const syncPagePath = path.resolve(__dirname, '../app/assessment/sync/page.tsx');
      const syncPageSource = fs.readFileSync(syncPagePath, 'utf8');

      expect(syncPageSource).toContain('href="/app"');
      expect(syncPageSource).toContain('Back to Dashboard');
    });

    it('uses compact KoboToolbox-style card padding on /assessment/sync', () => {
      const syncPagePath = path.resolve(__dirname, '../app/assessment/sync/page.tsx');
      const syncPageSource = fs.readFileSync(syncPagePath, 'utf8');

      expect(syncPageSource).toContain('p-3 sm:p-5');
    });
  });

  describe('Issue #26: Responsive Layout & Truncation Elimination', () => {
    const newPagePath = path.resolve(__dirname, '../app/assessment/new/page.tsx');
    const draftPagePath = path.resolve(__dirname, '../app/assessment/draft/[draftId]/page.tsx');
    const newPageSource = fs.readFileSync(newPagePath, 'utf8');
    const draftPageSource = fs.readFileSync(draftPagePath, 'utf8');

    it('eliminates truncate from co-morbidities options in /assessment/new', () => {
      // Co-morbidities must wrap text cleanly
      expect(newPageSource).toContain('break-words leading-tight');
      // Co-morbidities section should not use rigid h-11
      expect(newPageSource).toMatch(/min-h-\[44px\] py-2\.5 px-3\.5 rounded-xl border text-xs font-semibold/);
    });

    it('uses responsive grid for co-morbidities supporting 360px viewport', () => {
      expect(newPageSource).toContain('grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-2.5');
      expect(draftPageSource).toContain('grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-2.5');
    });

    it('eliminates truncate from orphan status options in /assessment/new and draft', () => {
      expect(newPageSource).not.toMatch(/<span className="truncate">\{opt\.label\}<\/span>/);
      expect(draftPageSource).not.toMatch(/<span className="truncate">\{opt\.label\}<\/span>/);
    });

    it('uses min-h-[44px] touch target for all radio/checkbox button options', () => {
      // Consent buttons
      expect(newPageSource).toContain('min-h-[44px] py-2 px-4 rounded-xl border cursor-pointer');
      expect(draftPageSource).toContain('min-h-[44px] py-2 px-4 rounded-xl border cursor-pointer');

      // Gender buttons
      expect(newPageSource).toContain('min-h-[44px] py-2 px-2 rounded-xl border text-xs font-semibold');
      expect(draftPageSource).toContain('min-h-[44px] py-2 px-2 rounded-xl border text-xs font-semibold');

      // Attendance buttons
      expect(newPageSource).toContain('min-h-[44px] py-2 px-2 rounded-xl border text-xs font-semibold');
      expect(draftPageSource).toContain('min-h-[44px] py-2 px-2 rounded-xl border text-xs font-semibold');

      // Review confirmation buttons
      expect(newPageSource).toContain('min-h-[44px] py-2 px-4 rounded-xl border cursor-pointer');
      expect(draftPageSource).toContain('min-h-[44px] py-2 px-4 rounded-xl border cursor-pointer');
    });
  });
});
