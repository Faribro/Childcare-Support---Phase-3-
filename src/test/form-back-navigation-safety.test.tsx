import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { hasMeaningfulAssessmentData } from '@/lib/assessment/draftSafety';
import { BackDraftConfirmationModal } from '@/components/assessment/BackDraftConfirmationModal';

describe('Phase D: Back Navigation & Draft Behaviour', () => {
  describe('1. Meaningful Assessment Data Detection (hasMeaningfulAssessmentData)', () => {
    it('returns false for default blank or untouched form data', () => {
      const emptyForm = {
        artNumber: 'MH-PUN-2026-0001',
        koboId: 'MH-PUN-2026-0001',
        dateOfFilling: '2026-11-23',
        childName: '',
        caregiverName: '',
        dob: '',
        contactNumber: '',
        doorAndColony: '',
        street: '',
        villageCity: '',
        talukMandalBlock: '',
        pinCode: '',
        bankAccountHolderName: '',
        bankAccountNumber: '',
        bankIfscCode: '',
        weightKg: '',
        heightCm: '',
        schoolName: '',
        schoolFees: 0,
        tuitionFees: 0,
        passbookPhotoUrl: '',
        aadhaarCardPhotoUrl: '',
        childPhotoUrl: '',
        feeReceiptPhotoUrl: '',
        marksheetPhotoUrl: '',
      };

      expect(hasMeaningfulAssessmentData(emptyForm, false)).toBe(false);
    });

    it('returns true when childName is entered', () => {
      expect(hasMeaningfulAssessmentData({ childName: 'Aarav' }, false)).toBe(true);
    });

    it('returns true when caregiverName is entered', () => {
      expect(hasMeaningfulAssessmentData({ caregiverName: 'Sunita' }, false)).toBe(true);
    });

    it('returns true when saved signature exists', () => {
      expect(hasMeaningfulAssessmentData({}, true)).toBe(true);
    });

    it('returns true when clinical measurements are entered', () => {
      expect(hasMeaningfulAssessmentData({ weightKg: 14.5 }, false)).toBe(true);
      expect(hasMeaningfulAssessmentData({ heightCm: 98 }, false)).toBe(true);
    });

    it('returns true when school name or fees are entered', () => {
      expect(hasMeaningfulAssessmentData({ schoolName: 'Zilla Parishad School' }, false)).toBe(true);
      expect(hasMeaningfulAssessmentData({ schoolFees: 500 }, false)).toBe(true);
    });

    it('returns true when any document photo is attached', () => {
      expect(hasMeaningfulAssessmentData({ aadhaarCardPhotoUrl: 'data:image/jpeg;base64,...' }, false)).toBe(true);
      expect(hasMeaningfulAssessmentData({ childPhotoUrl: 'data:image/jpeg;base64,...' }, false)).toBe(true);
      expect(hasMeaningfulAssessmentData({ feeReceiptPhotoUrl: 'data:image/jpeg;base64,...' }, false)).toBe(true);
    });
  });

  describe('2. BackDraftConfirmationModal Component Behavior', () => {
    it('renders modal with exact required title, body, and action buttons', () => {
      const onSaveDraft = vi.fn();
      const onDiscard = vi.fn();
      const onContinueEditing = vi.fn();

      render(
        <BackDraftConfirmationModal
          isOpen={true}
          onSaveDraft={onSaveDraft}
          onDiscard={onDiscard}
          onContinueEditing={onContinueEditing}
        />
      );

      // Verify Title & Body per specification
      expect(screen.getByRole('heading', { name: /save this survey as a draft\?/i })).toBeDefined();
      expect(
        screen.getByText(/your progress will be lost if you leave without saving\./i)
      ).toBeDefined();

      // Verify Actions
      const saveBtn = screen.getByRole('button', { name: /save draft/i });
      const discardBtn = screen.getByRole('button', { name: /discard/i });
      const continueBtn = screen.getByRole('button', { name: /continue editing/i });

      expect(saveBtn).toBeDefined();
      expect(discardBtn).toBeDefined();
      expect(continueBtn).toBeDefined();

      // Click "Continue editing"
      fireEvent.click(continueBtn);
      expect(onContinueEditing).toHaveBeenCalledTimes(1);

      // Click "Discard"
      fireEvent.click(discardBtn);
      expect(onDiscard).toHaveBeenCalledTimes(1);

      // Click "Save Draft"
      fireEvent.click(saveBtn);
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    it('dismisses modal on Escape key press without saving or discarding', () => {
      const onSaveDraft = vi.fn();
      const onDiscard = vi.fn();
      const onContinueEditing = vi.fn();

      render(
        <BackDraftConfirmationModal
          isOpen={true}
          onSaveDraft={onSaveDraft}
          onDiscard={onDiscard}
          onContinueEditing={onContinueEditing}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onContinueEditing).toHaveBeenCalledTimes(1);
      expect(onSaveDraft).not.toHaveBeenCalled();
      expect(onDiscard).not.toHaveBeenCalled();
    });

    it('does not render anything when isOpen is false', () => {
      const { container } = render(
        <BackDraftConfirmationModal
          isOpen={false}
          onSaveDraft={vi.fn()}
          onDiscard={vi.fn()}
          onContinueEditing={vi.fn()}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
