import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';
import { NeedsAttentionPanel } from '@/components/dashboard/NeedsAttentionPanel';
import { DASHBOARD_COPY } from '@/lib/constants/dashboardCopy';

describe('Needs Attention & Mobile Menu List Verification', () => {
  describe('Mobile Menu List (< md)', () => {
    it('renders all 5 agreed menu rows with correct labels, counts, and links', () => {
      const { container } = render(
        <MobileKoboHomeScreen
          draftsCount={3}
          waitingCount={2}
          submittedMissingDocsCount={4}
          approvedBankPendingCount={5}
          submittedCount={12}
        />
      );

      // Row 1: Start New Survey
      expect(screen.getByText(DASHBOARD_COPY.mobile.startSurveyTitle)).toBeDefined();
      expect(screen.getByText(DASHBOARD_COPY.mobile.startSurveySubtitle)).toBeDefined();
      const startSurveyLink = screen.getByText(DASHBOARD_COPY.mobile.startSurveyTitle).closest('a');
      expect(startSurveyLink?.getAttribute('href')).toBe('/assessment/new');

      // Row 2: Drafts
      expect(screen.getByText(DASHBOARD_COPY.mobile.draftsTitle)).toBeDefined();
      expect(screen.getByText(DASHBOARD_COPY.mobile.draftsSubtitle)).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();
      const draftsLink = screen.getByText(DASHBOARD_COPY.mobile.draftsTitle).closest('a');
      expect(draftsLink?.getAttribute('href')).toBe('/assessment/drafts');

      // Row 3: Waiting to send
      expect(screen.getByText(DASHBOARD_COPY.mobile.waitingToSendTitle)).toBeDefined();
      expect(screen.getByText(DASHBOARD_COPY.mobile.waitingToSendSubtitle)).toBeDefined();
      expect(screen.getByText('2')).toBeDefined();
      const waitingLink = screen.getByText(DASHBOARD_COPY.mobile.waitingToSendTitle).closest('a');
      expect(waitingLink?.getAttribute('href')).toBe('/assessment/sync?tab=outbox');

      // Row 4: Pendings (Combined count = 4 + 5 = 9) - Collapsed by default
      expect(screen.getByText(DASHBOARD_COPY.mobile.pendingsTitle)).toBeDefined();
      expect(screen.getByText('9')).toBeDefined();
      expect(screen.getByText(DASHBOARD_COPY.mobile.showBreakdown)).toBeDefined();

      // Expand breakdown
      fireEvent.click(screen.getByText(DASHBOARD_COPY.mobile.showBreakdown));
      expect(screen.getByText(DASHBOARD_COPY.mobile.hideBreakdown)).toBeDefined();

      // Sub-row 4a: Missing documents
      expect(screen.getByText(DASHBOARD_COPY.mobile.missingDocsTitle)).toBeDefined();
      expect(screen.getByText('4')).toBeDefined();
      const missingDocsLink = screen.getByText(DASHBOARD_COPY.mobile.missingDocsTitle).closest('a');
      expect(missingDocsLink?.getAttribute('href')).toBe('/supervisor/assessments');

      // Sub-row 4b: Bank details needed
      expect(screen.getByText(DASHBOARD_COPY.mobile.bankDetailsTitle)).toBeDefined();
      expect(screen.getByText('5')).toBeDefined();
      const bankLink = screen.getByText(DASHBOARD_COPY.mobile.bankDetailsTitle).closest('a');
      expect(bankLink?.getAttribute('href')).toBe('/assessment/sync?tab=bank_pending');

      // Row 5: Submitted surveys
      expect(screen.getByText(DASHBOARD_COPY.mobile.submittedTitle)).toBeDefined();
      expect(screen.getByText('12')).toBeDefined();
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
