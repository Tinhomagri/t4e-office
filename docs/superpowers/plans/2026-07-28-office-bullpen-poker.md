# Bullpen Compacto + Planning Poker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever o andar 1 do escritório 3D como um bullpen compacto (30 baias, corredor único, câmera mais aberta) e construir o andar 2 como uma sala de Planning Poker dentro do mundo pixel-art, reaproveitando 100% do backend/hooks de `estimation`/`poker` já existentes.

**Architecture:** Segue a arquitetura de andares já implementada (`FLOORS` registry, `OfficeMap`, `world/camera.ts`, `world/elevator.ts`). Andar 1 e andar 2 são novas plantas (`floors/floor1.ts` reescrito, `floors/floor2.ts` novo) — dado puro, sem o motor saber o que é "poker". A ligação com o backend de poker (sessão/voto) fica inteiramente na camada React (`OfficeRoom.tsx` + hooks novos), nunca dentro do `OfficeEngine`; o motor só ganha um método `setPokerVotes()` para desenhar o estado que o React já resolveu.

**Tech Stack:** React + TypeScript + Vite, Canvas 2D (motor do escritório), Zustand (stores), TanStack Query (dados do backend), Vitest + Testing Library.

## Global Constraints

- Todo assento novo/alterado usa `facing: "down"` — nenhum avatar de costas para a câmera (regra aprovada no spec).
- Nenhuma mudança no backend Django (`contexts/estimation`) — a API já existe e não muda.
- `PokerPage.tsx` (rota 2D separada) não é tocada — continua existindo como está.
- Customização visual da baia pelo usuário fica fora deste plano (próximo ciclo).
- Toda planta (`floors/*.ts`) segue o padrão já estabelecido: `Uint8Array` de piso + `Uint8Array` de colisão derivada, props com retângulo de colisão convertido para tiles via `floor`/`ceil`, zonas com `id`/`label`/retângulo/`hint`, assentos com `id` derivado do tile.
- Todo arquivo de teste roda com `npx vitest run <arquivo>` a partir de `frontend/`.

---

## Task 1: Câmera mais aberta

**Files:**
- Modify: `frontend/src/features/office/world/camera.ts:8-11`
- Modify: `frontend/src/features/office/world/camera.test.ts` (5 asserções, ver abaixo)

**Interfaces:**
- Produces: `integerScale(cssW, cssH, max=4)` continua com a mesma assinatura; só a base de referência interna muda de `320×200` para `480×300` (mesma proporção 1.6, então qualquer chamada com `cssW`/`cssH` escalados por 1.5× continua dando o mesmo resultado — é assim que os testes abaixo se ajustam sem mudar o valor esperado).

- [ ] **Step 1: Atualizar a base de referência em `integerScale`**

Em `camera.ts`, troque:

```ts
export function integerScale(cssW: number, cssH: number, max = 4): number {
  const fit = Math.min(cssW / 320, cssH / 200)
  return Math.max(2, Math.min(max, Math.floor(fit)))
}
```

por:

```ts
export function integerScale(cssW: number, cssH: number, max = 4): number {
  // Base 480×300 (mesma proporção 1.6 da antiga 320×200, só maior): em uma
  // tela de 1200×800 a escala cai de 3× para 2×, quase dobrando os tiles
  // visíveis por vez. É o ajuste que tira a sensação de câmera colada no
  // personagem.
  const fit = Math.min(cssW / 480, cssH / 300)
  return Math.max(2, Math.min(max, Math.floor(fit)))
}
```

- [ ] **Step 2: Ajustar as 5 asserções de `camera.test.ts` que dependem da base antiga**

Essas são as únicas 5 chamadas cujo resultado muda com a nova base — as demais
(`viewportFor`, `worldToScreen`, `cameraTarget`, `offsetCamera`,
`viewOffsetFor`, `focusScale`) não dependem da base e continuam iguais.
Escalando os `cssW`/`cssH` de entrada por 1.5× (proporção `480/320`), o
resultado esperado permanece **idêntico** ao original — só a entrada muda:

Em `describe("integerScale")`:

```ts
  it("usa 4× quando a tela é larga o suficiente", () => {
    expect(integerScale(2400, 1500)).toBe(4)
  })
```

(era `integerScale(1600, 1000)`)

Em `describe("escala sob foco")`:

```ts
  it("com teto 8, uma tela média chega a mais zoom do que o normal", () => {
    const cssW = 2100
    const cssH = 1350
    expect(integerScale(cssW, cssH)).toBe(4)
    expect(integerScale(cssW, cssH, 8)).toBe(4)
    expect(integerScale(3900, 2550, 8)).toBe(8)
  })
```

(era `1400, 900` e `2600, 1700`)

E dentro de `describe("integerScale")`, o teste do teto maior:

```ts
  it("aceita teto maior quando a câmera está com foco", () => {
    expect(integerScale(2400, 1500, 8)).toBe(5)
    expect(integerScale(4000, 3000, 8)).toBe(8)
  })
```

(era `integerScale(1600, 1000, 8)` esperando `5`; `4000,3000` já não muda,
mantém como está)

- [ ] **Step 3: Rodar os testes**

Run: `cd frontend && npx vitest run src/features/office/world/camera.test.ts`
Expected: PASS (todos os `describe` de `camera.test.ts`)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/office/world/camera.ts frontend/src/features/office/world/camera.test.ts
git commit -m "feat(office): abrir a câmera do escritório (mais tiles visíveis por tela)"
```

---

## Task 2: `SeatKind: "poker"` + props novos (mesa em U, telão, console)

**Files:**
- Modify: `frontend/src/features/office/world/map.ts:41`
- Modify: `frontend/src/features/office/world/props.ts` (adicionar 3 entradas em `PROPS`)
- Modify: `frontend/src/features/office/world/props.test.ts`

**Interfaces:**
- Produces: `SeatKind` inclui `"poker"`. `PROPS.pokerTable`, `PROPS.pokerScreen`, `PROPS.pokerConsole` — cada um com `w`, `h`, `solid`, `baseline`, `draw(ctx)`, no mesmo formato de `PropDef` usado por `meetingTable`/`whiteboard`.

- [ ] **Step 1: Adicionar `"poker"` a `SeatKind`**

Em `map.ts:41`, troque:

```ts
export type SeatKind = "pc" | "meeting" | "lounge" | "view"
```

por:

```ts
/** "pc" tem computador; "view" é o guarda-corpo da varanda; "poker" é a mesa
 * em U do andar 2 — sentar entra na sessão de Planning Poker ativa. */
