# Office PC Win98 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sentar na própria mesa do Escritório abre um desktop estilo Windows 98 sobre o mapa, com janelas, taskbar e menu Iniciar, hospedando as páginas reais do produto (Boards e Comercial nesta fatia).

**Architecture:** O mapa é uma engine canvas 2D própria (`OfficeEngine`) que não re-renderiza React por frame. Extraímos a matemática de câmera e o gate de teclado para módulos puros testáveis, damos identidade (`id` + `kind`) aos assentos, e a engine ganha três capacidades: travar a câmera com zoom (`focusOn`), desligar o teclado do mapa (`setInputEnabled`) e reportar o assento inteiro ao sentar. Em cima disso, uma pasta nova `features/office/pc/` implementa um window manager em zustand mais o chrome Win98 em DOM puro — **sem nenhum `transform` CSS**, para que `position: fixed` das páginas embutidas continue funcionando.

**Tech Stack:** TypeScript, React 18, zustand 5, framer-motion 11, Tailwind 3, vitest 2 + jsdom + @testing-library/react.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-26-office-pc-win98-design.md`. Ler antes de começar.
- **Nenhum `transform` CSS** em qualquer ancestral das páginas embutidas — nem `scale(1)`. Um transform vira containing block e quebra todo `position: fixed` dentro das janelas, incluindo o `Modal` de `src/shared/ui/primitives.tsx:219`. A animação de expandir anima `left/top/width/height`.
- **Nenhuma página existente é editada.** O registry importa e embute. Se uma página parecer precisar de mudança, pare e reporte — é sinal de escopo errado.
- `node_modules/canvas` **não** está instalado: `getContext("2d")` devolve `null` em jsdom e `new OfficeEngine(...)` explode. Nunca instancie a engine num teste. Teste os módulos puros.
- Escala de render é **inteira** (`Math.floor`, piso 2, teto 4 no modo normal; até 8 com foco). `imageSmoothingEnabled` fica `false`. Escala fracionária faz o pixel-art tremer.
- Comentários e strings de UI em **português**, seguindo o código existente. Comentário explica *por quê*, não *o quê* — siga o tom de `world/engine.ts:1-10`.
- Rodar da pasta `frontend/`. Testes: `npx vitest run <caminho>`. Lint/typecheck: `npm run lint`.
- Baseline antes de começar: 9 arquivos de teste, 54 testes, todos passando. Não regredir.
- Commits em português com prefixo convencional (`feat:`, `refactor:`, `test:`), escopo `office` quando cabível.

---

## File Structure

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/features/office/world/camera.ts` | Matemática pura de câmera e escala |
| `frontend/src/features/office/world/camera.test.ts` | Testes de `camera.ts` |
| `frontend/src/features/office/world/input.ts` | Classificação pura de teclas |
| `frontend/src/features/office/world/input.test.ts` | Testes de `input.ts` |
| `frontend/src/features/office/world/map.test.ts` | Testes de identidade dos assentos |
| `frontend/src/features/office/pc/desk.ts` | Qual mesa pertence a qual usuário |
| `frontend/src/features/office/pc/desk.test.ts` | Testes de `desk.ts` |
| `frontend/src/features/office/pc/pc.store.ts` | Window manager (estado + regras) |
| `frontend/src/features/office/pc/pc.store.test.ts` | Testes do window manager |
| `frontend/src/features/office/pc/win98.css` | Tokens e classes do visual 98 |
| `frontend/src/features/office/pc/Win98Window.tsx` | Moldura, drag, resize, botões |
| `frontend/src/features/office/pc/Win98Window.test.tsx` | Testes da janela |
| `frontend/src/features/office/pc/Taskbar.tsx` | Barra de tarefas + relógio + Levantar |
| `frontend/src/features/office/pc/Taskbar.test.tsx` | Testes da taskbar |
| `frontend/src/features/office/pc/StartMenu.tsx` | Menu Iniciar hierárquico |
| `frontend/src/features/office/pc/StartMenu.test.tsx` | Testes do menu |
| `frontend/src/features/office/pc/apps.registry.ts` | `appId → { label, grupo, componente, tamanho }` |
| `frontend/src/features/office/pc/apps.registry.test.ts` | Testes do registry |
| `frontend/src/features/office/pc/DesktopIcons.tsx` | Grade de ícones e pastas |
| `frontend/src/features/office/pc/DesktopIcons.test.tsx` | Testes dos ícones |
| `frontend/src/features/office/pc/BootScreen.tsx` | Animação de boot |
| `frontend/src/features/office/pc/Win98Desktop.tsx` | Monta painel, janelas, taskbar, camada expandida |

**Modificar:**

| Arquivo | Mudança |
|---|---|
| `frontend/src/features/office/world/map.ts:41-47` | `Seat` ganha `id` e `kind` |
| `frontend/src/features/office/world/map.ts:293-309` | Assentos passam a declarar `id` e `kind` |
| `frontend/src/features/office/world/engine.ts:65-69` | `onInteract` recebe `Seat \| null` |
| `frontend/src/features/office/world/engine.ts:264-285` | `onKeyDown`/`clickTo` usam `input.ts`/`camera.ts` |
| `frontend/src/features/office/world/engine.ts:287-317` | `tryInteract` reporta o `Seat` |
| `frontend/src/features/office/world/engine.ts:565-598` | `resize`/`updateCamera` usam `camera.ts`; entra `focusOn`/`clearFocus` |
| `frontend/src/features/office/OfficeRoom.tsx` | Liga sentar → PC; monta `Win98Desktop`; sem caixa 16:10 |
| `frontend/src/features/office/OfficePage.tsx` | Tela cheia; presença vira overlay |
| `frontend/src/features/office/pc/Win98Desktop.tsx` | Importa `win98.css` do próprio componente |

---

## Task 1: Câmera pura

Extrai a matemática de escala e câmera da engine para um módulo testável. Comportamento final idêntico — é refactor puro, sem feature nova. Faz primeiro porque as tasks 4 e 10 dependem dele.

**Files:**
- Create: `frontend/src/features/office/world/camera.ts`
- Test: `frontend/src/features/office/world/camera.test.ts`
- Modify: `frontend/src/features/office/world/engine.ts:279-285` (`clickTo`), `:565-580` (`resize`), `:582-598` (`updateCamera`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `integerScale(cssW: number, cssH: number, max?: number): number`
  - `viewportFor(cssW: number, cssH: number, scale: number): { viewW: number; viewH: number }`
  - `worldToScreen(camX: number, camY: number, scale: number, x: number, y: number): { x: number; y: number }`
  - `screenToWorld(camX: number, camY: number, scale: number, sx: number, sy: number): { x: number; y: number }`
  - `cameraTarget(cx: number, cy: number, viewW: number, viewH: number, mapW: number, mapH: number): { x: number; y: number }`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/features/office/world/camera.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  cameraTarget,
  integerScale,
  screenToWorld,
  viewportFor,
  worldToScreen,
} from "./camera"

describe("integerScale", () => {
  it("usa 4× quando a tela é larga o suficiente", () => {
    expect(integerScale(1600, 1000)).toBe(4)
  })

  it("nunca passa de 4× por padrão", () => {
    expect(integerScale(4000, 3000)).toBe(4)
  })

  it("nunca desce abaixo de 2× em tela apertada", () => {
    expect(integerScale(320, 200)).toBe(2)
    expect(integerScale(100, 80)).toBe(2)
  })

  it("é sempre inteira — é isso que impede o pixel-art de tremer", () => {
    for (const w of [700, 900, 1130, 1441]) {
      expect(Number.isInteger(integerScale(w, w * 0.625))).toBe(true)
    }
  })

  it("aceita teto maior quando a câmera está com foco", () => {
    expect(integerScale(1600, 1000, 8)).toBe(5)
    expect(integerScale(4000, 3000, 8)).toBe(8)
  })
})

describe("viewportFor", () => {
  it("deriva a viewport em pixels de mundo, arredondando para cima", () => {
    expect(viewportFor(1600, 1000, 4)).toEqual({ viewW: 400, viewH: 250 })
    expect(viewportFor(1601, 1000, 4)).toEqual({ viewW: 401, viewH: 250 })
  })
})

describe("worldToScreen / screenToWorld", () => {
  it("converte mundo para tela descontando a câmera e aplicando a escala", () => {
    expect(worldToScreen(100, 50, 3, 130, 70)).toEqual({ x: 90, y: 60 })
  })

  it("screenToWorld é o inverso exato de worldToScreen", () => {
    const cam = { x: 128, y: 96 }
    const scale = 4
    const world = { x: 424, y: 158 }
    const screen = worldToScreen(cam.x, cam.y, scale, world.x, world.y)
    expect(screenToWorld(cam.x, cam.y, scale, screen.x, screen.y)).toEqual(world)
  })
})

