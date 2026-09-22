import { describe, it, expect } from 'vitest';
import {
  MAP_BOUNDARY_STYLES,
  MAP_LIGHTING_CONFIG,
  MAP_FILL_PALETTES,
} from '@/lib/gis/mapStyles';

describe('GIS Map Boundary Contrast and Lighting Configuration', () => {
  describe('1. State Boundary Styling (Primary Hierarchy)', () => {
    it('uses the visually dominant dark slate color (#475569)', () => {
      expect(MAP_BOUNDARY_STYLES.state.hex).toBe('#475569');
      expect(MAP_BOUNDARY_STYLES.state.color[0]).toBe(71);
      expect(MAP_BOUNDARY_STYLES.state.color[1]).toBe(85);
      expect(MAP_BOUNDARY_STYLES.state.color[2]).toBe(105);
    });

    it('enforces stroke width between 2.2px and 2.8px at desktop zoom', () => {
      expect(MAP_BOUNDARY_STYLES.state.width).toBeGreaterThanOrEqual(2.2);
      expect(MAP_BOUNDARY_STYLES.state.width).toBeLessThanOrEqual(2.8);
      expect(MAP_BOUNDARY_STYLES.state.minWidthPixels).toBeGreaterThanOrEqual(2.2);
    });

    it('enforces opacity between 0.85 and 0.95', () => {
      expect(MAP_BOUNDARY_STYLES.state.opacity).toBeGreaterThanOrEqual(0.85);
      expect(MAP_BOUNDARY_STYLES.state.opacity).toBeLessThanOrEqual(0.95);
      // RGBA alpha check: 230 / 255 ~= 0.90
      expect(MAP_BOUNDARY_STYLES.state.color[3] / 255).toBeCloseTo(0.90, 1);
    });

    it('enforces rounded line joins and caps', () => {
      expect(MAP_BOUNDARY_STYLES.state.lineJointRounded).toBe(true);
      expect(MAP_BOUNDARY_STYLES.state.lineCapRounded).toBe(true);
    });
  });

  describe('2. District Boundary Styling (Secondary Hierarchy)', () => {
    it('uses the secondary slate color (#64748B)', () => {
      expect(MAP_BOUNDARY_STYLES.district.hex).toBe('#64748B');
      expect(MAP_BOUNDARY_STYLES.district.color[0]).toBe(100);
      expect(MAP_BOUNDARY_STYLES.district.color[1]).toBe(116);
      expect(MAP_BOUNDARY_STYLES.district.color[2]).toBe(139);
    });

    it('enforces stroke width between 1.2px and 1.7px', () => {
      expect(MAP_BOUNDARY_STYLES.district.width).toBeGreaterThanOrEqual(1.2);
      expect(MAP_BOUNDARY_STYLES.district.width).toBeLessThanOrEqual(1.7);
      expect(MAP_BOUNDARY_STYLES.district.minWidthPixels).toBeGreaterThanOrEqual(1.2);
    });

    it('enforces opacity between 0.75 and 0.90', () => {
      expect(MAP_BOUNDARY_STYLES.district.opacity).toBeGreaterThanOrEqual(0.75);
      expect(MAP_BOUNDARY_STYLES.district.opacity).toBeLessThanOrEqual(0.90);
      // RGBA alpha check: 204 / 255 = 0.80
      expect(MAP_BOUNDARY_STYLES.district.color[3] / 255).toBeCloseTo(0.80, 1);
    });

    it('enforces rounded line joins and caps', () => {
      expect(MAP_BOUNDARY_STYLES.district.lineJointRounded).toBe(true);
      expect(MAP_BOUNDARY_STYLES.district.lineCapRounded).toBe(true);
    });

    it('ensures state boundaries are strictly dominant over district boundaries', () => {
      expect(MAP_BOUNDARY_STYLES.state.width).toBeGreaterThan(MAP_BOUNDARY_STYLES.district.width);
      expect(MAP_BOUNDARY_STYLES.state.opacity).toBeGreaterThanOrEqual(MAP_BOUNDARY_STYLES.district.opacity);
    });
  });

  describe('3. Selected District Boundary Styling', () => {
    it('uses Alliance India teal color (#0d9488) at full opacity without excessive glow', () => {
      expect(MAP_BOUNDARY_STYLES.selectedDistrict.hex).toBe('#0d9488');
      expect(MAP_BOUNDARY_STYLES.selectedDistrict.color).toEqual([13, 148, 136, 255]);
      expect(MAP_BOUNDARY_STYLES.selectedDistrict.opacity).toBe(1.0);
    });

    it('uses 3px stroke width for strong keyboard and pointer visibility', () => {
      expect(MAP_BOUNDARY_STYLES.selectedDistrict.width).toBe(3.0);
      expect(MAP_BOUNDARY_STYLES.selectedDistrict.minWidthPixels).toBe(3.0);
      expect(MAP_BOUNDARY_STYLES.selectedDistrict.lineJointRounded).toBe(true);
      expect(MAP_BOUNDARY_STYLES.selectedDistrict.lineCapRounded).toBe(true);
    });

    it('uses subtle hover highlight instead of dark-blue default', () => {
      expect(MAP_BOUNDARY_STYLES.hoverHighlight[0]).toBe(13);
      expect(MAP_BOUNDARY_STYLES.hoverHighlight[1]).toBe(148);
      expect(MAP_BOUNDARY_STYLES.hoverHighlight[2]).toBe(136);
      expect(MAP_BOUNDARY_STYLES.hoverHighlight[3]).toBeLessThan(60); // subtle wash
    });
  });

  describe('4. Central Brightness and Lighting Elimination', () => {
    it('does not contain any PointLight that creates central circular glare', () => {
      // MAP_LIGHTING_CONFIG only contains balanced ambient and directional sun light
      expect(MAP_LIGHTING_CONFIG).toHaveProperty('ambient');
      expect(MAP_LIGHTING_CONFIG).toHaveProperty('directional');
      expect((MAP_LIGHTING_CONFIG as any).pointLight).toBeUndefined();
    });

    it('uses balanced ambient light with intensity 1.0', () => {
      expect(MAP_LIGHTING_CONFIG.ambient.intensity).toBe(1.0);
      expect(MAP_LIGHTING_CONFIG.ambient.color).toEqual([255, 255, 255]);
    });

    it('uses directional light with northwest sun angle without ground hotspot', () => {
      expect(MAP_LIGHTING_CONFIG.directional.intensity).toBe(0.5);
      expect(MAP_LIGHTING_CONFIG.directional.direction).toEqual([-1, -2, -3]);
    });
  });

  describe('5. Sector and Zero-Record Visual Integrity', () => {
    it('provides neutral slate fill for regions with no survey records', () => {
      expect(MAP_FILL_PALETTES.noData).toEqual([226, 232, 240, 110]);
    });

    it('ensures noData color has subdued opacity so basemap remains readable', () => {
      const alpha = MAP_FILL_PALETTES.noData[3];
      expect(alpha).toBeLessThan(150); // subdued
    });
  });
});