export type SeatKind = "pc" | "meeting" | "lounge" | "view" | "poker"
```

- [ ] **Step 2: Escrever o teste dos 3 props novos primeiro**

Em `props.test.ts`, adicione (olhe o arquivo existente para ver onde os outros
`describe("PROPS")` já estão e siga o mesmo padrão de import):

```ts
describe("props de Planning Poker", () => {
  it("pokerTable é sólida e maior que uma mesa comum", () => {
    expect(PROPS.pokerTable.solid).toBeTruthy()
    expect(PROPS.pokerTable.w).toBeGreaterThan(PROPS.meetingTable.w)
  })

  it("pokerScreen é sólido só numa faixa fina (montado na parede)", () => {
    expect(PROPS.pokerScreen.solid!.h).toBeLessThan(PROPS.pokerScreen.h)
  })

  it("pokerConsole é sólido", () => {
    expect(PROPS.pokerConsole.solid).toBeTruthy()
  })

  it("os três desenham sem lançar exceção", () => {
    for (const kind of ["pokerTable", "pokerScreen", "pokerConsole"] as const) {
      const { canvas, ctx } = makeCanvas(PROPS[kind].w, PROPS[kind].h)
      expect(() => PROPS[kind].draw(ctx)).not.toThrow()
      expect(canvas.width).toBe(PROPS[kind].w)
    }
  })
})
```

Confira o topo do arquivo: se `makeCanvas` ainda não estiver importado de
`../pixels` (ou caminho equivalente usado pelo arquivo), adicione ao import
existente.

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/props.test.ts`
Expected: FAIL com `PROPS.pokerTable is undefined` (ou erro equivalente)

- [ ] **Step 4: Implementar os 3 props em `props.ts`**

Adicione estas três entradas dentro do objeto `PROPS`, depois de
`elevatorDoors` (última entrada hoje) e antes do fechamento `}`:

```ts
  /**
   * Mesa em U da sala de Planning Poker: abre ao norte (lado da entrada). A
   * colisão é o retângulo cheio — ninguém precisa andar dentro do vão do U,
   * só ao redor, onde ficam os assentos.
   */
  pokerTable: {
    w: 256,
    h: 112,
    solid: { x: 0, y: 0, w: 256, h: 112 },
    baseline: 108,
    draw(ctx) {
      const top = "#8f6a44"
      const dark = shade(top, 0.74)
      const light = tint(top, 1.12)
      // Base do U (fecha ao sul) + os dois braços (abrem ao norte, vão no
      // meio fica transparente — não pintamos ali).
      rect(ctx, 0, 80, 256, 32, top)
      rect(ctx, 0, 0, 32, 112, top)
      rect(ctx, 224, 0, 32, 112, top)
      outline(ctx, 0, 80, 256, 32, INK)
      outline(ctx, 0, 0, 32, 112, INK)
      outline(ctx, 224, 0, 32, 112, INK)
      rect(ctx, 0, 81, 256, 1, light)
      rect(ctx, 0, 108, 256, 4, dark)
      rect(ctx, 1, 1, 30, 1, light)
      rect(ctx, 225, 1, 30, 1, light)
    },
  },

  /** Telão montado na parede sul da sala de poker. */
  pokerScreen: {
    w: 128,
    h: 32,
    solid: { x: 0, y: 24, w: 128, h: 8 },
    baseline: 30,
    draw(ctx) {
      chamfer(ctx, 0, 0, 128, 26, "#12161c")
      outline(ctx, 0, 0, 128, 26, "#3b444d")
      rect(ctx, 3, 3, 122, 20, "#1b2733")
      rect(ctx, 46, 9, 36, 8, "#26333f")
      outline(ctx, 46, 9, 36, 8, "#3b4a58")
      rect(ctx, 60, 26, 8, 4, "#3b444d")
      rect(ctx, 3, 30, 122, 2, "rgba(43,30,26,0.25)")
    },
  },

  /** Console do host: onde a tecla E abre o painel de controle da sessão. */
  pokerConsole: {
    w: 32,
    h: 30,
    solid: { x: 0, y: 10, w: 32, h: 18 },
    baseline: 28,
    draw(ctx) {
      tabletop(ctx, 2, 12, 28, 14, "#7d5b41")
      legs(ctx, 6, 22, 20, 6, "#5a4028")
      rect(ctx, 8, 4, 16, 9, "#1b2733")
      outline(ctx, 8, 4, 16, 9, "#3b444d")
      rect(ctx, 10, 6, 12, 5, "#4a6fa5")
      rect(ctx, 6, 13, 20, 2, "#c9a04a")
    },
  },
```

- [ ] **Step 5: Rodar o teste de novo**

Run: `cd frontend && npx vitest run src/features/office/world/props.test.ts`
Expected: PASS

- [ ] **Step 6: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros (confirma que `SeatKind` com `"poker"` não quebrou nenhum
`switch`/objeto exaustivo em outro arquivo)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/office/world/map.ts frontend/src/features/office/world/props.ts frontend/src/features/office/world/props.test.ts
git commit -m "feat(office): SeatKind 'poker' e props da sala em U (mesa, telão, console)"
```

---

## Task 3: Andar 1 — bullpen compacto (30 baias, corredor único)

**Files:**
- Modify: `frontend/src/features/office/world/floors/floor1.ts` (reescrita completa)
- Modify: `frontend/src/features/office/world/floors/floor1.test.ts` (reescrita completa)

**Interfaces:**
- Consumes: `PROPS`, `PropKind` de `../props`; `SOLID_TILES`, `T`, `TILE` de `../tiles`; `LightSource, OfficeMap, PlacedProp, Seat, SeatKind, Zone` de `../map`.
- Produces: `buildFloor1(): OfficeMap` com `cols: 70, rows: 10`, 30 assentos `kind: "pc"` todos `facing: "down"`, zonas `elevator` e `bullpen` só.

- [ ] **Step 1: Substituir todo o conteúdo de `floor1.ts`**

```ts
// Andar 1 — bullpen compacto.
//
// Um corredor central com 30 baias (15 de cada lado), todas com o mesmo
// assento voltado para baixo — nenhuma de costas para a câmera. Reduz o
// galpão com varanda e fachada de vidro da entrega anterior: aqui o andar é
// só a estação de trabalho, do tamanho de um escritório real.
import type { LightSource, OfficeMap, PlacedProp, Seat, SeatKind, Zone } from "../map"
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"

const COLS = 70
const ROWS = 10

// 15 colunas de baia, encostadas — o corredor central é o único acesso, não
// há mais vãos verticais entre clusters como no galpão antigo.
const CUBICLE_COLS = Array.from({ length: 15 }, (_, i) => 8 + i * 4)
const TOP_TY = 1

function idx(x: number, y: number): number {
  return y * COLS + x
}

function fill(grid: Uint8Array, x: number, y: number, w: number, h: number, value: number): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (i >= 0 && i < COLS && j >= 0 && j < ROWS) grid[idx(i, j)] = value
    }
  }
}

/** Casca de cômodo: piso + contorno de parede, topo em WALL_TOP. */
function room(grid: Uint8Array, x: number, y: number, w: number, h: number, floor: number): void {
  fill(grid, x, y, w, h, floor)
  fill(grid, x, y, w, 1, T.WALL_TOP)
  fill(grid, x, y + 1, w, 1, T.WALL)
  fill(grid, x, y + h - 1, w, 1, T.WALL)
  fill(grid, x, y + 1, 1, h - 1, T.WALL_V)
  fill(grid, x + w - 1, y + 1, 1, h - 1, T.WALL_V)
}

