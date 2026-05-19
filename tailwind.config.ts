import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Institutional Navy / Slate
        navy: {
          950: "#060D1F",
          900: "#0F172A",
          800: "#1E293B",
          700: "#334155",
        },
        // Gold accent
        gold: {
          400: "#D4A844",
          500: "#C9A84C",
          600: "#B8922E",
          700: "#9A7A24",
        },
        // Slate for text
        slate: {
          50:  "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "card": "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 16px 0 rgba(0,0,0,0.12)",
        "gold": "0 0 0 3px rgba(201,168,76,0.25)",
      },
      borderRadius: {
        "xl": "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
