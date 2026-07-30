// Gerador procedural de avatar em pixel art — Canvas 2D PURO (sem PixiJS).
//
// Estilo alvo: STARDEW VALLEY CLÁSSICO em 16×32. Revisão de 23/07/2026: o
// sprite ganhou corpo (ombro, pescoço, vista lateral própria), ciclo de
// caminhada de verdade e rosto configurável. As âncoras abaixo são o contrato
// do estilo — mexer nelas muda a "espécie" do personagem.
//
//   cabelo   y 2..5    (coroa; alguns estilos sobem até y1)
//   cabeça   y 6..13   (pele, 8 de largura — o cabelo pode passar 1px de cada lado)
//   pescoço  y 13..14  (2px de largura, é o que tira a leitura de "caixa sobre caixa")
//   tronco   y 14..23  (7/8/9 de largura conforme a compleição; ombros chanfrados)
//   pernas   y 24..29
//   sapato   y 30..31  (pés plantados na base do frame)
//
// Regras de cor: 2 tons por superfície (base + sombra fria), destaque claro
// APENAS no cabelo, contorno marrom-café #2b1e1a — nunca preto puro.
//
// Vista lateral NÃO é a vista frontal com o rosto trocado: o tronco estreita,
// só um braço aparece e as pernas ganham passada à frente/atrás.
import {
  ANIMS, BOTTOMS, DIRS, FH, FW, HANDHELDS, PAL, SHOES, TOPS,
  normalizeConfig,
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

function px(ctx: Ctx, x: number, y: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1) }
function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0) }
function clearPx(ctx: Ctx, x: number, y: number) { ctx.clearRect(x | 0, y | 0, 1, 1) }

function clamp255(v: number) { return Math.max(0, Math.min(255, Math.round(v))) }

/** Sombra Stardew: ~30% mais escura com leve deslocamento para o azul. */
export function shadeCool(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return "#" + ((1 << 24) + (clamp255(r * 0.68) << 16) + (clamp255(g * 0.72) << 8) + clamp255(b * 0.84 + 8)).toString(16).slice(1)
}

/** Destaque ~20% mais claro — uso restrito ao cabelo (única exceção ao 2 tons). */
export function shadeLite(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return "#" + ((1 << 24) + (clamp255(r * 1.2 + 10) << 16) + (clamp255(g * 1.18 + 8) << 8) + clamp255(b * 1.1 + 6)).toString(16).slice(1)
}

const INK = "#2b1e1a"

function num(p: Pose, k: string): number { const v = p[k]; return typeof v === "number" ? v : 0 }

// ── Anatomia por compleição ─────────────────────────────────────────────────
// A largura do tronco é o que diferencia magro/médio/forte. O ombro mais largo
// que a cabeça é justamente o que faz o boneco ler como adulto e não como bebê.
const TORSO_W = [7, 8, 9]
const TORSO_W_SIDE = [5, 6, 6]