export function buildFloor1(): OfficeMap {
  const floor = new Uint8Array(COLS * ROWS).fill(T.VOID)

  room(floor, 0, 0, COLS, ROWS, T.WOOD)

  // Hall do elevador: ladrilho, encostado na parede oeste.
  fill(floor, 1, 1, 6, ROWS - 2, T.TILEFLOOR)

  const collision = new Uint8Array(COLS * ROWS)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      collision[idx(x, y)] = SOLID_TILES.has(floor[idx(x, y)]) ? 1 : 0
    }
  }

  const props: PlacedProp[] = []
  const add = (kind: PropKind, tx: number, ty: number) =>
    props.push({ kind, x: tx * TILE, y: ty * TILE })

  // Um par cubicle/cubicleFlip por coluna — mesma peça e colisão da entrega
  // anterior. A diferença fica só no assento (ver abaixo): as duas fileiras
  // olham para baixo agora, em vez de uma olhar para cima.
  for (const tx of CUBICLE_COLS) {
    add("cubicle", tx, TOP_TY)
    add("cubicleFlip", tx, TOP_TY + 4)
  }

  add("elevatorDoors", 2, 2)
  add("waterCooler", 7, 1)
  add("plant", 68, 3)
  add("plant", 68, 6)
  add("lamp", 36, 1)
  add("lamp", 36, 7)

  // Props gravam colisão pelo retângulo que ocupam.
  for (const p of props) {
    const def = PROPS[p.kind]
    if (!def.solid) continue
    const sx = Math.floor((p.x + def.solid.x) / TILE)
    const sy = Math.floor((p.y + def.solid.y) / TILE)
    const ex = Math.ceil((p.x + def.solid.x + def.solid.w) / TILE)
    const ey = Math.ceil((p.y + def.solid.y + def.solid.h) / TILE)
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) collision[idx(x, y)] = 1
      }
    }
  }

  const zones: Zone[] = [
    {
      id: "elevator",
      label: "Elevador",
      x: 2, y: 2, w: 4, h: 4,
      accent: "#8a93a0",
      hint: "Aperte E para escolher o andar",
    },
    {
      id: "bullpen",
      label: "Bullpen",
      x: 7, y: 1, w: COLS - 8, h: ROWS - 2,
      accent: "#5d8a52",
      hint: "Estação de trabalho",
    },
  ]

  const lights: LightSource[] = [
    { x: 36 * TILE + 8, y: 1 * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 36 * TILE + 8, y: 7 * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 4 * TILE, y: 2 * TILE, radius: 36, color: "#e8d24a", flicker: 0.14 },
  ]

  const seatId = (prefix: string, x: number, y: number) =>
    `${prefix}-${Math.floor(x / TILE)}-${Math.floor(y / TILE)}`

  const seats: Seat[] = []
  const addSeat = (
    prefix: string,
    x: number,
    y: number,
    facing: Seat["facing"],
    label: string,
    kind: SeatKind,
  ) => seats.push({ id: seatId(prefix, x, y), x, y, facing, label, kind })

  // Um assento por baia, os dois no corredor livre entre o par (ty+3): as
  // duas fileiras olham para baixo — nenhum avatar de costas para a câmera,
  // o problema que a planta anterior tinha (metade das baias olhava para cima).
  for (const tx of CUBICLE_COLS) {
    addSeat("ws", (tx + 1) * TILE, (TOP_TY + 3) * TILE + 4, "down", "Baia", "pc")
    addSeat("ws", (tx + 2) * TILE, (TOP_TY + 3) * TILE + 12, "down", "Baia", "pc")
  }

  return {
    cols: COLS,
    rows: ROWS,
    width: COLS * TILE,
    height: ROWS * TILE,
    floor,
    collision,
    props,
    zones,
    lights,
    seats,
    // Spawn no hall, em frente ao elevador.
    spawn: { x: 4 * TILE, y: 4 * TILE },
  }
}
```

- [ ] **Step 2: Substituir todo o conteúdo de `floor1.test.ts`**

```ts
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
```

- [ ] **Step 3: Rodar os testes**

Run: `cd frontend && npx vitest run src/features/office/world/floors/floor1.test.ts`
Expected: PASS. Se "TODO assento é alcançável" falhar, o motivo mais provável
é a linha do corredor (`TOP_TY + 3`) ter ficado bloqueada por engano — confira
se `cubicle`/`cubicleFlip` continuam gravando exatamente o mesmo `solid` do
`props.ts` (não foi tocado nesta task) e se `TOP_TY` está coerente com `ROWS`.

- [ ] **Step 4: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/office/world/floors/floor1.ts frontend/src/features/office/world/floors/floor1.test.ts
git commit -m "feat(office): andar 1 vira bullpen compacto — 30 baias, corredor único, sem baia de costas"
```

---

## Task 4: Andar 2 — sala de Planning Poker + registry

**Files:**
- Create: `frontend/src/features/office/world/floors/floor2.ts`
- Create: `frontend/src/features/office/world/floors/floor2.test.ts`
- Modify: `frontend/src/features/office/world/floors/index.ts`
- Modify: `frontend/src/features/office/world/floors/index.test.ts`

**Interfaces:**
- Consumes: `PROPS`, `PropKind`, `SOLID_TILES`, `T`, `TILE`, tipos de `../map` (mesmos de `floor1.ts`). Consome `SeatKind: "poker"` e `PROPS.pokerTable/pokerScreen/pokerConsole` da Task 2.
- Produces: `buildFloor2(): OfficeMap` com `cols: 26, rows: 17`, 16 assentos `kind: "poker"`, zonas `elevator`, `poker-console`, `poker-room`.

- [ ] **Step 1: Criar `floor2.ts`**

