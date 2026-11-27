/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');
const palette = require('tailwindcss/colors');

// Accent themes: each one is a full Tailwind scale, so every blue-* class in the app follows the chosen theme.
const THEMES = {
  blue: palette.blue,
  purple: palette.indigo,
  teal: palette.teal,
  green: palette.green,
  orange: palette.orange,
  rose: palette.pink,
  graphite: palette.zinc,
};
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
};
const scaleVars = (scale) => Object.fromEntries(SHADES.map((s) => [`--accent-${s}`, rgb(scale[s])]));
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  // A tap on a phone must not leave the hover look stuck on the thing tapped.
  future: { hoverOnlyWhenSupported: true },
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Existing screens use blue-*; it now means "the accent colour".
        blue: Object.fromEntries(SHADES.map((s) => [s, v(`accent-${s}`)])),
        background: v('background'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2') },
        line: v('border'),
        fg: v('text'),
        muted: v('muted'),
        accent: { DEFAULT: v('accent'), contrast: v('accent-contrast'), soft: v('accent-soft') },
        positive: v('positive'),
        negative: v('negative'),
        warning: v('warning'),
      },
      borderColor: { DEFAULT: v('border') },
      ringColor: { DEFAULT: v('accent') },
      transitionTimingFunction: {
        ease: 'cubic-bezier(.32,.72,0,1)',
        spring: 'cubic-bezier(.34,1.3,.64,1)',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const base = { ':root': scaleVars(THEMES.blue) };
      Object.entries(THEMES).forEach(([name, scale]) => {
        base[`:root[data-theme="${name}"]`] = scaleVars(scale);
      });
      addBase(base);
    }),
  ],
};
