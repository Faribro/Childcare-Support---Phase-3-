import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ExperiencePreview } from '@/components/landing/ExperiencePreview';

describe('ExperiencePreview Component — Dignified Field Intake', () => {
  it('1. Renders the exact section heading, privacy reassurance, and introductory copy', () => {
    render(<ExperiencePreview />);
    
    // Heading
    expect(
      screen.getByRole('heading', { level: 2, name: /A simple, respectful way to request support for a child\./i })
    ).toBeDefined();

    // Privacy reassurance
    expect(
      screen.getByText(/All examples use privacy-safe sample information\. No real child or family details are shown\./i)
    ).toBeDefined();

    // Intro explanation
    expect(
      screen.getByText(/See how the field worker completes the support form, saves it safely and shares it with the support team\./i)
    ).toBeDefined();

    // How the form works
    expect(screen.getByRole('heading', { level: 3, name: /How the form works/i })).toBeDefined();
    expect(
      screen.getByText(/The field worker completes the form in clear steps\. They can save their work and return later if needed\./i)
    ).toBeDefined();
  });

  it('2. Renders all 10 step tabs with their exact titles under All Categories', () => {
    render(<ExperiencePreview />);

    const expectedTitles = [
      'Choose the support needed',
      'Take consent',
      'Enter child and caregiver details',
      'Add family and income details',
      'Add health information',
      'Add education details',
      'Add nutrition details',
      'Add HIV-related details',
      'Add bank details for support',
      'Review and submit',
    ];

    expectedTitles.forEach((title) => {
      expect(screen.getByRole('tab', { name: new RegExp(title, 'i') })).toBeDefined();
    });
  });

  it('3. Category filtering choices are rendered and interactive', () => {
    render(<ExperiencePreview />);

    expect(screen.getByRole('button', { name: /All categories/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Education support/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Nutrition support/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /HIV-related support/i })).toBeDefined();
  });

  it('4. HIV-only selection hides banking, family/income, education, and nutrition-only sections', () => {
    render(<ExperiencePreview />);

    const hivButton = screen.getByRole('button', { name: /HIV-related support/i });
    fireEvent.click(hivButton);

    // Visible steps in HIV support
    expect(screen.getByRole('tab', { name: /Choose the support needed/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Take consent/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Enter child and caregiver details/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add health information/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add HIV-related details/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Review and submit/i })).toBeDefined();

    // Non-applicable steps must not be in active tab list
    expect(screen.queryByRole('tab', { name: /Add family and income details/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Add education details/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Add nutrition details/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Add bank details for support/i })).toBeNull();
  });

  it('5. Education selection shows education, family/income, and banking sections while hiding nutrition and HIV-only sections', () => {
    render(<ExperiencePreview />);

    const eduButton = screen.getByRole('button', { name: /Education support/i });
    fireEvent.click(eduButton);

    // Visible in Education
    expect(screen.getByRole('tab', { name: /Choose the support needed/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Take consent/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Enter child and caregiver details/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add family and income details/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add education details/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add bank details for support/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Review and submit/i })).toBeDefined();

    // Hidden in Education only
    expect(screen.queryByRole('tab', { name: /Add health information/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Add nutrition details/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Add HIV-related details/i })).toBeNull();
  });

  it('6. Nutrition selection shows nutrition, health, family/income, and banking sections while hiding education and HIV-only sections', () => {
    render(<ExperiencePreview />);

    const nutButton = screen.getByRole('button', { name: /Nutrition support/i });
    fireEvent.click(nutButton);

    // Visible in Nutrition
    expect(screen.getByRole('tab', { name: /Choose the support needed/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Take consent/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Enter child and caregiver details/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add family and income details/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add health information/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add nutrition details/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Add bank details for support/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Review and submit/i })).toBeDefined();

    // Hidden in Nutrition only
    expect(screen.queryByRole('tab', { name: /Add education details/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Add HIV-related details/i })).toBeNull();
  });

  it('7. All Categories shows all 10 applicable sections', () => {
    render(<ExperiencePreview />);

    const allButton = screen.getByRole('button', { name: /All categories/i });
    fireEvent.click(allButton);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(10);
  });

  it('8. The three lifecycle cards render with their exact headings and core field guidance', () => {
    render(<ExperiencePreview />);

    // 1. What happens after submission
    expect(screen.getByRole('heading', { level: 3, name: /What happens after submission/i })).toBeDefined();
    expect(screen.getByText(/Once submitted, the form is saved securely and shared with the support team for review\./i)).toBeDefined();
    expect(screen.getByText(/The support team checks the information and decides the next steps\./i)).toBeDefined();
    expect(screen.getByText(/If support is approved, the field worker may be asked to add bank documents later\./i)).toBeDefined();

    // 2. If the field worker needs to stop
    expect(screen.getByRole('heading', { level: 3, name: /If the field worker needs to stop/i })).toBeDefined();
    expect(screen.getByText(/The field worker can save the form as a draft\./i)).toBeDefined();
    expect(screen.getByText(/They can return later and continue from where they stopped\./i)).toBeDefined();
    expect(screen.getByText(/If they try to sign out while work has not yet been sent, the app asks them to check and send it first\./i)).toBeDefined();

    // 3. If the field worker logs out
    expect(screen.getByRole('heading', { level: 3, name: /If the field worker logs out/i })).toBeDefined();
    expect(
      screen.getByText(/The field worker can sign back in using their verified email address and a one-time code sent to their email\./i)
    ).toBeDefined();
    expect(screen.getByText(/After signing back in, they can see their previously submitted forms\./i)).toBeDefined();
  });

  it('9. Keyboard navigation and Previous/Next buttons advance through steps', () => {
    render(<ExperiencePreview />);

    // Initially Step 1 is active
    expect(screen.getByRole('tab', { name: /Choose the support needed/i, selected: true })).toBeDefined();

    // Click Next
    const nextButton = screen.getByRole('button', { name: /Next step/i });
    fireEvent.click(nextButton);

    // Now Step 2 is active
    expect(screen.getByRole('tab', { name: /Take consent/i, selected: true })).toBeDefined();

    // Arrow Left key
    const activeTab = screen.getByRole('tab', { name: /Take consent/i, selected: true });
    fireEvent.keyDown(activeTab, { key: 'ArrowLeft' });

    // Step 1 active again
    expect(screen.getByRole('tab', { name: /Choose the support needed/i, selected: true })).toBeDefined();
  });

  it('10. The preview does not contain technical jargon or real sensitive data', () => {
    const { container } = render(<ExperiencePreview />);
    const text = container.textContent || '';

    // Forbidden jargon
    const forbidden = [
      'API',
      'Firestore',
      'IndexedDB',
      'cryptographic payload verification',
      'schema',
      'authentication token',
      'passwordless',
      'passwordless email OTP',
      'sync queue',
      'case file',
      'case filing',
    ];

    forbidden.forEach((term) => {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      expect(regex.test(text)).toBe(false);
    });

    // Check that organisation credentials in Step 10 are non-editable
    const step10Tab = screen.getByRole('tab', { name: /Review and submit/i });
    fireEvent.click(step10Tab);

    // Profile auto-attached reassurance
    expect(
      screen.getAllByText(/automatically taken from the field worker’s verified profile/i).length
    ).toBeGreaterThan(0);

    // Ensure no input fields are editable inside preview
    expect(container.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])').length).toBe(0);
  });
});