```ts
// Andar 2 — sala de Planning Poker.
//
// Mesa em U que abre para o hall/elevador ao norte, 16 assentos ao redor,
// telão na parede sul e um console perto da entrada onde o host controla a
// sessão. Todo assento olha para baixo — mesma regra do andar 1: nenhum
// avatar de costas para a câmera.
import type { LightSource, OfficeMap, PlacedProp, Seat, SeatKind, Zone } from "../map"
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"

const COLS = 26
const ROWS = 17

function idx(x: number, y: number): number {
  return y * COLS + x
}

function fill(grid: Uint8Array, x: number, y: number, w: number, h: number, value: number): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (i >= 0 && i < COLS && j >= 0 && j < ROWS) grid[idx(i, j)] = value
    }
  }
}

function room(grid: Uint8Array, x: number, y: number, w: number, h: number, floor: number): void {
  fill(grid, x, y, w, h, floor)
  fill(grid, x, y, w, 1, T.WALL_TOP)
  fill(grid, x, y + 1, w, 1, T.WALL)
  fill(grid, x, y + h - 1, w, 1, T.WALL)
  fill(grid, x, y + 1, 1, h - 1, T.WALL_V)
  fill(grid, x + w - 1, y + 1, 1, h - 1, T.WALL_V)
}

export function buildFloor2(): OfficeMap {
  const floor = new Uint8Array(COLS * ROWS).fill(T.VOID)

  room(floor, 0, 0, COLS, ROWS, T.WOOD)
  fill(floor, 1, 1, 6, 6, T.TILEFLOOR)

  const collision = new Uint8Array(COLS * ROWS)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      collision[idx(x, y)] = SOLID_TILES.has(floor[idx(x, y)]) ? 1 : 0
    }
  }

  const props: PlacedProp[] = []
  const add = (kind: PropKind, tx: number, ty: number) =>
    props.push({ kind, x: tx * TILE, y: ty * TILE })

  add("elevatorDoors", 2, 2)
  add("pokerConsole", 8, 2)
  add("pokerTable", 6, 6)
  add("pokerScreen", 10, 14)
  add("plant", 24, 2)
  add("plant", 24, 13)

  for (const p of props) {
    const def = PROPS[p.kind]
    if (!def.solid) continue
    const sx = Math.floor((p.x + def.solid.x) / TILE)
    const sy = Math.floor((p.y + def.solid.y) / TILE)
    const ex = Math.ceil((p.x + def.solid.x + def.solid.w) / TILE)
    const ey = Math.ceil((p.y + def.solid.y + def.solid.h) / TILE)
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) collision[idx(x, y)] = 1
      }
    }
  }

  const zones: Zone[] = [
    {
      id: "elevator",
      label: "Elevador",
      x: 2, y: 2, w: 4, h: 4,
      accent: "#8a93a0",
      hint: "Aperte E para escolher o andar",
    },
    {
      id: "poker-console",
      label: "Console",
      x: 7, y: 1, w: 4, h: 4,
      accent: "#c9a04a",
      hint: "Aperte E para abrir o painel do host",
    },
    {
      id: "poker-room",
      label: "Planning Poker",
      x: 0, y: 0, w: COLS, h: ROWS,
      accent: "#6c5cf0",
      hint: "Sente-se para entrar na rodada",
    },
  ]

  const lights: LightSource[] = [
    { x: 13 * TILE, y: 9 * TILE, radius: 130, color: "#e6ddff", flicker: 0 },
    { x: 4 * TILE, y: 2 * TILE, radius: 36, color: "#e8d24a", flicker: 0.14 },
  ]

  const seatId = (prefix: string, x: number, y: number) =>
    `${prefix}-${Math.floor(x / TILE)}-${Math.floor(y / TILE)}`

  const seats: Seat[] = []
  const addSeat = (
    prefix: string,
    x: number,
    y: number,
    facing: Seat["facing"],
    label: string,
    kind: SeatKind,
  ) => seats.push({ id: seatId(prefix, x, y), x, y, facing, label, kind })

  // Base do U, entre a mesa e o telão.
  for (const tx of [6, 8, 10, 12, 14, 16, 18, 20]) {
    addSeat("pk", tx * TILE, 13 * TILE, "down", "Planning Poker", "poker")
  }
  // Braço oeste da mesa.
  for (const ty of [5, 7, 9, 11]) {
    addSeat("pk", 4 * TILE, ty * TILE, "down", "Planning Poker", "poker")
  }
  // Braço leste da mesa.
  for (const ty of [5, 7, 9, 11]) {
    addSeat("pk", 22 * TILE, ty * TILE, "down", "Planning Poker", "poker")
  }

  return {
    cols: COLS,
    rows: ROWS,
    width: COLS * TILE,
    height: ROWS * TILE,
    floor,
    collision,
    props,
    zones,
    lights,
    seats,
    spawn: { x: 4 * TILE, y: 4 * TILE },
  }
}
```

- [ ] **Step 2: Criar `floor2.test.ts`**

```ts
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
    expect(isSolid(map, screen.x + 8, screen.y + 8)).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar os testes e corrigir geometria se necessário**

Run: `cd frontend && npx vitest run src/features/office/world/floors/floor2.test.ts`
Expected: PASS. Se algum assento ficar ilhado ou dentro de tile bloqueado,
ajuste as coordenadas em `floor2.ts` (colunas/linhas dos assentos ou posição
da mesa) — a causa mais comum é um assento caindo em cima do retângulo sólido
da mesa (`pokerTable` ocupa tiles x=6..21, y=6..12) ou do telão (`pokerScreen`
ocupa x=10..17, y=14..15).

- [ ] **Step 4: Ligar o andar 2 no registry**

Em `floors/index.ts`, troque:

```ts
import { buildFloor1 } from "./floor1"
```

por:

```ts
import { buildFloor1 } from "./floor1"
import { buildFloor2 } from "./floor2"
```

E troque a entrada do andar 2:

```ts
  { n: 2, label: "Reunião" },
```

por:

```ts
  { n: 2, label: "Planning Poker", build: buildFloor2 },
```

- [ ] **Step 5: Atualizar `index.test.ts`**

Troque:

```ts
  it("só o andar 1 tem planta; os outros estão em obras", () => {
    expect(typeof floorDef(1)?.build).toBe("function")
    for (const n of [2, 3, 4]) expect(floorDef(n)?.build).toBeUndefined()
  })
```

por:

```ts
  it("andares 1 e 2 têm planta; 3 e 4 estão em obras", () => {
    expect(typeof floorDef(1)?.build).toBe("function")
    expect(typeof floorDef(2)?.build).toBe("function")
    for (const n of [3, 4]) expect(floorDef(n)?.build).toBeUndefined()
  })
```

E adicione, no fim do `describe`:

```ts
  it("buildFloor devolve o mapa do andar 2 (poker)", () => {
    const map = buildFloor(2)
    expect(map.seats.filter((s) => s.kind === "poker")).toHaveLength(16)
  })

  it("buildFloor recusa andar em obras", () => {
    expect(() => buildFloor(3)).toThrow(/em obras/i)
  })
```

(a asserção antiga `expect(() => buildFloor(2)).toThrow(/em obras/i)` sai —
andar 2 não está mais em obras)

- [ ] **Step 6: Rodar todos os testes de `floors/`**

Run: `cd frontend && npx vitest run src/features/office/world/floors/`
Expected: PASS em todos os arquivos (`floor1.test.ts`, `floor2.test.ts`, `index.test.ts`)

- [ ] **Step 7: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/office/world/floors/
git commit -m "feat(office): andar 2 vira a sala de Planning Poker (mesa em U, 16 assentos, console)"
```

---

## Task 5: Remover o app "Planning Poker" do PC (substituído pelo andar 2)

**Files:**
- Modify: `frontend/src/features/office/pc/apps.registry.ts`
- Modify: `frontend/src/features/office/pc/apps.registry.test.ts`

**Interfaces:**
- Produces: `APPS` sem a entrada `id: "poker"` — o Planning Poker agora é o andar 2, não um ícone no desktop Win98.

- [ ] **Step 1: Remover a entrada do registry**

Em `apps.registry.ts`, remova a linha:

```ts
  { id: "myday", label: "Meu Dia", group: "trabalho", size: MED, component: null },
  { id: "poker", label: "Planning Poker", group: "trabalho", size: BIG, component: null },
```

fica só:

```ts
  { id: "myday", label: "Meu Dia", group: "trabalho", size: MED, component: null },
```

- [ ] **Step 2: Atualizar o teste de contagem**

