import { describe, expect, it } from "vitest"

import { isSolid } from "../map"
import { T, TILE } from "../tiles"
import { buildFloor1 } from "./floor1"

import { T as TILES } from "../tiles"

/** Vizinhos aceitáveis para um tile de deck além de deck e guarda-corpo. */
const SOLID_OK = new Set<number>([TILES.WALL, TILES.WALL_TOP, TILES.WALL_V, TILES.GLASS, TILES.GLASS_DOOR])

const map = buildFloor1()
const at = (tx: number, ty: number) => map.floor[ty * map.cols + tx]
const blocked = (tx: number, ty: number) => map.collision[ty * map.cols + tx] === 1

/** Tiles alcançáveis a pé a partir do spawn, em 4-vizinhança. */
function reachable(): Set<number> {
  const start = Math.floor(map.spawn.y / TILE) * map.cols + Math.floor(map.spawn.x / TILE)
  const seen = new Set<number>([start])
  const queue = [start]
  while (queue.length) {
    const cur = queue.shift()!
    const cx = cur % map.cols
    const cy = Math.floor(cur / map.cols)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue
      const n = ny * map.cols + nx
      if (seen.has(n) || map.collision[n] === 1) continue
      seen.add(n)
      queue.push(n)
    }
  }
  return seen
}

const REACH = reachable()
const tileOf = (x: number, y: number) => Math.floor(y / TILE) * map.cols + Math.floor(x / TILE)

describe("dimensões", () => {
  it("é 72×46 tiles", () => {
    expect([map.cols, map.rows]).toEqual([72, 46])
  })

  it("width/height batem com a grade", () => {
    expect(map.width).toBe(72 * TILE)
    expect(map.height).toBe(46 * TILE)
  })

  it("o spawn não está dentro de parede", () => {
    expect(isSolid(map, map.spawn.x, map.spawn.y)).toBe(false)
  })
})

describe("assentos", () => {
  it("tem 16 assentos de PC", () => {
    expect(map.seats.filter((s) => s.kind === "pc")).toHaveLength(16)
  })

  it("tem assento de vista na varanda", () => {
    expect(map.seats.filter((s) => s.kind === "view").length).toBeGreaterThanOrEqual(3)
  })

  it("nenhum id de assento repetido", () => {
    const ids = map.seats.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("nenhum assento cai dentro de tile bloqueado", () => {
    const dentro = map.seats.filter((s) => isSolid(map, s.x, s.y))
    expect(dentro.map((s) => `${s.id} [${s.label}]`)).toEqual([])
  })

  it("TODO assento é alcançável a pé do spawn", () => {
    const ilhados = map.seats.filter((s) => !REACH.has(tileOf(s.x, s.y)))
    expect(ilhados.map((s) => `${s.id} [${s.label}]`)).toEqual([])
  })
})

describe("vidro e varanda", () => {
  it("existe fachada de vidro nas duas orientações", () => {
    let sul = 0
    let leste = 0
    for (let x = 0; x < map.cols; x++) if (at(x, 37) === T.GLASS) sul++
    for (let y = 0; y < map.rows; y++) if (at(55, y) === T.GLASS) leste++
    expect(sul).toBeGreaterThan(30)
    expect(leste).toBeGreaterThan(20)
  })

  it("a porta de vidro é passável e o vidro não", () => {
    const portas: number[] = []
    for (let x = 0; x < map.cols; x++) if (at(x, 37) === T.GLASS_DOOR) portas.push(x)
    expect(portas.length).toBeGreaterThanOrEqual(3)
    for (const x of portas) expect(blocked(x, 37)).toBe(false)
    expect(blocked(portas[0] - 1, 37)).toBe(true)
  })

  it("TODO tile de deck é alcançável a pé", () => {
    const ilhados: string[] = []
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        if (at(x, y) === T.DECK && !REACH.has(y * map.cols + x)) ilhados.push(`${x},${y}`)
      }
    }
    expect(ilhados).toEqual([])
  })

  it("todo deck tem guarda-corpo ou parede em volta — não dá para cair", () => {
    const vazado: string[] = []
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        if (at(x, y) !== T.DECK) continue
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) {
            vazado.push(`${x},${y} borda`)
            continue
          }
          const n = at(nx, ny)
          const ok = n === T.DECK || n === T.RAILING || SOLID_OK.has(n)
          if (!ok) vazado.push(`${x},${y} -> ${nx},${ny} = ${n}`)
        }
      }
    }
    expect(vazado).toEqual([])
  })
})

describe("zonas", () => {
  it("tem bullpen, recepção, elevador e varanda", () => {
    expect(map.zones.map((z) => z.id).sort()).toEqual(
      ["bullpen", "elevator", "reception", "terrace"].sort(),
    )
  })

  it("toda zona tem rótulo, dica e cabe na grade", () => {
    for (const z of map.zones) {
      expect(z.label.length).toBeGreaterThan(0)
      expect(z.hint.length).toBeGreaterThan(0)
      expect(z.x + z.w).toBeLessThanOrEqual(map.cols)
      expect(z.y + z.h).toBeLessThanOrEqual(map.rows)
    }
  })
})

describe("props", () => {
  it("nenhum prop começa fora da grade", () => {
    for (const p of map.props) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(map.width)
      expect(p.y).toBeLessThan(map.height)
    }
  })

  it("usa as baias novas", () => {
    const baias = map.props.filter((p) => p.kind === "cubicle" || p.kind === "cubicleFlip")
    expect(baias).toHaveLength(16)
  })
})
