import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LivingRiver } from '@/components/landing/LivingRiver';
import { ConnectedCareStory } from '@/components/landing/ConnectedCareStory';
import { NotebookHero } from '@/components/landing/NotebookHero';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, className, 'aria-label': ariaLabel, onClick, ...rest }: any) => (
    <a href={href} className={className} aria-label={ariaLabel} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

describe('Signature Motion & Narrative Components', () => {
  describe('MOMENT B: LivingRiver Component', () => {
    it('renders accessible decorative container with aria-hidden', () => {
      const { container } = render(<LivingRiver />);
      const wrapper = container.querySelector('[aria-hidden="true"]');
      expect(wrapper).toBeDefined();
      expect(wrapper?.tagName.toLowerCase()).toBe('div');
    });

    it('contains SVG with 3 distinct layer paths and a crest line', () => {
      const { container } = render(<LivingRiver />);
      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();
      
      const paths = container.querySelectorAll('path');
      // Should have at least 3 fill layers + 1 stroke crest path
      expect(paths.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('MOMENT C: ConnectedCareStory Component', () => {
    it('renders section landmark and mandatory disclaimer', () => {
      render(<ConnectedCareStory />);
      expect(screen.getByRole('region', { name: /the connection returns/i })).toBeDefined();
      expect(
        screen.getByText(/illustrative demo — no real child data/i)
      ).toBeDefined();
      expect(
        screen.getByText(/transmission never equates to automated case resolution/i)
      ).toBeDefined();
    });

    it('contains all 7 mandated lifecycle story steps in interactive mode', () => {
      render(<ConnectedCareStory />);

      // Verify step titles are all represented in the step selector tablist
      const expectedStepTitles = [
        /needs recorded/i,
        /draft saved on device/i,
        /connection unavailable/i,
        /work remains available/i,
        /connection returns/i,
        /submission acknowledged/i,
        /human review remains pending/i,
      ];

      expectedStepTitles.forEach((titlePattern) => {
        expect(screen.getByRole('tab', { name: titlePattern })).toBeDefined();
      });
    });

    it('supports step-by-step navigation via Next and Previous buttons', () => {
      render(<ConnectedCareStory />);

      // Step 1 active initially
      expect(screen.getByText(/step 1 of 7/i)).toBeDefined();

      // Click Next Step
      const nextBtn = screen.getByRole('button', { name: /next lifecycle step/i });
      fireEvent.click(nextBtn);

      // Step 2 active
      expect(screen.getByText(/step 2 of 7/i)).toBeDefined();
      expect(screen.getByText(/draft committed to local sqlite/i)).toBeDefined();

      // Click Previous Step
      const prevBtn = screen.getByRole('button', { name: /previous lifecycle step/i });
      fireEvent.click(prevBtn);

      // Back to Step 1
      expect(screen.getByText(/step 1 of 7/i)).toBeDefined();
    });
  });

  describe('MOMENT A: NotebookHero Motion Upgrades', () => {
    const defaultProps = {
      canInstall: true,
      onInstallClick: vi.fn(),
      isStandalone: false,
    };

    it('keeps primary CTAs immediately visible and accessible', () => {
      render(<NotebookHero {...defaultProps} />);
      const openInApp = screen.getByRole('link', { name: /open in app/i });
      const installBtn = screen.getByRole('button', { name: /install or download the app/i });

      expect(openInApp).toBeDefined();
      expect(openInApp.getAttribute('href')).toBe('/app');
      expect(installBtn).toBeDefined();
    });

    it('renders the multi-dimensional Care Pathway indicators', () => {
      render(<NotebookHero {...defaultProps} />);
      expect(screen.getByText(/care pathway:/i)).toBeDefined();
      expect(screen.getAllByText(/nutrition/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/schooling/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/home support/i)).toBeDefined();
    });
  });
});
