import '@testing-library/jest-dom';
import { vi } from 'vitest';

if (typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined') {
  const dummyGradient = {
    addColorStop: vi.fn(),
  };

  const dummyContext: Record<string, any> = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: [] })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    ellipse: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    createLinearGradient: vi.fn(() => dummyGradient),
    createRadialGradient: vi.fn(() => dummyGradient),
    measureText: vi.fn(() => ({ width: 0 })),
  };

  HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId: string) => {
    if (contextId === '2d') {
      return new Proxy(dummyContext, {
        get(target, prop: string) {
          if (prop in target) return target[prop];
          if (typeof prop === 'string' && !target[prop]) {
            target[prop] = vi.fn();
            return target[prop];
          }
          return undefined;
        },
      });
    }
    return null;
  }) as any;
}
