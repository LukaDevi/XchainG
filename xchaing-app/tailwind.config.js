/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#FF5500", // მკვეთრი სტაფილოსფერი
          dark: "#121316", // მუქი ნაცრისფერი
          slate: "#1E2025", // მეორადი მუქი ნაცრისფერი
          light: "#F7F8FA", // ღია ფონი
        },
      },
    },
  },
  plugins: [],
};
