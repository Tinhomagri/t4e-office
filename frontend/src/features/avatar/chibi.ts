// Gerador procedural de avatar em pixel art — Canvas 2D PURO (sem PixiJS).
// Estilo alvo: STARDEW VALLEY CLÁSSICO. Sprite 16×32 compacto ("boneco de
// brinquedo sólido"): cabeça grande dominada pelo cabelo, rosto minimalista
// (olhos de 2px, sem bochechas/íris/brilho/nariz), braços COLADOS ao tronco,
// sombreamento em apenas 2 tons (base + sombra fria; sem highlight), paleta
// dessaturada e contorno marrom-café #2b1e1a (nunca preto puro).
//
// Grid 16×32. Anatomia (frente, sem pose):
//   cabelo  y 1..7   (domina a cabeça; rosto é faixa de ~6px)
//   cabeça  y 4..13  (pele 10 larg; cabeça+cabelo 13px ≈ 40%)
//   tronco  y 14..23 (10 larg × 10 alt ≈ 30%; braços = colunas externas)
//   pernas  y 24..29 (6 alt) · sapato y 30..31 → andar de baixo 8px ≈ 28%
// Pés plantados na base do frame — sem sombra de chão, sem flutuação.
import {
  ANIMS, BOTTOMS, DIRS, FH, FW, HANDHELDS, PAL, SHOES, TOPS,
  type AvatarConfig, type Direction,
} from "./avatar.types"

type Ctx = CanvasRenderingContext2D
type Pose = Record<string, number | string | null | undefined>

const ANIM_ROWS = Object.keys(ANIMS)

const HANDHELD_ANIMS: Record<string, string[] | "ALL"> = {
  Laptop: ["idle", "type", "present"],
  "Caneca de café": ["idle", "coffee", "present"],
  Celular: ["idle", "type"],
  Prancheta: ["idle", "present", "walk"],
  Caixa: ["idle", "walk", "push"],
  Mochila: "ALL",
}

function px(ctx: Ctx, x: number, y: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1) }
function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }
function clearPx(ctx: Ctx, x: number, y: number) { ctx.clearRect(x, y, 1, 1) }

function clamp255(v: number) { return Math.max(0, Math.min(255, Math.round(v))) }
// Sombra Stardew: ~25-30% mais escura com leve shift para azul. Único tom
// além da base — NUNCA highlight (nada mais claro que a base).
export function shadeCool(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (
    "#" +
    ((1 << 24) + (clamp255(r * 0.68) << 16) + (clamp255(g * 0.72) << 8) + clamp255(b * 0.84 + 8))
      .toString(16)
      .slice(1)
  )
}

// Destaque de luz ~20% mais claro — USO RESTRITO AO CABELO (única exceção
// permitida ao esquema de 2 tons; Stardew ilumina o topo do cabelo assim).
export function shadeLite(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (
    "#" +
    ((1 << 24) + (clamp255(r * 1.2 + 10) << 16) + (clamp255(g * 1.18 + 8) << 8) + clamp255(b * 1.1 + 6))
      .toString(16)
      .slice(1)
  )
}

// Contorno interno (separações braço/tronco, cintura, pernas) — mesmo tom do contorno externo.
const INK = "#2b1e1a"

function num(p: Pose, k: string): number { const v = p[k]; return typeof v === "number" ? v : 0 }

