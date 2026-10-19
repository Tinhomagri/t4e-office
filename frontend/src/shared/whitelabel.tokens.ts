// Manifesto do whitelabel — a ÚNICA fonte de verdade das cores, fontes e raios
// do T4E Office.
//
// Este arquivo é lido por dois consumidores: o `tailwind.config.ts`, que gera
// as classes a partir daqui, e a tela de Marca no Perfil, que lista os mesmos
// tokens para quem for personalizar. Vivendo num lugar só, não há como o
// seletor de cores oferecer um token que o Tailwind não tem — nem o contrário.
//
// Cada cor vira `rgb(var(--c-<key>, <canal padrão>) / <alpha-value>)`. O
// PADRÃO MORA NO FALLBACK DO `var()`, de propósito: sem whitelabel nenhuma
// variável é definida e a cor original já sai do CSS compilado — nada de
// primeiro quadro sem tema, e nada de uma folha de `:root` para manter em
// sincronia com esta lista.
//
// Nada de import de navegador aqui: o Tailwind avalia este módulo no Node.

export type ColorToken = {
  /** Caminho no Tailwind, com `-` no lugar do ponto: `brand-500`, `cw-bubble`. */
  key: string
  label: string
  /** Cor original do produto, em hexadecimal. */
  value: string
}

export type ColorGroup = {
  id: string
  label: string
  hint: string
  tokens: ColorToken[]
}

export type TextToken = {
  key: string
  cssVar: string
  label: string
  value: string
}

