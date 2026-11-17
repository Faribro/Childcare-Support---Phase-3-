/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CategorySelectionStep } from '@/components/assessment/CategorySelectionStep';
import type { SupportCategory } from '@/lib/assessment/categoryApplicability';

describe('CategorySelectionStep Component', () => {
  it('renders the title, helper text, all 4 checkboxes, Back and Continue buttons', () => {
    const handleContinue = vi.fn();
    const handleBack = vi.fn();

    render(
      <CategorySelectionStep
        selectedCategories={[]}
        onChange={vi.fn()}
        onContinue={handleContinue}
        onBack={handleBack}
      />
    );

    expect(screen.getByText('What support is this assessment for?')).toBeInTheDocument();
    expect(
      screen.getByText("Select all that apply. We'll show only the relevant questions.")
    ).toBeInTheDocument();

    expect(screen.getByRole('checkbox', { name: /Education/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Nutrition/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /HIV-related support/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /All categories/i })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  it('displays validation error when error message is passed', () => {
    render(
      <CategorySelectionStep
        selectedCategories={[]}
        onChange={vi.fn()}
        onContinue={vi.fn()}
        error="Select at least one support category to continue."
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Select at least one support category to continue.');
  });

  it('selects all 3 categories when "All categories" is checked', () => {
    const handleChange = vi.fn();

    render(
      <CategorySelectionStep
        selectedCategories={[]}
        onChange={handleChange}
        onContinue={vi.fn()}
      />
    );

    const allCheckbox = screen.getByRole('checkbox', { name: /All categories/i });
    fireEvent.click(allCheckbox);

    expect(handleChange).toHaveBeenCalledWith(['education', 'nutrition', 'hiv_support']);
  });

  it('clears all 3 categories when "All categories" is unchecked from full selection', () => {
    const handleChange = vi.fn();

    render(
      <CategorySelectionStep
        selectedCategories={['education', 'nutrition', 'hiv_support']}
        onChange={handleChange}
        onContinue={vi.fn()}
      />
    );

    const allCheckbox = screen.getByRole('checkbox', { name: /All categories/i });
    fireEvent.click(allCheckbox);

    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('marks "All categories" as checked when all 3 are selected individually', () => {
    render(
      <CategorySelectionStep
        selectedCategories={['education', 'nutrition', 'hiv_support']}
        onChange={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    const allCheckbox = screen.getByRole('checkbox', { name: /All categories/i }) as HTMLInputElement;
    expect(allCheckbox.checked).toBe(true);
    expect(allCheckbox.indeterminate).toBe(false);
  });

  it('marks "All categories" as indeterminate when only 1 or 2 categories are selected', () => {
    const { rerender } = render(
      <CategorySelectionStep
        selectedCategories={['education']}
        onChange={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    const allCheckbox = screen.getByRole('checkbox', { name: /All categories/i }) as HTMLInputElement;
    expect(allCheckbox.checked).toBe(false);
    expect(allCheckbox.indeterminate).toBe(true);
    expect(allCheckbox.getAttribute('aria-checked')).toBe('mixed');

    rerender(
      <CategorySelectionStep
        selectedCategories={['education', 'nutrition']}
        onChange={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(allCheckbox.checked).toBe(false);
    expect(allCheckbox.indeterminate).toBe(true);
    expect(allCheckbox.getAttribute('aria-checked')).toBe('mixed');
  });

  it('toggles individual categories correctly', () => {
    const handleChange = vi.fn();

    render(
      <CategorySelectionStep
        selectedCategories={['education']}
        onChange={handleChange}
        onContinue={vi.fn()}
      />
    );

    const nutritionCheckbox = screen.getByRole('checkbox', { name: /Nutrition/i });
    fireEvent.click(nutritionCheckbox);

    expect(handleChange).toHaveBeenCalledWith(['education', 'nutrition']);
  });

  it('calls onContinue with current selection when Continue is clicked', () => {
    const handleContinue = vi.fn();

    render(
      <CategorySelectionStep
        selectedCategories={['nutrition']}
        onChange={vi.fn()}
        onContinue={handleContinue}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(handleContinue).toHaveBeenCalledWith(['nutrition']);
  });

  it('calls onBack when Back button is clicked', () => {
    const handleBack = vi.fn();

    render(
      <CategorySelectionStep
        selectedCategories={[]}
        onChange={vi.fn()}
        onContinue={vi.fn()}
        onBack={handleBack}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(handleBack).toHaveBeenCalled();
  });
});
