/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/webview/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ok: '#22c55e',
        warn: '#eab308',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
};
