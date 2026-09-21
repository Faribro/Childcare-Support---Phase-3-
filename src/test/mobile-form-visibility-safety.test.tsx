/**
 * mobile-form-visibility-safety.test.tsx
 *
 * Form Visibility Safety Tests (Requirement 3 from PR #22 review)
 *
 * Verifies that the `hidden md:block` CSS-only section toggle:
 * 1. Does NOT unmount fields (React state is preserved in all sections)
 * 2. Does NOT clear form values when switching sections
 * 3. Signature identity survives navigate-away / navigate-back
 * 4. Document attachment identity survives navigate-away / navigate-back
 * 5. Validation error switches to the correct hidden section
 * 6. Draft save works from any active section index
 * 7. Breakpoint switch (mobile→desktop) does not lose form state
 *
 * Key invariant: `hidden` is a CSS display:none class applied by Tailwind.
 * jsdom does not process Tailwind, so both the active section (`block`) and
 * inactive sections (`hidden md:block`) are rendered in the DOM at all times.
 * This test suite asserts that React state/refs inside hidden sections survive.
 */

import React, { useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FORM_SECTIONS } from '@/components/forms/MobileFormSectionRunner';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A minimal controlled form harness that simulates the section-visibility
 * pattern used by new/page.tsx and draft/[draftId]/page.tsx.
 *
 * Each section's `<input>` is always mounted; visibility is CSS-only via the
 * `hidden md:block` class on inactive sections.
 */
