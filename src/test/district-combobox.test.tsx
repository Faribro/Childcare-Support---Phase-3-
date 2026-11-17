/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DistrictCombobox } from '@/components/forms/DistrictCombobox';

describe('DistrictCombobox Component', () => {
  it('renders disabled with placeholder when no state is selected', () => {
    render(
      <DistrictCombobox
        selectedState=""
        value=""
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Select state first...');
  });

  it('renders enabled with districts when a state is selected', () => {
    render(
      <DistrictCombobox
        selectedState="Maharashtra"
        value=""
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox');
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Search or select district...');
  });

  it('filters districts based on search input', () => {
    render(
      <DistrictCombobox
        selectedState="Maharashtra"
        value=""
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Pu' } });

    expect(screen.getByRole('option', { name: /Pune/i })).toBeInTheDocument();
  });

  it('always includes the "+ Other / District not listed" option', () => {
    render(
      <DistrictCombobox
        selectedState="Maharashtra"
        value=""
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    expect(screen.getByRole('option', { name: /\+ Other \/ District not listed/i })).toBeInTheDocument();
  });

  it('reveals custom text input when "+ Other" is selected', () => {
    const handleChange = vi.fn();
    render(
      <DistrictCombobox
        selectedState="Maharashtra"
        value=""
        onChange={handleChange}
      />
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    const otherOption = screen.getByRole('option', { name: /\+ Other \/ District not listed/i });
    fireEvent.click(otherOption);

    // Custom input should now be visible
    const customInput = screen.getByPlaceholderText(/Enter district name as per official records/i);
    expect(customInput).toBeInTheDocument();

    fireEvent.change(customInput, { target: { value: 'New Custom District' } });
    expect(handleChange).toHaveBeenCalledWith('New Custom District');
  });

  it('resets selection and notifies user when selectedState changes', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <DistrictCombobox
        selectedState="Maharashtra"
        value="Pune"
        onChange={handleChange}
      />
    );

    // Change state to Karnataka
    rerender(
      <DistrictCombobox
        selectedState="Karnataka"
        value="Pune"
        onChange={handleChange}
      />
    );

    // onChange should have been called with empty string to reset
    expect(handleChange).toHaveBeenCalledWith('');

    // Notification banner should be shown
    expect(screen.getByText(/District selection reset because state changed/i)).toBeInTheDocument();
  });
});
