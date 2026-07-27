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
