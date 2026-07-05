module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef1f8',
          100: '#dbe1f0',
          200: '#b3bfe0',
          300: '#8497cc',
          400: '#4c5fa0',
          500: '#2d3f7c',
          600: '#1B2B5E',
          700: '#16234c',
          800: '#111b3b',
          900: '#0b122a',
        },
        accent: {
          orange: '#FF6B35',
          pink: '#E91E8C',
          purple: '#7B2FBE',
        }
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #FF6B35 0%, #E91E8C 50%, #7B2FBE 100%)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}