// Gerador procedural de avatar chibi em pixel art — Canvas 2D PURO (sem PixiJS).
// Portado do "Chibi Avatar Lab": mesma lógica de desenho/poses (com os fixes de
// âncora, cabelo e alternância de membros), agora como módulo TS reutilizável.
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
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt))
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

function num(p: Pose, k: string): number { const v = p[k]; return typeof v === "number" ? v : 0 }

export function drawChibi(ctx: Ctx, s: AvatarConfig, dir: Direction, pose: Pose, anim: string) {
  const skin = PAL.skin[s.skin], skinD = shade(skin, -30), skinL = shade(skin, 12)
  const hair = PAL.hair[s.hair], hairD = shade(hair, -32), hairL = shade(hair, 28)
  const shirt = PAL.shirt[s.shirt], shirtD = shade(shirt, -28), shirtL = shade(shirt, 20)
  const pants = PAL.pants[s.pants], pantsD = shade(pants, -25), pantsL = shade(pants, 18)
  const shoe = PAL.shoe[s.shoe]
  const female = s.gender === "female"
  const top = TOPS[s.top], bottom = BOTTOMS[s.bottom], shoeType = SHOES[s.shoeType]

  const legBare = bottom === "Saia" || bottom === "Shorts" || top === "Vestido"
  const skirtLike = bottom === "Saia" || top === "Vestido"

  const cx = 16
  const by = num(pose, "body") | 0
  const lean = num(pose, "lean")
  const leanLegs = Math.round(lean * 0.15)
  const leanTorso = Math.round(lean * 0.6)
  const leanHead = lean

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

  ctx.globalAlpha = 0.18
  rect(ctx, 10 + leanLegs, 30, 12, 2, "#000")
  ctx.globalAlpha = 1

  if (showMochila) {
    const mTop = 15 + by, mx = cx + leanTorso
    const bagC = "#3a6ea5", bagD = shade(bagC, -30), bagL = shade(bagC, 25)
    if (dir === "up") {
      rect(ctx, mx - 4, mTop, 8, 8, bagC); rect(ctx, mx - 4, mTop, 8, 1, bagL)
      rect(ctx, mx - 4, mTop, 1, 8, bagD); rect(ctx, mx - 2, mTop + 2, 4, 3, bagD)
    } else if (dir === "down") {
      rect(ctx, mx - 4, mTop + 1, 1, 6, bagC); rect(ctx, mx + 3, mTop + 1, 1, 6, bagC)
    } else {
      const bx = dir === "left" ? mx + 3 : mx - 6
      rect(ctx, bx, mTop, 3, 8, bagC); rect(ctx, bx, mTop, 3, 1, bagL)
    }
  }

  const squashDrop = squash < 0 ? -squash : 0
  const stretchUp = squash > 0 ? squash : 0
  const bodyShift = squashDrop - stretchUp
  const legTop = 22 + by
  const legW = female ? 2 : 3
  const legSpread = female ? 1 : 2
  const drawShoe = (sx: number, sy: number, w: number) => {
    if (shoeType === "Bota") { rect(ctx, sx, sy - 1, w, 3, shoe); rect(ctx, sx, sy - 1, w, 1, shade(shoe, 20)) }
    else if (shoeType === "Sandália") { rect(ctx, sx, sy + 1, w, 1, shoe); px(ctx, sx, sy, shoe) }
    else if (shoeType === "Social") { rect(ctx, sx, sy, w + 1, 2, shoe); rect(ctx, sx, sy, w + 1, 1, shade(shoe, 25)) }
    else if (shoeType === "Sapatilha") { rect(ctx, sx, sy + 1, w, 1, shoe) }
    else { rect(ctx, sx, sy, w, 2, shoe); rect(ctx, sx, sy + 1, w, 1, "#f0f0f0") }
  }
  const drawLeg = (baseX: number, lift: number, slide: number) => {
    const lx = cx + baseX + leanLegs + (slide || 0)
    let len = 4 - lift + bodyShift
    if (len < 1) len = 1; if (len > 6) len = 6
    // Âncora no quadril: o passo encurta a perna pela base (pé sobe), sem abrir
    // buraco entre o torso e a coxa — antes top descia e a coxa sumia.
    const top2 = legTop
    if (legBare) {
      rect(ctx, lx, top2, legW, len, skin); rect(ctx, lx, top2, 1, len, skinD)
      if (bottom === "Shorts") rect(ctx, lx, top2, legW, 1, pants)
    } else {
      rect(ctx, lx, top2, legW, len, pants); rect(ctx, lx, top2, 1, len, pantsD)
      if (bottom === "Jeans") px(ctx, lx + legW - 1, top2 + 1, pantsL)
    }
    drawShoe(lx, top2 + len, legW)
  }
  const liftL = num(pose, "legL") > 0 ? num(pose, "legL") : 0
  const liftR = num(pose, "legR") > 0 ? num(pose, "legR") : 0
  drawLeg(-legSpread - legW + 1, liftL, footL)
  drawLeg(legSpread - 1, liftR, footR)

  const tTop = 15 + by + bodyShift
  const tx = cx + leanTorso
  drawTorso(ctx, tx, tTop, top, shirt, shirtD, shirtL, skin)

  // Coordenadas da cabeça calculadas antes dos braços: drawArm precisa delas para
  // posicionar a mão erguida ao lado do rosto.
  const hy = 5 + by + bodyShift + headBob
  const hx = cx + leanHead

  const aL = num(pose, "armL"), aR = num(pose, "armR")
  const armReach = female ? 4 : 5
  const armTop = tTop + 1
  const sleeveLong = top === "Social" || top === "Moletom" || top === "Jaleco" || top === "Hoodie" || top === "Terno" || top === "Vestido"
  const sleeveC = top === "Jaleco" ? "#f4f4f8" : shirt
  const sleeveCD = shade(sleeveC, -28)

  // Braço: pendente ao lado do torso quando off > -3; levantado (acenar, comemorar,
  // dança) leva a mão para o lado/acima da cabeça, fora das colunas do rosto
  // (cabeça ocupa hx-5..hx+4), em vez de cair sobre a face.
  const drawArm = (side: number, off: number): { hx: number; hy: number } => {
    const c = side < 0 ? sleeveCD : sleeveC
    if (off > -3) {
      const ax = side < 0 ? tx - armReach : tx + armReach - 2
      rect(ctx, ax, armTop + off, 2, sleeveLong ? 4 : 2, c)
      if (!sleeveLong) rect(ctx, ax, armTop + 2 + off, 2, 2, skin)
      rect(ctx, ax, armTop + 4 + off, 2, 1, skin)
      return { hx: ax, hy: armTop + 4 + off }
    }
    const ax = side < 0 ? hx - 7 : hx + 6
    const handY = armTop + off // off negativo → mão acima do ombro (comprimento natural)
    rect(ctx, ax, handY, 2, Math.max(2, armTop - handY), c) // braço do ombro à mão
    rect(ctx, ax, handY, 2, 1, skin) // mão no topo
    const shx = side < 0 ? tx - 4 : tx + 2
    rect(ctx, Math.min(ax, shx), armTop, Math.abs(ax - shx) + 2, 1, c) // ombro→braço
    return { hx: ax, hy: handY }
  }
  const handL = drawArm(-1, aL)
  drawArm(1, aR)
  if (s.acc === 6) { // smartwatch no punho esquerdo
    rect(ctx, handL.hx, handL.hy - 1, 2, 1, "#2b2b35"); px(ctx, handL.hx, handL.hy - 1, "#39d98a")
  }

  rect(ctx, hx - 5, hy, 10, 10, skin)
  rect(ctx, hx - 5, hy, 2, 10, skinD)
  rect(ctx, hx - 5, hy, 10, 1, skinL)
  if (dir === "down" || dir === "up") { px(ctx, hx - 6, hy + 5, skin); px(ctx, hx + 5, hy + 5, skin) }
  else if (dir === "right") px(ctx, hx - 6, hy + 5, skin)
  else px(ctx, hx + 5, hy + 5, skin)

  drawFace(ctx, hx, hy, dir, female, skinD, pose.face as string | undefined)
  drawHair(ctx, hx, hy + hairDrag, dir, hair, hairD, hairL, female, s.hairStyle)
  drawAccessory(ctx, hx, hy, dir, s.acc)
  if (showHandItem) drawHandItem(ctx, handName, tx, tTop, dir, aR)
  const fx = pose.fx as string | undefined
  if (fx) drawFx(ctx, fx, hx, hy, tx, tTop, dir)
  void skirtLike
}