export function drawChibi(ctx: Ctx, s: AvatarConfig, dir: Direction, pose: Pose, anim: string) {
  // 2 tons por superfície: base + sombra fria. Sem terceiro tom.
  const skin = PAL.skin[s.skin], skinD = shadeCool(skin)
  const hair = PAL.hair[s.hair], hairD = shadeCool(hair), hairL = shadeLite(hair)
  const shirt = PAL.shirt[s.shirt], shirtD = shadeCool(shirt)
  const pants = PAL.pants[s.pants], pantsD = shadeCool(pants)
  const shoe = PAL.shoe[s.shoe], shoeD = shadeCool(shoe)
  const female = s.gender === "female"
  const top = TOPS[s.top], bottom = BOTTOMS[s.bottom], shoeType = SHOES[s.shoeType]

  const legBare = bottom === "Saia" || bottom === "Shorts" || top === "Vestido"
  const skirtLike = bottom === "Saia" || top === "Vestido"

  const cx = 8
  const by = num(pose, "body") | 0
  const lean = num(pose, "lean")
  const leanLegs = Math.round(lean * 0.15)
  const leanTorso = Math.round(lean * 0.5)
  const leanHead = Math.round(lean * 0.8)

  const squash = num(pose, "squash")
  const headBob = num(pose, "headBob")
  const hairDrag = num(pose, "hairDrag")
  const footL = num(pose, "footL")
  const footR = num(pose, "footR")

  const handName = HANDHELDS[s.hand]
  const handShows = (name: string) => {
    if (s.hand === 0) return false
    const rule = HANDHELD_ANIMS[name]
    if (!rule) return false
    if (rule === "ALL") return true
    return rule.indexOf(anim) >= 0
  }
  const showMochila = handShows("Mochila") && handName === "Mochila"
  const showHandItem = handName !== "Mochila" && handShows(handName)

  const squashDrop = squash < 0 ? -squash : 0
  const stretchUp = squash > 0 ? squash : 0
  const bodyShift = squashDrop - stretchUp

  const tTop = 14 + by + bodyShift
  const tx = cx + leanTorso
  const hy = 6 + by + bodyShift + headBob // topo da pele da cabeça
  const hx = cx + leanHead

  if (showMochila) {
    const mTop = tTop + 1, mx = tx
    const bagC = "#4a5a78", bagD = shadeCool(bagC)
    if (dir === "up") {
      rect(ctx, mx - 4, mTop, 8, 7, bagC); rect(ctx, mx - 4, mTop, 1, 7, bagD)
      rect(ctx, mx - 1, mTop + 2, 3, 3, bagD)
    } else if (dir === "down") {
      rect(ctx, mx - 4, mTop, 1, 5, bagD); rect(ctx, mx + 3, mTop, 1, 5, bagD)
    } else {
      const bx = dir === "left" ? mx + 3 : mx - 5
      rect(ctx, bx, mTop, 2, 7, bagC); px(ctx, bx, mTop + 6, bagD)
    }
  }

  // ── Pernas curtas e grossas, paralelas ──────────────────────────────────────
  const legTop = tTop + 10
  const legW = female ? 3 : 4
  const drawShoe = (sx: number, sy: number, w: number) => {
    if (shoeType === "Bota") { rect(ctx, sx, sy - 1, w, 3, shoe); rect(ctx, sx, sy + 1, w, 1, shoeD) }
    else if (shoeType === "Sandália") { rect(ctx, sx, sy + 1, w, 1, shoe) }
    else if (shoeType === "Social") { rect(ctx, sx, sy, w, 2, shoe); px(ctx, sx + w - 1, sy + 1, shoeD) }
    else if (shoeType === "Sapatilha") { rect(ctx, sx, sy + 1, w, 1, shoe) }
    else { rect(ctx, sx, sy, w, 2, shoe); rect(ctx, sx, sy + 1, w, 1, shoeD) } // tênis: base + sola escura
  }
  const drawLeg = (side: number, lift: number, slide: number) => {
    const lx = tx + (side < 0 ? -legW : 0) + leanLegs + (slide || 0)
    let len = 6 - lift + bodyShift
    if (len < 2) len = 2; if (len > 6) len = 6
    if (legBare) {
      rect(ctx, lx, legTop, legW, len, skin)
      rect(ctx, lx + legW - 1, legTop, 1, len, skinD) // sombra à direita de cada perna
      if (bottom === "Shorts") rect(ctx, lx, legTop, legW, 2, pants)
    } else {
      rect(ctx, lx, legTop, legW, len, pants)
      rect(ctx, lx + legW - 1, legTop, 1, len, pantsD) // sombra à direita de cada perna
    }
    // Linha central dividindo as duas pernas — característica de leitura Stardew.
    if (side > 0) rect(ctx, lx, legTop, 1, len, INK)
    drawShoe(lx, legTop + len, legW)
  }
  const liftL = num(pose, "legL") > 0 ? num(pose, "legL") : 0
  const liftR = num(pose, "legR") > 0 ? num(pose, "legR") : 0
  drawLeg(-1, liftL, footL)
  drawLeg(1, liftR, footR)

  if (skirtLike && top !== "Vestido") {
    rect(ctx, tx - 5, legTop, 10, 3, pants); rect(ctx, tx + 3, legTop, 2, 3, pantsD)
  }

  // ── Tronco 10 larg × 10 alt, braços COLADOS (colunas externas do bloco) ────
  const aL = num(pose, "armL"), aR = num(pose, "armR")
  const sleeveLong = top === "Social" || top === "Moletom" || top === "Jaleco" || top === "Hoodie" || top === "Terno" || top === "Vestido"
  const sleeveC = top === "Jaleco" ? "#d8d2c8" : shirt
  const sleeveCD = shadeCool(sleeveC)

  drawTorso(ctx, tx, tTop, top, shirt, shirtD, skin, pantsD)

  // Braços: sem espaço da silhueta. Pendentes = colunas tx-5 e tx+4 encostadas
  // no tronco; levantados (acenar etc.) sobem ao lado da cabeça.
  const drawArm = (side: number, off: number): { hx: number; hy: number } => {
    const base = sleeveC
    if (off > -3) {
      const ax = side < 0 ? tx - 6 : tx + 5
      const sleeveH = sleeveLong ? 6 : 3
      rect(ctx, ax, tTop + off, 1, sleeveH, base)
      if (side > 0) px(ctx, ax, tTop + off, sleeveCD) // só o ombro direito sombreado
      if (!sleeveLong) rect(ctx, ax, tTop + 3 + off, 1, 3, skin)
      px(ctx, ax, tTop + 5 + off, INK) // punho (contorno entre braço e mão)
      rect(ctx, ax, tTop + 6 + off, 1, 2, skin) // mão
      return { hx: ax, hy: tTop + 7 + off }
    }
    const ax = side < 0 ? hx - 7 : hx + 6
    const handY = tTop + off
    rect(ctx, ax, handY, 1, Math.max(2, tTop - handY), base)
    px(ctx, ax, handY, skin) // mão no topo
    rect(ctx, Math.min(ax, side < 0 ? tx - 5 : tx + 4), tTop, Math.abs(ax - (side < 0 ? tx - 5 : tx + 4)) + 1, 1, base)
    return { hx: ax, hy: handY }
  }
  const handL = drawArm(-1, aL)
  drawArm(1, aR)
  if (s.acc === 6) px(ctx, handL.hx, handL.hy - 1, "#33302c") // smartwatch

  // ── Cabeça: pele 8×8 (quase quadrada) — nem larga, nem esticada ─────────────
  rect(ctx, hx - 4, hy, 8, 8, skin)
  rect(ctx, hx + 3, hy + 1, 1, 6, skinD) // sombra à direita (2 tons, corte seco)
  rect(ctx, hx - 3, hy + 7, 6, 1, skinD) // sombra do queixo
  clearPx(ctx, hx - 4, hy); clearPx(ctx, hx + 3, hy)
  clearPx(ctx, hx - 4, hy + 7); clearPx(ctx, hx + 3, hy + 7)

  drawFace(ctx, hx, hy, dir, female, hair, s.skin, pose.face as string | undefined)
  drawHair(ctx, hx, hy + hairDrag, dir, hair, hairD, hairL, female, s.hairStyle)
  drawAccessory(ctx, hx, hy, dir, s.acc)
  if (showHandItem) drawHandItem(ctx, handName, tx, tTop, dir, aR)
  const fx = pose.fx as string | undefined
  if (fx) drawFx(ctx, fx, hx, hy, tx, tTop, dir)
  void skirtLike
}

