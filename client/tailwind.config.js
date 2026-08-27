/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#08070B",
          secondary: "#0E0B14",
          card: "#13101A",
        },
        accent: {
          DEFAULT: "#A855F7",
          light: "#C084FC",
          glow: "rgba(168, 85, 247, 0.15)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(168, 85, 247, 0.2)",
        glow: "0 0 20px rgba(168, 85, 247, 0.3)",
        "glow-lg": "0 0 40px rgba(168, 85, 247, 0.4)",
      },
    },
  },
  plugins: [],
};
