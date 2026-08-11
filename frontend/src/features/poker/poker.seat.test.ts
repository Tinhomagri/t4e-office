import { describe, expect, it } from "vitest"

import { seatAnim, seatFacing, seatFacingAt } from "./PokerPage"

// A animação do sprite é a leitura visual do estado da rodada — se ela errar,
// a mesa mente sobre quem já votou.
describe("seatAnim", () => {
  const base = {
    voting: false,
    revealed: false,
    hasVoted: false,
    cheering: false,
    throwing: false,
    justRevealed: false,
  }

  it("fica parado na mesa enquanto a votação está aberta e não votou", () => {
    // Antes era `type`; o ciclo de digitar lia como braço balançando sem parar.
    expect(seatAnim({ ...base, voting: true })).toBe("lean")
  })

  it("emote vence qualquer outro estado", () => {
    // É o único gesto que a pessoa pediu explicitamente.
    expect(
      seatAnim({ ...base, voting: true, cheering: true, throwing: true, emote: "dance" }),
    ).toBe("dance")
  })

  it("relaxa depois de votar", () => {
    expect(seatAnim({ ...base, voting: true, hasVoted: true })).toBe("lean")
  })

  it("comemora no instante da revelação", () => {
    expect(seatAnim({ ...base, revealed: true, justRevealed: true })).toBe("celebrate")
  })

  it("volta a se apoiar na mesa depois da comemoração", () => {
    // `revealed` dura até o host aplicar o peso; comemorar o tempo todo fazia
    // a mesa inteira ficar pulando sem parar.
    expect(seatAnim({ ...base, revealed: true })).toBe("lean")
  })

  it("acena ao receber uma reação, acima de qualquer outro estado", () => {
    // A reação é o único evento vindo de outra pessoa; se perdesse para o
    // estado da rodada, quem mandou não veria resposta nenhuma.
    expect(seatAnim({ ...base, revealed: true, cheering: true, justRevealed: true })).toBe("wave")
  })

  it("arremessar vence qualquer outro estado", () => {
    // Quem está jogando o emoji precisa aparecer jogando, mesmo no meio da
    // comemoração da revelação.
    expect(
      seatAnim({ ...base, revealed: true, cheering: true, throwing: true, justRevealed: true }),
    ).toBe("punch")
  })

  it("fica parado fora de rodada", () => {
    expect(seatAnim(base)).toBe("idle")
  })
})

describe("seatFacing", () => {
  it("quem senta em cima da mesa olha para baixo", () => {
    expect(seatFacing(0, 4)).toBe("down")
  })

  it("quem senta embaixo olha para cima", () => {
    expect(seatFacing(2, 4)).toBe("up")
  })

  it("as laterais viram para dentro", () => {
    expect(seatFacing(1, 4)).toBe("left")
    expect(seatFacing(3, 4)).toBe("right")
  })

  it("participante sozinho olha para a mesa", () => {
    expect(seatFacing(0, 1)).toBe("down")
  })

  it("quem está na lateral vira para dentro mesmo fora do eixo exato", () => {
    // Com a mesa cheia, os quatro das laterais ficam em |sin| ≈ 0,38 e
    // |cos| ≈ 0,92. O limiar fixo antigo os jogava em "up"/"down" — de costas
    // para a mesa, que é o oposto do que a posição diz.
    const lateral = Math.asin(0.38)
    expect(seatFacingAt(lateral)).toBe("left")
    expect(seatFacingAt(-lateral)).toBe("left")
    expect(seatFacingAt(Math.PI - lateral)).toBe("right")
    expect(seatFacingAt(Math.PI + lateral)).toBe("right")
  })

  it("quem está mais para cima ou para baixo continua encarando a mesa", () => {
    const alto = Math.asin(0.86)
    expect(seatFacingAt(-alto)).toBe("down")
    expect(seatFacingAt(alto)).toBe("up")
  })
})