function drawTorso(ctx: Ctx, tx: number, tTop: number, top: string, shirt: string, shirtD: string, shirtL: string, skin: string) {
  const body = (w: number) => {
    const x = tx - Math.floor(w / 2)
    rect(ctx, x, tTop, w, 7, shirt); rect(ctx, x, tTop, 2, 7, shirtD); rect(ctx, x, tTop, w, 1, shirtL)
    return x
  }
  if (top === "Vestido") {
    rect(ctx, tx - 3, tTop, 6, 5, shirt); rect(ctx, tx - 3, tTop, 2, 5, shirtD); rect(ctx, tx - 3, tTop, 6, 1, shirtL)
    rect(ctx, tx - 4, tTop + 5, 8, 2, shirt); rect(ctx, tx - 5, tTop + 7, 10, 1, shirt)
    rect(ctx, tx - 5, tTop + 7, 10, 1, shirtD); rect(ctx, tx - 4, tTop + 5, 1, 3, shirtD); return
  }
  if (top === "Regata") {
    const x = body(8); rect(ctx, x, tTop, 2, 2, skin); rect(ctx, x + 6, tTop, 2, 2, skin); rect(ctx, tx - 1, tTop, 2, 2, skin); return
  }
  if (top === "Social" || top === "Polo") {
    const x = body(8); rect(ctx, tx, tTop, 1, 6, shirtD)
    rect(ctx, x + 1, tTop, 1, 2, shirtL); rect(ctx, x + 6, tTop, 1, 2, shirtL)
    if (top === "Polo") { px(ctx, tx, tTop + 1, "#fff"); px(ctx, tx, tTop + 3, "#fff") } return
  }
  if (top === "Jaleco") {
    body(8); rect(ctx, tx - 4, tTop, 8, 7, "#f4f4f8"); rect(ctx, tx - 4, tTop, 8, 1, "#ffffff")
    rect(ctx, tx - 1, tTop, 2, 7, shirt); rect(ctx, tx - 4, tTop, 1, 7, "#d8d8e0"); px(ctx, tx - 3, tTop + 4, "#0a84ff"); return
  }
  if (top === "Terno") {
    body(8); rect(ctx, tx - 4, tTop, 8, 7, "#2b2f3a"); rect(ctx, tx - 1, tTop, 2, 7, "#f0f0f0")
    rect(ctx, tx, tTop + 1, 1, 4, shirt); rect(ctx, tx - 4, tTop, 2, 7, "#1e2230"); return
  }
  if (top === "Moletom" || top === "Hoodie") {
    const x = body(9); rect(ctx, x, tTop + 5, 9, 2, shirtD)
    if (top === "Hoodie") rect(ctx, tx - 3, tTop - 1, 6, 1, shirtD)
    rect(ctx, tx - 1, tTop + 1, 1, 3, shirtL); px(ctx, tx - 1, tTop + 4, "#fff"); px(ctx, tx + 1, tTop + 4, "#fff"); return
  }
  if (top === "Time") {
    const x = body(8); rect(ctx, x, tTop + 2, 8, 1, "#fff"); rect(ctx, tx - 1, tTop + 4, 2, 2, "#fff"); return
  }
  body(8)
}

