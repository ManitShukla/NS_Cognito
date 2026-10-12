import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './client/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'co-black': '#05070A',
        'co-night': '#071024',
        'co-ink': '#1A1A1A',
        'co-paper': '#FFFFFF',
        'co-surface': '#F2F2F2',
        'co-blue': '#0033A0',
        'co-red': '#D82C2C',
        'co-muted': '#697271',
        'co-muted-strong': '#66706F',
        'co-dark-copy': '#C8CECD',
        'co-disabled': '#8D9695',
        'co-rule': '#DFE3E3',
        'co-dark-rule': '#3B3B3B',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        xs: '2px',
      },
      letterSpacing: {
        tightest: '-0.065em',
        tighter: '-0.04em',
        widest: '0.14em',
        wider: '0.08em',
      },
    },
  },
  plugins: [],
};

export default config;
