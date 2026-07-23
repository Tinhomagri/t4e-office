// Móveis e objetos do escritório, desenhados em pixel art procedural.
//
// Cada prop declara seu tamanho em tiles, a área que bloqueia passagem e o
// "pé" (baseline) usado para ordenar profundidade: quem tem o pé mais abaixo na
// tela é desenhado por cima. É o truque clássico de top-down 2.5D.
import { COLORS, INK, TILE } from "./tiles"
import { type Ctx, chamfer, makeCanvas, mix, outline, px, rect, shade, tint } from "./pixels"

export interface PropSprite {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

export interface PropDef {
  /** Largura/altura em pixels do sprite (múltiplos de 16 na maior parte). */
  w: number
  h: number
  /** Retângulo de colisão em pixels, relativo ao canto superior esquerdo. */
  solid?: { x: number; y: number; w: number; h: number } | null
  /** Deslocamento do pé em relação ao topo — define a ordem de desenho. */
  baseline?: number
  draw(ctx: Ctx): void
}

const WOOD = "#8a6440"
const WOOD_L = "#a87d51"
const DESK = "#b98d5f"
const SCREEN_OFF = "#2f3a44"
const SCREEN_ON = "#7fb2d9"
const CHAIR = "#4a5a6b"
const CHAIR_D = shade(CHAIR, 0.72)

// ── Peças reutilizadas ──────────────────────────────────────────────────────

/** Tampo com espessura + duas pernas — a base de mesas e balcões. */
function tabletop(ctx: Ctx, x: number, y: number, w: number, h: number, top = DESK): void {
  const dark = shade(top, 0.74)
  chamfer(ctx, x, y, w, h, top)
  rect(ctx, x + 1, y + h - 2, w - 2, 2, dark) // espessura do tampo
  rect(ctx, x + 1, y + 1, w - 2, 1, tint(top, 1.1)) // luz na quina superior
  outline(ctx, x, y, w, h, INK)
  px(ctx, x, y, "rgba(0,0,0,0)")
}

function legs(ctx: Ctx, x: number, y: number, w: number, h: number, c = WOOD): void {
  rect(ctx, x + 1, y, 2, h, c)
  rect(ctx, x + w - 3, y, 2, h, c)
  rect(ctx, x + 1, y + h - 1, 2, 1, INK)
  rect(ctx, x + w - 3, y + h - 1, 2, 1, INK)
}

function monitor(ctx: Ctx, x: number, y: number, on: boolean): void {
  // Pé + haste.
  rect(ctx, x + 4, y + 11, 6, 1, "#3b444d")
  rect(ctx, x + 6, y + 9, 2, 2, "#4a545e")
  // Carcaça e tela.
  chamfer(ctx, x + 1, y, 12, 10, "#3b444d")
  rect(ctx, x + 2, y + 1, 10, 7, on ? SCREEN_ON : SCREEN_OFF)
  if (on) {
    // Linhas de "código" na tela: 3 barras de larguras diferentes.
    rect(ctx, x + 3, y + 2, 5, 1, mix(SCREEN_ON, "#ffffff", 0.6))
    rect(ctx, x + 3, y + 4, 7, 1, mix(SCREEN_ON, "#ffffff", 0.35))
    rect(ctx, x + 3, y + 6, 4, 1, mix(SCREEN_ON, "#ffffff", 0.45))
  }
  outline(ctx, x + 1, y, 12, 10, INK)
}

function keyboard(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y, 10, 3, "#c8c2b6")
  rect(ctx, x, y + 2, 10, 1, "#9a948a")
  for (let i = 0; i < 9; i += 2) px(ctx, x + i + 1, y + 1, "#8d877d")
}

function mug(ctx: Ctx, x: number, y: number, color = "#c85a4a"): void {
  rect(ctx, x, y, 4, 4, color)
  rect(ctx, x, y, 4, 1, tint(color, 1.2))
  rect(ctx, x + 4, y + 1, 1, 2, color)
  rect(ctx, x + 1, y + 1, 2, 1, "#4a342a") // café
  outline(ctx, x, y, 4, 4, INK)
}