function drawHandItem(ctx: Ctx, name: string, tx: number, tTop: number, dir: Direction, aR: number) {
  const hyHand = tTop + 1 + 4 + aR
  if (name === "Laptop") {
    // Notebook segurado à frente do torso: tampa (visto de trás) + base/teclado.
    const bx = tx - 4, byy = tTop + 5
    rect(ctx, bx, byy, 9, 4, "#3a3f4b"); rect(ctx, bx, byy, 9, 1, "#4d525e") // tampa
    px(ctx, tx, byy + 1, "#39d98a") // logo
    rect(ctx, bx - 1, byy + 4, 11, 1, "#9aa0aa"); rect(ctx, bx - 1, byy + 5, 11, 1, "#6b7079") // base
  } else if (name === "Caneca de café") {
    const mx = tx + (dir === "left" ? -5 : 4), my = hyHand - 1
    rect(ctx, mx, my, 3, 3, "#f0f0f0"); rect(ctx, mx, my, 3, 1, "#e76f51"); px(ctx, mx + 3, my + 1, "#f0f0f0"); px(ctx, mx + 1, my - 1, "#cfcfcf")
  } else if (name === "Celular") {
    const mx = tx + (dir === "left" ? -4 : 3), my = hyHand - 2
    rect(ctx, mx, my, 2, 4, "#1a1a1a"); px(ctx, mx, my + 1, "#3aa0ff")
  } else if (name === "Prancheta") {
    const mx = tx + (dir === "left" ? -5 : 3), my = tTop + 4
    rect(ctx, mx, my, 4, 5, "#b87333"); rect(ctx, mx, my, 4, 1, "#888"); rect(ctx, mx + 1, my + 2, 2, 1, "#fff"); rect(ctx, mx + 1, my + 3, 2, 1, "#fff")
  } else if (name === "Caixa") {
    rect(ctx, tx - 3, tTop + 3, 6, 5, "#c69c6d"); rect(ctx, tx - 3, tTop + 3, 6, 1, "#dbb98a")
    rect(ctx, tx - 1, tTop + 3, 2, 5, "#a67c4e"); rect(ctx, tx - 3, tTop + 5, 6, 1, "#a67c4e")
  }
}