// Tronco compacto: separações por mudança de cor, poucos detalhes internos.
function drawTorso(ctx: Ctx, tx: number, tTop: number, top: string, shirt: string, shirtD: string, skin: string, _waistD: string) {
  const body = (w: number) => {
    const x = tx - Math.floor(w / 2)
    rect(ctx, x, tTop, w, 10, shirt)
    rect(ctx, x + w - 2, tTop + 1, 2, 8, shirtD) // sombra à direita (2px, luz da esq)
    rect(ctx, tx - 2, tTop, 4, 1, shirtD) // sombra do queixo no peito
    px(ctx, x, tTop + 7, shirtD); px(ctx, x + w - 1, tTop + 7, shirtD) // junção dos braços
    rect(ctx, x, tTop + 9, w, 1, INK) // linha da cintura (cinto)
    clearPx(ctx, x, tTop); clearPx(ctx, x + w - 1, tTop) // ombros
    return x
  }
  if (top === "Vestido") {
    rect(ctx, tx - 3, tTop, 6, 5, shirt)
    rect(ctx, tx - 4, tTop + 5, 8, 5, shirt)
    rect(ctx, tx + 2, tTop + 1, 1, 4, shirtD); rect(ctx, tx + 3, tTop + 5, 1, 5, shirtD)
    return
  }
  if (top === "Regata") {
    const x = body(8)
    rect(ctx, x, tTop, 2, 1, skin); rect(ctx, x + 6, tTop, 2, 1, skin); return
  }
  if (top === "Social" || top === "Polo") {
    body(8)
    rect(ctx, tx, tTop + 1, 1, 8, shirtD) // botões
    px(ctx, tx - 1, tTop, shirtD); px(ctx, tx + 1, tTop, shirtD) // colarinho
    return
  }
  if (top === "Jaleco") {
    rect(ctx, tx - 4, tTop, 8, 10, "#d8d2c8")
    rect(ctx, tx - 1, tTop, 2, 10, shirt)
    rect(ctx, tx + 3, tTop + 1, 1, 9, "#a8a294")
    clearPx(ctx, tx - 4, tTop); clearPx(ctx, tx + 3, tTop); return
  }
  if (top === "Terno") {
    rect(ctx, tx - 4, tTop, 8, 10, "#33302c")
    rect(ctx, tx - 1, tTop, 2, 8, "#d8d2c8") // camisa
    px(ctx, tx, tTop + 1, shirt); px(ctx, tx, tTop + 2, shirt) // gravata
    rect(ctx, tx + 3, tTop + 1, 1, 9, shadeCool("#33302c"))
    clearPx(ctx, tx - 4, tTop); clearPx(ctx, tx + 3, tTop); return
  }
  if (top === "Moletom" || top === "Hoodie") {
    const x = body(8)
    rect(ctx, x + 1, tTop + 6, 6, 2, shirtD) // bolso
    if (top === "Hoodie") rect(ctx, tx - 3, tTop, 6, 1, shirtD) // capuz caído
    return
  }
  if (top === "Time") {
    const x = body(8)
    rect(ctx, x, tTop + 3, 8, 1, "#d8d2c8") // faixa
    return
  }
  body(8) // camiseta básica
  px(ctx, tx - 1, tTop, shirtD); px(ctx, tx, tTop, shirtD) // gola discreta
}

