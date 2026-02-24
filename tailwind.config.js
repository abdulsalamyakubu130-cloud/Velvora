/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./index.html', './src/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        panel: 'var(--panel)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        accentStrong: 'var(--accent-strong)',
        accentSoft: 'var(--accent-soft)',
      },
      fontFamily: {
        brand: ['var(--font-brand)'],
        body: ['var(--font-body)'],
      },
      boxShadow: {
        soft: '0 12px 30px -18px rgba(8, 56, 28, 0.45)',
      },
      animation: {
        rise: 'rise 450ms ease-out',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