function drawFx(ctx: Ctx, fx: string, hx: number, hy: number, tx: number, tTop: number, dir: Direction) {
  if (fx === "zzz") { px(ctx, hx + 5, hy - 2, "#cfd8ff"); px(ctx, hx + 6, hy - 3, "#cfd8ff"); px(ctx, hx + 7, hy - 4, "#cfd8ff") }
  else if (fx === "stars") { px(ctx, hx - 7, hy - 1, "#ffd24d"); px(ctx, hx + 6, hy, "#ffd24d"); px(ctx, hx - 6, hy + 9, "#ffd24d") }
  else if (fx === "impact") {
    const ix = dir === "left" ? tx - 7 : tx + 5, iy = tTop + 2
    px(ctx, ix, iy, "#fff"); px(ctx, ix + 1, iy - 1, "#ffd24d"); px(ctx, ix + 1, iy + 1, "#ffd24d"); px(ctx, ix - 1, iy, "#ffd24d"); px(ctx, ix + 2, iy, "#fff")
  } else if (fx === "note") {
    px(ctx, hx + 6, hy - 2, "#7c6cff"); px(ctx, hx + 6, hy - 3, "#7c6cff"); rect(ctx, hx + 6, hy - 4, 2, 1, "#7c6cff")
    px(ctx, hx - 7, hy + 1, "#ff6fa5"); px(ctx, hx - 7, hy, "#ff6fa5")
  } else if (fx === "sweat") px(ctx, hx + 5, hy + 2, "#7fb0ff")
}