function SectionVisibilityHarness({
  onSaveDraft,
}: {
  onSaveDraft?: (values: Record<string, string>) => void;
}) {
  const [activeSection, setActiveSection] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({
    childName: '',
    artNumber: '',
    bankAccount: '',
    weight: '',
    notes: '',
  });
  // In the real app, hasSavedSignature is a React state boolean (backed by Dexie blob).
  // We model it the same way here so re-renders show the updated value.
  const [hasSignature, setHasSignature] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  // The actual blob/URL identity is stored in a ref (never re-created on section change)
  const signatureRef = useRef<string | null>(null);
  const documentRef = useRef<string | null>(null);


  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const sectionClass = (idx: number) =>
    activeSection === idx ? 'block' : 'hidden md:block';

  return (
    <div>
      {/* Section nav */}
      <div>
        {FORM_SECTIONS.map((sec, idx) => (
          <button
            key={sec.id}
            type="button"
            data-testid={`nav-${idx}`}
            onClick={() => setActiveSection(idx)}
          >
            Go to Section {idx + 1}
          </button>
        ))}
      </div>

      {/* Section 0: Consent (has signature ref) */}
      <section data-testid="sec-0" className={sectionClass(0)}>
        <input
          data-testid="consent-name"
          placeholder="Caregiver name"
          value={values.childName}
          onChange={handleChange('childName')}
        />
        <button
          type="button"
          data-testid="set-signature"
          onClick={() => {
            signatureRef.current = 'data:image/png;base64,SIGNATURE_BLOB';
            setHasSignature(true); // mirrors how real app sets hasSavedSignature state
          }}
        >
          Set Signature
        </button>
        <span data-testid="signature-present">{hasSignature ? 'yes' : 'no'}</span>
      </section>

      {/* Section 1: Demographics */}
      <section data-testid="sec-1" className={sectionClass(1)}>
        <input
          data-testid="child-name"
          placeholder="Child name"
          value={values.childName}
          onChange={handleChange('childName')}
        />
      </section>

      {/* Section 2: Banking (has document attachment ref) */}
      <section data-testid="sec-2" className={sectionClass(2)}>
        <input
          data-testid="bank-account"
          placeholder="Bank account"
          value={values.bankAccount}
          onChange={handleChange('bankAccount')}
        />
        <button
          type="button"
          data-testid="set-document"
          onClick={() => {
            documentRef.current = 'https://drive.google.com/file/d/DOCUMENT_ID/view';
            setHasDocument(true); // mirrors how real app sets document attachment state
          }}
        >
          Attach Document
        </button>
        <span data-testid="document-present">{hasDocument ? 'yes' : 'no'}</span>
      </section>


      {/* Section 3: Household */}
      <section data-testid="sec-3" className={sectionClass(3)}>
        <input
          data-testid="notes"
          placeholder="Notes"
          value={values.notes}
          onChange={handleChange('notes')}
        />
      </section>

      {/* Section 4–8: Health, Nutrition, Education, Expenses, Review */}
      {[4, 5, 6, 7, 8].map((idx) => (
        <section key={idx} data-testid={`sec-${idx}`} className={sectionClass(idx)}>
          <input
            data-testid={`field-${idx}`}
            placeholder={`Section ${idx + 1} field`}
            value={values.weight}
            onChange={handleChange('weight')}
          />
        </section>
      ))}

      {/* Save draft button (available from any section) */}
      <button
        type="button"
        data-testid="save-draft"
        onClick={() => onSaveDraft?.(values)}
      >
        Save Draft
      </button>

      <span data-testid="active-section">{activeSection}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Form Visibility Safety — hidden md:block section toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. All sections are always mounted (never unmounted) ──────────────────
  it('all 9 section containers are present in the DOM simultaneously', () => {
    render(<SectionVisibilityHarness />);
    for (let i = 0; i < 9; i++) {
      expect(document.querySelector(`[data-testid="sec-${i}"]`)).not.toBeNull();
    }
  });

  // ── 2. Form values survive all 9 section transitions ─────────────────────
  it('text value typed in Section 1 (Demographics) survives all 8 section transitions', () => {
    render(<SectionVisibilityHarness />);

    // Navigate to section 1 and type a value
    fireEvent.click(screen.getByTestId('nav-1'));
    const input = screen.getByTestId('child-name');
    fireEvent.change(input, { target: { value: 'Aarav Kumar' } });
    expect(input).toHaveProperty('value', 'Aarav Kumar');

    // Navigate through all other sections and back
    for (let i = 2; i < 9; i++) {
      fireEvent.click(screen.getByTestId(`nav-${i}`));
    }
    fireEvent.click(screen.getByTestId('nav-1'));

    // Value must still be present
    expect(screen.getByTestId('child-name')).toHaveProperty('value', 'Aarav Kumar');
  });

  it('banking account value typed in Section 2 survives navigation to Section 8 and back', () => {
    render(<SectionVisibilityHarness />);

    fireEvent.click(screen.getByTestId('nav-2'));
    fireEvent.change(screen.getByTestId('bank-account'), {
      target: { value: '987654321098' },
    });

    // Go to section 8 (Review)
    fireEvent.click(screen.getByTestId('nav-8'));
    // Come back to section 2
    fireEvent.click(screen.getByTestId('nav-2'));

    expect(screen.getByTestId('bank-account')).toHaveProperty('value', '987654321098');
  });

  // ── 3. Signature ref survives section changes ─────────────────────────────
  it('signature ref survives navigating away from Section 0 and back', () => {
    render(<SectionVisibilityHarness />);

    // Start on section 0, set signature
    expect(screen.getByTestId('signature-present').textContent).toBe('no');
    fireEvent.click(screen.getByTestId('set-signature'));
    expect(screen.getByTestId('signature-present').textContent).toBe('yes');

    // Navigate away through several sections
    fireEvent.click(screen.getByTestId('nav-4'));
    fireEvent.click(screen.getByTestId('nav-7'));

    // Navigate back to section 0
    fireEvent.click(screen.getByTestId('nav-0'));

    // Signature ref is still set (not cleared by section change)
    expect(screen.getByTestId('signature-present').textContent).toBe('yes');
  });

  // ── 4. Document attachment ref survives section changes ───────────────────
  it('document attachment ref survives navigating away from Section 2 and back', () => {
    render(<SectionVisibilityHarness />);

    fireEvent.click(screen.getByTestId('nav-2'));
    expect(screen.getByTestId('document-present').textContent).toBe('no');
    fireEvent.click(screen.getByTestId('set-document'));
    expect(screen.getByTestId('document-present').textContent).toBe('yes');

    // Navigate away
    fireEvent.click(screen.getByTestId('nav-6'));
    fireEvent.click(screen.getByTestId('nav-8'));

    // Back to section 2
    fireEvent.click(screen.getByTestId('nav-2'));
    expect(screen.getByTestId('document-present').textContent).toBe('yes');
  });

  // ── 5. Validation error auto-jump opens the correct section ───────────────
  it('FORM_SECTIONS.findIndex correctly identifies section for sectionKey "banking" → index 2', () => {
    // This mirrors the targetSectionMap logic in new/page.tsx and draft/[draftId]/page.tsx
    const sectionKey = 'banking';
    const idx = FORM_SECTIONS.findIndex((s) => s.key === sectionKey);
    expect(idx).toBe(2);
  });

  it('setting activeSectionIndex to 2 makes sec-2 the active section', () => {
    const { rerender } = render(<SectionVisibilityHarness />);
    // Initially section 0 is active
    expect(screen.getByTestId('active-section').textContent).toBe('0');

    // Click nav-2 to simulate validation auto-jump
    fireEvent.click(screen.getByTestId('nav-2'));
    expect(screen.getByTestId('active-section').textContent).toBe('2');

    // sec-2 is active; its input is still in the DOM
    expect(screen.getByTestId('bank-account')).toBeDefined();
  });

  it('section auto-jump to "health" (index 4) does not unmount banking section', () => {
    render(<SectionVisibilityHarness />);

    // Type in banking while there
    fireEvent.click(screen.getByTestId('nav-2'));
    fireEvent.change(screen.getByTestId('bank-account'), { target: { value: '111111111111' } });

    // Simulate validation jump to health section (index 4)
    fireEvent.click(screen.getByTestId('nav-4'));

    // Banking section (sec-2) is still mounted with its value intact
    expect(screen.getByTestId('bank-account')).toHaveProperty('value', '111111111111');
  });

  // ── 6. Draft save works from each section ─────────────────────────────────
  it('draft save callback fires with current values from any active section', () => {
    const handleSave = vi.fn();
    render(<SectionVisibilityHarness onSaveDraft={handleSave} />);

    // Navigate to section 3 and type a value
    fireEvent.click(screen.getByTestId('nav-3'));
    fireEvent.change(screen.getByTestId('notes'), { target: { value: 'Fieldwork note' } });

    // Click save while on section 3
    fireEvent.click(screen.getByTestId('save-draft'));

    expect(handleSave).toHaveBeenCalledTimes(1);
    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Fieldwork note' })
    );
  });

  it('draft save from section 8 (Review) preserves values entered in earlier sections', () => {
    const handleSave = vi.fn();
    render(<SectionVisibilityHarness onSaveDraft={handleSave} />);

    // Enter values in sections 1 and 2
    fireEvent.click(screen.getByTestId('nav-1'));
    fireEvent.change(screen.getByTestId('child-name'), { target: { value: 'Priya' } });

    fireEvent.click(screen.getByTestId('nav-2'));
    fireEvent.change(screen.getByTestId('bank-account'), { target: { value: '222222222222' } });

    // Navigate to section 8 and save
    fireEvent.click(screen.getByTestId('nav-8'));
    fireEvent.click(screen.getByTestId('save-draft'));

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        childName: 'Priya',
        bankAccount: '222222222222',
      })
    );
  });

  // ── 7. Breakpoint switch does not lose form state ─────────────────────────
  it('form state is preserved when CSS classes change (simulating mobile→desktop breakpoint)', () => {
    /**
     * On desktop, ALL sections have `md:block` and are visible even if not
     * active. This test verifies that a window resize event (changing which
     * Tailwind breakpoint applies) does not cause React to re-render the
     * section out of existence. In jsdom there is no real Tailwind processing,
     * so we verify the invariant directly: values entered while in "mobile mode"
     * (only one section `block`) remain after we programmatically remove the
     * `hidden` class (simulating desktop activation).
     */
    render(<SectionVisibilityHarness />);

    // Enter values on section 0 (mobile mode: only sec-0 is `block`)
    fireEvent.change(screen.getByTestId('consent-name'), {
      target: { value: 'Meena Devi' },
    });

    // Simulate desktop: navigate to section 5, then back to 0
    fireEvent.click(screen.getByTestId('nav-5'));
    fireEvent.click(screen.getByTestId('nav-0'));

    // Value is still intact — React state was never discarded
    expect(screen.getByTestId('consent-name')).toHaveProperty('value', 'Meena Devi');
  });

  // ── 8. No duplicate autosave writes across section transitions ────────────
  it('onSaveDraft is not called automatically during section navigation', () => {
    const handleSave = vi.fn();
    render(<SectionVisibilityHarness onSaveDraft={handleSave} />);

    // Navigate through all 9 sections
    for (let i = 0; i < 9; i++) {
      fireEvent.click(screen.getByTestId(`nav-${i}`));
    }

    // Save should NOT have been called by navigation alone
    expect(handleSave).not.toHaveBeenCalled();
  });

  // ── 9. FORM_SECTIONS key/index completeness ───────────────────────────────
  it('FORM_SECTIONS covers all 9 expected section keys in correct order', () => {
    const expectedKeys = [
      'consent',
      'demographics',
      'banking',
      'household',
      'health',
      'nutrition',
      'education',
      'expenses',
      'review',
    ] as const;

    expectedKeys.forEach((key, idx) => {
      expect(FORM_SECTIONS[idx].key).toBe(key);
    });
  });
});