function drawHandItem(ctx: Ctx, name: string, tx: number, tTop: number, dir: Direction, aR: number) {
  const hyHand = tTop + 5 + aR
  if (name === "Laptop") {
    rect(ctx, tx - 3, tTop + 4, 7, 3, "#3a3f4b"); rect(ctx, tx - 4, tTop + 7, 9, 1, "#5a5a5a")
  } else if (name === "Caneca de café") {
    const mx = tx + (dir === "left" ? -6 : 5)
    rect(ctx, mx, hyHand - 1, 2, 2, "#d8d2c8"); px(ctx, mx, hyHand - 2, "#8a4438")
  } else if (name === "Celular") {
    const mx = tx + (dir === "left" ? -6 : 5)
    rect(ctx, mx, hyHand - 2, 1, 3, "#1a1a1a")
  } else if (name === "Prancheta") {
    const mx = tx + (dir === "left" ? -6 : 4)
    rect(ctx, mx, tTop + 3, 2, 4, "#6b4423"); px(ctx, mx, tTop + 4, "#d8d2c8")
  } else if (name === "Caixa") {
    rect(ctx, tx - 2, tTop + 3, 5, 4, "#a08040"); rect(ctx, tx - 2, tTop + 5, 5, 1, "#6b4423")
  }
}

function drawFx(ctx: Ctx, fx: string, hx: number, hy: number, tx: number, tTop: number, dir: Direction) {
  if (fx === "zzz") { px(ctx, hx + 5, hy - 2, "#c9c2b5"); px(ctx, hx + 6, hy - 3, "#c9c2b5") }
  else if (fx === "stars") { px(ctx, hx - 6, hy - 1, "#c9a04a"); px(ctx, hx + 5, hy, "#c9a04a") }
  else if (fx === "impact") {
    const ix = dir === "left" ? tx - 7 : tx + 5, iy = tTop + 2
    px(ctx, ix, iy, "#d8d2c8"); px(ctx, ix + 1, iy - 1, "#c9a04a"); px(ctx, ix - 1, iy + 1, "#c9a04a")
  } else if (fx === "note") {
    px(ctx, hx + 5, hy - 2, "#7a6ba0"); px(ctx, hx + 5, hy - 3, "#7a6ba0")
  } else if (fx === "sweat") px(ctx, hx + 5, hy + 2, "#5a7ba5")
}

// Íris dessaturada varia por tom de pele (azul/verde/castanho).
const IRIS = ["#4a6fa5", "#5d8a52", "#6b4423", "#2c3e5a", "#4a6fa5", "#6b4423", "#5d8a52", "#3d5445"]

// Rosto minimalista Stardew: olho 2×2 (linha superior = íris colorida,
// linha inferior = pupila escura), sobrancelha na cor do cabelo, boca
// opcional de 1px. SEM bochechas, brilho ou nariz.
// Observação: versões anteriores referenciavam `PUPIL` sem defini-lo.
// Para evitar crash em runtime, usamos o mesmo tom “dark” do contorno/pupila.
function drawFace(ctx: Ctx, hx: number, hy: number, dir: Direction, female: boolean, _browC: string, skinIdx: number, face?: string) {
  if (dir === "up") return
  const dark = "#2b1e1a"
  const iris = IRIS[skinIdx % IRIS.length]

  const ey = hy + 4 // linha dos olhos (rosto compacto: hy+1..hy+7)

  const eye = (x: number, _inn: number) => { // 2×2: íris em cima, pupila embaixo
    rect(ctx, x, ey, 2, 1, iris)
    rect(ctx, x, ey + 1, 2, 1, dark)
  }
  const eyeHappy = (x: number) => { px(ctx, x, ey + 1, dark); px(ctx, x + 1, ey, dark) }
  const eyeAngry = (x: number, inn: number) => { eye(x, inn); px(ctx, x + (inn > 0 ? 0 : 1), ey - 1, dark) }
  const eyeKO = (x: number) => { px(ctx, x, ey, dark); px(ctx, x + 1, ey + 1, dark); px(ctx, x + 1, ey, dark); px(ctx, x, ey + 1, dark) }
  const eyeSleep = (x: number) => { rect(ctx, x, ey + 1, 2, 1, dark) }


  if (dir === "down") {
    const lx = hx - 3, rx = hx + 1 // 2px de vão entre os olhos
    if (face === "happy") { eyeHappy(lx); eyeHappy(rx); rect(ctx, hx - 1, ey + 2, 2, 1, dark) }
    else if (face === "angry") { eyeAngry(lx, 1); eyeAngry(rx, -1); px(ctx, hx, ey + 2, "#8a4438") }
    else if (face === "ko") { eyeKO(lx); eyeKO(rx); px(ctx, hx, ey + 2, "#8a4438") }
    else if (face === "sleep") { eyeSleep(lx); eyeSleep(rx) }
    else {
      eye(lx, 1); eye(rx, -1)
      
      if (female) px(ctx, hx, ey + 2, dark) // boca de 1px (opcional no estilo)
    }
  } else if (dir === "left") {
    const x = hx - 3
    if (face === "ko") eyeKO(x)
    else if (face === "angry") eyeAngry(x, 1)
    else if (face === "sleep") eyeSleep(x)
    else eye(x, -1)
  } else {
    const x = hx + 1
    if (face === "ko") eyeKO(x)
    else if (face === "angry") eyeAngry(x, -1)
    else if (face === "sleep") eyeSleep(x)
    else eye(x, 1)
  }
}

