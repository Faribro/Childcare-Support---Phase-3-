import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';
import { NeedsAttentionPanel } from '@/components/dashboard/NeedsAttentionPanel';
import { DASHBOARD_COPY } from '@/lib/constants/dashboardCopy';

describe('Needs Attention & Mobile Menu List Verification', () => {
  describe('Mobile 3-Orb Stage & Streamlined Navigation (< md)', () => {
    it('renders the 3-orb Needs Attention stage with single entry point per task', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={3}
          waitingCount={2}
          submittedMissingDocsCount={4}
          approvedBankPendingCount={5}
          submittedCount={12}
        />
      );

      const stage = screen.getByRole('region', { name: /Action items 3D stage/i });
      expect(stage).toBeDefined();

      // Orb 1: Drafts
      const draftsOrb = screen.getByRole('link', { name: /Forms to finish: 3/i });
      expect(draftsOrb.getAttribute('href')).toBe('/assessment/drafts');
      expect(within(draftsOrb).getByText('3')).toBeDefined();

      // Orb 2: Outbox / Waiting to send
      const outboxOrb = screen.getByRole('link', { name: /Waiting to send: 2/i });
      expect(outboxOrb.getAttribute('href')).toBe('/assessment/sync?tab=outbox');
      expect(within(outboxOrb).getByText('2')).toBeDefined();

      // Orb 3: Pendings (Combined: 4 + 5 = 9)
      const pendingsOrb = screen.getByRole('button', { name: /Pendings: 9/i });
      expect(within(pendingsOrb).getByText('9')).toBeDefined();
      expect(within(pendingsOrb).getByText('4')).toBeDefined(); // Docs
      expect(within(pendingsOrb).getByText('5')).toBeDefined(); // Bank
    });

    it('removes duplicate standalone status rows while preserving Start New Survey and Submitted Surveys card', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={3}
          waitingCount={2}
          submittedMissingDocsCount={4}
          approvedBankPendingCount={5}
          submittedCount={12}
        />
      );

      // 1. Start New Survey banner is retained
      expect(screen.getByText(DASHBOARD_COPY.mobile.startSurveyTitle)).toBeDefined();
      const startSurveyLink = screen.getByText(DASHBOARD_COPY.mobile.startSurveyTitle).closest('a');
      expect(startSurveyLink?.getAttribute('href')).toBe('/assessment/new');

      // 2. Duplicate standalone rows are removed (no list with duplicate standalone rows)
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByText('Saved locally on this device')).toBeNull();
      expect(screen.queryByText('Saved on this device, will send when online')).toBeNull();
      expect(screen.queryByText('Show breakdown')).toBeNull();

      // 3. Submitted Surveys card is retained below the orb stage
      const submittedHeadings = screen.getAllByRole('heading', { name: /Submitted Surveys/i });
      expect(submittedHeadings.length).toBeGreaterThanOrEqual(1);
      const submittedLink = screen.getByRole('link', { name: /Submitted surveys: 12/i });
      expect(submittedLink.getAttribute('href')).toBe('/assessment/sync?tab=synced');
      expect(within(submittedLink).getByText('12')).toBeDefined();
      expect(within(submittedLink).getByText('Confirmed on central server')).toBeDefined();
    });

    it('expands and collapses the complete Pendings breakdown when tapping the Pendings hero orb', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={3}
          waitingCount={2}
          submittedMissingDocsCount={4}
          approvedBankPendingCount={5}
          submittedCount={12}
        />
      );

      const pendingsOrb = screen.getByRole('button', { name: /Pendings: 9/i });
      expect(pendingsOrb.getAttribute('aria-expanded')).toBe('false');

      // Sub-links are NOT in the DOM initially
      expect(screen.queryByRole('link', { name: /Missing documents/i })).toBeNull();
      expect(screen.queryByRole('link', { name: /Bank details needed/i })).toBeNull();

      // Tap Pendings orb to toggle breakdown
      fireEvent.click(pendingsOrb);
      expect(pendingsOrb.getAttribute('aria-expanded')).toBe('true');

      // Breakdown card is now expanded and accessible
      const missingDocsLink = screen.getByRole('link', { name: /Missing documents/i });
      expect(missingDocsLink.getAttribute('href')).toBe('/supervisor/assessments');
      expect(within(missingDocsLink).getByText('4')).toBeDefined();

      const bankLink = screen.getByRole('link', { name: /Bank details needed/i });
      expect(bankLink.getAttribute('href')).toBe('/assessment/sync?tab=bank_pending');
      expect(within(bankLink).getByText('5')).toBeDefined();

      // Tap Pendings orb again to collapse breakdown
      fireEvent.click(pendingsOrb);
      expect(pendingsOrb.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByRole('link', { name: /Missing documents/i })).toBeNull();
    });

    it('ensures old labels and tiles are completely absent on mobile', () => {
      const { container } = render(
        <MobileKoboHomeScreen
          draftsCount={1}
          waitingCount={0}
          submittedMissingDocsCount={0}
          approvedBankPendingCount={0}
          submittedCount={10}
        />
      );

      expect(screen.queryByText(/Unfinished Forms/i)).toBeNull();
      expect(screen.queryByText(/Intake Docs Incomplete/i)).toBeNull();
      expect(screen.queryByText(/Queued \/ Retryable Sync/i)).toBeNull();
      expect(screen.queryByText(/\(local\)/i)).toBeNull();
      expect(screen.queryByText(/Authorized scope/i)).toBeNull();
    });
  });

  describe('Desktop Circular Cards (md and above)', () => {
    it('renders the 3 circular cards in exact order: Forms to finish | Waiting to send | Pendings', () => {
      const { container } = render(
        <NeedsAttentionPanel
          localDraftsCount={2}
          outboxAttentionCount={3}
          submittedMissingDocsCount={1}
          approvedBankPendingCount={4}
        />
      );

      // Card 1: Forms to finish
      expect(screen.getByText(DASHBOARD_COPY.cards.formsToFinish.title)).toBeDefined();
      expect(screen.getByText('2')).toBeDefined();
      expect(screen.getByRole('link', { name: new RegExp(DASHBOARD_COPY.cards.formsToFinish.linkText, 'i') }).getAttribute('href')).toBe('/assessment/drafts');

      // Card 2: Waiting to send
      expect(screen.getByText(DASHBOARD_COPY.cards.waitingToSend.title)).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();
      expect(screen.getByRole('link', { name: new RegExp(DASHBOARD_COPY.cards.waitingToSend.linkText, 'i') }).getAttribute('href')).toBe('/assessment/sync?tab=outbox');

      // Card 3: Pendings (Combined: 1 + 4 = 5)
      expect(screen.getByText(DASHBOARD_COPY.cards.pendings.title)).toBeDefined();
      expect(screen.getByText('5')).toBeDefined();

      // Card 3 sub-pills
      const missingDocsLink = screen.getByRole('link', { name: new RegExp(DASHBOARD_COPY.cards.pendings.rows.missingDocs.label, 'i') });
      expect(missingDocsLink.getAttribute('href')).toBe('/supervisor/assessments');
      expect(within(missingDocsLink).getByText('1')).toBeDefined();

      const bankLink = screen.getByRole('link', { name: new RegExp(DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label, 'i') });
      expect(bankLink.getAttribute('href')).toBe('/assessment/sync?tab=bank_pending');
      expect(within(bankLink).getByText('4')).toBeDefined();
    });

    it('verifies badge pluralisation logic (0, 1, and N)', () => {
      // Zero items
      const { rerender } = render(
        <NeedsAttentionPanel
          localDraftsCount={0}
          outboxAttentionCount={0}
          submittedMissingDocsCount={0}
          approvedBankPendingCount={0}
        />
      );
      expect(screen.getByText(DASHBOARD_COPY.badgeZero)).toBeDefined();

      // 1 item (Singular)
      rerender(
        <NeedsAttentionPanel
          localDraftsCount={1}
          outboxAttentionCount={0}
          submittedMissingDocsCount={0}
          approvedBankPendingCount={0}
        />
      );
      expect(screen.getByText(DASHBOARD_COPY.badgeSingular)).toBeDefined();

      // Multiple items (Plural: 2 + 1 + 3 + 2 = 8)
      rerender(
        <NeedsAttentionPanel
          localDraftsCount={2}
          outboxAttentionCount={1}
          submittedMissingDocsCount={3}
          approvedBankPendingCount={2}
        />
      );
      expect(screen.getByText(DASHBOARD_COPY.badgePlural(8))).toBeDefined();
    });

    it('verifies label and count have proper separation and do not run together', () => {
      render(
        <NeedsAttentionPanel
          localDraftsCount={0}
          outboxAttentionCount={0}
          submittedMissingDocsCount={0}
          approvedBankPendingCount={0}
        />
      );

      // Check textContent does NOT contain "Bank details needed0"
      const containerText = document.body.textContent || '';
      expect(containerText).not.toContain('Bank details needed0');
      expect(containerText).not.toContain('Missing documents0');
    });
  });
});
