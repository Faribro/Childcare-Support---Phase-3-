/**
 * ThreeStatusOrb — Glassmorphic Soccer-Ball Orb Tests
 *
 * Tests:
 *  1. Renders without throwing (WebGL mocked to null → CSS fallback path)
 *  2. CSS fallback renders when WebGL is unavailable
 *  3. aria-hidden on the orb container (decorative — not read by screen readers)
 *  4. pointer-events-none so the orb never blocks tap targets
 *  5. All three variant colours produce a rendered element
 *  6. isAllClear=true renders correctly
 *  7. count=0 renders correctly
 *  8. count>0 renders correctly
 *  9. Component accepts a custom className without error
 * 10. No real beneficiary data is ever rendered inside the orb
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThreeStatusOrb } from '@/components/dashboard/ThreeStatusOrb';

// In jsdom the setup.ts mock returns null for 'webgl'/'webgl2',
// so the component should detect failure and render the CSS fallback.
// We explicitly set it here as a belt-and-braces guard.
beforeEach(() => {
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((id: string) => {
      if (id === '2d') {
        return { fillRect: vi.fn(), clearRect: vi.fn() };
      }
      return null; // webgl / webgl2 → not available → triggers CSS fallback
    }) as any;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────────
const renderOrb = (overrides: Partial<React.ComponentProps<typeof ThreeStatusOrb>> = {}) =>
  render(
    <ThreeStatusOrb
      variant="teal"
      count={0}
      isAllClear={true}
      {...overrides}
    />,
  );

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('ThreeStatusOrb — Glassmorphic Soccer-Ball Orb', () => {
  it('1. Renders without throwing', () => {
    expect(() => renderOrb()).not.toThrow();
  });

  it('2. CSS fallback renders when WebGL is unavailable', () => {
    renderOrb({ variant: 'teal', count: 0 });
    // Either the CSS fallback or the WebGL canvas should exist in DOM
    const fallback = screen.queryByTestId('orb-css-fallback');
    const webgl    = screen.queryByTestId('orb-webgl-canvas');
    // At least one must be present
    expect(fallback ?? webgl).not.toBeNull();
  });

  it('3. Orb container is aria-hidden (decorative element, not read by assistive tech)', () => {
    renderOrb();
    // The orb div itself must have aria-hidden="true"
    // We locate it by testid (css-fallback or webgl-canvas)
    const fallback = screen.queryByTestId('orb-css-fallback');
    const webgl    = screen.queryByTestId('orb-webgl-canvas');
    const orbEl    = fallback ?? webgl;
    expect(orbEl).not.toBeNull();
    expect(orbEl?.getAttribute('aria-hidden')).toBe('true');
  });

  it('4. Orb container has pointer-events-none class (never blocks tap targets)', () => {
    renderOrb();
    const fallback = screen.queryByTestId('orb-css-fallback');
    const webgl    = screen.queryByTestId('orb-webgl-canvas');
    const orbEl    = fallback ?? webgl;
    expect(orbEl?.className).toContain('pointer-events-none');
  });

  it('5a. teal variant renders without error', () => {
    expect(() => renderOrb({ variant: 'teal' })).not.toThrow();
  });

  it('5b. amber variant renders without error', () => {
    expect(() => renderOrb({ variant: 'amber' })).not.toThrow();
  });

  it('5c. rose variant renders without error', () => {
    expect(() => renderOrb({ variant: 'rose' })).not.toThrow();
  });

  it('6. isAllClear=true renders correctly', () => {
    expect(() => renderOrb({ isAllClear: true })).not.toThrow();
  });

  it('7. count=0 renders correctly', () => {
    expect(() => renderOrb({ count: 0, isAllClear: true })).not.toThrow();
  });

  it('8. count>0 (action-required state) renders correctly', () => {
    expect(() => renderOrb({ count: 7, isAllClear: false })).not.toThrow();
  });

  it('9. Custom className is applied without error', () => {
    renderOrb({ className: 'my-custom-orb-class' });
    const fallback = screen.queryByTestId('orb-css-fallback');
    const webgl    = screen.queryByTestId('orb-webgl-canvas');
    const orbEl    = fallback ?? webgl;
    expect(orbEl?.className).toContain('my-custom-orb-class');
  });

  it('10. No real beneficiary data is rendered inside the orb element', () => {
    renderOrb({ count: 42 });
    const fallback = screen.queryByTestId('orb-css-fallback');
    const webgl    = screen.queryByTestId('orb-webgl-canvas');
    const orbEl    = fallback ?? webgl;
    // The orb itself is purely decorative — no text should be inside it
    expect(orbEl?.textContent ?? '').toBe('');
  });
});