// Cabelo cobre só o topo (~6px): rosto respira 5-6px entre franja e queixo.
// Dois tons + destaque claro no topo-frontal (luz do canto superior esquerdo).
function drawHair(ctx: Ctx, hx: number, hy: number, dir: Direction, hair: string, hairD: string, hairL: string, female: boolean, st: number) {
  const back = dir === "up"

  // Massa base: coroa acima da testa, terminando na linha do couro (hy-1).
  const cap = () => {
    rect(ctx, hx - 3, hy - 4, 6, 1, hair)
    rect(ctx, hx - 4, hy - 3, 8, 3, hair) // hy-3..hy-1
    rect(ctx, hx - 5, hy - 2, 1, 3, hair); rect(ctx, hx + 4, hy - 2, 1, 3, hair) // laterais
    clearPx(ctx, hx - 4, hy - 3); clearPx(ctx, hx + 3, hy - 3)
    rect(ctx, hx - 3, hy - 4, 3, 1, hairL); px(ctx, hx - 4, hy - 3, hairL) // destaque de luz
    px(ctx, hx - 2, hy - 2, hairD); px(ctx, hx + 1, hy - 1, hairD) // linha interna (textura)
    rect(ctx, hx + 2, hy - 3, 2, 3, hairD) // sombra à direita
  }
  // Franja mínima: só dentes esparsos no topo da testa — rosto fica visível.
  const franja = () => {
    if (back) return
    px(ctx, hx - 3, hy, hair); px(ctx, hx, hy, hair); px(ctx, hx + 2, hy, hair)
    px(ctx, hx - 4, hy, hair); px(ctx, hx + 3, hy, hair) // costeletas
  }
  const sideHair = (len: number) => {
    if (dir !== "right") rect(ctx, hx - 5, hy + 1, 1, len, hair)
    if (dir !== "left") { rect(ctx, hx + 4, hy + 1, 1, len, hair); px(ctx, hx + 4, hy + len, hairD) }
  }
  const backMass = (h: number) => { // costas: cabelo cobre a nuca, sem faixa de pele
    rect(ctx, hx - 4, hy, 8, h, hair)
    rect(ctx, hx + 2, hy, 2, h, hairD)
  }

  switch (st) {
    case 0: cap(); franja(); if (back) backMass(6); break
    case 1: cap(); franja(); sideHair(female ? 6 : 4); if (back) backMass(female ? 8 : 6); break
    case 2: // topete
      cap(); rect(ctx, hx - 1, hy - 5, 3, 1, hair); px(ctx, hx + 1, hy - 6, hair); px(ctx, hx + 2, hy - 5, hairD)
      if (!back) franja(); sideHair(female ? 5 : 2); if (back) backMass(6); break
    case 3: // rabo de cavalo
      cap(); franja()
      if (dir === "down" || dir === "up") { rect(ctx, hx + 4, hy - 2, 1, 9, hair); px(ctx, hx + 4, hy + 6, hairD) }
      else if (dir === "left") { rect(ctx, hx + 4, hy - 1, 2, 8, hair); px(ctx, hx + 5, hy + 6, hairD) }
      else { rect(ctx, hx - 5, hy - 1, 2, 8, hair) }
      if (female) sideHair(4); break
    case 4: // coque
      cap(); rect(ctx, hx - 1, hy - 6, 3, 2, hair); px(ctx, hx + 1, hy - 5, hairD)
      if (!back) franja(); sideHair(female ? 4 : 2); if (back) backMass(6); break
    case 5: // carequinha
      rect(ctx, hx - 3, hy - 1, 6, 1, hair); px(ctx, hx - 3, hy, hairD)
      if (back) rect(ctx, hx - 3, hy, 6, 2, hair); break
    case 6: // moicano
      rect(ctx, hx - 1, hy - 4, 3, 6, hair); px(ctx, hx + 1, hy - 2, hairD)
      rect(ctx, hx - 3, hy, 2, 1, hairD); rect(ctx, hx + 2, hy, 2, 1, hairD) // raspado
      if (back) rect(ctx, hx - 1, hy, 3, 5, hair); break
    case 7: // cacheado
      rect(ctx, hx - 3, hy - 4, 6, 1, hair)
      rect(ctx, hx - 5, hy - 3, 10, 4, hair)
      clearPx(ctx, hx - 5, hy - 3); clearPx(ctx, hx + 4, hy - 3)
      px(ctx, hx - 3, hy - 5, hair); px(ctx, hx + 1, hy - 5, hair)
      px(ctx, hx - 2, hy - 2, hairD); px(ctx, hx + 2, hy - 1, hairD)
      rect(ctx, hx + 3, hy - 2, 2, 3, hairD)
      if (back) backMass(7); break
    case 8: // longo — desce até a linha dos ombros
      cap(); franja()
      if (dir !== "right") rect(ctx, hx - 5, hy + 1, 1, 10, hair)
      if (dir !== "left") { rect(ctx, hx + 4, hy + 1, 1, 10, hair); px(ctx, hx + 4, hy + 10, hairD) }
      if (back) backMass(11)
      break
    case 9: // maria-chiquinhas
      cap(); franja()
      if (dir === "down" || dir === "up") {
        rect(ctx, hx - 6, hy, 2, 5, hair); rect(ctx, hx + 4, hy, 2, 5, hair)
        px(ctx, hx + 5, hy + 4, hairD)
      } else if (dir === "left") rect(ctx, hx + 4, hy, 2, 5, hair)
      else rect(ctx, hx - 5, hy, 2, 5, hair)
      break
    case 10: // undercut
      rect(ctx, hx - 4, hy - 3, 8, 2, hair)
      clearPx(ctx, hx - 4, hy - 3); clearPx(ctx, hx + 3, hy - 3)
      rect(ctx, hx - 3, hy - 3, 3, 1, hairL)
      rect(ctx, hx - 4, hy - 1, 8, 1, hairD) // raspado
      if (!back) rect(ctx, hx - 2, hy - 1, 5, 1, hair)
      if (back) rect(ctx, hx - 4, hy, 8, 3, hairD); break
    case 11: // franjão
      cap()
      if (!back) {
        rect(ctx, hx - 4, hy, 8, 1, hair)
        px(ctx, hx - 2, hy, hairD); px(ctx, hx + 2, hy, hairD)
        px(ctx, hx - 3, hy + 1, hair); px(ctx, hx + 2, hy + 1, hair)
      }
      sideHair(female ? 6 : 3); if (back) backMass(8); break
  }
}