Em `apps.registry.test.ts`, troque:

```ts
  it("cobre as 15 rotas do produto", () => {
    expect(APPS).toHaveLength(15)
  })
```

por:

```ts
  it("cobre as 14 rotas do produto", () => {
    expect(APPS).toHaveLength(14)
  })
```

- [ ] **Step 3: Rodar os testes**

Run: `cd frontend && npx vitest run src/features/office/pc/apps.registry.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/office/pc/apps.registry.ts frontend/src/features/office/pc/apps.registry.test.ts
git commit -m "chore(office): remove o ícone 'Planning Poker' do PC — agora é o andar 2"
```

---

## Task 6: `pickActiveSession` (seleção pura) + `useActivePokerSession`

**Files:**
- Create: `frontend/src/features/poker/poker.selectors.ts`
- Create: `frontend/src/features/poker/poker.selectors.test.ts`
- Modify: `frontend/src/features/poker/poker.hooks.ts`

**Interfaces:**
- Produces: `pickActiveSession(sessions: PokerSession[]): PokerSession | null` — função pura, testável sem mock de rede. `useActivePokerSession(workspaceId: string | null)` — hook TanStack Query (sem teste direto, como todo hook do arquivo, ver `useRoom`/`useSession` no próprio arquivo).
- Consumes: `PokerSession`, `SessionStatus` de `./poker.types`; `listSessions` de `./poker.api`.

- [ ] **Step 1: Escrever o teste de `pickActiveSession` primeiro**

Crie `poker.selectors.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { pickActiveSession } from "./poker.selectors"
import type { PokerSession } from "./poker.types"

function session(status: PokerSession["status"], id = "s1"): PokerSession {
  return {
    id, workspace_id: "w1", project_id: "p1", created_by: "u1",
    name: "Sessão", status, current_card_id: null, card_ids: [],
    created_at: "2026-01-01T00:00:00Z", participants: [], votes: [],
  }
}

describe("pickActiveSession", () => {
  it("prefere sessão em votação sobre qualquer outra", () => {
    const sessions = [session("done", "a"), session("voting", "b"), session("waiting", "c")]
    expect(pickActiveSession(sessions)?.id).toBe("b")
  })

  it("prefere revelado sobre aguardando", () => {
    const sessions = [session("waiting", "a"), session("revealed", "b")]
    expect(pickActiveSession(sessions)?.id).toBe("b")
  })

  it("cai para 'aguardando' se não há votação nem reveal em curso", () => {
    const sessions = [session("done", "a"), session("waiting", "b")]
    expect(pickActiveSession(sessions)?.id).toBe("b")
  })

  it("devolve null se só há sessões concluídas ou lista vazia", () => {
    expect(pickActiveSession([session("done")])).toBeNull()
    expect(pickActiveSession([])).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/poker/poker.selectors.test.ts`
Expected: FAIL — `poker.selectors` não existe

- [ ] **Step 3: Implementar `poker.selectors.ts`**

```ts
import type { PokerSession } from "./poker.types"

/**
 * Qual sessão é "a que está rolando agora" na sala de poker do andar 2.
 * Prioriza votação/reveal em curso; sem isso, cai para uma sessão aguardando
 * o host começar. Sessões concluídas não contam — não há "sessão implícita
 * do andar", quem decide o que abrir é o host pelo console.
 */
export function pickActiveSession(sessions: PokerSession[]): PokerSession | null {
  return (
    sessions.find((s) => s.status === "voting" || s.status === "revealed") ??
    sessions.find((s) => s.status === "waiting") ??
    null
  )
}
```

- [ ] **Step 4: Rodar de novo**

Run: `cd frontend && npx vitest run src/features/poker/poker.selectors.test.ts`
Expected: PASS

- [ ] **Step 5: Adicionar `useActivePokerSession` em `poker.hooks.ts`**

No topo do arquivo, ajuste o import de `poker.api` para incluir `listSessions`
(hoje o arquivo importa `* as pokerApi from "./poker.api"` — confirme e, se
for import nomeado, adicione `listSessions`). Adicione a função:

```ts
import { pickActiveSession } from "./poker.selectors"

export function useActivePokerSession(workspaceId: string | null) {
  return useQuery({
    queryKey: ["poker-sessions", "workspace", workspaceId],
    queryFn: () => pokerApi.listSessions(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: 2000,
    select: pickActiveSession,
  })
}
```

- [ ] **Step 6: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/poker/poker.selectors.ts frontend/src/features/poker/poker.selectors.test.ts frontend/src/features/poker/poker.hooks.ts
git commit -m "feat(poker): pickActiveSession + useActivePokerSession para a sala do andar 2"
```

---

## Task 7: Store da sala de poker (console + assento de voto)

**Files:**
- Create: `frontend/src/features/office/poker/pokerRoom.store.ts`
- Create: `frontend/src/features/office/poker/pokerRoom.store.test.ts`

**Interfaces:**
- Produces: `usePokerRoomStore` (Zustand) com `consoleOpen: boolean`, `voteSeatId: string | null`, `openConsole()`, `closeConsole()`, `openVote(seatId: string)`, `closeVote()`.

- [ ] **Step 1: Escrever o teste primeiro**

Crie `pokerRoom.store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"

import { usePokerRoomStore } from "./pokerRoom.store"

const reset = () => usePokerRoomStore.setState({ consoleOpen: false, voteSeatId: null })

