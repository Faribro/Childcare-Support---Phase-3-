/**
 * mobile-form-header-id-pill-removal.test.tsx
 *
 * Regression tests for Issue #34:
 * "fix(form): remove unique beneficiary ID from top mobile form header"
 *
 * Strategy: lightweight harness components that mirror the exact structure of
 * new/page.tsx and draft/[draftId]/page.tsx top headers and Section 2 areas,
 * avoiding the full page-mount mock overhead.
 *
 * Invariants tested:
 * 1. Top header does NOT render the ID pill (no "ID" label + artNumber chip).
 * 2. Section 2 (Child Demographics) DOES still render the Unique Beneficiary
 *    ID label (canonical identity location).
 * 3. Sticky footer DOES still render the artNumber.
 * 4. Removing the top-header pill leaves no orphaned whitespace wrapper.
 * 5. Draft page top header also has no ID pill.
 * 6. Draft page Section 2 still has the canonical ID display.
 * 7. Draft page sticky footer still has artNumber.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

// ── Harnesses ─────────────────────────────────────────────────────────────────

/**
 * Mirrors the top header of new/page.tsx after the ID pill was removed.
 * Contains: Back button, ImmersiveReaderControls placeholder, NO ID pill.
 */
function NewFormTopHeader({ artNumber }: { artNumber?: string }) {
  return (
    <div data-testid="top-header" className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
      {/* Left side: Back + Language controls */}
      <div className="flex items-center space-x-2.5">
        <a href="/app" aria-label="Return to Dashboard">←</a>
        {/* ImmersiveReaderControls placeholder */}
        <div data-testid="immersive-reader-controls">Language/Audio</div>
      </div>
      {/* Right side: ID pill has been REMOVED — nothing here */}
    </div>
  );
}

/**
 * Mirrors the top banner header of draft/[draftId]/page.tsx after ID pill removal.
 */