function drawFace(ctx: Ctx, hx: number, hy: number, dir: Direction, female: boolean, skinD: string, face?: string) {
  const eyeC = "#2a2230", white = "#fff", blush = "#ffb0b0"
  const lip = female ? "#c25b6b" : skinD
  if (dir === "up") return
  const eyesNormal = (lx: number, rx: number) => {
    rect(ctx, lx, hy + 5, 2, 2, white); px(ctx, lx, hy + 6, eyeC); rect(ctx, rx, hy + 5, 2, 2, white); px(ctx, rx + 1, hy + 6, eyeC)
    if (female) { px(ctx, lx, hy + 4, eyeC); px(ctx, rx + 1, hy + 4, eyeC) }
  }
  const eyesHappy = (lx: number, rx: number) => { px(ctx, lx, hy + 6, eyeC); px(ctx, lx + 1, hy + 5, eyeC); px(ctx, rx + 1, hy + 6, eyeC); px(ctx, rx, hy + 5, eyeC) }
  const eyesAngry = (lx: number, rx: number) => {
    rect(ctx, lx, hy + 5, 2, 2, white); px(ctx, lx + 1, hy + 6, eyeC); rect(ctx, rx, hy + 5, 2, 2, white); px(ctx, rx, hy + 6, eyeC)
    px(ctx, lx, hy + 4, eyeC); px(ctx, rx + 1, hy + 4, eyeC)
  }
  const eyesKO = (lx: number, rx: number) => {
    px(ctx, lx, hy + 5, eyeC); px(ctx, lx + 1, hy + 6, eyeC); px(ctx, lx + 1, hy + 5, eyeC); px(ctx, lx, hy + 6, eyeC)
    px(ctx, rx, hy + 5, eyeC); px(ctx, rx + 1, hy + 6, eyeC); px(ctx, rx + 1, hy + 5, eyeC); px(ctx, rx, hy + 6, eyeC)
  }
  const eyesSleep = (lx: number, rx: number) => { rect(ctx, lx, hy + 6, 2, 1, eyeC); rect(ctx, rx, hy + 6, 2, 1, eyeC) }
  if (dir === "down") {
    const lx = hx - 3, rx = hx + 1
    if (face === "happy") { eyesHappy(lx, rx); rect(ctx, hx - 1, hy + 8, 2, 1, lip); px(ctx, hx - 2, hy + 8, lip); px(ctx, hx + 1, hy + 8, lip) }
    else if (face === "angry") { eyesAngry(lx, rx); rect(ctx, hx - 1, hy + 8, 2, 1, "#a33") }
    else if (face === "ko") { eyesKO(lx, rx); rect(ctx, hx - 1, hy + 8, 2, 1, "#a33") }
    else if (face === "sleep") eyesSleep(lx, rx)
    else { eyesNormal(lx, rx); rect(ctx, hx - 1, hy + 8, 2, 1, lip) }
    if (face !== "ko" && face !== "angry") { px(ctx, hx - 4, hy + 7, blush); px(ctx, hx + 3, hy + 7, blush) }
  } else if (dir === "left") {
    if (face === "ko") { px(ctx, hx - 3, hy + 5, eyeC); px(ctx, hx - 2, hy + 6, eyeC); px(ctx, hx - 2, hy + 5, eyeC); px(ctx, hx - 3, hy + 6, eyeC) }
    else if (face === "angry") { rect(ctx, hx - 3, hy + 5, 2, 2, white); px(ctx, hx - 3, hy + 6, eyeC); px(ctx, hx - 3, hy + 4, eyeC) }
    else if (face === "sleep") rect(ctx, hx - 3, hy + 6, 2, 1, eyeC)
    else { rect(ctx, hx - 3, hy + 5, 2, 2, white); px(ctx, hx - 3, hy + 6, eyeC); if (female) px(ctx, hx - 3, hy + 4, eyeC) }
    px(ctx, hx - 4, hy + 7, blush); px(ctx, hx - 3, hy + 8, lip)
  } else {
    if (face === "ko") { px(ctx, hx + 1, hy + 5, eyeC); px(ctx, hx + 2, hy + 6, eyeC); px(ctx, hx + 2, hy + 5, eyeC); px(ctx, hx + 1, hy + 6, eyeC) }
    else if (face === "angry") { rect(ctx, hx + 1, hy + 5, 2, 2, white); px(ctx, hx + 2, hy + 6, eyeC); px(ctx, hx + 2, hy + 4, eyeC) }
    else if (face === "sleep") rect(ctx, hx + 1, hy + 6, 2, 1, eyeC)
    else { rect(ctx, hx + 1, hy + 5, 2, 2, white); px(ctx, hx + 2, hy + 6, eyeC); if (female) px(ctx, hx + 2, hy + 4, eyeC) }
    px(ctx, hx + 3, hy + 7, blush); px(ctx, hx + 2, hy + 8, lip)
  }
}

