import type { Config } from "tailwindcss"

// Design system do Pulse — "Graphite Premium".
// Base monocromática refinada (ink/paper) + 1 acento (brand violeta) usado com
// parcimônia para estados ativos, foco, CTAs e data-viz. Nunca hex solto no JSX.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tinta (escala neutra escura) — superfícies escuras e texto
        ink: {
          DEFAULT: "#0b0b0d",
          950: "#08080a",
          900: "#0e0e11",
          800: "#16161a",
          700: "#1f1f24",
          600: "#2c2c33",
          500: "#3a3a42",
          400: "#52525b",
        },
        // Papel (escala neutra clara) — superfícies claras, bordas e texto suave
        paper: {
          DEFAULT: "#ffffff",
          50: "#fbfbfc",
          100: "#f4f4f6",
          200: "#e9e9ee",
          300: "#d8d8e0",
          400: "#a1a1ad",
          500: "#71717f",
          600: "#52525c",
        },
        // Fundo da aplicação (canvas) — levemente acinzentado p/ os painéis "subirem"
        canvas: "#f6f6f8",
        // Acento da marca — violeta sofisticado
        brand: {
          DEFAULT: "#6c5cf0",
          50: "#f2f1ff",
          100: "#e7e4ff",
          200: "#d0caff",
          300: "#b1a6ff",
          400: "#8f7dff",
          500: "#6c5cf0",
          600: "#5a47e0",
          700: "#4a39bd",
          800: "#3d3199",
          900: "#332a7a",
        },
        // Cores semânticas (sutis, dessaturadas para casar com o tema)
        success: "#16a34a",
        warning: "#d97706",
        danger: "#e11d48",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        // Sombras em camadas, suaves — profundidade sem "drop-shadow tosco"
        xs: "0 1px 2px 0 rgb(10 10 15 / 0.04)",
        card: "0 1px 2px 0 rgb(10 10 15 / 0.04), 0 1px 3px 0 rgb(10 10 15 / 0.06)",
        panel:
          "0 1px 2px 0 rgb(10 10 15 / 0.04), 0 4px 16px -4px rgb(10 10 15 / 0.10)",
        pop: "0 8px 32px -8px rgb(10 10 15 / 0.20), 0 2px 8px -2px rgb(10 10 15 / 0.12)",
        "brand-glow": "0 8px 24px -8px rgb(108 92 240 / 0.45)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
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
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.18s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.5s linear infinite",
        "grid-pan": "grid-pan 6s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config
