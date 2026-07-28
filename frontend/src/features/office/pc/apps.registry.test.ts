import { describe, expect, it } from "vitest"

import { APPS, APP_GROUPS, appById, appsOfGroup, isEnabled } from "./apps.registry"

describe("registry de apps", () => {
  it("tem os quatro grupos do desktop", () => {
    expect(APP_GROUPS.map((g) => g.id)).toEqual([
      "trabalho", "comercial", "marketing", "sistema",
    ])
  })

  it("cobre as 14 rotas do produto", () => {
    expect(APPS).toHaveLength(14)
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