function drawHair(ctx: Ctx, hx: number, hy: number, dir: Direction, hair: string, hairD: string, hairL: string, female: boolean, st: number) {
  const back = dir === "up"
  const cap = () => { rect(ctx, hx - 5, hy - 1, 10, 3, hair); rect(ctx, hx - 5, hy - 1, 10, 1, hairL); rect(ctx, hx - 5, hy + 2, 1, 1, hairD); rect(ctx, hx + 4, hy + 2, 1, 1, hairD) }
  const franja = () => { if (back) return; rect(ctx, hx - 5, hy + 1, 2, 1, hair); rect(ctx, hx + 3, hy + 1, 2, 1, hair) }
  const sideHair = (len: number) => {
    if (dir !== "right") { rect(ctx, hx - 6, hy + 1, 1, len, hair); rect(ctx, hx - 6, hy + 1, 1, 1, hairL) }
    if (dir !== "left") { rect(ctx, hx + 5, hy + 1, 1, len, hair); rect(ctx, hx + 5, hy + 1, 1, 1, hairL) }
  }
  switch (st) {
    case 0: cap(); franja(); if (back) rect(ctx, hx - 5, hy + 2, 10, 4, hair); break
    case 1: cap(); franja(); sideHair(female ? 8 : 6); if (back) { rect(ctx, hx - 5, hy + 2, 10, 7, hair); rect(ctx, hx - 5, hy + 2, 1, 7, hairD) } break
    case 2: cap(); rect(ctx, hx - 2, hy - 3, 2, 2, hair); rect(ctx, hx + 1, hy - 4, 2, 3, hair); rect(ctx, hx + 1, hy - 4, 1, 3, hairL); if (!back) franja(); sideHair(female ? 7 : 3); if (back) rect(ctx, hx - 5, hy + 2, 10, 5, hair); break
    case 3:
      cap(); franja()
      if (dir === "down" || dir === "up") { rect(ctx, hx + 5, hy - 1, 2, 9, hair); rect(ctx, hx + 5, hy - 1, 1, 9, hairL) }
      else if (dir === "left") { rect(ctx, hx + 5, hy, 3, 8, hair); rect(ctx, hx + 5, hy, 1, 8, hairD) }
      else { rect(ctx, hx - 8, hy, 3, 8, hair); rect(ctx, hx - 8, hy, 1, 8, hairL) }
      if (female) sideHair(5); break
    case 4: cap(); rect(ctx, hx - 2, hy - 4, 4, 3, hair); rect(ctx, hx - 2, hy - 4, 4, 1, hairL); px(ctx, hx - 3, hy - 3, hair); px(ctx, hx + 2, hy - 3, hair); if (!back) franja(); sideHair(female ? 6 : 3); if (back) rect(ctx, hx - 5, hy + 2, 10, 5, hair); break
    case 5: rect(ctx, hx - 4, hy - 1, 8, 1, hair); px(ctx, hx - 5, hy, hair); px(ctx, hx + 4, hy, hair); if (back) rect(ctx, hx - 4, hy, 8, 3, hair); break
    case 6: rect(ctx, hx - 1, hy - 4, 3, 6, hair); rect(ctx, hx - 1, hy - 4, 1, 6, hairL); rect(ctx, hx - 5, hy + 1, 2, 2, shade(hair, -10)); rect(ctx, hx + 3, hy + 1, 2, 2, shade(hair, -10)); if (back) rect(ctx, hx - 1, hy, 3, 5, hair); break
    case 7:
      rect(ctx, hx - 6, hy - 2, 12, 5, hair); rect(ctx, hx - 6, hy - 2, 12, 1, hairL)
      px(ctx, hx - 6, hy - 3, hair); px(ctx, hx + 5, hy - 3, hair); px(ctx, hx, hy - 3, hair)
      rect(ctx, hx - 6, hy + 1, 1, 3, hair); rect(ctx, hx + 5, hy + 1, 1, 3, hair)
      px(ctx, hx - 3, hy - 1, hairD); px(ctx, hx + 2, hy - 1, hairD); px(ctx, hx, hy, hairD)
      if (back) rect(ctx, hx - 6, hy + 1, 12, 5, hair); break
    case 8:
      cap(); franja()
      if (dir !== "right") { rect(ctx, hx - 6, hy + 1, 1, 8, hair); rect(ctx, hx - 6, hy + 1, 1, 1, hairL); px(ctx, hx - 5, hy + 8, hair) }
      if (dir !== "left") { rect(ctx, hx + 5, hy + 1, 1, 8, hair); rect(ctx, hx + 5, hy + 1, 1, 1, hairL); px(ctx, hx + 4, hy + 8, hair) }
      if (back) { rect(ctx, hx - 5, hy + 2, 10, 8, hair); rect(ctx, hx - 5, hy + 2, 1, 8, hairD); rect(ctx, hx, hy + 2, 1, 8, hairD); rect(ctx, hx - 5, hy + 2, 10, 1, hairL) }
      break
    case 9:
      cap(); franja()
      if (dir === "down" || dir === "up") {
        rect(ctx, hx - 8, hy, 2, 6, hair); rect(ctx, hx - 8, hy, 1, 6, hairL); rect(ctx, hx + 6, hy, 2, 6, hair); rect(ctx, hx + 6, hy, 1, 6, hairL)
        px(ctx, hx - 7, hy - 1, "#ff6fa5"); px(ctx, hx + 7, hy - 1, "#ff6fa5")
      } else if (dir === "left") { rect(ctx, hx + 5, hy, 2, 6, hair); px(ctx, hx - 6, hy, hair) }
      else { rect(ctx, hx - 7, hy, 2, 6, hair); px(ctx, hx + 5, hy, hair) }
      break
    case 10:
      rect(ctx, hx - 5, hy - 1, 10, 2, hair); rect(ctx, hx - 5, hy - 1, 10, 1, hairL); rect(ctx, hx - 5, hy + 1, 10, 1, shade(hair, -15))
      if (!back) rect(ctx, hx - 2, hy + 1, 5, 1, hair); if (back) rect(ctx, hx - 5, hy + 1, 10, 2, shade(hair, -15)); break
    case 11:
      cap()
      if (!back) { rect(ctx, hx - 5, hy + 1, 10, 1, hair); rect(ctx, hx - 5, hy + 1, 10, 1, hairD); px(ctx, hx - 5, hy + 2, hair); px(ctx, hx + 4, hy + 2, hair) }
      sideHair(female ? 7 : 4); if (back) rect(ctx, hx - 5, hy + 2, 10, 6, hair); break
  }
}

