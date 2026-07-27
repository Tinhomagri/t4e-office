// Paleta do Command Deck.
//
// O deck é uma quebra deliberada do design system: superfície escura mesmo no
// tema claro, porque é uma tela de leitura densa (cockpit), não de edição. Para
// a quebra não virar bagunça, ela é *fechada aqui* — nenhum hex solto nos
// componentes, e nada disto vaza para o resto do app.
//
// Série de cores: uma sequência categórica de 6 tons distinguíveis também em
// deuteranopia (azul → ciano → âmbar → violeta → verde → rosa). Nunca use cor
// como único portador de informação: todo gráfico tem rótulo ou tooltip.

export const DECK = {
  /** Fundo do deck e das camadas empilhadas sobre ele. */
  bg: "#0A0B0D",
  surface: "#141619",
  surfaceHi: "#1B1E23",
  border: "rgb(255 255 255 / 0.08)",
  borderHi: "rgb(255 255 255 / 0.14)",
  grid: "rgb(255 255 255 / 0.06)",
  text: "#F1F2F4",
  textDim: "#8A8C93",
  textFaint: "#63656C",
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
  "rgb(255 255 255 / 0.05)",
  "rgb(87 157 255 / 0.28)",
  "rgb(87 157 255 / 0.50)",
  "rgb(87 157 255 / 0.74)",
  "rgb(87 157 255 / 1)",
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
