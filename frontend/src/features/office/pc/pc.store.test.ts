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
