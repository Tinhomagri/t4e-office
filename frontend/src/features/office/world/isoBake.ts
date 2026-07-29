// Bake do piso/paredes em raster isométrico — roda uma vez por andar.
//
// Reusa as pinturas quadradas 16×16 já existentes em tiles.ts (nenhuma delas
// muda): a projeção isométrica entra só como uma transform2D aplicada antes de
// cada drawImage. Piso vira um losango (shear simples); bloco de parede vira
// duas faces verticais (shear + estica em altura) mais uma tampa (o mesmo
// losango do piso, erguida). Ver MASTER.md.
import type { OfficeMap } from "./map"
import { ISO_FX, ISO_FY, isoMapSize, isoOrigin, worldToIso } from "./iso"
import { T, TILE, tileVariant, type TileAtlas } from "./tiles"
import { makeCanvas } from "./pixels"

/** Altura do bloco de parede, em px de tela (1×). Múltiplo de TILE para o
 * fator de estiramento vertical (`d`) sair limpo. Só sobra a parede de fundo
 * (norte) e a da esquerda (oeste) — frente e direita não têm mais tile de
 * parede (ver `room()` em cada `floors/*.ts`) — por isso pode ficar bem alta,
 * tipo Habbo, sem tampar a visão de dentro do cômodo. */
export const WALL_HEIGHT = 32

/** Tiles que viram bloco extrudado (2 faces + tampa) em vez de losango raso. */
const BLOCK_TILES = new Set<number>([T.WALL, T.WALL_TOP, T.WALL_V, T.GLASS, T.GLASS_DOOR])

export interface IsoGround {
  canvas: HTMLCanvasElement
  /** Deslocamento a somar em `worldToIso(x, y)` para cair dentro do canvas. */
  originX: number
  originY: number
}

function drawIsoFloor(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  sx: number,
  sy: number,
  ox: number,
  oy: number,
  tintAlpha = 0,
): void {
  ctx.save()
  ctx.setTransform(ISO_FX, ISO_FY, -ISO_FX, ISO_FY, ox, oy)
  ctx.drawImage(img, sx, sy, TILE, TILE, 0, 0, TILE, TILE)
  if (tintAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${tintAlpha})`
    ctx.fillRect(0, 0, TILE, TILE)
  }
  ctx.restore()
}

/**
 * Face vertical do bloco. `mode` escolhe a aresta (E-S = direita/clara,
 * W-S = esquerda/escura) — a derivação da matriz está no MASTER.md.
 */
function drawIsoFace(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  sx: number,
  sy: number,
  ox: number,
  oy: number,
  height: number,
  mode: "right" | "left",
): void {
  const d = height / TILE
  const f = oy + TILE * ISO_FY - height
  const a = mode === "right" ? -ISO_FX : ISO_FX
  const e = mode === "right" ? ox + TILE * ISO_FX : ox - TILE * ISO_FX
  ctx.save()
  ctx.setTransform(a, ISO_FY, 0, d, e, f)
  ctx.drawImage(img, sx, sy, TILE, TILE, 0, 0, TILE, TILE)
  if (mode === "left") {
    ctx.fillStyle = "rgba(20,15,10,0.28)"
    ctx.fillRect(0, 0, TILE, TILE)
  }
  ctx.restore()
}

function drawIsoBlock(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  sx: number,
  sy: number,
  ox: number,
  oy: number,
  height: number,
  capSx: number,
  capSy: number,
): void {
  drawIsoFace(ctx, img, sx, sy, ox, oy, height, "right")
  drawIsoFace(ctx, img, sx, sy, ox, oy, height, "left")
  drawIsoFloor(ctx, img, capSx, capSy, ox, oy - height, 0.12)
}

/** Assa o andar inteiro num raster isométrico. Chamado uma vez por troca de andar. */
export function buildIsoGround(map: OfficeMap, atlas: TileAtlas): IsoGround {
  const { w, h } = isoMapSize(map.cols, map.rows, WALL_HEIGHT)
  const { canvas, ctx } = makeCanvas(Math.ceil(w) + 1, Math.ceil(h) + 1)
  ctx.imageSmoothingEnabled = false
  const origin = isoOrigin(map.cols, map.rows)

  // Ordem de pintura por profundidade crescente (tx+ty): células mais para
  // "baixo-direita" no grid pintam por cima — necessário para as tampas dos
  // blocos, que se sobrepõem à célula de trás.
  const order: [number, number][] = []
  for (let ty = 0; ty < map.rows; ty++) {
    for (let tx = 0; tx < map.cols; tx++) order.push([tx, ty])
  }
  order.sort((p, q) => p[0] + p[1] - (q[0] + q[1]))

  const [capSx, capSy] = atlas.at(T.WALL_TOP, 0)

  for (const [tx, ty] of order) {
    const id = map.floor[ty * map.cols + tx]
    if (id === T.VOID) continue
    const variant = tileVariant(tx, ty)
    const [sx, sy] = atlas.at(id, variant)
    const p = worldToIso(tx * TILE, ty * TILE)
    const ox = p.x + origin.x
    const oy = p.y + origin.y

    if (id === T.RAILING) {
      drawIsoBlock(ctx, atlas.canvas, sx, sy, ox, oy, WALL_HEIGHT / 2, capSx, capSy)
    } else if (BLOCK_TILES.has(id)) {
      drawIsoBlock(ctx, atlas.canvas, sx, sy, ox, oy, WALL_HEIGHT, capSx, capSy)
    } else {
      drawIsoFloor(ctx, atlas.canvas, sx, sy, ox, oy)
    }
  }

  return { canvas, originX: origin.x, originY: origin.y }
}
