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
        // Document navy. Matches the participation agreements and one-pagers
        // so the participant portal reads as the same instrument.
        ink: "#0D2035",

        // Institutional Navy / Slate
        navy: {
          950: "#060D1F",
          900: "#0F172A",
          800: "#1E293B",
          700: "#334155",
        },
        // Public site palette ("Ledger", 25 Sep 2026). The portals keep
        // navy/gold/slate, and `ink` above stays the participant documents'
        // navy, so the public colours have their own names.
        // brass-700 is the only brass allowed as small text on a light ground
        // (#7A5A1C on bone, about 6:1). brass-500 is for fills, rules and large
        // type, and always carries deep text, never white.
        deep: {
          DEFAULT: "#0A1628",
          2: "#0F2036",
          muted: "#3C4656",
          soft: "#5A6473",
        },
        brass: {
          300: "#D9B870",
          500: "#B88E3E",
          700: "#7A5A1C",
        },
        bone: "#F3EEE4",
        linen: "#EAE3D6",
        paper: "#FBF8F2",
        rule: "#D8CFBE",
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
        // Inter is self-hosted by next/font (app/layout.tsx) and exposed as a
        // CSS variable, so no stylesheet blocks the first paint. The portals
        // and the CRM keep Inter; the public site uses the three below.
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        // Public site ("Ledger", 25 Sep 2026): Inter Tight headlines, Inter body, mono figures.
        headline: ["var(--font-headline)", "var(--font-inter)", "system-ui", "sans-serif"],
        plex: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        figure: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
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
