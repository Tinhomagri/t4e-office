// Paleta do Command Deck.
//
// O deck tem uma "pele" própria (cockpit, leitura densa) — mas segue o tema
// claro/escuro do resto do app, como qualquer outra tela. Os tons vêm de
// variáveis CSS (`--deck-*` em src/index.css, com override em `.dark`), então
// nenhum componente aqui precisa saber qual tema está ativo: troca sozinho
// quando a classe `.dark` liga/desliga no `<html>`.
//
// Série de cores: uma sequência categórica de 6 tons distinguíveis também em
// deuteranopia (azul → ciano → âmbar → violeta → verde → rosa). Nunca use cor
// como único portador de informação: todo gráfico tem rótulo ou tooltip.

export const DECK = {
  /** Fundo do deck e das camadas empilhadas sobre ele. */
  bg: "var(--deck-bg)",
  surface: "var(--deck-surface)",
  surfaceHi: "var(--deck-surface-hi)",
  border: "var(--deck-border)",
  borderHi: "var(--deck-border-hi)",
  grid: "var(--deck-grid)",
  text: "var(--deck-text)",
  textDim: "var(--deck-text-dim)",
  textFaint: "var(--deck-text-faint)",
  /**
   * Texto sobre preenchimentos coloridos (barra do funil, séries) — as cores
   * de série são sempre médio/saturadas, então um tom quase-preto fixo lê bem
   * em cima delas nos dois temas. Não é "o fundo do deck", é contraste local.
   */
  onFill: "#0A0B0D",
  /** Sobreposições sutis (hover, faixa ativa) — claras no tema dark, escuras no light. */
  overlay1: "var(--deck-overlay-1)",
  overlay2: "var(--deck-overlay-2)",
  overlay3: "var(--deck-overlay-3)",
} as const

/** Série categórica do deck. Índice estável: mesma entidade, mesma cor. */
export const SERIES = [
  "#579DFF", // azul
  "#3BC9DB", // ciano
  "#FCA700", // âmbar
  "#A78BFA", // violeta
  "#4BCE97", // verde
  "#F87168", // rosa/vermelho
] as const

export const TONE = {
  positive: "#4BCE97",
  negative: "#F87168",
  warning: "#FCA700",
  accent: "#579DFF",
} as const

export function seriesColor(i: number): string {
  return SERIES[i % SERIES.length]
}

/** Rampa do heatmap: 5 degraus de intensidade sobre o fundo do deck. */
export const HEAT = [
  "var(--deck-heat-0)",
  "var(--deck-heat-1)",
  "var(--deck-heat-2)",
  "var(--deck-heat-3)",
  "var(--deck-heat-4)",
] as const

/** Formatação monetária compacta usada nos eixos e KPIs do deck. */
export function compact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`
  return `R$ ${value.toFixed(0)}`
}

export function full(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}
