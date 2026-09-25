import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0D9488',
          dark: '#0F766E',
          light: '#14B8A6',
          50: '#F0FDFA',
          100: '#CCFBF1',
          900: '#134E4A',
        },
        alliance: {
          emerald: '#047857',
          'emerald-dark': '#065F46',
          'emerald-light': '#10B981',
          'emerald-50': '#ECFDF5',
        },
        surface: {
          canvas: '#F8FAFC',
          card: '#FFFFFF',
          subtle: '#F1F5F9',
        },
        ink: {
          900: '#0F172A',
          700: '#334155',
          600: '#475569',
          400: '#94A3B8',
          300: '#CBD5E1',
        },
        alert: {
          amber: '#B45309',
          'amber-light': '#FFFBEB',
          rose: '#BE123C',
          'rose-light': '#FFF1F2',
          sky: '#0369A1',
          'sky-light': '#F0F9FF',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['DM Mono', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      minHeight: {
        'touch': '48px',
        'touch-compact': '44px',
      },
      minWidth: {
        'touch': '48px',
        'touch-compact': '44px',
      },
      screens: {
        'xs': '375px',
        'sm': '480px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.notebook-paper-bg': {
          'background-color': '#FAF8F5',
          'background-image':
            'radial-gradient(#E2D9CC 0.75px, transparent 0.75px), linear-gradient(to right, rgba(226, 217, 204, 0.25) 1px, transparent 1px)',
          'background-size': '24px 24px, 24px 24px',
        },
        '.notebook-lines': {
          'background-image':
            'repeating-linear-gradient(transparent, transparent 27px, rgba(226, 217, 204, 0.5) 28px)',
        },
        '.notebook-border': {
          border: '1px solid rgba(214, 205, 192, 0.8)',
          'box-shadow':
            '0 4px 20px -2px rgba(44, 39, 33, 0.06), 0 2px 6px -1px rgba(44, 39, 33, 0.04)',
        },
        '.archival-tag': {
          'font-family': "'Anonymous Pro', monospace",
          'letter-spacing': '0.12em',
          'text-transform': 'uppercase',
        },
      });
    }),
  ],
};

export default config;
