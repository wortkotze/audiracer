/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        'audi-red': '#DC281E',
        'audi-grey': '#B3B3B3',
        'audi-lightGrey': '#E5E5E5',
      },
      fontFamily: {
        sans: ['System'],
        mono: ['System'], // We might want to load a custom font later
        pixel: ['System'], // Placeholder for pixel font
      },
    },
  },
  plugins: [],
}
