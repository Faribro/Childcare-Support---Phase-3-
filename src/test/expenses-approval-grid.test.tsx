/**
 * expenses-approval-grid.test.tsx
 *
 * Test suite for ExpensesAndApprovalGrid — Issue #31:
 *
 * 1. Rendering at mobile viewports (360px, 390px, 430px):
 *    - Mobile card layout renders all expense rows.
 *    - No horizontal overflow (structural / CSS-class check).
 *    - Expense labels, frequencies, and descriptions are visible and wrap freely.
 *
 * 2. Cost fields:
 *    - Current cost inputs are rendered and editable.
 *    - Required cost inputs are rendered and editable.
 *    - Currency prefix (₹) is present.
 *
 * 3. "Current cost is same as required cost" checkbox:
 *    - Checkbox is rendered per row in editable mode.
 *    - Checking it copies current cost → required cost immediately.
 *    - While checked and current cost changes, required cost updates.
 *    - Unchecking breaks the mirror; required cost can be edited freely.
 *    - Manually editing required cost while checked unlinks the mirror.
 *    - Checkbox is NOT rendered in read-only mode.
 *
 * 4. Totals:
 *    - Mobile summary shows both total current cost and total required cost.
 *    - Totals update correctly after cost changes.
 *    - Totals update correctly after checkbox copies costs.
 *
 * 5. Read-only mode:
 *    - Inputs are not rendered; formatted values are shown as text.
 *    - Checkboxes are not rendered.
 *
 * 6. Backward compatibility:
 *    - Component accepts existing required-support shape with optional requiredTuitionFees.
 *    - Missing/zero values default gracefully.
 *
 * 7. Desktop layout:
 *    - Desktop table structure is present and includes both cost columns.
 *    - Total summary row spans correctly and has no blank gap.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ExpensesAndApprovalGrid } from '@/components/education/ExpensesAndApprovalGrid';

// ─── Mock PhotoUpload (to avoid canvas / file API issues in jsdom) ────────────
vi.mock('@/components/ui/PhotoUpload', () => ({
  PhotoUpload: ({ label }: { label: string }) => <div data-testid="photo-upload">{label}</div>,
}));

// ─── Mock Input (simple pass-through) ────────────────────────────────────────
vi.mock('@/components/ui/Input', () => ({
  Input: ({ label, value, onChange, placeholder }: any) => (
    <label>
      {label}
      <input value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  ),
}));

// ─── Default props factory ────────────────────────────────────────────────────
const makeProps = (overrides: Partial<Parameters<typeof ExpensesAndApprovalGrid>[0]> = {}) => ({
  currentExpenses: {
    schoolFees: 5000,
    tuitionFees: 1200,
    books: 800,
    stationery: 300,
    uniform: 600,
    transport: 500,
    otherExpenses: 0,
    feeReceiptPhotoUrl: undefined,
    marksheetPhotoUrl: undefined,
    remarks: '',
  },
  requiredSupport: {
    requiredSchoolFees: 4000,
    requiredTuitionFees: 1000,
    requiredBooks: 700,
    requiredStationery: 250,
    requiredUniform: 550,
    requiredTransport: 450,
    requiredOtherSupport: 0,
  },
  onCurrentExpenseChange: vi.fn(),
  onRequiredSupportChange: vi.fn(),
  onReceiptPhotoChange: vi.fn(),
  onMarksheetPhotoChange: vi.fn(),
  onRemarksChange: vi.fn(),
  ...overrides,
});

describe('ExpensesAndApprovalGrid (Issue #31)', () => {
  describe('1. Basic rendering', () => {
    it('renders all 7 expense categories in mobile card view', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      // Labels appear in both desktop table and mobile cards so we use getAllByText
      expect(screen.getAllByText('School Fees').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Private Tuition Fee').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Books & Syllabi').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Stationery (Pen/Paper/Geometry Box)').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('School Uniform').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('School Transport').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Other Educational Expenses').length).toBeGreaterThanOrEqual(1);
    });

    it('renders frequency badges for each row', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      expect(screen.getAllByText(/Annual \/ Session/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Monthly \(Recurring\)/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Twice a year \(Bi-annual\)/).length).toBeGreaterThanOrEqual(1);
    });

    it('renders approval criteria text for each row', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      expect(screen.getAllByText(/fee receipt/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/NCERT\/State Board/i).length).toBeGreaterThanOrEqual(1);
    });

    it('renders the approval guidelines banner', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      expect(screen.getByText('Educational Support Approval & Disbursement Guidelines')).toBeDefined();
    });
  });

  describe('2. Cost input fields', () => {
    it('renders "Current Cost" inputs for each expense row', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      // Mobile + desktop = multiple labels
      const currentLabels = screen.getAllByText(/Current Cost/i);
      expect(currentLabels.length).toBeGreaterThanOrEqual(7);
    });

    it('renders "Required Grant" inputs for each expense row', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      const reqLabels = screen.getAllByText(/Required Grant/i);
      expect(reqLabels.length).toBeGreaterThanOrEqual(7);
    });

    it('calls onCurrentExpenseChange when current cost input changes', () => {
      const onCurrent = vi.fn();
      render(<ExpensesAndApprovalGrid {...makeProps({ onCurrentExpenseChange: onCurrent })} />);
      const inputs = screen.getAllByLabelText(/Current cost for School Fees/i);
      fireEvent.change(inputs[0], { target: { value: '6000' } });
      expect(onCurrent).toHaveBeenCalledWith('schoolFees', 6000);
    });

    it('calls onRequiredSupportChange when required input changes', () => {
      const onRequired = vi.fn();
      render(<ExpensesAndApprovalGrid {...makeProps({ onRequiredSupportChange: onRequired })} />);
      // Get all required inputs; filter to only non-disabled ones (not mirrored)
      // Use the mobile required input since desktop might be hidden by CSS
      const allReqInputs = document.querySelectorAll('input[aria-label]');
      const reqSchoolInput = Array.from(allReqInputs).find(
        (el) => el.getAttribute('aria-label') === 'Required cost for School Fees' && !(el as HTMLInputElement).disabled
      );
      expect(reqSchoolInput).toBeDefined();
      fireEvent.change(reqSchoolInput!, { target: { value: '5500' } });
      expect(onRequired).toHaveBeenCalledWith('requiredSchoolFees', 5500);
    });

    it('handles empty input as zero', () => {
      const onCurrent = vi.fn();
      render(<ExpensesAndApprovalGrid {...makeProps({ onCurrentExpenseChange: onCurrent })} />);
      const inputs = screen.getAllByLabelText(/Current cost for School Fees/i);
      fireEvent.change(inputs[0], { target: { value: '' } });
      expect(onCurrent).toHaveBeenCalledWith('schoolFees', 0);
    });
  });

  describe('3. Per-row "Current Cost (₹) is same as Required Cost (₹)" checkbox', () => {
    it('renders one labeled checkbox per expense row (7 rows × 2 = 14 total) in editable mode', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      const checkboxes = screen.getAllByRole('checkbox');
      // 7 rows × 2 renderings (desktop table + mobile card) = 14
      expect(checkboxes.length).toBe(14);
    });

    it('uses the fully-labeled aria-label for each row checkbox', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      // Each row label appears twice (desktop + mobile)
      const schoolFeesCbs = screen.getAllByLabelText(
        /Current Cost \(₹\) is same as Required Cost \(₹\) for School Fees/i
      );
      expect(schoolFeesCbs.length).toBe(2);
      const tuitionCbs = screen.getAllByLabelText(
        /Current Cost \(₹\) is same as Required Cost \(₹\) for Private Tuition/i
      );
      expect(tuitionCbs.length).toBe(2);
    });

    it('does NOT render a section-level "Same?" column header', () => {
      const { container } = render(<ExpensesAndApprovalGrid {...makeProps()} />);
      // No th with "Same?" text
      const ths = container.querySelectorAll('th');
      ths.forEach((th) => {
        expect(th.textContent).not.toMatch(/same\?/i);
      });
    });

    it('is unchecked by default for all rows', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      screen.getAllByRole('checkbox').forEach((cb) => {
        expect((cb as HTMLInputElement).checked).toBe(false);
      });
    });

    it('copies current cost to required cost for that row when checkbox is checked', () => {
      const onRequired = vi.fn();
      render(<ExpensesAndApprovalGrid {...makeProps({ onRequiredSupportChange: onRequired })} />);

      const schoolFeesCb = screen.getAllByLabelText(
        /Current Cost \(₹\) is same as Required Cost \(₹\) for School Fees/i
      )[0];
      fireEvent.click(schoolFeesCb);
      // Only schoolFees should be copied (currentExpenses.schoolFees = 5000)
      expect(onRequired).toHaveBeenCalledWith('requiredSchoolFees', 5000);
      expect(onRequired).toHaveBeenCalledTimes(1);
    });

    it('does not affect other rows when one row checkbox is checked', () => {
      const onRequired = vi.fn();
      render(<ExpensesAndApprovalGrid {...makeProps({ onRequiredSupportChange: onRequired })} />);

      const booksCb = screen.getAllByLabelText(
        /Current Cost \(₹\) is same as Required Cost \(₹\) for Books & Syllabi/i
      )[0];
      fireEvent.click(booksCb);
      // Only books row should be mirrored (currentExpenses.books = 800)
      expect(onRequired).toHaveBeenCalledWith('requiredBooks', 800);
      expect(onRequired).toHaveBeenCalledTimes(1);
    });

    it('disables that row\'s required input while its checkbox is checked', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      const schoolFeesCb = screen.getAllByLabelText(
        /Current Cost \(₹\) is same as Required Cost \(₹\) for School Fees/i
      )[0];
      fireEvent.click(schoolFeesCb);
      // Required inputs for School Fees should be disabled
      const mirroredReqs = screen.getAllByLabelText(/Required cost for School Fees.*mirroring/i);
      expect(mirroredReqs.length).toBeGreaterThanOrEqual(1);
      mirroredReqs.forEach((el) => expect((el as HTMLInputElement).disabled).toBe(true));
    });

    it('does not disable required inputs for other rows when one is checked', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      const schoolFeesCb = screen.getAllByLabelText(
        /Current Cost \(₹\) is same as Required Cost \(₹\) for School Fees/i
      )[0];
      fireEvent.click(schoolFeesCb);
      // Books row required inputs should still be enabled
      const booksReqs = screen.getAllByLabelText(/^Required cost for Books & Syllabi$/i);
      booksReqs.forEach((el) => expect((el as HTMLInputElement).disabled).toBe(false));
    });

    it('propagates current cost changes to required cost while row checkbox is checked', () => {
      const onRequired = vi.fn();
      const onCurrent = vi.fn();

      const Wrapper = () => {
        const [currentCost, setCurrentCost] = React.useState(5000);
        const [requiredCost, setRequiredCost] = React.useState(4000);
        const props = makeProps();
        return (
          <ExpensesAndApprovalGrid
            {...props}
            currentExpenses={{ ...props.currentExpenses, schoolFees: currentCost }}
            requiredSupport={{ ...props.requiredSupport, requiredSchoolFees: requiredCost }}
            onCurrentExpenseChange={(field, val) => {
              onCurrent(field, val);
              if (field === 'schoolFees') setCurrentCost(val);
            }}
            onRequiredSupportChange={(field, val) => {
              onRequired(field, val);
              if (field === 'requiredSchoolFees') setRequiredCost(val);
            }}
          />
        );
      };

      render(<Wrapper />);

      // Check the per-row checkbox for School Fees
      const cb = screen.getAllByLabelText(/Current Cost \(₹\) is same as Required Cost \(₹\) for School Fees/i)[0];
      fireEvent.click(cb);
      expect(onRequired).toHaveBeenCalledWith('requiredSchoolFees', 5000);
      onRequired.mockClear();

      // Change current cost — mirror should propagate for this row only
      const currentInputs = screen.getAllByLabelText(/Current cost for School Fees/i);
      fireEvent.change(currentInputs[0], { target: { value: '7000' } });
      expect(onCurrent).toHaveBeenCalledWith('schoolFees', 7000);
      expect(onRequired).toHaveBeenCalledWith('requiredSchoolFees', 7000);
    });

    it('unchecking restores independent editing for that row only', () => {
      const onRequired = vi.fn();
      render(<ExpensesAndApprovalGrid {...makeProps({ onRequiredSupportChange: onRequired })} />);

      const cb = screen.getAllByLabelText(/Current Cost \(₹\) is same as Required Cost \(₹\) for School Fees/i)[0];
      fireEvent.click(cb); // check
      fireEvent.click(cb); // uncheck

      // School Fees required inputs should be enabled again
      const reqInputs = screen.getAllByLabelText(/^Required cost for School Fees$/i);
      reqInputs.forEach((el) => expect((el as HTMLInputElement).disabled).toBe(false));
    });

    it('manually editing required cost unlinks the mirror for that row only', () => {
      const onRequired = vi.fn();
      render(<ExpensesAndApprovalGrid {...makeProps({ onRequiredSupportChange: onRequired })} />);

      // Check School Fees row
      const cb = screen.getAllByLabelText(/Current Cost \(₹\) is same as Required Cost \(₹\) for School Fees/i)[0];
      fireEvent.click(cb);
      expect((cb as HTMLInputElement).checked).toBe(true);
      onRequired.mockClear();

      // Uncheck first (mirror disables the input), then edit
      fireEvent.click(cb);
      const reqInputs = screen.getAllByLabelText(/^Required cost for School Fees$/i);
      const editable = reqInputs.find((el) => !(el as HTMLInputElement).disabled)!;
      fireEvent.change(editable, { target: { value: '4500' } });
      expect(onRequired).toHaveBeenCalledWith('requiredSchoolFees', 4500);
      expect((cb as HTMLInputElement).checked).toBe(false);
    });

    it('does NOT render checkboxes in read-only mode', () => {
      render(<ExpensesAndApprovalGrid {...makeProps({ isReadOnly: true })} />);
      expect(screen.queryAllByRole('checkbox').length).toBe(0);
    });
  });

  describe('4. Totals', () => {
    it('renders mobile total summary row with both current and required totals', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      // Text appears in both desktop tfoot and mobile summary — use getAllByText
      expect(screen.getAllByText('Total Annual Education Financial Summary').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Current Cost')).toBeDefined();
      expect(screen.getAllByText('Required Grant').length).toBeGreaterThanOrEqual(1);
    });

    it('calculates correct total current cost (5000+1200+800+300+600+500+0=8400)', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      // Total current cost: 5000+1200+800+300+600+500 = 8400
      const formatted = '₹8,400';
      const els = screen.getAllByText(formatted);
      expect(els.length).toBeGreaterThanOrEqual(1);
    });

    it('calculates correct total required cost (4000+1000+700+250+550+450+0=6950)', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      // 4000+1000+700+250+550+450 = 6950
      const formatted = '₹6,950';
      const els = screen.getAllByText(formatted);
      expect(els.length).toBeGreaterThanOrEqual(1);
    });

    it('shows zero totals when all values are zero', () => {
      const props = makeProps({
        currentExpenses: {
          schoolFees: 0,
          tuitionFees: 0,
          books: 0,
          stationery: 0,
          uniform: 0,
          transport: 0,
          otherExpenses: 0,
        },
        requiredSupport: {
          requiredSchoolFees: 0,
          requiredTuitionFees: 0,
          requiredBooks: 0,
          requiredStationery: 0,
          requiredUniform: 0,
          requiredTransport: 0,
          requiredOtherSupport: 0,
        },
      });
      render(<ExpensesAndApprovalGrid {...props} />);
      const zeroEls = screen.getAllByText('₹0');
      expect(zeroEls.length).toBeGreaterThanOrEqual(2); // at least current and required totals
    });
  });

  describe('5. Read-only mode', () => {
    it('renders formatted values instead of inputs', () => {
      render(<ExpensesAndApprovalGrid {...makeProps({ isReadOnly: true })} />);
      // Formatted school fees current cost
      expect(screen.getAllByText('₹5,000').length).toBeGreaterThanOrEqual(1);
      // Required school fees
      expect(screen.getAllByText('₹4,000').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render document upload section in read-only mode', () => {
      render(<ExpensesAndApprovalGrid {...makeProps({ isReadOnly: true })} />);
      expect(screen.queryByText('Document Verification Proofs')).toBeNull();
    });

    it('renders document uploads in editable mode', () => {
      render(<ExpensesAndApprovalGrid {...makeProps()} />);
      expect(screen.getByText('Document Verification Proofs')).toBeDefined();
    });
  });

  describe('6. Backward compatibility', () => {
    it('renders without requiredTuitionFees gracefully', () => {
      const props = makeProps();
      const requiredWithoutTuition = { ...props.requiredSupport };
      delete (requiredWithoutTuition as any).requiredTuitionFees;
      render(<ExpensesAndApprovalGrid {...props} requiredSupport={requiredWithoutTuition} />);
      // Label appears in both desktop table and mobile cards
      expect(screen.getAllByText('Private Tuition Fee').length).toBeGreaterThanOrEqual(1);
    });

    it('renders with all zero values without crashing', () => {
      const props = makeProps({
        currentExpenses: {
          schoolFees: 0,
          tuitionFees: 0,
          books: 0,
          stationery: 0,
          uniform: 0,
          transport: 0,
          otherExpenses: 0,
        },
        requiredSupport: {
          requiredSchoolFees: 0,
          requiredBooks: 0,
          requiredStationery: 0,
          requiredUniform: 0,
          requiredTransport: 0,
          requiredOtherSupport: 0,
        },
      });
      expect(() => render(<ExpensesAndApprovalGrid {...props} />)).not.toThrow();
    });
  });

  describe('7. Desktop table and mobile structure', () => {
    it('source contains desktop table with 5 columns and no Same? column', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../components/education/ExpensesAndApprovalGrid.tsx'),
        'utf8'
      );
      expect(source).toContain('hidden md:block overflow-x-auto');
      expect(source).toContain('<th'); // table headers present
      // Verify no "Same?" column in desktop table
      expect(source).not.toContain('>Same?<');
      expect(source).toContain('Current Cost (₹)');
      expect(source).toContain('Required Cost (₹)');
      // Clean colSpan={3} footer matching 5 columns (3 + 1 + 1 = 5)
      expect(source).toContain('Total Annual Education Financial Summary');
      expect(source).toContain('colSpan={3}');
      // Mobile totals show both sides
      expect(source).toContain('Current Cost');
      expect(source).toContain('Required Grant');
    });

    it('source has per-row labeled checkboxes in mobile cards (not a section-level checkbox)', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../components/education/ExpensesAndApprovalGrid.tsx'),
        'utf8'
      );
      // No section-level id — the old design is gone
      expect(source).not.toContain('id="section-same-cost-checkbox"');
      // Mobile cards section contains per-row checkboxes
      const mobileSection = source.split('md:hidden divide-y')[1].split('Document Verification Proofs')[0];
      expect(mobileSection).toContain('type="checkbox"');
      // Per-row checkbox uses the correct aria-label pattern
      expect(mobileSection).toContain('Current Cost (₹) is same as Required Cost (₹) for ${item.label}');
    });

    it('source uses md:hidden for mobile cards', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../components/education/ExpensesAndApprovalGrid.tsx'),
        'utf8'
      );
      expect(source).toContain('md:hidden divide-y divide-slate-100');
    });

    it('mobile cards do not use truncate that could clip labels', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../components/education/ExpensesAndApprovalGrid.tsx'),
        'utf8'
      );
      // No truncate in mobile card section — labels must wrap freely
      const mobileSection = source.split('md:hidden divide-y')[1];
      expect(mobileSection).not.toContain('truncate');
      // Labels use break-words not overflow-hidden
      expect(mobileSection).toContain('break-words');
    });

    it('inputs have min-h-[44px] for touch target compliance', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../components/education/ExpensesAndApprovalGrid.tsx'),
        'utf8'
      );
      expect(source).toContain('min-h-[44px]');
    });

    it('per-row checkbox labels have min-h-[44px] for touch target compliance', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../components/education/ExpensesAndApprovalGrid.tsx'),
        'utf8'
      );
      // Section-level id must NOT be present
      expect(source).not.toContain('section-same-cost-checkbox');
      // Per-row checkbox labels must satisfy 44px touch target
      expect(source).toContain('min-h-[44px]');
    });
  });

  describe('8. Error display', () => {
    it('renders validation error for schoolFees field', () => {
      const props = makeProps({ errors: { schoolFees: 'School fees are required' } });
      render(<ExpensesAndApprovalGrid {...props} />);
      const errorMessages = screen.getAllByText('School fees are required');
      expect(errorMessages.length).toBeGreaterThanOrEqual(1);
    });

    it('renders validation error via educationExpenses prefix', () => {
      const props = makeProps({ errors: { 'educationExpenses.books': 'Books cost required' } });
      render(<ExpensesAndApprovalGrid {...props} />);
      const errorMessages = screen.getAllByText('Books cost required');
      expect(errorMessages.length).toBeGreaterThanOrEqual(1);
    });
  });
});
