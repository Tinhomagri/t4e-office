# Escritório em andares — Andar 1 (bullpen, vidro, varanda) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o escritório de andar único em prédio de andares, com o andar 1 reconstruído como bullpen estilo *The Office* — 16 baias em U, fachada de vidro em L revelando uma camada de céu com paralaxe, e varanda em deck na quina.

**Architecture:** O `OfficeEngine` continua recebendo **um** `OfficeMap` e segue ignorante sobre andares — quem conhece andar é a camada React. A planta sai de `map.ts` (que fica só com tipos e helpers) para `world/floors/floor1.ts`, listada num registry `FLOORS`. Uma camada de céu nova é desenhada **antes** do piso; vidro, guarda-corpo e `T.VOID` são recortes com alfa que a revelam. Trocar de andar remonta o engine com outro mapa.

**Tech Stack:** TypeScript, React 18, Canvas 2D (pixel art procedural, sem assets), Zustand, Vitest + jsdom, Django 5.2 + DRF, pytest.

## Global Constraints

- **Grade nativa de 16 px.** `TILE = 16`. Coordenadas de mundo em pixels inteiros; meio pixel vira borrão no upscale.
- **jsdom não tem canvas.** `OfficeEngine`, `buildTileAtlas`, `buildPropSprites` e `buildSky` **não podem ser instanciados em teste**. Toda regra testável precisa morar em função pura, fora do desenho. Nenhum teste deste plano chama `makeCanvas`.
- **Aleatoriedade só determinística.** `hash2(x, y, seed)` ou `makeRng(seed)` de `world/pixels.ts`. Nunca `Math.random()` — o escritório tem de ser igual para todos os usuários do workspace.
- **Paleta existente.** Cores novas saem de `COLORS`/`INK` de `world/tiles.ts` ou de `shade()`/`tint()`/`mix()` de `world/pixels.ts`. Contorno é `INK` (`#2b1e1a`), nunca preto puro.
- **Idioma.** Comentários, rótulos de UI e mensagens de commit em português. Nomes de código em inglês, como no resto do módulo.
- **Ids de assento derivam do tile**, nunca do índice do array: `` `${prefix}-${Math.floor(x / TILE)}-${Math.floor(y / TILE)}` ``.
- **Commits pequenos**, um por task, no formato `tipo(escopo): descrição` (`feat(office):`, `refactor(office):`, `test(office):`).
- **Suíte verde em toda task.** `npx vitest run` no fim de cada task. Nenhuma task deixa o repo vermelho.
- Rodar comandos do frontend a partir de `frontend/`; do backend, a partir de `backend/` com `.venv/bin/python`.

## File Structure

**Frontend — criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/features/office/world/floors/index.ts` | Registry `FLOORS`, tipo `FloorDef`, resolução de planta por andar |
| `src/features/office/world/floors/floor1.ts` | Planta do andar 1 (72×46): tiles, props, zonas, luzes, assentos |
| `src/features/office/world/floors/floor1.test.ts` | Invariantes da planta: alcançabilidade, contagem de assentos, vedação |
| `src/features/office/world/sky.ts` | Camada de céu: `buildSky` (canvas) + matemática de paralaxe pura |
| `src/features/office/world/sky.test.ts` | Testes da matemática de paralaxe e do loop das nuvens |
| `src/features/office/world/elevator.ts` | Regras puras do elevador: andar liberado, transição válida, botões |
| `src/features/office/world/elevator.test.ts` | Testes das regras do elevador |
| `src/features/office/world.store.ts` | Estado do andar atual + painel do elevador |
| `src/features/office/world.store.test.ts` | Testes do store de andar |
| `src/features/office/ElevatorPanel.tsx` | Painel Win98 de seleção de andar |
| `src/features/office/ElevatorPanel.test.tsx` | Testes do painel (lista andares, trava os em obras) |

**Frontend — modificar:**

| Arquivo | Mudança |
|---|---|
| `src/features/office/world/map.ts` | Perde `buildOfficeMap()`; fica com tipos + `zoneAt`/`isSolid`. `SeatKind` ganha `"view"` |
| `src/features/office/world/tiles.ts` | Remove `T.WINDOW`; adiciona `GLASS`, `GLASS_DOOR`, `DECK`, `RAILING`; `SOLID_TILES` e novo `ALPHA_TILES` |
| `src/features/office/world/props.ts` | Novos props: `cubicle`, `copier`, `filingCabinet`, `coatRack`, `noticeBoard`, `receptionDesk`, `elevatorDoors` |
| `src/features/office/world/camera.ts` | `offsetCamera()` — offset de "apoiar" respeitando o clamp |
| `src/features/office/world/camera.test.ts` | Testes do offset |
| `src/features/office/world/engine.ts` | Céu antes do piso; `setViewOffset`; assento `"view"`; sombra de parede considerando vidro |
| `src/features/office/world/map.test.ts` | Passa a importar `buildFloor1` |
| `src/features/office/pc/desk.test.ts` | Passa a importar `buildFloor1` |
| `src/features/office/OfficeRoom.tsx` | Mapa vem do andar atual; remonta ao trocar; painel do elevador; envia `floor` no heartbeat |
| `src/features/office/office.api.ts` | `getRoom(workspaceId, floor)` |
| `src/features/office/office.hooks.ts` | `useRoom(workspaceId, floor)` |
| `src/features/office/office.types.ts` | `HeartbeatInput` ganha `floor` |
| `src/features/avatar/avatar.types.ts` | `ANIMS.lean`, `ANIM_LABELS.lean`, `ANIM_FPS.lean` |
| `src/features/avatar/chibi.ts` | Clipe `lean` em `poseFor` |

**Frontend — remover:** `src/features/office/world/__tmp-reach.test.ts` (sonda untracked; vira teste de verdade na Task 8).

**Backend — modificar:**

| Arquivo | Mudança |
|---|---|
| `src/contexts/presence/infrastructure/django/models.py` | `PresenceModel.floor` |
| `src/contexts/presence/migrations/0002_presence_floor.py` | Migration (criar) |
| `src/contexts/presence/interface/api/views.py` | Heartbeat grava andar; sala filtra por andar |
| `src/contexts/presence/tests/test_presence_api.py` | Testes de andar |

---

### Task 1: Registry de andares, `map.ts` só com tipos

Refator puro: a planta atual sai de `map.ts` e vira `floors/floor1.ts` **sem mudar um pixel**. É o passo que abre espaço para a planta nova sem misturar refator com redesenho.

**Files:**
- Create: `frontend/src/features/office/world/floors/index.ts`
- Create: `frontend/src/features/office/world/floors/floor1.ts`
- Modify: `frontend/src/features/office/world/map.ts`
- Modify: `frontend/src/features/office/world/map.test.ts:1-5`
- Modify: `frontend/src/features/office/pc/desk.test.ts:1-6`
- Modify: `frontend/src/features/office/OfficeRoom.tsx:20,69`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `FloorDef { n: number; label: string; build?: () => OfficeMap }`; `FLOORS: FloorDef[]`; `floorDef(n: number): FloorDef | undefined`; `buildFloor(n: number): OfficeMap` (lança `Error` se o andar não existe ou não tem `build`); `buildFloor1(): OfficeMap`.

- [ ] **Step 1: Escrever o teste do registry**

Criar `frontend/src/features/office/world/floors/index.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { FLOORS, buildFloor, floorDef } from "./index"

