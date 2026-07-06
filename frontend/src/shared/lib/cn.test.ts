import { describe, expect, it } from "vitest"
import { cn } from "./cn"

describe("cn", () => {
  it("junta classes simples", () => {
    expect(cn("a", "b")).toBe("a b")
  })

  it("ignora valores falsy (condicionais)", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c")
  })

  it("resolve conflito de utilitárias Tailwind — a última vence", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("aceita objeto condicional (clsx)", () => {
    expect(cn({ hidden: false, block: true })).toBe("block")
  })
})