function drawAccessory(ctx: Ctx, hx: number, hy: number, dir: Direction, acc: number) {
  const ey = hy + 5
  if (acc === 1 && dir !== "up") { // óculos
    const rim = "#5a5a5a"
    if (dir === "down") {
      px(ctx, hx - 4, ey, rim); px(ctx, hx - 1, ey, rim)
      px(ctx, hx, ey, rim); px(ctx, hx + 3, ey, rim)
      px(ctx, hx - 5, ey, rim); px(ctx, hx + 4, ey, rim)
    } else if (dir === "left") { px(ctx, hx - 4, ey, rim); px(ctx, hx - 1, ey, rim) }
    else { px(ctx, hx, ey, rim); px(ctx, hx + 3, ey, rim) }
  }
  if (acc === 2) { // boné
    const c = "#a54a3c", cD = shadeCool(c)
    rect(ctx, hx - 3, hy - 4, 6, 1, c); rect(ctx, hx - 4, hy - 3, 8, 2, c)
    px(ctx, hx + 3, hy - 3, cD)
    if (dir === "down") rect(ctx, hx - 4, hy - 1, 8, 1, cD)
    else if (dir === "left") rect(ctx, hx - 6, hy - 2, 3, 1, cD)
    else if (dir === "right") rect(ctx, hx + 3, hy - 2, 3, 1, cD)
  }
  if (acc === 3 && dir !== "up") { // brinco
    if (dir !== "right") px(ctx, hx - 4, ey + 2, "#c9a04a")
    if (dir !== "left") px(ctx, hx + 3, ey + 2, "#c9a04a")
  }
  if (acc === 4) { // fones
    const c = "#33302c", pad = "#4a5a78"
    rect(ctx, hx - 3, hy - 3, 6, 1, c)
    if (dir === "down" || dir === "up") { rect(ctx, hx - 5, ey - 1, 1, 3, c); rect(ctx, hx + 4, ey - 1, 1, 3, c); px(ctx, hx - 5, ey, pad); px(ctx, hx + 4, ey, pad) }
    else if (dir === "left") { rect(ctx, hx + 3, ey - 1, 1, 3, c); px(ctx, hx + 3, ey, pad) }
    else { rect(ctx, hx - 4, ey - 1, 1, 3, c); px(ctx, hx - 4, ey, pad) }
  }
  if (acc === 5 && dir !== "up") { // crachá
    px(ctx, hx, hy + 11, "#888"); rect(ctx, hx - 1, hy + 12, 2, 2, "#d8d2c8"); px(ctx, hx - 1, hy + 12, "#4a6fa5")
  }
  if (acc === 7 && dir !== "up") { // óculos VR
    rect(ctx, hx - 4, ey - 1, 8, 3, "#33302c")
    if (dir === "down") { px(ctx, hx - 2, ey, "#7a6ba0"); px(ctx, hx + 1, ey, "#7a6ba0") }
    else if (dir === "left") px(ctx, hx - 2, ey, "#7a6ba0")
    else px(ctx, hx + 1, ey, "#7a6ba0")
  }
  if (acc === 8) { // gorro
    const c = "#3d5445", cD = shadeCool(c)
    rect(ctx, hx - 3, hy - 4, 6, 1, c); rect(ctx, hx - 4, hy - 3, 8, 3, c)
    px(ctx, hx + 3, hy - 2, cD); rect(ctx, hx - 4, hy, 8, 1, cD)
  }
}

