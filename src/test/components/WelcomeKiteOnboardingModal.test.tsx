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

  it('2. renders dialog, title, and initial Google onboarding step when isOpen is true', async () => {
    render(<WelcomeKiteOnboardingModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Field Caseworker Onboarding')).toBeDefined();
    expect(screen.getByText(/Ready to begin a new survey\?/i)).toBeDefined();
    expect(screen.getByText('Continue with Google')).toBeDefined();
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
});
