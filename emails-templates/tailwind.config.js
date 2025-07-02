/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("tailwindcss-preset-email")],
  content: [
    "./components/**/*.html",
    "./emails/**/*.html",
    "./layouts/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        "primary-green": "#909373",
        "primary-beige": "#f3e1ca",
        "accent-dark-green": "#5e6650",
        "accent-light-beige": "#faf5ef",
        "accent-warm-brown": "#a0522d",
        "accent-dark-brown": "#654321",
        "accent-subtle-gray": "#d1c7bc",
      },
    },
  },
};