const T = Math.PI * 2
export function poseFor(anim: string, f: number): Pose {
  switch (anim) {
    case "idle": { const b = [0, 0, 1, 1][f % 4]; return { body: b, armL: b, armR: b } }
    case "walk": {
      const ph = (f / ANIMS.walk) * T
      const swA = Math.round(Math.sin(ph) * 2), swB = Math.round(Math.sin(ph + Math.PI) * 2)
      return { body: Math.abs(swA) >= 2 ? 1 : 0, legL: swA > 0 ? swA : 0, legR: swB > 0 ? swB : 0, armL: swB > 0 ? 1 : 0, armR: swA > 0 ? 1 : 0 }
    }
    case "run": {
      const ph = (f / ANIMS.run) * T
      const swA = Math.round(Math.sin(ph) * 3), swB = Math.round(Math.sin(ph + Math.PI) * 3)
      return { body: Math.abs(swA) >= 2 ? 1 : 0, lean: 3, legL: swA > 0 ? swA : 0, legR: swB > 0 ? swB : 0, armL: swA > 0 ? 2 : 0, armR: swB > 0 ? 2 : 0 }
    }
    case "push": { const b = [0, 1, 0, 1][f % 4]; return { body: b, lean: 2, legL: b ? 1 : 0, legR: b ? 0 : 1, armL: -2, armR: -2 } }
    case "jump": return [{ body: 1, legL: 1, legR: 1, armL: 1, armR: 1 }, { body: -3, legL: 2, legR: 2, armL: -3, armR: -3 }, { body: -5, legL: 2, legR: 2, armL: -4, armR: -4 }, { body: -3, legL: 1, legR: 1, armL: -2, armR: -2 }, { body: 0 }][f % 5]
    case "hurt": return [{ body: 0, lean: -2, armL: 2, armR: 2, face: "ko" }, { body: 1, lean: -3, armL: 3, armR: 3, face: "ko", fx: "impact" }, { body: 0, lean: -1, armL: 2, armR: 2, face: "ko" }][f % 3]
    case "wave": return [{ armR: -4, face: "happy" }, { armR: -5, face: "happy" }, { armR: -4, face: "happy" }, { armR: -5, face: "happy" }, { armR: -4, face: "happy" }][f % 5]
    case "sleep": return { body: [0, 0, 1, 1][f % 4], face: "sleep", armL: 1, armR: 1, fx: "zzz" }
    case "celebrate": return [{ armL: -4, armR: -4, face: "happy" }, { body: -2, legL: 1, legR: 1, armL: -5, armR: -5, face: "happy", fx: "stars" }, { body: -3, legL: 2, legR: 2, armL: -5, armR: -5, face: "happy", fx: "stars" }, { body: -2, legL: 1, legR: 1, armL: -5, armR: -5, face: "happy" }, { armL: -4, armR: -4, face: "happy", fx: "stars" }, { body: -2, legL: 1, legR: 1, armL: -5, armR: -5, face: "happy" }][f % 6]
    case "type": return [{ armL: 2, armR: 1, lean: 1 }, { armL: 1, armR: 2, lean: 1 }, { armL: 2, armR: 2, lean: 1 }, { armL: 1, armR: 1, lean: 1 }][f % 4]
    case "present": return [{ armR: -3, armL: 1, face: "happy" }, { armR: -4, armL: 1, face: "happy" }, { body: 1, armR: -3, face: "happy" }, { armR: -4, armL: 1, face: "happy" }][f % 4]
    case "coffee": return [{ armR: 0 }, { armR: -2 }, { body: 1, armR: -3 }, { armR: -2 }][f % 4]
    case "punch": return [{ lean: 1, legL: 1, armL: 1, armR: 0 }, { lean: 3, legL: 2, armR: -6, face: "angry" }, { body: 1, lean: 4, legL: 1, armL: 1, armR: -7, face: "angry", fx: "impact" }, { lean: 2, armL: 1, armR: -2, face: "angry" }][f % 4]
    case "getHit": return [{ lean: -1, armL: 1, armR: 1 }, { body: 1, lean: -4, armL: 3, armR: 3, face: "ko", fx: "impact" }, { body: 2, lean: -5, armL: 4, armR: 4, face: "ko" }, { body: 1, lean: -2, armL: 2, armR: 2, face: "ko" }][f % 4]
    case "block": return [{ lean: -1, armL: -1, armR: -1, face: "angry" }, { body: 1, lean: -1, armL: -2, armR: -2, face: "angry" }, { lean: -1, armL: -1, armR: -1, face: "angry" }][f % 3]
    case "dance": {
      const sway = [-2, -1, 0, 1, 2, 1, 0, -1][f % 8], armUp = f % 2 === 0 ? -3 : -1
      return { body: f % 2, lean: sway, legL: f % 4 < 2 ? 1 : 0, legR: f % 4 < 2 ? 0 : 1, armL: armUp, armR: -armUp, face: "happy", fx: f % 4 === 0 ? "note" : null }
    }
    case "dab": return [{ armL: 0, armR: 0, face: "happy" }, { body: 1, armL: -5, armR: -2, lean: -2, face: "happy" }, { body: 1, armL: -6, armR: -3, lean: -2, face: "happy", fx: "note" }, { armL: 0, armR: 0, face: "happy" }][f % 4]
    case "floss": return [{ lean: -2, armL: 2, armR: -2, legL: 1, face: "happy" }, { body: 1, lean: -1, armL: 1, armR: -1, face: "happy", fx: "note" }, { lean: 2, armL: -2, armR: 2, legR: 1, face: "happy" }, { body: 1, lean: 1, armL: -1, armR: 1, face: "happy", fx: "note" }, { lean: -2, armL: 2, armR: -2, legL: 1, face: "happy" }, { body: 1, lean: 2, armL: -2, armR: 2, legR: 1, face: "happy", fx: "note" }][f % 6]
    case "jamal": return [
      { squash: -2, headBob: 1, hairDrag: 1, face: "normal" },
      { lean: 1, footR: 1, armL: -1, armR: 1, face: "normal" },
      { squash: 2, lean: 3, footR: 3, armL: -3, armR: 2, hairDrag: -1, face: "normal", fx: "note" },
      { squash: 1, lean: 3, footR: 3, legR: 1, armL: -4, armR: 1, face: "normal" },
      { squash: -2, headBob: 1, hairDrag: 1, face: "normal" },
      { lean: -1, footL: -1, armL: 1, armR: -1, face: "normal" },
      { squash: 2, lean: -3, footL: -3, armL: 2, armR: -3, hairDrag: -1, face: "normal", fx: "note" },
      { squash: 1, lean: -3, footL: -3, legL: 1, armL: 1, armR: -4, face: "normal" },
    ][f % 8]
  }
  return { body: 0 }
}

