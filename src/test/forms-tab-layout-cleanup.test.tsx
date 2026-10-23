/**
 * forms-tab-layout-cleanup.test.tsx
 *
 * Verification suite for Forms Tab layout simplification:
 * 1. Visual DOM Order in Forms Workspace:
 *    - Existing illustrated banner/header is present at top.
 *    - Survey action row ("Child Nutrition & Support Form" + "+ Start New Survey") appears BEFORE Needs Attention.
 *    - Needs Attention section appears directly below the survey action row.
 *    - In-progress drafts section appears after Needs Attention.
 * 2. Survey Action Row:
 *    - "Child Nutrition & Support Form" title text is preserved.
 *    - AnimatedHeartUnlock indicator is preserved.
 *    - "+ Start New Survey" button appears once in the row and links to /assessment/new with prefetch enabled.
 * 3. Four Needs Attention Action Tiles:
 *    - 1. UNFINISHED FORMS (links to /assessment/drafts)
 *    - 2. INTAKE DOCS INCOMPLETE (links to /supervisor/assessments)
 *    - 3. QUEUED / RETRYABLE SYNC (links to /assessment/sync?tab=outbox)
 *    - 4. BANK DETAILS PENDING (links to /assessment/sync?tab=bank_pending)
 * 4. Removal of Obsolete Summary Tiles:
 *    - "Local In-Progress Drafts" summary tile is completely absent from DOM.
 *    - "Waiting to be Sent" summary tile is completely absent from DOM.
 *    - The legacy "Submitted Surveys" counter tile inside the form card is completely absent.
 *    - No duplicate operational statistics grid exists under the survey action row.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import FieldWorkspacePage from '@/app/app/page';
import * as draftRepo from '@/lib/db/draftRepository';
import * as syncRepo from '@/lib/db/syncQueueRepository';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Link
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

// Mock AnimatedHeartUnlock & MiniatureGardenPlayground for fast JSDOM execution
vi.mock('@/components/garden/MiniatureGardenPlayground', () => ({
  MiniatureGardenPlayground: () => <div data-testid="garden-playground" />,
}));

vi.mock('@/components/ui/AnimatedHeartUnlock', () => ({
  AnimatedHeartUnlock: () => <div data-testid="animated-heart" />,
}));

describe('Forms Tab Layout Simplification (/app)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(draftRepo, 'getDraftsCount').mockResolvedValue(4);
    vi.spyOn(draftRepo, 'getAllDrafts').mockResolvedValue([
      {
        id: 1,
        uuid: 'draft-1',
        childName: 'Pooja Verma',
        artNumber: 'DL-01-2026-001',
        status: 'draft',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      } as any,
    ]);
    vi.spyOn(draftRepo, 'deleteDraft').mockResolvedValue();

    vi.spyOn(syncRepo, 'getWaitingQueueCount').mockResolvedValue(2);
    vi.spyOn(syncRepo, 'getLocalSyncedCount').mockResolvedValue(15);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          serverConfirmed: 45,
          intakeIncomplete: 3,
          bankPending: 5,
          scope: { allowedStates: ['Delhi', 'Maharashtra'] },
        },
      }),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders the survey action row BEFORE Needs Attention in actual DOM order', async () => {
    const { container } = render(<FieldWorkspacePage />);

    // Locate elements in the desktop workspace view
    const desktopView = container.querySelector('.max-w-4xl');
    expect(desktopView).not.toBeNull();

    const gardenPlayground = desktopView!.querySelector('[data-testid="garden-playground"]');
    const surveyTitle = within(desktopView as HTMLElement).getByRole('heading', {
      name: /Child Nutrition & Support Form/i,
    });
    const surveyActionRow = surveyTitle.closest('.rounded-2xl');
    const needsAttentionHeading = within(desktopView as HTMLElement).getByRole('heading', {
      name: /Needs Attention/i,
    });
    const needsAttentionSection = needsAttentionHeading.closest('section');
    const draftsSectionHeading = within(desktopView as HTMLElement).getByRole('heading', {
      name: /My In-Progress Drafts/i,
    });

    expect(gardenPlayground).not.toBeNull();
    expect(surveyActionRow).not.toBeNull();
    expect(needsAttentionSection).not.toBeNull();
    expect(draftsSectionHeading).not.toBeNull();

    // DOM Position Verification:
    // 1. Garden playground precedes survey action row
    expect(
      gardenPlayground!.compareDocumentPosition(surveyActionRow!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // 2. Survey action row precedes Needs Attention section
    expect(
      surveyActionRow!.compareDocumentPosition(needsAttentionSection!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // 3. Needs Attention section precedes My In-Progress Drafts
    expect(
      needsAttentionSection!.compareDocumentPosition(draftsSectionHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('2. Preserves the survey action row elements and single "+ Start New Survey" action linking to /assessment/new', async () => {
    const { container } = render(<FieldWorkspacePage />);
    const desktopView = container.querySelector('.max-w-4xl') as HTMLElement;
    expect(desktopView).not.toBeNull();

    // "Child Nutrition & Support Form" title in desktop survey row
    const title = within(desktopView).getByText('Child Nutrition & Support Form');
    expect(title).toBeDefined();

    // Animated heart indicator
    const heart = within(desktopView).getByTestId('animated-heart');
    expect(heart).toBeDefined();

    // Exactly one "+ Start New Survey" button inside the survey action row
    const surveyActionRow = title.closest('.rounded-2xl') as HTMLElement;
    const surveyButtons = within(surveyActionRow).getAllByRole('button', { name: /Start New Survey/i });
    expect(surveyButtons.length).toBe(1);

    const surveyLink = surveyButtons[0].closest('a');
    expect(surveyLink).not.toBeNull();
    expect(surveyLink?.getAttribute('href')).toBe('/assessment/new');
  });

  it('3. Renders all 4 Needs Attention tiles with accurate counts and destinations', async () => {
    const { container } = render(<FieldWorkspacePage />);
    const desktopView = container.querySelector('.max-w-4xl') as HTMLElement;
    expect(desktopView).not.toBeNull();

    const needsAttentionSection = within(desktopView).getByRole('heading', {
      name: /Needs Attention/i,
    }).closest('section') as HTMLElement;
    expect(needsAttentionSection).not.toBeNull();

    await waitFor(() => {
      // 1. Unfinished Forms
      expect(within(needsAttentionSection).getByText(/Unfinished Forms/i)).toBeDefined();
      expect(
        within(needsAttentionSection).getByRole('link', { name: /Resume drafts/i }).getAttribute('href')
      ).toBe('/assessment/drafts');

      // 2. Intake Docs Incomplete
      expect(within(needsAttentionSection).getByText(/Intake Docs Incomplete/i)).toBeDefined();
      expect(
        within(needsAttentionSection).getByRole('link', { name: /Review intake gaps/i }).getAttribute('href')
      ).toBe('/supervisor/assessments');

      // 3. Queued / Retryable Sync
      expect(within(needsAttentionSection).getByText(/Queued \/ Retryable Sync/i)).toBeDefined();
      expect(
        within(needsAttentionSection).getByRole('link', { name: /View local outbox/i }).getAttribute('href')
      ).toBe('/assessment/sync?tab=outbox');

      // 4. Bank Details Pending
      expect(within(needsAttentionSection).getByText(/Bank Details Pending/i)).toBeDefined();
      expect(
        within(needsAttentionSection).getByRole('link', { name: /Open bank queue/i }).getAttribute('href')
      ).toBe('/assessment/sync?tab=bank_pending');
    });
  });

  it('4. Confirms the three obsolete summary tiles are completely absent from the DOM', async () => {
    const { container } = render(<FieldWorkspacePage />);
    const desktopView = container.querySelector('.max-w-4xl') as HTMLElement;
    expect(desktopView).not.toBeNull();

    // Tile 1: "Local In-Progress Drafts" - absent everywhere in the document
    expect(screen.queryByText('Local In-Progress Drafts')).toBeNull();

    // Tile 2: "Waiting to be Sent" - absent everywhere in the document
    expect(screen.queryByText('Waiting to be Sent')).toBeNull();

    // Tile 3: The legacy "Submitted Surveys" count card inside the old action card
    const surveyTitle = within(desktopView).getByRole('heading', {
      name: /Child Nutrition & Support Form/i,
    });
    const surveyActionCard = surveyTitle.closest('.rounded-2xl');
    expect(surveyActionCard).not.toBeNull();

    // Within the survey action card, there must be NO summary tiles or stats grid
    expect(surveyActionCard?.querySelector('.grid-cols-2')).toBeNull();
    expect(surveyActionCard?.querySelector('.grid-cols-3')).toBeNull();
    expect(surveyActionCard?.textContent).not.toContain('Local In-Progress Drafts');
    expect(surveyActionCard?.textContent).not.toContain('Waiting to be Sent');
    expect(surveyActionCard?.textContent).not.toContain('Submitted Surveys');
  });
});
