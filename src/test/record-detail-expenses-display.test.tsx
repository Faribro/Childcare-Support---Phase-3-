/**
 * record-detail-expenses-display.test.tsx
 *
 * Regression tests for Issue #42:
 * "Section 8 Education & Expenses fields show Rs0 / dash and attachments are
 * missing in View/Edit modes for submitted records."
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExpensesAndApprovalGrid } from '@/components/education/ExpensesAndApprovalGrid';

vi.mock('@/components/ui/PhotoUpload', () => ({
  PhotoUpload: ({ id, label }: { id: string; label: string }) => (
    React.createElement('div', { 'data-testid': `photo-upload-${id}`, 'aria-label': label })
  ),
}));

const noop = () => {};

const baseExpenses = {
  schoolFees: 1500,
  tuitionFees: 600,
  books: 400,
  stationery: 200,
  uniform: 800,
  transport: 300,
  otherExpenses: 0,
};

const baseSupport = {
  requiredSchoolFees: 1500,
  requiredBooks: 400,
  requiredStationery: 200,
  requiredUniform: 800,
  requiredTransport: 300,
  requiredOtherSupport: 0,
};

describe('Issue #42 - ExpensesAndApprovalGrid read-only attachment display', () => {
  it('shows "View Fee Receipt" link when feeReceiptPhotoUrl is populated', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: true,
        currentExpenses: { ...baseExpenses, feeReceiptPhotoUrl: 'https://drive.google.com/file/d/abc123', marksheetPhotoUrl: undefined },
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    const link = screen.getByRole('link', { name: /open school fee receipt document/i });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('https://drive.google.com/file/d/abc123');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows "View Marksheet" link when marksheetPhotoUrl is populated', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: true,
        currentExpenses: { ...baseExpenses, feeReceiptPhotoUrl: undefined, marksheetPhotoUrl: 'https://drive.google.com/file/d/def456' },
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    const link = screen.getByRole('link', { name: /open previous year marksheet document/i });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('https://drive.google.com/file/d/def456');
  });

  it('shows "Not uploaded" for missing document when one document is uploaded', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: true,
        currentExpenses: { ...baseExpenses, feeReceiptPhotoUrl: 'https://example.com/receipt.jpg', marksheetPhotoUrl: undefined },
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    const notUploaded = screen.getByText('Not uploaded');
    expect(notUploaded).toBeDefined();
    expect(screen.getByRole('link', { name: /open school fee receipt document/i })).toBeDefined();
  });

  it('does not render document section when neither documents nor remarks exist in read-only mode', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: true,
        currentExpenses: { ...baseExpenses, feeReceiptPhotoUrl: undefined, marksheetPhotoUrl: undefined, remarks: '' },
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    expect(screen.queryByText('Document Verification Proofs')).toBeNull();
  });

  it('renders remarks text in read-only mode', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: true,
        currentExpenses: { ...baseExpenses, remarks: 'Marksheet pending from school office' },
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    expect(screen.getByText('Marksheet pending from school office')).toBeDefined();
  });

  it('does NOT render remarks section when remarks is undefined', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: true,
        currentExpenses: { ...baseExpenses, remarks: undefined },
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    expect(screen.queryByText('Remarks')).toBeNull();
  });
});

describe('Issue #42 - correct expense value display', () => {
  it('does NOT show fabricated non-zero fallback amounts for zero-fee records', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: true,
        currentExpenses: { schoolFees: 0, tuitionFees: 0, books: 0, stationery: 0, uniform: 0, transport: 0, otherExpenses: 0 },
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    expect(screen.queryByText('1,200')).toBeNull();
    expect(screen.queryByText('600')).toBeNull();
    expect(screen.queryByText('800')).toBeNull();
  });
});

describe('Issue #42 - PhotoUpload write-only constraint', () => {
  it('does NOT render PhotoUpload inputs in read-only mode', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: true,
        currentExpenses: baseExpenses,
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    expect(screen.queryByTestId('photo-upload-expenses-feeReceiptPhotoUrl')).toBeNull();
    expect(screen.queryByTestId('photo-upload-expenses-marksheetPhotoUrl')).toBeNull();
  });

  it('DOES render PhotoUpload inputs in write (edit) mode', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: false,
        currentExpenses: baseExpenses,
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    expect(screen.getByTestId('photo-upload-expenses-feeReceiptPhotoUrl')).toBeDefined();
    expect(screen.getByTestId('photo-upload-expenses-marksheetPhotoUrl')).toBeDefined();
  });

  it('does NOT render attachment links in write mode', () => {
    render(
      React.createElement(ExpensesAndApprovalGrid, {
        isReadOnly: false,
        currentExpenses: { ...baseExpenses, feeReceiptPhotoUrl: 'https://example.com/receipt.jpg' },
        requiredSupport: baseSupport,
        onCurrentExpenseChange: noop,
        onRequiredSupportChange: noop,
      })
    );
    expect(screen.queryByRole('link', { name: /open school fee receipt document/i })).toBeNull();
  });
});
