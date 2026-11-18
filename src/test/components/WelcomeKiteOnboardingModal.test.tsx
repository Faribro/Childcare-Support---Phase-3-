import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WelcomeKiteOnboardingModal } from '@/components/auth/WelcomeKiteOnboardingModal';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('WelcomeKiteOnboardingModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock fetch for /api/auth/field-user/ticket
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/field-user/ticket') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ hasTicket: false }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  });

  it('1. does not render when isOpen is false', () => {
    const { container } = render(
      <WelcomeKiteOnboardingModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('2. renders dialog, title, and initial direct onboarding step when isOpen is true', async () => {
    render(<WelcomeKiteOnboardingModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Field Caseworker Onboarding')).toBeDefined();
    expect(screen.getByText('Welcome to Child Care Support')).toBeDefined();
    expect(screen.getByText('Complete Field Profile')).toBeDefined();
  });

  it('3. calls onClose when Escape key is pressed', async () => {
    const handleClose = vi.fn();
    render(<WelcomeKiteOnboardingModal isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('4. displays profile completion form when initialTicketData is supplied', async () => {
    render(
      <WelcomeKiteOnboardingModal
        isOpen={true}
        onClose={vi.fn()}
        initialTicketData={{
          googleEmail: 'caseworker@gmail.com',
          firstName: 'Kavita',
          lastName: '',
        }}
      />
    );

    expect(screen.getByText('Complete Field Profile')).toBeDefined();
    expect(screen.getByText('caseworker@gmail.com')).toBeDefined();
    expect(screen.getByDisplayValue('Kavita')).toBeDefined();

    // Check presence of state and district inputs
    expect(screen.getByLabelText(/State \/ UT/i)).toBeDefined();
    expect(screen.getByLabelText(/District/i)).toBeDefined();
    expect(screen.getByLabelText(/State Sub-Recipient/i)).toBeDefined();
    expect(screen.getByLabelText(/Sub-Sub-Recipient/i)).toBeDefined();
    expect(screen.getByLabelText(/State-Team Invitation Code/i)).toBeDefined();
  });

  it('5. validates required fields on profile submit', async () => {
    render(
      <WelcomeKiteOnboardingModal
        isOpen={true}
        onClose={vi.fn()}
        initialTicketData={{
          googleEmail: 'caseworker@gmail.com',
          firstName: '',
          lastName: '',
        }}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Complete Registration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Please enter your first name/i)).toBeDefined();
    });
  });

  it('6. validates required SR Name on profile submit', async () => {
    render(
      <WelcomeKiteOnboardingModal
        isOpen={true}
        onClose={vi.fn()}
        initialTicketData={{
          googleEmail: 'caseworker@gmail.com',
          firstName: 'Kavita',
          lastName: 'Sharma',
        }}
      />
    );

    // Enter district via combobox
    const districtInput = screen.getByPlaceholderText(/Search or select district/i);
    fireEvent.focus(districtInput);
    fireEvent.click(screen.getByRole('option', { name: /Pune/i }));

    // Clear SR Name input if any
    const srInput = screen.getByLabelText(/State Sub-Recipient/i);
    fireEvent.change(srInput, { target: { value: '' } });

    const submitBtn = screen.getByRole('button', { name: /Complete Registration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Please enter or select your State Sub-Recipient \(SR\) Name/i)).toBeDefined();
    });
  });

  it('7. saves SR and SSR names to localStorage on successful profile completion', async () => {
    const mockOnSuccess = vi.fn();
    const mockOnClose = vi.fn();

    // Mock successful onboarding API
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === '/api/auth/field-user/complete-onboarding') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'success',
              profile: {
                id: 'fld_123',
                name: 'Kavita Sharma',
                srName: 'Alliance India Maharashtra SR',
                ssrName: 'Pune Care Center',
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hasTicket: false }),
      });
    });

    render(
      <WelcomeKiteOnboardingModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
        initialTicketData={{
          googleEmail: 'caseworker@gmail.com',
          firstName: 'Kavita',
          lastName: 'Sharma',
        }}
      />
    );

    // Select district via combobox
    const districtInput = screen.getByPlaceholderText(/Search or select district/i);
    fireEvent.focus(districtInput);
    fireEvent.click(screen.getByRole('option', { name: /Pune/i }));

    fireEvent.change(screen.getByLabelText(/State Sub-Recipient/i), {
      target: { value: 'Alliance India Maharashtra SR' },
    });
    fireEvent.change(screen.getByLabelText(/Sub-Sub-Recipient/i), {
      target: { value: 'Pune Care Center' },
    });
    fireEvent.change(screen.getByLabelText(/State-Team Invitation Code/i), {
      target: { value: 'ALN-MH-TEST-1234' },
    });

    const submitBtn = screen.getByRole('button', { name: /Complete Registration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const storedSr = JSON.parse(localStorage.getItem('field_user_sr') || '{}');
      expect(storedSr.srName).toBe('Alliance India Maharashtra SR');
      expect(storedSr.ssrName).toBe('Pune Care Center');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('8. validates mobile number format and saves mobileNumber on profile completion', async () => {
    const mockOnSuccess = vi.fn();
    const mockOnClose = vi.fn();

    (global.fetch as any).mockImplementation((url: string) => {
      if (url === '/api/auth/field-user/complete-onboarding') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'success',
              profile: {
                id: 'fld_456',
                name: 'Kavita Sharma',
                mobileNumber: '+919876543210',
                srName: 'Alliance India Maharashtra SR',
                ssrName: 'Pune Care Center',
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hasTicket: false }),
      });
    });

    render(
      <WelcomeKiteOnboardingModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
        initialTicketData={{
          firstName: 'Kavita',
          lastName: 'Sharma',
        }}
      />
    );

    // Select district
    const districtInput = screen.getByPlaceholderText(/Search or select district/i);
    fireEvent.focus(districtInput);
    fireEvent.click(screen.getByRole('option', { name: /Pune/i }));

    fireEvent.change(screen.getByLabelText(/State Sub-Recipient/i), {
      target: { value: 'Alliance India Maharashtra SR' },
    });
    fireEvent.change(screen.getByLabelText(/State-Team Invitation Code/i), {
      target: { value: 'ALN-MH-TEST-1234' },
    });

    // Enter invalid mobile number
    const mobileInput = screen.getByLabelText(/Mobile Number/i);
    fireEvent.change(mobileInput, { target: { value: '12345' } });

    const submitBtn = screen.getByRole('button', { name: /Complete Registration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Please enter a valid 10-digit Indian mobile number/i)).toBeDefined();
    });

    // Fix to valid mobile number
    fireEvent.change(mobileInput, { target: { value: '9876543210' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const storedProfile = JSON.parse(localStorage.getItem('field_user_profile') || '{}');
      expect(storedProfile.mobileNumber).toBeUndefined();
      expect(storedProfile.maskedMobile).toBe('+91 ******3210');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
