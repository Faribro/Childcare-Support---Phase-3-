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
        '.notebook-folder': {
          'background-color': '#F3EDE2',
          'background-image':
            'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, transparent 60%), radial-gradient(#DECDBB 0.5px, transparent 0.5px)',
          'background-size': '100% 100%, 16px 16px',
          border: '1px solid #D8C7B0',
          'box-shadow': '0 20px 45px -15px rgba(55, 42, 25, 0.18), 0 0 0 1px rgba(255,255,255,0.8) inset',
        },
        '.notebook-paper-sheet': {
          'background-color': '#FCFAF6',
          'background-image':
            'repeating-linear-gradient(transparent, transparent 27px, rgba(218, 208, 194, 0.35) 28px)',
          border: '1px solid #E4D8C7',
          'box-shadow': '0 10px 35px -5px rgba(40, 30, 20, 0.09), 0 1px 3px rgba(40, 30, 20, 0.04)',
        },
        '.notebook-stamp': {
          border: '2px dashed #991B1B',
          color: '#991B1B',
          'font-family': "'DM Mono', monospace",
          'letter-spacing': '0.14em',
          'text-transform': 'uppercase',
          'transform': 'rotate(-2.5deg)',
          'background-color': 'rgba(254, 242, 242, 0.88)',
          'box-shadow': '0 0 0 2px rgba(153, 27, 27, 0.08)',
        },
        '.notebook-tape': {
          'background-color': 'rgba(245, 235, 215, 0.8)',
          'box-shadow': '0 1px 3px rgba(0,0,0,0.08)',
          'backdrop-filter': 'blur(1px)',
          border: '1px solid rgba(220, 205, 180, 0.5)',
        },
        '.notebook-punch-hole': {
          width: '14px',
          height: '14px',
          'border-radius': '9999px',
          'background-color': '#E5DACB',
          'box-shadow': 'inset 0 2px 3px rgba(50, 40, 30, 0.3), 0 1px 0 rgba(255, 255, 255, 0.8)',
          border: '1px solid #D0C2AF',
        },
        '.archival-tag': {
          'font-family': "'DM Mono', monospace",
          'letter-spacing': '0.12em',
          'text-transform': 'uppercase',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '.motion-safe-animate': {
            animation: 'none !important',
            transition: 'none !important',
            transform: 'none !important',
          },
          '.support-path-draw': {
            'stroke-dashoffset': '0 !important',
            animation: 'none !important',
          },
        },
      });
    }),
  ],
};

export default config;