export const COLOR_GROUPS: ColorGroup[] = [
  {
    id: "marca",
    label: "Marca",
    hint: "A cor de ação primária. É o que mais muda a cara do produto.",
    tokens: [
      { key: "brand-DEFAULT", label: "Marca (padrão)", value: "#0C66E4" },
      { key: "brand-50", label: "Marca 50 — fundo sutil", value: "#E9F2FF" },
      { key: "brand-100", label: "Marca 100", value: "#CCE0FF" },
      { key: "brand-200", label: "Marca 200", value: "#85B8FF" },
      { key: "brand-300", label: "Marca 300 — texto no escuro", value: "#579DFF" },
      { key: "brand-400", label: "Marca 400", value: "#388BFF" },
      { key: "brand-500", label: "Marca 500 — botões", value: "#0C66E4" },
      { key: "brand-600", label: "Marca 600 — hover", value: "#0055CC" },
      { key: "brand-700", label: "Marca 700", value: "#09326C" },
      { key: "brand-800", label: "Marca 800", value: "#09326C" },
      { key: "brand-900", label: "Marca 900", value: "#082B5E" },
    ],
  },
  {
    id: "claro",
    label: "Superfícies claras",
    hint: "Fundo, cartões, bordas e texto suave no tema claro.",
    tokens: [
      { key: "canvas", label: "Fundo da aplicação", value: "#F7F8F9" },
      { key: "paper-DEFAULT", label: "Cartão / painel", value: "#FFFFFF" },
      { key: "paper-50", label: "Superfície 50", value: "#F7F8F9" },
      { key: "paper-100", label: "Superfície 100 / divisórias", value: "#F1F2F4" },
      { key: "paper-200", label: "Borda", value: "#DCDFE4" },
      { key: "paper-300", label: "Borda forte", value: "#DCDFE4" },
      { key: "paper-400", label: "Texto discreto", value: "#8590A2" },
      { key: "paper-500", label: "Texto secundário", value: "#626F86" },
      { key: "paper-600", label: "Texto de apoio", value: "#44546F" },
    ],
  },
  {
    id: "escuro",
    label: "Superfícies escuras",
    hint: "Usadas no tema escuro e nas telas de chamada.",
    tokens: [
      { key: "ink-DEFAULT", label: "Texto principal (claro)", value: "#18191A" },
      { key: "ink-950", label: "Fundo da página", value: "#18191A" },
      { key: "ink-900", label: "Painel / coluna", value: "#1F1F21" },
      { key: "ink-800", label: "Cartão elevado / input", value: "#242528" },
      { key: "ink-750", label: "Modal / menu", value: "#2B2C2F" },
      { key: "ink-700", label: "Borda sólida", value: "#3D3F43" },
      { key: "ink-600", label: "Borda suave", value: "#4A525A" },
      { key: "ink-500", label: "Borda de input", value: "#7E8188" },
      { key: "ink-400", label: "Texto discretíssimo", value: "#96999E" },
      { key: "ink-300", label: "Texto discreto", value: "#A9ABAF" },
      { key: "ink-200", label: "Texto padrão", value: "#CECFD2" },
    ],
  },
  {
    id: "status",
    label: "Status",
    hint: "Sucesso, atenção e erro.",
    tokens: [
      { key: "success", label: "Sucesso", value: "#22A06B" },
      { key: "warning", label: "Atenção", value: "#E56910" },
      { key: "danger", label: "Erro", value: "#E2483D" },
    ],
  },
  {
    id: "neutros",
    label: "Escala neutra",
    hint: "Cinzas canônicos usados em código novo.",
    tokens: [
      { key: "neutral-0", label: "Neutro 0", value: "#FFFFFF" },
      { key: "neutral-50", label: "Neutro 50", value: "#F7F8F9" },
      { key: "neutral-100", label: "Neutro 100", value: "#F1F2F4" },
      { key: "neutral-200", label: "Neutro 200", value: "#DCDFE4" },
      { key: "neutral-300", label: "Neutro 300", value: "#B3B9C4" },
      { key: "neutral-400", label: "Neutro 400", value: "#8590A2" },
      { key: "neutral-500", label: "Neutro 500", value: "#626F86" },
      { key: "neutral-600", label: "Neutro 600", value: "#44546F" },
      { key: "neutral-700", label: "Neutro 700", value: "#44546F" },
      { key: "neutral-800", label: "Neutro 800", value: "#2C3E5D" },
      { key: "neutral-900", label: "Neutro 900", value: "#172B4D" },
    ],
  },
  {
    id: "hues",
    label: "Escalas de cor",
    hint: "Rótulos, gráficos e colunas de quadro.",
    tokens: [
      { key: "blue-50", label: "Azul 50", value: "#E9F2FF" },
      { key: "blue-100", label: "Azul 100", value: "#CCE0FF" },
      { key: "blue-200", label: "Azul 200", value: "#85B8FF" },
      { key: "blue-300", label: "Azul 300", value: "#579DFF" },
      { key: "blue-400", label: "Azul 400", value: "#388BFF" },
      { key: "blue-500", label: "Azul 500", value: "#0C66E4" },
      { key: "blue-600", label: "Azul 600", value: "#0055CC" },
      { key: "blue-700", label: "Azul 700", value: "#09326C" },
      { key: "green-50", label: "Verde 50", value: "#DCFFF1" },
      { key: "green-100", label: "Verde 100", value: "#DCFFF1" },
      { key: "green-400", label: "Verde 400", value: "#4BCE97" },
      { key: "green-500", label: "Verde 500", value: "#22A06B" },
      { key: "green-600", label: "Verde 600", value: "#1F845A" },
      { key: "green-700", label: "Verde 700", value: "#216E4E" },
      { key: "green-900", label: "Verde 900", value: "#164B35" },
      { key: "red-50", label: "Vermelho 50", value: "#FFECEB" },
      { key: "red-100", label: "Vermelho 100", value: "#FFECEB" },
      { key: "red-200", label: "Vermelho 200", value: "#FFD5D2" },
      { key: "red-400", label: "Vermelho 400", value: "#F87168" },
      { key: "red-500", label: "Vermelho 500", value: "#E2483D" },
      { key: "red-600", label: "Vermelho 600", value: "#C9372C" },
      { key: "red-700", label: "Vermelho 700", value: "#AE2E24" },
      { key: "orange-100", label: "Laranja 100", value: "#FFF3EB" },
      { key: "orange-400", label: "Laranja 400", value: "#FCA700" },
      { key: "orange-500", label: "Laranja 500", value: "#E56910" },
      { key: "orange-700", label: "Laranja 700", value: "#A54800" },
      { key: "yellow-100", label: "Amarelo 100", value: "#FFF7D6" },
      { key: "yellow-500", label: "Amarelo 500", value: "#E2B203" },
      { key: "yellow-700", label: "Amarelo 700", value: "#946F00" },
      { key: "purple-50", label: "Roxo 50", value: "#F3F0FF" },
      { key: "purple-100", label: "Roxo 100", value: "#DFD8FD" },
      { key: "purple-200", label: "Roxo 200", value: "#B8ACF6" },
      { key: "purple-300", label: "Roxo 300", value: "#B8ACF6" },
      { key: "purple-400", label: "Roxo 400", value: "#9F8FEF" },
      { key: "purple-500", label: "Roxo 500", value: "#8270DB" },
      { key: "purple-600", label: "Roxo 600", value: "#6E5DC6" },
      { key: "purple-700", label: "Roxo 700", value: "#5E4DB2" },
      { key: "purple-800", label: "Roxo 800", value: "#352C63" },
      { key: "purple-900", label: "Roxo 900", value: "#231C3F" },
      { key: "magenta-50", label: "Magenta 50", value: "#FFECF8" },
      { key: "magenta-100", label: "Magenta 100", value: "#FDD0EC" },
      { key: "magenta-200", label: "Magenta 200", value: "#F797D2" },
      { key: "magenta-300", label: "Magenta 300", value: "#E774BB" },
      { key: "magenta-400", label: "Magenta 400", value: "#DA62AC" },
      { key: "magenta-500", label: "Magenta 500", value: "#CD519D" },
      { key: "magenta-600", label: "Magenta 600", value: "#AE4787" },
      { key: "magenta-700", label: "Magenta 700", value: "#943D73" },
      { key: "magenta-800", label: "Magenta 800", value: "#50253F" },
      { key: "magenta-900", label: "Magenta 900", value: "#3D2232" },
      { key: "teal-50", label: "Ciano 50", value: "#E7F9FF" },
      { key: "teal-100", label: "Ciano 100", value: "#C6EDFB" },
      { key: "teal-200", label: "Ciano 200", value: "#9DD9EE" },
      { key: "teal-300", label: "Ciano 300", value: "#6CC3E0" },
      { key: "teal-400", label: "Ciano 400", value: "#42B2D7" },
      { key: "teal-500", label: "Ciano 500", value: "#2898BD" },
      { key: "teal-600", label: "Ciano 600", value: "#227D9B" },
      { key: "teal-700", label: "Ciano 700", value: "#206A83" },
      { key: "teal-800", label: "Ciano 800", value: "#164555" },
      { key: "teal-900", label: "Ciano 900", value: "#153337" },
      { key: "lime-50", label: "Lima 50", value: "#EFFFD6" },
      { key: "lime-100", label: "Lima 100", value: "#D3F1A7" },
      { key: "lime-200", label: "Lima 200", value: "#B3DF72" },
      { key: "lime-300", label: "Lima 300", value: "#B3DF72" },
      { key: "lime-400", label: "Lima 400", value: "#82B536" },
      { key: "lime-500", label: "Lima 500", value: "#6A9A23" },
      { key: "lime-600", label: "Lima 600", value: "#5B7F24" },
      { key: "lime-700", label: "Lima 700", value: "#4C6B1F" },
      { key: "lime-800", label: "Lima 800", value: "#37471F" },
      { key: "lime-900", label: "Lima 900", value: "#28311B" },
    ],
  },
  {
    id: "atendimento",
    label: "Atendimento",
    hint: "Réplica da interface do Chatwoot na caixa de entrada.",
    tokens: [
      { key: "cw-500", label: "Azul do atendimento", value: "#1F93FF" },
      { key: "cw-600", label: "Azul 600", value: "#1B7FDB" },
      { key: "cw-700", label: "Azul 700", value: "#135FA5" },
      { key: "cw-bubble", label: "Bolha do agente", value: "#E5F2FF" },
      { key: "cw-bubble-border", label: "Borda da bolha", value: "#CFE5FB" },
      { key: "cw-bubble-in", label: "Bolha do contato", value: "#FFFFFF" },
      { key: "cw-note", label: "Nota interna", value: "#FFF8E5" },
      { key: "cw-note-border", label: "Borda da nota", value: "#FFE1A6" },
      { key: "cw-note-ink", label: "Texto da nota", value: "#8A6100" },
      { key: "cw-ink", label: "Texto", value: "#3C4858" },
      { key: "cw-muted", label: "Texto suave", value: "#6E7B8F" },
      { key: "cw-border", label: "Borda", value: "#E0E6ED" },
      { key: "cw-surface", label: "Superfície", value: "#F9FAFB" },
    ],
  },
]