function drawAccessory(ctx: Ctx, hx: number, hy: number, dir: Direction, acc: number) {
  if (acc === 1 && dir !== "up") { // óculos: só laterais nas linhas dos olhos (lente transparente, nada na testa)
    const rim = "#4b5563" // cinza fino — não funde com cabelo/olhos escuros
    if (dir === "down") {
      // olho esq cols hx-3..hx-2 entre laterais hx-4/hx-1; olho dir cols hx+1..hx+2 entre hx/hx+3
      rect(ctx, hx - 4, hy + 5, 1, 2, rim); rect(ctx, hx - 1, hy + 5, 1, 2, rim) // lente esq
      rect(ctx, hx, hy + 5, 1, 2, rim); rect(ctx, hx + 3, hy + 5, 1, 2, rim) // lente dir (ponte em hx-1|hx)
      px(ctx, hx - 5, hy + 5, rim); px(ctx, hx + 4, hy + 5, rim) // hastes às orelhas
    } else if (dir === "left") {
      rect(ctx, hx - 4, hy + 5, 1, 2, rim); rect(ctx, hx - 1, hy + 5, 1, 2, rim); px(ctx, hx - 5, hy + 5, rim)
    } else {
      rect(ctx, hx, hy + 5, 1, 2, rim); rect(ctx, hx + 3, hy + 5, 1, 2, rim); px(ctx, hx + 4, hy + 5, rim)
    }
  }
  if (acc === 2) {
    rect(ctx, hx - 5, hy - 1, 10, 2, "#d94f4f"); rect(ctx, hx - 5, hy - 1, 10, 1, "#ff7a7a")
    if (dir === "down") rect(ctx, hx - 5, hy + 1, 10, 1, "#b03a3a")
    else if (dir === "left") rect(ctx, hx - 8, hy + 1, 3, 1, "#b03a3a")
    else if (dir === "right") rect(ctx, hx + 5, hy + 1, 3, 1, "#b03a3a")
  }
  if (acc === 3 && dir !== "up") { // brinco logo abaixo da orelha (orelha em hy+5)
    if (dir !== "right") px(ctx, hx - 6, hy + 6, "#ffd24d")
    if (dir !== "left") px(ctx, hx + 5, hy + 6, "#ffd24d")
  }
  if (acc === 4) {
    const c = "#222", pad = "#5b7fd9"
    rect(ctx, hx - 5, hy - 2, 10, 1, c); rect(ctx, hx - 5, hy - 2, 1, 2, c); rect(ctx, hx + 4, hy - 2, 1, 2, c)
    if (dir === "down" || dir === "up") { rect(ctx, hx - 6, hy + 4, 2, 3, c); rect(ctx, hx + 4, hy + 4, 2, 3, c); px(ctx, hx - 5, hy + 5, pad); px(ctx, hx + 4, hy + 5, pad) }
    else if (dir === "left") { rect(ctx, hx + 3, hy + 4, 2, 3, c); px(ctx, hx + 3, hy + 5, pad); rect(ctx, hx - 5, hy + 5, 1, 2, c); px(ctx, hx - 5, hy + 7, pad) }
    else { rect(ctx, hx - 5, hy + 4, 2, 3, c); px(ctx, hx - 4, hy + 5, pad); rect(ctx, hx + 4, hy + 5, 1, 2, c); px(ctx, hx + 4, hy + 7, pad) }
  }
  if (acc === 5 && dir !== "up") { const cy = hy + 12; rect(ctx, hx - 1, cy, 3, 4, "#f0f0f0"); rect(ctx, hx - 1, cy, 3, 1, "#0a84ff"); px(ctx, hx, cy + 2, "#9aa0aa"); px(ctx, hx, hy + 10, "#888") }
  if (acc === 7 && dir !== "up") { // óculos VR: visor sobre os olhos + alça lateral
    rect(ctx, hx - 5, hy + 4, 10, 4, "#15151f"); rect(ctx, hx - 5, hy + 4, 10, 1, "#3a3a55")
    rect(ctx, hx - 6, hy + 5, 1, 2, "#2b2b35"); rect(ctx, hx + 5, hy + 5, 1, 2, "#2b2b35") // alça
    if (dir === "down") { px(ctx, hx - 3, hy + 6, "#7c6cff"); px(ctx, hx + 2, hy + 6, "#7c6cff") }
    else if (dir === "left") px(ctx, hx - 3, hy + 6, "#7c6cff")
    else px(ctx, hx + 2, hy + 6, "#7c6cff")
  }
  if (acc === 8) { rect(ctx, hx - 5, hy - 2, 10, 4, "#39435e"); rect(ctx, hx - 5, hy - 2, 10, 1, "#4d5a7a"); rect(ctx, hx - 5, hy + 1, 10, 1, "#2b3346"); px(ctx, hx, hy - 3, "#39435e") }
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
      ctx.save(); ctx.translate(ox, oy); drawChibi(ctx, config, dir, poseFor(anim, f), anim); ctx.restore()
      frames[key].push({ x: ox, y: oy })
    }
    row++
  }
  return { canvas, frames, cols, rows, W, H }
}
