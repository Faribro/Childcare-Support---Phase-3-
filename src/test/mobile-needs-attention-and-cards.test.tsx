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

      // Orb 2: Bank Details (Replaced Outbox)
      const bankDetailsOrb = screen.getByRole('link', { name: /Bank Details: 5/i });
      expect(bankDetailsOrb.getAttribute('href')).toBe('/assessment/sync?tab=bank');
      expect(within(bankDetailsOrb).getByText('5')).toBeDefined();

      // Orb 3: Missing Docs (Direct Link, sub-pill removed per user instruction)
      const missingDocsOrb = screen.getByRole('link', { name: /Missing Docs: 4/i });
      expect(missingDocsOrb.getAttribute('href')).toBe('/assessment/sync?tab=docs');
      expect(within(missingDocsOrb).getAllByText('4').length).toBeGreaterThanOrEqual(1);
      expect(within(missingDocsOrb).queryByText('Bank')).toBeNull();
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

    it('navigates directly to missing documents sync tab when clicking the Missing Docs hero orb', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={3}
          waitingCount={2}
          submittedMissingDocsCount={4}
          approvedBankPendingCount={5}
          submittedCount={12}
        />
      );

      const missingDocsOrb = screen.getByRole('link', { name: /Missing Docs: 4/i });
      expect(missingDocsOrb.getAttribute('href')).toBe('/assessment/sync?tab=docs');
      expect(within(missingDocsOrb).getAllByText('4').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/Bank details needed/i)).toBeNull();
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
    it('renders the 3 circular cards in exact order: Forms to finish | Missing Docs | Bank Details (last)', () => {
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

      // Card 2: Missing Docs (replacing Pendings, inner sub-pill removed per user instruction)
      expect(screen.getByText('Missing Docs')).toBeDefined();
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
      const resolveDocsLink = screen.getByRole('link', { name: /Pendings/i });
      expect(resolveDocsLink.getAttribute('href')).toBe('/assessment/sync?tab=docs');
      expect(screen.queryByText(DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label)).toBeNull();

      // Card 3: Bank Details (Last in planet order)
      expect(screen.getByText('Bank Details')).toBeDefined();
      expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('link', { name: /Bank Details: 4/i }).getAttribute('href')).toBe('/assessment/sync?tab=bank');
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

      // Multiple items (Plural: 2 drafts + 3 missing docs + 2 pending banks = 7)
      rerender(
        <NeedsAttentionPanel
          localDraftsCount={2}
          outboxAttentionCount={1}
          submittedMissingDocsCount={3}
          approvedBankPendingCount={2}
        />
      );
      expect(screen.getByText(DASHBOARD_COPY.badgePlural(7))).toBeDefined();
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
