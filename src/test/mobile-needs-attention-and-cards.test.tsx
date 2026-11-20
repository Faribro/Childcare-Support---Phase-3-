import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';
import { NeedsAttentionPanel } from '@/components/dashboard/NeedsAttentionPanel';
import { DASHBOARD_COPY } from '@/lib/constants/dashboardCopy';

describe('Needs Attention & Mobile Menu List Verification', () => {
  describe('Mobile 3D Status Orb Carousel & Menu List (< md)', () => {
    it('renders the 3D Status Orb carousel with 3 circular cards', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={3}
          waitingCount={2}
          submittedMissingDocsCount={4}
          approvedBankPendingCount={5}
          submittedCount={12}
        />
      );

      const carousel = screen.getByRole('region', { name: /Action items 3D carousel/i });
      expect(carousel).toBeDefined();

      // Card 1: Forms to finish
      expect(within(carousel).getByText(DASHBOARD_COPY.cards.formsToFinish.title)).toBeDefined();
      expect(within(carousel).getByText('3')).toBeDefined();
      const card1Link = within(carousel).getByRole('link', { name: new RegExp(DASHBOARD_COPY.cards.formsToFinish.linkText, 'i') });
      expect(card1Link.getAttribute('href')).toBe('/assessment/drafts');

      // Card 2: Waiting to send
      expect(within(carousel).getByText(DASHBOARD_COPY.cards.waitingToSend.title)).toBeDefined();
      expect(within(carousel).getByText('2')).toBeDefined();
      const card2Link = within(carousel).getByRole('link', { name: new RegExp(DASHBOARD_COPY.cards.waitingToSend.linkText, 'i') });
      expect(card2Link.getAttribute('href')).toBe('/assessment/sync?tab=outbox');

      // Card 3: Pendings (Combined: 4 + 5 = 9)
      expect(within(carousel).getByText(DASHBOARD_COPY.cards.pendings.title)).toBeDefined();
      expect(within(carousel).getByText('9')).toBeDefined();

      // Card 3 sub-pills
      const missingDocsPill = within(carousel).getByRole('link', { name: new RegExp(DASHBOARD_COPY.cards.pendings.rows.missingDocs.label, 'i') });
      expect(missingDocsPill.getAttribute('href')).toBe('/supervisor/assessments');
      expect(within(missingDocsPill).getByText('4')).toBeDefined();

      const bankPill = within(carousel).getByRole('link', { name: new RegExp(DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label, 'i') });
      expect(bankPill.getAttribute('href')).toBe('/assessment/sync?tab=bank_pending');
      expect(within(bankPill).getByText('5')).toBeDefined();
    });

    it('renders bounded outer stage with heading outside and interactive pagination controls', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={0}
          waitingCount={0}
          submittedMissingDocsCount={0}
          approvedBankPendingCount={0}
          submittedCount={5}
        />
      );

      // Section heading and badge are rendered outside the carousel stage
      const heading = screen.getByRole('heading', { name: /Needs Attention/i });
      expect(heading).toBeDefined();
      expect(screen.getByText(DASHBOARD_COPY.badgeZero)).toBeDefined();

      // Carousel region
      const carousel = screen.getByRole('region', { name: /Action items 3D carousel/i });
      expect(carousel).toBeDefined();

      // Outer bounded container contains the carousel and pagination
      const boundedStage = carousel.closest('.rounded-2xl');
      expect(boundedStage).not.toBeNull();
      expect(boundedStage?.className).toContain('border-slate-200');

      // 3 slides with data-card-slide attribute
      const slides = carousel.querySelectorAll('[data-card-slide]');
      expect(slides.length).toBe(3);
      expect(slides[0].className).toContain('snap-start');

      // Pagination controls
      const pagination = screen.getByRole('tablist', { name: /Needs attention carousel pagination/i });
      expect(pagination).toBeDefined();

      const tabs = within(pagination).getAllByRole('tab');
      expect(tabs.length).toBe(3);

      // Initial active tab is Card 0 (Forms to finish)
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
      expect(tabs[2].getAttribute('aria-selected')).toBe('false');
      expect(tabs[0].getAttribute('aria-label')).toContain(DASHBOARD_COPY.cards.formsToFinish.title);
      expect(tabs[1].getAttribute('aria-label')).toContain(DASHBOARD_COPY.cards.waitingToSend.title);
      expect(tabs[2].getAttribute('aria-label')).toContain(DASHBOARD_COPY.cards.pendings.title);

      // Clicking tab 1 (Waiting to send) updates active selection
      fireEvent.click(tabs[1]);
      expect(tabs[0].getAttribute('aria-selected')).toBe('false');
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
      expect(tabs[2].getAttribute('aria-selected')).toBe('false');

      // Clicking tab 2 (Pendings) updates active selection
      fireEvent.click(tabs[2]);
      expect(tabs[0].getAttribute('aria-selected')).toBe('false');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
      expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    });

    it('renders all 5 agreed menu rows, with Pendings collapsed by default and expandable on tap', () => {
      render(
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

      const menuList = screen.getByRole('list');

      // Row 2: Drafts
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.draftsTitle)).toBeDefined();
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.draftsSubtitle)).toBeDefined();
      expect(within(menuList).getByText('3')).toBeDefined();
      const draftsLink = within(menuList).getByText(DASHBOARD_COPY.mobile.draftsTitle).closest('a');
      expect(draftsLink?.getAttribute('href')).toBe('/assessment/drafts');

      // Row 3: Waiting to send
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.waitingToSendTitle)).toBeDefined();
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.waitingToSendSubtitle)).toBeDefined();
      expect(within(menuList).getByText('2')).toBeDefined();
      const waitingLink = within(menuList).getByText(DASHBOARD_COPY.mobile.waitingToSendTitle).closest('a');
      expect(waitingLink?.getAttribute('href')).toBe('/assessment/sync?tab=outbox');

      // Row 4: Pendings (Combined count = 4 + 5 = 9)
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.pendingsTitle)).toBeDefined();
      expect(within(menuList).getByText('9')).toBeDefined();

      // Confirmed: Pendings breakdown is HIDDEN normally on initial render
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.showBreakdown)).toBeDefined();
      expect(within(menuList).queryByText(DASHBOARD_COPY.mobile.missingDocsTitle)).toBeNull();
      expect(within(menuList).queryByText(DASHBOARD_COPY.mobile.bankDetailsTitle)).toBeNull();

      // Tapping "Show breakdown" expands the sub-rows
      const toggleBtn = within(menuList).getByText(DASHBOARD_COPY.mobile.showBreakdown).closest('button');
      expect(toggleBtn).not.toBeNull();
      fireEvent.click(toggleBtn!);

      // Now sub-rows are visible in menu list
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.hideBreakdown)).toBeDefined();
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.missingDocsTitle)).toBeDefined();
      expect(within(menuList).getByText('4')).toBeDefined();
      const missingDocsLink = within(menuList).getByText(DASHBOARD_COPY.mobile.missingDocsTitle).closest('a');
      expect(missingDocsLink?.getAttribute('href')).toBe('/supervisor/assessments');

      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.bankDetailsTitle)).toBeDefined();
      expect(within(menuList).getByText('5')).toBeDefined();
      const bankLink = within(menuList).getByText(DASHBOARD_COPY.mobile.bankDetailsTitle).closest('a');
      expect(bankLink?.getAttribute('href')).toBe('/assessment/sync?tab=bank_pending');

      // Tapping again collapses the sub-rows back
      fireEvent.click(toggleBtn!);
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.showBreakdown)).toBeDefined();
      expect(within(menuList).queryByText(DASHBOARD_COPY.mobile.missingDocsTitle)).toBeNull();

      // Row 5: Submitted surveys
      expect(within(menuList).getByText(DASHBOARD_COPY.mobile.submittedTitle)).toBeDefined();
      expect(within(menuList).getByText('12')).toBeDefined();
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
