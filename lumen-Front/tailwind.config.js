/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // === Tailwind 色阶覆盖 — 暖灰色调（Claude Desktop 风格） ===
        slate: {
          50:  '#FAFAF8',
          100: '#F3F3F0',
          200: '#E8E7E3',
          300: '#D1D0CC',
          400: '#ABA499',
          500: '#8A8478',
          600: '#6A655C',
          700: '#4A4744',
          800: '#333230',
          900: '#1F1F1E',
          950: '#141413',
        },
        amber: {
          50:  '#FEF6F2',
          100: '#FDE8DF',
          200: '#F5CFC0',
          300: '#E8A48C',
          400: '#CC7C5E',
          500: '#B86A4A',
          600: '#A05838',
          700: '#86462C',
          800: '#6E3824',
          900: '#5C2F20',
          950: '#331610',
        },
        // === 语义色（CSS 变量驱动） ===
        primary: {
          DEFAULT: 'var(--color-primary)',
          light: 'var(--color-primary-light)',
          dim: 'var(--color-primary-dim)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          light: 'var(--color-accent-light)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          light: 'var(--color-success-light)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          light: 'var(--color-error-light)',
        },
        surface: {
          deep: 'var(--color-bg-deep)',
          base: 'var(--color-bg-base)',
          DEFAULT: 'var(--color-bg-surface)',
          elevated: 'var(--color-bg-elevated)',
        },
      },
      borderColor: {
        'theme': 'var(--color-border)',
        'theme-subtle': 'var(--color-border-subtle)',
      },
    },
  },
  plugins: [],
};
