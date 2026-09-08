import type { Config } from 'tailwindcss';

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
          DEFAULT: '#1E3A8A',
          dark: '#172554',
          light: '#2563EB',
          50: '#EFF6FF',
          100: '#DBEAFE',
          900: '#1E3A8A',
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
  plugins: [],
};

export default config;
