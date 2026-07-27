// Marcadores de motion do deck.
//
// Vivem sozinhos, sem importar GSAP, para que `DeckCard` possa carimbar o
// atributo sem arrastar a lib de animação para todo uso da primitiva. Quem
// anima (`deck.motion.ts`) importa daqui; quem só marca, também.
//
// São atributos `data-*` e não classes CSS de propósito: classe é estilo, e
// um `className` renomeado no Tailwind quebraria a animação em silêncio.

export const MARK = {
  /** Título do deck: recebe SplitText por caractere. */
  title: "data-deck-title",
  /** Card de KPI: entra na cascata da abertura. */
  kpi: "data-deck-kpi",
  /** Painel: revela ao entrar no viewport. */
  panel: "data-deck-panel",
  /** Faixa do funil: escala em X na abertura. */
  bar: "data-deck-bar",
  /** Arco do gauge: desenhado via DrawSVG. */
  arc: "data-deck-arc",
  /** Linha da tabela: alvo do FLIP no drill-down. */
  row: "data-deck-row",
} as const

/** Seletor CSS de um marcador. */
export const sel = (mark: string) => `[${mark}]`

/** Açúcar para carimbar o marcador num JSX: `{...mark(MARK.kpi)}`. */
export const mark = (name: string) => ({ [name]: "" })