// Contorno automático: 1px em todo pixel transparente vizinho da silhueta
// (4-conexo). Marrom-café bem escuro — NUNCA preto puro.
const OUTLINE = { r: 43, g: 30, b: 26 } // #2b1e1a
function outlineFrame(ctx: Ctx, ox: number, oy: number) {
  const img = ctx.getImageData(ox, oy, FW, FH)
  const d = img.data
  const solid = (i: number) => d[i + 3] > 200
  const marks: number[] = []
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const i = (y * FW + x) * 4
      if (d[i + 3] !== 0) continue
      if (
        (x > 0 && solid(i - 4)) ||
        (x < FW - 1 && solid(i + 4)) ||
        (y > 0 && solid(i - FW * 4)) ||
        (y < FH - 1 && solid(i + FW * 4))
      ) marks.push(i)
    }
  }
  for (const i of marks) { d[i] = OUTLINE.r; d[i + 1] = OUTLINE.g; d[i + 2] = OUTLINE.b; d[i + 3] = 255 }
  ctx.putImageData(img, ox, oy)
}

// Constrói o spritesheet completo num canvas offscreen + mapa de frames.
export interface AvatarSheet { canvas: HTMLCanvasElement; frames: Record<string, { x: number; y: number }[]>; cols: number; rows: number; W: number; H: number }

export function buildAvatarSheet(config: AvatarConfig): AvatarSheet {
  const maxF = Math.max(...Object.values(ANIMS))
  const cols = maxF, rows = ANIM_ROWS.length * DIRS.length
  const W = cols * FW, H = rows * FH
  const canvas = document.createElement("canvas")
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  const frames: AvatarSheet["frames"] = {}
  let row = 0
  for (const dir of DIRS) for (const anim of ANIM_ROWS) {
    const key = `${dir}_${anim}`; frames[key] = []
    for (let f = 0; f < ANIMS[anim]; f++) {
      const ox = f * FW, oy = row * FH
      ctx.save(); ctx.translate(ox, oy)
      ctx.beginPath(); ctx.rect(0, 0, FW, FH); ctx.clip()
      drawChibi(ctx, config, dir, poseFor(anim, f), anim)
      ctx.restore()
      outlineFrame(ctx, ox, oy)
      frames[key].push({ x: ox, y: oy })
    }
    row++
  }
  return { canvas, frames, cols, rows, W, H }
}
