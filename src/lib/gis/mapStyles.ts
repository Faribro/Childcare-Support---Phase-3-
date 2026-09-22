/**
 * Centralized GIS Map Styling & Lighting Configuration
 * Enforces boundary visual hierarchy, uniform base map luminance, and Alliance India design system colors.
 */

export interface BoundaryStyleDefinition {
  color: [number, number, number, number]; // RGBA (0-255)
  hex: string;
  width: number;
  minWidthPixels: number;
  opacity: number;
  lineJointRounded: boolean;
  lineCapRounded: boolean;
}

export const MAP_BOUNDARY_STYLES = {
  /**
   * Primary boundary layer: State boundaries
   * Must render above district boundaries and remain visually dominant.
   * Color: #475569 (dark slate), Opacity: ~0.90 (230/255), Width: 2.5px
   */
  state: {
    color: [71, 85, 105, 230] as [number, number, number, number],
    hex: '#475569',
    width: 2.5,
    minWidthPixels: 2.4,
    opacity: 0.90,
    lineJointRounded: true,
    lineCapRounded: true,
  },

  /**
   * Secondary boundary layer: District boundaries
   * Subordinate to state boundaries, visible without obscuring labels or markers.
   * Color: #64748B (slate-500), Opacity: ~0.80 (204/255), Width: 1.4px
   */
  district: {
    color: [100, 116, 139, 204] as [number, number, number, number],
    hex: '#64748B',
    width: 1.4,
    minWidthPixels: 1.4,
    opacity: 0.80,
    lineJointRounded: true,
    lineCapRounded: true,
  },

  /**
   * Interactive boundary: Selected district
   * Distinguishable for keyboard and pointer users without excessive glow.
   * Color: #0d9488 (Alliance India teal), Opacity: 1.0 (255), Width: 3.0px
   */
  selectedDistrict: {
    color: [13, 148, 136, 255] as [number, number, number, number],
    hex: '#0d9488',
    width: 3.0,
    minWidthPixels: 3.0,
    opacity: 1.0,
    lineJointRounded: true,
    lineCapRounded: true,
  },

  /**
   * Subtle hover highlight: Replaces Deck.GL's harsh dark-blue default [0, 0, 128, 128]
   * with a soft Alliance India teal wash.
   */
  hoverHighlight: [13, 148, 136, 45] as [number, number, number, number],
} as const;

export const MAP_LIGHTING_CONFIG = {
  /**
   * Balanced ambient light providing even base luminance across all of India.
   */
  ambient: {
    color: [255, 255, 255] as [number, number, number],
    intensity: 1.0,
  },

  /**
   * Directional sunlight from north-west angle casting subtle parallel shading
   * on 3D extruded geometry without generating any point-source hotspot or circular glare.
   */
  directional: {
    color: [255, 255, 255] as [number, number, number],
    intensity: 0.5,
    direction: [-1, -2, -3] as [number, number, number],
  },
} as const;

/**
 * Color scale tokens for map polygon fills
 */
export const MAP_FILL_PALETTES = {
  /** Default neutral slate for uninspected or zero-record regions */
  noData: [226, 232, 240, 110] as [number, number, number, number],

  /** Positive coverage / health metric gradient (Emerald / Teal) */
  coverageLow: [13, 148, 136, 180] as [number, number, number, number],
  coverageHigh: [4, 120, 87, 245] as [number, number, number, number],

  /** Danger / clinical alert metric gradient (Amber / Rose) */
  alertLow: [251, 191, 36, 190] as [number, number, number, number],
  alertHigh: [225, 29, 72, 245] as [number, number, number, number],
} as const;