export function drawChibi(ctx: Ctx, raw: AvatarConfig, dir: Direction, pose: Pose, anim: string) {
  const s = normalizeConfig(raw)
  const skin = PAL.skin[s.skin], skinD = shadeCool(skin)
  const hair = PAL.hair[s.hair], hairD = shadeCool(hair), hairL = shadeLite(hair)
  const shirt = PAL.shirt[s.shirt], shirtD = shadeCool(shirt)
  const pants = PAL.pants[s.pants], pantsD = shadeCool(pants)
  const shoe = PAL.shoe[s.shoe], shoeD = shadeCool(shoe)
  const female = s.gender === "female"
  const top = TOPS[s.top], bottom = BOTTOMS[s.bottom], shoeType = SHOES[s.shoeType]

  const side = dir === "left" || dir === "right"
  const back = dir === "up"
  /** +1 = olhando para a direita, -1 = para a esquerda. */
  const face = dir === "right" ? 1 : -1

  const legBare = bottom === "Saia" || bottom === "Shorts" || top === "Vestido"
  const skirtLike = bottom === "Saia" || top === "Vestido"
  const sitting = anim === "sit"

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
  /** Passada da vista lateral: perna da frente avança, a de trás recua. */
  const stride = num(pose, "stride")

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

  const torsoW = side ? TORSO_W_SIDE[s.build] : TORSO_W[s.build]
  const tTop = 14 + by + bodyShift
  const tx = cx + leanTorso
  const hy = 6 + by + bodyShift + headBob
  const hx = cx + leanHead

  // ── Mochila (fica atrás de tudo) ──────────────────────────────────────────
  if (showMochila) {
    const mTop = tTop + 1, mx = tx
    const bagC = "#4a5a78", bagD = shadeCool(bagC)
    if (back) {
      rect(ctx, mx - 4, mTop, 8, 7, bagC); rect(ctx, mx - 4, mTop, 1, 7, bagD)
      rect(ctx, mx - 1, mTop + 2, 3, 3, bagD)
    } else if (side) {
      const bx = mx - face * 4
      rect(ctx, bx, mTop, 2, 7, bagC); px(ctx, bx, mTop + 6, bagD)
    } else {
      rect(ctx, mx - 4, mTop, 1, 5, bagD); rect(ctx, mx + 3, mTop, 1, 5, bagD)
    }
  }

  // ── Pernas ────────────────────────────────────────────────────────────────
  const legTop = tTop + 10
  const legW = female ? 3 : 4

  const drawShoe = (sx: number, sy: number, w: number, dark = false) => {
    const c = dark ? shoeD : shoe
    const cd = dark ? shadeCool(shoeD) : shoeD
    if (shoeType === "Bota") { rect(ctx, sx, sy - 1, w, 3, c); rect(ctx, sx, sy + 1, w, 1, cd) }
    else if (shoeType === "Sandália") { rect(ctx, sx, sy + 1, w, 1, c) }
    else if (shoeType === "Social") { rect(ctx, sx, sy, w, 2, c); px(ctx, sx + w - 1, sy + 1, cd) }
    else if (shoeType === "Sapatilha") { rect(ctx, sx, sy + 1, w, 1, c) }
    else { rect(ctx, sx, sy, w, 2, c); rect(ctx, sx, sy + 1, w, 1, cd) }
  }

  /** Perna da vista lateral: uma na frente da outra, a de trás em sombra. */
  const drawLegSide = (offset: number, lift: number, dark: boolean) => {
    const w = legW
    const lx = tx - Math.floor(w / 2) + offset + leanLegs
    let len = 6 - lift + bodyShift
    len = Math.max(2, Math.min(6, len))
    const base = legBare ? skin : pants
    const baseD = legBare ? skinD : pantsD
    rect(ctx, lx, legTop, w, len, dark ? baseD : base)
    if (!dark) rect(ctx, lx + w - 1, legTop, 1, len, baseD)
    if (legBare && bottom === "Shorts") rect(ctx, lx, legTop, w, 2, dark ? pantsD : pants)
    // O sapato da vista lateral avança 1px na direção do olhar: é o bico do pé.
    drawShoe(lx + (face > 0 ? 1 : -1), legTop + len, w, dark)
  }

  const drawLegFront = (sideSign: number, lift: number, slide: number) => {
    const lx = tx + (sideSign < 0 ? -legW : 0) + leanLegs + (slide || 0)
    let len = 6 - lift + bodyShift
    len = Math.max(2, Math.min(6, len))
    if (legBare) {
      rect(ctx, lx, legTop, legW, len, skin)
      rect(ctx, lx + legW - 1, legTop, 1, len, skinD)
      if (bottom === "Shorts") rect(ctx, lx, legTop, legW, 2, pants)
    } else {
      rect(ctx, lx, legTop, legW, len, pants)
      rect(ctx, lx + legW - 1, legTop, 1, len, pantsD)
    }
    // Vinco central separando as duas pernas — leitura Stardew.
    if (sideSign > 0) rect(ctx, lx, legTop, 1, len, INK)
    drawShoe(lx, legTop + len, legW)
  }

  const liftL = Math.max(0, num(pose, "legL"))
  const liftR = Math.max(0, num(pose, "legR"))

  if (!sitting) {
    if (side) {
      // Perna de trás primeiro (mais escura), depois a da frente por cima.
      drawLegSide(-stride * face, liftR, true)
      drawLegSide(stride * face, liftL, false)
    } else {
      drawLegFront(-1, liftL, footL)
      drawLegFront(1, liftR, footR)
    }

    if (skirtLike && top !== "Vestido") {
      const w = side ? 7 : 10
      rect(ctx, tx - Math.floor(w / 2), legTop, w, 3, pants)
      rect(ctx, tx + Math.ceil(w / 2) - 2, legTop, 2, 3, pantsD)
    }
  }

  // ── Tronco ────────────────────────────────────────────────────────────────
  const aL = num(pose, "armL"), aR = num(pose, "armR")
  const sleeveLong = top === "Social" || top === "Moletom" || top === "Jaleco" || top === "Hoodie" || top === "Terno" || top === "Vestido"
  const sleeveC = top === "Jaleco" ? "#d8d2c8" : shirt
  const sleeveCD = shadeCool(sleeveC)

  drawTorso(ctx, tx, tTop, torsoW, top, shirt, shirtD, skin, side)

  // Braços colados ao tronco. Na lateral existe UM braço só (o da frente); o
  // de trás fica escondido pelo corpo, como manda a vista de perfil.
  const drawArm = (sideSign: number, off: number, dark = false): { hx: number; hy: number } => {
    const base = dark ? sleeveCD : sleeveC
    const half = Math.floor(torsoW / 2)
    if (off > -3) {
      const ax = sideSign < 0 ? tx - half - 1 : tx + half + (torsoW % 2 === 0 ? 0 : 1)
      const sleeveH = sleeveLong ? 6 : 3
      rect(ctx, ax, tTop + off, 1, sleeveH, base)
      if (sideSign > 0) px(ctx, ax, tTop + off, sleeveCD)
      if (!sleeveLong) rect(ctx, ax, tTop + 3 + off, 1, 3, dark ? skinD : skin)
      px(ctx, ax, tTop + 5 + off, INK) // punho
      rect(ctx, ax, tTop + 6 + off, 1, 2, dark ? skinD : skin)
      return { hx: ax, hy: tTop + 7 + off }
    }
    // Braço levantado: sobe ao lado da cabeça, com o ombro ligando ao tronco.
    const ax = sideSign < 0 ? hx - 7 : hx + 6
    const handY = tTop + off
    rect(ctx, ax, handY, 1, Math.max(2, tTop - handY), base)
    px(ctx, ax, handY, skin)
    const shoulderX = sideSign < 0 ? tx - half : tx + half
    rect(ctx, Math.min(ax, shoulderX), tTop, Math.abs(ax - shoulderX) + 1, 1, base)
    return { hx: ax, hy: handY }
  }

  /**
   * Antebraço cruzado sobre o peito/rosto: ombro → cotovelo colado ao tronco →
   * antebraço atravessando na horizontal, mão na ponta.
   *
   * Existe porque o rig só tinha dois estados de braço — caído ao lado do corpo
   * ou erguido reto ao lado da cabeça. O gesto que carrega o Passinho do Jamal
   * é justamente este terceiro, e sem ele o passo não tem como ficar parecido.
   *
   * `from` = ombro de origem (-1 esquerdo, +1 direito). `y` = altura do
   * antebraço a partir do topo do tronco: 0 na altura do ombro, negativo sobe
   * até o rosto. `reach` = quanto o antebraço atravessa, em pixels.
   */
  const drawArmCross = (from: number, y: number, reach: number) => {
    const half = Math.floor(torsoW / 2)
    const shoulderX = from < 0 ? tx - half - 1 : tx + half + (torsoW % 2 === 0 ? 0 : 1)
    const armY = tTop + y
    // Braço superior: liga o ombro à altura do antebraço.
    const upTop = Math.min(tTop, armY)
    rect(ctx, shoulderX, upTop, 1, Math.abs(armY - tTop) + 1, sleeveC)
    // Antebraço atravessando em direção ao outro ombro.
    const endX = shoulderX - from * reach
    const x0 = Math.min(shoulderX, endX)
    const w = Math.abs(endX - shoulderX) + 1
    // Manga cobre a metade colada ao ombro; o resto é pele (antebraço nu).
    const sleeveW = sleeveLong ? w : Math.max(1, Math.round(w / 2))
    rect(ctx, x0, armY, w, 1, skin)
    rect(ctx, from < 0 ? x0 : x0 + w - sleeveW, armY, sleeveW, 1, sleeveC)
    px(ctx, endX, armY, skin) // mão
    px(ctx, endX + from, armY, INK) // punho, do lado de dentro
    return { hx: endX, hy: armY }
  }

  // Atenção: 0 é uma altura válida (antebraço na linha do ombro), então o teste
  // tem de ser "existe a chave?", não "é truthy?". Com `crossR ? ... : ...` o
  // frame de altura 0 caía silenciosamente no braço comum.
  const crossL = pose.crossL == null ? null : num(pose, "crossL")
  const crossR = pose.crossR == null ? null : num(pose, "crossR")
  const reachL = num(pose, "reachL") || 5
  const reachR = num(pose, "reachR") || 5

  // A cabeça e o cabelo são pintados DEPOIS dos braços. Um antebraço na altura
  // do rosto (y < 0) desenhado aqui seria coberto por eles e sumiria — que é
  // exatamente o gesto do passinho. Por isso ele fica pendurado e é executado
  // no fim, sobre a cabeça.
  const overHead: (() => void)[] = []
  const cross = (from: number, y: number, reach: number) => {
    if (y < 0) {
      overHead.push(() => drawArmCross(from, y, reach))
      return { hx: 0, hy: 0 }
    }
    return drawArmCross(from, y, reach)
  }

  let handL = { hx: 0, hy: 0 }
  if (side) {
    // Um braço só: o da frente. Quando levanta, usa o valor do braço direito.
    // Cruzado no perfil vira um antebraço curto à frente do peito.
    const c = crossR ?? crossL
    if (c != null) handL = cross(face, c, 3)
    else handL = drawArm(face, aR !== 0 ? aR : aL)
  } else {
    handL = crossL != null ? cross(-1, crossL, reachL) : drawArm(-1, aL)
    if (crossR != null) cross(1, crossR, reachR)
    else drawArm(1, aR)
  }
  if (s.acc === 6) px(ctx, handL.hx, handL.hy - 1, "#33302c") // smartwatch

  // ── Pescoço ───────────────────────────────────────────────────────────────
  // 2px entre queixo e ombro. Sem isso a cabeça encaixa direto no tronco e o
  // boneco vira dois blocos empilhados.
  rect(ctx, hx - 1, hy + 8, 2, 1, skin)
  px(ctx, hx, hy + 8, skinD) // meio-tom à direita, como no resto do corpo

  // ── Cabeça ────────────────────────────────────────────────────────────────
  const headH = 8
  rect(ctx, hx - 4, hy, 8, headH, skin)
  rect(ctx, hx + 3, hy + 1, 1, headH - 2, skinD) // sombra à direita
  // Sombra do queixo só nos cantos: uma faixa de 6px atravessando o rosto
  // colidia com a boca e virava um borrão cinza no meio da cara.
  px(ctx, hx - 3, hy + headH - 1, skinD)
  px(ctx, hx + 2, hy + headH - 1, skinD)

  // Formato do rosto: quais cantos são recortados.
  if (s.faceShape === 0) { // oval — recorta os 4 cantos
    clearPx(ctx, hx - 4, hy); clearPx(ctx, hx + 3, hy)
    clearPx(ctx, hx - 4, hy + headH - 1); clearPx(ctx, hx + 3, hy + headH - 1)
  } else if (s.faceShape === 2) { // redondo — recorta mais embaixo (queixo fino)
    clearPx(ctx, hx - 4, hy); clearPx(ctx, hx + 3, hy)
    rect(ctx, hx - 4, hy + headH - 1, 1, 1, "rgba(0,0,0,0)")
    clearPx(ctx, hx - 4, hy + headH - 1); clearPx(ctx, hx + 3, hy + headH - 1)
    clearPx(ctx, hx - 3, hy + headH - 1); clearPx(ctx, hx + 2, hy + headH - 1)
  }
  // faceShape 1 (quadrado) mantém os cantos — mandíbula marcada.

  drawFace(ctx, hx, hy, dir, s, pose.face as string | undefined, skinD)
  drawBeard(ctx, hx, hy, dir, s.beard, hair, hairD)
  drawHair(ctx, hx, hy + hairDrag, dir, hair, hairD, hairL, female, s.hairStyle)
  drawAccessory(ctx, hx, hy, dir, s.acc)
  // Antebraço cruzado na altura do rosto: vai por cima da cabeça e do cabelo,
  // senão o gesto some. Ver o comentário em `overHead`.
  for (const draw of overHead) draw()
  if (showHandItem) drawHandItem(ctx, handName, tx, tTop, dir, aR)
  const fx = pose.fx as string | undefined
  if (fx) drawFx(ctx, fx, hx, hy, tx, tTop, dir)
  void back
}