export const COLOR_TOKENS: ColorToken[] = COLOR_GROUPS.flatMap((g) => g.tokens)

/**
 * Famílias tipográficas. Valor livre: qualquer pilha CSS válida serve, o que
 * permite apontar para uma fonte da empresa já carregada na página.
 */
export const FONT_TOKENS: TextToken[] = [
  {
    key: "sans",
    cssVar: "--wl-font-sans",
    label: "Fonte da interface",
    value:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, system-ui, sans-serif",
  },
  {
    key: "mono",
    cssVar: "--wl-font-mono",
    label: "Fonte monoespaçada",
    value: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
]

/** Arredondamento por tamanho de elemento. */
export const RADIUS_TOKENS: TextToken[] = [
  { key: "DEFAULT", cssVar: "--wl-radius", label: "Botões e campos", value: "0.1875rem" },
  { key: "md", cssVar: "--wl-radius-md", label: "Média", value: "0.375rem" },
  { key: "lg", cssVar: "--wl-radius-lg", label: "Grande", value: "0.5rem" },
  { key: "xl", cssVar: "--wl-radius-xl", label: "Cartões", value: "0.5rem" },
  { key: "2xl", cssVar: "--wl-radius-2xl", label: "Painéis", value: "0.625rem" },
  { key: "3xl", cssVar: "--wl-radius-3xl", label: "Modais", value: "0.75rem" },
]

/**
 * O que a pessoa realmente escolhe.
 *
 * `COLOR_GROUPS` acima é a lista completa de tokens — útil para quem quer
 * mexer num detalhe, inútil para quem só quer trocar a cor dos botões. Aqui
 * cada entrada é um ELEMENTO da tela ("Botões e links", "Fundo da página") e
 * sabe quais tokens pintar. É esta lista que a tela de Marca mostra primeiro.
 */
export type ElementControl = {
  id: string
  label: string
  hint: string
  /** Tokens pintados chapados com a cor escolhida. */
  tokens: string[]
  /**
   * Família cuja régua 50..900 é DERIVADA da cor escolhida (ver
   * `deriveScale`). Escolher o azul da marca não deveria obrigar ninguém a
   * inventar mais dez tons dele à mão.
   */
  scale?: string
}

export type ElementGroup = {
  id: string
  label: string
  hint: string
  controls: ElementControl[]
}

export const ELEMENT_GROUPS: ElementGroup[] = [
  {
    id: "marca",
    label: "Marca",
    hint: "A cor de ação do produto: botões, links, abas ativas e destaques.",
    controls: [
      {
        id: "brand",
        label: "Cor principal",
        hint: "Os tons mais claros e mais escuros saem desta cor.",
        tokens: [],
        scale: "brand",
      },
    ],
  },
  {
    id: "claro",
    label: "Tema claro",
    hint: "Como o produto aparece de dia.",
    controls: [
      { id: "canvas", label: "Fundo da página", hint: "Atrás de tudo.", tokens: ["canvas", "paper-50", "neutral-50"] },
      { id: "surface", label: "Cartões e painéis", hint: "Caixas que ficam sobre o fundo.", tokens: ["paper-DEFAULT", "neutral-0"] },
      { id: "divider", label: "Divisórias", hint: "Linhas finas entre seções.", tokens: ["paper-100", "neutral-100"] },
      { id: "border", label: "Bordas", hint: "Contorno de cartões e campos.", tokens: ["paper-200", "paper-300", "neutral-200"] },
      { id: "text", label: "Texto principal", hint: "Títulos e corpo.", tokens: ["ink-DEFAULT", "neutral-900"] },
      { id: "muted", label: "Texto secundário", hint: "Legendas e rótulos.", tokens: ["paper-500", "paper-600", "neutral-500"] },
      { id: "faint", label: "Texto discreto", hint: "Dicas e contagens.", tokens: ["paper-400", "neutral-400"] },
    ],
  },
  {
    id: "escuro",
    label: "Tema escuro",
    hint: "Também usado nas telas de chamada, que são sempre escuras.",
    controls: [
      { id: "dark-canvas", label: "Fundo da página", hint: "Atrás de tudo.", tokens: ["ink-950"] },
      { id: "dark-surface", label: "Painéis e colunas", hint: "Sidebar, colunas do quadro.", tokens: ["ink-900"] },
      { id: "dark-raised", label: "Cartões e campos", hint: "Caixas sobre o painel.", tokens: ["ink-800"] },
      { id: "dark-overlay", label: "Menus e modais", hint: "O que abre por cima.", tokens: ["ink-750"] },
      { id: "dark-border", label: "Bordas", hint: "Contorno no escuro.", tokens: ["ink-700", "ink-600", "ink-500"] },
      { id: "dark-text", label: "Texto", hint: "Corpo no escuro.", tokens: ["ink-200"] },
      { id: "dark-muted", label: "Texto discreto", hint: "Legendas no escuro.", tokens: ["ink-300", "ink-400"] },
    ],
  },
  {
    id: "status",
    label: "Avisos",
    hint: "As três cores que o produto usa para dar notícia.",
    controls: [
      { id: "success", label: "Sucesso", hint: "Concluído, salvo, no prazo.", tokens: ["success", "green-500"] },
      { id: "warning", label: "Atenção", hint: "Prazo chegando, limite estourando.", tokens: ["warning", "orange-500"] },
      { id: "danger", label: "Erro", hint: "Falha, atraso, exclusão.", tokens: ["danger", "red-500"] },
    ],
  },
]

/** Tom mais claro (`#FFFFFF`) ou mais escuro (`#000000`) da mesma cor. */
export function mixHex(hex: string, target: "#FFFFFF" | "#000000", amount: number): string {
  const from = hexToChannels(hex)
  const to = hexToChannels(target)
  if (!from || !to) return hex
  const a = from.split(" ").map(Number)
  const b = to.split(" ").map(Number)
  const mixed = a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount))
  return `#${mixed.map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

/**
 * Régua 50..900 a partir de uma cor só.
 *
 * As proporções seguem a distância entre os tons da paleta original, então uma
 * marca nova cai na mesma cadência de contraste que o produto já usava — 500 é
 * a cor escolhida, abaixo clareia para fundos, acima escurece para hover e
 * texto sobre claro.
 */
const SCALE_STEPS: [suffix: string, target: "#FFFFFF" | "#000000", amount: number][] = [
  ["50", "#FFFFFF", 0.92],
  ["100", "#FFFFFF", 0.8],
  ["200", "#FFFFFF", 0.55],
  ["300", "#FFFFFF", 0.38],
  ["400", "#FFFFFF", 0.18],
  ["500", "#FFFFFF", 0],
  ["600", "#000000", 0.18],
  ["700", "#000000", 0.45],
  ["800", "#000000", 0.5],
  ["900", "#000000", 0.58],
]

export function deriveScale(prefix: string, base: string): Record<string, string> {
  const out: Record<string, string> = { [`${prefix}-DEFAULT`]: base.toUpperCase() }
  for (const [suffix, target, amount] of SCALE_STEPS) {
    out[`${prefix}-${suffix}`] = mixHex(base, target, amount)
  }
  return out
}

/** Valor atual de um controle: o que foi escolhido, ou a cor de fábrica. */
export function elementDefault(control: ElementControl): string {
  const key = control.scale ? `${control.scale}-500` : control.tokens[0]
  return COLOR_TOKENS.find((t) => t.key === key)?.value ?? "#000000"
}

export function colorCssVar(key: string): string {
  return `--c-${key}`
}

/** `#0C66E4` → `12 102 228`, o formato que `rgb(... / <alpha>)` espera. */
export function hexToChannels(hex: string): string | null {
  const clean = hex.trim().replace(/^#/, "")
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const n = parseInt(full, 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/**
 * Paleta no formato que o Tailwind espera, com o hex original como fallback.
 *
 * `canvas` e `success` não têm hífen e viram cor simples; `brand-500` e
 * `cw-bubble-border` viram `brand.500` e `cw["bubble-border"]`.
 */
export function tailwindColors(): Record<string, string | Record<string, string>> {
  const palette: Record<string, string | Record<string, string>> = {}
  for (const token of COLOR_TOKENS) {
    const fallback = hexToChannels(token.value) ?? "0 0 0"
    const value = `rgb(var(${colorCssVar(token.key)}, ${fallback}) / <alpha-value>)`
    const cut = token.key.indexOf("-")
    if (cut === -1) {
      palette[token.key] = value
      continue
    }
    const family = token.key.slice(0, cut)
    const shade = token.key.slice(cut + 1)
    const scale = (palette[family] ??= {}) as Record<string, string>
    scale[shade] = value
  }
  return palette
}

export function tailwindFontFamily(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const token of FONT_TOKENS) out[token.key] = `var(${token.cssVar}, ${token.value})`
  return out
}

export function tailwindBorderRadius(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const token of RADIUS_TOKENS) out[token.key] = `var(${token.cssVar}, ${token.value})`
  return out
}
