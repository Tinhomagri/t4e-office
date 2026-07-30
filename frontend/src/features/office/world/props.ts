// Móveis e objetos do escritório, desenhados em pixel art procedural.
//
// Cada prop declara seu tamanho em tiles, a área que bloqueia passagem e o
// "pé" (baseline) usado para ordenar profundidade: quem tem o pé mais abaixo na
// tela é desenhado por cima. É o truque clássico de top-down 2.5D.
import { COLORS, INK, TILE } from "./tiles"
import { type Ctx, chamfer, hash2, makeCanvas, mix, outline, px, rect, shade, tint } from "./pixels"
import { isoBox, isoCanvasFor, isoPanel, pt } from "./isoProps"

export interface PropSprite {
  canvas: HTMLCanvasElement
  w: number
  h: number
  /** Camada de frente, desenhada depois dos avatares (ex.: encosto de cadeira). */
  front?: HTMLCanvasElement
}

export interface PropDef {
  /** Largura/altura em pixels do CANVAS do sprite — pra props isométricos
   * (ver `isoProps.ts`) isso é maior que a pegada real no chão, porque sobra
   * espaço pro losango projetado + a altura do objeto. A pegada de colisão
   * de verdade é `solid`, não `w/h`. */
  w: number
  h: number
  /** Retângulo de colisão em pixels, relativo ao canto superior esquerdo do
   * MUNDO onde o prop foi colocado (cartesiano — independente de `anchor`). */
  solid?: { x: number; y: number; w: number; h: number } | null
  /** Deslocamento do pé em relação ao topo — define a ordem de desenho. */
  baseline?: number
  /** Ponto do canvas que corresponde à posição de mundo `p.x, p.y` do prop
   * (canto norte da pegada isométrica). Omitido = canto superior esquerdo do
   * canvas (comportamento antigo, sprite plano). */
  anchor?: { x: number; y: number }
  draw(ctx: Ctx): void
  /** Parte que deve ocultar apenas as pernas de quem está sentado. */
  drawFront?(ctx: Ctx): void
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

// ── Baia isométrica ──────────────────────────────────────────────────────
//
// Mesa (caixa com 3 faces) + divisória atrás (painel vertical) + monitor
// (caixa menor por cima) — volume de verdade em vez de ícone achatado
// cisalhado. `cubicle`/`cubicleFlip` só trocam de que lado a divisória fica
// (a abertura pro corredor troca de norte pra sul), pro par encostar de
// costas na planta — mesma ideia de antes, geometria nova.
const CUBICLE_W = 64
const CUBICLE_D = 20
const DESK_H = 14
const PANEL_H = 22
const CUBICLE_GEO = isoCanvasFor(CUBICLE_W, CUBICLE_D, DESK_H + PANEL_H)

const PLANT_GEO = isoCanvasFor(10, 10, 23)
const WATER_COOLER_GEO = isoCanvasFor(12, 12, 26)
const LAMP_GEO = isoCanvasFor(8, 8, 25)
const ELEVATOR_GEO = isoCanvasFor(64, 6, 36)
const POKER_TABLE_GEO = isoCanvasFor(256, 112, 18)
const POKER_SCREEN_GEO = isoCanvasFor(128, 8, 26)
const POKER_CONSOLE_GEO = isoCanvasFor(32, 20, 16)
const CHAIR_GEO = isoCanvasFor(12, 12, 16)

function drawCubicleBody(ctx: Ctx, flip: boolean): void {
  const { ax, ay } = CUBICLE_GEO
  const deskTop = "#b98d5f"

  // Divisória: painel vertical na borda de trás (norte pra `cubicle`, sul —
  // ou seja, a mesma borda espelhada — pra `cubicleFlip`).
  const panelAnchor = flip ? pt(ax, ay, 0, CUBICLE_D) : [ax, ay] as [number, number]
  isoPanel(ctx, panelAnchor[0], panelAnchor[1], CUBICLE_W, PANEL_H, { top: COLORS.panel }, DESK_H)

  // Mesa: caixa rasa ocupando o footprint inteiro, com textura de superfície
  // (sem isso o tampo lê como plástico liso, não madeira).
  isoBox(ctx, ax, ay, CUBICLE_W, CUBICLE_D, DESK_H, {
    top: deskTop, right: tint(deskTop, 1.1), left: shade(deskTop, 0.74), textured: true,
  })

  // Monitor: silhueta fina (tela de verdade, não cubo grosso) + pezinho —
  // numa escala pequena, o que faz ler "computador" é o CONTORNO fino e o
  // brilho forte da tela, não o detalhe interno (que vira ruído de longe).
  const monW = 15
  const monD = 2
  const monH = 10
  const monAnchor = pt(ax, ay, 23, 4)
  // Pezinho: conecta o monitor à mesa, é o que dá a leitura "tela em pé".
  const footAnchor = pt(monAnchor[0], monAnchor[1], 6, 0)
  isoBox(ctx, footAnchor[0], footAnchor[1], 3, 2, 3, { top: "#2f363d" }, DESK_H)
  isoBox(ctx, monAnchor[0], monAnchor[1], monW, monD, monH, {
    top: "#2f363d", right: "#3b444d", left: "#232a30",
  }, DESK_H + 3)
  const screenColor = tint(SCREEN_ON, 1.2)
  const screenAnchor = pt(monAnchor[0], monAnchor[1], 1, 0)
  isoPanel(ctx, screenAnchor[0], screenAnchor[1], monW - 2, monH - 2, { top: screenColor }, DESK_H + 4)
  const codeA = mix(screenColor, "#ffffff", 0.7)
  const l1 = pt(monAnchor[0], monAnchor[1], 2, 0)
  isoPanel(ctx, l1[0], l1[1], monW - 4, 1, { top: codeA }, DESK_H + 3 + monH - 3)
  const l2 = pt(monAnchor[0], monAnchor[1], 2, 0)
  isoPanel(ctx, l2[0], l2[1], monW - 6, 1, { top: codeA }, DESK_H + 3 + monH - 5)

  // Teclado: caixa baixa (não decalque plano) — a espessura+contorno é o
  // que separa "objeto sobre a mesa" de "mancha pintada na mesa".
  const kbAnchor = pt(ax, ay, 20, 12)
  isoBox(ctx, kbAnchor[0], kbAnchor[1], 10, 4, 2, {
    top: "#c8c2b6", right: tint("#c8c2b6", 1.05), left: shade("#c8c2b6", 0.85),
  }, DESK_H)

  // Mouse: baixinho, encostado no teclado — antes era um cubo colorido
  // solto no meio da mesa, que não lia como acessório nenhum.
  const mouseAnchor = pt(ax, ay, 31, 13)
  isoBox(ctx, mouseAnchor[0], mouseAnchor[1], 4, 3, 2, {
    top: "#d8d2c8", right: tint("#d8d2c8", 1.05), left: shade("#d8d2c8", 0.82),
  }, DESK_H)

  // Caneca — sorteio determinístico, cada baia recebe (ou não) uma.
  const seed = flip ? 11 : 7
  if (hash2(seed, 31, 5) > 0.4) {
    const mugAnchor = pt(ax, ay, 46, 8)
    isoBox(ctx, mugAnchor[0], mugAnchor[1], 5, 5, 5, {
      top: flip ? "#5a8a6b" : "#c85a4a",
    }, DESK_H)
  }
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
    w: CHAIR_GEO.cw,
    h: CHAIR_GEO.ch,
    // Sem colisão própria: cadeira fica na faixa livre de entrada da baia
    // (deixada de propósito pelo `solid` do cubicle) — bloquear aqui de novo
    // fecharia o único acesso ao assento.
    solid: null,
    baseline: 19,
    anchor: { x: CHAIR_GEO.ax, y: CHAIR_GEO.ay },
    draw(ctx) {
      const { ax, ay } = CHAIR_GEO
      // Base + coluna giratória.
      isoBox(ctx, ax, ay, 5, 5, 3, { top: "#3b444d", right: "#2f363d", left: "#232a30" }, 0)
      const postAnchor = pt(ax, ay, 2, 2)
      isoBox(ctx, postAnchor[0], postAnchor[1], 1, 1, 5, { top: "#4a545e" }, 3)
      // Assento.
      isoBox(ctx, ax, ay, 12, 12, 5, {
        top: CHAIR_D, right: tint(CHAIR_D, 1.12), left: shade(CHAIR_D, 0.74),
      }, 8)
    },
    drawFront(ctx) {
      const { ax, ay } = CHAIR_GEO
      // Encosto na borda SUL (mesmo truque de espelhar `cubicleFlip`): quem
      // senta fica de costas pro sul e de frente pra mesa, que está ao norte.
      // Esta metade é desenhada DEPOIS do avatar pelo engine: preserva o
      // encosto à vista e dá a profundidade de uma pessoa sentada.
      const backAnchor = pt(ax, ay, 0, 12)
      isoPanel(ctx, backAnchor[0], backAnchor[1], 12, 10, { top: CHAIR }, 13)
    },
  },

