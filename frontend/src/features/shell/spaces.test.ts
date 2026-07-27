import { describe, expect, it } from "vitest"

import { spaceFromPath } from "./spaces"

describe("spaceFromPath", () => {
  it("deriva o space pelo prefixo da rota", () => {
    expect(spaceFromPath("/app/comercial")).toBe("comercial")
    expect(spaceFromPath("/app/comercial/pipeline")).toBe("comercial")
    expect(spaceFromPath("/app/marketing/fila")).toBe("marketing")
    expect(spaceFromPath("/app/poker/abc")).toBe("boards")
  })

  it("separa board de software do board de campanha pela query", () => {
    expect(spaceFromPath("/app/boards", "?project=1")).toBe("boards")
    expect(spaceFromPath("/app/boards", "?project=1&type=marketing")).toBe("marketing")
  })

  it("retorna null em rotas comuns a todos os spaces", () => {
    expect(spaceFromPath("/app")).toBeNull()
    expect(spaceFromPath("/app/office")).toBeNull()
    expect(spaceFromPath("/app/members")).toBeNull()
  })

  it("não confunde prefixo parcial", () => {
    expect(spaceFromPath("/app/comercialidade")).toBeNull()
  })
})