describe("cameraTarget", () => {
  it("centraliza o ponto na viewport", () => {
    expect(cameraTarget(500, 400, 400, 250, 960, 608)).toEqual({ x: 300, y: 275 })
  })

  it("trava na borda esquerda/superior em vez de mostrar vazio", () => {
    expect(cameraTarget(50, 20, 400, 250, 960, 608)).toEqual({ x: 0, y: 0 })
  })

  it("trava na borda direita/inferior", () => {
    expect(cameraTarget(950, 600, 400, 250, 960, 608)).toEqual({ x: 560, y: 358 })
  })

  it("quando o mapa é menor que a viewport, fixa em zero", () => {
    expect(cameraTarget(100, 100, 2000, 2000, 960, 608)).toEqual({ x: 0, y: 0 })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/office/world/camera.test.ts`
Expected: FAIL — `Failed to resolve import "./camera"`

- [ ] **Step 3: Implementar `camera.ts`**

Criar `frontend/src/features/office/world/camera.ts`:

```ts
// Matemática de câmera e escala, separada do motor.
//
// Vive fora da OfficeEngine por um motivo prático: jsdom não tem canvas, então a
// engine não pode ser instanciada em teste. Aqui é função pura — dá para provar
// que a escala nunca fica fracionária e que a câmera nunca mostra o vazio.

/** Escala de exibição. Sempre inteira; fracionária faz o pixel-art tremer. */
export function integerScale(cssW: number, cssH: number, max = 4): number {
  const fit = Math.min(cssW / 320, cssH / 200)
  return Math.max(2, Math.min(max, Math.floor(fit)))
}

/** Quantos pixels de mundo cabem na tela, dada a escala. */
export function viewportFor(
  cssW: number,
  cssH: number,
  scale: number,
): { viewW: number; viewH: number } {
  return { viewW: Math.ceil(cssW / scale), viewH: Math.ceil(cssH / scale) }
}

export function worldToScreen(
  camX: number,
  camY: number,
  scale: number,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: (x - camX) * scale, y: (y - camY) * scale }
}

export function screenToWorld(
  camX: number,
  camY: number,
  scale: number,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: camX + sx / scale, y: camY + sy / scale }
}

/**
 * Canto da câmera para centralizar (cx, cy), travado nas bordas do mapa —
 * é o clamp que evita a faixa preta de fora do andar.
 */
export function cameraTarget(
  cx: number,
  cy: number,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
): { x: number; y: number } {
  const maxX = Math.max(0, mapW - viewW)
  const maxY = Math.max(0, mapH - viewH)
  return {
    x: Math.max(0, Math.min(maxX, cx - viewW / 2)),
    y: Math.max(0, Math.min(maxY, cy - viewH / 2)),
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/office/world/camera.test.ts`
Expected: PASS — 11 testes

- [ ] **Step 5: Fazer a engine delegar**

Em `frontend/src/features/office/world/engine.ts`, adicionar ao bloco de imports (junto de `import { makeCanvas } from "./pixels"`):

```ts
import { cameraTarget, integerScale, screenToWorld, viewportFor } from "./camera"
```

Substituir `clickTo` (linhas 278-285) por:

```ts
  /** Clique na tela → alvo de caminhada no mundo. */
  clickTo(screenX: number, screenY: number): void {
    const { x, y } = screenToWorld(this.camX, this.camY, this.scale, screenX, screenY)
    if (isSolid(this.map, x, y)) return
    this.target = { x, y }
    if (this.me) this.me.seatIndex = -1
  }
```

Substituir o corpo de `resize` (linhas 565-580) por:

```ts
  resize(cssW: number, cssH: number): void {
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
    this.scale = integerScale(cssW, cssH)
    const { viewW, viewH } = viewportFor(cssW, cssH, this.scale)
    this.viewW = viewW
    this.viewH = viewH
    this.canvas.width = cssW * dpr
    this.canvas.height = cssH * dpr
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = false
    this.lightBuf.width = Math.max(1, Math.ceil(this.viewW / 2))
    this.lightBuf.height = Math.max(1, Math.ceil(this.viewH / 2))
  }
```

Substituir `updateCamera` (linhas 582-598) por:

```ts
  private updateCamera(): void {
    const me = this.me
    if (!me) return
    const { x: cx, y: cy } = cameraTarget(
      me.x, me.y, this.viewW, this.viewH, this.map.width, this.map.height,
    )
    const ease = this.reduceMotion ? 1 : 0.14
    this.camX += (cx - this.camX) * ease
    this.camY += (cy - this.camY) * ease
    // Arredondar a câmera para inteiro é o que impede o mundo de tremer.
    this.camX = Math.round(this.camX * 2) / 2
    this.camY = Math.round(this.camY * 2) / 2
  }
```

- [ ] **Step 6: Confirmar que nada regrediu**

Run: `npx vitest run && npm run lint`
Expected: PASS — 10 arquivos, 65 testes. Lint sem erro.

- [ ] **Step 7: Verificar no navegador que o mapa continua igual**

Run: `npm run dev` e abrir `http://localhost:8080/app/office`
Expected: andar com WASD e clicar no chão funciona igual a antes; nenhum tremor no pixel-art.

- [ ] **Step 8: Commit**

```bash
git add src/features/office/world/camera.ts src/features/office/world/camera.test.ts src/features/office/world/engine.ts
git commit -m "refactor(office): extrai matemática de câmera para módulo puro testável"
```

---

## Task 2: Gate de teclado

Hoje `onKeyDown` decide na mão quais teclas valem. Isso vira função pura e ganha um interruptor: com o PC aberto, o teclado do mapa desliga — senão digitar num campo do Boards faz o avatar andar.

**Files:**
- Create: `frontend/src/features/office/world/input.ts`
- Test: `frontend/src/features/office/world/input.test.ts`
- Modify: `frontend/src/features/office/world/engine.ts:264-276`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type KeyAction = "move" | "interact" | "ignore"`
  - `keyAction(rawKey: string, enabled: boolean): KeyAction`
  - `OfficeEngine.setInputEnabled(enabled: boolean): void`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/features/office/world/input.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { keyAction } from "./input"

describe("keyAction", () => {
  it("classifica WASD e setas como movimento", () => {
    for (const k of ["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(keyAction(k, true)).toBe("move")
    }
  })

  it("shift conta como movimento (é o modificador de correr)", () => {
    expect(keyAction("Shift", true)).toBe("move")
  })

  it("classifica E como interação", () => {
    expect(keyAction("e", true)).toBe("interact")
    expect(keyAction("E", true)).toBe("interact")
  })

  it("ignora teclas que o mapa não usa", () => {
    expect(keyAction("q", true)).toBe("ignore")
    expect(keyAction("Enter", true)).toBe("ignore")
    expect(keyAction("1", true)).toBe("ignore")
  })

  it("desabilitado, ignora tudo — inclusive movimento e interação", () => {
    for (const k of ["w", "ArrowUp", "Shift", "e", "q"]) {
      expect(keyAction(k, false)).toBe("ignore")
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/office/world/input.test.ts`
Expected: FAIL — `Failed to resolve import "./input"`

- [ ] **Step 3: Implementar `input.ts`**

Criar `frontend/src/features/office/world/input.ts`:

```ts
// Único lugar que decide se uma tecla vale para o mapa.
//
// Existe separado porque o PC do escritório precisa desligar o teclado do mundo:
// com o desktop aberto, digitar num campo não pode fazer o avatar andar.

export type KeyAction = "move" | "interact" | "ignore"

const MOVE_KEYS = new Set([
  "w", "a", "s", "d",
  "arrowup", "arrowdown", "arrowleft", "arrowright",
  "shift",
])

export function keyAction(rawKey: string, enabled: boolean): KeyAction {
  if (!enabled) return "ignore"
  const k = rawKey.toLowerCase()
  if (MOVE_KEYS.has(k)) return "move"
  if (k === "e") return "interact"
  return "ignore"
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/office/world/input.test.ts`
Expected: PASS — 5 testes

- [ ] **Step 5: Ligar na engine**

Em `engine.ts`, adicionar ao import de `./camera`:

```ts
import { keyAction } from "./input"
```

Adicionar o campo junto dos outros privados (perto de `private reduceMotion = false`, linha 106):

```ts
  /** Desligado enquanto o PC do escritório está aberto. */
  private inputEnabled = true
```

Substituir `onKeyDown`/`onKeyUp` (linhas 264-276) por:

```ts
  /** Liga/desliga o teclado do mapa (o PC do escritório desliga ao abrir). */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled
    if (!enabled) this.keys.clear()
  }

  onKeyDown = (e: KeyboardEvent): void => {
    const action = keyAction(e.key, this.inputEnabled)
    if (action === "move") {
      this.keys.add(e.key.toLowerCase())
      this.target = null
      e.preventDefault()
    }
    if (action === "interact") this.tryInteract()
  }

  onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase())
  }
```

`onKeyUp` continua limpando sem checar o gate: se o teclado desligar com uma tecla presa, `setInputEnabled(false)` já esvaziou o set, e soltar depois não pode deixar resíduo.

- [ ] **Step 6: Confirmar que nada regrediu**

Run: `npx vitest run && npm run lint`
Expected: PASS — 11 arquivos, 70 testes.

- [ ] **Step 7: Commit**

```bash
git add src/features/office/world/input.ts src/features/office/world/input.test.ts src/features/office/world/engine.ts
git commit -m "feat(office): gate de teclado do mapa com interruptor de input"
```

---

## Task 3: Identidade dos assentos

Assentos hoje só têm `label` e posição no array. Ganham `id` estável derivado do tile e `kind`, e a engine passa a reportar o `Seat` inteiro ao sentar. `id` vem do tile (não do índice) porque o mapa vai mudar e a fatia 2 vai gravar mesa por usuário no banco.

**Files:**
- Modify: `frontend/src/features/office/world/map.ts:41-47` (interface `Seat`), `:293-309` (construção)
- Modify: `frontend/src/features/office/world/engine.ts:65-69` (`EngineCallbacks`), `:287-317` (`tryInteract`)
- Modify: `frontend/src/features/office/OfficeRoom.tsx:73` (callback `onInteract`)
- Test: `frontend/src/features/office/world/map.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type SeatKind = "pc" | "meeting" | "lounge"`
  - `Seat` com `id: string` e `kind: SeatKind`
  - `EngineCallbacks.onInteract?(seat: Seat | null): void`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/features/office/world/map.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { buildOfficeMap } from "./map"

const map = buildOfficeMap()

describe("assentos", () => {
  it("todo assento tem id único", () => {
    const ids = map.seats.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("id deriva do tile do assento, não do índice do array", () => {
    // Ilha em (26,6): o assento da esquerda cai no tile (26,9).
    expect(map.seats.some((s) => s.id === "ws-26-9")).toBe(true)
    // Cabine de foco mais alta: assento no tile (5,29).
    expect(map.seats.some((s) => s.id === "ws-5-29")).toBe(true)
  })

  it("estações, mesas individuais e cabines são kind 'pc' — 14 no total", () => {
    const pc = map.seats.filter((s) => s.kind === "pc")
    expect(pc).toHaveLength(14)
    for (const s of pc) expect(s.id.startsWith("ws-")).toBe(true)
  })

  it("sala de reunião é kind 'meeting'", () => {
    const meeting = map.seats.filter((s) => s.kind === "meeting")
    expect(meeting).toHaveLength(6)
    for (const s of meeting) expect(s.label).toBe("Sala de reunião")
  })

  it("sofá e copa são kind 'lounge' — não abrem PC", () => {
    const lounge = map.seats.filter((s) => s.kind === "lounge")
    expect(lounge).toHaveLength(4)
    for (const s of lounge) expect(s.kind).not.toBe("pc")
  })

  it("todo assento está dentro dos limites do mapa", () => {
    for (const seat of map.seats) {
      expect(seat.x).toBeGreaterThan(0)
      expect(seat.y).toBeGreaterThan(0)
      expect(seat.x).toBeLessThan(map.width)
      expect(seat.y).toBeLessThan(map.height)
    }
  })

  it("todo assento é alcançável a pé", () => {
    // O tile do assento é sólido de propósito — é a cadeira, e cadeira atravessável
    // seria pior. O que precisa valer é existir chão livre dentro do raio de
    // interação (26px, engine.ts:298), senão a cadeira fica inacessível.
    for (const seat of map.seats) {
      const tx = Math.floor(seat.x / 16)
      const ty = Math.floor(seat.y / 16)
      let alcancavel = false
      for (let dy = -2; dy <= 2 && !alcancavel; dy++) {
        for (let dx = -2; dx <= 2 && !alcancavel; dx++) {
          const x = tx + dx
          const y = ty + dy
          if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) continue
          if (map.collision[y * map.cols + x] !== 0) continue
          if (Math.hypot(x * 16 + 8 - seat.x, y * 16 + 8 - seat.y) <= 26) alcancavel = true
        }
      }
      expect(alcancavel, `assento ${seat.id} está inacessível`).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/office/world/map.test.ts`
Expected: FAIL — `expected undefined to be true` nos testes de `id`/`kind` (o campo não existe)

- [ ] **Step 3: Dar identidade aos assentos**

Em `map.ts`, substituir a interface `Seat` (linhas 41-47) por:

```ts
export type SeatKind = "pc" | "meeting" | "lounge"

export interface Seat {
  /**
   * Identificador estável, derivado do tile — não do índice do array. Índice
   * quebraria na primeira mudança de planta, e a mesa pessoal precisa persistir.
   */
  id: string
  /** Onde o avatar fica ao sentar (pés), em pixels do mundo. */
  x: number
  y: number
  facing: "up" | "down" | "left" | "right"
  label: string
  /** "pc" tem computador; só nesses o desktop pode abrir. */
  kind: SeatKind
}
```

Substituir o bloco de construção dos assentos (linhas 293-309) por:

```ts
  // Id vem do tile onde o assento está: sobrevive a mudanças de planta que não
  // movam a própria cadeira, ao contrário do índice do array.
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

  for (const [tx, ty] of islands) {
    addSeat("ws", tx * TILE + 8, (ty + 3) * TILE + 14, "up", "Estação de trabalho", "pc")
    addSeat("ws", (tx + 1) * TILE + 8, (ty + 3) * TILE + 14, "up", "Estação de trabalho", "pc")
  }
  for (let i = 0; i < 3; i++) {
    addSeat("ws", 5 * TILE + 8, (20 + i * 2) * TILE + 14, "up", "Mesa individual", "pc")
    addSeat("ws", 5 * TILE + 8, (29 + i * 3) * TILE + 14, "up", "Cabine de foco", "pc")
  }
  for (let i = 0; i < 3; i++) {
    addSeat("mt", (8 + i * 2) * TILE + 8, 7 * TILE + 14, "down", "Sala de reunião", "meeting")
    addSeat("mt", (8 + i * 2) * TILE + 8, 12 * TILE + 14, "up", "Sala de reunião", "meeting")
  }
  addSeat("lg", 43 * TILE, 27 * TILE, "down", "Sofá do lounge", "lounge")
  addSeat("lg", 46 * TILE, 27 * TILE, "down", "Sofá do lounge", "lounge")
  addSeat("lg", 44 * TILE + 8, 10 * TILE + 14, "up", "Mesa da copa", "lounge")
  addSeat("lg", 46 * TILE + 8, 10 * TILE + 14, "up", "Mesa da copa", "lounge")
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/office/world/map.test.ts`
Expected: PASS — 7 testes

- [ ] **Step 5: Fazer a engine reportar o assento**

Em `engine.ts`, trocar o import de `./map` para incluir `Seat`:

```ts
import { type OfficeMap, type Seat, isSolid, zoneAt } from "./map"
```

Em `EngineCallbacks` (linha 68), trocar a assinatura:

```ts
  /** Assento ao sentar, `null` ao levantar. */
  onInteract?(seat: Seat | null): void
```

Em `tryInteract` (linhas 287-317), trocar as duas chamadas do callback:

```ts
    if (me.seatIndex >= 0) {
      me.seatIndex = -1
      me.anim = "idle"
      this.cb.onInteract?.(null)
      return
    }
```

e, no fim do método:

```ts
    this.cb.onInteract?.(seat)
```

Trocar também a linha que escolhe a animação, agora que `kind` existe — sofá e copa não digitam:

```ts
    me.anim = seat.kind === "lounge" ? "idle" : "type"
```

- [ ] **Step 6: Ajustar o consumidor**

Em `OfficeRoom.tsx`, na criação da engine (linha 73), trocar:

```ts
      onInteract: (seat) => setToast(seat ? seat.label : "De pé"),
```

- [ ] **Step 7: Rodar tudo e verificar no navegador**

Run: `npx vitest run && npm run lint`
Expected: PASS — 12 arquivos, 76 testes.

Run: `npm run dev`, abrir `/app/office`, andar até uma cadeira, apertar `E` duas vezes.
Expected: toast mostra o rótulo do assento ao sentar e "De pé" ao levantar; no sofá o avatar não digita.

- [ ] **Step 8: Commit**

```bash
git add src/features/office/world/map.ts src/features/office/world/map.test.ts src/features/office/world/engine.ts src/features/office/OfficeRoom.tsx
git commit -m "feat(office): assentos com id estável e kind, engine reporta o assento"
```

---

## Task 4: Foco de câmera

A engine ganha a capacidade de travar a câmera num ponto com zoom. A escala continua inteira e troca de uma vez — a troca fica escondida atrás do fade do boot (Task 10).

**Files:**
- Modify: `frontend/src/features/office/world/engine.ts:565-598` (`resize`, `updateCamera`) e o bloco de campos privados (~linha 96-106)

**Interfaces:**
- Consumes: `integerScale`, `viewportFor`, `cameraTarget` (Task 1).
- Produces:
  - `FOCUS_MAX = 8` e `focusScale(cssW: number, cssH: number, zoom: number): number` em `world/camera.ts`
  - `OfficeEngine.focusOn(x: number, y: number, zoom?: number): void`
  - `OfficeEngine.clearFocus(): void`

- [ ] **Step 1: Escrever o teste que falha**

A engine não é instanciável em jsdom, então o que se testa é a regra de escala com teto elevado — que é o que o foco usa. Acrescentar ao fim de `frontend/src/features/office/world/camera.test.ts`:

```ts
describe("escala sob foco", () => {
  it("com teto 8, uma tela média chega a mais zoom do que o normal", () => {
    const cssW = 1400
    const cssH = 900
    expect(integerScale(cssW, cssH)).toBe(4)
    expect(integerScale(cssW, cssH, 8)).toBe(4)
    expect(integerScale(2600, 1700, 8)).toBe(8)
  })

  it("o teto não reduz a escala abaixo do normal", () => {
    for (const [w, h] of [[600, 400], [1000, 700], [1920, 1080]] as const) {
      expect(integerScale(w, h, 8)).toBeGreaterThanOrEqual(integerScale(w, h))
    }
  })
})
```

- [ ] **Step 2: Rodar o teste**

Run: `npx vitest run src/features/office/world/camera.test.ts`
Expected: PASS. Estes dois casos são guarda de regressão, não TDD: o contrato do teto é da Task 1, e aqui se fixa que o foco não pode reduzir a escala nem escapar do inteiro. Se falhar, o defeito é na `integerScale` da Task 1 — corrija lá antes de seguir.

- [ ] **Step 3: Implementar foco na engine**

Em `engine.ts`, junto dos campos de câmera (perto da linha 96), adicionar:

```ts
  /** Ponto travado da câmera enquanto o PC está aberto. */
  private focus: { x: number; y: number; zoom: number } | null = null
  private cssW = 320
  private cssH = 200
```

Extrair a aplicação de escala num método privado e fazer `resize` usá-lo. Substituir o `resize` da Task 1 por:

```ts
  resize(cssW: number, cssH: number): void {
    this.cssW = cssW
    this.cssH = cssH
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
    this.canvas.width = cssW * dpr
    this.canvas.height = cssH * dpr
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = false
    this.applyScale()
  }

  /** Recalcula escala e viewport. Escala inteira, sempre. */
  private applyScale(): void {
    this.scale = this.focus
      ? focusScale(this.cssW, this.cssH, this.focus.zoom)
      : integerScale(this.cssW, this.cssH)
    const { viewW, viewH } = viewportFor(this.cssW, this.cssH, this.scale)
    this.viewW = viewW
    this.viewH = viewH
    this.lightBuf.width = Math.max(1, Math.ceil(this.viewW / 2))
    this.lightBuf.height = Math.max(1, Math.ceil(this.viewH / 2))
  }

  /**
   * Trava a câmera num ponto do mundo com zoom. `zoom` é piso, não alvo exato:
   * `focusScale` mantém a escala inteira e dentro do teto.
   */
  focusOn(x: number, y: number, zoom = 6): void {
    this.focus = { x, y, zoom }
    this.applyScale()
  }

  clearFocus(): void {
    this.focus = null
    this.applyScale()
  }
```

Em `updateCamera`, usar o ponto de foco quando existir:

```ts
  private updateCamera(): void {
    const anchor = this.focus ?? this.me
    if (!anchor) return
    const { x: cx, y: cy } = cameraTarget(
      anchor.x, anchor.y, this.viewW, this.viewH, this.map.width, this.map.height,
    )
    const ease = this.reduceMotion ? 1 : 0.14
    this.camX += (cx - this.camX) * ease
    this.camY += (cy - this.camY) * ease
    // Arredondar a câmera para inteiro é o que impede o mundo de tremer.
    this.camX = Math.round(this.camX * 2) / 2
    this.camY = Math.round(this.camY * 2) / 2
  }
```

- [ ] **Step 4: Rodar tudo**

Run: `npx vitest run && npm run lint`
Expected: PASS — 12 arquivos, 78 testes.

- [ ] **Step 5: Verificar o zoom manualmente**

Adicionar temporariamente em `OfficeRoom.tsx`, dentro do `onInteract`, uma chamada de teste:

```ts
      onInteract: (seat) => {
        setToast(seat ? seat.label : "De pé")
        if (seat) engineRef.current?.focusOn(seat.x, seat.y, 6)
        else engineRef.current?.clearFocus()
      },
```

Run: `npm run dev`, sentar numa cadeira.
Expected: câmera aproxima e trava na cadeira; levantar volta ao normal; nenhum tremor.
**Remover a alteração temporária depois de verificar** — a fiação real é a Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/features/office/world/engine.ts src/features/office/world/camera.test.ts
git commit -m "feat(office): câmera com foco e zoom travado num ponto do mundo"
```

---

## Task 5: Mesa pessoal

Resolve qual das 14 estações pertence ao usuário. Nesta fatia é derivado do id do usuário — determinístico, sem backend. A fatia 2 troca só o corpo destas funções.

**Files:**
- Create: `frontend/src/features/office/pc/desk.ts`
- Test: `frontend/src/features/office/pc/desk.test.ts`

**Interfaces:**
- Consumes: `Seat`, `SeatKind` de `../world/map` (Task 3).
- Produces:
  - `pcSeats(seats: Seat[]): Seat[]`
  - `myDeskId(userId: string, seats: Seat[]): string | null`
  - `isMyDesk(userId: string, seat: Seat, seats: Seat[]): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/features/office/pc/desk.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { buildOfficeMap } from "../world/map"
import { isMyDesk, myDeskId, pcSeats } from "./desk"

const map = buildOfficeMap()

describe("pcSeats", () => {
  it("devolve só assentos com computador", () => {
    const seats = pcSeats(map.seats)
    expect(seats).toHaveLength(14)
    for (const s of seats) expect(s.kind).toBe("pc")
  })

  it("ordena por id — a ordem não pode depender da construção do mapa", () => {
    const ids = pcSeats(map.seats).map((s) => s.id)
    expect(ids).toEqual([...ids].sort())
  })

  it("ordem estável mesmo se a lista de entrada vier embaralhada", () => {
    const shuffled = [...map.seats].reverse()
    expect(pcSeats(shuffled).map((s) => s.id)).toEqual(pcSeats(map.seats).map((s) => s.id))
  })
})

describe("myDeskId", () => {
  it("é determinístico — a mesma pessoa cai sempre na mesma mesa", () => {
    const id = myDeskId("d29b35ed-0895-4355-9148-d48fe14b4940", map.seats)
    for (let i = 0; i < 20; i++) {
      expect(myDeskId("d29b35ed-0895-4355-9148-d48fe14b4940", map.seats)).toBe(id)
    }
  })

  it("resolve para um assento que existe e tem computador", () => {
    const id = myDeskId("qualquer-usuario", map.seats)
    const seat = map.seats.find((s) => s.id === id)
    expect(seat).toBeDefined()
    expect(seat?.kind).toBe("pc")
  })

  it("usuários diferentes se espalham pelas mesas — não colapsa numa só", () => {
    const ids = new Set(
      Array.from({ length: 200 }, (_, i) => myDeskId(`user-${i}`, map.seats)),
    )
    expect(ids.size).toBeGreaterThan(8)
  })

  it("sem assento com computador, devolve null", () => {
    const semPc = map.seats.filter((s) => s.kind !== "pc")
    expect(myDeskId("alguem", semPc)).toBeNull()
  })

  it("id de usuário vazio devolve null — sem sessão, sem mesa", () => {
    expect(myDeskId("", map.seats)).toBeNull()
  })
})

describe("isMyDesk", () => {
  it("verdadeiro só para o assento resolvido", () => {
    const userId = "ana-123"
    const mine = map.seats.find((s) => s.id === myDeskId(userId, map.seats))!
    expect(isMyDesk(userId, mine, map.seats)).toBe(true)

    const outra = pcSeats(map.seats).find((s) => s.id !== mine.id)!
    expect(isMyDesk(userId, outra, map.seats)).toBe(false)
  })

  it("falso para sofá, copa e sala de reunião", () => {
    const userId = "bruno-456"
    for (const kind of ["lounge", "meeting"] as const) {
      const seat = map.seats.find((s) => s.kind === kind)!
      expect(isMyDesk(userId, seat, map.seats)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/features/office/pc/desk.test.ts`
Expected: FAIL — `Failed to resolve import "./desk"`

- [ ] **Step 3: Implementar `desk.ts`**

Criar `frontend/src/features/office/pc/desk.ts`:

```ts
// Qual mesa pertence a qual pessoa.
//
// Nesta fatia a mesa é derivada do id do usuário: determinístico, sem migration
// e sem endpoint. A fatia 2 substitui o corpo destas três funções por uma
// consulta ao backend (tabela DeskAssignment) sem que o window manager saiba.
//
// Limite conhecido e aceito: com mais gente que mesa, duas pessoas resolvem para
// a mesma mesa. A UI não promete exclusividade enquanto isso não vier do banco.
import type { Seat } from "../world/map"

/** FNV-1a 32 bits: barato, estável entre execuções e bem espalhado. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Assentos com computador, em ordem estável (por id, não por construção). */
export function pcSeats(seats: Seat[]): Seat[] {
  return seats.filter((s) => s.kind === "pc").sort((a, b) => a.id.localeCompare(b.id))
}

export function myDeskId(userId: string, seats: Seat[]): string | null {
  if (!userId) return null
  const pool = pcSeats(seats)
  if (pool.length === 0) return null
  return pool[hash(userId) % pool.length].id
}

export function isMyDesk(userId: string, seat: Seat, seats: Seat[]): boolean {
  if (seat.kind !== "pc") return false
  return myDeskId(userId, seats) === seat.id
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/features/office/pc/desk.test.ts`
Expected: PASS — 10 testes

- [ ] **Step 5: Commit**

```bash
git add src/features/office/pc/desk.ts src/features/office/pc/desk.test.ts
git commit -m "feat(office): resolve a mesa pessoal a partir do id do usuário"
```

---

## Task 6: Window manager

O coração da feature: estado e regras das janelas. Lógica pura em zustand, sem DOM — é aqui que mora a maior parte da complexidade e por isso a maior cobertura.

**Files:**
- Create: `frontend/src/features/office/pc/pc.store.ts`
- Test: `frontend/src/features/office/pc/pc.store.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type PcState = "off" | "booting" | "desktop"`
  - `interface PcWindow { id: string; appId: string; x: number; y: number; w: number; h: number; z: number; minimized: boolean }`
  - `usePcStore` com: `state`, `seatId`, `windows`, `focusedId`, `expandedId`, `openFolderId`, `boot(seatId)`, `ready()`, `shutdown()`, `openApp(appId, size)`, `close(id)`, `focus(id)`, `minimize(id)`, `restore(id)`, `move(id, x, y)`, `resizeWindow(id, w, h)`, `expand(id)`, `collapse()`, `openFolder(id)`
  - `CASCADE_STEP = 26`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/features/office/pc/pc.store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"

import { CASCADE_SLOTS, CASCADE_STEP, usePcStore } from "./pc.store"

const SIZE = { w: 900, h: 600 }
const reset = () => usePcStore.getState().shutdown()
const get = () => usePcStore.getState()
const win = (id: string) => get().windows.find((w) => w.id === id)

beforeEach(reset)

describe("ciclo de vida", () => {
  it("começa desligado e sem assento", () => {
    expect(get().state).toBe("off")
    expect(get().seatId).toBeNull()
    expect(get().windows).toHaveLength(0)
  })

  it("boot guarda o assento e entra em booting", () => {
    get().boot("ws-26-9")
    expect(get().state).toBe("booting")
    expect(get().seatId).toBe("ws-26-9")
  })

  it("ready leva booting para desktop", () => {
    get().boot("ws-26-9")
    get().ready()
    expect(get().state).toBe("desktop")
  })

  it("ready sem boot não faz nada — não dá para ligar a tela do nada", () => {
    get().ready()
    expect(get().state).toBe("off")
  })

  it("shutdown limpa tudo: estado, assento, janelas, foco e pasta", () => {
    get().boot("ws-26-9")
    get().ready()
    get().openApp("boards", SIZE)
    get().openFolder("trabalho")
    get().expand("boards")
    get().shutdown()
    expect(get()).toMatchObject({
      state: "off",
      seatId: null,
      windows: [],
      focusedId: null,
      expandedId: null,
      openFolderId: null,
    })
  })
})

describe("abrir e fechar", () => {
  beforeEach(() => {
    get().boot("ws-26-9")
    get().ready()
  })

  it("openApp cria a janela com o tamanho pedido, focada", () => {
    get().openApp("boards", SIZE)
    expect(get().windows).toHaveLength(1)
    expect(win("boards")).toMatchObject({ appId: "boards", w: 900, h: 600, minimized: false })
    expect(get().focusedId).toBe("boards")
  })

  it("uma janela por app: reabrir foca a existente em vez de duplicar", () => {
    get().openApp("boards", SIZE)
    get().openApp("comercial", SIZE)
    get().openApp("boards", SIZE)
    expect(get().windows).toHaveLength(2)
    expect(get().focusedId).toBe("boards")
  })

  it("reabrir app minimizado restaura", () => {
    get().openApp("boards", SIZE)
    get().minimize("boards")
    get().openApp("boards", SIZE)
    expect(win("boards")?.minimized).toBe(false)
    expect(get().focusedId).toBe("boards")
  })

  it("janelas novas entram em cascata para não empilhar no mesmo pixel", () => {
    get().openApp("boards", SIZE)
    get().openApp("comercial", SIZE)
    expect(win("comercial")!.x).toBe(win("boards")!.x + CASCADE_STEP)
    expect(win("comercial")!.y).toBe(win("boards")!.y + CASCADE_STEP)
  })

  it("close remove a janela", () => {
    get().openApp("boards", SIZE)
    get().close("boards")
    expect(get().windows).toHaveLength(0)
    expect(get().focusedId).toBeNull()
  })

  it("fechar a focada passa o foco para a janela de topo restante", () => {
    get().openApp("boards", SIZE)
    get().openApp("comercial", SIZE)
    get().focus("boards")
    get().close("boards")
    expect(get().focusedId).toBe("comercial")
  })

  it("fechar a janela expandida colapsa também", () => {
    get().openApp("boards", SIZE)
    get().expand("boards")
    get().close("boards")
    expect(get().expandedId).toBeNull()
  })

  it("reabrir depois de fechar não cai sobre uma janela ainda aberta", () => {
    get().openApp("boards", SIZE)
    get().openApp("comercial", SIZE)
    get().openApp("reports", SIZE)
    get().close("boards")
    get().openApp("myday", SIZE)
    const pos = get().windows.map((w) => `${w.x},${w.y}`)
    expect(new Set(pos).size).toBe(pos.length)
  })

  it("a cascata dá a volta em vez de andar para fora da tela", () => {
    for (const id of ["boards", "comercial", "reports", "myday", "poker", "portfolio", "avatar"]) {
      get().openApp(id, SIZE)
    }
    const maxX = Math.max(...get().windows.map((w) => w.x))
    expect(maxX).toBeLessThanOrEqual(40 + (CASCADE_SLOTS - 1) * CASCADE_STEP)
  })

  it("move e resizeWindow em id inexistente não trocam a referência de windows", () => {
    get().openApp("boards", SIZE)
    const antes = get().windows
    get().move("fantasma", 10, 10)
    get().resizeWindow("fantasma", 500, 500)
    expect(get().windows).toBe(antes)
  })

  it("ações em id inexistente são no-op, não crash", () => {
    expect(() => {
      get().close("fantasma")
      get().focus("fantasma")
      get().minimize("fantasma")
      get().restore("fantasma")
      get().move("fantasma", 10, 10)
      get().resizeWindow("fantasma", 10, 10)
      get().expand("fantasma")
    }).not.toThrow()
    expect(get().windows).toHaveLength(0)
  })

  it("openApp com o PC desligado é ignorado", () => {
    get().shutdown()
    get().openApp("boards", SIZE)
    expect(get().windows).toHaveLength(0)
  })
})

describe("ordem de empilhamento", () => {
  beforeEach(() => {
    get().boot("ws-26-9")
    get().ready()
    get().openApp("boards", SIZE)
    get().openApp("comercial", SIZE)
  })

  it("a última aberta fica na frente", () => {
    expect(win("comercial")!.z).toBeGreaterThan(win("boards")!.z)
  })

  it("focar traz para a frente", () => {
    get().focus("boards")
    expect(win("boards")!.z).toBeGreaterThan(win("comercial")!.z)
    expect(get().focusedId).toBe("boards")
  })

  it("z nunca repete entre janelas", () => {
    get().focus("boards")
    get().focus("comercial")
    get().focus("boards")
    const zs = get().windows.map((w) => w.z)
    expect(new Set(zs).size).toBe(zs.length)
  })

  it("focar janela minimizada restaura", () => {
    get().minimize("boards")
    get().focus("boards")
    expect(win("boards")!.minimized).toBe(false)
  })
})

describe("minimizar e restaurar", () => {
  beforeEach(() => {
    get().boot("ws-26-9")
    get().ready()
    get().openApp("boards", SIZE)
    get().openApp("comercial", SIZE)
  })

  it("minimizar tira o foco e passa para a de topo visível", () => {
    get().minimize("comercial")
    expect(win("comercial")!.minimized).toBe(true)
    expect(get().focusedId).toBe("boards")
  })

  it("minimizar a última visível deixa sem foco", () => {
    get().minimize("comercial")
    get().minimize("boards")
    expect(get().focusedId).toBeNull()
  })

  it("minimizar a expandida colapsa — não pode ficar em tela cheia escondida", () => {
    get().expand("comercial")
    get().minimize("comercial")
    expect(get().expandedId).toBeNull()
  })

  it("restaurar devolve foco e traz para a frente", () => {
    get().minimize("boards")
    get().restore("boards")
    expect(win("boards")!.minimized).toBe(false)
    expect(get().focusedId).toBe("boards")
    expect(win("boards")!.z).toBeGreaterThan(win("comercial")!.z)
  })
})

describe("mover e redimensionar", () => {
  beforeEach(() => {
    get().boot("ws-26-9")
    get().ready()
    get().openApp("boards", SIZE)
  })

  it("move grava a posição", () => {
    get().move("boards", 120, 64)
    expect(win("boards")).toMatchObject({ x: 120, y: 64 })
  })

  it("move não deixa a janela sair pela esquerda ou por cima", () => {
    get().move("boards", -500, -500)
    expect(win("boards")!.x).toBeGreaterThanOrEqual(0)
    expect(win("boards")!.y).toBeGreaterThanOrEqual(0)
  })

  it("resizeWindow respeita o mínimo de 320×240", () => {
    get().resizeWindow("boards", 10, 10)
    expect(win("boards")).toMatchObject({ w: 320, h: 240 })
  })

  it("resizeWindow aceita valores acima do mínimo", () => {
    get().resizeWindow("boards", 1024, 720)
    expect(win("boards")).toMatchObject({ w: 1024, h: 720 })
  })
})

describe("expandir e colapsar", () => {
  beforeEach(() => {
    get().boot("ws-26-9")
    get().ready()
    get().openApp("boards", SIZE)
  })

  it("expand marca a janela e também a foca", () => {
    get().expand("boards")
    expect(get().expandedId).toBe("boards")
    expect(get().focusedId).toBe("boards")
  })

  it("collapse desmarca sem fechar a janela", () => {
    get().expand("boards")
    get().collapse()
    expect(get().expandedId).toBeNull()
    expect(get().windows).toHaveLength(1)
  })

  it("expand em janela minimizada restaura antes", () => {
    get().minimize("boards")
    get().expand("boards")
    expect(win("boards")!.minimized).toBe(false)
    expect(get().expandedId).toBe("boards")
  })

  it("só uma janela expandida por vez", () => {
    get().openApp("comercial", SIZE)
    get().expand("boards")
    get().expand("comercial")
    expect(get().expandedId).toBe("comercial")
  })
})

describe("pastas do desktop", () => {
  it("openFolder abre e fecha com null", () => {
    get().boot("ws-26-9")
    get().ready()
    get().openFolder("marketing")
    expect(get().openFolderId).toBe("marketing")
    get().openFolder(null)
    expect(get().openFolderId).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/features/office/pc/pc.store.test.ts`
Expected: FAIL — `Failed to resolve import "./pc.store"`

- [ ] **Step 3: Implementar `pc.store.ts`**

Criar `frontend/src/features/office/pc/pc.store.ts`:

```ts
// Estado e regras do PC do escritório.
//
// Tudo que decide comportamento de janela vive aqui, sem DOM: assim as regras
// chatas (quem herda o foco ao fechar, expandida não pode ficar minimizada) são
// provadas em teste em vez de descobertas no navegador.
import { create } from "zustand"

export type PcState = "off" | "booting" | "desktop"

export interface PcWindow {
  /** Igual ao appId: uma janela por app. */
  id: string
  appId: string
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
}

/** Deslocamento entre janelas novas, para não empilharem no mesmo pixel. */
export const CASCADE_STEP = 26
/** Quantas posições a cascata usa antes de dar a volta — não sai da tela. */
export const CASCADE_SLOTS = 6
const FIRST_X = 40
const FIRST_Y = 32
const MIN_W = 320
const MIN_H = 240

interface PcStore {
  state: PcState
  seatId: string | null
  windows: PcWindow[]
  focusedId: string | null
  expandedId: string | null
  openFolderId: string | null

  boot: (seatId: string) => void
  ready: () => void
  shutdown: () => void

  openApp: (appId: string, size: { w: number; h: number }) => void
  close: (id: string) => void
  focus: (id: string) => void
  minimize: (id: string) => void
  restore: (id: string) => void
  move: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, w: number, h: number) => void
  expand: (id: string) => void
  collapse: () => void
  openFolder: (id: string | null) => void
}

/** Maior z entre as janelas — o contador vive nos dados, não em variável solta. */
function topZ(windows: PcWindow[]): number {
  return windows.reduce((max, w) => Math.max(max, w.z), 0)
}

/**
 * Primeira posição de cascata livre. Contar janelas abertas não serve: fechar a
 * primeira e abrir outra devolveria a posição de uma janela ainda aberta.
 */
function cascadeSlot(windows: PcWindow[]): number {
  const ocupadas = new Set(windows.map((w) => `${w.x},${w.y}`))
  for (let i = 0; i < CASCADE_SLOTS; i++) {
    if (!ocupadas.has(`${FIRST_X + i * CASCADE_STEP},${FIRST_Y + i * CASCADE_STEP}`)) return i
  }
  return windows.length % CASCADE_SLOTS
}

/** Janela visível mais à frente: quem herda o foco. */
function topVisibleId(windows: PcWindow[], skipId?: string): string | null {
  const candidates = windows.filter((w) => !w.minimized && w.id !== skipId)
  if (candidates.length === 0) return null
  return candidates.reduce((top, w) => (w.z > top.z ? w : top)).id
}

export const usePcStore = create<PcStore>((set, get) => ({
  state: "off",
  seatId: null,
  windows: [],
  focusedId: null,
  expandedId: null,
  openFolderId: null,

  boot: (seatId) => set({ state: "booting", seatId }),

  ready: () => set((s) => (s.state === "booting" ? { state: "desktop" } : s)),

  shutdown: () =>
    set({
      state: "off",
      seatId: null,
      windows: [],
      focusedId: null,
      expandedId: null,
      openFolderId: null,
    }),

  openApp: (appId, size) => {
    const s = get()
    if (s.state !== "desktop") return
    const existing = s.windows.find((w) => w.id === appId)
    if (existing) {
      get().restore(appId)
      return
    }
    const step = cascadeSlot(s.windows) * CASCADE_STEP
    set({
      windows: [
        ...s.windows,
        {
          id: appId,
          appId,
          x: FIRST_X + step,
          y: FIRST_Y + step,
          w: Math.max(MIN_W, size.w),
          h: Math.max(MIN_H, size.h),
          z: topZ(s.windows) + 1,
          minimized: false,
        },
      ],
      focusedId: appId,
      openFolderId: null,
    })
  },

  close: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      const windows = s.windows.filter((w) => w.id !== id)
      return {
        windows,
        focusedId: s.focusedId === id ? topVisibleId(windows) : s.focusedId,
        expandedId: s.expandedId === id ? null : s.expandedId,
      }
    }),

  focus: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      const z = topZ(s.windows) + 1
      return {
        windows: s.windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)),
        focusedId: id,
      }
    }),

  minimize: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      const windows = s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w))
      return {
        windows,
        focusedId: s.focusedId === id ? topVisibleId(windows) : s.focusedId,
        expandedId: s.expandedId === id ? null : s.expandedId,
      }
    }),

  restore: (id) => get().focus(id),

  // Os guardas de id inexistente devolvem o mesmo estado de propósito: array novo
  // sem mudança de valor faria todo assinante do store re-renderizar de graça.
  move: (id, x, y) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      return {
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, x: Math.max(0, x), y: Math.max(0, y) } : w,
        ),
      }
    }),

  resizeWindow: (id, nextW, nextH) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      return {
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, w: Math.max(MIN_W, nextW), h: Math.max(MIN_H, nextH) } : w,
        ),
      }
    }),

  expand: (id) => {
    if (!get().windows.some((w) => w.id === id)) return
    get().focus(id)
    set({ expandedId: id })
  },

  collapse: () => set({ expandedId: null }),

  openFolder: (id) => set({ openFolderId: id }),
}))
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/features/office/pc/pc.store.test.ts`
Expected: PASS — 33 testes

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run && npm run lint`
Expected: PASS — 14 arquivos, 121 testes.

