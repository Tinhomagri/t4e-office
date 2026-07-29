import { describe, expect, it } from "vitest"

import type { PokerParticipant, PokerVote } from "@/features/poker/poker.types"

import { buildVoteBadges } from "./voteBadges"

const ana: PokerParticipant = {
  id: "participant-row-1",
  user_id: "user-ana",
  user_name: "Ana",
  avatar_initials: "AN",
  is_host: true,
}
const bruno: PokerParticipant = {
  id: "participant-row-2",
  user_id: "user-bruno",
  user_name: "Bruno",
  avatar_initials: "BR",
  is_host: false,
}

function vote(participantId: string, value: string | null, hasVoted = true): PokerVote {
  return { participant_id: participantId, participant_name: "x", value, has_voted: hasVoted }
}

describe("buildVoteBadges", () => {
  it("casa voto com participante pelo user_id, não pelo id da linha", () => {
    // O backend grava participant_id = user_id no voto; usar p.id aqui nunca
    // acharia ninguém (foi exatamente o bug encontrado na revisão).
    const badges = buildVoteBadges({
      participants: [ana, bruno],
      votes: [vote("user-ana", "5")],
    })
    expect(badges.get("user-ana")).toBe("5")
    expect(badges.get("user-bruno")).toBeNull()
  })

  it("não casa quando o voto vem com o id da linha de participante", () => {
    const badges = buildVoteBadges({
      participants: [ana],
      votes: [vote("participant-row-1", "8")],
    })
    expect(badges.get("user-ana")).toBeNull()
  })

  it("voto sem has_voted não vira plaquinha", () => {
    const badges = buildVoteBadges({
      participants: [ana],
      votes: [vote("user-ana", null, false)],
    })
    expect(badges.get("user-ana")).toBeNull()
  })

  it("mantém todo participante no mapa, mesmo sem voto", () => {
    const badges = buildVoteBadges({ participants: [ana, bruno], votes: [] })
    expect([...badges.keys()]).toEqual(["user-ana", "user-bruno"])
  })

  it("sessão nula ou sem os campos de detalhe devolve mapa vazio", () => {
    expect(buildVoteBadges(null).size).toBe(0)
    expect(buildVoteBadges(undefined).size).toBe(0)
    // A listagem do workspace não traz participants/votes — não pode explodir.
    expect(
      buildVoteBadges({ participants: undefined, votes: undefined } as never).size,
    ).toBe(0)
  })
})
