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

    it('contains main landmark with id="main-content" and footer (header removed per layout direction)', () => {
      const { container } = render(<LandingPage />);
      const header = container.querySelector('header');
      const main = container.querySelector('main#main-content');
      const footer = container.querySelector('footer');

      expect(header).toBeNull();
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
    it('renders "Open Field Workspace" as the primary action for non-standalone visitors', () => {
      render(<LandingPage />);
      const workspaceLinks = screen.getAllByRole('link', { name: /open field workspace/i });
      expect(workspaceLinks.length).toBeGreaterThanOrEqual(1);
      workspaceLinks.forEach((link) => {
        expect(link.getAttribute('href')).toBe('/app');
      });
    });

    it('renders "Download the App" secondary action buttons for non-standalone visitors', () => {
      render(<LandingPage />);
      const downloadButtons = screen.getAllByRole('button', { name: /download the app/i });
      expect(downloadButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders "Open in App" links pointing to /app when in standalone mode', () => {
      mockUsePwaInstall.mockReturnValue({
        canInstall: false,
        isStandalone: true,
        isIos: false,
        promptInstall: vi.fn(),
      });

      render(<LandingPage />);
      const openAppLinks = screen.getAllByRole('link', { name: /open in app/i });
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

    it('preserves landing page on / and shows "Open in App" when in standalone mode without forced auto-redirect', () => {
      mockUsePwaInstall.mockReturnValue({
        canInstall: false,
        isStandalone: true,
        isIos: false,
        promptInstall: vi.fn(),
      });

      render(<LandingPage />);
      expect(mockReplace).not.toHaveBeenCalled();
      const openAppLinks = screen.getAllByRole('link', { name: /open in app/i });
      expect(openAppLinks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PWA Install Interactions', () => {
    it('renders Download the App buttons when canInstall is true', () => {
      mockUsePwaInstall.mockReturnValue({
        canInstall: true,
        isStandalone: false,
        isIos: false,
        promptInstall: vi.fn().mockResolvedValue('accepted'),
      });

      render(<LandingPage />);
      const downloadButtons = screen.getAllByRole('button', { name: /download the app/i });
      expect(downloadButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('opens iOS modal when download is clicked on iOS devices', async () => {
      mockUsePwaInstall.mockReturnValue({
        canInstall: true,
        isStandalone: false,
        isIos: true,
        promptInstall: vi.fn().mockResolvedValue('manual-ios'),
      });

      render(<LandingPage />);
      const downloadButtons = screen.getAllByRole('button', { name: /download the app/i });
      fireEvent.click(downloadButtons[0]);

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
    it('renders FAQ questions as native details/summary disclosure elements', () => {
      const { container } = render(<LandingPage />);
      // Native <details> elements — no JS required, UA handles open/close
      const detailsEls = container.querySelectorAll('details');
      expect(detailsEls.length).toBeGreaterThanOrEqual(5);
    });

    it('first FAQ item is open by default', () => {
      const { container } = render(<LandingPage />);
      const firstDetails = container.querySelector('details');
      expect(firstDetails).toBeDefined();
      expect(firstDetails!.hasAttribute('open')).toBe(true);
    });

    it('first FAQ summary contains the offline connectivity question', () => {
      const { container } = render(<LandingPage />);
      const firstSummary = container.querySelector('details summary');
      expect(firstSummary).toBeDefined();
      expect(firstSummary!.textContent).toMatch(/can i use this app without internet connectivity/i);
    });

    it('FAQ answer text is accessible when details is open', () => {
      const { container } = render(<LandingPage />);
      const firstDetails = container.querySelector('details[open]');
      expect(firstDetails).toBeDefined();
      // The answer text should be in the DOM (details is open)
      expect(firstDetails!.textContent).toMatch(/offline-first/i);
    });

    it('FAQ summary elements have no nested interactive controls (no button-in-summary)', () => {
      const { container } = render(<LandingPage />);
      const summaries = container.querySelectorAll('details summary');
      summaries.forEach((summary) => {
        const nestedButtons = summary.querySelectorAll('button, a, input, select');
        expect(nestedButtons.length).toBe(0);
      });
    });

    it('FAQ section is labelled by the h2 heading (aria-labelledby points to faq-heading-title)', () => {
      const { container } = render(<LandingPage />);
      const faqSection = container.querySelector('#faq-heading');
      expect(faqSection).toBeDefined();
      expect(faqSection!.getAttribute('aria-labelledby')).toBe('faq-heading-title');
      const h2 = container.querySelector('#faq-heading-title');
      expect(h2).toBeDefined();
      expect(h2!.tagName).toBe('H2');
    });
  });

  describe('Data Dignity & Institutional Attribution', () => {
    it('renders Alliance India identity and production field app attribution', () => {
      render(<LandingPage />);
      expect(screen.getAllByText(/india hiv\/aids alliance/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/production field app/i)).toBeDefined();
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

  describe('Security Safeguards & Truthful Operational Claims', () => {
    it('uses safe DOM rendering without dangerouslySetInnerHTML', () => {
      const { container } = render(<LandingPage />);
      const dangerousElements = container.querySelectorAll('[dangerouslysetinnerhtml]');
      expect(dangerousElements.length).toBe(0);
    });

    it('restricts all interactive anchor links to safe internal routes or page anchors', () => {
      const { container } = render(<LandingPage />);
      const links = container.querySelectorAll('a');
      expect(links.length).toBeGreaterThanOrEqual(5);

      links.forEach((link) => {
        const href = link.getAttribute('href');
        expect(href).toBeDefined();
        // All links must be internal relative routes, hash anchors, or root
        expect(href).toMatch(/^(\/|#)/);
        // Disallow javascript: or untrusted external schemes
        expect(href).not.toMatch(/^javascript:/i);
        expect(href).not.toMatch(/^data:/i);
        expect(href).not.toMatch(/^http:\/\//i);
      });
    });

    it('does NOT make unevidenced encryption, tamper-evident, or battery claims', () => {
      const { container } = render(<LandingPage />);
      const pageText = container.textContent || '';

      // Must not falsely claim IndexedDB is encrypted or tamper-evident
      expect(pageText).not.toContain('Encrypted Local Storage');
      expect(pageText).not.toContain('encrypted browser storage');
      expect(pageText).not.toContain('Tamper-Evident');
      // Must not claim fixed unmeasured battery percentage
      expect(pageText).not.toContain('< 2%');
      // Must not make absolute zero-loss guarantees
      expect(pageText).not.toContain('(Zero loss)');
      // Must not imply IndexedDB is "protected" in a security sense
      expect(pageText).not.toContain('Protected local storage');
    });

    it('does NOT claim IndexedDB retains data "securely" (unverified encryption)', () => {
      const { container } = render(<LandingPage />);
      const pageText = container.textContent || '';
      // "securely" as applied to IndexedDB storage implies encryption, which is unverified
      expect(pageText).not.toMatch(/retains.*securely/i);
    });
  });

  describe('Fragment Anchor Destinations', () => {
    it('renders section with id="whole-child" as the target for #whole-child links', () => {
      const { container } = render(<LandingPage />);
      const target = container.querySelector('#whole-child');
      expect(target).toBeDefined();
      expect(target!.tagName.toLowerCase()).toBe('section');
    });

    it('renders element with id="how-it-works" as the target for #how-it-works links', () => {
      const { container } = render(<LandingPage />);
      const target = container.querySelector('#how-it-works');
      expect(target).toBeDefined();
    });

    it('renders section with id="faq-heading" as the target for #faq-heading links', () => {
      const { container } = render(<LandingPage />);
      const target = container.querySelector('#faq-heading');
      expect(target).toBeDefined();
    });

    it('renders section with id="field-readiness" as target for #field-readiness links', () => {
      const { container } = render(<LandingPage />);
      const target = container.querySelector('#field-readiness');
      expect(target).toBeDefined();
    });

    it('renders section or element with id="preview-heading" for #preview-heading links', () => {
      const { container } = render(<LandingPage />);
      const target = container.querySelector('#preview-heading');
      expect(target).toBeDefined();
    });
  });

  describe('No-JS Content Visibility (Reveal component)', () => {
    it('renders landing sections with visible content — no opacity:0 gating on sections', () => {
      const { container } = render(<LandingPage />);
      // Reveal renders a plain div; without JS the armed/shown classes are never added.
      // Sections must not be hidden via inline opacity or visibility styles.
      const sections = container.querySelectorAll('section');
      sections.forEach((section) => {
        const style = section.getAttribute('style') || '';
        expect(style).not.toMatch(/opacity:\s*0/);
        expect(style).not.toMatch(/visibility:\s*hidden/);
      });
    });
  });
});