- [ ] **Step 6: Commit**

```bash
git add src/features/office/pc/pc.store.ts src/features/office/pc/pc.store.test.ts
git commit -m "feat(office): window manager do PC em store isolada"
```

---

## Task 7: Chrome Win98 e janela

Visual e mecânica da janela: bevel, titlebar, arrastar, redimensionar, `_ □ X`.

**Files:**
- Create: `frontend/src/features/office/pc/win98.css`, `frontend/src/features/office/pc/Win98Window.tsx`
- Test: `frontend/src/features/office/pc/Win98Window.test.tsx`
- Modify: nada fora de `pc/` — `win98.css` é importado pelo `Win98Desktop.tsx` (Task 10)

**Interfaces:**
- Consumes: `usePcStore`, `PcWindow` (Task 6).
- Produces: `Win98Window({ win, title, fullscreen, children }: { win: PcWindow; title: string; fullscreen?: boolean; children: ReactNode })`. Com `fullscreen`, a janela ocupa a camada inteira (`inset: 0`) e a alça de resize não aparece — é assim que a Task 10 renderiza a janela expandida, sem sentinela mágica na geometria.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/features/office/pc/Win98Window.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { usePcStore } from "./pc.store"
import { Win98Window } from "./Win98Window"

const boot = () => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
  usePcStore.getState().openApp("boards", { w: 900, h: 600 })
}

