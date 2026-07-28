import { describe, expect, it } from "vitest"

import { isSolid } from "../map"
import { TILE } from "../tiles"
import { buildFloor1 } from "./floor1"

const map = buildFloor1()

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
  it("é 70×10 tiles — bullpen compacto, não o galpão antigo", () => {
    expect([map.cols, map.rows]).toEqual([70, 10])
  })

  it("width/height batem com a grade", () => {
    expect(map.width).toBe(70 * TILE)
    expect(map.height).toBe(10 * TILE)
  })

  it("o spawn não está dentro de parede", () => {
    expect(isSolid(map, map.spawn.x, map.spawn.y)).toBe(false)
  })
})

describe("assentos", () => {
  it("tem 30 assentos de PC", () => {
    expect(map.seats.filter((s) => s.kind === "pc")).toHaveLength(30)
  })

  it("todo assento olha para baixo — nenhum de costas para a câmera", () => {
    for (const s of map.seats) expect(s.facing).toBe("down")
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

describe("zonas", () => {
  it("tem só bullpen e elevador — sem varanda nem recepção nesta entrega", () => {
    expect(map.zones.map((z) => z.id).sort()).toEqual(["bullpen", "elevator"])
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

  it("usa 30 baias (15 pares cubicle/cubicleFlip)", () => {
    const baias = map.props.filter((p) => p.kind === "cubicle" || p.kind === "cubicleFlip")
    expect(baias).toHaveLength(30)
  })
})
