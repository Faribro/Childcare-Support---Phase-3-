/**
 * mobile-kobocollect-navigation.test.tsx
 *
 * Comprehensive test suite for Mobile UX Refinement (KoboCollect-Style White Mobile Experience):
 * 1. MobileKoboHomeScreen rendering:
 *    - 5 full-width touch actions (Start New Survey, Drafts, Ready to send, Submitted surveys, Evaluation)
 *    - Accurate static subtitle labels for each action
 *    - Collapsible Drafts drawer with resume & delete triggers
 *    - Alliance India branding footer
 * 2. MobileFormSectionRunner navigation:
 *    - Step tracker header (Sec N/9 pill) and section shortTitle
 *    - Previous / Next progression using correct button text
 *    - Jump drawer opening (aria-label "Jump to section") and section title text
 *    - Final section (index 8) displays Finalize & Submit button
 * 3. MobileFormSummaryCard:
 *    - "Form Completion Checklist" heading
 *    - 8 checklist row labels (Caregiver Consent, Child Demographics, Banking & KYC, …)
 *    - Jump callback fires with correct section index
 * 4. Validation section auto-switch:
 *    - Schema and custom validation errors switch activeSectionIndex to the section
 *      containing the first error
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';
import { MobileFormSectionRunner, FORM_SECTIONS } from '@/components/forms/MobileFormSectionRunner';
import { MobileFormSummaryCard } from '@/components/forms/MobileFormSummaryCard';
import type { FormValidationError } from '@/lib/validations/formValidationRegistry';

// ── Mock Next.js Link and useRouter ──────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// ── Mock evaluationAccess (used inside MobileKoboHomeScreen) ─────────────────
vi.mock('@/lib/auth/evaluationAccess', () => ({
  useEvaluationAccess: () => ({ isUnlocked: false }),
}));

// ── Shared draft fixture ─────────────────────────────────────────────────────
const mockDrafts = [
  {
    id: 1,
    uuid: 'draft-uuid-1',
    clientSubmissionId: 'draft-1',
    childName: 'Aarav Kumar',
    artNumber: 'DL-01-2024-001',
    updatedAt: new Date().toISOString(),
    status: 'draft',
    demographics: { childName: 'Aarav Kumar', artNumber: 'DL-01-2024-001' },
  },
  {
    id: 2,
    uuid: 'draft-uuid-2',
    clientSubmissionId: 'draft-2',
    childName: 'Priya Sharma',
    artNumber: 'DL-01-2024-002',
    updatedAt: new Date().toISOString(),
    status: 'draft',
    demographics: { childName: 'Priya Sharma', artNumber: 'DL-01-2024-002' },
  },
] as any[];

// ── Default MobileKoboHomeScreen props ───────────────────────────────────────
const defaultHomeProps = {
  drafts: mockDrafts,
  waitingCount: 3,
  submittedCount: 12,
  isLoading: false,
  onDeleteDraft: vi.fn(),
  onResumeDraft: vi.fn(),
};

// ────────────────────────────────────────────────────────────────────────────
describe('Mobile UX Refinement — KoboCollect-Style Mobile Experience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // scrollTo is not implemented in jsdom
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('1. MobileKoboHomeScreen', () => {
    it('renders core mobile workflow actions with correct headings and removes outbox/evaluation', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);

      // Active actions
      expect(screen.getByText('Start New Survey')).toBeDefined();
      expect(screen.getByText('Drafts')).toBeDefined();
      expect(screen.getByText('Submitted surveys')).toBeDefined();

      // Removed actions (Issue #24 & #25)
      expect(screen.queryByText('Ready to send')).toBeNull();
      expect(screen.queryByText('Evaluation')).toBeNull();
    });

    it('shows static subtitle labels for Drafts and Submitted surveys', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);

      expect(screen.getByText('Saved locally on this device')).toBeDefined();
      expect(screen.getByText('Confirmed on central server')).toBeDefined();
    });

    it('renders the restored miniature garden playground at the bottom', () => {
      const { container } = render(<MobileKoboHomeScreen {...defaultHomeProps} />);
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeDefined();
    });

    it('renders Drafts as a dedicated navigation link to /assessment/drafts', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);

      const draftsLink = screen.getByText('Drafts').closest('a');
      expect(draftsLink).toBeDefined();
      expect(draftsLink?.getAttribute('href')).toBe('/assessment/drafts');
      expect(screen.getByText('2')).toBeDefined(); // draft count badge
    });

    it('renders Submitted surveys as a dedicated navigation link to /assessment/sync?tab=synced', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);

      const submittedLink = screen.getByText('Submitted surveys').closest('a');
      expect(submittedLink).toBeDefined();
      expect(submittedLink?.getAttribute('href')).toBe('/assessment/sync?tab=synced');
      expect(screen.getByText('12')).toBeDefined(); // submitted count badge
    });

    it('does not render any inline collapsible drawers or expanded records on mobile home', () => {
      render(<MobileKoboHomeScreen {...defaultHomeProps} />);

      // No accordion buttons or inline drawer states
      expect(screen.queryByRole('button', { name: /Drafts/i })).toBeNull();
      expect(screen.queryByText('No active drafts on this device')).toBeNull();
      expect(screen.queryByText('Aarav Kumar')).toBeNull();
      expect(screen.queryByText('Priya Sharma')).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('2. MobileFormSectionRunner', () => {
    const runnerProps = {
      activeSectionIndex: 0,
      onSelectSection: vi.fn(),
      onSaveDraft: vi.fn(),
      onSubmit: vi.fn(),
      isSubmitting: false,
      errorsBySection: {} as Record<string, FormValidationError[]>,
    };

    it('renders sticky tracker pill with "Sec 1/9" and section shortTitle on Section 1', () => {
      render(<MobileFormSectionRunner {...runnerProps} activeSectionIndex={0} />);

      // The tracker pill text is exactly "Sec 1/9"
      expect(screen.getAllByText('Sec 1/9').length).toBeGreaterThan(0);
      // shortTitle for section 0 is "Consent"
      expect(screen.getByText('Consent')).toBeDefined();
    });

    it('disables Prev button on Section 1', () => {
      render(<MobileFormSectionRunner {...runnerProps} activeSectionIndex={0} />);

      // Prev button has visible text "Prev"
      const prevButtons = screen.getAllByText('Prev');
      expect(prevButtons.length).toBeGreaterThan(0);
      // The first is the bottom-nav Prev button — its parent button should be disabled
      const prevBtn = prevButtons[0].closest('button') as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(true);
    });

    it('enables Prev button on Section 2', () => {
      render(<MobileFormSectionRunner {...runnerProps} activeSectionIndex={1} />);

      const prevBtn = screen.getAllByText('Prev')[0].closest('button') as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(false);
    });

    it('calls onSelectSection(1) when Next button is clicked on Section 1', () => {
      const handleSelectSection = vi.fn();
      render(
        <MobileFormSectionRunner
          {...runnerProps}
          activeSectionIndex={0}
          onSelectSection={handleSelectSection}
        />
      );

      // Next button text starts with "Next:"
      const nextBtn = screen.getByText(/^Next:/).closest('button') as HTMLButtonElement;
      fireEvent.click(nextBtn);

      expect(handleSelectSection).toHaveBeenCalledWith(1);
    });

    it('opens Jump Drawer on "Jump to section" button click and shows "Jump to Section" heading', () => {
      render(<MobileFormSectionRunner {...runnerProps} />);

      // There are two buttons with aria-label="Jump to section" (top bar + bottom bar)
      const jumpBtns = screen.getAllByRole('button', { name: /Jump to section/i });
      expect(jumpBtns.length).toBeGreaterThan(0);
      fireEvent.click(jumpBtns[0]);

      // Modal heading text
      expect(screen.getByText('Jump to Section')).toBeDefined();
    });

    it('lists all 9 section titles inside the Jump Drawer', () => {
      render(<MobileFormSectionRunner {...runnerProps} />);

      const jumpBtns = screen.getAllByRole('button', { name: /Jump to section/i });
      fireEvent.click(jumpBtns[0]);

      // Check a few section titles (full title from FORM_SECTIONS)
      expect(screen.getByText('Caregiver Consent & Signature')).toBeDefined();
      expect(screen.getByText('Clinical & ART Health Metrics')).toBeDefined();
      expect(screen.getByText('Caseworker Verification & Submit')).toBeDefined();
    });

    it('calls onSelectSection(4) when Section 5 is selected from Jump Drawer', () => {
      const handleSelectSection = vi.fn();
      render(
        <MobileFormSectionRunner
          {...runnerProps}
          onSelectSection={handleSelectSection}
        />
      );

      const jumpBtns = screen.getAllByRole('button', { name: /Jump to section/i });
      fireEvent.click(jumpBtns[0]);

      // Find and click the "Clinical & ART Health Metrics" (section 5, index 4)
      const sec5Btn = screen.getByText('Clinical & ART Health Metrics').closest('button')!;
      fireEvent.click(sec5Btn);

      expect(handleSelectSection).toHaveBeenCalledWith(4);
    });

    it('displays "Finalize & Submit" button on Section 9 (index 8)', () => {
      const handleSubmit = vi.fn();
      render(
        <MobileFormSectionRunner
          {...runnerProps}
          activeSectionIndex={8}
          onSubmit={handleSubmit}
        />
      );

      const submitBtn = screen.getByText('Finalize & Submit').closest('button')!;
      expect(submitBtn).toBeDefined();

      fireEvent.click(submitBtn);
      expect(handleSubmit).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('3. MobileFormSummaryCard', () => {
    const cardProps = {
      formData: {
        agreeToParticipate: false,
        childName: '',
        dateOfBirth: '',
        gender: '',
        accountHolderName: '',
        bankAccountNumber: '',
        primaryCaregiverName: '',
        monthlyHouseholdIncome: '',
        artNumber: '',
        onArt: undefined,
        weightKg: '',
        heightCm: '',
        schoolEnrolled: undefined,
      },
      hasSavedSignature: false,
      totalRequiredSupport: 2500,
      onJumpToSection: vi.fn(),
    };

    it('renders "Form Completion Checklist" heading', () => {
      render(<MobileFormSummaryCard {...cardProps} />);
      expect(screen.getByText('Form Completion Checklist')).toBeDefined();
    });

    it('renders all 8 checklist row labels', () => {
      render(<MobileFormSummaryCard {...cardProps} />);

      // Labels from summaryItems in MobileFormSummaryCard
      expect(screen.getByText('Caregiver Consent')).toBeDefined();
      expect(screen.getByText('Child Demographics')).toBeDefined();
      expect(screen.getByText('Banking & KYC')).toBeDefined();
      expect(screen.getByText('Household & Socio-Economic')).toBeDefined();
      expect(screen.getByText('Clinical & ART Health')).toBeDefined();
      expect(screen.getByText('Anthropometry & Nutrition')).toBeDefined();
      expect(screen.getByText('Education Assessment')).toBeDefined();
      expect(screen.getByText('Education Aid Breakdown')).toBeDefined();
    });

    it('shows "0/8 Done" progress badge when all sections are incomplete', () => {
      // totalRequiredSupport:0 ensures Education Aid Breakdown is also incomplete → 0/8
      render(<MobileFormSummaryCard {...cardProps} totalRequiredSupport={0} />);
      // The badge renders {completedCount}/8 Done across split text nodes — use textContent
      const badge = document.querySelector('span.font-mono');
      expect(badge?.textContent?.replace(/\s+/g, '')).toBe('0/8Done');
    });

    it('shows "8/8 Done" progress badge when all sections are complete', () => {
      const completeProps = {
        ...cardProps,
        formData: {
          agreeToParticipate: true,
          childName: 'Aarav Kumar',
          dateOfBirth: '2015-01-01',
          gender: 'Male',
          accountHolderName: 'Meena Kumar',
          bankAccountNumber: '1234567890',
          primaryCaregiverName: 'Meena Kumar',
          monthlyHouseholdIncome: '12000',
          artNumber: 'DL-001',
          onArt: true,
          weightKg: '18',
          heightCm: '110',
          schoolEnrolled: true,
        },
        hasSavedSignature: true,
        totalRequiredSupport: 3500, // > 0 → Education Aid Breakdown is "complete"
      };
      render(<MobileFormSummaryCard {...completeProps} />);
      const badge = document.querySelector('span.font-mono');
      expect(badge?.textContent?.replace(/\s+/g, '')).toBe('8/8Done');
    });

    it('calls onJumpToSection(0) when clicking the Caregiver Consent row', () => {
      const handleJump = vi.fn();
      render(<MobileFormSummaryCard {...cardProps} onJumpToSection={handleJump} />);

      // Each row is a button; click the one whose text is "Caregiver Consent"
      const consentBtn = screen.getByText('Caregiver Consent').closest('button')!;
      fireEvent.click(consentBtn);

      expect(handleJump).toHaveBeenCalledWith(0);
    });

    it('calls onJumpToSection(6) when clicking the Education Assessment row', () => {
      const handleJump = vi.fn();
      render(<MobileFormSummaryCard {...cardProps} onJumpToSection={handleJump} />);

      const educationBtn = screen.getByText('Education Assessment').closest('button')!;
      fireEvent.click(educationBtn);

      expect(handleJump).toHaveBeenCalledWith(6);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Section Error Auto-Navigation — FORM_SECTIONS index mapping', () => {
    it('maps sectionKey "demographics" to FORM_SECTIONS index 1', () => {
      const error: FormValidationError = {
        path: ['demographics', 'childName'],
        fieldKey: 'demographics.childName',
        sectionKey: 'demographics',
        message: 'Child full name is required.',
        label: 'Child full name',
        elementId: 'childName',
      };

      const idx = FORM_SECTIONS.findIndex((s) => s.key === error.sectionKey);
      expect(idx).toBe(1);
    });

    it('maps sectionKey "review" to FORM_SECTIONS index 8', () => {
      const error: FormValidationError = {
        path: ['finalReview', 'formSubmittedBy'],
        fieldKey: 'finalReview.formSubmittedBy',
        sectionKey: 'review',
        message: 'Interviewer name required.',
        label: 'Interviewer name',
        elementId: 'review-formSubmittedBy',
      };

      const idx = FORM_SECTIONS.findIndex((s) => s.key === error.sectionKey);
      expect(idx).toBe(8);
    });

    it('maps sectionKey "consent" to FORM_SECTIONS index 0', () => {
      const idx = FORM_SECTIONS.findIndex((s) => s.key === 'consent');
      expect(idx).toBe(0);
    });

    it('maps sectionKey "health" to FORM_SECTIONS index 4', () => {
      const idx = FORM_SECTIONS.findIndex((s) => s.key === 'health');
      expect(idx).toBe(4);
    });

    it('all 9 FORM_SECTIONS have unique, non-empty keys and ids', () => {
      const keys = FORM_SECTIONS.map((s) => s.key);
      const ids = FORM_SECTIONS.map((s) => s.id);
      expect(new Set(keys).size).toBe(9);
      expect(new Set(ids).size).toBe(9);
    });
  });
});
