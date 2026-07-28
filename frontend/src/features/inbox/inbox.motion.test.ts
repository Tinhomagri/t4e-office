import { describe, expect, it } from "vitest"

import { chipIn, DUR, listItem, messageIn, panelIn, respectMotion } from "./inbox.motion"

describe("respectMotion", () => {
  it("devolve as variantes originais quando não há preferência por menos movimento", () => {
    expect(respectMotion(messageIn, false)).toBe(messageIn)
    expect(respectMotion(messageIn, null)).toBe(messageIn)
  })

  it("descarta translação e escala quando o usuário pede menos movimento", () => {
    const reduced = respectMotion(messageIn, true)
    // Opacidade sobrevive: a mudança de estado ainda precisa ser perceptível.
    expect(reduced.hidden).toEqual({ opacity: 0 })
    expect(reduced.show).toMatchObject({ opacity: 1 })
    // O que causa desconforto (y, scale) some.
    expect(reduced.hidden).not.toHaveProperty("y")
    expect(reduced.show).not.toHaveProperty("y")
  })

  it("neutraliza qualquer variante, não só a de mensagem", () => {
    for (const variants of [listItem, panelIn, chipIn]) {
      const reduced = respectMotion(variants, true)
      expect(reduced.hidden).toEqual({ opacity: 0 })
      expect(reduced.show).toMatchObject({ opacity: 1 })
    }
  })

  it("mantém a saída instantânea no modo reduzido", () => {
    const reduced = respectMotion(messageIn, true)
    expect(reduced.exit).toMatchObject({ opacity: 0 })
  })
})

describe("escala de durações", () => {
  it("nenhuma passa de 500ms — teto de motion-principles para UI", () => {
    for (const duration of Object.values(DUR)) {
      expect(duration).toBeLessThanOrEqual(0.5)
    }
  })

  it("a saída é mais curta que a entrada", () => {
    // Entrar apresenta; sair só precisa liberar o espaço.
    expect(DUR.exit).toBeLessThan(DUR.ui)
  })

  it("o micro-feedback é o mais curto de todos", () => {
    expect(DUR.micro).toBeLessThanOrEqual(DUR.ui)
  })
})

describe("variantes de entrada", () => {
  it("nunca escalam a zero — elemento não pode sumir num buraco negro", () => {
    const scales = [chipIn.hidden, chipIn.exit].map(
      (state) => (state as { scale?: number }).scale,
    )
    for (const scale of scales) {
      if (scale !== undefined) expect(scale).toBeGreaterThan(0)
    }
  })

  it("mensagem e item de lista entram subindo, não descendo", () => {
    // y positivo no estado inicial = sobe ao entrar. Descer contraria a
    // direção de leitura da thread.
    expect((messageIn.hidden as { y: number }).y).toBeGreaterThan(0)
    expect((listItem.hidden as { y: number }).y).toBeGreaterThan(0)
  })

  it("o painel entra pela direita, de onde ele nasce", () => {
    expect((panelIn.hidden as { x: number }).x).toBeGreaterThan(0)
  })
})
