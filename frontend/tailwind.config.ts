import type { Config } from "tailwindcss"

// Design system do Pulse — Atlassian Design System (light).
// Migrado de "Graphite Premium" (violeta/ink-paper/dark) para a paleta Jira:
// neutros frios + brand azul (#0C66E4) + status/prioridade. Os nomes de token
// legados (ink/paper/brand/canvas) foram REMAPEADOS para valores Atlassian, de
// modo que todo o JSX existente passa a renderizar no tema novo sem reescrita.
// Nunca usar hex solto no JSX — sempre via token.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // "class" simples deixaria o conteúdo embutido no PC Win98 herdar o dark
  // mode do app (o <html class="dark">), enquanto a tela do PC é sempre clara
  // (bg-white fixo em Win98Window). Exclui .win98-sunken da herança para que
  // board e chrome do PC fiquem no mesmo tema.
  darkMode: ["variant", "&:is(.dark *):not(.win98-sunken):not(.win98-sunken *)"],
  theme: {
    extend: {
      colors: {
        // ── Escalas Atlassian canônicas (use estas em código novo) ──────────
        neutral: {
          0: "#FFFFFF",
          50: "#F7F8F9",
          100: "#F1F2F4",
          200: "#DCDFE4",
          300: "#B3B9C4",
          400: "#8590A2",
          500: "#626F86",
          600: "#44546F",
          700: "#44546F",
          800: "#2C3E5D",
          900: "#172B4D",
        },
        blue: {
          50: "#E9F2FF",
          100: "#CCE0FF",
          200: "#85B8FF",
          300: "#579DFF",
          400: "#388BFF",
          500: "#0C66E4",
          600: "#0055CC",
          700: "#09326C",
        },
        green: {
          50: "#DCFFF1",
          100: "#DCFFF1",
          400: "#4BCE97",
          500: "#22A06B",
          600: "#1F845A",
          700: "#216E4E",
          900: "#164B35",
        },
        red: {
          50: "#FFECEB",
          100: "#FFECEB",
          200: "#FFD5D2",
          400: "#F87168",
          500: "#E2483D",
          600: "#C9372C",
          700: "#AE2E24",
        },
        orange: {
          100: "#FFF3EB",
          400: "#FCA700",
          500: "#E56910",
          700: "#A54800",
        },
        yellow: { 100: "#FFF7D6", 500: "#E2B203", 700: "#946F00" },

        // ── Tokens legados remapeados → Atlassian ───────────────────────────
        // ink: texto (light) / superfícies (dark). Neutro cinza-preto — não navy —
        // pra manter o azul reservado ao brand/acentos (pedido: "preto puxado pro
        // cinza escuro", sem tudo ficar com cara de azul).
        ink: {
          DEFAULT: "#181A1F",
          950: "#0A0B0D",
          900: "#17191E",
          800: "#212328",
          700: "#2E3036",
          600: "#494B52",
          500: "#63656C",
          400: "#8A8C93",
        },
        // paper: superfícies claras, bordas e texto suave.
        paper: {
          DEFAULT: "#FFFFFF",
          50: "#F7F8F9",
          100: "#F1F2F4",
          200: "#DCDFE4",
          300: "#DCDFE4",
          400: "#8590A2",
          500: "#626F86",
          600: "#44546F",
        },
        // canvas: fundo da aplicação.
        canvas: "#F7F8F9",
        // brand: acento de ação primária — azul Atlassian.
        brand: {
          DEFAULT: "#0C66E4",
          50: "#E9F2FF",
          100: "#CCE0FF",
          200: "#85B8FF",
          300: "#579DFF",
          400: "#388BFF",
          500: "#0C66E4",
          600: "#0055CC",
          700: "#09326C",
          800: "#09326C",
          900: "#082B5E",
        },
        // Semânticas (status) — tons Atlassian.
        success: "#22A06B",
        warning: "#E56910",
        danger: "#E2483D",

        // ── Chatwoot (escopo: feature `inbox`) ──────────────────────────────
        // O atendimento replica a interface do Chatwoot para quem já opera nela
        // não precisar reaprender. Como o resto do app é Atlassian, a paleta
        // deles fica numa escala própria (`cw-*`) em vez de sobrescrever brand:
        // assim as duas convivem sem uma contaminar a outra.
        cw: {
          // Azul-assinatura — é a cor default de label na API deles.
          500: "#1F93FF",
          600: "#1B7FDB",
          700: "#135FA5",
          // Fundo da bolha do agente: azul MUITO claro com texto escuro. No
          // Chatwoot o azul saturado só aparece em botão/badge, nunca na bolha.
          bubble: "#E5F2FF",
          "bubble-border": "#CFE5FB",
          // Bolha do contato: branca com borda fria.
          "bubble-in": "#FFFFFF",
          // Nota interna: âmbar, sinalizando "o cliente não vê isto".
          note: "#FFF8E5",
          "note-border": "#FFE1A6",
          "note-ink": "#8A6100",
          // Neutros frios da interface deles.
          ink: "#3C4858",
          muted: "#6E7B8F",
          border: "#E0E6ED",
          surface: "#F9FAFB",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        // Atlassian: inputs/botões 3px, cards/modais 6px.
        DEFAULT: "0.1875rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.5rem",
        "2xl": "0.625rem",
        "3xl": "0.75rem",
      },
      boxShadow: {
        xs: "0 1px 1px rgb(9 30 66 / 0.08)",
        card: "0 1px 1px rgb(9 30 66 / 0.10), 0 0 1px rgb(9 30 66 / 0.10)",
        panel: "0 1px 1px rgb(9 30 66 / 0.10), 0 4px 8px -2px rgb(9 30 66 / 0.12)",
        pop: "0 8px 16px -4px rgb(9 30 66 / 0.20), 0 0 1px rgb(9 30 66 / 0.20)",
        "brand-glow": "0 1px 1px rgb(9 30 66 / 0.10), 0 0 1px rgb(9 30 66 / 0.10)",
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
