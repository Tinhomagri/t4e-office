import { describe, expect, it } from "vitest"

import { isSolid } from "../map"
import { TILE } from "../tiles"
import { buildFloor2 } from "./floor2"

const map = buildFloor2()

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
  it("é 26×17 tiles", () => {
    expect([map.cols, map.rows]).toEqual([26, 17])
  })

  it("o spawn não está dentro de parede", () => {
    expect(isSolid(map, map.spawn.x, map.spawn.y)).toBe(false)
  })
})

describe("assentos", () => {
  it("tem 16 assentos de poker", () => {
    expect(map.seats.filter((s) => s.kind === "poker")).toHaveLength(16)
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
  it("tem elevador, console do host e a sala de poker", () => {
    expect(map.zones.map((z) => z.id).sort()).toEqual(
      ["elevator", "poker-console", "poker-room"].sort(),
    )
  })

  it("o console é alcançável a pé do spawn", () => {
    const consoleZone = map.zones.find((z) => z.id === "poker-console")!
    const t = (consoleZone.y + 1) * map.cols + (consoleZone.x + 1)
    expect(REACH.has(t)).toBe(true)
  })
})

describe("props", () => {
  it("a mesa e o telão são sólidos", () => {
    const table = map.props.find((p) => p.kind === "pokerTable")!
    const screen = map.props.find((p) => p.kind === "pokerScreen")!
    expect(isSolid(map, table.x + 8, table.y + 8)).toBe(true)
    // `pokerScreen` só é sólido numa faixa fina perto da base (y: 24..32
    // dentro do prop) — o resto é telão "no ar", sem colisão.
    expect(isSolid(map, screen.x + 8, screen.y + 28)).toBe(true)
  })
})