describe("registry de andares", () => {
  it("lista quatro andares, numerados de 1 a 4 sem buraco", () => {
    expect(FLOORS.map((f) => f.n)).toEqual([1, 2, 3, 4])
  })

  it("só o andar 1 tem planta; os outros estão em obras", () => {
    expect(typeof floorDef(1)?.build).toBe("function")
    for (const n of [2, 3, 4]) expect(floorDef(n)?.build).toBeUndefined()
  })

  it("todo andar tem rótulo não vazio", () => {
    for (const f of FLOORS) expect(f.label.length).toBeGreaterThan(0)
  })

  it("buildFloor devolve o mapa do andar 1", () => {
    const map = buildFloor(1)
    expect(map.cols).toBeGreaterThan(0)
    expect(map.seats.length).toBeGreaterThan(0)
  })

  it("buildFloor recusa andar em obras e andar inexistente", () => {
    expect(() => buildFloor(2)).toThrow(/em obras/i)
    expect(() => buildFloor(99)).toThrow(/inexistente/i)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/floors/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 3: Mover a planta atual para `floors/floor1.ts`**

Criar `frontend/src/features/office/world/floors/floor1.ts` com **o conteúdo atual** de `map.ts` a partir de `const COLS = 60` até o fim de `buildOfficeMap()` — inclusive `idx`, `fill`, `room`, `seatId` e todos os `add`/`addPx`/`addSeat`. Só três mudanças:

1. cabeçalho e imports novos no topo:

```ts
// Planta do andar 1. Nesta task é a planta antiga movida sem alteração; a
// Task 8 substitui o corpo pelo bullpen novo.
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"
import type { LightSource, OfficeMap, PlacedProp, Seat, SeatKind, Zone } from "../map"
```

2. a função exportada muda de nome:

```ts
export function buildFloor1(): OfficeMap {
```

3. nada mais. O corpo é idêntico — se o diff mostrar mudança de coordenada, desfazer.

- [ ] **Step 4: Criar o registry**

Criar `frontend/src/features/office/world/floors/index.ts`:

```ts
// Registry de andares — o único lugar do código que lista os andares do prédio.
//
// Andar sem `build` está em obras: aparece travado no painel do elevador. É
// assim que o andar 2 entra depois, sem tocar no motor nem no elevador.
import type { OfficeMap } from "../map"

import { buildFloor1 } from "./floor1"

export interface FloorDef {
  /** 1-based — é o número que aparece no painel do elevador. */
  n: number
  label: string
  /** Ausente = em obras. */
  build?: () => OfficeMap
}

export const FLOORS: FloorDef[] = [
  { n: 1, label: "Bullpen", build: buildFloor1 },
  { n: 2, label: "Reunião" },
  { n: 3, label: "Copa e lounge" },
  { n: 4, label: "Foco" },
]

export function floorDef(n: number): FloorDef | undefined {
  return FLOORS.find((f) => f.n === n)
}

/** Planta do andar. Lança se o andar não existe ou está em obras. */
export function buildFloor(n: number): OfficeMap {
  const def = floorDef(n)
  if (!def) throw new Error(`Andar inexistente: ${n}`)
  if (!def.build) throw new Error(`Andar ${n} em obras`)
  return def.build()
}

export { buildFloor1 }
```

- [ ] **Step 5: Enxugar `map.ts`**

Em `frontend/src/features/office/world/map.ts`, apagar de `const COLS = 60` até o fechamento de `buildOfficeMap()`, preservando **apenas**: o comentário de cabeçalho, as interfaces (`PlacedProp`, `Zone`, `LightSource`, `Seat`, `OfficeMap`), o tipo `SeatKind`, e as funções `zoneAt` e `isSolid` no fim do arquivo. Ajustar o cabeçalho:

```ts
// Tipos e consultas da planta de um andar.
//
// A planta em si mora em `floors/` — este arquivo não constrói mapa nenhum. O
// motor lê `OfficeMap` e não sabe qual andar está desenhando.
```

Os imports `PROPS`/`PropKind`/`SOLID_TILES` deixam de ser usados aqui; manter apenas `import { TILE } from "./tiles"` (usado por `zoneAt` e `isSolid`).

- [ ] **Step 6: Apontar os consumidores para o novo nome**

Três substituições, todas de `buildOfficeMap` para `buildFloor1`:

```ts
// world/map.test.ts:3-5
import { buildFloor1 } from "./floors/floor1"
const map = buildFloor1()

// pc/desk.test.ts:3-6
import { buildFloor1 } from "../world/floors/floor1"
const map = buildFloor1()
```

Em `OfficeRoom.tsx`, trocar o import da linha 20 e o `useMemo` da linha 69:

```ts
import { buildFloor1 } from "./world/floors/floor1"
// ...
const map = useMemo(() => buildFloor1(), [])
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS em tudo que passava antes (o `__tmp-reach.test.ts` untracked continua falhando — ele é resolvido na Task 8; se ele estiver no diretório, rode `npx vitest run --exclude "**/__tmp-reach.test.ts"`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/office/world/floors frontend/src/features/office/world/map.ts \
        frontend/src/features/office/world/map.test.ts frontend/src/features/office/pc/desk.test.ts \
        frontend/src/features/office/OfficeRoom.tsx
git commit -m "refactor(office): planta sai de map.ts para o registry de andares"
```

---

### Task 2: Regras puras do elevador

**Files:**
- Create: `frontend/src/features/office/world/elevator.ts`
- Create: `frontend/src/features/office/world/elevator.test.ts`

**Interfaces:**
- Consumes: `FloorDef`, `FLOORS` da Task 1.
- Produces: `isUnlocked(def: FloorDef): boolean`; `canGoTo(floors: FloorDef[], from: number, to: number): boolean`; `FloorButton { n: number; label: string; locked: boolean; current: boolean }`; `floorButtons(floors: FloorDef[], current: number): FloorButton[]` (ordem do maior andar para o menor, como painel de elevador de verdade).

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/features/office/world/elevator.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { canGoTo, floorButtons, isUnlocked } from "./elevator"
import type { FloorDef } from "./floors"

const FAKE: FloorDef[] = [
  { n: 1, label: "Bullpen", build: () => ({}) as never },
  { n: 2, label: "Reunião" },
  { n: 3, label: "Copa", build: () => ({}) as never },
]

describe("isUnlocked", () => {
  it("libera andar com planta e trava andar sem planta", () => {
    expect(isUnlocked(FAKE[0])).toBe(true)
    expect(isUnlocked(FAKE[1])).toBe(false)
  })
})

describe("canGoTo", () => {
  it("aceita andar liberado diferente do atual", () => {
    expect(canGoTo(FAKE, 1, 3)).toBe(true)
  })

  it("recusa o andar em que já se está", () => {
    expect(canGoTo(FAKE, 1, 1)).toBe(false)
  })

  it("recusa andar em obras", () => {
    expect(canGoTo(FAKE, 1, 2)).toBe(false)
  })

  it("recusa andar que não existe", () => {
    expect(canGoTo(FAKE, 1, 9)).toBe(false)
  })
})

describe("floorButtons", () => {
  it("lista todos os andares do maior para o menor", () => {
    expect(floorButtons(FAKE, 1).map((b) => b.n)).toEqual([3, 2, 1])
  })

  it("marca o andar atual e os travados", () => {
    const buttons = floorButtons(FAKE, 1)
    expect(buttons.find((b) => b.n === 1)).toMatchObject({ current: true, locked: false })
    expect(buttons.find((b) => b.n === 2)).toMatchObject({ current: false, locked: true })
  })

  it("não perde nem duplica andar", () => {
    expect(floorButtons(FAKE, 1)).toHaveLength(FAKE.length)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/elevator.test.ts`
Expected: FAIL — `Failed to resolve import "./elevator"`.

- [ ] **Step 3: Implementar**

Criar `frontend/src/features/office/world/elevator.ts`:

```ts
// Regras do elevador, sem DOM.
//
// A decisão "posso ir para este andar?" fica aqui porque é a única parte do
// elevador que dá para provar em teste — o resto é pintura e transição.
import { type FloorDef } from "./floors"

/** Andar com planta registrada. Sem planta = em obras. */
export function isUnlocked(def: FloorDef): boolean {
  return typeof def.build === "function"
}

export function canGoTo(floors: FloorDef[], from: number, to: number): boolean {
  if (from === to) return false
  const def = floors.find((f) => f.n === to)
  return !!def && isUnlocked(def)
}

export interface FloorButton {
  n: number
  label: string
  locked: boolean
  current: boolean
}

/** Botões do painel, do andar mais alto para o mais baixo. */
export function floorButtons(floors: FloorDef[], current: number): FloorButton[] {
  return [...floors]
    .sort((a, b) => b.n - a.n)
    .map((f) => ({
      n: f.n,
      label: f.label,
      locked: !isUnlocked(f),
      current: f.n === current,
    }))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/office/world/elevator.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/office/world/elevator.ts frontend/src/features/office/world/elevator.test.ts
git commit -m "feat(office): regras puras do elevador com andares travados"
```

---

### Task 3: Store do andar atual

**Files:**
- Create: `frontend/src/features/office/world.store.ts`
- Create: `frontend/src/features/office/world.store.test.ts`

**Interfaces:**
- Consumes: `FLOORS` (Task 1), `canGoTo` (Task 2).
- Produces: `useWorldStore` com estado `{ floor: number; panelOpen: boolean }` e ações `openPanel()`, `closePanel()`, `goToFloor(n: number): boolean` (devolve `false` e não muda nada se a transição é inválida; ao aceitar, fecha o painel).

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/features/office/world.store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"

import { useWorldStore } from "./world.store"

const reset = () => useWorldStore.setState({ floor: 1, panelOpen: false })

describe("world.store", () => {
  beforeEach(reset)

  it("começa no andar 1 com o painel fechado", () => {
    expect(useWorldStore.getState().floor).toBe(1)
    expect(useWorldStore.getState().panelOpen).toBe(false)
  })

  it("abre e fecha o painel", () => {
    useWorldStore.getState().openPanel()
    expect(useWorldStore.getState().panelOpen).toBe(true)
    useWorldStore.getState().closePanel()
    expect(useWorldStore.getState().panelOpen).toBe(false)
  })

  it("recusa ir para andar em obras e mantém o andar atual", () => {
    useWorldStore.getState().openPanel()
    expect(useWorldStore.getState().goToFloor(2)).toBe(false)
    expect(useWorldStore.getState().floor).toBe(1)
    expect(useWorldStore.getState().panelOpen).toBe(true)
  })

  it("recusa ir para o andar em que já está", () => {
    expect(useWorldStore.getState().goToFloor(1)).toBe(false)
  })

  it("aceitar a troca fecha o painel", () => {
    // Simula um segundo andar liberado sem depender do registry real.
    useWorldStore.setState({ floor: 2, panelOpen: true })
    expect(useWorldStore.getState().goToFloor(1)).toBe(true)
    expect(useWorldStore.getState().floor).toBe(1)
    expect(useWorldStore.getState().panelOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world.store.test.ts`
Expected: FAIL — `Failed to resolve import "./world.store"`.

- [ ] **Step 3: Implementar**

Criar `frontend/src/features/office/world.store.ts`:

```ts
// Em que andar o usuário está, e o painel do elevador.
//
// Fica fora do engine de propósito: trocar de andar é remontar o engine com
// outro mapa, e quem manda nisso é o React.
import { create } from "zustand"

import { canGoTo } from "./world/elevator"
import { FLOORS } from "./world/floors"

interface WorldStore {
  floor: number
  panelOpen: boolean

  openPanel: () => void
  closePanel: () => void
  /** `false` = transição recusada; nada muda. */
  goToFloor: (n: number) => boolean
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  floor: 1,
  panelOpen: false,

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),

  goToFloor: (n) => {
    if (!canGoTo(FLOORS, get().floor, n)) return false
    set({ floor: n, panelOpen: false })
    return true
  },
}))
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/office/world.store.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/office/world.store.ts frontend/src/features/office/world.store.test.ts
git commit -m "feat(office): store do andar atual e do painel do elevador"
```

---

### Task 4: Tiles de vidro, deck e guarda-corpo

`T.WINDOW` sai. Entram quatro tiles, três deles com alfa — é o alfa que deixa a camada de céu aparecer atrás.

**Files:**
- Modify: `frontend/src/features/office/world/tiles.ts:35-51` (ids e `SOLID_TILES`), `:152-172` (troca `drawWindow`), `:203-213` (`PAINTERS`)
- Create: `frontend/src/features/office/world/tiles.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `T.GLASS`, `T.GLASS_DOOR`, `T.DECK`, `T.RAILING` (e `T.WINDOW` deixa de existir); `SOLID_TILES` passa a conter `VOID, WALL, WALL_TOP, WALL_V, GLASS, RAILING`; `ALPHA_TILES: Set<number>` = `{ GLASS, GLASS_DOOR, RAILING }` — tiles cujo pintor **não** preenche o fundo.

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/features/office/world/tiles.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { ALPHA_TILES, SOLID_TILES, T } from "./tiles"

describe("ids de tile", () => {
  it("não tem id duplicado", () => {
    const ids = Object.values(T)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("não existe mais tile de janela", () => {
    expect("WINDOW" in T).toBe(false)
  })
})

describe("colisão por tile", () => {
  it("vidro e guarda-corpo bloqueiam; porta de vidro e deck não", () => {
    expect(SOLID_TILES.has(T.GLASS)).toBe(true)
    expect(SOLID_TILES.has(T.RAILING)).toBe(true)
    expect(SOLID_TILES.has(T.GLASS_DOOR)).toBe(false)
    expect(SOLID_TILES.has(T.DECK)).toBe(false)
  })

  it("o vazio segue bloqueado — ninguém cai do prédio", () => {
    expect(SOLID_TILES.has(T.VOID)).toBe(true)
  })

  it("piso interno continua livre", () => {
    for (const id of [T.WOOD, T.CARPET, T.TILEFLOOR, T.DOORWAY]) {
      expect(SOLID_TILES.has(id)).toBe(false)
    }
  })
})

describe("tiles com alfa", () => {
  it("vidro, porta de vidro e guarda-corpo deixam o céu passar", () => {
    expect([...ALPHA_TILES].sort()).toEqual([T.GLASS, T.GLASS_DOOR, T.RAILING].sort())
  })

  it("piso e parede opacos não estão na lista", () => {
    for (const id of [T.WOOD, T.WALL, T.WALL_TOP, T.DECK]) {
      expect(ALPHA_TILES.has(id)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/tiles.test.ts`
Expected: FAIL — `ALPHA_TILES` não exportado e `T.GLASS` indefinido.

- [ ] **Step 3: Trocar ids e conjuntos**

Em `tiles.ts`, substituir o bloco `T` e o `SOLID_TILES` (linhas 35–51):

```ts
export const T = {
  VOID: 0,
  WOOD: 1,
  CARPET: 2,
  RUG: 3,
  TILEFLOOR: 4,
  WALL: 5,
  WALL_TOP: 6,
  DOORWAY: 7,
  WALL_V: 8,
  /** Vidro do piso ao teto: caixilho opaco, miolo transparente. */
  GLASS: 9,
  /** Igual ao vidro, com puxador e passável. */
  GLASS_DOOR: 10,
  /** Piso da varanda — tábuas no sol. */
  DECK: 11,
  /** Guarda-corpo: montantes com vão, céu aparece no meio. */
  RAILING: 12,
} as const

export type TileId = (typeof T)[keyof typeof T]

/** Tiles que bloqueiam passagem. */
export const SOLID_TILES = new Set<number>([
  T.VOID, T.WALL, T.WALL_TOP, T.WALL_V, T.GLASS, T.RAILING,
])

/**
 * Tiles cujo pintor NÃO preenche o fundo: os pixels vazios revelam a camada de
 * céu desenhada atrás do piso. Sem isso o vidro fica opaco e volta o efeito de
 * adesivo na parede.
 */
export const ALPHA_TILES = new Set<number>([T.GLASS, T.GLASS_DOOR, T.RAILING])
```

- [ ] **Step 4: Trocar os pintores**

Em `tiles.ts`, remover `drawWindow` inteira (linhas 152–172) e colocar no lugar:

```ts
const GLASS_FRAME = "#6b727a"
const GLASS_TINT = "rgba(190,222,240,0.16)"
const DECK_WOOD = "#b98d5f"

/**
 * Vidro do piso ao teto. Só caixilho, reflexo e véu leve são pintados — o resto
 * fica transparente para o céu aparecer, contínuo entre tiles vizinhos.
 */
function drawGlass(ctx: Ctx, v: number): void {
  rect(ctx, 0, 0, TILE, TILE, GLASS_TINT)
  // Montantes: só nas bordas, então dois tiles lado a lado formam um pano
  // contínuo em vez de uma grade de janelinhas.
  rect(ctx, 0, 0, 1, TILE, GLASS_FRAME)
  rect(ctx, 15, 0, 1, TILE, GLASS_FRAME)
  rect(ctx, 0, 0, TILE, 1, shade(GLASS_FRAME, 0.8))
  rect(ctx, 0, 15, TILE, 1, shade(GLASS_FRAME, 0.7))
  // Reflexo diagonal, deslocado por variação — quebra a repetição do tile.
  const off = v * 3
  for (let i = 0; i < 5; i++) {
    px(ctx, 3 + i + off - (off > 8 ? 9 : 0), 4 + i, "rgba(255,255,255,0.22)")
  }
}

function drawGlassDoor(ctx: Ctx, v: number): void {
  drawGlass(ctx, v)
  // Puxador vertical + soleira, para ler como porta e não como pano de vidro.
  rect(ctx, 11, 6, 1, 5, tint(COLORS.metal, 1.1))
  rect(ctx, 0, 14, TILE, 2, COLORS.metalDark)
}

/** Deck da varanda: tábuas no sentido da profundidade, mais claras (está no sol). */
function drawDeck(ctx: Ctx, v: number): void {
  const base = tint(DECK_WOOD, 1.06)
  rect(ctx, 0, 0, TILE, TILE, base)
  // Juntas VERTICAIS em x fixo — continuam de um tile ao seguinte.
  for (const x of [0, 5, 10, 15]) {
    rect(ctx, x, 0, 1, TILE, shade(base, 0.72))
    rect(ctx, x + 1, 0, 1, TILE, tint(base, 1.05))
  }
  for (let i = 0; i < 3; i++) {
    const gy = 2 + Math.floor(hash2(v, i, 13) * (TILE - 5))
    const band = Math.floor(hash2(i, v, 29) * 3)
    rect(ctx, band * 5 + 2, gy, 1, 2 + (i % 2), shade(base, 0.84))
  }
}

/** Guarda-corpo: corrimão contínuo + montantes com vão de céu entre eles. */
function drawRailing(ctx: Ctx, v: number): void {
  rect(ctx, 0, 3, TILE, 2, COLORS.metal)
  rect(ctx, 0, 3, TILE, 1, tint(COLORS.metal, 1.18))
  rect(ctx, 0, 10, TILE, 1, COLORS.metalDark)
  // Dois montantes por tile: passo de 8 px mantém o ritmo entre tiles vizinhos.
  for (const x of [3, 11]) rect(ctx, x, 5, 1, 8, COLORS.metalDark)
  // Base: onde o guarda-corpo encontra o deck.
  rect(ctx, 0, 13, TILE, 1, shade(DECK_WOOD, 0.7))
  if (v % 2 === 0) px(ctx, 7, 4, "rgba(255,255,255,0.3)")
}
```

Trocar o mapa `PAINTERS` (linhas 203–213):

```ts
const PAINTERS: Record<number, (ctx: Ctx, v: number) => void> = {
  [T.WOOD]: drawWood,
  [T.CARPET]: drawCarpet,
  [T.RUG]: drawRug,
  [T.TILEFLOOR]: drawTileFloor,
  [T.WALL]: drawWall,
  [T.WALL_TOP]: drawWallTop,
  [T.DOORWAY]: drawDoorway,
  [T.WALL_V]: drawWallV,
  [T.GLASS]: drawGlass,
  [T.GLASS_DOOR]: drawGlassDoor,
  [T.DECK]: drawDeck,
  [T.RAILING]: drawRailing,
}
```

- [ ] **Step 5: Ajustar a única referência restante a `T.WINDOW`**

Em `world/engine.ts:167`, dentro de `bakeGround`, a sombra projetada testa `T.WINDOW`. Trocar por vidro:

```ts
        const wallHere = here === T.WALL || here === T.WALL_TOP || here === T.GLASS
```

Confirmar que não sobrou nenhuma:

Run: `cd frontend && grep -rn "T.WINDOW\|WINDOW:" src/`
Expected: nenhuma saída.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/office/world/tiles.test.ts && npx tsc --noEmit`
Expected: PASS — 7 testes; typecheck limpo. Se `floors/floor1.ts` (planta antiga movida na Task 1) referenciava `T.WINDOW`, trocar essas linhas por `T.GLASS` — a planta antiga é substituída na Task 8 de qualquer forma.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/office/world/tiles.ts frontend/src/features/office/world/tiles.test.ts \
        frontend/src/features/office/world/engine.ts frontend/src/features/office/world/floors/floor1.ts
git commit -m "feat(office): tiles de vidro, deck e guarda-corpo com alfa para o céu"
```

---

### Task 5: Camada de céu com paralaxe

**Files:**
- Create: `frontend/src/features/office/world/sky.ts`
- Create: `frontend/src/features/office/world/sky.test.ts`

**Interfaces:**
- Consumes: `hash2`, `makeCanvas`, `mix`, `rect`, `px` de `world/pixels.ts`.
- Produces:
  - `SKY_PARALLAX = { far: 0.08, near: 0.15, clouds: 0.05 }` (readonly)
  - `CLOUD_DRIFT_PX_PER_S = 2`
  - `SkyLayers { sky, far, near, clouds }` (todos `HTMLCanvasElement`), `SKY_STRIP_W = 512`, `SKY_STRIP_H = 256`
  - `buildSky(seed?: number): SkyLayers` — **usa canvas, não é testada**
  - `skyOffset(factor: number, cam: number): number` — pura
  - `cloudOffset(cam: number, elapsedSec: number, stripW?: number): number` — pura, com loop
  - `layerRect(factor, camX, camY, viewW, viewH, stripW?, stripH?): { sx, sy, sw, sh }` — pura: recorte da faixa para o frame

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/features/office/world/sky.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { CLOUD_DRIFT_PX_PER_S, SKY_PARALLAX, SKY_STRIP_W, cloudOffset, layerRect, skyOffset } from "./sky"

describe("SKY_PARALLAX", () => {
  it("respeita a ordem de profundidade: nuvem < longe < perto", () => {
    expect(SKY_PARALLAX.clouds).toBeLessThan(SKY_PARALLAX.far)
    expect(SKY_PARALLAX.far).toBeLessThan(SKY_PARALLAX.near)
  })

  it("nenhuma camada acompanha a câmera de um para um — senão não há profundidade", () => {
    for (const f of Object.values(SKY_PARALLAX)) {
      expect(f).toBeGreaterThan(0)
      expect(f).toBeLessThan(1)
    }
  })
})

describe("skyOffset", () => {
  it("cresce com a câmera", () => {
    expect(skyOffset(0.15, 200)).toBeGreaterThan(skyOffset(0.15, 100))
  })

  it("a camada distante desloca menos que a próxima na mesma câmera", () => {
    expect(skyOffset(SKY_PARALLAX.far, 400)).toBeLessThan(skyOffset(SKY_PARALLAX.near, 400))
  })

  it("devolve inteiro — meio pixel borra o upscale", () => {
    expect(Number.isInteger(skyOffset(0.08, 333))).toBe(true)
  })

  it("câmera na origem não desloca", () => {
    expect(skyOffset(0.15, 0)).toBe(0)
  })
})

describe("cloudOffset", () => {
  it("deriva com o tempo mesmo com câmera parada", () => {
    expect(cloudOffset(0, 10)).toBeGreaterThan(cloudOffset(0, 0))
  })

  it("usa a taxa de deriva declarada", () => {
    expect(cloudOffset(0, 10) - cloudOffset(0, 0)).toBe(10 * CLOUD_DRIFT_PX_PER_S)
  })

  it("volta ao início ao passar da largura da faixa — loop sem salto", () => {
    const oneLoop = SKY_STRIP_W / CLOUD_DRIFT_PX_PER_S
    expect(cloudOffset(0, oneLoop)).toBe(cloudOffset(0, 0))
  })

  it("nunca sai do intervalo [0, largura)", () => {
    for (const t of [0, 1, 99, 1234, 98765]) {
      const v = cloudOffset(120, t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(SKY_STRIP_W)
    }
  })
})

describe("layerRect", () => {
  it("o recorte tem o tamanho da viewport", () => {
    const r = layerRect(SKY_PARALLAX.near, 100, 40, 320, 200)
    expect(r.sw).toBe(320)
    expect(r.sh).toBe(200)
  })

  it("o recorte nunca começa fora da faixa", () => {
    for (const cam of [0, 500, 5000, 50000]) {
      const r = layerRect(SKY_PARALLAX.near, cam, cam, 320, 200)
      expect(r.sx).toBeGreaterThanOrEqual(0)
      expect(r.sx).toBeLessThan(SKY_STRIP_W)
      expect(r.sy).toBeGreaterThanOrEqual(0)
    }
  })

  it("andar para a direita move o recorte para a direita", () => {
    const a = layerRect(SKY_PARALLAX.near, 0, 0, 320, 200)
    const b = layerRect(SKY_PARALLAX.near, 600, 0, 320, 200)
    expect(b.sx).toBeGreaterThan(a.sx)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/sky.test.ts`
Expected: FAIL — `Failed to resolve import "./sky"`.

- [ ] **Step 3: Implementar**

Criar `frontend/src/features/office/world/sky.ts`:

```ts
// Céu e cidade atrás do vidro.
//
// Três faixas pintadas uma vez em canvas offscreen e depois só blitadas por
// frame, cada uma deslocando uma fração da câmera. É essa fração diferente por
// camada que o olho lê como distância — e é o que faltava quando cada janela
// era um tile com um céu próprio dentro.
//
// A matemática mora em funções puras porque jsdom não tem canvas: o que dá para
// provar em teste é o deslocamento, não o desenho.
import { type Ctx, hash2, makeCanvas, mix, px, rect } from "./pixels"

/** Fração da câmera que cada camada acompanha. Menor = mais longe. */
export const SKY_PARALLAX = {
  clouds: 0.05,
  far: 0.08,
  near: 0.15,
} as const

/** Deriva horizontal das nuvens, independente da câmera. */
export const CLOUD_DRIFT_PX_PER_S = 2

/** Faixa larga o bastante para cobrir a viewport na maior escala útil. */
export const SKY_STRIP_W = 512
export const SKY_STRIP_H = 256

export interface SkyLayers {
  sky: HTMLCanvasElement
  far: HTMLCanvasElement
  near: HTMLCanvasElement
  clouds: HTMLCanvasElement
}

// ── Matemática (pura, testável) ─────────────────────────────────────────────

/** Deslocamento de uma camada para a posição de câmera dada. */
export function skyOffset(factor: number, cam: number): number {
  return Math.round(cam * factor)
}

/** Deslocamento das nuvens: paralaxe + deriva, em loop na largura da faixa. */
export function cloudOffset(cam: number, elapsedSec: number, stripW = SKY_STRIP_W): number {
  const raw = skyOffset(SKY_PARALLAX.clouds, cam) + elapsedSec * CLOUD_DRIFT_PX_PER_S
  const wrapped = raw % stripW
  return Math.round(wrapped < 0 ? wrapped + stripW : wrapped)
}

/** Recorte da faixa a blitar neste frame, já em loop dentro dela. */
export function layerRect(
  factor: number,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  stripW = SKY_STRIP_W,
  stripH = SKY_STRIP_H,
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = skyOffset(factor, camX) % stripW
  const sy = Math.min(Math.max(0, skyOffset(factor, camY)), Math.max(0, stripH - viewH))
  return {
    sx: sx < 0 ? sx + stripW : sx,
    sy,
    sw: viewW,
    sh: viewH,
  }
}

// ── Pintura (canvas, não testada) ───────────────────────────────────────────

const SKY_TOP = "#4f7fb0"
const SKY_MID = "#7ea9c9"
const SKY_LOW = "#b7cfdd"
const SKY_HAZE = "#d8e4e6"

/** Silhueta de torre: bloco com topo recortado e, opcionalmente, janelas. */
function tower(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  windows: boolean,
  seed: number,
): void {
  rect(ctx, x, y, w, h, color)
  rect(ctx, x, y, w, 1, mix(color, "#ffffff", 0.18))
  // Caixa d'água / antena no topo, alternando por hash — silhueta irregular é
  // o que impede a skyline de virar gráfico de barras.
  const cap = hash2(x, seed, 3)
  if (cap > 0.66) rect(ctx, x + Math.floor(w / 3), y - 3, Math.max(2, w - 6), 3, color)
  else if (cap > 0.33) rect(ctx, x + Math.floor(w / 2), y - 5, 1, 5, color)
  if (!windows) return
  const lit = mix(color, "#ffe6bd", 0.5)
  for (let wy = y + 3; wy < y + h - 2; wy += 4) {
    for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      if (hash2(wx, wy, seed) > 0.62) px(ctx, wx, wy, lit)
    }
  }
}

function drawSkyGradient(ctx: Ctx): void {
  const bands: [string, number][] = [
    [SKY_TOP, 0],
    [mix(SKY_TOP, SKY_MID, 0.5), 0.28],
    [SKY_MID, 0.5],
    [SKY_LOW, 0.72],
    [SKY_HAZE, 0.9],
  ]
  bands.forEach(([color, at], i) => {
    const y = Math.floor(at * SKY_STRIP_H)
    const next = i + 1 < bands.length ? Math.floor(bands[i + 1][1] * SKY_STRIP_H) : SKY_STRIP_H
    rect(ctx, 0, y, SKY_STRIP_W, next - y, color)
  })
  // Halo do sol, alto e à direita.
  const sun = mix(SKY_TOP, "#ffe9c0", 0.55)
  for (let r = 26; r > 0; r -= 6) {
    rect(ctx, 380 - r, 40 - r, r * 2, r * 2, mix(SKY_TOP, sun, 0.3 + (26 - r) / 60))
  }
}

/** Uma faixa de skyline. `near` decide altura, cor e se tem janela acesa. */
function drawSkyline(ctx: Ctx, near: boolean, seed: number): void {
  const baseY = near ? 168 : 196
  const color = near ? mix("#3f5a72", SKY_HAZE, 0.25) : mix("#3f5a72", SKY_HAZE, 0.55)
  let x = -6
  let i = 0
  while (x < SKY_STRIP_W + 6) {
    const w = near ? 14 + Math.floor(hash2(i, seed, 7) * 16) : 10 + Math.floor(hash2(i, seed, 11) * 12)
    const h = near ? 30 + Math.floor(hash2(i, seed, 13) * 62) : 18 + Math.floor(hash2(i, seed, 17) * 34)
    tower(ctx, x, baseY - h, w, h + 60, color, near, seed + i)
    x += w + (near ? 3 : 2)
    i++
  }
}

function cloud(ctx: Ctx, x: number, y: number, w: number, seed: number): void {
  const body = "rgba(255,255,255,0.82)"
  const under = "rgba(214,229,238,0.8)"
  rect(ctx, x + 3, y + 2, w - 6, 4, body)
  rect(ctx, x, y + 5, w, 4, body)
  rect(ctx, x + 2, y + 9, w - 4, 2, under)
  const bump = 4 + Math.floor(hash2(x, seed, 19) * (w - 10))
  rect(ctx, x + bump, y, 6, 3, body)
}

/**
 * Pinta as quatro faixas. Uma chamada por montagem de andar; depois é só blit.
 * Semente fixa: a cidade tem de ser a mesma para todos no workspace.
 */
export function buildSky(seed = 20260726): SkyLayers {
  const sky = makeCanvas(SKY_STRIP_W, SKY_STRIP_H)
  drawSkyGradient(sky.ctx)

  const far = makeCanvas(SKY_STRIP_W, SKY_STRIP_H)
  drawSkyline(far.ctx, false, seed)

  const near = makeCanvas(SKY_STRIP_W, SKY_STRIP_H)
  drawSkyline(near.ctx, true, seed + 977)

  const clouds = makeCanvas(SKY_STRIP_W, SKY_STRIP_H)
  // Cinco nuvens em duas alturas. A faixa é blitada em loop, então a nuvem que
  // sai pela direita reaparece pela esquerda sem costura visível.
  const spec: [number, number, number][] = [
    [20, 26, 34],
    [140, 54, 26],
    [250, 18, 42],
    [330, 62, 30],
    [430, 34, 28],
  ]
  for (const [x, y, w] of spec) cloud(clouds.ctx, x, y, w, seed)

  return { sky: sky.canvas, far: far.canvas, near: near.canvas, clouds: clouds.canvas }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/office/world/sky.test.ts`
Expected: PASS — 13 testes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/office/world/sky.ts frontend/src/features/office/world/sky.test.ts
git commit -m "feat(office): camada de céu com skyline e nuvens em paralaxe"
```

---

### Task 6: Props do bullpen

Sete props novos. `cubicle` é o central: mesa em L com divisória de três lados e **abertura para o corredor** — a colisão precisa deixar essa abertura livre, senão o assento fica ilhado (é exatamente o bug que a sonda `__tmp-reach` pegou na planta antiga).

**Files:**
- Modify: `frontend/src/features/office/world/props.ts` (adicionar ao objeto `PROPS`, antes do fechamento)
- Create: `frontend/src/features/office/world/props.test.ts`

**Interfaces:**
- Consumes: `PROPS`, `PropDef`, `tabletop`, `legs`, `monitor`, `keyboard`, `mug` (helpers já existentes no arquivo), `COLORS`, `INK`, `TILE`, e `chamfer`/`outline`/`rect`/`px`/`shade`/`tint`/`mix`/`hash2` de `pixels.ts`.
- Produces: `PropKind` ganha `cubicle`, `cubicleFlip`, `copier`, `filingCabinet`, `coatRack`, `noticeBoard`, `receptionDesk`, `elevatorDoors`. `cubicle` mede 64×48 px (4×3 tiles), colisão `{ x: 0, y: 0, w: 64, h: 34 }`, baseline 46, abertura na base (sul). `cubicleFlip` é o mesmo espelhado no eixo Y — abertura no topo (norte) — para formar o par de costas.

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/features/office/world/props.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { PROPS, type PropKind } from "./props"
import { TILE } from "./tiles"

const NOVOS: PropKind[] = [
  "cubicle", "cubicleFlip", "copier", "filingCabinet",
  "coatRack", "noticeBoard", "receptionDesk", "elevatorDoors",
]

describe("props novos do bullpen", () => {
  it("todos existem", () => {
    for (const k of NOVOS) expect(PROPS[k]).toBeDefined()
  })

  it("todo prop tem tamanho positivo e baseline dentro da altura", () => {
    for (const k of NOVOS) {
      const p = PROPS[k]
      expect(p.w).toBeGreaterThan(0)
      expect(p.h).toBeGreaterThan(0)
      expect(p.baseline ?? p.h).toBeLessThanOrEqual(p.h)
    }
  })

  it("colisão declarada cabe dentro do sprite", () => {
    for (const k of NOVOS) {
      const p = PROPS[k]
      if (!p.solid) continue
      expect(p.solid.x + p.solid.w).toBeLessThanOrEqual(p.w)
      expect(p.solid.y + p.solid.h).toBeLessThanOrEqual(p.h)
    }
  })
})

describe("baia", () => {
  it("ocupa 4×3 tiles", () => {
    expect(PROPS.cubicle.w).toBe(4 * TILE)
    expect(PROPS.cubicle.h).toBe(3 * TILE)
  })

  it("deixa a faixa de baixo livre — é por onde se entra na baia", () => {
    const solid = PROPS.cubicle.solid!
    const livre = PROPS.cubicle.h - (solid.y + solid.h)
    expect(livre).toBeGreaterThanOrEqual(TILE - 2)
  })

  it("a versão espelhada deixa a faixa de CIMA livre", () => {
    const solid = PROPS.cubicleFlip.solid!
    expect(solid.y).toBeGreaterThanOrEqual(TILE - 2)
  })

  it("as duas versões têm o mesmo tamanho, para encostarem de costas", () => {
    expect(PROPS.cubicleFlip.w).toBe(PROPS.cubicle.w)
    expect(PROPS.cubicleFlip.h).toBe(PROPS.cubicle.h)
  })
})

describe("portas do elevador", () => {
  it("ocupam a largura da cabine (4 tiles) e bloqueiam", () => {
    expect(PROPS.elevatorDoors.w).toBe(4 * TILE)
    expect(PROPS.elevatorDoors.solid).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/props.test.ts`
Expected: FAIL — `PROPS.cubicle` undefined.

- [ ] **Step 3: Implementar os props**

Em `props.ts`, adicionar **dentro** do objeto `PROPS`, logo antes do `}` que o fecha (depois de `partition`). Antes deles, junto às outras constantes do topo do arquivo, acrescentar:

```ts
const PANEL = "#8f9a8c"
const PANEL_D = shade(PANEL, 0.78)
const STEEL = "#9aa0a8"
```

```ts
  /**
   * Baia em U: mesa em L com divisória de três lados na altura do peito e
   * abertura para o corredor ao SUL. A bagunça de mesa é sorteada por hash da
   * posição na hora de desenhar o sprite, então duas baias nunca ficam iguais.
   */
  cubicle: {
    w: 64,
    h: 48,
    // A faixa de baixo (14 px) fica livre: é a entrada da baia.
    solid: { x: 0, y: 0, w: 64, h: 34 },
    baseline: 46,
    draw(ctx) {
      // Divisória: fundo + duas laterais, aberta na frente.
      rect(ctx, 0, 0, 64, 12, PANEL)
      rect(ctx, 0, 0, 64, 1, tint(PANEL, 1.15))
      rect(ctx, 0, 10, 64, 2, PANEL_D)
      rect(ctx, 0, 0, 4, 40, PANEL)
      rect(ctx, 60, 0, 4, 40, PANEL)
      rect(ctx, 0, 38, 4, 2, PANEL_D)
      rect(ctx, 60, 38, 4, 2, PANEL_D)
      outline(ctx, 0, 0, 64, 12, INK)
      for (let x = 6; x < 58; x += 4) rect(ctx, x, 2, 1, 8, shade(PANEL, 0.9))
      // Tampo em L encostado na divisória do fundo.
      legs(ctx, 8, 30, 48, 6)
      tabletop(ctx, 5, 12, 54, 20)
      // Equipamento: monitor no fundo, teclado na frente, caneca ao lado.
      monitor(ctx, 12, 4, true)
      keyboard(ctx, 14, 22)
      mug(ctx, 44, 20)
      // Bagunça determinística: papel, porta-lápis e post-it no painel.
      if (hash2(1, 7, 31) > 0.4) {
        rect(ctx, 38, 24, 7, 5, "#e8e2d2")
        rect(ctx, 38, 24, 7, 1, "#cfc7b4")
      }
      if (hash2(2, 9, 31) > 0.5) {
        rect(ctx, 50, 22, 4, 6, "#6b5540")
        rect(ctx, 51, 20, 1, 3, "#c8a24a")
        rect(ctx, 53, 20, 1, 3, "#4a6fa5")
      }
      rect(ctx, 30, 3, 5, 4, "#e8d24a")
      rect(ctx, 24, 5, 4, 3, "#9ad2c0")
      // Sombra de contato.
      rect(ctx, 4, 39, 56, 1, "rgba(43,30,26,0.25)")
    },
  },

  /** Mesma baia com a abertura ao NORTE — forma o par encostado de costas. */
  cubicleFlip: {
    w: 64,
    h: 48,
    solid: { x: 0, y: 14, w: 64, h: 34 },
    baseline: 47,
    draw(ctx) {
      rect(ctx, 0, 36, 64, 12, PANEL)
      rect(ctx, 0, 36, 64, 1, tint(PANEL, 1.15))
      rect(ctx, 0, 46, 64, 2, PANEL_D)
      rect(ctx, 0, 8, 4, 40, PANEL)
      rect(ctx, 60, 8, 4, 40, PANEL)
      outline(ctx, 0, 36, 64, 12, INK)
      for (let x = 6; x < 58; x += 4) rect(ctx, x, 38, 1, 8, shade(PANEL, 0.9))
      legs(ctx, 8, 30, 48, 6)
      tabletop(ctx, 5, 16, 54, 18)
      monitor(ctx, 38, 20, false)
      keyboard(ctx, 14, 26)
      mug(ctx, 30, 24, "#5a8a6b")
      if (hash2(3, 11, 31) > 0.45) {
        rect(ctx, 20, 20, 8, 5, "#e8e2d2")
        rect(ctx, 20, 20, 8, 1, "#cfc7b4")
      }
      rect(ctx, 8, 39, 5, 4, "#d98f6b")
      rect(ctx, 4, 34, 56, 1, "rgba(43,30,26,0.25)")
    },
  },

  copier: {
    w: 32,
    h: 32,
    solid: { x: 0, y: 8, w: 32, h: 20 },
    baseline: 30,
    draw(ctx) {
      chamfer(ctx, 2, 6, 28, 22, STEEL)
      outline(ctx, 2, 6, 28, 22, INK)
      rect(ctx, 4, 8, 24, 5, shade(STEEL, 0.72)) // tampa
      rect(ctx, 5, 9, 22, 1, tint(STEEL, 1.15))
      rect(ctx, 6, 15, 20, 4, "#3b444d") // painel
      rect(ctx, 8, 16, 3, 2, "#7fb2d9")
      rect(ctx, 13, 16, 2, 2, "#8fd9b5")
      rect(ctx, 5, 21, 22, 5, shade(STEEL, 0.84)) // gaveta de papel
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
      chamfer(ctx, 1, 6, 14, 20, shade(STEEL, 0.9))
      outline(ctx, 1, 6, 14, 20, INK)
      for (const y of [8, 14, 20]) {
        rect(ctx, 2, y, 12, 5, STEEL)
        rect(ctx, 2, y, 12, 1, tint(STEEL, 1.12))
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
      // Papéis pregados, em posições fixas por hash — nunca alinhados.
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
    w: 64,
    h: 40,
    solid: { x: 0, y: 0, w: 64, h: 36 },
    baseline: 38,
    draw(ctx) {
      // Moldura + duas folhas com junta no meio.
      rect(ctx, 0, 0, 64, 36, shade(STEEL, 0.7))
      rect(ctx, 3, 3, 58, 30, STEEL)
      rect(ctx, 3, 3, 58, 1, tint(STEEL, 1.2))
      rect(ctx, 31, 3, 2, 30, shade(STEEL, 0.62))
      for (let x = 7; x < 60; x += 5) {
        if (x > 28 && x < 36) continue
        rect(ctx, x, 6, 1, 24, shade(STEEL, 0.86))
      }
      outline(ctx, 0, 0, 64, 36, INK)
      // Indicador aceso acima da porta.
      rect(ctx, 26, -0, 12, 3, "#2f363d")
      rect(ctx, 29, 1, 2, 1, "#e8d24a")
      rect(ctx, 33, 1, 2, 1, "#3b444d")
      rect(ctx, 2, 37, 60, 1, "rgba(43,30,26,0.25)")
    },
  },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/office/world/props.test.ts && npx tsc --noEmit`
Expected: PASS — 8 testes; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/office/world/props.ts frontend/src/features/office/world/props.test.ts
git commit -m "feat(office): baia em U, copiadora, arquivo e balcão de recepção"
```

---

### Task 7: Clipe de animação `lean`

Assento de guarda-corpo precisa de pose própria: de costas, apoiado. O parâmetro `lean` já existe em `poseFor`; falta o clipe.

**Files:**
- Modify: `frontend/src/features/avatar/avatar.types.ts:89-110`
- Modify: `frontend/src/features/avatar/chibi.ts` (função `poseFor`, junto aos outros `case`)
- Create: `frontend/src/features/avatar/avatar.anims.test.ts`

**Interfaces:**
- Consumes: `ANIMS`, `ANIM_LABELS`, `ANIM_FPS`, `poseFor`.
- Produces: `ANIMS.lean = 4`, `ANIM_LABELS.lean = "Apoiado"`, `ANIM_FPS.lean = 3`.

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/features/avatar/avatar.anims.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { ANIMS, ANIM_FPS, ANIM_LABELS } from "./avatar.types"

describe("clipe lean", () => {
  it("está registrado com frames, rótulo e fps", () => {
    expect(ANIMS.lean).toBeGreaterThan(0)
    expect(ANIM_LABELS.lean).toBe("Apoiado")
    expect(ANIM_FPS.lean).toBeGreaterThan(0)
  })

  it("é lento — apoiar no guarda-corpo não é agitado", () => {
    expect(ANIM_FPS.lean).toBeLessThanOrEqual(4)
  })

  it("todo clipe com fps declarado existe em ANIMS", () => {
    for (const name of Object.keys(ANIM_FPS)) expect(ANIMS[name]).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/avatar/avatar.anims.test.ts`
Expected: FAIL — `expected undefined to be greater than 0`.

- [ ] **Step 3: Registrar o clipe**

Em `avatar.types.ts`, na linha do bloco `ANIMS` que termina com `celebrate: 6,`, acrescentar `lean: 4,`. Em `ANIM_LABELS`, acrescentar `lean: "Apoiado",`. Em `ANIM_FPS`, acrescentar `lean: 3,`.

- [ ] **Step 4: Implementar a pose**

Em `chibi.ts`, dentro do `switch` de `poseFor`, ao lado do `case "type"`:

```ts
    // Apoiado no guarda-corpo: tronco inclinado para frente, braços na barra,
    // respiração de 4 frames — quase parado, só o peso trocando de pé.
    case "lean": return [
      { lean: 2, armL: 1, armR: 1 },
      { lean: 2, armL: 1, armR: 1, body: 1 },
      { lean: 3, armL: 2, armR: 1 },
      { lean: 2, armL: 1, armR: 2, body: 1 },
    ][f % 4]
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/avatar/ && npx tsc --noEmit`
Expected: PASS — testes de avatar existentes + 3 novos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/avatar/avatar.types.ts frontend/src/features/avatar/chibi.ts \
        frontend/src/features/avatar/avatar.anims.test.ts
git commit -m "feat(avatar): clipe lean para apoiar no guarda-corpo"
```

---

### Task 8: Planta do andar 1

O coração do plano. Substitui o corpo de `floor1.ts` pelo bullpen: 72×46 tiles, 8 clusters de baia, fachada de vidro em L, deck em L na quina sudeste, hall do elevador a oeste. Os testes de invariante vêm antes.

**Files:**
- Modify: `frontend/src/features/office/world/floors/floor1.ts` (corpo inteiro)
- Create: `frontend/src/features/office/world/floors/floor1.test.ts`
- Delete: `frontend/src/features/office/world/__tmp-reach.test.ts`
- Modify: `frontend/src/features/office/world/map.ts` (`SeatKind`)

**Interfaces:**
- Consumes: `T`, `TILE`, `SOLID_TILES` (Task 4); `PROPS` (Task 6); tipos de `map.ts`.
- Produces: `buildFloor1(): OfficeMap` com `cols: 72`, `rows: 46`; 16 assentos `kind: "pc"`; assentos `kind: "view"` no guarda-corpo; zonas `bullpen`, `reception`, `elevator`, `terrace`. `SeatKind = "pc" | "meeting" | "lounge" | "view"`.

- [ ] **Step 1: Escrever os testes de invariante**

Criar `frontend/src/features/office/world/floors/floor1.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { isSolid } from "../map"
import { T, TILE } from "../tiles"
import { buildFloor1 } from "./floor1"

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
```

Acrescentar no topo do arquivo de teste, junto aos imports:

```ts
import { T as TILES } from "../tiles"

/** Vizinhos aceitáveis para um tile de deck além de deck e guarda-corpo. */
const SOLID_OK = new Set<number>([TILES.WALL, TILES.WALL_TOP, TILES.WALL_V, TILES.GLASS, TILES.GLASS_DOOR])
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/floors/floor1.test.ts`
Expected: FAIL — `expected [ 60, 38 ] to deeply equal [ 72, 46 ]` (a planta ainda é a antiga).

- [ ] **Step 3: Permitir o assento de vista no tipo**

Em `world/map.ts`:

```ts
/** "pc" tem computador; "view" é o guarda-corpo da varanda. */
export type SeatKind = "pc" | "meeting" | "lounge" | "view"
```

- [ ] **Step 4: Escrever a planta nova**

Substituir **todo** o conteúdo de `frontend/src/features/office/world/floors/floor1.ts`:

```ts
// Andar 1 — bullpen.
//
// Galpão de trabalho único, no espírito de The Office: duas fileiras de baias
// em U em pares encostados de costas, hall do elevador a oeste e fachada de
// vidro em L (sul e leste) do piso ao teto. A varanda em deck fecha a quina
// sudeste, e o que está fora do envelope do prédio é T.VOID — ali só se vê a
// camada de céu.
//
// A planta é dado, não desenho: o motor lê tile, prop, zona, luz e assento sem
// saber o que é "baia".
import type { LightSource, OfficeMap, PlacedProp, Seat, SeatKind, Zone } from "../map"
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"

const COLS = 72
const ROWS = 46

// Envelope do prédio. Fora daqui é céu.
const B = { x: 0, y: 0, w: 56, h: 38 }

// Deck em L, fechando a quina sudeste.
const DECK_S = { x: 20, y: 38, w: 36, h: 6 }
const DECK_E = { x: 56, y: 20, w: 8, h: 24 }

// Porta de vidro na fachada sul.
const DOOR = { x: 28, w: 3 }

// Clusters de baia: 2 fileiras × 4 colunas, passo 8 em x e 14 em y.
const CUBICLE_COLS = [16, 24, 32, 40]
const CUBICLE_ROWS = [6, 20]

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

  // ── Envelope ──────────────────────────────────────────────────────────────
  room(floor, B.x, B.y, B.w, B.h, T.WOOD)

  // Hall do elevador: ladrilho, encostado na parede oeste.
  fill(floor, 1, 2, 10, 12, T.TILEFLOOR)

  // Fachada de vidro sul (do piso ao teto) com a porta no meio.
  fill(floor, 6, B.h - 1, 48, 1, T.GLASS)
  fill(floor, DOOR.x, B.h - 1, DOOR.w, 1, T.GLASS_DOOR)

  // Fachada de vidro leste.
  fill(floor, B.w - 1, 4, 1, 32, T.GLASS)

  // ── Varanda ───────────────────────────────────────────────────────────────
  fill(floor, DECK_S.x, DECK_S.y, DECK_S.w, DECK_S.h, T.DECK)
  fill(floor, DECK_E.x, DECK_E.y, DECK_E.w, DECK_E.h, T.DECK)

  // Guarda-corpo em todo o perímetro externo do deck. Fazer isto por varredura,
  // e não à mão, é o que garante que não sobra vão para cair — testado.
  const isDeck = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < COLS && y < ROWS && floor[idx(x, y)] === T.DECK
  const railing: [number, number][] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!isDeck(x, y)) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const ny = y + dy
        const fora =
          nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || floor[idx(nx, ny)] === T.VOID
        if (fora) railing.push([nx, ny])
      }
    }
  }
  for (const [x, y] of railing) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) floor[idx(x, y)] = T.RAILING
  }

  // ── Colisão a partir do tile ──────────────────────────────────────────────
  const collision = new Uint8Array(COLS * ROWS)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      collision[idx(x, y)] = SOLID_TILES.has(floor[idx(x, y)]) ? 1 : 0
    }
  }

  // ── Móveis ────────────────────────────────────────────────────────────────
  const props: PlacedProp[] = []
  const add = (kind: PropKind, tx: number, ty: number) =>
    props.push({ kind, x: tx * TILE, y: ty * TILE })

  // Baias: cada cluster são duas baias de costas — a de cima abre para o
  // corredor de cima, a de baixo para o de baixo.
  for (const ty of CUBICLE_ROWS) {
    for (const tx of CUBICLE_COLS) {
      add("cubicle", tx, ty)
      add("cubicleFlip", tx, ty + 3)
    }
  }

  // Hall e recepção.
  add("elevatorDoors", 2, 2)
  add("receptionDesk", 7, 7)
  add("coatRack", 1, 11)
  add("noticeBoard", 8, 2)

  // Serviço do bullpen, encostado nas paredes.
  add("copier", 50, 3)
  add("filingCabinet", 49, 6)
  add("filingCabinet", 50, 6)
  add("waterCooler", 13, 3)
  add("plant", 12, 34)
  add("plant", 52, 33)
  add("plant", 14, 16)
  add("bookshelf", 47, 33)
  add("lamp", 30, 3)
  add("lamp", 30, 33)

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

  // A porta de vidro volta a ser passável mesmo se um prop encostou nela.
  fill(collision, DOOR.x, B.h - 1, DOOR.w, 1, 0)

  // ── Zonas ─────────────────────────────────────────────────────────────────
  const zones: Zone[] = [
    {
      id: "elevator",
      label: "Elevador",
      x: 2, y: 2, w: 4, h: 4,
      accent: "#8a93a0",
      hint: "Aperte E para escolher o andar",
    },
    {
      id: "reception",
      label: "Recepção",
      x: 6, y: 6, w: 6, h: 6,
      accent: "#c9a04a",
      hint: "Entrada do andar",
    },
    {
      id: "bullpen",
      label: "Bullpen",
      x: 13, y: 2, w: 40, h: 34,
      accent: "#5d8a52",
      hint: "Estação de trabalho",
    },
    {
      id: "terrace",
      label: "Varanda",
      x: DECK_S.x, y: DECK_S.y, w: DECK_S.w, h: DECK_S.h,
      accent: "#4a90a8",
      hint: "Ar fresco — E para olhar a vista",
    },
  ]

  // ── Luzes ─────────────────────────────────────────────────────────────────
  const lights: LightSource[] = [
    { x: 30 * TILE + 8, y: 3 * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 30 * TILE + 8, y: 33 * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 6 * TILE, y: 8 * TILE, radius: 110, color: "#ffe0b0", flicker: 0 },
    // Luz fria entrando pelas duas fachadas de vidro.
    { x: 30 * TILE, y: 36 * TILE, radius: 150, color: "#cfe0ea", flicker: 0 },
    { x: 54 * TILE, y: 20 * TILE, radius: 140, color: "#cfe0ea", flicker: 0 },
    // Indicador do elevador pisca de leve.
    { x: 4 * TILE, y: 2 * TILE, radius: 36, color: "#e8d24a", flicker: 0.14 },
  ]

  // ── Assentos ──────────────────────────────────────────────────────────────
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

  // Um assento por baia, na abertura dela: a de cima olha para o norte (a mesa
  // está acima), a de baixo olha para o sul.
  for (const ty of CUBICLE_ROWS) {
    for (const tx of CUBICLE_COLS) {
      addSeat("ws", (tx + 2) * TILE, (ty + 2) * TILE + 12, "up", "Baia", "pc")
      addSeat("ws", (tx + 2) * TILE, (ty + 4) * TILE + 4, "down", "Baia", "pc")
    }
  }

  // Guarda-corpo: assentos de vista espalhados pelo deck sul e pelo leste.
  for (const tx of [24, 30, 36, 44]) {
    addSeat("vw", tx * TILE + 8, (DECK_S.y + DECK_S.h - 1) * TILE, "down", "Vista da varanda", "view")
  }
  for (const ty of [26, 34]) {
    addSeat("vw", (DECK_E.x + DECK_E.w - 1) * TILE, ty * TILE + 8, "right", "Vista da varanda", "view")
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
    spawn: { x: 8 * TILE, y: 4 * TILE },
  }
}
```

- [ ] **Step 5: Rodar os testes da planta e corrigir o que acusar**

Run: `cd frontend && npx vitest run src/features/office/world/floors/floor1.test.ts`
Expected: PASS — 16 testes.

Se algum assento aparecer como ilhado ou dentro de tile bloqueado, o teste imprime `id [rótulo]`. Corrigir **a planta**, nunca o teste: mover a coluna de baia (`CUBICLE_COLS`), ajustar o passo, ou deslocar o assento para fora do retângulo de colisão do prop. Repetir até a lista sair vazia.

- [ ] **Step 6: Apagar a sonda temporária**

```bash
rm -f frontend/src/features/office/world/__tmp-reach.test.ts
```

O `floor1.test.ts` cobre o mesmo — alcançabilidade de todo assento — só que de forma permanente e com a planta certa.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS em tudo. `map.test.ts` e `pc/desk.test.ts` testam a planta via `buildFloor1` — se algum deles assumia contagem de assento da planta antiga, atualizar a expectativa para 16 assentos de PC.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/office/world/floors/floor1.ts \
        frontend/src/features/office/world/floors/floor1.test.ts \
        frontend/src/features/office/world/map.ts \
        frontend/src/features/office/world/map.test.ts frontend/src/features/office/pc/desk.test.ts
git rm --cached -q --ignore-unmatch frontend/src/features/office/world/__tmp-reach.test.ts
git commit -m "feat(office): planta do andar 1 com bullpen, vidro em L e varanda"
```

---

### Task 9: Offset de câmera para apoiar

**Files:**
- Modify: `frontend/src/features/office/world/camera.ts`
- Modify: `frontend/src/features/office/world/camera.test.ts`

**Interfaces:**
- Consumes: `cameraTarget` (existente).
- Produces: `VIEW_OFFSET_PX = 40`; `offsetCamera(target: {x,y}, dx: number, dy: number, viewW: number, viewH: number, mapW: number, mapH: number): {x,y}` — soma o offset e reaplica o clamp de borda; `viewOffsetFor(facing: "up"|"down"|"left"|"right"): {dx,dy}` — direção do offset a partir do facing do assento.

- [ ] **Step 1: Escrever o teste**

Acrescentar ao fim de `frontend/src/features/office/world/camera.test.ts`:

```ts
import { VIEW_OFFSET_PX, offsetCamera, viewOffsetFor } from "./camera"

describe("viewOffsetFor", () => {
  it("empurra a câmera no sentido em que o avatar olha", () => {
    expect(viewOffsetFor("down")).toEqual({ dx: 0, dy: VIEW_OFFSET_PX })
    expect(viewOffsetFor("up")).toEqual({ dx: 0, dy: -VIEW_OFFSET_PX })
    expect(viewOffsetFor("right")).toEqual({ dx: VIEW_OFFSET_PX, dy: 0 })
    expect(viewOffsetFor("left")).toEqual({ dx: -VIEW_OFFSET_PX, dy: 0 })
  })
})

describe("offsetCamera", () => {
  const view = { w: 320, h: 200 }
  const world = { w: 1152, h: 736 }

  it("desloca quando há folga", () => {
    const base = { x: 400, y: 300 }
    const out = offsetCamera(base, 0, 40, view.w, view.h, world.w, world.h)
    expect(out.y).toBe(340)
    expect(out.x).toBe(400)
  })

  it("não passa da borda inferior do mapa", () => {
    const base = { x: 0, y: world.h - view.h }
    const out = offsetCamera(base, 0, 400, view.w, view.h, world.w, world.h)
    expect(out.y).toBe(world.h - view.h)
  })

  it("não passa da borda superior", () => {
    const out = offsetCamera({ x: 0, y: 0 }, 0, -400, view.w, view.h, world.w, world.h)
    expect(out.y).toBe(0)
  })

  it("não passa das bordas laterais em nenhuma quina", () => {
    for (const base of [
      { x: 0, y: 0 },
      { x: world.w - view.w, y: 0 },
      { x: 0, y: world.h - view.h },
      { x: world.w - view.w, y: world.h - view.h },
    ]) {
      for (const [dx, dy] of [[400, 0], [-400, 0], [0, 400], [0, -400]]) {
        const out = offsetCamera(base, dx, dy, view.w, view.h, world.w, world.h)
        expect(out.x).toBeGreaterThanOrEqual(0)
        expect(out.y).toBeGreaterThanOrEqual(0)
        expect(out.x).toBeLessThanOrEqual(world.w - view.w)
        expect(out.y).toBeLessThanOrEqual(world.h - view.h)
      }
    }
  })

  it("mapa menor que a viewport não gera coordenada negativa", () => {
    const out = offsetCamera({ x: 0, y: 0 }, 0, 40, 800, 600, 400, 300)
    expect(out).toEqual({ x: 0, y: 0 })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/world/camera.test.ts`
Expected: FAIL — `offsetCamera is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar ao fim de `frontend/src/features/office/world/camera.ts`:

```ts
/** Quanto a câmera abre para fora quando o avatar se apoia no guarda-corpo. */
export const VIEW_OFFSET_PX = 40

/** Direção em que a câmera abre, a partir do lado para onde o avatar olha. */
export function viewOffsetFor(facing: "up" | "down" | "left" | "right"): {
  dx: number
  dy: number
} {
  switch (facing) {
    case "up": return { dx: 0, dy: -VIEW_OFFSET_PX }
    case "down": return { dx: 0, dy: VIEW_OFFSET_PX }
    case "left": return { dx: -VIEW_OFFSET_PX, dy: 0 }
    default: return { dx: VIEW_OFFSET_PX, dy: 0 }
  }
}

/**
 * Soma um offset ao alvo da câmera e reaplica o clamp de borda. É o clamp que
 * impede o offset de mostrar a faixa preta fora do andar.
 */
export function offsetCamera(
  target: { x: number; y: number },
  dx: number,
  dy: number,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
): { x: number; y: number } {
  const maxX = Math.max(0, mapW - viewW)
  const maxY = Math.max(0, mapH - viewH)
  return {
    x: Math.max(0, Math.min(maxX, target.x + dx)),
    y: Math.max(0, Math.min(maxY, target.y + dy)),
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/office/world/camera.test.ts`
Expected: PASS — testes existentes + 6 novos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/office/world/camera.ts frontend/src/features/office/world/camera.test.ts
git commit -m "feat(office): offset de câmera ao apoiar, com clamp de borda"
```

---

### Task 10: Motor — céu antes do piso, assento de vista

**Files:**
- Modify: `frontend/src/features/office/world/engine.ts` (imports, campos, `tryInteract`, `updateCamera`, `render`)

**Interfaces:**
- Consumes: `buildSky`, `layerRect`, `cloudOffset`, `SKY_PARALLAX`, `SKY_STRIP_W`, `SKY_STRIP_H` (Task 5); `offsetCamera`, `viewOffsetFor` (Task 9); `Seat`/`SeatKind` (Task 8).
- Produces: comportamento — assento `"view"` usa anim `lean` e liga o offset de câmera; céu desenhado antes do piso. Nenhuma API nova para fora além do que já existe.

- [ ] **Step 1: Importar a camada de céu e o offset**

No topo de `engine.ts`, junto aos imports existentes de `./camera` e `./map`:

```ts
import {
  cameraTarget, focusScale, integerScale, offsetCamera, screenToWorld, viewOffsetFor, viewportFor,
} from "./camera"
import { SKY_PARALLAX, type SkyLayers, buildSky, cloudOffset, layerRect } from "./sky"
```

(o import de `./camera` já existe — acrescentar `offsetCamera` e `viewOffsetFor` à lista; não duplicar a linha.)

- [ ] **Step 2: Criar as faixas de céu na construção**

Entre os campos privados (perto de `private shadow: PropSprite`):

```ts
  private sky: SkyLayers
  /** Offset ativo da câmera (apoiado no guarda-corpo). */
  private viewOffset = { dx: 0, dy: 0 }
```

No `constructor`, depois de `this.shadow = buildShadowSprite()`:

```ts
    this.sky = buildSky()
```

- [ ] **Step 3: Desenhar o céu antes do piso**

Em `render()`, substituir o preenchimento de fundo (o `ctx.fillStyle = "#1a1712"` seguido do `fillRect`) por:

```ts
    // Céu primeiro: o piso é blitado por cima com alfa, então vidro,
    // guarda-corpo e o vazio fora do prédio revelam estas faixas.
    const vw = this.viewW
    const vh = this.viewH
    const blit = (layer: HTMLCanvasElement, factor: number, extraX = 0) => {
      const r = layerRect(factor, camX + extraX, camY, vw, vh)
      ctx.drawImage(layer, r.sx, r.sy, r.sw, r.sh, 0, 0, vw * s, vh * s)
      // Segunda passada quando o recorte cruza o fim da faixa — sem ela
      // aparece uma coluna vazia a cada volta do loop.
      const over = r.sx + r.sw - layer.width
      if (over > 0) {
        ctx.drawImage(
          layer, 0, r.sy, over, r.sh,
          (r.sw - over) * s, 0, over * s, vh * s,
        )
      }
    }

    blit(this.sky.sky, 0)
    blit(this.sky.far, SKY_PARALLAX.far)
    blit(this.sky.near, SKY_PARALLAX.near)
    ctx.drawImage(
      this.sky.clouds,
      cloudOffset(camX, this.time), 0, vw, vh,
      0, 0, vw * s, vh * s,
    )
```

- [ ] **Step 4: Aplicar o offset na câmera**

Em `updateCamera()`, substituir o cálculo do alvo:

```ts
  private updateCamera(): void {
    const anchor = this.focus ?? this.me
    if (!anchor) return
    const base = cameraTarget(
      anchor.x, anchor.y, this.viewW, this.viewH, this.map.width, this.map.height,
    )
    const { x: cx, y: cy } = offsetCamera(
      base, this.viewOffset.dx, this.viewOffset.dy,
      this.viewW, this.viewH, this.map.width, this.map.height,
    )
    const ease = this.reduceMotion ? 1 : 0.14
    this.camX += (cx - this.camX) * ease
    this.camY += (cy - this.camY) * ease
    this.camX = Math.round(this.camX * 2) / 2
    this.camY = Math.round(this.camY * 2) / 2
  }
```

O easing de 0.14 já existente é o que faz o offset entrar deslizando, sem corte.

- [ ] **Step 5: Assento de vista liga a pose e o offset**

Em `tryInteract()`, o ramo de levantar zera o offset e o de sentar decide pose e offset:

```ts
    if (me.seatIndex >= 0) {
      me.seatIndex = -1
      me.anim = "idle"
      this.viewOffset = { dx: 0, dy: 0 }
      this.cb.onInteract?.(null)
      return
    }
```

e, no fim do ramo de sentar, trocar a linha da animação e acrescentar o offset:

```ts
    me.anim =
      seat.kind === "view" ? "lean" : seat.kind === "lounge" ? "idle" : "type"
    this.viewOffset =
      seat.kind === "view" ? viewOffsetFor(seat.facing) : { dx: 0, dy: 0 }
```

- [ ] **Step 6: Verificar que nada quebrou**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS. O engine não é coberto por teste (jsdom sem canvas) — a garantia aqui é o typecheck mais os testes puros de `sky` e `camera`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/office/world/engine.ts
git commit -m "feat(office): céu em paralaxe antes do piso e assento de vista"
```

---

### Task 11: Painel do elevador

**Files:**
- Create: `frontend/src/features/office/ElevatorPanel.tsx`
- Create: `frontend/src/features/office/ElevatorPanel.test.tsx`

**Interfaces:**
- Consumes: `floorButtons` (Task 2), `FLOORS` (Task 1), `useWorldStore` (Task 3), `win98.css` (já importado por `pc/Win98Desktop.tsx`).
- Produces: `<ElevatorPanel />` — sem props; lê e escreve no `useWorldStore`. Não renderiza nada quando `panelOpen` é `false`.

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/features/office/ElevatorPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { ElevatorPanel } from "./ElevatorPanel"
import { useWorldStore } from "./world.store"

const reset = () => useWorldStore.setState({ floor: 1, panelOpen: true })

describe("ElevatorPanel", () => {
  beforeEach(reset)

  it("não renderiza nada com o painel fechado", () => {
    useWorldStore.setState({ panelOpen: false })
    const { container } = render(<ElevatorPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lista os quatro andares, do mais alto para o mais baixo", () => {
    render(<ElevatorPanel />)
    const botoes = screen.getAllByRole("button", { name: /andar/i })
    expect(botoes).toHaveLength(4)
    expect(botoes[0]).toHaveAccessibleName(/4/)
    expect(botoes[3]).toHaveAccessibleName(/1/)
  })

  it("marca os andares em obras como desabilitados", () => {
    render(<ElevatorPanel />)
    expect(screen.getByRole("button", { name: /andar 2/i })).toBeDisabled()
    expect(screen.getAllByText(/em obras/i).length).toBeGreaterThan(0)
  })

  it("o andar atual aparece marcado e não é clicável", () => {
    render(<ElevatorPanel />)
    expect(screen.getByRole("button", { name: /andar 1/i })).toBeDisabled()
    expect(screen.getByText(/você está aqui/i)).toBeInTheDocument()
  })

  it("fechar limpa o painel no store", async () => {
    render(<ElevatorPanel />)
    await userEvent.click(screen.getByRole("button", { name: /fechar/i }))
    expect(useWorldStore.getState().panelOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/office/ElevatorPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./ElevatorPanel"`.

- [ ] **Step 3: Implementar**

Criar `frontend/src/features/office/ElevatorPanel.tsx`:

```tsx
// Painel do elevador — a única UI que sabe que o prédio tem andares.
//
// Estética Win98 reaproveitando as classes de pc/win98.css, que já entra no
// bundle pelo desktop. Andar sem planta aparece travado: é assim que o andar 2
// vai destravar depois, sem mexer aqui.
import { useWorldStore } from "./world.store"
import { floorButtons } from "./world/elevator"
import { FLOORS } from "./world/floors"

export function ElevatorPanel() {
  const open = useWorldStore((s) => s.panelOpen)
  const floor = useWorldStore((s) => s.floor)
  const close = useWorldStore((s) => s.closePanel)
  const goToFloor = useWorldStore((s) => s.goToFloor)

  if (!open) return null

  const buttons = floorButtons(FLOORS, floor)

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/50">
      <div className="win98-window w-[280px]">
        <div className="win98-titlebar">
          <span>Elevador</span>
          <button type="button" className="win98-titlebar-btn" onClick={close} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-1 p-3">
          {buttons.map((b) => (
            <button
              key={b.n}
              type="button"
              className="win98-btn flex items-center justify-between px-2 py-1 text-left"
              disabled={b.locked || b.current}
              aria-label={`Andar ${b.n} — ${b.label}`}
              onClick={() => goToFloor(b.n)}
            >
              <span>
                <b>{b.n}</b> · {b.label}
              </span>
              <span className="text-[11px] opacity-70">
                {b.current ? "você está aqui" : b.locked ? "em obras" : "ir"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Conferir as classes do win98**

Run: `cd frontend && grep -n "win98-window\|win98-titlebar\|win98-btn" src/features/office/pc/win98.css`
Expected: as quatro classes existem. Se alguma faltar (`win98-titlebar-btn`, por exemplo), acrescentar ao `win98.css` seguindo o padrão das vizinhas — borda de 2 px em relevo, fundo `#c0c0c0`.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/office/ElevatorPanel.test.tsx`
Expected: PASS — 5 testes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/office/ElevatorPanel.tsx frontend/src/features/office/ElevatorPanel.test.tsx \
        frontend/src/features/office/pc/win98.css
git commit -m "feat(office): painel Win98 do elevador com andares travados"
```

---

### Task 12: Presença por andar (backend)

**Files:**
- Modify: `backend/src/contexts/presence/infrastructure/django/models.py:30-31`
- Create: `backend/src/contexts/presence/migrations/0002_presence_floor.py`
- Modify: `backend/src/contexts/presence/interface/api/views.py:45-74` (heartbeat), `:82-116` (sala)
- Modify: `backend/src/contexts/presence/tests/test_presence_api.py`

**Interfaces:**
- Consumes: nada do frontend.
- Produces: `POST /api/presence/heartbeat/` aceita `floor` (int, 1..8, default 1); `GET /api/presence/room/?workspace_id=&floor=` filtra por andar (default 1) e devolve `floor` em cada linha.

- [ ] **Step 1: Escrever o teste**

Acrescentar a `backend/src/contexts/presence/tests/test_presence_api.py` (seguir o padrão de autenticação e criação de workspace já usado no arquivo):

```python
@pytest.mark.django_db
def test_heartbeat_grava_o_andar(auth_client, workspace):
    resp = auth_client.post(
        "/api/presence/heartbeat/",
        {"workspace_id": str(workspace.id), "x": 0.4, "y": 0.6, "floor": 3},
        format="json",
    )
    assert resp.status_code == 200
    presence = PresenceModel.objects.get(workspace_id=workspace.id)
    assert presence.floor == 3


@pytest.mark.django_db
def test_heartbeat_sem_andar_assume_o_primeiro(auth_client, workspace):
    auth_client.post(
        "/api/presence/heartbeat/",
        {"workspace_id": str(workspace.id)},
        format="json",
    )
    assert PresenceModel.objects.get(workspace_id=workspace.id).floor == 1


@pytest.mark.django_db
def test_heartbeat_recusa_andar_absurdo(auth_client, workspace):
    auth_client.post(
        "/api/presence/heartbeat/",
        {"workspace_id": str(workspace.id), "floor": 999},
        format="json",
    )
    # Fora da faixa cai no andar 1 em vez de gravar lixo.
    assert PresenceModel.objects.get(workspace_id=workspace.id).floor == 1


@pytest.mark.django_db
def test_sala_nao_mistura_andares(auth_client, workspace, other_member):
    auth_client.post(
        "/api/presence/heartbeat/",
        {"workspace_id": str(workspace.id), "floor": 1},
        format="json",
    )
    PresenceModel.objects.create(
        workspace_id=workspace.id, user_id=other_member.id, floor=2
    )

    andar1 = auth_client.get(
        "/api/presence/room/", {"workspace_id": str(workspace.id), "floor": 1}
    )
    assert [r["floor"] for r in andar1.data] == [1]
    assert str(other_member.id) not in [r["user_id"] for r in andar1.data]

    andar2 = auth_client.get(
        "/api/presence/room/", {"workspace_id": str(workspace.id), "floor": 2}
    )
    assert [r["user_id"] for r in andar2.data] == [str(other_member.id)]
```

Se o arquivo ainda não tiver as fixtures `auth_client`, `workspace` ou `other_member`, criar seguindo as que os testes existentes já usam (ver o começo do arquivo) — `other_member` é um segundo usuário com `MembershipModel` no mesmo workspace.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest src/contexts/presence/tests/test_presence_api.py -q`
Expected: FAIL — `PresenceModel() got unexpected keyword arguments: 'floor'`.

- [ ] **Step 3: Adicionar o campo**

Em `models.py`, logo depois de `facing`:

```python
    # Em que andar a pessoa está. Sem isto, os avatares de todos os andares se
    # acumulam sobre a planta de quem está olhando.
    floor = models.PositiveSmallIntegerField(default=1)
```

- [ ] **Step 4: Gerar e conferir a migration**

Run: `cd backend && .venv/bin/python manage.py makemigrations presence -n presence_floor`
Expected: cria `0002_presence_floor.py` com `AddField` de `floor`.

- [ ] **Step 5: Ler o andar no heartbeat**

Em `views.py`, dentro de `HeartbeatView.post`, junto ao tratamento de `facing`:

```python
        floor = _clamp_floor(request.data.get("floor", 1))
```

e depois de `presence.facing = facing`:

```python
        presence.floor = floor
```

Acrescentar o helper junto de `_clamp01`:

```python
MAX_FLOOR = 8


def _clamp_floor(value: object) -> int:
    """Andar válido; qualquer lixo cai no primeiro andar."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 1
    return n if 1 <= n <= MAX_FLOOR else 1
```

- [ ] **Step 6: Filtrar a sala por andar**

Em `RoomView.get`, ler o parâmetro e filtrar:

```python
        floor = _clamp_floor(request.query_params.get("floor", 1))
        rows = (
            PresenceModel.objects.filter(
                workspace_id=workspace_id, last_seen__gte=cutoff, floor=floor
            )
            .select_related("user")
        )
```

e incluir o campo em cada linha da resposta, junto de `"facing": r.facing,`:

```python
                "floor": r.floor,
```

- [ ] **Step 7: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest src/contexts/presence -q && .venv/bin/python -m ruff check src`
Expected: PASS em todos os testes de presença; ruff sem apontamento.

- [ ] **Step 8: Commit**

```bash
git add backend/src/contexts/presence
git commit -m "feat(presence): posição por andar no heartbeat e na sala"
```

---

### Task 13: Integração — andar no cliente e no HUD

Última task: liga tudo. O mapa passa a vir do andar atual, o engine remonta na troca, E abre o painel dentro do elevador, e o heartbeat leva o andar.

**Files:**
- Modify: `frontend/src/features/office/office.types.ts`
- Modify: `frontend/src/features/office/office.api.ts:15-20`
- Modify: `frontend/src/features/office/office.hooks.ts:10-18`
- Modify: `frontend/src/features/office/OfficeRoom.tsx`

**Interfaces:**
- Consumes: `useWorldStore` (Task 3), `buildFloor` (Task 1), `ElevatorPanel` (Task 11), API com `floor` (Task 12).
- Produces: `HeartbeatInput` ganha `floor: number`; `getRoom(workspaceId: string, floor: number)`; `useRoom(workspaceId: string | null, floor: number)`.

- [ ] **Step 1: Levar o andar até a API**

Em `office.types.ts`, acrescentar `floor: number` a `HeartbeatInput`.

Em `office.api.ts`:

```ts
export async function getRoom(workspaceId: string, floor: number): Promise<OfficeMember[]> {
  const { data } = await api.get<OfficeMember[]>("/presence/room/", {
    params: { workspace_id: workspaceId, floor },
  })
  return data
}
```

Em `office.hooks.ts`:

```ts
export function useRoom(workspaceId: string | null, floor: number) {
  return useQuery({
    queryKey: ["office-room", workspaceId, floor],
    queryFn: () => officeApi.getRoom(workspaceId!, floor),
    enabled: !!workspaceId,
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
  })
}
```

O `floor` na `queryKey` é o que evita mostrar, por um instante, o cache do andar anterior depois da troca.

- [ ] **Step 2: Mapa do andar atual em `OfficeRoom`**

Trocar o import e o `useMemo`:

```ts
import { buildFloor } from "./world/floors"
import { useWorldStore } from "./world.store"
import { ElevatorPanel } from "./ElevatorPanel"
// ...
const floor = useWorldStore((s) => s.floor)
const map = useMemo(() => buildFloor(floor), [floor])
```

O efeito do engine já depende de `[map]`, então a troca de andar remonta o engine sozinha — nada a mudar no efeito além disso.

Trocar também a chamada da sala:

```ts
const room = useRoom(workspaceId, floor)
```

- [ ] **Step 3: Mandar o andar no heartbeat**

No `heartbeat.mutate({ ... })`, acrescentar `floor` ao objeto enviado, ao lado de `workspace_id`, `x`, `y` e `facing`:

```ts
        floor,
```

- [ ] **Step 4: E dentro do elevador abre o painel**

No callback `onZoneChange` do engine, guardar a zona atual num ref, e no `onInteract` decidir. Como o engine chama `onZoneChange(id, label, hint)`, guardar o id:

```ts
  const zoneIdRef = useRef<string | null>(null)
```

```ts
      onZoneChange: (id, label, hint) => {
        zoneIdRef.current = id
        setZone(label ? { label, hint } : null)
      },
```

E no `onInteract`, antes do tratamento de assento:

```ts
      onInteract: (seat) => {
        // Dentro da cabine, E chama o painel em vez de procurar cadeira.
        if (!seat && zoneIdRef.current === "elevator") {
          useWorldStore.getState().openPanel()
          return
        }
        setToast(seat ? seat.label : "De pé")
        if (seat && me?.id && isMyDesk(me.id, seat, map.seats)) bootPc(seat.id)
        else if (!seat) shutdownPc()
      },
```

- [ ] **Step 5: Montar o painel e o rótulo do andar no HUD**

No JSX, junto do overlay do PC (perto de onde `Win98Desktop` é renderizado), acrescentar:

```tsx
      <ElevatorPanel />
```

E no HUD de zona, mostrar o andar — a pessoa precisa saber onde está depois de trocar:

```tsx
            <p className="text-[11px] text-white/50">
              Andar {floor}
            </p>
```

- [ ] **Step 6: Rodar tudo**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS na suíte inteira; typecheck limpo. Se algum teste de `OfficeRoom`/`office.hooks` existente chamava `useRoom` com um argumento, atualizar a chamada.

- [ ] **Step 7: Ver rodando de verdade**

```bash
cd backend && .venv/bin/python manage.py migrate
cd ../frontend && npm run dev
```

Abrir `http://localhost:8080`, entrar com `ana@t4e.dev` / `demo1234` e conferir, na ordem:

1. o andar abre no hall do elevador, com as portas de metal à esquerda;
2. andando para leste aparece o bullpen com as baias em U em pares;
3. o céu atrás do vidro **desliza mais devagar** que o escritório ao caminhar — se ele acompanhar o piso na mesma velocidade, o `factor` não está sendo aplicado;
4. atravessar a porta de vidro do sul leva ao deck; o HUD mostra "Varanda";
5. no guarda-corpo, E apoia o avatar e a câmera abre para fora;
6. de volta na cabine do elevador, E abre o painel com 2, 3 e 4 travados.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/office
git commit -m "feat(office): andar atual no mapa, no heartbeat e no HUD"
```

---

## Self-Review

**Cobertura da spec:**

| Requisito da spec | Task |
|---|---|
| Registry de andares, `map.ts` só com tipos | 1 |
| Regras do elevador em função pura | 2 |
| Estado do andar atual | 3 |
| `T.GLASS`/`GLASS_DOOR`/`DECK`/`RAILING`, `T.WINDOW` removido, `ALPHA_TILES` | 4 |
| Camada de céu: céu, skyline ×2, nuvens, fatores de paralaxe | 5 |
| Prop `cubicle` em U + props do bullpen | 6 |
| Animação de apoiar | 7 |
| Planta 72×46, 16 baias, vidro em L, deck em L, zonas | 8 |
| BFS de alcançabilidade (o bug das 3 baias ilhadas) | 8 |
| Offset de câmera ao apoiar, com clamp | 9 |
| Ordem de desenho com céu antes do piso; assento `view` | 10 |
| Painel Win98 do elevador com andares travados | 11 |
| `PresenceModel.floor` + heartbeat + filtro da sala | 12 |
| Andar no cliente, HUD e heartbeat | 13 |

**Consistência de nomes verificada:** `buildFloor1` (Tasks 1, 8) · `buildFloor` (1, 13) · `FLOORS`/`FloorDef` (1, 2, 3, 11) · `canGoTo` (2, 3) · `floorButtons` (2, 11) · `useWorldStore` (3, 11, 13) · `ALPHA_TILES` (4) · `SKY_PARALLAX`/`layerRect`/`cloudOffset` (5, 10) · `cubicle`/`cubicleFlip` (6, 8) · `lean` (7, 10) · `SeatKind` com `"view"` (8, 10) · `offsetCamera`/`viewOffsetFor` (9, 10) · `floor` na API (12, 13).

**Riscos de execução:**

- A Task 8 é a única em que as coordenadas podem não fechar de primeira. O teste de alcançabilidade imprime o id e o rótulo de cada assento ilhado — corrigir a planta, nunca o teste.
- Task 10 mexe no `render()`, que nenhum teste cobre (jsdom sem canvas). A verificação real é o passo 7 da Task 13, no navegador.
- Se o `win98.css` não tiver `win98-titlebar-btn`, a Task 11 acrescenta a classe. Conferir antes de estilizar do zero.
