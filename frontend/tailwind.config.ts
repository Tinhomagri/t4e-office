import type { Config } from "tailwindcss"

import {
  tailwindBorderRadius,
  tailwindColors,
  tailwindFontFamily,
} from "./src/shared/whitelabel.tokens"

// Design system do Pulse — Atlassian Design System (light).
// Migrado de "Graphite Premium" (violeta/ink-paper/dark) para a paleta Jira:
// neutros frios + brand azul (#0C66E4) + status/prioridade. Os nomes de token
// legados (ink/paper/brand/canvas) foram REMAPEADOS para valores Atlassian, de
// modo que todo o JSX existente passa a renderizar no tema novo sem reescrita.
// Nunca usar hex solto no JSX — sempre via token.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // O PC do escritório embute as MESMAS páginas do produto: elas têm que
  // seguir o tema do app dentro e fora da janela 98. Havia aqui um
  // `:not(.win98-sunken)` que desligava o dark mode dentro do PC (a tela era
  // `bg-white` fixo) — o efeito era a mesma página abrir com outro visual só
  // por estar no PC. A moldura 98 não depende disto: ela é toda `.win98-*`
  // com cor fixa, sem nenhuma variante `dark:`.
  darkMode: "class",
  theme: {
    extend: {
      // Paleta inteira gerada pelo manifesto de whitelabel: cada token sai como
      // `rgb(var(--c-…, <padrão>) / <alpha>)`, então a mesma classe que hoje
      // pinta de azul Atlassian passa a obedecer à cor que a pessoa escolher
      // no Perfil — sem nenhuma reescrita de JSX.
      colors: tailwindColors(),
      fontFamily: tailwindFontFamily(),
      borderRadius: tailwindBorderRadius(),
      boxShadow: {
        xs: "0 1px 1px rgb(9 30 66 / 0.08)",
        card: "0 1px 1px rgb(9 30 66 / 0.10), 0 0 1px rgb(9 30 66 / 0.10)",
        panel: "0 1px 1px rgb(9 30 66 / 0.10), 0 4px 8px -2px rgb(9 30 66 / 0.12)",
        pop: "0 8px 16px -4px rgb(9 30 66 / 0.20), 0 0 1px rgb(9 30 66 / 0.20)",
        "brand-glow": "0 1px 1px rgb(9 30 66 / 0.10), 0 0 1px rgb(9 30 66 / 0.10)",
        // Sombra de modal do Jira dark (`--ds-shadow-overlay`): um anel claro de
        // 1px desenha a borda do painel sobre o fundo escuro — sem ele o modal
        // se funde com a página — e duas camadas escuras dão a profundidade.
        overlay:
          "0 0 0 1px rgb(189 189 189 / 0.12), 0 8px 12px rgb(1 4 4 / 0.36), 0 0 1px 1px rgb(1 4 4 / 0.5)",
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
        "pulse-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(226 72 61 / 0.5)" },
          "50%": { boxShadow: "0 0 0 6px rgb(226 72 61 / 0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "drop-zone": {
          "0%, 100%": { borderColor: "rgb(12 102 228 / 0.4)" },
          "50%": { borderColor: "rgb(12 102 228 / 0.9)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.18s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.5s linear infinite",
        "grid-pan": "grid-pan 6s linear infinite",
        "pulse-ring": "pulse-ring 1.8s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.22s cubic-bezier(0.16,1,0.3,1) both",
        "drop-zone": "drop-zone 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config
