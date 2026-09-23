import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DraftCard } from '@/components/forms/DraftCard';
import type { AssessmentRecord } from '@/types/domain';

describe('DraftCard Deletion & Reliability', () => {
  const baseDraft: AssessmentRecord = {
    id: 42,
    uuid: 'test-uuid-42',
    clientSubmissionId: 'test-uuid-42',
    demographics: {
      childName: 'Aarav Patel',
      artNumber: 'DL-01-2026-42',
      caregiverName: 'Pooja Patel',
      dateOfFilling: '2026-09-23',
    } as any,
    updatedAt: '2026-09-23T10:00:00.000Z',
    createdAt: '2026-09-23T10:00:00.000Z',
    version: 1,
    interviewerName: 'Caseworker',
    stepIndex: 1,
    syncStatus: 'draft',
    consent: { agreeToParticipate: true } as any,
    caregiverConsent: { consentProvided: true } as any,
    bankingAndKyc: {} as any,
    householdFinancial: {} as any,
    health: {} as any,
    nutrition: {} as any,
    educationStatus: {} as any,
    educationExpenses: {} as any,
    educationSupportRequired: {} as any,
    finalReview: {} as any,
  };

  it('renders draft info and toggles confirmation on Delete click', () => {
    const onResume = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(<DraftCard draft={baseDraft} onResume={onResume} onDelete={onDelete} />);

    expect(screen.getByText(/Aarav Patel/)).toBeDefined();
    expect(screen.getByText('DL-01-2026-42')).toBeDefined();

    const deleteBtn = screen.getByRole('button', { name: /^Delete$/i });
    fireEvent.click(deleteBtn);

    expect(screen.getByText(/Delete draft\?/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Cancel$/i })).toBeDefined();

    // Cancel hides confirmation
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.queryByText(/Delete draft\?/i)).toBeNull();
  });

  it('calls onDelete with draft.id when Confirm is clicked', async () => {
    const onResume = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(<DraftCard draft={baseDraft} onResume={onResume} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(42);
    });
  });

  it('shows Deleting spinner and disables buttons during in-flight deletion', async () => {
    let resolveDelete!: () => void;
    const pendingDelete = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    const onDelete = vi.fn().mockReturnValue(pendingDelete);

    render(<DraftCard draft={baseDraft} onResume={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));

    // Should show deleting text and spinner
    expect(screen.getByText(/Deleting…/i)).toBeDefined();
    const confirmBtn = screen.getByRole('button', { name: /Deleting…/i });
    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i });
    expect(cancelBtn.hasAttribute('disabled')).toBe(true);

    // Resolve deletion
    resolveDelete();
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });
  });

  it('displays error message if onDelete rejects and allows retry', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('IndexedDB disk error'));

    render(<DraftCard draft={baseDraft} onResume={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/IndexedDB disk error/i)).toBeDefined();
    });

    // Confirm button remains so user can retry, and Cancel allows dismiss
    expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows error if draft has no numeric id', async () => {
    const draftWithoutId = { ...baseDraft, id: undefined };
    const onDelete = vi.fn();

    render(<DraftCard draft={draftWithoutId as any} onResume={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.getByText(/Cannot delete: draft has no local ID/i)).toBeDefined();
    });
  });
});