// ── Tronco ──────────────────────────────────────────────────────────────────
function drawTorso(
  ctx: Ctx, tx: number, tTop: number, w: number,
  top: string, shirt: string, shirtD: string, skin: string, side: boolean,
) {
  const body = (width: number) => {
    const x = tx - Math.floor(width / 2)
    rect(ctx, x, tTop, width, 10, shirt)
    rect(ctx, x + width - 2, tTop + 1, 2, 8, shirtD) // sombra à direita
    rect(ctx, tx - 2, tTop, 4, 1, shirtD) // sombra do queixo no peito
    px(ctx, x, tTop + 7, shirtD); px(ctx, x + width - 1, tTop + 7, shirtD)
    rect(ctx, x, tTop + 9, width, 1, INK) // cinto
    // Ombros chanfrados: o pixel de canto sai fora e o trapézio aparece.
    clearPx(ctx, x, tTop); clearPx(ctx, x + width - 1, tTop)
    return x
  }
  if (top === "Vestido") {
    rect(ctx, tx - 3, tTop, 6, 5, shirt)
    rect(ctx, tx - 4, tTop + 5, 8, 5, shirt)
    rect(ctx, tx + 2, tTop + 1, 1, 4, shirtD); rect(ctx, tx + 3, tTop + 5, 1, 5, shirtD)
    return
  }
  if (top === "Regata") {
    const x = body(w)
    rect(ctx, x, tTop, 2, 1, skin); rect(ctx, x + w - 2, tTop, 2, 1, skin); return
  }
  if (top === "Social" || top === "Polo") {
    body(w)
    if (!side) {
      rect(ctx, tx, tTop + 1, 1, 8, shirtD) // botões
      px(ctx, tx - 1, tTop, shirtD); px(ctx, tx + 1, tTop, shirtD) // colarinho
    }
    return
  }
  if (top === "Jaleco") {
    const x = tx - Math.floor(w / 2)
    rect(ctx, x, tTop, w, 10, "#d8d2c8")
    if (!side) rect(ctx, tx - 1, tTop, 2, 10, shirt)
    rect(ctx, x + w - 1, tTop + 1, 1, 9, "#a8a294")
    clearPx(ctx, x, tTop); clearPx(ctx, x + w - 1, tTop); return
  }
  if (top === "Terno") {
    const x = tx - Math.floor(w / 2)
    rect(ctx, x, tTop, w, 10, "#33302c")
    if (!side) {
      rect(ctx, tx - 1, tTop, 2, 8, "#d8d2c8")
      px(ctx, tx, tTop + 1, shirt); px(ctx, tx, tTop + 2, shirt) // gravata
    }
    rect(ctx, x + w - 1, tTop + 1, 1, 9, shadeCool("#33302c"))
    clearPx(ctx, x, tTop); clearPx(ctx, x + w - 1, tTop); return
  }
  if (top === "Moletom" || top === "Hoodie") {
    const x = body(w)
    rect(ctx, x + 1, tTop + 6, w - 2, 2, shirtD) // bolso canguru
    if (top === "Hoodie") rect(ctx, tx - 3, tTop, 6, 1, shirtD) // capuz caído
    return
  }
  if (top === "Time") {
    const x = body(w)
    rect(ctx, x, tTop + 3, w, 1, "#d8d2c8")
    return
  }
  body(w)
  px(ctx, tx - 1, tTop, shirtD); px(ctx, tx, tTop, shirtD) // gola
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

// ── Rosto ───────────────────────────────────────────────────────────────────
// Olho de 2×2 (íris em cima, pupila embaixo) continua sendo o padrão, mas o
// formato agora é configurável: grande usa 2×3, fino usa 2×1, caído desce 1px
// do lado de fora. Sobrancelha e boca também entram no config.
function drawFace(
  ctx: Ctx, hx: number, hy: number, dir: Direction,
  s: Required<AvatarConfig>, expr: string | undefined, skinD: string,
) {
  if (dir === "up") return
  const dark = INK
  // A íris entra escurecida: num rosto de 6px, cor pura vira dois faróis.
  // O tom só precisa insinuar a cor do olho, não anunciá-la.
  const iris = shadeCool(PAL.eye[s.eyeColor % PAL.eye.length])
  const brow = shadeCool(PAL.hair[s.hair])
  // Grade vertical do rosto (cabeça = 8 linhas, hy..hy+7):
  //   hy+2 sobrancelha · hy+3 íris · hy+4 pupila · hy+6 boca · hy+7 queixo
  // Empurrar os olhos para hy+4 espremia boca e queixo na mesma linha.
  const ey = hy + 3

  const eye = (x: number, outward: number) => {
    if (expr === "sleep") { rect(ctx, x, ey + 1, 2, 1, dark); return }
    if (expr === "happy") { px(ctx, x, ey + 2, dark); px(ctx, x + 1, ey + 1, dark); return }
    if (expr === "ko") {
      px(ctx, x, ey, dark); px(ctx, x + 1, ey + 1, dark)
      px(ctx, x + 1, ey, dark); px(ctx, x, ey + 1, dark); return
    }
    if (expr === "blink") { rect(ctx, x, ey + 1, 2, 1, shadeCool(skinD)); return }
    // O olho padrão ocupa UMA linha: pupila no canto interno, íris no externo.
    // Duas linhas cheias somadas à sobrancelha comiam metade do rosto e o
    // personagem ficava com cara de máscara de mergulho.
    const inner = outward > 0 ? x + 1 : x
    const outer = outward > 0 ? x : x + 1
    switch (s.eyes) {
      case 1: // grande — ganha a linha da pálpebra acima
        px(ctx, inner, ey + 1, dark); px(ctx, outer, ey + 1, iris)
        rect(ctx, x, ey, 2, 1, dark)
        break
      case 2: // fino — só a pupila, sem íris visível
        px(ctx, inner, ey + 1, dark)
        break
      case 3: // caído — o canto externo escorrega 1px para baixo
        px(ctx, inner, ey + 1, dark); px(ctx, outer, ey + 2, iris)
        break
      default:
        px(ctx, inner, ey + 1, dark); px(ctx, outer, ey + 1, iris)
    }
    if (expr === "angry") px(ctx, x + (outward > 0 ? 0 : 1), ey - 1, dark)
  }

  const drawBrow = (x: number, outward: number) => {
    const y = ey - 1
    switch (s.brow) {
      case 1: // arqueada — 1px acima no canto interno
        rect(ctx, x, y, 2, 1, brow)
        px(ctx, x + (outward > 0 ? 0 : 1), y - 1, brow)
        break
      case 2: // grossa
        rect(ctx, x, y, 2, 1, brow)
        rect(ctx, x, y - 1, 2, 1, brow)
        break
      case 3: // fina — 1px só
        px(ctx, x + (outward > 0 ? 0 : 1), y, brow)
        break
      default:
        rect(ctx, x, y, 2, 1, brow)
    }
  }

  const drawMouth = (x: number, w: number) => {
    const y = ey + 3
    if (expr === "happy") { rect(ctx, x, y, w, 1, dark); return }
    if (expr === "angry" || expr === "ko") { px(ctx, x + Math.floor(w / 2), y, "#8a4438"); return }
    if (expr === "sleep") { px(ctx, x + Math.floor(w / 2), y, dark); return }
    switch (s.mouth) {
      case 1: rect(ctx, x, y, w, 1, dark); px(ctx, x + w - 1, y - 1, dark); break // sorriso
      case 2: rect(ctx, x, y, w, 1, shadeCool(skinD)); break // séria
      case 3: rect(ctx, x, y, Math.max(1, w - 1), 1, dark); rect(ctx, x, y + 1, Math.max(1, w - 1), 1, "#8a4438"); break // aberta
      default: px(ctx, x + Math.floor(w / 2), y, dark)
    }
  }

  if (dir === "down") {
    const lx = hx - 3, rx = hx + 1 // 2px de vão entre os olhos
    drawBrow(lx, 1); drawBrow(rx, -1)
    eye(lx, 1); eye(rx, -1)
    drawMouth(hx - 1, 2)
  } else {
    // Perfil: um olho só, encostado na direção do olhar.
    const x = dir === "left" ? hx - 3 : hx + 1
    drawBrow(x, dir === "left" ? 1 : -1)
    eye(x, dir === "left" ? 1 : -1)
    drawMouth(dir === "left" ? hx - 4 : hx + 3, 1)
  }
}

/** Barba/bigode: mesma cor do cabelo, sempre 1-2px — mais que isso vira mancha. */
function drawBeard(ctx: Ctx, hx: number, hy: number, dir: Direction, beard: number, hair: string, hairD: string) {
  if (!beard || dir === "up") return
  const ey = hy + 4
  const front = dir === "down"
  if (beard === 1) { // cavanhaque
    if (front) rect(ctx, hx - 1, ey + 4, 2, 2, hair)
    else px(ctx, dir === "left" ? hx - 3 : hx + 2, ey + 4, hair)
  } else if (beard === 2) { // bigode
    if (front) rect(ctx, hx - 2, ey + 2, 4, 1, hair)
    else rect(ctx, dir === "left" ? hx - 4 : hx + 2, ey + 2, 2, 1, hair)
  } else if (beard === 3) { // cheia
    if (front) {
      rect(ctx, hx - 3, ey + 2, 6, 3, hair)
      rect(ctx, hx - 1, ey + 3, 2, 1, hairD) // vão da boca
      rect(ctx, hx - 4, ey + 1, 1, 3, hair); rect(ctx, hx + 3, ey + 1, 1, 3, hair)
    } else {
      const x = dir === "left" ? hx - 4 : hx + 1
      rect(ctx, x, ey + 1, 3, 4, hair)
    }
  } else if (beard === 4) { // costeleta
    if (dir !== "right") rect(ctx, hx - 4, ey, 1, 3, hair)
    if (dir !== "left") rect(ctx, hx + 3, ey, 1, 3, hair)
  }
}

// ── Cabelo ──────────────────────────────────────────────────────────────────
function drawHair(ctx: Ctx, hx: number, hy: number, dir: Direction, hair: string, hairD: string, hairL: string, female: boolean, st: number) {
  const back = dir === "up"
  const side = dir === "left" || dir === "right"

  const cap = () => {
    rect(ctx, hx - 3, hy - 4, 6, 1, hair)
    rect(ctx, hx - 4, hy - 3, 8, 3, hair)
    rect(ctx, hx - 5, hy - 2, 1, 3, hair); rect(ctx, hx + 4, hy - 2, 1, 3, hair)
    clearPx(ctx, hx - 4, hy - 3); clearPx(ctx, hx + 3, hy - 3)
    rect(ctx, hx - 3, hy - 4, 3, 1, hairL) // luz do canto superior esquerdo
    px(ctx, hx - 4, hy - 3, hairL)
    // A sombra do cabelo fica no lado oposto à luz, em bloco. Pixels escuros
    // soltos no meio da massa liam como sujeira, não como textura.
    rect(ctx, hx + 2, hy - 3, 2, 3, hairD)
  }
  const franja = () => {
    if (back) return
    if (side) {
      // No perfil a franja cai para o lado do rosto, não em dentes soltos.
      const x = dir === "left" ? hx - 5 : hx + 2
      rect(ctx, x, hy, 3, 1, hair)
      px(ctx, dir === "left" ? hx - 5 : hx + 4, hy + 1, hair)
      return
    }
    px(ctx, hx - 3, hy, hair); px(ctx, hx, hy, hair); px(ctx, hx + 2, hy, hair)
    px(ctx, hx - 4, hy, hair); px(ctx, hx + 3, hy, hair)
  }
  const sideHair = (len: number) => {
    if (dir !== "right") rect(ctx, hx - 5, hy + 1, 1, len, hair)
    if (dir !== "left") { rect(ctx, hx + 4, hy + 1, 1, len, hair); px(ctx, hx + 4, hy + len, hairD) }
  }
  const backMass = (h: number) => {
    rect(ctx, hx - 4, hy, 8, h, hair)
    rect(ctx, hx + 2, hy, 2, h, hairD)
  }
  /**
   * Nuca: no perfil o cabelo tem de fechar a parte de trás do crânio. Com uma
   * coluna só sobrava testa demais e o personagem parecia careca de lado.
   */
  const nape = (h: number) => {
    if (!side) return
    const x = dir === "left" ? hx + 2 : hx - 4
    rect(ctx, x, hy, 2, h, hair)
    rect(ctx, dir === "left" ? hx + 3 : hx - 4, hy, 1, h, hairD)
  }

  switch (st) {
    case 0: cap(); franja(); nape(4); if (back) backMass(6); break
    case 1: cap(); franja(); sideHair(female ? 6 : 4); nape(female ? 6 : 4); if (back) backMass(female ? 8 : 6); break
    case 2: // topete
      cap(); rect(ctx, hx - 1, hy - 5, 3, 1, hair); px(ctx, hx + 1, hy - 6, hair); px(ctx, hx + 2, hy - 5, hairD)
      if (!back) franja(); sideHair(female ? 5 : 2); nape(3); if (back) backMass(6); break
    case 3: // rabo de cavalo
      cap(); franja(); nape(4)
      if (dir === "down" || dir === "up") { rect(ctx, hx + 4, hy - 2, 1, 9, hair); px(ctx, hx + 4, hy + 6, hairD) }
      else if (dir === "left") { rect(ctx, hx + 4, hy - 1, 2, 8, hair); px(ctx, hx + 5, hy + 6, hairD) }
      else { rect(ctx, hx - 5, hy - 1, 2, 8, hair) }
      if (female) sideHair(4); break
    case 4: // coque
      cap(); rect(ctx, hx - 1, hy - 6, 3, 2, hair); px(ctx, hx + 1, hy - 5, hairD)
      if (!back) franja(); sideHair(female ? 4 : 2); nape(3); if (back) backMass(6); break
    case 5: // carequinha — rente, mas ainda cobre a nuca
      rect(ctx, hx - 3, hy - 1, 6, 1, hair); px(ctx, hx - 3, hy, hairD)
      rect(ctx, hx - 4, hy, 8, 1, hair)
      nape(2)
      if (back) rect(ctx, hx - 3, hy, 6, 2, hair); break
    case 6: // moicano
      rect(ctx, hx - 1, hy - 4, 3, 6, hair); px(ctx, hx + 1, hy - 2, hairD)
      rect(ctx, hx - 3, hy, 2, 1, hairD); rect(ctx, hx + 2, hy, 2, 1, hairD)
      nape(3)
      if (back) rect(ctx, hx - 1, hy, 3, 5, hair); break
    case 7: // cacheado
      rect(ctx, hx - 3, hy - 4, 6, 1, hair)
      rect(ctx, hx - 5, hy - 3, 10, 4, hair)
      clearPx(ctx, hx - 5, hy - 3); clearPx(ctx, hx + 4, hy - 3)
      px(ctx, hx - 3, hy - 5, hair); px(ctx, hx + 1, hy - 5, hair)
      px(ctx, hx - 2, hy - 2, hairD); px(ctx, hx + 2, hy - 1, hairD)
      rect(ctx, hx + 3, hy - 2, 2, 3, hairD)
      nape(5)
      if (back) backMass(7); break
    case 8: // longo
      cap(); franja()
      if (dir !== "right") rect(ctx, hx - 5, hy + 1, 1, 10, hair)
      if (dir !== "left") { rect(ctx, hx + 4, hy + 1, 1, 10, hair); px(ctx, hx + 4, hy + 10, hairD) }
      nape(10)
      if (back) backMass(11)
      break
    case 9: // maria-chiquinhas
      cap(); franja(); nape(3)
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
      rect(ctx, hx - 4, hy - 1, 8, 1, hairD)
      if (!back) rect(ctx, hx - 2, hy - 1, 5, 1, hair)
      nape(3)
      if (back) rect(ctx, hx - 4, hy, 8, 3, hairD); break
    case 11: // franjão
      cap()
      if (!back && !side) {
        rect(ctx, hx - 4, hy, 8, 1, hair)
        px(ctx, hx - 2, hy, hairD); px(ctx, hx + 2, hy, hairD)
        px(ctx, hx - 3, hy + 1, hair); px(ctx, hx + 2, hy + 1, hair)
      } else franja()
      sideHair(female ? 6 : 3); nape(5); if (back) backMass(8); break
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

// ── Tabela de poses ─────────────────────────────────────────────────────────
const T = Math.PI * 2

// Passinho do Jamal — decalcado de vídeo de referência, não inventado.
//
// Medição do período: auto-similaridade de POSE (distância entre o frame de
// referência e cada frame vizinho, corpo inteiro, 24fps). Os mínimos caem em
// Δ ≈ 1,04–1,33s → a frase é de 32 frames = 1,333s.
//
// Cuidado: autocorrelar o *sinal de movimento* (diferença entre frames
// consecutivos) dá 0,667s. Aquilo é o quique, meia frase — usar esse número faz
// o boneco dançar no dobro da velocidade e perder metade da coreografia.
//
// O gesto (trecho a partir de 5s, onde o passo é ensinado): o antebraço varre
// na HORIZONTAL cruzado sobre o peito/rosto, cotovelo dobrado, mão indo de um
// ombro ao outro — e alterna de braço. Não é braço erguido ao lado da cabeça:
// essa foi a leitura errada das duas primeiras versões, e é por isso que o
// canal `crossL`/`crossR` teve de ser criado no rig (ver drawArmCross).
//
// As pernas ficam quase juntas: quique curto e pivô de pé, sem elevação de
// joelho. Levantar joelho foi outro erro das versões anteriores.
//
// Estrutura da frase (16 poses a 12fps = 1,333s):
//   0-4    antebraço direito varre do rosto para o peito, abrindo o alcance
//   5      braços soltos, quique no contratempo
//   6-7    recarrega para o outro lado
//   8-15   a mesma coisa espelhada, antebraço esquerdo
//
// Tradução para 16×32: o boneco não tem cotovelo, então o "antebraço no rosto"
// vira braço rente ao corpo (armR ≥ -3) e o lançamento vira braço erguido ao
// lado da cabeça (armR ≤ -5) somado ao `lean` — é o `lean` que desenha a
// diagonal, o braço sozinho só sobe reto. `squash` marca os tempos fortes: o
// corpo afunda em f0/f8 e estica no topo do braço.
// Amplitudes: `squash` fica em ±1. Com ±2 o corpo percorre 4px verticais num
// sprite de 32 — vira pogo, não dança. Quem carrega o desenho é o `lean`
// (torso 0,5× · cabeça 0,8× · pernas 0,15×), que é o que dá a diagonal.
// crossR/crossL: altura do antebraço a partir do topo do tronco (negativo sobe
// até o rosto). reachR/reachL: quantos pixels ele atravessa.
const JAMAL: Pose[] = [
  // ── Antebraço direito varrendo para a esquerda ────────────────────────────
  // O antebraço fica ALTO, na linha do rosto (tTop-4 ≈ meio da cabeça), e
  // sustentado — não é uma varrida contínua descendo. Foi o erro da versão
  // anterior, que deixava o braço na altura do peito o tempo todo.
  { squash: -1, lean: 1, crossR: -4, reachR: 7, armL: 1, footL: -1, headBob: 1, face: "happy" },
  { squash: 0, lean: 1, crossR: -4, reachR: 6, armL: 1, face: "happy", fx: "note" },
  { squash: 0, lean: 0, crossR: -3, reachR: 6, armL: 1, footR: 1, face: "happy" },
  { squash: -1, lean: 0, crossR: -2, reachR: 5, armL: 0, footR: 1, hairDrag: 1, face: "happy" },
  { squash: 0, lean: -1, crossR: 0, reachR: 4, armL: 0, face: "happy" },
  // Contratempo: braços soltos, o corpo é que marca o tempo.
  { squash: 1, lean: -1, armR: 0, armL: 0, footL: -1, hairDrag: -1, face: "happy" },
  { squash: 0, lean: 0, crossR: -2, reachR: 5, armL: 1, footL: -1, legL: 1, face: "happy" },
  { squash: -1, lean: 1, crossR: -4, reachR: 7, armL: 1, headBob: 1, face: "happy" },
  // ── Espelhado: antebraço esquerdo varrendo para a direita ─────────────────
  { squash: -1, lean: -1, crossL: -4, reachL: 7, armR: 1, footR: 1, headBob: 1, face: "happy" },
  { squash: 0, lean: -1, crossL: -4, reachL: 6, armR: 1, face: "happy", fx: "note" },
  { squash: 0, lean: 0, crossL: -3, reachL: 6, armR: 1, footL: -1, face: "happy" },
  { squash: -1, lean: 0, crossL: -2, reachL: 5, armR: 0, footL: -1, hairDrag: 1, face: "happy" },
  { squash: 0, lean: 1, crossL: 0, reachL: 4, armR: 0, face: "happy" },
  { squash: 1, lean: 1, armR: 0, armL: 0, footR: 1, hairDrag: -1, face: "happy" },
  { squash: 0, lean: 0, crossL: -2, reachL: 5, armR: 1, footR: 1, legR: 1, face: "happy" },
  { squash: -1, lean: -1, crossL: -4, reachL: 7, armR: 1, headBob: 1, face: "happy" },
]

export function poseFor(anim: string, f: number): Pose {
  switch (anim) {
    case "idle": {
      // Respiração de 1px em 8 frames + piscada curta no frame 6. O corpo
      // sobe/desce só 1px: 2px viraria soluço numa animação que roda o dia todo.
      const b = [0, 0, 1, 1, 0, 0, 1, 1][f % 8]
      const blink = f % 8 === 6
      return { body: b, armL: b, armR: b, face: blink ? "blink" : undefined }
    }
    case "walk": {
      // Ciclo clássico de 4 tempos: contato → passagem → contato → passagem.
      // Na passagem o corpo sobe 1px (é o que dá o "quique" da caminhada).
      const cycle: Pose[] = [
        { body: 0, stride: 2, legL: 0, legR: 1, armL: 1, armR: 0, footL: -1, footR: 1 },
        { body: -1, stride: 0, legL: 1, legR: 0, armL: 0, armR: 0 },
        { body: 0, stride: -2, legL: 1, legR: 0, armL: 0, armR: 1, footL: 1, footR: -1 },
        { body: -1, stride: 0, legL: 0, legR: 1, armL: 0, armR: 0 },
      ]
      return cycle[f % 4]
    }
    case "run": {
      const ph = (f / ANIMS.run) * T
      const swA = Math.round(Math.sin(ph) * 3), swB = Math.round(Math.sin(ph + Math.PI) * 3)
      return {
        body: Math.abs(swA) >= 2 ? -1 : 0, lean: 3, stride: swA,
        legL: swA > 0 ? swA : 0, legR: swB > 0 ? swB : 0,
        armL: swA > 0 ? 2 : 0, armR: swB > 0 ? 2 : 0,
      }
    }
    case "push": { const b = [0, 1, 0, 1][f % 4]; return { body: b, lean: 2, legL: b ? 1 : 0, legR: b ? 0 : 1, armL: -2, armR: -2 } }
    case "jump": return [{ body: 1, legL: 1, legR: 1, armL: 1, armR: 1 }, { body: -3, legL: 2, legR: 2, armL: -3, armR: -3 }, { body: -5, legL: 2, legR: 2, armL: -4, armR: -4 }, { body: -3, legL: 1, legR: 1, armL: -2, armR: -2 }, { body: 0 }][f % 5]
    case "hurt": return [{ body: 0, lean: -2, armL: 2, armR: 2, face: "ko" }, { body: 1, lean: -3, armL: 3, armR: 3, face: "ko", fx: "impact" }, { body: 0, lean: -1, armL: 2, armR: 2, face: "ko" }][f % 3]
    case "wave": return [{ armR: -4, face: "happy" }, { armR: -5, face: "happy" }, { armR: -4, face: "happy" }, { armR: -5, face: "happy" }, { armR: -4, face: "happy" }][f % 5]
    case "sleep": return { body: [0, 0, 1, 1][f % 4], face: "sleep", armL: 1, armR: 1, fx: "zzz" }
    case "celebrate": return [{ armL: -4, armR: -4, face: "happy" }, { body: -2, legL: 1, legR: 1, armL: -5, armR: -5, face: "happy", fx: "stars" }, { body: -3, legL: 2, legR: 2, armL: -5, armR: -5, face: "happy", fx: "stars" }, { body: -2, legL: 1, legR: 1, armL: -5, armR: -5, face: "happy" }, { armL: -4, armR: -4, face: "happy", fx: "stars" }, { body: -2, legL: 1, legR: 1, armL: -5, armR: -5, face: "happy" }][f % 6]
    case "type": return [{ armL: 2, armR: 1, lean: 1 }, { armL: 1, armR: 2, lean: 1 }, { armL: 2, armR: 2, lean: 1 }, { armL: 1, armR: 1, lean: 1 }][f % 4]
    // Corpo mais baixo e pernas recolhidas (omitidas em drawChibi): é uma
    // pose própria de cadeira, não um sprite de pé parcialmente cortado.
    case "sit": return [
      { body: 3, lean: 1, armL: 1, armR: 2 },
      { body: 3, lean: 1, armL: 2, armR: 1 },
      { body: 3, lean: 1, armL: 1, armR: 1 },
      { body: 3, lean: 1, armL: 2, armR: 2 },
    ][f % 4]
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
    // Apoiado no guarda-corpo: tronco inclinado para frente, braços na barra,
    // respiração de 4 frames — quase parado, só o peso trocando de pé.
    case "lean": return [
      { lean: 2, armL: 1, armR: 1 },
      { lean: 2, armL: 1, armR: 1, body: 1 },
      { lean: 3, armL: 2, armR: 1 },
      { lean: 2, armL: 1, armR: 2, body: 1 },
    ][f % 4]
    case "floss": return [{ lean: -2, armL: 2, armR: -2, legL: 1, face: "happy" }, { body: 1, lean: -1, armL: 1, armR: -1, face: "happy", fx: "note" }, { lean: 2, armL: -2, armR: 2, legR: 1, face: "happy" }, { body: 1, lean: 1, armL: -1, armR: 1, face: "happy", fx: "note" }, { lean: -2, armL: 2, armR: -2, legL: 1, face: "happy" }, { body: 1, lean: 2, armL: -2, armR: 2, legR: 1, face: "happy", fx: "note" }][f % 6]
    case "jamal": return JAMAL[f % JAMAL.length]
  }
  return { body: 0 }
}

// ── Contorno ────────────────────────────────────────────────────────────────
// 1px marrom-café em todo pixel transparente vizinho da silhueta (4-conexo).
// Roda UMA vez sobre a folha inteira: antes eram ~500 leituras de ImageData
// (uma por frame), o que dominava o custo de montar o avatar.
const OUTLINE = { r: 43, g: 30, b: 26 }

function outlineSheet(ctx: Ctx, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const solid = (i: number) => d[i + 3] > 200
  const marks: number[] = []
  for (let y = 0; y < h; y++) {
    // Posição dentro da célula: o contorno NÃO pode atravessar a fronteira
    // entre frames, senão o pé de um sprite desenha uma linha no topo do
    // sprite de baixo (os frames ficam colados no atlas, sem margem).
    const cy = y % FH
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (d[i + 3] !== 0) continue
      const cx = x % FW
      if (
        (cx > 0 && solid(i - 4)) ||
        (cx < FW - 1 && solid(i + 4)) ||
        (cy > 0 && solid(i - w * 4)) ||
        (cy < FH - 1 && solid(i + w * 4))
      ) marks.push(i)
    }
  }
  for (const i of marks) { d[i] = OUTLINE.r; d[i + 1] = OUTLINE.g; d[i + 2] = OUTLINE.b; d[i + 3] = 255 }
  ctx.putImageData(img, 0, 0)
}

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
      frames[key].push({ x: ox, y: oy })
    }
    row++
  }
  // Frames vizinhos ficam colados no atlas; o contorno global não vaza entre
  // eles porque só marca pixels transparentes adjacentes a pixels opacos, e a
  // margem entre sprites é sempre transparente dos dois lados.
  outlineSheet(ctx, W, H)
  return { canvas, frames, cols, rows, W, H }
}