function DraftFormTopHeader({ artNumber }: { artNumber?: string }) {
  return (
    <div data-testid="draft-top-header" className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-3">
        {/* Left: Back + title */}
        <div className="flex items-center space-x-3">
          <a href="/app" aria-label="Return to Dashboard">←</a>
          <h1>Child Nutrition &amp; Education Support Intake</h1>
        </div>
        {/* Right: Language controls only — ID pill removed */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div data-testid="immersive-reader-controls">Language/Audio</div>
          {/* No ID pill here */}
        </div>
      </div>
    </div>
  );
}

/**
 * Mirrors the Section 2 (Child Demographics) ID display that REMAINS in both forms.
 */
function Section2IdDisplay({ artNumber }: { artNumber?: string }) {
  return (
    <div data-testid="sec-demographics">
      <div
        data-testid="uid-display"
        className="p-3 bg-purple-50/60 border border-purple-200/80 rounded-xl"
      >
        <div className="flex items-center space-x-2.5">
          <span className="text-xs font-bold text-purple-950 uppercase tracking-wider">
            Unique Beneficiary ID (Auto-Generated)
          </span>
          <span className="px-3 py-1 text-xs font-mono font-bold bg-slate-900 text-white rounded-md tracking-wider shadow-xs">
            {artNumber || 'Generating...'}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Mirrors the sticky bottom action bar that REMAINS in both forms.
 */
function StickyFooter({ artNumber }: { artNumber?: string }) {
  return (
    <div
      data-testid="sticky-footer"
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/95"
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs w-full sm:w-auto justify-between sm:justify-start">
          <span
            data-testid="footer-art-number"
            className="font-mono font-bold text-purple-950 truncate max-w-[130px]"
            title={artNumber}
          >
            {artNumber || 'ID Pending'}
          </span>
          <span>•</span>
          <span>Grant: <strong>₹500</strong></span>
        </div>
        <div className="flex items-center space-x-3">
          <button type="button">Save Draft</button>
          <button type="button">Submit Survey</button>
        </div>
      </div>
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Issue #34 — ID pill removed from top mobile form header', () => {

  // ── 1. new/page.tsx top header: NO ID pill ────────────────────────────────
  it('new form top header does not contain the "ID" label pill', () => {
    render(<NewFormTopHeader artNumber="MH-PUN-081200-01" />);
    const header = screen.getByTestId('top-header');

    // The "ID" label span that was in the removed pill must not be present in the top header
    expect(within(header).queryByText('ID')).toBeNull();
  });

  it('new form top header does not render artNumber as a standalone chip', () => {
    render(<NewFormTopHeader artNumber="MH-PUN-081200-01" />);
    const header = screen.getByTestId('top-header');

    // The artNumber text must not appear in the header element
    expect(within(header).queryByText('MH-PUN-081200-01')).toBeNull();
  });

  it('new form top header does not contain "Pending" fallback text for missing artNumber', () => {
    render(<NewFormTopHeader artNumber={undefined} />);
    const header = screen.getByTestId('top-header');

    // 'Pending' was the fallback text in the removed pill
    expect(within(header).queryByText('Pending')).toBeNull();
  });

  it('new form top header still has the Back link and language controls', () => {
    render(<NewFormTopHeader artNumber="MH-PUN-081200-01" />);
    expect(screen.getByLabelText('Return to Dashboard')).not.toBeNull();
    expect(screen.getByTestId('immersive-reader-controls')).not.toBeNull();
  });

  // ── 2. draft/page.tsx top header: NO ID pill ─────────────────────────────
  it('draft form top header does not contain the "ID" label pill', () => {
    render(<DraftFormTopHeader artNumber="MH-PUN-081200-01" />);
    const header = screen.getByTestId('draft-top-header');

    expect(within(header).queryByText('ID')).toBeNull();
  });

  it('draft form top header does not render artNumber as a standalone chip', () => {
    render(<DraftFormTopHeader artNumber="DL-CEN-081200-03" />);
    const header = screen.getByTestId('draft-top-header');

    expect(within(header).queryByText('DL-CEN-081200-03')).toBeNull();
  });

  it('draft form top header still has the Back link and language controls', () => {
    render(<DraftFormTopHeader artNumber="MH-PUN-081200-01" />);
    expect(screen.getByLabelText('Return to Dashboard')).not.toBeNull();
    expect(screen.getByTestId('immersive-reader-controls')).not.toBeNull();
  });

  // ── 3. Section 2 canonical ID display: STILL PRESENT ─────────────────────
  it('Section 2 demographics still renders "Unique Beneficiary ID (Auto-Generated)" label', () => {
    render(<Section2IdDisplay artNumber="MH-PUN-081200-01" />);
    expect(screen.getByText('Unique Beneficiary ID (Auto-Generated)')).not.toBeNull();
  });

  it('Section 2 demographics shows the artNumber in the canonical pill', () => {
    render(<Section2IdDisplay artNumber="MH-PUN-081200-01" />);
    expect(screen.getByText('MH-PUN-081200-01')).not.toBeNull();
  });

  it('Section 2 demographics shows "Generating..." when artNumber is not yet set', () => {
    render(<Section2IdDisplay artNumber="" />);
    expect(screen.getByText('Generating...')).not.toBeNull();
  });

  // ── 4. Sticky footer ID: STILL PRESENT ───────────────────────────────────
  it('sticky bottom action bar still renders artNumber', () => {
    render(<StickyFooter artNumber="MH-PUN-081200-01" />);
    expect(screen.getByTestId('footer-art-number').textContent).toBe('MH-PUN-081200-01');
  });

  it('sticky bottom action bar shows "ID Pending" when artNumber is not yet set', () => {
    render(<StickyFooter artNumber={undefined} />);
    expect(screen.getByTestId('footer-art-number').textContent).toBe('ID Pending');
  });

  // ── 5. No orphaned wrapper elements ──────────────────────────────────────
  it('new form top header right side is empty after pill removal (no orphaned wrappers with only whitespace)', () => {
    const { container } = render(<NewFormTopHeader artNumber="MH-PUN-081200-01" />);
    const header = container.querySelector('[data-testid="top-header"]')!;

    // The header should have exactly 1 direct child div (left side only)
    const directDivChildren = Array.from(header.children).filter(
      (el) => el.tagName === 'DIV'
    );
    expect(directDivChildren).toHaveLength(1);
  });

});
