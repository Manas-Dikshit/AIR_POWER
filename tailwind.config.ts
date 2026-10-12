import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2430",
        paper: "#fbf8f1",
        navy: {
          800: "#16233d",
          900: "#0f1a2e",
          950: "#0a1221",
        },
        accent: {
          DEFAULT: "#2f6fed",
          soft: "#e8f0ff",
          cyan: "#22b8cf",
        },
      },
      fontFamily: {
        hand: ["Caveat", "Segoe Print", "Bradley Hand", "Comic Sans MS", "cursive"],
        body: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