  plant: {
    w: PLANT_GEO.cw,
    h: PLANT_GEO.ch,
    solid: { x: 4, y: 16, w: 8, h: 6 },
    baseline: 23,
    anchor: { x: PLANT_GEO.ax, y: PLANT_GEO.ay },
    draw(ctx) {
      const { ax, ay } = PLANT_GEO
      // Vaso de barro.
      isoBox(ctx, ax, ay, 10, 10, 8, {
        top: "#a8623f", right: tint("#a8623f", 1.12), left: shade("#a8623f", 0.7),
      })
      // Folhagem em 2 caixas empilhadas — dá volume sem virar mancha.
      const potAnchor = pt(ax, ay, 1, 1)
      isoBox(ctx, potAnchor[0], potAnchor[1], 8, 8, 8, {
        top: COLORS.plant, right: tint(COLORS.plant, 1.1), left: COLORS.plantDark,
      }, 8)
      const topAnchor = pt(ax, ay, 2, 2)
      isoBox(ctx, topAnchor[0], topAnchor[1], 6, 6, 8, {
        top: tint(COLORS.plant, 1.15), right: COLORS.plant, left: COLORS.plantDark,
      }, 15)
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
    w: WATER_COOLER_GEO.cw,
    h: WATER_COOLER_GEO.ch,
    solid: { x: 3, y: 16, w: 10, h: 8 },
    baseline: 26,
    anchor: { x: WATER_COOLER_GEO.ax, y: WATER_COOLER_GEO.ay },
    draw(ctx) {
      const { ax, ay } = WATER_COOLER_GEO
      // Bebedouro.
      isoBox(ctx, ax, ay, 12, 12, 16, {
        top: "#d8d2c8", right: tint("#d8d2c8", 1.1), left: shade("#d8d2c8", 0.74),
      })
      // Garrafão translúcido por cima.
      const jugAnchor = pt(ax, ay, 2, 2)
      isoBox(ctx, jugAnchor[0], jugAnchor[1], 8, 8, 10, {
        top: "#b5dced", right: "#8fc4d8", left: shade("#8fc4d8", 0.75),
      }, 16)
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
    w: LAMP_GEO.cw,
    h: LAMP_GEO.ch,
    solid: { x: 5, y: 22, w: 6, h: 5 },
    baseline: 28,
    anchor: { x: LAMP_GEO.ax, y: LAMP_GEO.ay },
    draw(ctx) {
      const { ax, ay } = LAMP_GEO
      // Base.
      isoBox(ctx, ax, ay, 8, 8, 4, {
        top: "#6b6560", right: tint("#6b6560", 1.1), left: shade("#6b6560", 0.7),
      })
      // Haste.
      const poleAnchor = pt(ax, ay, 3, 3)
      isoBox(ctx, poleAnchor[0], poleAnchor[1], 2, 2, 14, {
        top: "#8a8175", right: "#8a8175", left: shade("#8a8175", 0.75),
      }, 4)
      // Cúpula — bem clara e quente, pra ler "acesa" mesmo à luz do dia (a
      // cor por si só não basta à noite: o furo em `map.lights` é o que
      // realmente ilumina, ver floor1.ts).
      const shadeAnchor = pt(ax, ay, 1, 1)
      isoBox(ctx, shadeAnchor[0], shadeAnchor[1], 6, 6, 7, {
        top: "#fff6da", right: "#ffe9ad", left: shade("#ffe9ad", 0.82),
      }, 18)
      // Filamento aceso — pontinho bem branco no topo da cúpula.
      const bulbAnchor = pt(ax, ay, 3, 3)
      isoBox(ctx, bulbAnchor[0], bulbAnchor[1], 2, 2, 2, { top: "#ffffff" }, 24)
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

  /**
   * Baia em U: mesa em L com divisória de três lados na altura do peito e
   * abertura para o corredor ao SUL. Desenho no helper `drawCubicleBody`,
   * compartilhado com `cubicleFlip`.
   */
  cubicle: {
    w: CUBICLE_GEO.cw,
    h: CUBICLE_GEO.ch,
    // A faixa de baixo (14 px) fica livre: é a entrada da baia.
    solid: { x: 0, y: 0, w: 64, h: 34 },
    baseline: 46,
    anchor: { x: CUBICLE_GEO.ax, y: CUBICLE_GEO.ay },
    draw(ctx) {
      drawCubicleBody(ctx, false)
    },
  },

  /** Mesma baia com a abertura ao NORTE — forma o par encostado de costas. */
  cubicleFlip: {
    w: CUBICLE_GEO.cw,
    h: CUBICLE_GEO.ch,
    solid: { x: 0, y: 14, w: 64, h: 34 },
    baseline: 47,
    anchor: { x: CUBICLE_GEO.ax, y: CUBICLE_GEO.ay },
    draw(ctx) {
      drawCubicleBody(ctx, true)
    },
  },

  copier: {
    w: 32,
    h: 32,
    solid: { x: 0, y: 8, w: 32, h: 20 },
    baseline: 30,
    draw(ctx) {
      chamfer(ctx, 2, 6, 28, 22, COLORS.steel)
      outline(ctx, 2, 6, 28, 22, INK)
      rect(ctx, 4, 8, 24, 5, shade(COLORS.steel, 0.72)) // tampa
      rect(ctx, 5, 9, 22, 1, tint(COLORS.steel, 1.15))
      rect(ctx, 6, 15, 20, 4, "#3b444d") // painel
      rect(ctx, 8, 16, 3, 2, "#7fb2d9")
      rect(ctx, 13, 16, 2, 2, "#8fd9b5")
      rect(ctx, 5, 21, 22, 5, shade(COLORS.steel, 0.84)) // gaveta de papel
      rect(ctx, 12, 23, 8, 1, INK)
      rect(ctx, 22, 20, 7, 3, "#e8e2d2") // folha saindo
      rect(ctx, 3, 29, 26, 1, "rgba(43,30,26,0.25)")
    },
  },

  filingCabinet: {
    w: 16,
    h: 28,
    solid: { x: 0, y: 10, w: 16, h: 14 },
    baseline: 26,
    draw(ctx) {
      chamfer(ctx, 1, 6, 14, 20, shade(COLORS.steel, 0.9))
      outline(ctx, 1, 6, 14, 20, INK)
      for (const y of [8, 14, 20]) {
        rect(ctx, 2, y, 12, 5, COLORS.steel)
        rect(ctx, 2, y, 12, 1, tint(COLORS.steel, 1.12))
        rect(ctx, 6, y + 2, 4, 1, "#3b444d")
      }
      rect(ctx, 2, 26, 12, 1, "rgba(43,30,26,0.25)")
    },
  },

  coatRack: {
    w: 16,
    h: 28,
    solid: { x: 5, y: 20, w: 6, h: 4 },
    baseline: 26,
    draw(ctx) {
      rect(ctx, 7, 4, 2, 20, "#6b5540")
      rect(ctx, 4, 4, 8, 1, "#6b5540")
      px(ctx, 3, 5, "#6b5540")
      px(ctx, 12, 5, "#6b5540")
      rect(ctx, 3, 6, 4, 9, "#4a6fa5") // casaco
      rect(ctx, 3, 6, 4, 1, tint("#4a6fa5", 1.2))
      rect(ctx, 10, 6, 3, 7, "#a55f4e") // cachecol
      rect(ctx, 5, 23, 6, 2, "#5a4636")
      rect(ctx, 5, 25, 6, 1, "rgba(43,30,26,0.25)")
    },
  },

  noticeBoard: {
    w: 32,
    h: 20,
    solid: null,
    baseline: 20,
    draw(ctx) {
      chamfer(ctx, 0, 0, 32, 18, "#8a6440")
      rect(ctx, 2, 2, 28, 14, "#c9b48c") // cortiça
      outline(ctx, 0, 0, 32, 18, INK)
      // Papéis pregados, em posições fixas — nunca alinhados.
      const notes: [number, number, number, number, string][] = [
        [4, 4, 7, 5, "#e8e2d2"],
        [13, 3, 6, 6, "#e8d24a"],
        [21, 5, 8, 5, "#9ad2c0"],
        [7, 10, 9, 4, "#e8e2d2"],
        [19, 11, 6, 4, "#d98f6b"],
      ]
      for (const [x, y, w, h, c] of notes) {
        rect(ctx, x, y, w, h, c)
        px(ctx, x + Math.floor(w / 2), y, "#a55f4e")
      }
    },
  },

  receptionDesk: {
    w: 64,
    h: 32,
    solid: { x: 0, y: 6, w: 64, h: 20 },
    baseline: 30,
    draw(ctx) {
      legs(ctx, 4, 24, 56, 6)
      tabletop(ctx, 0, 10, 64, 16)
      // Balcão alto na frente do tampo — o que faz ler "recepção" e não "mesa".
      rect(ctx, 0, 4, 64, 8, mix(DESK, "#ffffff", 0.12))
      rect(ctx, 0, 4, 64, 1, tint(DESK, 1.2))
      rect(ctx, 0, 11, 64, 1, shade(DESK, 0.7))
      outline(ctx, 0, 4, 64, 8, INK)
      monitor(ctx, 6, 0, true)
      rect(ctx, 40, 6, 9, 4, "#3b444d") // telefone
      rect(ctx, 42, 5, 5, 1, "#4a545e")
      mug(ctx, 54, 6)
      rect(ctx, 4, 31, 56, 1, "rgba(43,30,26,0.25)")
    },
  },

  elevatorDoors: {
    w: ELEVATOR_GEO.cw,
    h: ELEVATOR_GEO.ch,
    solid: { x: 0, y: 0, w: 64, h: 36 },
    baseline: 38,
    anchor: { x: ELEVATOR_GEO.ax, y: ELEVATOR_GEO.ay },
    draw(ctx) {
      const { ax, ay } = ELEVATOR_GEO
      // Moldura de aço com espessura de verdade — a cabine "entra" na parede
      // em vez de ser um adesivo colado nela.
      isoBox(ctx, ax, ay, 64, 6, 36, {
        top: shade(COLORS.steel, 0.85), right: COLORS.steel, left: shade(COLORS.steel, 0.62),
      })
      // Junta central das duas folhas + indicador aceso, na face frontal.
      const seamAnchor = pt(ax, ay, 31, 0)
      isoPanel(ctx, seamAnchor[0], seamAnchor[1], 2, 30, { top: shade(COLORS.steel, 0.5) }, 3)
      const indAnchor = pt(ax, ay, 26, 0)
      isoPanel(ctx, indAnchor[0], indAnchor[1], 12, 3, { top: "#2f363d" }, 33)
    },
  },

  /**
   * Mesa em U da sala de Planning Poker: abre ao norte (lado da entrada). A
   * colisão é o retângulo cheio — ninguém precisa andar dentro do vão do U,
   * só ao redor, onde ficam os assentos.
   */
  pokerTable: {
    w: POKER_TABLE_GEO.cw,
    h: POKER_TABLE_GEO.ch,
    solid: { x: 0, y: 0, w: 256, h: 112 },
    baseline: 108,
    anchor: { x: POKER_TABLE_GEO.ax, y: POKER_TABLE_GEO.ay },
    draw(ctx) {
      const { ax, ay } = POKER_TABLE_GEO
      const top = "#8f6a44"
      const colors = { top, right: tint(top, 1.12), left: shade(top, 0.74), textured: true }
      // Mesa em U de verdade: 3 caixas (braço oeste, braço leste, base ao
      // sul) — o vão do meio fica sem caixa nenhuma, revelando o piso.
      isoBox(ctx, ax, ay, 32, 112, 18, colors) // braço oeste
      const eastAnchor = pt(ax, ay, 224, 0)
      isoBox(ctx, eastAnchor[0], eastAnchor[1], 32, 112, 18, colors) // braço leste
      const southAnchor = pt(ax, ay, 0, 80)
      isoBox(ctx, southAnchor[0], southAnchor[1], 256, 32, 18, colors) // base
    },
  },

  /** Telão montado na parede sul da sala de poker. */
  pokerScreen: {
    w: POKER_SCREEN_GEO.cw,
    h: POKER_SCREEN_GEO.ch,
    solid: { x: 0, y: 24, w: 128, h: 8 },
    baseline: 30,
    anchor: { x: POKER_SCREEN_GEO.ax, y: POKER_SCREEN_GEO.ay },
    draw(ctx) {
      const { ax, ay } = POKER_SCREEN_GEO
      isoBox(ctx, ax, ay, 128, 8, 26, {
        top: shade("#12161c", 0.85), right: "#1b2733", left: shade("#1b2733", 0.7),
      })
      const glowAnchor = pt(ax, ay, 46, 1)
      isoPanel(ctx, glowAnchor[0], glowAnchor[1], 36, 8, { top: "#26333f" }, 20)
    },
  },

  /** Console do host: onde a tecla E abre o painel de controle da sessão. */
  pokerConsole: {
    w: POKER_CONSOLE_GEO.cw,
    h: POKER_CONSOLE_GEO.ch,
    solid: { x: 0, y: 10, w: 32, h: 18 },
    baseline: 28,
    anchor: { x: POKER_CONSOLE_GEO.ax, y: POKER_CONSOLE_GEO.ay },
    draw(ctx) {
      const { ax, ay } = POKER_CONSOLE_GEO
      isoBox(ctx, ax, ay, 32, 20, 16, {
        top: "#7d5b41", right: tint("#7d5b41", 1.1), left: shade("#7d5b41", 0.72),
      })
      const screenAnchor = pt(ax, ay, 8, 4)
      isoPanel(ctx, screenAnchor[0], screenAnchor[1], 16, 9, { top: "#4a6fa5" }, 16)
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
    const front = def.drawFront
      ? (() => {
          const layer = makeCanvas(def.w, def.h)
          def.drawFront!(layer.ctx)
          return layer.canvas
        })()
      : undefined
    out[name] = { canvas, w: def.w, h: def.h, front }
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
