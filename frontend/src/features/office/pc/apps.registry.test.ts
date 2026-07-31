import { describe, expect, it } from "vitest"

import type { RouteObject } from "react-router-dom"

import { appRoutes } from "@/app/router"
import { APPS, APP_GROUPS, appById, appsOfGroup, isEnabled } from "./apps.registry"

describe("registry de apps", () => {
  it("tem os quatro grupos do desktop", () => {
    expect(APP_GROUPS.map((g) => g.id)).toEqual([
      "trabalho", "comercial", "marketing", "sistema",
    ])
  })

  it("cobre as rotas do produto que o PC expõe", () => {
    // Um piso, não um número exato: registrar um app novo não deve quebrar
    // teste, esvaziar o desktop deve.
    expect(APPS.length).toBeGreaterThanOrEqual(16)
  })

  it("todo app tem id único", () => {
    const ids = APPS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("todo app pertence a um grupo declarado", () => {
    const grupos = new Set(APP_GROUPS.map((g) => g.id))
    for (const app of APPS) expect(grupos.has(app.group)).toBe(true)
  })

  it("todo app do desktop abre uma página de verdade", () => {
    // O PC não tem tela própria: se um app está no desktop, ele abre a mesma
    // página que a rota abre. Ícone que só diz "Em breve" é o que fazia o
    // computador do escritório parecer cenário em vez de ferramenta.
    const semPagina = APPS.filter((a) => !isEnabled(a)).map((a) => a.id)
    expect(semPagina).toEqual([])
  })

  it("todo app tem ícone próprio — a grade só é legível assim", () => {
    // Ícone lucide é forwardRef (objeto), não function — daí o teste de
    // existência ser por truthiness, e o que importa de verdade ser a
    // unicidade: 20 ícones iguais não distinguem app nenhum.
    for (const app of APPS) expect(app.icon).toBeTruthy()
    const icones = new Set(APPS.map((a) => a.icon))
    expect(icones.size).toBe(APPS.length)
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

describe("rotas dos apps", () => {
  /** Caminhos absolutos que o `/app` realmente resolve, incluindo aninhados. */
  function absPaths(routes: RouteObject[], base = "/app"): string[] {
    return routes.flatMap((r) => {
      if (r.index) return [base]
      const self = `${base}/${r.path}`
      return r.children ? [self, ...absPaths(r.children, self)] : [self]
    })
  }

  it("todo atalho do desktop aponta para uma rota que existe", () => {
    // Um id sem rota correspondente abre uma janela em branco, sem erro no
    // console — foi assim que "Meu Card" passou despercebido.
    const validas = new Set(absPaths(appRoutes))
    const quebrados = APPS.filter((a) => !validas.has(a.route)).map((a) => `${a.id} → ${a.route}`)
    expect(quebrados).toEqual([])
  })
})
