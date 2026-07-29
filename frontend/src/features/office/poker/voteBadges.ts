// Junção voto ↔ participante para as plaquinhas acima da cabeça no andar 2.
//
// Duas armadilhas moram aqui, por isso isto é uma função pura testável em vez
// de um trecho solto dentro de um useEffect:
//
// 1. Só o endpoint de DETALHE da sessão (GET /poker/<id>/) devolve
//    `participants`/`votes`. A listagem do workspace devolve apenas
//    contadores agregados — daí `session` poder chegar sem esses campos.
// 2. `PokerVote.participant_id` carrega o **user id**, não o id da linha de
//    participante. A junção correta é `v.participant_id === p.user_id`
//    (mesma regra usada pela PokerPage).
import type { PokerSession } from "@/features/poker/poker.types"

/**
 * Mapa `user_id → valor votado` (null = ainda sem voto / valor escondido).
 * Indexado por `user_id` porque é esse o id dos atores do motor.
 */
export function buildVoteBadges(
  session: Pick<PokerSession, "participants" | "votes"> | null | undefined,
): Map<string, string | null> {
  const participants = session?.participants
  const votes = session?.votes
  if (!participants || !votes) return new Map()
  return new Map(
    participants.map((p) => {
      const v = votes.find((vote) => vote.participant_id === p.user_id)
      return [p.user_id, v?.has_voted ? v.value : null] as const
    }),
  )
}