describe("usePokerRoomStore", () => {
  beforeEach(reset)

  it("começa fechado", () => {
    expect(usePokerRoomStore.getState()).toMatchObject({ consoleOpen: false, voteSeatId: null })
  })

  it("abre e fecha o console", () => {
    usePokerRoomStore.getState().openConsole()
    expect(usePokerRoomStore.getState().consoleOpen).toBe(true)
    usePokerRoomStore.getState().closeConsole()
    expect(usePokerRoomStore.getState().consoleOpen).toBe(false)
  })

  it("abre o voto guardando o id do assento e fecha limpando", () => {
    usePokerRoomStore.getState().openVote("pk-6-13")
    expect(usePokerRoomStore.getState().voteSeatId).toBe("pk-6-13")
    usePokerRoomStore.getState().closeVote()
    expect(usePokerRoomStore.getState().voteSeatId).toBeNull()
  })

  it("abrir o console não mexe no voto, e vice-versa", () => {
    usePokerRoomStore.getState().openVote("pk-6-13")
    usePokerRoomStore.getState().openConsole()
    expect(usePokerRoomStore.getState().voteSeatId).toBe("pk-6-13")
    expect(usePokerRoomStore.getState().consoleOpen).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/poker/pokerRoom.store.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar o store**

```ts
// Estado de UI da sala de Planning Poker do andar 2: painel do host
// (console) e o mini-seletor de carta de quem está sentado votando.
//
// Fica fora do engine de propósito, igual ao world.store do elevador: são
// dois overlays React independentes, sem estado de simulação.
import { create } from "zustand"

interface PokerRoomStore {
  consoleOpen: boolean
  voteSeatId: string | null

  openConsole: () => void
  closeConsole: () => void
  openVote: (seatId: string) => void
  closeVote: () => void
}

export const usePokerRoomStore = create<PokerRoomStore>((set) => ({
  consoleOpen: false,
  voteSeatId: null,

  openConsole: () => set({ consoleOpen: true }),
  closeConsole: () => set({ consoleOpen: false }),
  openVote: (seatId) => set({ voteSeatId: seatId }),
  closeVote: () => set({ voteSeatId: null }),
}))
```

- [ ] **Step 4: Rodar de novo**

Run: `cd frontend && npx vitest run src/features/office/poker/pokerRoom.store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/office/poker/pokerRoom.store.ts frontend/src/features/office/poker/pokerRoom.store.test.ts
git commit -m "feat(office): store da sala de poker (console do host + assento em votação)"
```

---

## Task 8: `PokerConsolePanel` — painel Win98 de controle do host

**Files:**
- Create: `frontend/src/features/office/poker/PokerConsolePanel.tsx`

**Interfaces:**
- Consumes: `usePokerRoomStore` (Task 7); `useWorkspaceStore` (`@/features/workspace/workspace.store`, já existente — usado por `PokerPage.tsx`); `useProjects` (`@/features/workspace/workspace.hooks`); `useProjectSessions`, `useCreateProjectSession`, `usePokerCards`, `useUpdateSession`, `useApplyPoints` de `@/features/poker/poker.hooks`; `FIBONACCI` de `@/features/poker/poker.types`.
- Sem teste automatizado nesta task — mesmo caso de `PokerPage.tsx`/`OfficeRoom.tsx`, que dependem de React Query com API real e não têm suíte própria no projeto. Verificação é manual (Step 3).

- [ ] **Step 1: Criar o componente**

```tsx
// Painel do host do Planning Poker — mesmo estilo Win98 do elevador
// (ElevatorPanel) e do PC (Win98Window), aberto pela zona "poker-console" do
// andar 2. Reaproveita os hooks que a PokerPage já usa: nenhuma lógica nova
// de sessão/voto, só a superfície de controle dentro do mundo 3D.
import { useState } from "react"

import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { useProjects } from "@/features/workspace/workspace.hooks"
import {
  useProjectSessions,
  useCreateProjectSession,
  usePokerCards,
  useUpdateSession,
  useApplyPoints,
} from "@/features/poker/poker.hooks"

import { usePokerRoomStore } from "./pokerRoom.store"
import "../pc/win98.css"

export function PokerConsolePanel() {
  const open = usePokerRoomStore((s) => s.consoleOpen)
  const close = usePokerRoomStore((s) => s.closeConsole)
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: projects } = useProjects(workspaceId)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const { data: sessions } = useProjectSessions(projectId)
  const createSession = useCreateProjectSession(projectId)
  const { data: cards } = usePokerCards(sessionId)
  const updateSession = useUpdateSession(sessionId)
  const applyPoints = useApplyPoints(sessionId)
  const [points, setPoints] = useState("")

  if (!open) return null

  const session = sessions?.find((s) => s.id === sessionId) ?? null

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/50">
      <div className="win98 win98-raised w-[360px]">
        <div className="win98-titlebar win98-titlebar--active flex items-center gap-1 px-1 py-0.5">
          <span className="flex-1 truncate text-[11px]">Console — Planning Poker</span>
          <button type="button" className="win98-btn" onClick={close} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="win98-sunken m-0.5 flex flex-col gap-2 p-3 text-[12px]">
          <label className="flex flex-col gap-1">
            Projeto
            <select
              className="win98-btn"
              value={projectId ?? ""}
              onChange={(e) => {
                setProjectId(e.target.value || null)
                setSessionId(null)
              }}
            >
              <option value="">Selecione…</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          {projectId && (
            <label className="flex flex-col gap-1">
              Sessão
              <select
                className="win98-btn"
                value={sessionId ?? ""}
                onChange={(e) => setSessionId(e.target.value || null)}
              >
                <option value="">Selecione…</option>
                {sessions?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.status}</option>
                ))}
              </select>
            </label>
          )}

          {projectId && (
            <button
              type="button"
              className="win98-btn"
              onClick={() => createSession.mutate(undefined, { onSuccess: (s) => setSessionId(s.id) })}
            >
              Nova sessão
            </button>
          )}

          {session && (
            <>
              <p>Status: <b>{session.status}</b></p>
              <p>Cards na fila: {cards?.length ?? 0}</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="win98-btn flex-1"
                  disabled={session.status === "voting"}
                  onClick={() => updateSession.mutate({ status: "voting" })}
                >
                  Iniciar votação
                </button>
                <button
                  type="button"
                  className="win98-btn flex-1"
                  disabled={session.status !== "voting"}
                  onClick={() => updateSession.mutate({ status: "revealed" })}
                >
                  Revelar
                </button>
              </div>
              {session.status === "revealed" && (
                <div className="flex gap-1">
                  <input
                    className="win98-btn flex-1"
                    placeholder="Pontos finais"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                  <button
                    type="button"
                    className="win98-btn"
                    disabled={!points}
                    onClick={() => {
                      applyPoints.mutate(Number(points))
                      setPoints("")
                    }}
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros. Se `useProjects`, `useWorkspaceStore` ou algum hook de
`poker.hooks` tiver assinatura diferente da assumida acima, ajuste as chamadas
para bater com a assinatura real (confira em
`frontend/src/features/workspace/workspace.hooks.ts` e
`frontend/src/features/workspace/workspace.store.ts`) — a intenção do
componente (selecionar projeto → sessão → controlar status → aplicar pontos)
é o que importa, não o nome exato de cada prop se o hook já existir com
formato ligeiramente diferente.

- [ ] **Step 3: Verificação manual**

Run: `cd frontend && npm run dev`, entrar no escritório, ir de elevador para
o andar 2, andar até a zona do console (perto da entrada) e apertar E.
Esperado: painel Win98 abre com seletor de projeto; ao escolher um projeto
com sessões de poker existentes (criadas via `/poker` normalmente), a lista
aparece; "Nova sessão" cria uma e seleciona; com uma sessão selecionada,
"Iniciar votação"/"Revelar"/"Aplicar" fazem a chamada (confirme na aba
Network do navegador que o PATCH/POST correto sai).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/office/poker/PokerConsolePanel.tsx
git commit -m "feat(office): painel Win98 do host de Planning Poker no andar 2"
```

---

## Task 9: `PokerVoteWheel` — roda de votação de quem está sentado

**Files:**
- Create: `frontend/src/features/office/poker/PokerVoteWheel.tsx`

**Interfaces:**
- Consumes: `useJoinSession`, `useSubmitVote` de `@/features/poker/poker.hooks`; `FIBONACCI` de `@/features/poker/poker.types`.
- Produces: `<PokerVoteWheel sessionId={string} onClose={() => void} />` — ao montar, entra na sessão (`useJoinSession`); cada botão vota e fecha.
- Sem teste automatizado — mesmo motivo da Task 8 (depende de rede real). Verificação manual no Step 3.

- [ ] **Step 1: Criar o componente**

```tsx
// Roda de votação de quem senta na mesa em U — mesmo padrão visual da roda
// de emotes do OfficeRoom (botões redondos numa barra flutuante), só que
// cada botão é uma carta do deck Fibonacci em vez de uma animação.
import { useEffect } from "react"

import { useJoinSession, useSubmitVote } from "@/features/poker/poker.hooks"
import { FIBONACCI } from "@/features/poker/poker.types"

export function PokerVoteWheel({
  sessionId,
  onClose,
}: {
  sessionId: string
  onClose: () => void
}) {
  const join = useJoinSession(sessionId)
  const submitVote = useSubmitVote(sessionId)

  // Sentar = entrar na sessão. Best-effort, igual ao heartbeat do resto do
  // mundo: se a pessoa já é participante, o backend só devolve 200 de novo.
  useEffect(() => {
    join.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return (
    <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg bg-ink-950/80 p-1.5 backdrop-blur-sm">
      {FIBONACCI.map((value) => (
        <button
          key={value}
          type="button"
          title={`Votar ${value}`}
          onClick={() => {
            submitVote.mutate(value)
            onClose()
          }}
          className="grid size-9 place-items-center rounded-md text-sm font-bold text-white transition-colors hover:bg-white/15 focus-ring"
        >
          {value}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Verificação manual**

Run: `cd frontend && npm run dev`. No andar 2, com uma sessão em votação
(criada pelo console da Task 8), sentar num assento da mesa em U. Esperado:
roda de cartas aparece embaixo, votar fecha a roda e o voto aparece (depois
da Task 10/11) como plaquinha acima da cabeça.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/office/poker/PokerVoteWheel.tsx
git commit -m "feat(office): roda de votação Fibonacci ao sentar na mesa de poker"
```

---

## Task 10: Plaquinha de voto acima da cabeça (motor)

**Files:**
- Create: `frontend/src/features/office/world/poker-badge.ts`
- Create: `frontend/src/features/office/world/poker-badge.test.ts`
- Modify: `frontend/src/features/office/world/engine.ts`

**Interfaces:**
- Produces: `pokerBadgeFor(vote: string | null, revealed: boolean): { text: string; revealed: boolean } | null` — pura, testada. `OfficeEngine.setPokerVotes(votes: Map<string, string | null>, revealed: boolean): void` — novo método público. `Actor` ganha `pokerVote: string | null` e `pokerRevealed: boolean`.

- [ ] **Step 1: Escrever o teste da função pura primeiro**

Crie `poker-badge.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { pokerBadgeFor } from "./poker-badge"

describe("pokerBadgeFor", () => {
  it("não mostra nada para quem não votou", () => {
    expect(pokerBadgeFor(null, false)).toBeNull()
  })

  it("mostra o verso (?) enquanto não revelado", () => {
    expect(pokerBadgeFor("8", false)).toEqual({ text: "?", revealed: false })
  })

  it("mostra o valor votado depois do reveal", () => {
    expect(pokerBadgeFor("8", true)).toEqual({ text: "8", revealed: true })
  })

  it("voto de incerteza aparece como '?' mesmo revelado", () => {
    expect(pokerBadgeFor("?", true)).toEqual({ text: "?", revealed: true })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/poker-badge.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar `poker-badge.ts`**

```ts
// O que mostrar na plaquinha de voto acima da cabeça do avatar — puro, sem
// canvas, para poder provar em teste (engine.ts não dá para instanciar em
// jsdom, então a decisão de conteúdo mora fora dele).
export interface PokerBadge {
  text: string
  revealed: boolean
}

/** `null` = avatar não votou ainda, não desenha nada. */
export function pokerBadgeFor(vote: string | null, revealed: boolean): PokerBadge | null {
  if (vote === null) return null
  return { text: revealed ? vote : "?", revealed }
}
```

- [ ] **Step 4: Rodar de novo**

Run: `cd frontend && npx vitest run src/features/office/world/poker-badge.test.ts`
Expected: PASS

- [ ] **Step 5: Estender `Actor` e `makeActor` em `engine.ts`**

Na interface `Actor`, adicione dois campos (perto de `emote`/`emoteUntil`):

```ts
  emote: string
  emoteUntil: number
  /** Voto atual na sessão de Planning Poker do andar 2; null = não votou. */
  pokerVote: string | null
  pokerRevealed: boolean
```

No `makeActor`, no objeto retornado, adicione os valores iniciais junto de
`self, status, say: "", sayUntil: 0, emote: "", emoteUntil: 0,`:

```ts
      self, status, say: "", sayUntil: 0, emote: "", emoteUntil: 0,
      pokerVote: null, pokerRevealed: false,
```

- [ ] **Step 6: Adicionar `setPokerVotes` (perto de `emote()`)**

```ts
  /**
   * Estado de voto de todos os atores da sessão de poker ativa — a decisão
   * de QUEM votou o quê já veio pronta do React (que conversa com o
   * backend); aqui só reflete no desenho. `votes` é indexado por `actor.id`
   * (mesmo id de `spawnSelf`/`syncRemote`, que é o `user_id`).
   */
  setPokerVotes(votes: Map<string, string | null>, revealed: boolean): void {
    for (const actor of this.actors.values()) {
      actor.pokerVote = votes.get(actor.id) ?? null
      actor.pokerRevealed = revealed
    }
  }
```

- [ ] **Step 7: Importar `pokerBadgeFor` e desenhar a plaquinha em `renderNameplates`**

No topo do arquivo, junto dos outros imports de `./`:

```ts
import { pokerBadgeFor } from "./poker-badge"
```

Dentro de `renderNameplates`, logo depois do bloco que desenha o rótulo de
nome (depois de `ctx.fillText(label, sx + 4, by + 7)` e antes do fechamento
do `for`), adicione:

```ts
      const badge = pokerBadgeFor(actor.pokerVote, actor.pokerRevealed)
      if (badge) {
        const bw = 18
        const bx2 = sx - bw / 2
        const by2 = by - 18
        ctx.fillStyle = badge.revealed ? "#6c5cf0" : "#2b2b3a"
        roundRect(ctx, bx2, by2, bw, 16, 4)
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.4)"
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = "#ffffff"
        ctx.font = "700 10px -apple-system, system-ui, sans-serif"
        ctx.fillText(badge.text, sx, by2 + 8)
      }
```

- [ ] **Step 8: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 9: Rodar toda a suíte de `world/`**

Run: `cd frontend && npx vitest run src/features/office/world/`
Expected: PASS em tudo (nada em `engine.ts` tem teste direto — o comentário
no topo do arquivo já documenta que jsdom não roda canvas; a cobertura fica
em `poker-badge.test.ts`, que é a parte testável)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/office/world/poker-badge.ts frontend/src/features/office/world/poker-badge.test.ts frontend/src/features/office/world/engine.ts
git commit -m "feat(office): plaquinha de voto acima da cabeça — verso até revelar, valor depois"
```

---

## Task 11: Ligar tudo no `OfficeRoom`

**Files:**
- Modify: `frontend/src/features/office/OfficeRoom.tsx`

**Interfaces:**
- Consumes: `usePokerRoomStore` (Task 7), `PokerConsolePanel` (Task 8), `PokerVoteWheel` (Task 9), `useActivePokerSession` (Task 6), `engine.setPokerVotes` (Task 10). Todos os seats/zonas novos vêm do `OfficeMap` do andar 2 (Task 4) — nenhuma mudança de tipo aqui, só de comportamento.

- [ ] **Step 1: Importar as peças novas**

No topo de `OfficeRoom.tsx`, junto dos imports existentes de `./pc/...` e
`./world/...`:

```ts
import { PokerConsolePanel } from "./poker/PokerConsolePanel"
import { PokerVoteWheel } from "./poker/PokerVoteWheel"
import { usePokerRoomStore } from "./poker/pokerRoom.store"
import { useActivePokerSession } from "@/features/poker/poker.hooks"
```

- [ ] **Step 2: Buscar a sessão ativa e ler o store**

Dentro do componente `OfficeRoom`, perto de `const room = useRoom(...)`,
adicione:

```ts
  const activeSession = useActivePokerSession(workspaceId).data ?? null
  const voteSeatId = usePokerRoomStore((s) => s.voteSeatId)
```

- [ ] **Step 3: Refletir o voto no motor**

Adicione um novo `useEffect`, perto do efeito "Presença dos outros → atores
da cena" (`engineRef.current?.syncRemote(room.data)`):

```ts
  // Reflete o estado da sessão de poker ativa nas plaquinhas acima da
  // cabeça — sem sessão ativa, zera tudo (ninguém com plaquinha visível).
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (!activeSession) {
      engine.setPokerVotes(new Map(), false)
      return
    }
    const votes = new Map(
      activeSession.participants.map((p) => {
        const v = activeSession.votes.find((v) => v.participant_id === p.id)
        return [p.user_id, v?.has_voted ? v.value : null] as const
      }),
    )
    engine.setPokerVotes(votes, activeSession.status === "revealed")
  }, [activeSession])
```

- [ ] **Step 4: Estender `onInteract` para console e assento de poker**

No `onInteract` passado ao `new OfficeEngine(...)`, troque o corpo atual:

```ts
      onInteract: (seat) => {
        if (!seat && zoneIdRef.current === "elevator") {
          useWorldStore.getState().openPanel()
          return
        }
        setToast(seat ? seat.label : "De pé")
        if (seat && me?.id && isMyDesk(me.id, seat, map.seats)) bootPc(seat.id)
        else if (!seat) shutdownPc()
      },
```

por:

```ts
      onInteract: (seat) => {
        if (!seat && zoneIdRef.current === "elevator") {
          useWorldStore.getState().openPanel()
          return
        }
        if (!seat && zoneIdRef.current === "poker-console") {
          usePokerRoomStore.getState().openConsole()
          return
        }
        setToast(seat ? seat.label : "De pé")
        if (seat && me?.id && isMyDesk(me.id, seat, map.seats)) bootPc(seat.id)
        else if (seat && seat.kind === "poker") {
          usePokerRoomStore.getState().openVote(seat.id)
        } else if (!seat) {
          shutdownPc()
          usePokerRoomStore.getState().closeVote()
        }
      },
```

- [ ] **Step 5: Renderizar os painéis no JSX**

Perto de `<ElevatorPanel />` no JSX retornado, adicione:

```tsx
      <ElevatorPanel />
      <PokerConsolePanel />
      {voteSeatId && activeSession && (
        <PokerVoteWheel
          sessionId={activeSession.id}
          onClose={() => usePokerRoomStore.getState().closeVote()}
        />
      )}
```

- [ ] **Step 6: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 7: Rodar toda a suíte de `office/`**

Run: `cd frontend && npx vitest run src/features/office/`
Expected: PASS em tudo — nenhuma mudança de tipo quebrou os testes de
`ElevatorPanel`, `Win98Desktop`, `pc.store`, `world.store`, `floors/`, etc.

- [ ] **Step 8: Verificação manual completa**

Run: `cd frontend && npm run dev`. Roteiro:
1. Entrar no escritório → andar 1: confirmar bullpen compacto, 30 baias,
   nenhum avatar de costas, câmera mostrando mais área que antes.
2. Elevador → andar 2: confirmar mesa em U, telão, console, 16 assentos.
3. Apertar E no console → painel abre, escolher/criar sessão, iniciar
   votação.
4. Sentar num assento da mesa → roda de cartas aparece, votar mostra
   plaquinha de verso acima da cabeça.
5. No console, revelar → plaquinha muda para o valor votado.
6. Levantar (E) → roda de votos some, plaquinha desaparece na próxima sessão
   sem sessão ativa.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/office/OfficeRoom.tsx
git commit -m "feat(office): liga a sala de Planning Poker do andar 2 ao backend de estimation"
```

---

## Self-Review

**1. Cobertura do spec:**
- Andar 1 compacto, 30 baias, sem baia de costas → Task 3.
- Câmera mais aberta → Task 1.
- Andar 2 (mesa em U, 16 assentos, telão, console) → Task 4.
- Assento↔sessão (join automático, voto, plaquinha, reveal) → Tasks 6, 7, 9, 10, 11.
- Controles de host via painel Win98 → Task 8.
- Registry do andar 2 → Task 4, Step 4.
- Remoção do app "poker" do PC (órfão depois do andar 2 existir) → Task 5.
- Testes por camada (planta, câmera, store, seleção pura, badge) → cada task
  correspondente.
- Riscos do spec (assentos sobrepostos, polling mais lento, mesa pessoal
  mudando de novo, câmera revelando borda) → cobertos pelos testes de
  reachability/overlap (Tasks 3-4) e pela reutilização do mesmo padrão de
  clamp já testado em `camera.test.ts` (Task 1).

**2. Placeholders:** nenhum "TBD"/"implementar depois" — toda task tem código
completo. As duas exceções documentadas explicitamente (Tasks 8 e 9 sem teste
automatizado) têm justificativa técnica (mesma lacuna que `PokerPage.tsx` e
`OfficeRoom.tsx` já têm hoje, por dependerem de API real) e um passo de
verificação manual concreto no lugar.

**3. Consistência de tipos:** `SeatKind` (Task 2) → consumido por `floor1.ts`
(Task 3, só `"pc"`) e `floor2.ts` (Task 4, `"poker"`). `PROPS.pokerTable/
pokerScreen/pokerConsole` (Task 2) → consumidos por `floor2.ts` (Task 4) com
os mesmos nomes. `pokerBadgeFor` (Task 10) com assinatura
`(vote: string | null, revealed: boolean)` usada igual em
`poker-badge.test.ts` e dentro de `engine.ts`. `usePokerRoomStore` (Task 7)
com `openVote(seatId: string)`/`closeVote()`/`openConsole()`/`closeConsole()`
usados com os mesmos nomes em `OfficeRoom.tsx` (Task 11). `useActivePokerSession`
(Task 6) devolvendo `PokerSession | null` via `select: pickActiveSession`,
consumido em `OfficeRoom.tsx` como `.data ?? null` (Task 11) — consistente.