// ── Definições ──────────────────────────────────────────────────────────────

export const PROPS: Record<string, PropDef> = {
  // Mesa de trabalho 2×1 tiles, com monitor, teclado e caneca.
  desk: {
    w: 32,
    h: 24,
    solid: { x: 0, y: 10, w: 32, h: 12 },
    baseline: 22,
    draw(ctx) {
      legs(ctx, 2, 18, 28, 6)
      tabletop(ctx, 0, 8, 32, 12)
      monitor(ctx, 8, 0, true)
      keyboard(ctx, 10, 12)
      mug(ctx, 25, 11)
      // Sombra de contato no chão.
      rect(ctx, 2, 23, 28, 1, "rgba(43,30,26,0.25)")
    },
  },

  // Mesa dupla (ilha do open space) 2×2.
  deskIsland: {
    w: 32,
    h: 34,
    solid: { x: 0, y: 8, w: 32, h: 22 },
    baseline: 32,
    draw(ctx) {
      legs(ctx, 2, 26, 28, 6)
      tabletop(ctx, 0, 6, 32, 22)
      monitor(ctx, 2, 0, true)
      monitor(ctx, 18, 0, false)
      keyboard(ctx, 3, 16)
      keyboard(ctx, 19, 16)
      mug(ctx, 15, 20, "#5a8a6b")
      rect(ctx, 2, 33, 28, 1, "rgba(43,30,26,0.25)")
    },
  },

  chair: {
    w: 16,
    h: 20,
    solid: { x: 3, y: 10, w: 10, h: 8 },
    baseline: 19,
    draw(ctx) {
      // Encosto.
      chamfer(ctx, 3, 0, 10, 9, CHAIR)
      rect(ctx, 4, 1, 8, 1, tint(CHAIR, 1.2))
      outline(ctx, 3, 0, 10, 9, INK)
      // Assento.
      chamfer(ctx, 2, 9, 12, 5, CHAIR_D)
      outline(ctx, 2, 9, 12, 5, INK)
      // Coluna + base em estrela.
      rect(ctx, 7, 14, 2, 3, "#3b444d")
      rect(ctx, 3, 17, 10, 1, "#3b444d")
      px(ctx, 3, 18, "#2f363d")
      px(ctx, 12, 18, "#2f363d")
      rect(ctx, 3, 19, 10, 1, "rgba(43,30,26,0.25)")
    },
  },

  plant: {
    w: 16,
    h: 24,
    solid: { x: 4, y: 16, w: 8, h: 6 },
    baseline: 23,
    draw(ctx) {
      // Folhagem: 3 camadas de tom para dar volume sem virar mancha.
      const g = COLORS.plant
      const gd = COLORS.plantDark
      rect(ctx, 6, 0, 4, 4, g)
      rect(ctx, 3, 3, 10, 6, g)
      rect(ctx, 2, 6, 12, 5, g)
      rect(ctx, 2, 9, 12, 2, gd)
      rect(ctx, 4, 4, 3, 2, tint(g, 1.18))
      for (let i = 0; i < 6; i++) px(ctx, 3 + i * 2, 7 + (i % 2), gd)
      // Vaso de barro.
      chamfer(ctx, 4, 12, 8, 8, "#a8623f")
      rect(ctx, 4, 12, 8, 2, tint("#a8623f", 1.15))
      rect(ctx, 5, 18, 6, 2, shade("#a8623f", 0.72))
      outline(ctx, 4, 12, 8, 8, INK)
      rect(ctx, 4, 21, 8, 1, "rgba(43,30,26,0.25)")
    },
  },

  sofa: {
    w: 48,
    h: 24,
    solid: { x: 0, y: 6, w: 48, h: 14 },
    baseline: 22,
    draw(ctx) {
      const c = "#7a6a8a"
      const d = shade(c, 0.74)
      // Encosto.
      chamfer(ctx, 0, 0, 48, 10, c)
      rect(ctx, 1, 1, 46, 1, tint(c, 1.15))
      // Almofadas do assento.
      for (let i = 0; i < 3; i++) {
        chamfer(ctx, 2 + i * 15, 9, 14, 9, d)
        outline(ctx, 2 + i * 15, 9, 14, 9, INK)
      }
      // Braços.
      chamfer(ctx, 0, 6, 4, 13, shade(c, 0.86))
      chamfer(ctx, 44, 6, 4, 13, shade(c, 0.86))
      outline(ctx, 0, 0, 48, 20, INK)
      rect(ctx, 3, 20, 42, 2, "#4a3f2f")
      rect(ctx, 2, 23, 44, 1, "rgba(43,30,26,0.25)")
    },
  },

  coffeeTable: {
    w: 32,
    h: 18,
    solid: { x: 0, y: 4, w: 32, h: 11 },
    baseline: 17,
    draw(ctx) {
      legs(ctx, 2, 12, 28, 5)
      tabletop(ctx, 0, 2, 32, 11, WOOD_L)
      mug(ctx, 6, 4, "#4a6fa5")
      // Pilha de revistas.
      rect(ctx, 18, 5, 9, 2, "#c9a04a")
      rect(ctx, 19, 4, 8, 1, "#d8b45f")
      rect(ctx, 2, 17, 28, 1, "rgba(43,30,26,0.25)")
    },
  },

  whiteboard: {
    w: 48,
    h: 26,
    solid: { x: 0, y: 18, w: 48, h: 6 },
    baseline: 24,
    draw(ctx) {
      chamfer(ctx, 0, 0, 48, 22, "#eceae2")
      outline(ctx, 0, 0, 48, 22, "#8d877d")
      rect(ctx, 1, 1, 46, 1, "#ffffff")
      // Rabiscos: um gráfico de barras subindo e um fluxo.
      rect(ctx, 5, 14, 2, 4, "#4a6fa5")
      rect(ctx, 8, 11, 2, 7, "#4a6fa5")
      rect(ctx, 11, 8, 2, 10, "#4a6fa5")
      rect(ctx, 4, 18, 12, 1, "#6b6560")
      rect(ctx, 22, 6, 8, 5, "#c85a4a")
      rect(ctx, 34, 6, 8, 5, "#5a8a6b")
      rect(ctx, 30, 8, 4, 1, "#6b6560")
      rect(ctx, 26, 12, 1, 4, "#6b6560")
      rect(ctx, 22, 16, 8, 3, "#c9a04a")
      // Calha das canetas.
      rect(ctx, 2, 22, 44, 2, "#b0aa9e")
      rect(ctx, 6, 22, 5, 1, "#c85a4a")
      rect(ctx, 13, 22, 5, 1, "#4a6fa5")
      rect(ctx, 2, 25, 44, 1, "rgba(43,30,26,0.25)")
    },
  },

  coffeeMachine: {
    w: 16,
    h: 26,
    solid: { x: 1, y: 12, w: 14, h: 10 },
    baseline: 24,
    draw(ctx) {
      // Corpo.
      chamfer(ctx, 1, 4, 14, 18, "#4a4f57")
      rect(ctx, 2, 5, 12, 1, tint("#4a4f57", 1.25))
      outline(ctx, 1, 4, 14, 18, INK)
      // Painel + luz de pronto.
      rect(ctx, 3, 7, 10, 4, "#2f353b")
      px(ctx, 4, 8, "#7fd9a0")
      rect(ctx, 6, 8, 6, 1, "#5f6b75")
      // Bico e bandeja.
      rect(ctx, 6, 11, 4, 3, "#8a9099")
      rect(ctx, 3, 17, 10, 1, "#8a9099")
      rect(ctx, 2, 18, 12, 3, "#3b4046")
      // Xícara sob o bico.
      rect(ctx, 7, 14, 3, 3, "#e0dbd0")
      rect(ctx, 2, 25, 12, 1, "rgba(43,30,26,0.25)")
    },
  },

  bookshelf: {
    w: 32,
    h: 34,
    solid: { x: 0, y: 20, w: 32, h: 12 },
    baseline: 32,
    draw(ctx) {
      chamfer(ctx, 0, 0, 32, 32, WOOD)
      outline(ctx, 0, 0, 32, 32, INK)
      const shelfColors = ["#a54a3c", "#4a6fa5", "#6b8e5a", "#c9a04a", "#7a6ba0", "#b0653f"]
      // 3 prateleiras de livros com alturas irregulares.
      for (let s = 0; s < 3; s++) {
        const y = 3 + s * 10
        rect(ctx, 2, y + 7, 28, 1, shade(WOOD, 0.7))
        let x = 3
        let i = 0
        while (x < 28) {
          const bw = 2 + ((s + i) % 3)
          const bh = 5 + ((i + s) % 3)
          rect(ctx, x, y + 7 - bh, bw, bh, shelfColors[(s * 2 + i) % shelfColors.length])
          rect(ctx, x, y + 7 - bh, bw, 1, "rgba(255,255,255,0.18)")
          x += bw + 1
          i++
        }
      }
      rect(ctx, 2, 33, 28, 1, "rgba(43,30,26,0.25)")
    },
  },

  waterCooler: {
    w: 16,
    h: 28,
    solid: { x: 3, y: 16, w: 10, h: 8 },
    baseline: 26,
    draw(ctx) {
      // Garrafão translúcido.
      chamfer(ctx, 3, 0, 10, 12, "#8fc4d8")
      rect(ctx, 4, 1, 3, 9, "#b5dced")
      outline(ctx, 3, 0, 10, 12, INK)
      // Bebedouro.
      chamfer(ctx, 2, 12, 12, 12, "#d8d2c8")
      outline(ctx, 2, 12, 12, 12, INK)
      rect(ctx, 6, 16, 4, 2, "#5f6b75")
      px(ctx, 7, 18, "#8fc4d8")
      rect(ctx, 3, 21, 10, 2, "#b0aa9e")
      rect(ctx, 2, 27, 12, 1, "rgba(43,30,26,0.25)")
    },
  },

  arcade: {
    w: 16,
    h: 32,
    solid: { x: 1, y: 18, w: 14, h: 12 },
    baseline: 30,
    draw(ctx) {
      // Gabinete.
      chamfer(ctx, 1, 0, 14, 30, "#7a3f52")
      outline(ctx, 1, 0, 14, 30, INK)
      rect(ctx, 2, 1, 12, 1, tint("#7a3f52", 1.2))
      // Marquise acesa.
      rect(ctx, 2, 2, 12, 3, "#f0c05a")
      rect(ctx, 3, 3, 10, 1, "#fff0c0")
      // Tela do jogo.
      rect(ctx, 2, 6, 12, 9, "#1d2430")
      rect(ctx, 4, 12, 3, 1, "#7fd9a0")
      rect(ctx, 9, 9, 2, 2, "#e2483d")
      px(ctx, 6, 9, "#f0c05a")
      // Painel de controle.
      rect(ctx, 2, 16, 12, 4, "#5c2f3d")
      px(ctx, 5, 17, "#e2483d")
      px(ctx, 7, 17, "#4a6fa5")
      px(ctx, 9, 17, "#c9a04a")
      rect(ctx, 2, 31, 12, 1, "rgba(43,30,26,0.25)")
    },
  },

  lamp: {
    w: 16,
    h: 30,
    solid: { x: 5, y: 22, w: 6, h: 5 },
    baseline: 28,
    draw(ctx) {
      // Cúpula.
      chamfer(ctx, 2, 2, 12, 8, "#e8d2a0")
      rect(ctx, 3, 3, 10, 2, "#f5e6c0")
      outline(ctx, 2, 2, 12, 8, "#a8916a")
      // Haste e base.
      rect(ctx, 7, 10, 2, 13, "#8a8175")
      chamfer(ctx, 4, 23, 8, 4, "#6b6560")
      outline(ctx, 4, 23, 8, 4, INK)
      rect(ctx, 3, 29, 10, 1, "rgba(43,30,26,0.25)")
    },
  },

  meetingTable: {
    w: 80,
    h: 44,
    solid: { x: 0, y: 6, w: 80, h: 32 },
    baseline: 42,
    draw(ctx) {
      legs(ctx, 6, 34, 68, 7)
      // Tampo oval: cantos recortados em dois níveis.
      const top = "#9d7a55"
      rect(ctx, 6, 4, 68, 32, top)
      rect(ctx, 3, 8, 74, 24, top)
      rect(ctx, 1, 12, 78, 16, top)
      rect(ctx, 6, 5, 68, 1, tint(top, 1.14))
      rect(ctx, 3, 33, 74, 3, shade(top, 0.74))
      // Objetos sobre a mesa.
      rect(ctx, 20, 14, 10, 7, "#3b444d") // laptop
      rect(ctx, 21, 15, 8, 5, SCREEN_ON)
      rect(ctx, 19, 21, 12, 1, "#c8c2b6")
      mug(ctx, 44, 15, "#c85a4a")
      mug(ctx, 56, 22, "#4a6fa5")
      rect(ctx, 34, 24, 8, 5, "#eceae2") // papéis
      rect(ctx, 35, 25, 6, 1, "#a09a90")
      rect(ctx, 35, 27, 5, 1, "#a09a90")
      rect(ctx, 4, 43, 72, 1, "rgba(43,30,26,0.25)")
    },
  },

  rugRound: {
    w: 48,
    h: 32,
    solid: null,
    baseline: 0,
    draw(ctx) {
      // Tom frio: precisa contrastar com o assoalho quente E com o roxo do
      // sofá. Um tapete cor de madeira simplesmente some no chão.
      const c = "#647a86"
      const d = shade(c, 0.82)
      // Elipse por faixas — sem antialias, tudo em degraus de pixel.
      const bands = [
        [8, 0, 32, 4],
        [4, 4, 40, 4],
        [1, 8, 46, 16],
        [4, 24, 40, 4],
        [8, 28, 32, 4],
      ] as const
      for (const [x, y, w, h] of bands) rect(ctx, x, y, w, h, c)
      for (const [x, y, w, h] of bands) rect(ctx, x + 3, y === 8 ? y + 4 : y, w - 6, Math.max(1, h - 2), d)
      rect(ctx, 14, 13, 20, 6, mix(c, "#e8d6b8", 0.5))
      rect(ctx, 18, 15, 12, 2, c)
      // Franjas nas pontas — o detalhe que faz ler "tapete" e não "mancha".
      for (let x = 10; x < 38; x += 3) {
        rect(ctx, x, 0, 1, 1, d)
        rect(ctx, x, 31, 1, 1, d)
      }
    },
  },

  // Divisória baixa do open space: bloqueia, mas deixa ver por cima.
  partition: {
    w: 16,
    h: 20,
    solid: { x: 0, y: 10, w: 16, h: 8 },
    baseline: 18,
    draw(ctx) {
      chamfer(ctx, 0, 0, 16, 17, "#8f9a8c")
      rect(ctx, 1, 1, 14, 1, tint("#8f9a8c", 1.15))
      rect(ctx, 1, 14, 14, 3, shade("#8f9a8c", 0.78))
      outline(ctx, 0, 0, 16, 17, INK)
      for (let x = 2; x < 15; x += 3) rect(ctx, x, 3, 1, 10, shade("#8f9a8c", 0.88))
      rect(ctx, 1, 19, 14, 1, "rgba(43,30,26,0.25)")
    },
  },
}

export type PropKind = keyof typeof PROPS

/** Rasteriza todos os props uma vez; o loop só faz blit. */
export function buildPropSprites(): Record<string, PropSprite> {
  const out: Record<string, PropSprite> = {}
  for (const [name, def] of Object.entries(PROPS)) {
    const { canvas, ctx } = makeCanvas(def.w, def.h)
    def.draw(ctx)
    out[name] = { canvas, w: def.w, h: def.h }
  }
  return out
}

/** Sombra elíptica sob os avatares — desenhada pelo mundo, não pelo sprite. */
export function buildShadowSprite(): PropSprite {
  const w = 12
  const h = 5
  const { canvas, ctx } = makeCanvas(w, h)
  const c = "rgba(43,30,26,0.28)"
  rect(ctx, 3, 0, 6, 1, c)
  rect(ctx, 1, 1, 10, 3, c)
  rect(ctx, 3, 4, 6, 1, c)
  return { canvas, w, h }
}

export { TILE }
