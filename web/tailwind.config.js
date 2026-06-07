/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          900: '#0B0F19',
          800: '#111827',
          700: '#1F2937',
        },
      },
      borderRadius: {
        card: '0.75rem',
      },
      spacing: {
        'page-x': '1.5rem',
        'page-y': '1.5rem',
        card: '1.25rem',
      },
    },
  },
  plugins: [],
};
