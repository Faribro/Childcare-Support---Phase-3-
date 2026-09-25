/**
 * landing-page-editorial.test.tsx
 *
 * Automated verification test suite for the Editorial Notebook Landing Page:
 * - Primary / Secondary CTA routing to /app and #how-it-works
 * - PWA standalone auto-launch to /app
 * - PWA install trigger & iOS Add-to-Home-Screen guide modal
 * - Landmark hierarchy (<header>, <main id="main-content">, <h1>, <footer>)
 * - Accessible skip-link to main content
 * - Tabbed assessment preview accessibility (role="tablist", role="tab", aria-selected)
 * - FAQ accordion accessibility (aria-expanded, aria-controls, panel disclosure)
 * - Strict data dignity (zero real beneficiary names or private clinical identifiers)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LandingPage from '@/app/page';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, className, 'aria-label': ariaLabel, ...rest }: any) => (
    <a href={href} className={className} aria-label={ariaLabel} {...rest}>
      {children}
    </a>
  ),
}));

// Mock Next.js router
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
}));

// Mock usePwaInstall hook with customizable defaults
const mockUsePwaInstall = vi.fn();
vi.mock('@/lib/pwa/usePwaInstall', () => ({
  usePwaInstall: () => mockUsePwaInstall(),
}));

describe('Editorial Notebook Landing Page (src/app/page.tsx)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    mockUsePwaInstall.mockReturnValue({
      canInstall: false,
      isStandalone: false,
      isIos: false,
      promptInstall: vi.fn().mockResolvedValue('unsupported'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Semantic Landmarks & Document Hierarchy', () => {
    it('renders accessible skip-link pointing to #main-content', () => {
      render(<LandingPage />);
      const skipLink = screen.getByRole('link', { name: /skip to main content/i });
      expect(skipLink).toBeDefined();
      expect(skipLink.getAttribute('href')).toBe('#main-content');
    });

    it('contains header, main landmark with id="main-content", and footer', () => {
      const { container } = render(<LandingPage />);
      const header = container.querySelector('header');
      const main = container.querySelector('main#main-content');
      const footer = container.querySelector('footer');

      expect(header).toBeDefined();
      expect(main).toBeDefined();
      expect(footer).toBeDefined();
    });

    it('renders primary <h1> heading conveying the whole-child editorial vision', () => {
      render(<LandingPage />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeDefined();
      expect(h1.textContent).toContain('Every child’s story deserves a clearer picture.');
    });
  });

  describe('Primary Navigation & CTAs', () => {
    it('renders "Open Field App" links pointing to /app', () => {
      render(<LandingPage />);
      const openAppLinks = screen.getAllByRole('link', { name: /open field app/i });
      expect(openAppLinks.length).toBeGreaterThanOrEqual(1);

      openAppLinks.forEach((link) => {
        expect(link.getAttribute('href')).toBe('/app');
      });
    });

    it('renders secondary anchor link pointing to #how-it-works', () => {
      render(<LandingPage />);
      const howItWorksLinks = screen.getAllByRole('link', { name: /how it works/i });
      expect(howItWorksLinks.length).toBeGreaterThanOrEqual(1);
      expect(howItWorksLinks[0].getAttribute('href')).toBe('#how-it-works');
    });

    it('auto-redirects to /app when launched in standalone PWA mode', () => {
      // Mock window.matchMedia for standalone display-mode
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(<LandingPage />);
      expect(mockReplace).toHaveBeenCalledWith('/app');

      window.matchMedia = originalMatchMedia;
    });
  });

  describe('PWA Install Interactions', () => {
    it('renders install buttons when canInstall is true', () => {
      mockUsePwaInstall.mockReturnValue({
        canInstall: true,
        isStandalone: false,
        isIos: false,
        promptInstall: vi.fn().mockResolvedValue('accepted'),
      });

      render(<LandingPage />);
      const installButtons = screen.getAllByRole('button', { name: /install pwa/i });
      expect(installButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('opens iOS modal when install is clicked on iOS devices', async () => {
      mockUsePwaInstall.mockReturnValue({
        canInstall: true,
        isStandalone: false,
        isIos: true,
        promptInstall: vi.fn().mockResolvedValue('manual-ios'),
      });

      render(<LandingPage />);
      const installButtons = screen.getAllByRole('button', { name: /install pwa/i });
      fireEvent.click(installButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /install on iphone \/ ipad/i })).toBeDefined();
      });

      // Close modal
      const closeButton = screen.getByRole('button', { name: /got it, close guide/i });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    });
  });

  describe('Interactive Field Preview Tabs', () => {
    it('allows switching preview tabs with accessible attributes', () => {
      render(<LandingPage />);
      const demographicsTab = screen.getByRole('tab', { name: /demographics & enrolment/i });
      const clinicalTab = screen.getByRole('tab', { name: /clinical & anthropometry/i });

      expect(demographicsTab.getAttribute('aria-selected')).toBe('true');
      expect(clinicalTab.getAttribute('aria-selected')).toBe('false');

      // Click clinical tab
      fireEvent.click(clinicalTab);
      expect(clinicalTab.getAttribute('aria-selected')).toBe('true');
      expect(demographicsTab.getAttribute('aria-selected')).toBe('false');

      // Check clinical content is rendered
      expect(screen.getByText(/muac tape measurement/i)).toBeDefined();
    });
  });

  describe('Frontline FAQ Accordion', () => {
    it('toggles FAQ item disclosure on button click with aria-expanded update', () => {
      render(<LandingPage />);
      const firstFaqButton = screen.getByRole('button', {
        name: /can i use this app without internet connectivity or mobile cellular data\?/i,
      });

      expect(firstFaqButton.getAttribute('aria-expanded')).toBe('true');

      // Click to collapse
      fireEvent.click(firstFaqButton);
      expect(firstFaqButton.getAttribute('aria-expanded')).toBe('false');

      // Click to expand again
      fireEvent.click(firstFaqButton);
      expect(firstFaqButton.getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('Data Dignity & Institutional Attribution', () => {
    it('renders Alliance India identity and production version', () => {
      render(<LandingPage />);
      expect(screen.getAllByText(/india hiv\/aids alliance/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/version 3.0.0 \(phase 3 production\)/i)).toBeDefined();
    });

    it('contains no real patient identifiers or sensitive clinical record IDs', () => {
      const { container } = render(<LandingPage />);
      const pageText = container.textContent || '';

      // Check for sensitive or real patient identifiers
      expect(pageText).not.toMatch(/ART-\d{4}/);
      expect(pageText).not.toMatch(/HIV\+/);
      expect(pageText).not.toMatch(/CD4 count/);
      expect(pageText).toContain('SYNTHETIC SAMPLE RECORD');
    });
  });
});
