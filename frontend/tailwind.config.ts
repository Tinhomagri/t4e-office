import type { Config } from "tailwindcss"

// Paleta P&B do T4E Office — tokens, nunca hex solto no JSX
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Escala monocromática (ink = preto, paper = branco)
        ink: {
          DEFAULT: "#000000",
          900: "#0a0a0a",
          800: "#141414",
          700: "#1f1f1f",
          600: "#2e2e2e",
        },
        paper: {
          DEFAULT: "#ffffff",
          100: "#f5f5f5",
          200: "#e5e5e5",
          300: "#d4d4d4",
          400: "#a3a3a3",
          500: "#737373",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "grid-pan": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "40px 40px" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.5s linear infinite",
        "grid-pan": "grid-pan 6s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config
