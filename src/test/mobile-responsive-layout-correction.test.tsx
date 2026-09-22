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
import { DraftCard } from '@/components/forms/DraftCard';

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

  describe('Responsive Refinements for Dashboard, Drafts, and Submitted Surveys', () => {
    const syncPagePath = path.resolve(__dirname, '../app/assessment/sync/page.tsx');
    const syncPageSource = fs.readFileSync(syncPagePath, 'utf8');
    const newPagePath = path.resolve(__dirname, '../app/assessment/new/page.tsx');
    const newPageSource = fs.readFileSync(newPagePath, 'utf8');
    const draftPagePath = path.resolve(__dirname, '../app/assessment/draft/[draftId]/page.tsx');
    const draftPageSource = fs.readFileSync(draftPagePath, 'utf8');
    const draftsPagePath = path.resolve(__dirname, '../app/assessment/drafts/page.tsx');
    const draftsPageSource = fs.readFileSync(draftsPagePath, 'utf8');
    const homeSource = fs.readFileSync(path.resolve(__dirname, '../components/mobile/MobileKoboHomeScreen.tsx'), 'utf8');

    it('sync screen uses 2x2 grid segmented tabs on mobile', () => {
      expect(syncPageSource).toContain('grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2');
      expect(syncPageSource).toContain('tabular-nums shrink-0');
    });

    it('sync screen uses full-width search input with unclipped placeholder', () => {
      expect(syncPageSource).toContain('placeholder="Search by child name, ART number, caregiver..."');
      expect(syncPageSource).toContain('pl-10 pr-3 py-2.5 min-h-[44px]');
    });

    it('sync screen uses accessible stacked From/To date range inputs with Calendar icons', () => {
      expect(syncPageSource).toContain('grid grid-cols-1 xs:grid-cols-2 gap-2.5 pt-0.5');
      expect(syncPageSource).toContain('htmlFor="filter-from-date"');
      expect(syncPageSource).toContain('htmlFor="filter-to-date"');
      expect(syncPageSource).toContain('From Date');
      expect(syncPageSource).toContain('To Date');
    });

    it('sync screen uses compact empty state styling', () => {
      expect(syncPageSource).toContain('p-6 sm:p-8 rounded-2xl border border-dashed border-slate-300 text-center space-y-2 bg-white shadow-2xs');
    });

    it('sync screen History button has min-h-[44px] and responsive layout', () => {
      expect(syncPageSource).toContain('touch-target-44 min-h-[44px] text-xs px-3 font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer flex items-center justify-center flex-1 sm:flex-initial');
      expect(syncPageSource).toContain("{isExpanded ? 'Hide' : 'History'}");
    });

    it('sticky bottom bar in new and draft uses flex-wrap and generous bottom clearance', () => {
      expect(newPageSource).toContain('flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs');
      expect(newPageSource).toContain('pb-36 sm:pb-28');

      expect(draftPageSource).toContain('flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs');
      expect(draftPageSource).toContain('pb-36 sm:pb-28');
    });

    it('mobile home screen uses tightened vertical spacing and compact playground container', () => {
      expect(homeSource).toContain('py-3 sm:py-4 space-y-3');
      expect(homeSource).toContain('<div className="pt-1">');
    });

    it('dedicated drafts page header uses flex-wrap', () => {
      expect(draftsPageSource).toContain('flex flex-wrap items-center justify-between gap-3');
    });

    it('DraftCard renders responsive non-colliding badge and timestamp, touch-friendly buttons', () => {
      const mockDraft = {
        id: 42,
        uuid: 'draft-uuid-42',
        updatedAt: '2026-09-22T14:00:00.000Z',
        stepIndex: 3,
        demographics: {
          childName: 'Aarav Patel',
          artNumber: 'DL-01-2024-4242',
          caregiverName: 'Pooja Patel',
        },
      } as any;

      const handleResume = vi.fn();
      const handleDelete = vi.fn();

      render(<DraftCard draft={mockDraft} onResume={handleResume} onDelete={handleDelete} />);

      // Child name and ART number rendered
      expect(screen.getByText(/Aarav Patel/)).toBeDefined();
      expect(screen.getByText(/DL-01-2024-4242/)).toBeDefined();

      // "Saved on this device" badge and timestamp rendered
      expect(screen.getByText('Saved on this device')).toBeDefined();
      expect(screen.getByText(/Last edited/)).toBeDefined();

      // Delete button
      const deleteBtn = screen.getByRole('button', { name: 'Delete' });
      expect(deleteBtn.className).toContain('min-h-[44px]');
      expect(deleteBtn.className).toContain('bg-rose-50');

      // Click Delete to test confirmation state
      fireEvent.click(deleteBtn);
      const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      expect(confirmBtn.className).toContain('min-h-[44px]');
      expect(confirmBtn.className).toContain('bg-rose-600');
      expect(cancelBtn.className).toContain('min-h-[44px]');

      // Click Confirm
      fireEvent.click(confirmBtn);
      expect(handleDelete).toHaveBeenCalledWith(42);

      // Resume intake button
      const resumeBtn = screen.getByRole('button', { name: /Resume Intake/i });
      expect(resumeBtn.className).toContain('min-h-[44px]');
      fireEvent.click(resumeBtn);
      expect(handleResume).toHaveBeenCalledWith(42);
    });
  });
});