const janela = () => usePcStore.getState().windows.find((w) => w.id === "boards")!

function montar() {
  return render(
    <Win98Window win={janela()} title="Boards">
      <p>conteúdo do boards</p>
    </Win98Window>,
  )
}

beforeEach(boot)

describe("<Win98Window />", () => {
  it("mostra o título e o conteúdo", () => {
    montar()
    expect(screen.getByText("Boards")).toBeInTheDocument()
    expect(screen.getByText("conteúdo do boards")).toBeInTheDocument()
  })

  it("posiciona e dimensiona por left/top/width/height — nunca por transform", () => {
    const { container } = montar()
    const root = container.firstElementChild as HTMLElement
    expect(root.style.left).toBe("40px")
    expect(root.style.top).toBe("32px")
    expect(root.style.width).toBe("900px")
    expect(root.style.height).toBe("600px")
    // Transform num ancestral viraria containing block e quebraria os modais
    // com position: fixed das páginas embutidas.
    expect(root.style.transform).toBe("")
  })

  it("botão minimizar minimiza", async () => {
    montar()
    await userEvent.click(screen.getByRole("button", { name: "Minimizar" }))
    expect(janela().minimized).toBe(true)
  })

  it("botão maximizar expande", async () => {
    montar()
    await userEvent.click(screen.getByRole("button", { name: "Maximizar" }))
    expect(usePcStore.getState().expandedId).toBe("boards")
  })

  it("botão fechar fecha", async () => {
    montar()
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }))
    expect(usePcStore.getState().windows).toHaveLength(0)
  })

  it("duplo clique na titlebar alterna expandir e colapsar", async () => {
    montar()
    const titlebar = screen.getByTestId("win98-titlebar")
    await userEvent.dblClick(titlebar)
    expect(usePcStore.getState().expandedId).toBe("boards")
    await userEvent.dblClick(titlebar)
    expect(usePcStore.getState().expandedId).toBeNull()
  })

  it("arrastar a titlebar move a janela", () => {
    montar()
    const titlebar = screen.getByTestId("win98-titlebar")
    fireEvent.pointerDown(titlebar, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 160, clientY: 130, pointerId: 1 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(janela()).toMatchObject({ x: 100, y: 62 })
  })

  it("arrastar a alça redimensiona", () => {
    montar()
    const handle = screen.getByTestId("win98-resize")
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 2 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 50, pointerId: 2 })
    fireEvent.pointerUp(window, { pointerId: 2 })
    expect(janela()).toMatchObject({ w: 1000, h: 650 })
  })

  it("desmontar no meio do arraste não deixa listener solto", () => {
    const { unmount } = montar()
    fireEvent.pointerDown(screen.getByTestId("win98-titlebar"), {
      clientX: 100, clientY: 100, pointerId: 3,
    })
    unmount()
    const antes = janela()
    fireEvent.pointerMove(window, { clientX: 300, clientY: 300, pointerId: 3 })
    expect(janela()).toEqual(antes)
  })

  it("clicar no corpo da janela foca", async () => {
    usePcStore.getState().openApp("comercial", { w: 800, h: 500 })
    montar()
    await userEvent.click(screen.getByText("conteúdo do boards"))
    expect(usePcStore.getState().focusedId).toBe("boards")
  })

  it("a janela focada recebe a classe de titlebar ativa", () => {
    montar()
    expect(screen.getByTestId("win98-titlebar").className).toContain("win98-titlebar--active")
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/features/office/pc/Win98Window.test.tsx`
Expected: FAIL — `Failed to resolve import "./Win98Window"`

- [ ] **Step 3: Escrever `win98.css`**

Criar `frontend/src/features/office/pc/win98.css`:

```css
/* Visual do Windows 98 — tokens e chrome.
   Escopado em .win98 para não vazar no resto do app. Nesta fatia estiliza só a
   moldura; o conteúdo das páginas continua com o visual moderno (fatia 2). */
.win98 {
  --w98-face: #c0c0c0;
  --w98-light: #ffffff;
  --w98-shadow: #808080;
  --w98-dark: #000000;
  --w98-title: #000080;
  --w98-title-text: #ffffff;
  --w98-title-idle: #808080;
  --w98-desktop: #008080;
  --w98-font: "MS Sans Serif", "Pixelated MS Sans Serif", Tahoma, Verdana, sans-serif;

  font-family: var(--w98-font);
  font-size: 12px;
  color: var(--w98-dark);
  -webkit-font-smoothing: none;
}

/* Relevo padrão do 98: claro em cima/esquerda, escuro em baixo/direita. */
.win98-raised {
  background: var(--w98-face);
  border-top: 2px solid var(--w98-light);
  border-left: 2px solid var(--w98-light);
  border-right: 2px solid var(--w98-dark);
  border-bottom: 2px solid var(--w98-dark);
  box-shadow: inset -1px -1px 0 var(--w98-shadow), inset 1px 1px 0 var(--w98-face);
}

.win98-sunken {
  background: var(--w98-light);
  border-top: 2px solid var(--w98-shadow);
  border-left: 2px solid var(--w98-shadow);
  border-right: 2px solid var(--w98-light);
  border-bottom: 2px solid var(--w98-light);
  box-shadow: inset 1px 1px 0 var(--w98-dark);
}

.win98-titlebar {
  background: var(--w98-title-idle);
  color: var(--w98-title-text);
  font-weight: 700;
  letter-spacing: 0.2px;
  cursor: default;
  user-select: none;
}

.win98-titlebar--active {
  background: linear-gradient(90deg, var(--w98-title) 0%, #1084d0 100%);
}

.win98-btn {
  min-width: 16px;
  height: 14px;
  background: var(--w98-face);
  border-top: 1px solid var(--w98-light);
  border-left: 1px solid var(--w98-light);
  border-right: 1px solid var(--w98-dark);
  border-bottom: 1px solid var(--w98-dark);
  font-family: var(--w98-font);
  font-size: 10px;
  line-height: 1;
  display: grid;
  place-items: center;
}

.win98-btn:active {
  border-top-color: var(--w98-dark);
  border-left-color: var(--w98-dark);
  border-right-color: var(--w98-light);
  border-bottom-color: var(--w98-light);
}

.win98-resize {
  cursor: nwse-resize;
  width: 14px;
  height: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .win98 * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Importar o CSS **do componente**, no topo de `Win98Desktop.tsx` (Task 10):

```ts
import "./win98.css"
```

Não usar `@import` em `src/index.css`: um `@import` depois de outras regras é descartado
silenciosamente pelo PostCSS/Tailwind — o bundle de produção sai sem uma linha do visual
98 e a feature renderiza pelada, sem erro nenhum no console. Importar do TSX deixa o
Vite garantir a inclusão e mantém o CSS ao lado da feature que o usa.

- [ ] **Step 4: Implementar `Win98Window.tsx`**

Criar `frontend/src/features/office/pc/Win98Window.tsx`:

```tsx
// Janela do desktop 98: moldura, arrastar, redimensionar, _ □ X.
//
// Posiciona por left/top/width/height, nunca por transform: transform num
// ancestral vira containing block e faria os modais (position: fixed) das
// páginas embutidas se posicionarem dentro da janela em vez da viewport.
import { useEffect, useRef, type ReactNode } from "react"

import { usePcStore, type PcWindow } from "./pc.store"

export function Win98Window({
  win,
  title,
  fullscreen = false,
  children,
}: {
  win: PcWindow
  title: string
  /** Ocupa a camada inteira (usado pela janela expandida). */
  fullscreen?: boolean
  children: ReactNode
}) {
  const focusedId = usePcStore((s) => s.focusedId)
  const expandedId = usePcStore((s) => s.expandedId)
  const move = usePcStore((s) => s.move)
  const resizeWindow = usePcStore((s) => s.resizeWindow)
  const focus = usePcStore((s) => s.focus)
  const minimize = usePcStore((s) => s.minimize)
  const expand = usePcStore((s) => s.expand)
  const collapse = usePcStore((s) => s.collapse)
  const close = usePcStore((s) => s.close)

  const active = focusedId === win.id
  const expanded = expandedId === win.id
  const origin = useRef({ px: 0, py: 0, x: 0, y: 0, w: 0, h: 0 })

  // Os listeners ficam no window, não no elemento: arraste rápido sai de cima da
  // titlebar e não pode perder o rastro. Guardar o teardown num ref é o que
  // permite desligá-los se a janela fechar no meio do arraste.
  const stopTracking = useRef<(() => void) | null>(null)
  useEffect(() => () => stopTracking.current?.(), [])

  const track = (e: React.PointerEvent, onMove: (ev: PointerEvent) => void) => {
    focus(win.id)
    origin.current = { px: e.clientX, py: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h }
    stopTracking.current?.()
    const up = () => stopTracking.current?.()
    stopTracking.current = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", up)
      stopTracking.current = null
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", up)
  }

  const startDrag = (e: React.PointerEvent) => {
    track(e, (ev) => {
      const o = origin.current
      move(win.id, o.x + (ev.clientX - o.px), o.y + (ev.clientY - o.py))
    })
  }

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation()
    track(e, (ev) => {
      const o = origin.current
      resizeWindow(win.id, o.w + (ev.clientX - o.px), o.h + (ev.clientY - o.py))
    })
  }

  if (win.minimized) return null

  return (
    <div
      className="win98 win98-raised absolute flex flex-col"
      style={
        fullscreen
          ? { inset: 0, zIndex: win.z }
          : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
      }
      onPointerDown={() => focus(win.id)}
    >
      <div
        data-testid="win98-titlebar"
        className={`win98-titlebar flex items-center gap-1 px-1 py-0.5 ${active ? "win98-titlebar--active" : ""}`}
        onPointerDown={fullscreen ? undefined : startDrag}
        onDoubleClick={() => (expanded ? collapse() : expand(win.id))}
      >
        <span className="flex-1 truncate text-[11px]">{title}</span>
        <button type="button" className="win98-btn" aria-label="Minimizar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => minimize(win.id)}>_</button>
        <button type="button" className="win98-btn" aria-label="Maximizar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => (expanded ? collapse() : expand(win.id))}>□</button>
        <button type="button" className="win98-btn" aria-label="Fechar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => close(win.id)}>✕</button>
      </div>

      {/* O conteúdo rola dentro da janela; a página embutida não sabe que está numa. */}
      <div className="win98-sunken m-0.5 flex-1 overflow-auto bg-white">{children}</div>

      {/* Expandida ocupa a camada toda: não há o que redimensionar. */}
      {!fullscreen && (
        <div
          data-testid="win98-resize"
          className="win98-resize self-end"
          onPointerDown={startResize}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/features/office/pc/Win98Window.test.tsx`
Expected: PASS — 11 testes

- [ ] **Step 6: Rodar tudo**

Run: `npx vitest run && npm run lint`
Expected: PASS — 15 arquivos, 132 testes.

- [ ] **Step 7: Commit**

```bash
git add src/features/office/pc/win98.css src/features/office/pc/Win98Window.tsx src/features/office/pc/Win98Window.test.tsx
git commit -m "feat(office): janela Win98 com arrastar, redimensionar e botões"
```

---

## Task 8: Registry de apps

Único lugar que conhece as páginas do produto. Boards e Comercial abrem de verdade; os outros 13 aparecem desabilitados.

**Files:**
- Create: `frontend/src/features/office/pc/apps.registry.ts`
- Test: `frontend/src/features/office/pc/apps.registry.test.ts`

**Interfaces:**
- Consumes: `BoardsPage`, `SalesPage` das features existentes.
- Produces:
  - `type AppGroupId = "trabalho" | "comercial" | "marketing" | "sistema"`
  - `interface AppGroup { id: AppGroupId; label: string }`
  - `interface AppDef { id: string; label: string; group: AppGroupId; size: { w: number; h: number }; component: ComponentType | null }`
  - `APP_GROUPS: AppGroup[]`, `APPS: AppDef[]`
  - `appsOfGroup(group: AppGroupId): AppDef[]`, `appById(id: string): AppDef | undefined`, `isEnabled(app: AppDef): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/features/office/pc/apps.registry.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { APPS, APP_GROUPS, appById, appsOfGroup, isEnabled } from "./apps.registry"

describe("registry de apps", () => {
  it("tem os quatro grupos do desktop", () => {
    expect(APP_GROUPS.map((g) => g.id)).toEqual([
      "trabalho", "comercial", "marketing", "sistema",
    ])
  })

  it("cobre as 15 rotas do produto", () => {
    expect(APPS).toHaveLength(15)
  })

  it("todo app tem id único", () => {
    const ids = APPS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("todo app pertence a um grupo declarado", () => {
    const grupos = new Set(APP_GROUPS.map((g) => g.id))
    for (const app of APPS) expect(grupos.has(app.group)).toBe(true)
  })

  it("nesta fatia só Boards e Comercial estão habilitados", () => {
    const habilitados = APPS.filter(isEnabled).map((a) => a.id)
    expect(habilitados.sort()).toEqual(["boards", "comercial"])
  })

  it("app desabilitado não tem componente", () => {
    for (const app of APPS.filter((a) => !isEnabled(a))) {
      expect(app.component).toBeNull()
    }
  })

  it("todo app pede um tamanho utilizável", () => {
    for (const app of APPS) {
      expect(app.size.w).toBeGreaterThanOrEqual(320)
      expect(app.size.h).toBeGreaterThanOrEqual(240)
    }
  })

  it("appsOfGroup filtra pelo grupo", () => {
    const ids = appsOfGroup("comercial").map((a) => a.id)
    expect(ids).toContain("comercial")
    expect(ids).not.toContain("boards")
  })

  it("todo grupo tem pelo menos um app", () => {
    for (const g of APP_GROUPS) expect(appsOfGroup(g.id).length).toBeGreaterThan(0)
  })

  it("appById encontra e devolve undefined para id desconhecido", () => {
    expect(appById("boards")?.label).toBe("Boards")
    expect(appById("naoexiste")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/features/office/pc/apps.registry.test.ts`
Expected: FAIL — `Failed to resolve import "./apps.registry"`

- [ ] **Step 3: Implementar `apps.registry.ts`**

Criar `frontend/src/features/office/pc/apps.registry.ts`:

```ts
// Único lugar que conhece as páginas do produto.
//
// Nesta fatia só Boards e Comercial abrem: o resto entra com component null e
// aparece desabilitado. Ligar um app na fatia 2 é trocar null pelo componente —
// nada mais no PC precisa mudar.
import type { ComponentType } from "react"

import { BoardsPage } from "@/features/boards/BoardsPage"
import { SalesPage } from "@/features/sales/SalesPage"

export type AppGroupId = "trabalho" | "comercial" | "marketing" | "sistema"

export interface AppGroup {
  id: AppGroupId
  label: string
}

export interface AppDef {
  id: string
  label: string
  group: AppGroupId
  /** Tamanho inicial da janela. Generoso: as páginas assumem viewport cheia. */
  size: { w: number; h: number }
  /** null = ainda não ligado nesta fatia. */
  component: ComponentType | null
}

export const APP_GROUPS: AppGroup[] = [
  { id: "trabalho", label: "Trabalho" },
  { id: "comercial", label: "Comercial" },
  { id: "marketing", label: "Marketing" },
  { id: "sistema", label: "Sistema" },
]

const BIG = { w: 900, h: 600 }
const MED = { w: 760, h: 520 }

export const APPS: AppDef[] = [
  { id: "boards", label: "Boards", group: "trabalho", size: BIG, component: BoardsPage },
  { id: "myday", label: "Meu Dia", group: "trabalho", size: MED, component: null },
  { id: "poker", label: "Planning Poker", group: "trabalho", size: BIG, component: null },

  { id: "comercial", label: "Comercial", group: "comercial", size: BIG, component: SalesPage },
  { id: "reports", label: "Relatórios", group: "comercial", size: BIG, component: null },
  { id: "portfolio", label: "Portfólio", group: "comercial", size: MED, component: null },

  { id: "mkt-calendario", label: "Calendário", group: "marketing", size: BIG, component: null },
  { id: "mkt-fila", label: "Fila", group: "marketing", size: MED, component: null },
  { id: "mkt-analytics", label: "Analytics", group: "marketing", size: BIG, component: null },
  { id: "mkt-redes", label: "Redes", group: "marketing", size: MED, component: null },

  { id: "integrations", label: "Integrações", group: "sistema", size: MED, component: null },
  { id: "avatar", label: "Avatar", group: "sistema", size: BIG, component: null },
  { id: "members", label: "Membros", group: "sistema", size: MED, component: null },
  { id: "copilot", label: "Copiloto", group: "sistema", size: MED, component: null },
  { id: "importar", label: "Importar", group: "sistema", size: MED, component: null },
]

export function appsOfGroup(group: AppGroupId): AppDef[] {
  return APPS.filter((a) => a.group === group)
}

export function appById(id: string): AppDef | undefined {
  return APPS.find((a) => a.id === id)
}

export function isEnabled(app: AppDef): boolean {
  return app.component !== null
}
```

- [ ] **Step 4: Confirmar os nomes reais dos componentes**

Run: `grep -rn "export function BoardsPage\|export function SalesPage" src/features/boards src/features/sales`
Expected: os dois exports existem nos caminhos importados. Se o nome ou caminho diferir, ajustar o import — **não** renomear nada nas features.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/features/office/pc/apps.registry.test.ts`
Expected: PASS — 10 testes

- [ ] **Step 6: Commit**

```bash
git add src/features/office/pc/apps.registry.ts src/features/office/pc/apps.registry.test.ts
git commit -m "feat(office): registry de apps do desktop com Boards e Comercial"
```

---

## Task 9: Ícones, pastas, taskbar e menu Iniciar

A superfície de navegação do desktop.

**Files:**
- Create: `frontend/src/features/office/pc/DesktopIcons.tsx`, `frontend/src/features/office/pc/Taskbar.tsx`, `frontend/src/features/office/pc/StartMenu.tsx`
- Test: `frontend/src/features/office/pc/DesktopIcons.test.tsx`, `frontend/src/features/office/pc/Taskbar.test.tsx`, `frontend/src/features/office/pc/StartMenu.test.tsx`

**Interfaces:**
- Consumes: `usePcStore` (Task 6), `APP_GROUPS`/`APPS`/`appsOfGroup`/`isEnabled` (Task 8).
- Produces: `DesktopIcons()`, `Taskbar()`, `StartMenu({ onClose }: { onClose: () => void })`

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/src/features/office/pc/DesktopIcons.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { DesktopIcons } from "./DesktopIcons"
import { usePcStore } from "./pc.store"

beforeEach(() => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
})

describe("<DesktopIcons />", () => {
  it("mostra as quatro pastas", () => {
    render(<DesktopIcons />)
    for (const label of ["Trabalho", "Comercial", "Marketing", "Sistema"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it("duplo clique na pasta abre o conteúdo dela", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Trabalho/ }))
    expect(usePcStore.getState().openFolderId).toBe("trabalho")
    expect(screen.getByText("Boards")).toBeInTheDocument()
    expect(screen.getByText("Planning Poker")).toBeInTheDocument()
  })

  it("duplo clique num app habilitado abre a janela", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Trabalho/ }))
    await userEvent.dblClick(screen.getByRole("button", { name: /Boards/ }))
    expect(usePcStore.getState().windows.map((w) => w.id)).toEqual(["boards"])
  })

  it("app desabilitado não abre e avisa que vem depois", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Trabalho/ }))
    const poker = screen.getByRole("button", { name: /Planning Poker/ })
    expect(poker).toBeDisabled()
    expect(poker).toHaveAttribute("title", "Em breve")
    await userEvent.dblClick(poker)
    expect(usePcStore.getState().windows).toHaveLength(0)
  })

  it("fechar a pasta volta para as pastas", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Comercial/ }))
    await userEvent.click(screen.getByRole("button", { name: "Fechar pasta" }))
    expect(usePcStore.getState().openFolderId).toBeNull()
  })
})
```

Criar `frontend/src/features/office/pc/Taskbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { Taskbar } from "./Taskbar"
import { usePcStore } from "./pc.store"

beforeEach(() => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
})

describe("<Taskbar />", () => {
  it("mostra o botão Iniciar e o de levantar", () => {
    render(<Taskbar />)
    expect(screen.getByRole("button", { name: "Iniciar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Levantar" })).toBeInTheDocument()
  })

  it("Iniciar abre e fecha o menu", async () => {
    render(<Taskbar />)
    await userEvent.click(screen.getByRole("button", { name: "Iniciar" }))
    expect(screen.getByTestId("start-menu")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Iniciar" }))
    expect(screen.queryByTestId("start-menu")).not.toBeInTheDocument()
  })

  it("lista uma entrada por janela aberta", () => {
    usePcStore.getState().openApp("boards", { w: 900, h: 600 })
    usePcStore.getState().openApp("comercial", { w: 900, h: 600 })
    render(<Taskbar />)
    expect(screen.getByRole("button", { name: "Boards" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
  })

  it("clicar na entrada da janela focada minimiza", async () => {
    usePcStore.getState().openApp("boards", { w: 900, h: 600 })
    render(<Taskbar />)
    await userEvent.click(screen.getByRole("button", { name: "Boards" }))
    expect(usePcStore.getState().windows[0].minimized).toBe(true)
  })

  it("clicar na entrada de janela minimizada restaura", async () => {
    usePcStore.getState().openApp("boards", { w: 900, h: 600 })
    usePcStore.getState().minimize("boards")
    render(<Taskbar />)
    await userEvent.click(screen.getByRole("button", { name: "Boards" }))
    expect(usePcStore.getState().windows[0].minimized).toBe(false)
    expect(usePcStore.getState().focusedId).toBe("boards")
  })

  it("Levantar desliga o PC", async () => {
    usePcStore.getState().openApp("boards", { w: 900, h: 600 })
    render(<Taskbar />)
    await userEvent.click(screen.getByRole("button", { name: "Levantar" }))
    expect(usePcStore.getState().state).toBe("off")
    expect(usePcStore.getState().windows).toHaveLength(0)
  })

  it("mostra um relógio", () => {
    render(<Taskbar />)
    expect(screen.getByTestId("win98-clock").textContent).toMatch(/^\d{2}:\d{2}$/)
  })
})
```

Criar `frontend/src/features/office/pc/StartMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { StartMenu } from "./StartMenu"
import { usePcStore } from "./pc.store"

beforeEach(() => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
})

describe("<StartMenu />", () => {
  it("lista os quatro grupos", () => {
    render(<StartMenu onClose={() => {}} />)
    for (const label of ["Trabalho", "Comercial", "Marketing", "Sistema"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("passar o mouse no grupo revela os apps dele", async () => {
    render(<StartMenu onClose={() => {}} />)
    await userEvent.hover(screen.getByText("Comercial"))
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Relatórios" })).toBeInTheDocument()
  })

  it("escolher um app habilitado abre a janela e fecha o menu", async () => {
    const onClose = vi.fn()
    render(<StartMenu onClose={onClose} />)
    await userEvent.hover(screen.getByText("Trabalho"))
    await userEvent.click(screen.getByRole("button", { name: "Boards" }))
    expect(usePcStore.getState().windows.map((w) => w.id)).toEqual(["boards"])
    expect(onClose).toHaveBeenCalled()
  })

  it("app desabilitado aparece bloqueado", async () => {
    render(<StartMenu onClose={() => {}} />)
    await userEvent.hover(screen.getByText("Sistema"))
    expect(screen.getByRole("button", { name: "Integrações" })).toBeDisabled()
  })

  it("Levantar desliga o PC", async () => {
    render(<StartMenu onClose={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Levantar" }))
    expect(usePcStore.getState().state).toBe("off")
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/features/office/pc/DesktopIcons.test.tsx src/features/office/pc/Taskbar.test.tsx src/features/office/pc/StartMenu.test.tsx`
Expected: FAIL — três erros de import não resolvido

- [ ] **Step 3: Implementar `DesktopIcons.tsx`**

```tsx
// Grade de ícones do desktop: quatro pastas por área, cada uma com seus apps.
//
// Duas telas em vez de 15 ícones soltos — desktop cheio fica ilegível e o
// agrupamento por área é o mesmo que a sidebar já usa.
import { Folder, MonitorPlay } from "lucide-react"

import { APP_GROUPS, appsOfGroup, isEnabled, type AppDef } from "./apps.registry"
import { usePcStore } from "./pc.store"

export function DesktopIcons() {
  const openFolderId = usePcStore((s) => s.openFolderId)
  const openFolder = usePcStore((s) => s.openFolder)
  const openApp = usePcStore((s) => s.openApp)

  if (openFolderId) {
    const group = APP_GROUPS.find((g) => g.id === openFolderId)
    return (
      <div className="win98 win98-raised absolute left-3 top-3 w-64 p-1">
        <div className="win98-titlebar win98-titlebar--active mb-2 flex items-center px-1 py-0.5">
          <span className="flex-1 text-[11px]">{group?.label}</span>
          <button type="button" className="win98-btn" aria-label="Fechar pasta"
            onClick={() => openFolder(null)}>✕</button>
        </div>
        <div className="grid grid-cols-3 gap-1 p-1">
          {appsOfGroup(openFolderId as AppDef["group"]).map((app) => (
            <IconButton
              key={app.id}
              label={app.label}
              disabled={!isEnabled(app)}
              onOpen={() => openApp(app.id, app.size)}
              icon={<MonitorPlay className="size-7" />}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid w-24 gap-3 p-3">
      {APP_GROUPS.map((group) => (
        <IconButton
          key={group.id}
          label={group.label}
          onOpen={() => openFolder(group.id)}
          icon={<Folder className="size-8" />}
        />
      ))}
    </div>
  )
}

function IconButton({
  label,
  icon,
  onOpen,
  disabled = false,
}: {
  label: string
  icon: React.ReactNode
  onOpen: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Em breve" : undefined}
      onDoubleClick={onOpen}
      className={`win98 flex flex-col items-center gap-0.5 p-1 text-center text-[11px] text-white ${
        disabled ? "opacity-40" : "hover:bg-white/15"
      }`}
    >
      {icon}
      <span className="leading-tight drop-shadow-[1px_1px_0_rgba(0,0,0,0.8)]">{label}</span>
    </button>
  )
}
```

- [ ] **Step 4: Implementar `StartMenu.tsx`**

```tsx
// Menu Iniciar: grupos à esquerda, apps do grupo em cascata à direita.
import { useState } from "react"

import { APP_GROUPS, appsOfGroup, isEnabled, type AppGroupId } from "./apps.registry"
import { usePcStore } from "./pc.store"

export function StartMenu({ onClose }: { onClose: () => void }) {
  const [hover, setHover] = useState<AppGroupId | null>(null)
  const openApp = usePcStore((s) => s.openApp)
  const shutdown = usePcStore((s) => s.shutdown)

  return (
    <div data-testid="start-menu" className="win98 win98-raised absolute bottom-full left-0 mb-0.5 flex w-44">
      <div className="w-full p-0.5">
        {APP_GROUPS.map((group) => (
          <div
            key={group.id}
            onMouseEnter={() => setHover(group.id)}
            className="relative cursor-default px-2 py-1 text-[12px] hover:bg-[var(--w98-title)] hover:text-white"
          >
            <span className="flex items-center justify-between">
              {group.label} <span aria-hidden>▸</span>
            </span>

            {hover === group.id && (
              <div className="win98-raised absolute left-full top-0 z-10 w-44 p-0.5">
                {appsOfGroup(group.id).map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    disabled={!isEnabled(app)}
                    title={isEnabled(app) ? undefined : "Em breve"}
                    onClick={() => {
                      openApp(app.id, app.size)
                      onClose()
                    }}
                    className="block w-full px-2 py-1 text-left text-[12px] enabled:hover:bg-[var(--w98-title)] enabled:hover:text-white disabled:opacity-40"
                  >
                    {app.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="my-1 h-px bg-[var(--w98-shadow)]" />
        <button
          type="button"
          onClick={() => {
            shutdown()
            onClose()
          }}
          className="block w-full px-2 py-1 text-left text-[12px] hover:bg-[var(--w98-title)] hover:text-white"
        >
          Levantar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implementar `Taskbar.tsx`**

```tsx
// Barra de tarefas: Iniciar, janelas abertas, relógio e o botão de levantar.
import { useEffect, useState } from "react"

import { appById } from "./apps.registry"
import { usePcStore } from "./pc.store"
import { StartMenu } from "./StartMenu"

function agora(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function Taskbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [clock, setClock] = useState(agora)

  const windows = usePcStore((s) => s.windows)
  const focusedId = usePcStore((s) => s.focusedId)
  const focus = usePcStore((s) => s.focus)
  const minimize = usePcStore((s) => s.minimize)
  const shutdown = usePcStore((s) => s.shutdown)

  useEffect(() => {
    const t = window.setInterval(() => setClock(agora()), 20_000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="win98 win98-raised relative flex items-center gap-1 p-0.5">
      <button
        type="button"
        aria-label="Iniciar"
        onClick={() => setMenuOpen((v) => !v)}
        className="win98-raised px-2 py-0.5 text-[11px] font-bold"
      >
        Iniciar
      </button>
      {menuOpen && <StartMenu onClose={() => setMenuOpen(false)} />}

      <div className="mx-1 h-5 w-px bg-[var(--w98-shadow)]" />

      <div className="flex flex-1 items-center gap-1 overflow-hidden">
        {windows.map((w) => {
          const app = appById(w.appId)
          const ativa = focusedId === w.id && !w.minimized
          return (
            <button
              key={w.id}
              type="button"
              aria-label={app?.label ?? w.appId}
              onClick={() => (ativa ? minimize(w.id) : focus(w.id))}
              className={`max-w-40 truncate px-2 py-0.5 text-[11px] ${
                ativa ? "win98-sunken" : "win98-raised"
              }`}
            >
              {app?.label ?? w.appId}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        aria-label="Levantar"
        onClick={shutdown}
        className="win98-raised px-2 py-0.5 text-[11px]"
      >
        Levantar
      </button>
      <span data-testid="win98-clock" className="win98-sunken px-2 py-0.5 text-[11px]">
        {clock}
      </span>
    </div>
  )
}
```

- [ ] **Step 6: Rodar e confirmar que passam**

Run: `npx vitest run src/features/office/pc/DesktopIcons.test.tsx src/features/office/pc/Taskbar.test.tsx src/features/office/pc/StartMenu.test.tsx`
Expected: PASS — 5 + 7 + 5 = 17 testes

- [ ] **Step 7: Rodar tudo**

Run: `npx vitest run && npm run lint`
Expected: PASS — 19 arquivos, 159 testes.

- [ ] **Step 8: Commit**

```bash
git add src/features/office/pc/DesktopIcons.tsx src/features/office/pc/DesktopIcons.test.tsx src/features/office/pc/Taskbar.tsx src/features/office/pc/Taskbar.test.tsx src/features/office/pc/StartMenu.tsx src/features/office/pc/StartMenu.test.tsx
git commit -m "feat(office): ícones, pastas, taskbar e menu Iniciar do desktop 98"
```

---

## Task 10: Boot e desktop montado

Junta as peças: painel do desktop, janelas, camada expandida e a tela de boot.

**Files:**
- Create: `frontend/src/features/office/pc/BootScreen.tsx`, `frontend/src/features/office/pc/Win98Desktop.tsx`
- Test: `frontend/src/features/office/pc/Win98Desktop.test.tsx`

**Interfaces:**
- Consumes: `usePcStore`, `Win98Window`, `Taskbar`, `DesktopIcons`, `appById`, `isEnabled`.
- Produces: `Win98Desktop()`, `BootScreen({ onDone }: { onDone: () => void })`, `BOOT_MS = 700`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/features/office/pc/Win98Desktop.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { usePcStore } from "./pc.store"
import { Win98Desktop } from "./Win98Desktop"

const ligado = () => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
}

beforeEach(() => usePcStore.getState().shutdown())

describe("<Win98Desktop />", () => {
  it("desligado, não renderiza nada", () => {
    const { container } = render(<Win98Desktop />)
    expect(container).toBeEmptyDOMElement()
  })

  it("em booting mostra a tela de boot e nenhuma taskbar", () => {
    usePcStore.getState().boot("ws-26-9")
    render(<Win98Desktop />)
    expect(screen.getByTestId("boot-screen")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument()
  })

  it("em desktop mostra painel, ícones e taskbar", () => {
    ligado()
    render(<Win98Desktop />)
    expect(screen.getByTestId("win98-panel")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Trabalho/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Iniciar" })).toBeInTheDocument()
  })

  it("o painel não usa transform — é o que mantém os modais das páginas no lugar", () => {
    ligado()
    render(<Win98Desktop />)
    const panel = screen.getByTestId("win98-panel")
    expect(panel.style.transform).toBe("")
    expect(getComputedStyle(panel).transform === "none" || getComputedStyle(panel).transform === "").toBe(true)
  })

  it("janela aberta renderiza o conteúdo do app dentro dela", () => {
    ligado()
    usePcStore.getState().openApp("boards", { w: 600, h: 400 })
    render(<Win98Desktop />)
    expect(screen.getByTestId("win98-titlebar")).toBeInTheDocument()
  })

  it("app sem componente registrado mostra aviso em vez de tela branca", () => {
    ligado()
    usePcStore.getState().openApp("poker", { w: 600, h: 400 })
    render(<Win98Desktop />)
    expect(screen.getByText(/Em breve/)).toBeInTheDocument()
  })

  it("janela expandida vai para a camada de tela cheia, fora do painel", () => {
    ligado()
    usePcStore.getState().openApp("boards", { w: 600, h: 400 })
    usePcStore.getState().expand("boards")
    render(<Win98Desktop />)
    const camada = screen.getByTestId("win98-expanded")
    expect(camada).toBeInTheDocument()
    expect(camada.style.transform).toBe("")
    expect(screen.getByTestId("win98-panel").contains(camada)).toBe(false)
  })

  it("expandida deixa exatamente uma taskbar no DOM", () => {
    ligado()
    usePcStore.getState().openApp("boards", { w: 600, h: 400 })
    render(<Win98Desktop />)
    expect(screen.getAllByRole("button", { name: "Iniciar" })).toHaveLength(1)

    usePcStore.getState().expand("boards")
    expect(screen.getAllByRole("button", { name: "Iniciar" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Levantar" })).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/features/office/pc/Win98Desktop.test.tsx`
Expected: FAIL — `Failed to resolve import "./Win98Desktop"`

- [ ] **Step 3: Implementar `BootScreen.tsx`**

```tsx
// Boot do 98: POST curto e logo. Serve de cortina — é atrás dele que a escala
// da câmera troca, então o salto de zoom não aparece.
import { useEffect } from "react"
import { useReducedMotion } from "framer-motion"

export const BOOT_MS = 700

export function BootScreen({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion()

  useEffect(() => {
    const t = window.setTimeout(onDone, reduce ? 0 : BOOT_MS)
    return () => window.clearTimeout(t)
  }, [onDone, reduce])

  return (
    <div
      data-testid="boot-screen"
      className="win98 absolute inset-0 grid place-items-center bg-black font-mono text-[13px] text-[#c0c0c0]"
    >
      <div className="space-y-1">
        <p>T4E Office BIOS v1.98</p>
        <p>Memória OK — Avatar OK — Presença OK</p>
        <p className="text-white">Iniciando T4E Office 98...</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implementar `Win98Desktop.tsx`**

```tsx
// Monta o PC: painel do desktop sobre o mapa, janelas, taskbar e a camada da
// janela expandida.
//
// Duas regras que não podem ser afrouxadas:
// 1. Nenhum transform CSS em ancestral de conteúdo embutido — transform vira
//    containing block e joga os modais (position: fixed) das páginas para dentro
//    do painel em vez da viewport.
// 2. A janela expandida sai do painel e vira uma camada própria em tela cheia,
//    para trabalhar de verdade sem o aperto do painel.
import { appById, isEnabled } from "./apps.registry"
import { BootScreen } from "./BootScreen"
import { DesktopIcons } from "./DesktopIcons"
import { usePcStore } from "./pc.store"
import { Taskbar } from "./Taskbar"
import { Win98Window } from "./Win98Window"

export function Win98Desktop() {
  const state = usePcStore((s) => s.state)
  const windows = usePcStore((s) => s.windows)
  const expandedId = usePcStore((s) => s.expandedId)
  const ready = usePcStore((s) => s.ready)

  if (state === "off") return null
  if (state === "booting") return <BootScreen onDone={ready} />

  const expanded = windows.find((w) => w.id === expandedId) ?? null

  return (
    <>
      {/* Painel: 78% do canvas, centralizado. O escritório continua visível em volta. */}
      <div
        data-testid="win98-panel"
        className="win98 win98-raised absolute left-1/2 top-1/2 flex h-[78%] w-[78%] -ml-[39%] -mt-[39%] flex-col overflow-hidden bg-[var(--w98-desktop)]"
      >
        <div className="relative flex-1 overflow-hidden">
          <DesktopIcons />
          {windows
            .filter((w) => w.id !== expandedId)
            .map((w) => (
              <Win98Window key={w.id} win={w} title={appById(w.appId)?.label ?? w.appId}>
                <AppBody appId={w.appId} />
              </Win98Window>
            ))}
        </div>
        {/* Uma Taskbar por vez: duas montadas duplicariam "Iniciar"/"Levantar"
            no DOM e tornariam qualquer busca por rótulo ambígua. */}
        {!expanded && <Taskbar />}
      </div>

      {/* Camada expandida: fora do painel, tela cheia, sem transform. */}
      {expanded && (
        <div data-testid="win98-expanded" className="absolute inset-0 z-20 flex flex-col bg-[var(--w98-desktop)]">
          <div className="relative flex-1 overflow-hidden">
            <Win98Window
              win={expanded}
              fullscreen
              title={appById(expanded.appId)?.label ?? expanded.appId}
            >
              <AppBody appId={expanded.appId} />
            </Win98Window>
          </div>
          <Taskbar />
        </div>
      )}
    </>
  )
}

function AppBody({ appId }: { appId: string }) {
  const app = appById(appId)
  if (!app || !isEnabled(app) || !app.component) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-[12px]">
        <p>Em breve — este app entra na próxima fatia.</p>
      </div>
    )
  }
  const Page = app.component
  return <Page />
}
```

A janela expandida usa a prop `fullscreen` que a Task 7 já entregou — geometria da janela intacta, então colapsar devolve exatamente a posição e o tamanho de antes.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/features/office/pc/Win98Desktop.test.tsx`
Expected: PASS — 7 testes

- [ ] **Step 6: Rodar tudo**

Run: `npx vitest run && npm run lint`
Expected: PASS — 20 arquivos, 166 testes.

- [ ] **Step 7: Commit**

```bash
git add src/features/office/pc/BootScreen.tsx src/features/office/pc/Win98Desktop.tsx src/features/office/pc/Win98Desktop.test.tsx
git commit -m "feat(office): desktop 98 montado com boot e camada expandida"
```

---

## Task 11: Fiação e tela cheia

Liga o mapa ao PC e faz o Escritório entrar em tela cheia. Última task porque depende de todas as outras.

**Files:**
- Modify: `frontend/src/features/office/OfficeRoom.tsx`, `frontend/src/features/office/OfficePage.tsx`

**Interfaces:**
- Consumes: tudo das tasks 1-10.
- Produces: nada novo — é integração.

- [ ] **Step 1: Ligar sentar → PC no `OfficeRoom`**

Adicionar imports:

```ts
import { isMyDesk } from "./pc/desk"
import { usePcStore } from "./pc/pc.store"
import { Win98Desktop } from "./pc/Win98Desktop"
```

Ler o estado e as ações no corpo do componente, junto dos outros hooks:

```ts
  const pcState = usePcStore((s) => s.state)
  const bootPc = usePcStore((s) => s.boot)
  const shutdownPc = usePcStore((s) => s.shutdown)
  const expandedId = usePcStore((s) => s.expandedId)
  const collapsePc = usePcStore((s) => s.collapse)
```

Trocar o `onInteract` da criação da engine (a linha da Task 3) por:

```ts
      onInteract: (seat) => {
        setToast(seat ? seat.label : "De pé")
        // Só a mesa da própria pessoa liga o computador. Sentar em qualquer
        // outro assento continua sendo só sentar.
        if (seat && me?.id && isMyDesk(me.id, seat, map.seats)) bootPc(seat.id)
        else if (!seat) shutdownPc()
      },
```

- [ ] **Step 2: Sincronizar engine e PC**

Adicionar dois efeitos depois dos existentes:

```ts
  // O PC manda no teclado e na câmera: com a tela ligada, o mapa não recebe
  // tecla, e a câmera trava na mesa.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (pcState === "off") {
      engine.setInputEnabled(true)
      engine.clearFocus()
      return
    }
    const seatId = usePcStore.getState().seatId
    const seat = map.seats.find((s) => s.id === seatId)
    engine.setInputEnabled(false)
    if (seat) engine.focusOn(seat.x, seat.y, 6)
  }, [pcState, map])

  // ESC: colapsa a janela expandida; se não houver, levanta e desliga.
  useEffect(() => {
    if (pcState === "off") return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      if (expandedId) collapsePc()
      else {
        shutdownPc()
        engineRef.current?.tryInteract() // levanta de fato no mundo
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pcState, expandedId, collapsePc, shutdownPc])

  // Levantar pela taskbar também precisa levantar o avatar no mundo.
  useEffect(() => {
    if (pcState !== "off") return
    const engine = engineRef.current
    if (engine?.isSeated()) engine.tryInteract()
  }, [pcState])
```

O último efeito precisa de um getter na engine. Adicionar em `engine.ts`, perto de `tryInteract`:

```ts
  /** O avatar do usuário está sentado? */
  isSeated(): boolean {
    return (this.me?.seatIndex ?? -1) >= 0
  }
```

- [ ] **Step 3: Montar o desktop e tirar a caixa 16:10**

No JSX de `OfficeRoom`, trocar o `className` do wrapper (linha 167) por:

```tsx
      className="relative size-full select-none overflow-hidden bg-[#1a1712]"
```

E montar o desktop logo depois do `<canvas>`:

```tsx
      <Win98Desktop />
```

O HUD (barra de comandos, emotes, chat, minimapa) só faz sentido com o PC desligado. Envolver cada bloco de HUD existente com a condição — no lugar de `{zone && (`, usar `{pcState === "off" && zone && (`, e assim para o toast, o minimapa, a barra de comandos, a roda de emotes e o chat.

- [ ] **Step 4: Deixar o `OfficePage` em tela cheia**

Substituir o `return` final de `OfficeInner` (linhas 86-96) por:

```tsx
  return (
    <div className="fixed inset-0 z-30 bg-[#1a1712]">
      <OfficeRoom workspaceId={workspaceId} myConfig={config} />

      {/* Presença e legenda viram overlay: em tela cheia não há onde empilhar. */}
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[min(92vw,44rem)] flex-col gap-2">
        <div className="pointer-events-auto rounded-lg bg-ink-950/70 p-2 backdrop-blur-sm">
          <PresenceBar workspaceId={workspaceId} onlineCount={onlineCount} />
        </div>
        <div className="pointer-events-auto rounded-lg bg-ink-950/70 p-2 backdrop-blur-sm">
          <StatusLegend />
        </div>
      </div>

      <Link
        to="/app"
        className="absolute right-3 top-3 rounded-lg bg-ink-950/70 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm hover:bg-ink-950/90 focus-ring"
      >
        Sair do escritório
      </Link>
    </div>
  )
```

`z-30` fica abaixo do `z-50` do `Modal` e do `z-[100]`/`z-[9999]` dos toasts, então diálogos e avisos continuam por cima.

- [ ] **Step 5: Rodar a suíte e o lint**

Run: `npx vitest run && npm run lint`
Expected: PASS — 20 arquivos, 166 testes.

- [ ] **Step 6: Verificar os critérios de aceitação no navegador**

Run: `npm run dev` com o backend em pé (`cd ../backend && .venv/bin/python manage.py runserver`), logar e abrir `/app/office`.

Percorrer os 11 critérios da seção "Critérios de aceitação" do spec, um a um:

1. `/app/office` abre em tela cheia; presença aparece como overlay.
2. Andar até a própria mesa e apertar `E`: zoom, boot, painel do desktop com 4 pastas e taskbar. Descobrir qual é a sua mesa rodando no console do navegador:
   `document.title` não ajuda — em vez disso, use a mesa que responde: sente em cada estação até uma ligar o PC. Se preferir determinismo, logue com um usuário conhecido do seed (`ana@t4e.dev` / `demo1234`).
3. Sentar no sofá, na copa, na reunião ou numa estação que não é a sua: só toast, sem PC.
4. Pasta Trabalho → duplo clique em Boards: janela abre com o Boards real; criar e mover card funciona; trocar de aba funciona.
5. Arrastar pela titlebar, redimensionar pela alça, minimizar, restaurar pela taskbar, fechar no `X`.
6. Abrir Boards e Comercial: clicar numa traz pra frente; taskbar marca a focada.
7. `□` e duplo clique na titlebar expandem; ESC volta ao painel.
8. Digitar no campo de busca do Boards não move o avatar.
9. Abrir um modal de dentro do Comercial: aparece centralizado na viewport, não recortado — nos dois modos.
10. ESC no desktop, ou "Levantar" na taskbar: zoom out, avatar de pé, HUD do mapa de volta.
11. Ligar `prefers-reduced-motion: reduce` no DevTools (Rendering → Emulate CSS media feature): boot instantâneo, sem zoom animado, fluxo intacto.

Registrar qual critério falhou, se algum, antes de commitar.

- [ ] **Step 7: Commit**

```bash
git add src/features/office/OfficeRoom.tsx src/features/office/OfficePage.tsx src/features/office/world/engine.ts
git commit -m "feat(office): escritório em tela cheia e PC ligado à mesa pessoal"
```

---

## Self-Review

**Cobertura do spec** — cada requisito tem task:

| Requisito do spec | Task |
|---|---|
| Escritório em tela cheia sempre | 11 |
| Presença/legenda como overlay | 11 |
| Máquina de estados `off → booting → desktop → expanded` | 6 (estado), 10 (render), 11 (transições) |
| Input exclusivo (`setInputEnabled`) | 2 (gate), 11 (fiação) |
| `focusOn` / `clearFocus` com escala inteira | 1, 4 |
| `onInteract(seat \| null)` | 3 |
| `Seat.id` estável por tile + `Seat.kind` | 3 |
| `desk.ts` derivado do `user.id` | 5 |
| Window manager (abrir/fechar/foco/z/minimizar/expandir) | 6 |
| Chrome Win98 (bevel, titlebar, botões, scroll) | 7 |
| Drag e resize | 7 |
| Taskbar (Iniciar, janelas, relógio, Levantar) | 9 |
| Menu Iniciar hierárquico | 9 |
| 4 pastas por área, 13 apps desabilitados | 8, 9 |
| Boards e Comercial reais | 8, 10 |
| Boot screen | 10 |
| Sem `transform` em ancestral (modais funcionam) | 7, 10 (com teste explícito em cada) |
| Expandir animando geometria, não `scale` | 7, 10 |
| `prefers-reduced-motion` | 7 (CSS), 10 (boot), 11 (verificação) |
| Nenhuma página existente editada | Global Constraints; nenhuma task modifica feature existente fora de `office/` |

Sem lacunas.

**Consistência de tipos** — checado entre tasks:
- `resizeWindow` (não `resize`) no store, para não colidir com `OfficeEngine.resize`. Usado com esse nome nas tasks 6, 7.
- `Seat.kind` é `"pc" | "meeting" | "lounge"` nas tasks 3, 5, e `isMyDesk` rejeita não-`pc`.
- `integerScale(cssW, cssH, max?)` com o terceiro parâmetro opcional em 1, consumido com `8` em 4.
- `AppDef.component: ComponentType | null` em 8, e `AppBody` em 10 trata o `null`.
- `BOOT_MS` exportado em 10 e consumido só lá dentro.
- `usePcStore.boot(seatId)` recebe `Seat["id"]` em 6, 11.

**Placeholders:** nenhum. Todo passo de código tem o código; todo passo de teste tem as asserções; o passo manual da Task 11 enumera os 11 critérios em vez de dizer "testar no navegador".

**Riscos que continuam abertos, por decisão:**
- Mesa derivada colide acima de 14 usuários (spec, risco 5) — resolvido na fatia 2.
- Conteúdo das páginas continua com visual moderno dentro da moldura 98 — fatia 2.
- A engine em si não tem teste unitário (jsdom sem canvas); a cobertura está nos módulos puros e a integração nos critérios manuais.
